const socket = io();

// Screens
const loginScreen = document.getElementById("login-screen");
const roomScreen = document.getElementById("room-screen");

// Inputs and buttons
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const createBtn = document.getElementById("create-room");
const joinBtn = document.getElementById("join-room");

// Room elements
const roomIdSpan = document.getElementById("room-id");
const songSelect = document.getElementById("song-select");
const playBtn = document.getElementById("play-btn");
const audioPlayer = document.getElementById("audio-player");

// Add timeline and time label dynamically
const timeline = document.createElement("input");
timeline.type = "range";
timeline.min = 0;
timeline.value = 0;
timeline.step = 0.01;
timeline.className = "timeline";
const timeLabel = document.createElement("span");
timeLabel.className = "time-label";
roomScreen.appendChild(timeline);
roomScreen.appendChild(timeLabel);

let currentRoom = "";
let username = "";
let isPlaying = false;
let syncInterval = null;

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Join room function
function joinRoom(roomId) {
    currentRoom = roomId;
    roomIdSpan.textContent = roomId;
    username = usernameInput.value.trim() || "Guest";

    socket.emit("join-room", roomId);
    loginScreen.style.display = "none";
    roomScreen.style.display = "block";
}

// Create room
createBtn.addEventListener("click", () => {
    const roomId = generateRoomCode();
    roomInput.value = roomId;
    joinRoom(roomId);
});

// Join existing room
joinBtn.addEventListener("click", () => {
    const roomId = roomInput.value.trim().toUpperCase();
    if (!roomId) return alert("Enter a room code!");
    joinRoom(roomId);
});

// Play / Pause
playBtn.addEventListener("click", () => {
    if (isPlaying) {
        audioPlayer.pause();
        socket.emit("pause-song", { roomId: currentRoom });
    } else {
        const song = songSelect.value;
        audioPlayer.src = `/songs/${song}`;
        audioPlayer.play();
        socket.emit("play-song", { roomId: currentRoom, song, currentTime: audioPlayer.currentTime });
    }
    isPlaying = !isPlaying;
});

// Update timeline and emit current time
audioPlayer.addEventListener("timeupdate", () => {
    timeline.max = audioPlayer.duration || 0;
    timeline.value = audioPlayer.currentTime;
    timeLabel.textContent = formatTime(audioPlayer.currentTime) + " / " + formatTime(audioPlayer.duration || 0);

    if (isPlaying) {
        socket.emit("update-time", { roomId: currentRoom, currentTime: audioPlayer.currentTime });
    }
});

// Timeline seeking
timeline.addEventListener("input", () => {
    audioPlayer.currentTime = timeline.value;
    socket.emit("update-time", { roomId: currentRoom, currentTime: audioPlayer.currentTime });
});

// Format time helper
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Listen for other users
socket.on("play-song", ({ song, currentTime }) => {
    audioPlayer.src = `/songs/${song}`;
    audioPlayer.currentTime = currentTime;
    audioPlayer.play();
    isPlaying = true;
});

socket.on("pause-song", () => {
    audioPlayer.pause();
    isPlaying = false;
});

socket.on("update-time", (time) => {
    audioPlayer.currentTime = time;
});
