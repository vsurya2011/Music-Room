import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Password from Render Environment Variables or default
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "surya123";

app.use(express.static(path.join(__dirname, "public")));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    // Unique name to prevent collisions
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadsDir));

// File Upload endpoint
app.post("/upload", upload.single("song"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username, password }) => {
    if (!roomId) return;

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username || "Guest";
    
    // Validate if this user is the owner using the secret password
    socket.isOwner = (password === OWNER_PASSWORD);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        song: null,
        songName: null,
        ytVideoId: null,
        time: 0,
        playing: false,
        lastUpdate: null,
        publicControl: false 
      };
    }

    if (!rooms[roomId].users.includes(socket.username)) {
      rooms[roomId].users.push(socket.username);
    }

    io.to(roomId).emit("updateUsers", rooms[roomId].users);
    
    socket.emit("permissions", { 
        isOwner: socket.isOwner, 
        publicControl: rooms[roomId].publicControl 
    });

    // Sync user
    const room = rooms[roomId];
    if (room.song) {
      socket.emit("playSong", {
        song: room.song,
        songName: room.songName,
        time: room.time,
        playing: room.playing
      });
    } else if (room.ytVideoId) {
      socket.emit("playYT", { 
        videoId: room.ytVideoId, 
        time: room.time, 
        playing: room.playing 
      });
    }
  });

  socket.on("togglePublicControl", ({ roomId }) => {
    if (socket.isOwner && rooms[roomId]) {
      rooms[roomId].publicControl = !rooms[roomId].publicControl;
      io.to(roomId).emit("publicControlUpdated", { 
        publicControl: rooms[roomId].publicControl 
      });
    }
  });

  const canControl = (action) => {
    const room = rooms[socket.roomId];
    if (socket.isOwner || (room && room.publicControl)) {
      action();
    }
  };

  socket.on("playSong", (data) => {
    canControl(() => {
      const room = rooms[data.roomId];
      if (!room) return;
      room.song = data.song;
      room.songName = data.songName;
      room.ytVideoId = null;
      room.time = data.time || 0;
      room.playing = true;
      room.lastUpdate = Date.now();
      io.to(data.roomId).emit("playSong", { song: data.song, songName: data.songName, time: room.time, playing: true });
    });
  });

  socket.on("pauseSong", ({ roomId }) => {
    canControl(() => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.playing && room.lastUpdate) {
        room.time += (Date.now() - room.lastUpdate) / 1000;
      }
      room.playing = false;
      room.lastUpdate = null;
      io.to(roomId).emit("pauseSong");
    });
  });

  socket.on("syncTime", ({ roomId, song, time }) => {
    canControl(() => {
      const room = rooms[roomId];
      if (!room) return;
      room.time = time;
      room.lastUpdate = Date.now();
      socket.to(roomId).emit("syncTime", { song, time });
    });
  });

  socket.on("playYT", ({ roomId, videoId, time }) => {
    canControl(() => {
      const room = rooms[roomId];
      if (!room) return;
      room.song = null;
      room.songName = null;
      room.ytVideoId = videoId;
      room.playing = true;
      room.time = time || room.time || 0; 
      room.lastUpdate = Date.now();
      io.to(roomId).emit("playYT", { videoId, time: room.time, playing: true });
    });
  });

  // NEW: Temporary File Deletion Logic
  // This removes the file once it finishes playing to save space
  socket.on("deleteFinishedSong", ({ songUrl }) => {
    if (songUrl && songUrl.startsWith("/uploads/")) {
      // Create absolute path to the file
      const filePath = path.join(__dirname, songUrl);
      
      // We use a small delay (2s) to ensure all clients have finished buffering the end
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlink(filePath, (err) => {
            if (err) console.error("Error deleting temp file:", err);
            else console.log("Successfully deleted temporary local song:", songUrl);
          });
        }
      }, 2000); 
    }
  });

  socket.on("disconnect", () => {
    const { roomId, username } = socket;
    if (!roomId || !rooms[roomId]) return;
    
    rooms[roomId].users = rooms[roomId].users.filter(u => u !== username);
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    if (rooms[roomId].users.length === 0) {
      const room = rooms[roomId];
      // Cleanup file if the last person leaves while it's playing
      if (room.song && room.song.startsWith("/uploads/")) {
        const filePath = path.join(__dirname, room.song);
        if (fs.existsSync(filePath)) {
          fs.unlink(filePath, (err) => { if (err) console.log(err); });
        }
      }
      delete rooms[roomId];
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});