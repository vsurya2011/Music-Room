const socket = io();

// ==========================
// ROOM + USER
// ==========================
const roomId = localStorage.getItem("roomId");

let username = localStorage.getItem("username");
if (!username || username.trim() === "") {
  username = "Guest-" + Math.floor(Math.random() * 10000);
  localStorage.setItem("username", username);
}

// ==========================
// ELEMENTS
// ==========================
const roomCodeEl = document.getElementById("roomCode");
const userSelect = document.getElementById("userSelect");
const nowPlaying = document.getElementById("nowPlaying");

const tamilSelect = document.getElementById("tamilSongs");
const englishSelect = document.getElementById("englishSongs");

const playTamilBtn = document.getElementById("playTamilBtn");
const playEnglishBtn = document.getElementById("playEnglishBtn");

const fileInput = document.getElementById("fileInput");
const playLocalBtn = document.getElementById("playLocalBtn");
const localStatus = document.getElementById("localStatus");

const audio = document.getElementById("player");

// ==========================
// INIT
// ==========================
roomCodeEl.textContent = roomId;
nowPlaying.textContent = "🎶 Now Playing: None";

socket.emit("joinRoom", { roomId, username });

// ==========================
// USERS LIST
// ==========================
socket.on("updateUsers", users => {
  userSelect.innerHTML = "";
  users.forEach(u => {
    const opt = document.createElement("option");
    opt.textContent = u;
    userSelect.appendChild(opt);
  });
});

// ==========================
// PLAY
// ==========================
socket.on("playSong", data => {
  audio.src = data.songBase64 || data.song;
  audio.currentTime = data.time || 0;
  nowPlaying.textContent = "🎶 Now Playing: " + data.songName;
  audio.play().catch(() => {});
});

// ==========================
// PAUSE
// ==========================
socket.on("pauseSong", () => {
  audio.pause();
});

// ==========================
// SYNC
// ==========================
socket.on("syncTime", ({ time }) => {
  if (Math.abs(audio.currentTime - time) > 1) {
    audio.currentTime = time;
  }
});

// ==========================
// TAMIL
// ==========================
playTamilBtn.onclick = () => {
  socket.emit("playSong", {
    roomId,
    song: tamilSelect.value,
    songName: tamilSelect.options[tamilSelect.selectedIndex].text,
    time: 0
  });
};

// ==========================
// ENGLISH
// ==========================
playEnglishBtn.onclick = () => {
  socket.emit("playSong", {
    roomId,
    song: englishSelect.value,
    songName: englishSelect.options[englishSelect.selectedIndex].text,
    time: 0
  });
};

// ==========================
// LOCAL FILE
// ==========================
playLocalBtn.onclick = () => {
  const file = fileInput.files[0];
  if (!file) return alert("Choose a file");

  localStatus.textContent = "Sharing...";

  const reader = new FileReader();
  reader.onload = () => {
    socket.emit("playSong", {
      roomId,
      songBase64: reader.result,
      songName: file.name,
      time: 0
    });
    localStatus.textContent = "Playing for everyone 🎧";
  };
  reader.readAsDataURL(file);
};

// ==========================
// PAUSE EVENT
// ==========================
audio.onpause = () => {
  socket.emit("pauseSong", { roomId });
};

// ==========================
// CONTINUOUS SYNC
// ==========================
setInterval(() => {
  if (!audio.paused) {
    socket.emit("syncTime", {
      roomId,
      time: audio.currentTime
    });
  }
}, 1000);
