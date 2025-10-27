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
const rooms = {}; // { roomId: { song, time, playing, lastUpdate, users: [] } }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!rooms[roomId]) rooms[roomId] = { users: [] };
    rooms[roomId].users.push(username);

    console.log(`${username} joined room ${roomId}`);

    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    // Send current state to new user
    const room = rooms[roomId];
    if (room.song) {
      let currentTime = room.time;
      if (room.playing && room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }
      socket.emit("playSong", { song: room.song, time: currentTime, playing: room.playing });
    }
  });

  socket.on("playSong", (data) => {
    const { roomId, song, time } = data;
    if (!rooms[roomId]) rooms[roomId] = { users: [] };

    rooms[roomId].song = song;
    rooms[roomId].time = time;
    rooms[roomId].playing = true;
    rooms[roomId].lastUpdate = Date.now();

    socket.to(roomId).emit("playSong", { song, time, playing: true });
  });

  socket.on("pauseSong", (data) => {
    const { roomId } = data;
    if (rooms[roomId]) {
      if (rooms[roomId].playing && rooms[roomId].lastUpdate) {
        rooms[roomId].time += (Date.now() - rooms[roomId].lastUpdate) / 1000;
      }
      rooms[roomId].playing = false;
      rooms[roomId].lastUpdate = null;
    }
    socket.to(roomId).emit("pauseSong");
  });

  // Periodic sync
  setInterval(() => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.playing) {
        const elapsed = (Date.now() - room.lastUpdate) / 1000;
        io.to(roomId).emit("syncTime", { song: room.song, time: room.time + elapsed });
      }
    }
  }, 1000);

  socket.on("disconnect", () => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      room.users = room.users.filter(u => u !== socket.username);
      io.to(socket.roomId).emit("updateUsers", room.users);
      console.log(`${socket.username} left room ${socket.roomId}`);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`✅ Server running on port ${port}`));
