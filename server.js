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

// ====================
// 🔧 MIDDLEWARE (VERY IMPORTANT)
// ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================
// 🔐 OWNER PASSWORD
// ====================
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "surya123";

// ====================
// 📁 STATIC FILES
// ====================
app.use(express.static(path.join(__dirname, "public")));

// ====================
// 📤 UPLOAD SETUP
// ====================
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

// ====================
// 🧠 ROOM STATE
// ====================
const rooms = {};
const roomOwners = {}; // roomId -> socket.id

// ====================
// 🌐 ROUTES
// ====================

// Home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====================
// 🔐 OWNER AUTH (PASSWORD ONLY)
// ====================
app.post("/owner-auth", (req, res) => {
  const { password } = req.body;

  if (!password || password !== OWNER_PASSWORD) {
    return res.json({ success: false });
  }

  // Create room automatically
  const roomId = crypto.randomBytes(4).toString("hex");

  rooms[roomId] = {
    users: [],
    song: null,
    songName: null,
    ytVideoId: null,
    time: 0,
    playing: false,
    lastUpdate: null
  };

  return res.json({
    success: true,
    roomId
  });
});

// ====================
// 🎶 ROOM PAGE
// ====================
app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// ====================
// 📤 SONG UPLOAD
// ====================
app.post("/upload", upload.single("song"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname
  });
});

// ====================
// 🔌 SOCKET.IO
// ====================
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // JOIN ROOM
  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

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

    if (!rooms[roomId].users.includes(username)) {
      rooms[roomId].users.push(username);
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

  // LOCAL SONG
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

  // YOUTUBE
  socket.on("playYT", ({ roomId, videoId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.song = null;
    room.songName = null;
    room.ytVideoId = videoId;
    room.time = time || 0;
    room.playing = true;
    room.lastUpdate = Date.now();

    io.to(roomId).emit("playYT", {
      videoId,
      time: room.time,
      playing: true
    });
  });

  // SYNC TIME
  socket.on("syncTime", ({ roomId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.time = time;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit("syncTime", { time });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    const { roomId, username } = socket;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].users = rooms[roomId].users.filter(u => u !== username);
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    if (rooms[roomId].users.length === 0) {
      delete rooms[roomId];
      console.log("🧹 Room cleaned:", roomId);
    }
  });
});

// ====================
// 🚀 START SERVER
// ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
