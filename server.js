/**
 * server.js - Production-Level Music Room Server
 * -----------------------------------------------------------------------
 * Version: 2.0.0 (Stable)
 * Features:
 * - Real-time Socket.io synchronization
 * - In-memory Room State Management
 * - YouTube & Audio mode support
 * - Automatic "Late-Joiner" Sync (Time calculation)
 * - Auto-cleanup of uploaded files on room expiration
 * -----------------------------------------------------------------------
 */

import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";

// --- Environment Configuration ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- Middleware & Static Assets ---
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Upload Logic (Multer) ---
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  console.log("📁 Creating uploads directory...");
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and prepend timestamp to prevent collisions
    const safeName = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Serve the uploads folder as static
app.use("/uploads", express.static(uploadsDir));

/**
 * POST /upload
 * Handles local audio file sharing
 */
app.post("/upload", upload.single("song"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  console.log(`[Upload] File received: ${req.file.filename}`);
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname
  });
});

// --- Routes ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// --- Room Management Logic ---
/**
 * rooms object structure:
 * {
 * [roomId]: {
 * users: string[],
 * song: string, (URL or YouTube ID)
 * songName: string,
 * type: 'audio' | 'youtube',
 * time: number, (Last known timestamp)
 * playing: boolean,
 * lastUpdate: number (Timestamp of last server update)
 * }
 * }
 */
const rooms = {};

// --- Socket.io Event Loop ---
io.on("connection", (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);

  /**
   * joinRoom Handler
   * Adds user to specific room and initializes state if it's new
   */
  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId) return;
    
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username || `Guest_${socket.id.substring(0, 4)}`;

    console.log(`[Room] ${socket.username} joined ${roomId}`);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        song: null,
        songName: null,
        time: 0,
        playing: false,
        lastUpdate: null,
        type: 'audio'
      };
    }

    // Add user to room list if not already there
    if (!rooms[roomId].users.includes(socket.username)) {
      rooms[roomId].users.push(socket.username);
    }

    // Update everyone in the room with the new user list
    io.to(roomId).emit("updateUsers", rooms[roomId].users);

    // Immediate sync for the joining user
    sendCurrentState(socket, roomId);
  });

  /**
   * requestState Handler
   * Used by clients to manually refresh or sync state upon UI initialization
   */
  socket.on("requestState", ({ roomId }) => {
    sendCurrentState(socket, roomId);
  });

  /**
   * playSong Handler
   * Broadcasts play command and updates the "Source of Truth" in room state
   */
  socket.on("playSong", (data) => {
    const { roomId, type, song, songName, time } = data;
    const room = rooms[roomId];
    if (!room) return;

    console.log(`[Play] Room ${roomId}: ${songName} (${type})`);

    room.song = song;
    room.songName = songName;
    room.time = time || 0;
    room.playing = true;
    room.type = type || 'audio';
    room.lastUpdate = Date.now();

    // Broadcast to everyone else in the room
    socket.to(roomId).emit("playSong", {
      type: room.type,
      song: room.song,
      songName: room.songName,
      time: room.time
    });
  });

  /**
   * pauseSong Handler
   * Updates state to paused and calculates current elapsed time
   */
  socket.on("pauseSong", ({ roomId, type }) => {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`[Pause] Room ${roomId}`);

    // Update the room's current timestamp based on how long it was playing
    if (room.playing && room.lastUpdate) {
      const elapsed = (Date.now() - room.lastUpdate) / 1000;
      room.time += elapsed;
    }

    room.playing = false;
    room.lastUpdate = null;

    socket.to(roomId).emit("pauseSong", { type });
  });

  /**
   * syncTime Handler
   * Adjusts minor drifts between clients without triggering a full "play" event
   */
  socket.on("syncTime", ({ roomId, song, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Only update if the song matches to avoid cross-talk during transitions
    if (room.song === song) {
      room.time = time;
      room.lastUpdate = Date.now();
      
      // Sync only to other clients to prevent feedback loops
      socket.to(roomId).emit("syncTime", { song, time });
    }
  });

  /**
   * disconnect Handler
   * Handles user removal and room garbage collection
   */
  socket.on("disconnect", () => {
    const { roomId, username } = socket;
    
    if (roomId && rooms[roomId]) {
      // Remove user from the list
      rooms[roomId].users = rooms[roomId].users.filter(u => u !== username);
      
      // Update remaining users
      io.to(roomId).emit("updateUsers", rooms[roomId].users);

      // Clean up room if empty
      if (rooms[roomId].users.length === 0) {
        handleRoomCleanup(roomId);
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// --- Helper Functions ---

/**
 * sendCurrentState
 * Calculates and sends the absolute current playback time to a specific socket.
 * Essential for Late-Joiner synchronization.
 */
function sendCurrentState(socket, roomId) {
  const room = rooms[roomId];
  if (!room || !room.song) return;

  let liveTime = room.time;
  
  // If the song is currently playing, calculate how far it has progressed 
  // since the last server update.
  if (room.playing && room.lastUpdate) {
    liveTime += (Date.now() - room.lastUpdate) / 1000;
  }

  socket.emit("playSong", {
    type: room.type,
    song: room.song,
    songName: room.songName,
    time: liveTime,
    isPlaying: room.playing
  });
}

/**
 * handleRoomCleanup
 * Deletes uploaded files and removes room from memory
 */
function handleRoomCleanup(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  console.log(`[Cleanup] Room ${roomId} is empty. Cleaning up...`);

  // If the current song was an uploaded file, delete it from disk
  if (room.song && room.song.startsWith("/uploads/")) {
    const filename = room.song.split("/").pop();
    const filePath = path.join(uploadsDir, filename);
    
    fs.unlink(filePath, (err) => {
      if (err) console.error(`[Cleanup] Error deleting file ${filename}:`, err.message);
      else console.log(`[Cleanup] Deleted file: ${filename}`);
    });
  }

  delete rooms[roomId];
  console.log(`🧹 Room state purged: ${roomId}`);
}

// --- Server Lifecycle ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  -------------------------------------------
  🚀 Music Room Server is Live!
  📡 Port: ${PORT}
  📁 Mode: Production (Stable)
  -------------------------------------------
  `);
});

/**
 * PRODUCTION NOTES:
 * 1. For horizontal scaling (multiple server instances), replace 'rooms' object with Redis.
 * 2. This server clears uploads only when the WHOLE room is empty.
 * 3. YouTube sync relies on Video IDs sent via the 'song' parameter.
 */