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

// --------------------
// Static files
// --------------------
app.use(express.static(path.join(__dirname, "public")));

// --------------------
// Upload setup
// --------------------
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadsDir));

app.post("/upload", upload.single("song"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname
  });
});

// --------------------
// Routes
// --------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// --------------------
// Room state
// --------------------
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username || "Guest";

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        song: null,
        songName: null,
        time: 0,
        playing: false,
        lastUpdate: null,
        type: null // <-- added type to track youtube/audio/local
      };
    }

    if (!rooms[roomId].users.includes(socket.username)) {
      rooms[roomId].users.push(socket.username);
    }

    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    // Sync late joiners with current playback
    const room = rooms[roomId];
    if (room.song && room.playing) {
      let currentTime = room.time;
      if (room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }
      socket.emit("playSong", {
        type: room.type,
        song: room.song,
        songName: room.songName,
        time: currentTime
      });
    }
  });

  // ------------------ Play Song ------------------
  socket.on("playSong", ({ type, song, songName, time }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.song = song;
    room.songName = songName;
    room.time = time || 0;
    room.playing = true;
    room.type = type;
    room.lastUpdate = Date.now();

    io.to(roomId).emit("playSong", { type, song, songName, time: room.time });
  });

  // ------------------ Pause Song ------------------
  socket.on("pauseSong", ({ type, time }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    if ((type === "audio" || type === "youtube") && room.playing && room.lastUpdate) {
      room.time += (Date.now() - room.lastUpdate)/1000;
    }

    room.playing = false;
    room.lastUpdate = null;

    io.to(roomId).emit("pauseSong", { type, time });
  });

  // ------------------ Disconnect ------------------
  socket.on("disconnect", () => {
    const { roomId, username } = socket;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].users = rooms[roomId].users.filter(u => u !== username);
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    if (rooms[roomId].users.length === 0) {
      const room = rooms[roomId];

      if (room.song && room.song.startsWith("/uploads/")) {
        const filePath = path.resolve(__dirname, "." + room.song);
        fs.unlink(filePath, () => {});
      }

      delete rooms[roomId];
      console.log("🧹 Room cleaned:", roomId);
    }
  });
});

// --------------------
// Server start
// --------------------
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
