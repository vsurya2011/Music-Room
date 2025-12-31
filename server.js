import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import crypto from "crypto";

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

// --------------------
// Routes
// --------------------
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

// --------------------
// Room state
// --------------------
const rooms = {};

// 🔐 TOKEN STORE (roomId -> Set(tokens))
const roomTokens = {};

// -------------------- Socket.IO
// --------------------
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // -------------------- CREATE ROOM (HOST)
  socket.on("createRoom", ({ roomId }) => {
    const token = crypto.randomBytes(16).toString("hex");

    if (!roomTokens[roomId]) {
      roomTokens[roomId] = new Set();
    }

    roomTokens[roomId].add(token);

    socket.emit("roomCreated", { roomId, token });
  });

  // -------------------- VALIDATE TOKEN (ONE TIME)
  socket.on("validateToken", ({ roomId, token }) => {
    if (
      roomTokens[roomId] &&
      roomTokens[roomId].has(token)
    ) {
      // Allow once
      roomTokens[roomId].delete(token);
      socket.emit("tokenResult", { success: true });
    } else {
      socket.emit("tokenResult", { success: false });
    }
  });

  // -------------------- Join Room (AFTER TOKEN OK)
  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username || "Guest";

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        song: null,
        songName: null,
        ytVideoId: null,
        time: 0,
        playing: false,
        lastUpdate: null
      };
    }

    if (!rooms[roomId].users.includes(socket.username)) {
      rooms[roomId].users.push(socket.username);
    }

    io.to(roomId).emit("updateUsers", rooms[roomId].users);

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

  // -------------------- Local Song
  socket.on("playSong", ({ roomId, song, songName, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.song = song;
    room.songName = songName;
    room.ytVideoId = null;
    room.time = time || 0;
    room.playing = true;
    room.lastUpdate = Date.now();

    io.to(roomId).emit("playSong", {
      song,
      songName,
      time: room.time,
      playing: true
    });
  });

  socket.on("pauseSong", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.playing && room.lastUpdate) {
      room.time += (Date.now() - room.lastUpdate) / 1000;
    }

    room.playing = false;
    room.lastUpdate = null;
    io.to(roomId).emit("pauseSong");
  });

  socket.on("syncTime", ({ roomId, song, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.time = time;
    room.lastUpdate = Date.now();
    socket.to(roomId).emit("syncTime", { song, time });
  });

  // -------------------- YouTube
  socket.on("playYT", ({ roomId, videoId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.song = null;
    room.songName = null;
    room.ytVideoId = videoId;
    room.playing = true;
    room.time = time || room.time || 0;
    room.lastUpdate = Date.now();

    io.to(roomId).emit("playYT", {
      videoId,
      time: room.time,
      playing: true
    });
  });

  // -------------------- Disconnect
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
      delete roomTokens[roomId]; // 🔐 cleanup tokens
      console.log("🧹 Room cleaned:", roomId);
    }
  });
});

// -------------------- Server start
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
