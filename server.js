import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// ==========================
// ROOM STATE
// ==========================
const rooms = {};
// roomId: { users: [], song, songName, songBase64, time, playing, lastUpdate }

// ==========================
// SOCKET LOGIC
// ==========================
io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {

    // FORCE GUEST NAME
    if (!username || username.trim() === "") {
      username = "Guest-" + socket.id.slice(0, 4);
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        song: null,
        songName: null,
        songBase64: null,
        time: 0,
        playing: false,
        lastUpdate: null
      };
    }

    if (!rooms[roomId].users.includes(username)) {
      rooms[roomId].users.push(username);
    }

    // SEND USERS
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    // SYNC CURRENT STATE
    const room = rooms[roomId];
    if (room.song || room.songBase64) {
      let currentTime = room.time;
      if (room.playing && room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }

      socket.emit("playSong", {
        song: room.song,
        songBase64: room.songBase64,
        songName: room.songName,
        time: currentTime
      });
    }
  });

  // ==========================
  // PLAY SONG
  // ==========================
  socket.on("playSong", ({ roomId, song, songBase64, songName, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.song = song || null;
    room.songBase64 = songBase64 || null;
    room.songName = songName || "Unknown";
    room.time = time || 0;
    room.playing = true;
    room.lastUpdate = Date.now();

    io.to(roomId).emit("playSong", {
      song,
      songBase64,
      songName: room.songName,
      time: room.time
    });
  });

  // ==========================
  // PAUSE SONG
  // ==========================
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

  // ==========================
  // TIME SYNC
  // ==========================
  socket.on("syncTime", ({ roomId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.time = time;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit("syncTime", { time });
  });

  // ==========================
  // DISCONNECT
  // ==========================
  socket.on("disconnect", () => {
    const { roomId, username } = socket;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].users = rooms[roomId].users.filter(u => u !== username);
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    if (rooms[roomId].users.length === 0) {
      delete rooms[roomId];
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
