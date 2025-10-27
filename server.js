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

    if (!rooms[roomId]) rooms[roomId] = { users: [], song: null, time: 0, playing: false, lastUpdate: null };
    // avoid duplicates
    if (!rooms[roomId].users.includes(username)) rooms[roomId].users.push(username);

    console.log(`${username} joined room ${roomId}`);

    // Broadcast updated user list to everyone in room
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    // Send current state to new user
    const room = rooms[roomId];
    if (room.song) {
      let currentTime = room.time;
      if (room.playing && room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }
      // send playSong to new user (it will be applied by client)
      socket.emit("playSong", { song: room.song, time: currentTime, playing: room.playing, songName: room.songName });
      // Also broadcast nowPlaying info for UI (optional)
      io.to(roomId).emit("nowPlaying", { songName: room.songName || null });
    }
  });

  socket.on("playSong", (data) => {
    const { roomId, song, time, songName } = data;
    if (!rooms[roomId]) rooms[roomId] = { users: [], song: null, time: 0, playing: false, lastUpdate: null };

    // Update room state
    rooms[roomId].song = song;
    rooms[roomId].songName = songName || song;
    rooms[roomId].time = time || 0;
    rooms[roomId].playing = true;
    rooms[roomId].lastUpdate = Date.now();

    // Broadcast to everyone in room (including the origin) so everyone's controls follow
    io.to(roomId).emit("playSong", { song, time: rooms[roomId].time, playing: true, songName: rooms[roomId].songName });
    // Send nowPlaying for UI
    io.to(roomId).emit("nowPlaying", { songName: rooms[roomId].songName });
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
    // Broadcast pause to everyone in room
    io.to(roomId).emit("pauseSong", {});
  });

  socket.on("requestState", ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].song) {
      const room = rooms[roomId];
      let currentTime = room.time;
      if (room.playing && room.lastUpdate) {
        currentTime += (Date.now() - room.lastUpdate) / 1000;
      }
      // send current state to requester
      socket.emit("playSong", { song: room.song, time: currentTime, playing: room.playing, songName: room.songName });
    }
  });

  // Periodic sync for everyone in active rooms every 1s
  const syncInterval = setInterval(() => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.playing && room.lastUpdate) {
        const elapsed = (Date.now() - room.lastUpdate) / 1000;
        io.to(roomId).emit("syncTime", { song: room.song, time: room.time + elapsed });
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
      // if room empty, optionally delete it
      if (room.users.length === 0) {
        delete rooms[socket.roomId];
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`✅ Server running on port ${port}`));
