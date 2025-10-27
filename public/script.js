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
  const username = document.getElementById("username").value.trim();

  if (!roomId) return alert("Please enter or create a room code!");
  if (!username) return alert("Please enter your username before joining!");

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
  const username = localStorage.getItem("username");

  document.getElementById("roomCode").innerText = roomCode || "UNKNOWN";
  socket.emit("joinRoom", { roomId: roomCode, username });

  const userSelect = document.getElementById("userSelect");
  const nowPlayingEl = document.getElementById("nowPlaying");

  // Prevent echo loops: when we apply a remote action we set this to true,
  // so local events won't re-emit the same action back to server.
  let suppressEmit = false;

  // Build full song list helper (used for next-song logic)
  function getAllSongs() {
    const tamil = Array.from(document.getElementById("tamilSongs").options).map(o => o.value);
    const eng = Array.from(document.getElementById("englishSongs").options).map(o => o.value);
    return [...tamil, ...eng];
  }

  function songPathToRelative(p) {
    // normalize to path like "songs/english/song1.mp3"
    try {
      const url = new URL(p, location.origin);
      // take pathname without leading '/'
      return url.pathname.replace(/^\//, '');
    } catch {
      return p;
    }
  }

  function songNameFromPath(path) {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  // Update user list
  socket.on("updateUsers", (users) => {
    userSelect.innerHTML = "";
    users.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      userSelect.appendChild(opt);
    });
  });

  // When someone plays a song (server broadcasts to all), apply it
  socket.on("playSong", (data) => {
    suppressEmit = true;
    const rel = songPathToRelative(data.song || "");
    if (rel) {
      if (player.src !== location.origin + "/" + rel) {
        player.src = rel;
      }
    }
    player.currentTime = typeof data.time === 'number' ? data.time : 0;
    player.play().catch(err => {
      console.log("Play blocked:", err);
    }).finally(() => {
      // update now playing for this client
      nowPlayingEl.textContent = `🎶 Now Playing: ${data.songName || songNameFromPath(rel || player.src)}`;
      setTimeout(() => { suppressEmit = false; }, 150);
    });
  });

  // Pause handler
  socket.on("pauseSong", (data) => {
    suppressEmit = true;
    player.pause();
    setTimeout(() => { suppressEmit = false; }, 150);
  });

  // Sync time updates
  socket.on("syncTime", (data) => {
    const rel = songPathToRelative(data.song || "");
    if (songPathToRelative(player.src) === rel) {
      const diff = Math.abs(player.currentTime - data.time);
      if (diff > 0.5) {
        suppressEmit = true;
        player.currentTime = data.time;
        setTimeout(() => { suppressEmit = false; }, 150);
      }
    }
  });

  // Now playing update (server forwards for immediate UI)
  socket.on("nowPlaying", (data) => {
    nowPlayingEl.textContent = `🎶 Now Playing: ${data.songName || 'Unknown'}`;
  });

  // Local control -> emit to server (unless suppressEmit is true)
  player.addEventListener('play', () => {
    if (suppressEmit) return;
    const rel = songPathToRelative(player.src);
    const name = songNameFromPath(rel);
    socket.emit("playSong", { roomId: roomCode, song: rel, time: player.currentTime, songName: name });
    // also update local now playing immediately
    nowPlayingEl.textContent = `🎶 Now Playing: ${name}`;
  });

  player.addEventListener('pause', () => {
    if (suppressEmit) return;
    socket.emit("pauseSong", { roomId: roomCode });
  });

  // When current song ends -> pick next and broadcast
  player.addEventListener('ended', () => {
    const all = getAllSongs();
    const currentRel = songPathToRelative(player.src);
    const idx = all.indexOf(currentRel);
    const nextIndex = (idx + 1) % all.length;
    const nextSong = all[nextIndex];
    const name = songNameFromPath(nextSong);
    // set local and emit so everyone follows
    suppressEmit = true;
    player.src = nextSong;
    player.currentTime = 0;
    player.play().catch(err => console.log("Autoplay blocked:", err)).finally(() => {
      nowPlayingEl.textContent = `🎶 Now Playing: ${name}`;
      socket.emit("playSong", { roomId: roomCode, song: nextSong, time: 0, songName: name });
      setTimeout(() => { suppressEmit = false; }, 150);
    });
  });

  // Buttons to play selected songs (these act as "start play" controls and will broadcast)
  document.getElementById('playTamilBtn').addEventListener('click', () => {
    const song = document.getElementById('tamilSongs').value;
    const name = songNameFromPath(song);
    player.src = song;
    player.currentTime = 0;
    player.play().catch(err => console.log("Play failed:", err));
    socket.emit("playSong", { roomId: roomCode, song, time: 0, songName: name });
    nowPlayingEl.textContent = `🎶 Now Playing: ${name}`;
  });

  document.getElementById('playEnglishBtn').addEventListener('click', () => {
    const song = document.getElementById('englishSongs').value;
    const name = songNameFromPath(song);
    player.src = song;
    player.currentTime = 0;
    player.play().catch(err => console.log("Play failed:", err));
    socket.emit("playSong", { roomId: roomCode, song, time: 0, songName: name });
    nowPlayingEl.textContent = `🎶 Now Playing: ${name}`;
  });

  // Initial sync request: ask server for current state (server already sends on join, but this is a safety)
  socket.emit("requestState", { roomId: roomCode });

  // If on load the server emits a playSong for current state it'll be handled above
}

// Auto-init if room.html
if (window.location.pathname.endsWith("room.html")) {
  window.onload = initRoom;
}
