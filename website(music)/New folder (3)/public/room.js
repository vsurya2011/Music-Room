const socket = io();

let currentRoom = '';
let currentSong = '';
let isPlaying = false;

// DOM elements
const usernameInput = document.getElementById('username');
const roomInput = document.getElementById('room-code');
const createBtn = document.getElementById('create-room');
const joinBtn = document.getElementById('join-room');
const loginScreen = document.getElementById('login-screen');
const roomScreen = document.getElementById('room-screen');

const currentRoomSpan = document.getElementById('current-room');
const currentSongSpan = document.getElementById('current-song');

const songSelect = document.getElementById('song-select');
const audioPlayer = document.getElementById('audio-player');
const timeline = document.getElementById('timeline');
const timeLabel = document.getElementById('time-label');
const playBtn = document.getElementById('play-btn');

// --- Room creation/join ---
createBtn.onclick = () => {
    const username = usernameInput.value || 'Guest';
    socket.emit('create-room', username);
};

joinBtn.onclick = () => {
    const username = usernameInput.value || 'Guest';
    const roomCode = roomInput.value;
    socket.emit('join-room', { username, roomCode });
};

// --- Room joined ---
socket.on('room-joined', (data) => {
    currentRoom = data.room;
    currentRoomSpan.textContent = currentRoom;
    loginScreen.style.display = 'none';
    roomScreen.style.display = 'flex';
});

// --- Select song ---
songSelect.onchange = () => {
    const song = songSelect.value;
    playSong(song, 0, true);
};

// --- Play/Pause ---
playBtn.onclick = () => {
    if (!currentSong) return;
    if (isPlaying) {
        pauseSong(true);
    } else {
        playSong(currentSong, audioPlayer.currentTime, true);
    }
};

// --- Play song function ---
function playSong(song, time = 0, emit = false) {
    currentSong = song;
    currentSongSpan.textContent = song;
    audioPlayer.src = song;
    audioPlayer.currentTime = time;
    audioPlayer.oncanplay = () => {
        audioPlayer.play();
        isPlaying = true;
        playBtn.textContent = "⏸ Pause";
        if (emit) {
            socket.emit('play-song', { room: currentRoom, song, startTime: Date.now() + 500 });
        }
        audioPlayer.oncanplay = null;
    };
}

// --- Pause song function ---
function pauseSong(emit = false) {
    audioPlayer.pause();
    isPlaying = false;
    playBtn.textContent = "▶️ Play";
    if (emit) {
        socket.emit('pause-song', { room: currentRoom, time: audioPlayer.currentTime });
    }
}

// --- Timeline ---
audioPlayer.ontimeupdate = () => {
    timeline.value = audioPlayer.currentTime;
    updateTimeLabel();
};

timeline.oninput = () => {
    audioPlayer.currentTime = timeline.value;
    socket.emit('time-update', { room: currentRoom, time: audioPlayer.currentTime });
};

function updateTimeLabel() {
    const formatTime = (sec) => {
        const minutes = Math.floor(sec / 60);
        const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    };
    timeLabel.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration || 0)}`;
}

// --- Socket listeners ---
socket.on('play-song', (data) => {
    if (data.room === currentRoom) {
        const delay = data.startTime - Date.now();
        currentSong = data.song;
        currentSongSpan.textContent = currentSong;
        audioPlayer.src = data.song;
        setTimeout(() => {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            isPlaying = true;
            playBtn.textContent = "⏸ Pause";
        }, delay > 0 ? delay : 0);
    }
});

socket.on('pause-song', (data) => {
    if (data.room === currentRoom) {
        audioPlayer.currentTime = data.time;
        audioPlayer.pause();
        isPlaying = false;
        playBtn.textContent = "▶️ Play";
    }
});

socket.on('time-update', (data) => {
    if (data.room === currentRoom) {
        const diff = Math.abs(audioPlayer.currentTime - data.time);
        if (diff > 0.5) audioPlayer.currentTime = data.time;
        timeline.value = data.time;
        updateTimeLabel();
    }
});
