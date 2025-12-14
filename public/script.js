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

    // For local file
    const fileInput = document.getElementById('fileInput');
    const playLocalBtn = document.getElementById('playLocalBtn');
    const localStatus = document.getElementById('localStatus');

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
      if (!data.songBase64) { // normal path
        const rel = songPathToRelative(data.song || '');
        if (rel) {
          if (songPathToRelative(player.src) !== rel) {
            player.src = rel;
          }
        }
      } else { // local file shared as base64
        player.src = data.songBase64;
      }
      player.currentTime = typeof data.time === 'number' ? data.time : 0;
      player.play().catch(err => { console.log('Play blocked:', err); }).finally(() => {
        setNowPlayingUI(data.songName || player.src);
        lastCategory = data.category || 'both';
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    socket.on('pauseSong', (data) => {
      suppressEmit = true;
      player.pause();
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('syncTime', (data) => {
      if (data.songBase64) {
        if (player.src === data.songBase64) {
          const diff = Math.abs(player.currentTime - data.time);
          if (diff > 0.5) {
            suppressEmit = true;
            player.currentTime = data.time;
            setTimeout(() => { suppressEmit = false; }, 150);
          }
        }
      } else {
        const rel = songPathToRelative(data.song || '');
        if (songPathToRelative(player.src) === rel) {
          const diff = Math.abs(player.currentTime - data.time);
          if (diff > 0.5) {
            suppressEmit = true;
            player.currentTime = data.time;
            setTimeout(() => { suppressEmit = false; }, 150);
          }
        }
      }
    });

    // --- local player events ---
    player.addEventListener('play', () => {
      playPauseBtn.innerHTML = '❚❚';
      if (suppressEmit) return;
      const rel = songPathToRelative(player.src);
      const name = songNameFromPath(rel);
      socket.emit('playSong', { roomId: roomCode, song: rel, songBase64: player.src.startsWith('data:audio') ? player.src : null, time: player.currentTime, songName: name, category: lastCategory });
      setNowPlayingUI(rel);
    });

    player.addEventListener('pause', () => {
      playPauseBtn.innerHTML = '►';
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
    });

    // Emit periodic sync while playing
    let syncInterval = null;
    function startSyncInterval() {
      if (syncInterval) return;
      syncInterval = setInterval(() => {
        if (!player.paused && !suppressEmit) {
          const rel = songPathToRelative(player.src);
          socket.emit('syncTime', { roomId: roomCode, song: rel, songBase64: player.src.startsWith('data:audio') ? player.src : null, time: player.currentTime });
        }
      }, 2000);
    }
    function stopSyncInterval() {
      if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    }

    player.addEventListener('playing', startSyncInterval);
    player.addEventListener('pause', stopSyncInterval);

    // -----------------------
    // Local File Play & Share
    // -----------------------
    if (playLocalBtn) {
      playLocalBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) return alert('Select an audio file first!');
        if (!file.type.startsWith('audio/')) return alert('Only audio files allowed!');
        localStatus.textContent = 'Loading...';

        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target.result;
          player.src = base64;
          player.currentTime = 0;
          lastCategory = 'local';
          const name = file.name;
          player.play().catch(err => console.log('Play failed:', err));
          setNowPlayingUI(name);
          socket.emit('playSong', { roomId: roomCode, songName: name, songBase64: base64, category: 'local', time: 0 });
          localStatus.textContent = `Playing: ${name}`;
        };
        reader.readAsDataURL(file);
      });
    }

    // -----------------------
    // Control buttons, dropdowns, next/prev, seek (existing code)
    // -----------------------
    // --- existing play buttons code ---
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

    if (tamilSelect) tamilSelect.addEventListener('change', () => { lastCategory = 'tamil'; });
    if (englishSelect) englishSelect.addEventListener('change', () => { lastCategory = 'english'; });

    // Initial state request
    socket.emit('requestState', { roomId: roomCode });

    window.__musicRoom = { socket, player };
    if (player.src) setNowPlayingUI(player.src);
  }

  // Auto-init if room.html
  if (window.location.pathname.endsWith('room.html')) {
    window.addEventListener('DOMContentLoaded', initRoom);
  }
})();
