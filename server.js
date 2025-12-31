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

app.use(express.json());

// ====================
// 🔐 OWNER PASSWORD
// ====================
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "surya123";

// ====================
// Static files
// ====================
app.use(express.static(path.join(__dirname, "public")));

// ====================
// Upload setup
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
// Room & Token state
// ====================
const rooms = {};
const roomTokens = {}; // roomId -> Set(tokens)
const roomOwners = {}; // roomId -> socket.id

// ====================
// Routes
// ====================
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

// ====================
// 🔐 ROOM ACCESS CONTROL
// ====================
app.get("/room/:roomId", (req, res) => {
  const { roomId } = req.params;
  const { owner } = req.query;

  // 👑 OWNER ACCESS
  if (owner === "true") {
    return res.sendFile(path.join(__dirname, "public", "room.html"));
  }

  // 🔒 OTHERWISE → OWNER LOGIN
  res.redirect("/");
});

// ====================
// Socket.IO
// ====================
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ====================
  // CREATE ROOM + INVITE
  // ====================
  socket.on("createRoom", ({ roomId, ownerName }) => {
    const token = crypto.randomBytes(16).toString("hex");

    if (!roomTokens[roomId]) roomTokens[roomId] = new Set();
    roomTokens[roomId].add(token);

    roomOwners[roomId] = socket.id;

    socket.emit("roomCreated", {
      roomId,
      token,
      link: `/room/${roomId}?token=${token}`
    });
  });

  // ====================
  // JOIN ROOM
  // ====================
  socket.on("joinRoom", ({ roomId, username }) => {
    if (!username || !roomId) return socket.disconnect(true);

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

    if (!rooms[roomId].users.includes(username)) rooms[roomId].users.push(username);
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

  // ====================
  // Local Song
  // ====================
  socket.on("playSong", ({ roomId, song, songName, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.song = song;
    room.songName = songName;
    room.ytVideoId = null;
    room.time = time || 0;
    room.playing = true;
    room.lastUpdate = Date.now();

    io.to(roomId).emit("playSong", { song, songName, time: room.time, playing: true });
  });

  socket.on("pauseSong", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.playing && room.lastUpdate) room.time += (Date.now() - room.lastUpdate) / 1000;
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

  // ====================
  // YouTube
  // ====================
  socket.on("playYT", ({ roomId, videoId, time }) => {
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

  // ====================
  // DISCONNECT
  // ====================
  socket.on("disconnect", () => {
    const { roomId, username } = socket;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].users = rooms[roomId].users.filter(u => u !== username);
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    if (roomOwners[roomId] === socket.id) {
      io.to(roomId).emit("roomClosed");
      delete rooms[roomId];
      delete roomTokens[roomId];
      delete roomOwners[roomId];
      console.log(`🧹 Owner left, room destroyed: ${roomId}`);
    } else if (rooms[roomId].users.length === 0) {
      delete rooms[roomId];
      delete roomTokens[roomId];
      console.log(`🧹 Room empty, cleaned: ${roomId}`);
    }
  });
});

// ====================
// 🔐 OWNER LOGIN API (create new room automatically)
// ====================
app.post("/check-owner-password", (req, res) => {
  const { password } = req.body;

  if (password === OWNER_PASSWORD) {
    // Generate a new roomId for the owner
    const roomId = crypto.randomBytes(4).toString("hex");
    rooms[roomId] = { users: [], song: null, songName: null, ytVideoId: null, time: 0, playing: false, lastUpdate: null };
    roomOwners[roomId] = null; // will be set when owner connects via socket

    return res.json({ success: true, roomId });
  } else {
    return res.json({ success: false });
  }
});

// ====================
// Server start
// ====================
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
