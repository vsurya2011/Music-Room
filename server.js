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

// Room state
const rooms = {}; // { roomId: { song, songName, songBase64, time, playing, lastUpdate, users: [], category } }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!rooms[roomId])
      rooms[roomId] = { users: [], song: null, songName: null, songBase64: null, time: 0, playing: false, lastUpdate: null, category: "both" };
    if (!rooms[roomId].users.includes(username)) rooms[roomId].users.push(username);

    console.log(`${username} joined room ${roomId}`);

    // Broadcast updated user list
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    // Send current state to new user
    const room = rooms[roomId];
    if (room.song || room.songBase64) {
      let currentTime = room.time;
      if (room.playing && room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }
      socket.emit("playSong", {
        song: room.song,
        songBase64: room.songBase64,
        time: currentTime,
        playing: room.playing,
        songName: room.songName,
        category: room.category
      });
      io.to(roomId).emit("nowPlaying", { songName: room.songName || null });
    }
  });

  socket.on("playSong", (data) => {
    const { roomId, song, songBase64, time, songName, category } = data;
    if (!rooms[roomId])
      rooms[roomId] = { users: [], song: null, songName: null, songBase64: null, time: 0, playing: false, lastUpdate: null, category: "both" };

    // Update room state
    rooms[roomId].song = song || null;
    rooms[roomId].songBase64 = songBase64 || null;
    rooms[roomId].songName = songName || (songBase64 ? "Local File" : song);
    rooms[roomId].time = time || 0;
    rooms[roomId].playing = true;
    rooms[roomId].lastUpdate = Date.now();
    rooms[roomId].category = category || "both";

    // Broadcast to everyone
    io.to(roomId).emit("playSong", { song, songBase64, time: rooms[roomId].time, playing: true, songName: rooms[roomId].songName, category: rooms[roomId].category });
    io.to(roomId).emit("nowPlaying", { songName: rooms[roomId].songName });
  });

  socket.on("pauseSong", ({ roomId }) => {
    if (rooms[roomId]) {
      if (rooms[roomId].playing && rooms[roomId].lastUpdate) {
        rooms[roomId].time += (Date.now() - rooms[roomId].lastUpdate) / 1000;
      }
      rooms[roomId].playing = false;
      rooms[roomId].lastUpdate = null;
    }
    io.to(roomId).emit("pauseSong", {});
  });

  socket.on("syncTime", (data) => {
    const { roomId, song, songBase64, time } = data;
    if (!rooms[roomId]) return;

    rooms[roomId].time = time || 0;
    rooms[roomId].lastUpdate = Date.now();

    // Broadcast sync to others
    io.to(roomId).emit("syncTime", { song, songBase64, time });
  });

  socket.on("requestState", ({ roomId }) => {
    if (rooms[roomId] && (rooms[roomId].song || rooms[roomId].songBase64)) {
      const room = rooms[roomId];
      let currentTime = room.time;
      if (room.playing && room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }
      socket.emit("playSong", {
        song: room.song,
        songBase64: room.songBase64,
        time: currentTime,
        playing: room.playing,
        songName: room.songName,
        category: room.category
      });
    }
  });

  // Periodic sync for all active rooms
  const syncInterval = setInterval(() => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.playing && room.lastUpdate) {
        const elapsed = (Date.now() - room.lastUpdate) / 1000;
        io.to(roomId).emit("syncTime", {
          song: room.song,
          songBase64: room.songBase64,
          time: room.time + elapsed
        });
      }
    }
  }, 1000);

  socket.on("disconnect", () => {
    clearInterval(syncInterval);
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      room.users = room.users.filter(u => u !== socket.username);
      io.to(socket.roomId).emit("updateUsers", room.users);
      console.log(`${socket.username} left room ${socket.roomId}`);
      if (room.users.length === 0) {
        delete rooms[socket.roomId];
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`✅ Server running on port ${port}`));
