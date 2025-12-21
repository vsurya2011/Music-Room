// script.js
// Combined room logic + custom player UI (Play/Pause, Prev, Next, Seek, Progress)
// Replaces default audio controls visually (but keeps <audio id="player"> as the actual audio element)

(function () {
  // -----------------------
  // Helper UI injector
  // -----------------------
  function ensurePlayerUI() {
    if (document.getElementById('custom-player')) return; // already present

    const container = document.createElement('div');
    container.id = 'custom-player';
    container.style.maxWidth = '420px';
    container.style.width = '100%';
    container.style.marginTop = '12px';
    container.innerHTML = `
      <style>
        /* minimal styling to match the "music button" feel */
        #custom-player { background: rgba(0,0,0,0.55); padding:12px 14px; border-radius:12px; color: #fff; font-family: Roboto, Inter, Arial; box-shadow: 0 8px 20px rgba(0,0,0,0.35); }
        #trackInfo { display:flex; align-items:center; gap:12px; }
        #trackThumb { width:56px; height:56px; border-radius:10px; background:linear-gradient(135deg,#3b82f6,#7c3aed); display:flex;align-items:center;justify-content:center; font-weight:700; color:#fff; }
        #trackMeta { flex:1; }
        #trackTitle { font-weight:700; font-size:15px; margin-bottom:2px; }
        #trackSub { color: #cbd5e1; font-size:12px; }
        #controls { display:flex; align-items:center; justify-content:center; gap:18px; margin-top:12px; }
        .player-btn { width:44px; height:44px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; border:none; background:transparent; color:#c7d2fe; }
        .player-btn:active{ transform:scale(.98) }
        #progressWrap { margin-top:12px; }
        #progress { width:100%; height:8px; background: rgba(255,255,255,0.08); border-radius:999px; position:relative; overflow:hidden; cursor:pointer; }
        #progressFill { height:100%; width:0%; background: linear-gradient(90deg,#6366f1,#06b6d4); border-radius:999px; transition: width 0.08s linear; }
        #timeRow { display:flex; justify-content:space-between; color:#a5b4fc; font-size:12px; margin-top:6px; }
      </style>

      <div id="trackInfo">
        <div id="trackThumb">♫</div>
        <div id="trackMeta">
          <div id="trackTitle">Not Playing</div>
          <div id="trackSub">Lofi Beats</div>
        </div>
      </div>

      <div id="progressWrap">
        <div id="progress" title="Click or drag to seek">
          <div id="progressFill"></div>
        </div>
        <div id="timeRow">
          <div id="currentTime">0:00</div>
          <div id="totalTime">0:00</div>
        </div>
      </div>

      <div id="controls">
        <button id="prevBtn" class="player-btn" title="Previous">
          &#9664;&#9664;
        </button>
        <button id="playPauseBtn" class="player-btn" title="Play / Pause">
          &#9654;
        </button>
        <button id="nextBtn" class="player-btn" title="Next">
          &#9654;&#9654;
        </button>
      </div>
    `;
    // Insert before the audio tag if exists, else append to .container
    const audioEl = document.getElementById('player');
    if (audioEl && audioEl.parentNode) {
      audioEl.parentNode.insertBefore(container, audioEl.nextSibling);
      // hide the native controls if visible
      audioEl.controls = false;
      audioEl.style.display = 'none'; // keep audio element but hide native UI
    } else {
      // fallback append to body
      document.body.appendChild(container);
    }
  }

  // -----------------------
  // Utility functions
  // -----------------------
  function formatTime(totalSeconds) {
    if (!isFinite(totalSeconds)) return '0:00';
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function songPathToRelative(p) {
    try {
      const u = new URL(p, location.origin);
      return u.pathname.replace(/^\//, '');
    } catch {
      return p || '';
    }
  }

  function songNameFromPath(path) {
    try {
      const parts = path.split('/');
      return parts[parts.length - 1] || path;
    } catch {
      return path;
    }
  }

  // -----------------------
  // Main init (room logic + player)
  // -----------------------
  function initRoom() {
    ensurePlayerUI();

    const socket = io();
    const player = document.getElementById('player');
    const roomCode = localStorage.getItem('roomId');
    const username = localStorage.getItem('username');

    const roomCodeEl = document.getElementById('roomCode');
    if (roomCodeEl) roomCodeEl.innerText = roomCode || 'UNKNOWN';
    socket.emit('joinRoom', { roomId: roomCode, username });

    const userSelect = document.getElementById('userSelect');
    const nowPlayingEl = document.getElementById('nowPlaying');

    // UI elements
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const progress = document.getElementById('progress');
    const progressFill = document.getElementById('progressFill');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const trackTitleEl = document.getElementById('trackTitle');

    // For category navigation (tamil/english)
    const tamilSelect = document.getElementById('tamilSongs');
    const englishSelect = document.getElementById('englishSongs');

    // Prevent echo when applying remote changes
    let suppressEmit = false;

    // Track which category last used for next/prev logic: 'tamil'|'english'|'both'
    let lastCategory = 'both'; // default both (all songs)
    function getAllSongs(category = 'both') {
      const tamil = tamilSelect ? Array.from(tamilSelect.options).map(o => o.value) : [];
      const eng = englishSelect ? Array.from(englishSelect.options).map(o => o.value) : [];
      if (category === 'tamil') return tamil;
      if (category === 'english') return eng;
      return [...tamil, ...eng];
    }

    function setNowPlayingUI(src) {
      const rel = songPathToRelative(src || '');
      const name = songNameFromPath(rel);
      trackTitleEl.textContent = name || 'Not Playing';
      if (nowPlayingEl) nowPlayingEl.textContent = `🎶 Now Playing: ${name || 'None'}`;
    }
    // -----------------------
// Local file Play & Share (UPDATED for your HTML IDs)
// -----------------------
const fileInput = document.getElementById("fileInput");
const playLocalBtn = document.getElementById("playLocalBtn");
const localStatus = document.getElementById("localStatus");

if (fileInput && playLocalBtn) {
  playLocalBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) {
      localStatus.textContent = "❌ Please choose a song first";
      return;
    }

    localStatus.textContent = "⏳ Uploading & sharing song...";

    const formData = new FormData();
    formData.append("song", file);

    try {
      const res = await fetch("/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (!data.url) throw new Error("Upload failed");

      const songUrl = data.url;
      const songName = data.name || file.name;

      // play locally without echo
      suppressEmit = true;
      player.src = songUrl;
      player.currentTime = 0;
      await player.play();
      setNowPlayingUI(songUrl);

      // broadcast to all users
      socket.emit("playSong", {
        roomId: roomCode,
        song: songUrl,
        time: 0,
        songName
      });

      localStatus.textContent = "✅ Playing & shared with room";
      suppressEmit = false;

    } catch (err) {
      console.error(err);
      localStatus.textContent = "❌ Failed to upload or play song";
    }
  });
}


    // --- socket handlers (kept from your code) ---
    socket.on('updateUsers', (users) => {
      if (!userSelect) return;
      userSelect.innerHTML = '';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        userSelect.appendChild(opt);
      });
    });

    socket.on('playSong', (data) => {
      suppressEmit = true;
      const rel = songPathToRelative(data.song || '');
      if (rel) {
        if (songPathToRelative(player.src) !== rel) {
          player.src = rel;
        }
      }
      player.currentTime = typeof data.time === 'number' ? data.time : 0;
      player.play().catch(err => {
        console.log('Play blocked:', err);
      }).finally(() => {
        setNowPlayingUI(rel || player.src);
        // set lastCategory based on rel
        if (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === rel)) lastCategory = 'tamil';
        else if (englishSelect && Array.from(englishSelect.options).some(o => o.value === rel)) lastCategory = 'english';
        else lastCategory = 'both';
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    socket.on('pauseSong', (data) => {
      suppressEmit = true;
      player.pause();
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('syncTime', (data) => {
      const rel = songPathToRelative(data.song || '');
      if (songPathToRelative(player.src) === rel) {
        const diff = Math.abs(player.currentTime - data.time);
        if (diff > 0.5) {
          suppressEmit = true;
          player.currentTime = data.time;
          setTimeout(() => { suppressEmit = false; }, 150);
        }
      }
    });

    socket.on('nowPlaying', (data) => {
      if (nowPlayingEl) nowPlayingEl.textContent = `🎶 Now Playing: ${data.songName || 'Unknown'}`;
    });

    // --- local player events ---
    player.addEventListener('play', () => {
      // keep UI in sync
      playPauseBtn.innerHTML = '❚❚'; // show pause
      if (suppressEmit) return;
      const rel = songPathToRelative(player.src);
      const name = songNameFromPath(rel);
      socket.emit('playSong', { roomId: roomCode, song: rel, time: player.currentTime, songName: name });
      setNowPlayingUI(rel);
    });

    player.addEventListener('pause', () => {
      playPauseBtn.innerHTML = '►'; // show play
      if (suppressEmit) return;
      socket.emit('pauseSong', { roomId: roomCode });
    });

    player.addEventListener('timeupdate', () => {
      const cur = player.currentTime || 0;
      const dur = player.duration || 0;
      const pct = dur ? (cur / dur) * 100 : 0;
      progressFill.style.width = `${pct}%`;
      currentTimeEl.textContent = formatTime(cur);
      totalTimeEl.textContent = formatTime(dur);
      // optional: emit small sync updates (throttle)
      // we'll emit every timeupdate when not suppressed but to avoid spam, emit only every ~2s
      // For simplicity, emit periodic sync with setInterval below instead.
    });

    // Emit small periodic sync while playing (so other clients can adjust)
    let syncInterval = null;
    function startSyncInterval() {
      if (syncInterval) return;
      syncInterval = setInterval(() => {
        if (!player.paused && !suppressEmit) {
          const rel = songPathToRelative(player.src);
          socket.emit('syncTime', { roomId: roomCode, song: rel, time: player.currentTime });
        }
      }, 2000); // every 2s
    }
    function stopSyncInterval() {
      if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    }

    player.addEventListener('playing', startSyncInterval);
    player.addEventListener('pause', stopSyncInterval);
    player.addEventListener('ended', () => {
      stopSyncInterval();
      // next logic (keeps your broadcast behavior)
      const all = getAllSongs();
      const currentRel = songPathToRelative(player.src);
      const idx = all.indexOf(currentRel);
      const nextIndex = (idx + 1) % all.length;
      const nextSong = all[nextIndex];
      const name = songNameFromPath(nextSong);
      suppressEmit = true;
      player.src = nextSong;
      player.currentTime = 0;
      player.play().catch(err => console.log('Autoplay blocked:', err)).finally(() => {
        setNowPlayingUI(nextSong);
        socket.emit('playSong', { roomId: roomCode, song: nextSong, time: 0, songName: name });
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    // -----------------------
    // Control buttons
    // -----------------------
    playPauseBtn.addEventListener('click', () => {
      if (!player.src) {
        // if no song loaded, try to load selection from dropdowns
        const sel = (englishSelect && englishSelect.value) || (tamilSelect && tamilSelect.value);
        if (sel) player.src = sel;
      }
      if (player.paused) {
        player.play().catch(err => console.log('Play failed:', err));
      } else {
        player.pause();
      }
    });

    prevBtn.addEventListener('click', () => {
      // decide playlist
      let list = getAllSongs('both');
      if (lastCategory === 'tamil') list = getAllSongs('tamil');
      else if (lastCategory === 'english') list = getAllSongs('english');

      const cur = songPathToRelative(player.src);
      let idx = list.indexOf(cur);
      if (idx === -1) idx = 0;
      const prevIndex = (idx - 1 + list.length) % list.length;
      const prevSong = list[prevIndex];
      const name = songNameFromPath(prevSong);
      suppressEmit = true;
      player.src = prevSong;
      player.currentTime = 0;
      player.play().catch(err => console.log('Play failed:', err)).finally(() => {
        setNowPlayingUI(prevSong);
        socket.emit('playSong', { roomId: roomCode, song: prevSong, time: 0, songName: name });
        // set category
        if (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === prevSong)) lastCategory = 'tamil';
        else if (englishSelect && Array.from(englishSelect.options).some(o => o.value === prevSong)) lastCategory = 'english';
        else lastCategory = 'both';
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    nextBtn.addEventListener('click', () => {
      let list = getAllSongs('both');
      if (lastCategory === 'tamil') list = getAllSongs('tamil');
      else if (lastCategory === 'english') list = getAllSongs('english');

      const cur = songPathToRelative(player.src);
      let idx = list.indexOf(cur);
      if (idx === -1) idx = 0;
      const nextIndex = (idx + 1) % list.length;
      const nextSong = list[nextIndex];
      const name = songNameFromPath(nextSong);
      suppressEmit = true;
      player.src = nextSong;
      player.currentTime = 0;
      player.play().catch(err => console.log('Play failed:', err)).finally(() => {
        setNowPlayingUI(nextSong);
        socket.emit('playSong', { roomId: roomCode, song: nextSong, time: 0, songName: name });
        if (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === nextSong)) lastCategory = 'tamil';
        else if (englishSelect && Array.from(englishSelect.options).some(o => o.value === nextSong)) lastCategory = 'english';
        else lastCategory = 'both';
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    // Seek by clicking/dragging the progress bar
    let seeking = false;
    function seekFromEvent(e) {
      const rect = progress.getBoundingClientRect();
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      let pct = (clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      if (player.duration) {
        player.currentTime = pct * player.duration;
        progressFill.style.width = `${pct * 100}%`;
        currentTimeEl.textContent = formatTime(player.currentTime);
        // emit seek to server
        if (!suppressEmit) {
          const rel = songPathToRelative(player.src);
          socket.emit('syncTime', { roomId: roomCode, song: rel, time: player.currentTime });
        }
      }
    }

    progress.addEventListener('mousedown', (e) => { seeking = true; seekFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (seeking) seekFromEvent(e); });
    window.addEventListener('mouseup', () => { if (seeking) seeking = false; });

    // touch support
    progress.addEventListener('touchstart', (e) => { seeking = true; seekFromEvent(e); });
    window.addEventListener('touchmove', (e) => { if (seeking) seekFromEvent(e); });
    window.addEventListener('touchend', () => { if (seeking) seeking = false; });

    // -----------------------
    // Hook existing play buttons to set category & UI
    // -----------------------
    const playTamilBtn = document.getElementById('playTamilBtn');
    const playEnglishBtn = document.getElementById('playEnglishBtn');

    if (playTamilBtn) {
      playTamilBtn.addEventListener('click', () => {
        const song = tamilSelect ? tamilSelect.value : null;
        if (!song) return;
        lastCategory = 'tamil';
        const name = songNameFromPath(song);
        player.src = song;
        player.currentTime = 0;
        player.play().catch(err => console.log('Play failed:', err));
        socket.emit('playSong', { roomId: roomCode, song, time: 0, songName: name });
        setNowPlayingUI(song);
      });
    }

    if (playEnglishBtn) {
      playEnglishBtn.addEventListener('click', () => {
        const song = englishSelect ? englishSelect.value : null;
        if (!song) return;
        lastCategory = 'english';
        const name = songNameFromPath(song);
        player.src = song;
        player.currentTime = 0;
        player.play().catch(err => console.log('Play failed:', err));
        socket.emit('playSong', { roomId: roomCode, song, time: 0, songName: name });
        setNowPlayingUI(song);
      });
    }

    // If user selects an item in dropdown but doesn't press play, update lastCategory so next/prev will use it
    if (tamilSelect) {
      tamilSelect.addEventListener('change', () => { lastCategory = 'tamil'; });
    }
    if (englishSelect) {
      englishSelect.addEventListener('change', () => { lastCategory = 'english'; });
    }

    // Initial state request
    socket.emit('requestState', { roomId: roomCode });

    // expose some debug on window for quick testing
    window.__musicRoom = { socket, player };

    // initial UI update if audio has source
    if (player.src) setNowPlayingUI(player.src);
  }

  // Auto-init if room.html
  if (window.location.pathname.endsWith('room.html')) {
    window.addEventListener('DOMContentLoaded', initRoom);
  }
document.getElementById("playYTBtn").onclick = () => {
  const ytLink = document.getElementById("ytLinkInput").value.trim();
  if (!ytLink) return alert("Paste a YouTube link or video ID first");

  // Save the link in session storage so yt.html can pick it up
  sessionStorage.setItem("ytLink", ytLink);

  // Open yt.html page
  window.location.href = "yt.html";
};
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("playYTBtn").onclick = () => {
    window.location.href = "yt.html";
  };
});


})();
