// =============================
// index.html functions
// =============================
function createRoom() {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  document.getElementById("room").value = roomId;
  joinRoom();
}

function joinRoom() {
  const roomId = document.getElementById("room").value.trim();
  const username = document.getElementById("username").value.trim() || "Guest";

  if (!roomId) return alert("Please enter or create a room code!");

  localStorage.setItem("roomId", roomId);
  localStorage.setItem("username", username);

  window.location.href = "room.html";
}

// =============================
// room.html functions
// =============================
function initRoom() {
  const socket = io();
  const player = document.getElementById("player");
  const roomCode = localStorage.getItem("roomId");
  document.getElementById("roomCode").innerText = roomCode;

  // Join the room on server
  socket.emit("joinRoom", roomCode);

  // Unlock audio playback for some browsers
  const startBtn = document.getElementById("startBtn");
  startBtn.onclick = () => {
    player.play().then(() => player.pause());
    startBtn.style.display = "none";
  };

  // Function to play a song
  window.changeSong = function (type) {
    let song;
    if (type === "tamil") {
      song = document.getElementById("tamilSongs").value;
    } else {
      song = document.getElementById("englishSongs").value;
    }

    player.src = song;
    player.currentTime = 0;
    player.play();

    // Notify other users
    socket.emit("playSong", { roomId: roomCode, song, time: 0 });
  };

  // Emit play/pause events
  player.onplay = () => {
    socket.emit("playSong", { roomId: roomCode, song: player.src, time: player.currentTime });
  };

  player.onpause = () => {
    socket.emit("pauseSong", { roomId: roomCode });
  };

  // Listen to server for updates from other users
  socket.on("playSong", (data) => {
    if (data.song && player.src !== data.song) player.src = data.song;
    player.currentTime = data.time || 0;
    player.play().catch(err => console.log("Autoplay blocked:", err));
  });

  socket.on("pauseSong", () => {
    player.pause();
  });

  socket.on("syncTime", (data) => {
    if (player.src === data.song) {
      const diff = Math.abs(player.currentTime - data.time);
      if (diff > 0.5) player.currentTime = data.time;
    }
  });
}

// Automatically initialize room logic if on room.html
if (document.getElementById("player")) {
  initRoom();
}
