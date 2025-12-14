// script.js
// Full player logic with local file playlist support + dropdown songs + Play/Pause/Prev/Next + progress bar sync
(function () {
  // -----------------------
  // Helper UI injector
  // -----------------------
  function ensurePlayerUI() {
    if (document.getElementById('custom-player')) return;

    const container = document.createElement('div');
    container.id = 'custom-player';
    container.style.maxWidth = '420px';
    container.style.width = '100%';
    container.style.marginTop = '12px';
    container.innerHTML = `
      <style>
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
        <button id="prevBtn" class="player-btn" title="Previous">&#9664;&#9664;</button>
        <button id="playPauseBtn" class="player-btn" title="Play / Pause">&#9654;</button>
        <button id="nextBtn" class="player-btn" title="Next">&#9654;&#9654;</button>
      </div>
    `;

    const audioEl = document.getElementById('player');
    if (audioEl && audioEl.parentNode) {
      audioEl.parentNode.insertBefore(container, audioEl.nextSibling);
      audioEl.controls = false;
      audioEl.style.display = 'none';
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
  // Main init
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

    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const progress = document.getElementById('progress');
    const progressFill = document.getElementById('progressFill');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const trackTitleEl = document.getElementById('trackTitle');

    const tamilSelect = document.getElementById('tamilSongs');
    const englishSelect = document.getElementById('englishSongs');
    const fileInput = document.getElementById('localFileInput');

    let suppressEmit = false;
    let lastCategory = 'both';
    let localFiles = []; // array of uploaded local files
    let localIndex = 0;

    function getAllSongs(category = 'both') {
      const tamil = tamilSelect ? Array.from(tamilSelect.options).map(o => o.value) : [];
      const eng = englishSelect ? Array.from(englishSelect.options).map(o => o.value) : [];
      if (category === 'tamil') return tamil;
      if (category === 'english') return eng;
      if (category === 'local') return localFiles.map(f => f.url);
      return [...tamil, ...eng];
    }

    function setNowPlayingUI(src, customName) {
      let name = customName || songNameFromPath(src || '');
      trackTitleEl.textContent = name || 'Not Playing';
      if (nowPlayingEl) nowPlayingEl.textContent = `🎶 Now Playing: ${name || 'None'}`;
    }

    // -----------------------
    // Socket handlers
    // -----------------------
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
      if (data.song) {
        if (!localFiles.some(f => f.url === data.song)) {
          player.src = data.song;
          localFiles = []; // clear local files if remote song
          localIndex = 0;
        }
        player.currentTime = typeof data.time === 'number' ? data.time : 0;
        player.play().finally(() => {
          setNowPlayingUI(data.song, data.songName);
          setTimeout(() => { suppressEmit = false; }, 150);
        });
      }
    });

    socket.on('pauseSong', () => {
      suppressEmit = true;
      player.pause();
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('syncTime', (data) => {
      if (songPathToRelative(player.src) === songPathToRelative(data.song)) {
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

    // -----------------------
    // Player events
    // -----------------------
    player.addEventListener('play', () => {
      playPauseBtn.innerHTML = '❚❚';
      if (suppressEmit) return;
      socket.emit('playSong', { roomId: roomCode, song: player.src, time: player.currentTime, songName: songNameFromPath(player.src) });
      setNowPlayingUI(player.src);
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

    let syncInterval = null;
    function startSyncInterval() {
      if (syncInterval) return;
      syncInterval = setInterval(() => {
        if (!player.paused && !suppressEmit) {
          socket.emit('syncTime', { roomId: roomCode, song: player.src, time: player.currentTime });
        }
      }, 2000);
    }
    function stopSyncInterval() {
      if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    }
    player.addEventListener('playing', startSyncInterval);
    player.addEventListener('pause', stopSyncInterval);

    // -----------------------
    // Controls
    // -----------------------
    playPauseBtn.addEventListener('click', () => {
      if (!player.src && localFiles.length) {
        player.src = localFiles[localIndex].url;
      } else if (!player.src) {
        const sel = (englishSelect && englishSelect.value) || (tamilSelect && tamilSelect.value);
        if (sel) player.src = sel;
      }
      if (player.paused) player.play().catch(err => console.log('Play failed:', err));
      else player.pause();
    });

    function playNext() {
      const allSongs = getAllSongs(lastCategory);
      if (!allSongs.length) return;
      if (lastCategory === 'local') {
        localIndex = (localIndex + 1) % localFiles.length;
        player.src = localFiles[localIndex].url;
      } else {
        const curIndex = allSongs.indexOf(songPathToRelative(player.src));
        const nextIndex = (curIndex + 1) % allSongs.length;
        player.src = allSongs[nextIndex];
      }
      player.currentTime = 0;
      player.play().finally(() => {
        setNowPlayingUI(player.src);
        if (!suppressEmit) {
          socket.emit('playSong', { roomId: roomCode, song: player.src, time: 0, songName: songNameFromPath(player.src) });
        }
      });
    }

    function playPrev() {
      const allSongs = getAllSongs(lastCategory);
      if (!allSongs.length) return;
      if (lastCategory === 'local') {
        localIndex = (localIndex - 1 + localFiles.length) % localFiles.length;
        player.src = localFiles[localIndex].url;
      } else {
        const curIndex = allSongs.indexOf(songPathToRelative(player.src));
        const prevIndex = (curIndex - 1 + allSongs.length) % allSongs.length;
        player.src = allSongs[prevIndex];
      }
      player.currentTime = 0;
      player.play().finally(() => {
        setNowPlayingUI(player.src);
        if (!suppressEmit) {
          socket.emit('playSong', { roomId: roomCode, song: player.src, time: 0, songName: songNameFromPath(player.src) });
        }
      });
    }

    prevBtn.addEventListener('click', playPrev);
    nextBtn.addEventListener('click', playNext);

    // -----------------------
    // Progress seeking
    // -----------------------
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
        if (!suppressEmit) {
          socket.emit('syncTime', { roomId: roomCode, song: player.src, time: player.currentTime });
        }
      }
    }

    progress.addEventListener('mousedown', (e) => { seeking = true; seekFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (seeking) seekFromEvent(e); });
    window.addEventListener('mouseup', () => { seeking = false; });

    progress.addEventListener('touchstart', (e) => { seeking = true; seekFromEvent(e); });
    window.addEventListener('touchmove', (e) => { if (seeking) seekFromEvent(e); });
    window.addEventListener('touchend', () => { seeking = false; });

    // -----------------------
    // Local file handling (multi-file)
    // -----------------------
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
        if (!files.length) return;
        // Revoke old URLs
        localFiles.forEach(f => URL.revokeObjectURL(f.url));
        localFiles = files.map(f => ({ file: f, url: URL.createObjectURL(f), name: f.name }));
        localIndex = 0;
        lastCategory = 'local';
        player.src = localFiles[localIndex].url;
        player.currentTime = 0;
        player.play().catch(err => console.log('Play failed:', err));
        setNowPlayingUI(localFiles[localIndex].url, localFiles[localIndex].name);
      });
    }

    // -----------------------
    // Dropdown play buttons
    // -----------------------
    const playTamilBtn = document.getElementById('playTamilBtn');
    const playEnglishBtn = document.getElementById('playEnglishBtn');

    if (playTamilBtn) {
      playTamilBtn.addEventListener('click', () => {
        const song = tamilSelect.value;
        if (!song) return;
        lastCategory = 'tamil';
        player.src = song;
        player.currentTime = 0;
        player.play().catch(err => console.log('Play failed:', err));
        setNowPlayingUI(song);
        socket.emit('playSong', { roomId: roomCode, song, time: 0, songName: songNameFromPath(song) });
      });
    }

    if (playEnglishBtn) {
      playEnglishBtn.addEventListener('click', () => {
        const song = englishSelect.value;
        if (!song) return;
        lastCategory = 'english';
        player.src = song;
        player.currentTime = 0;
        player.play().catch(err => console.log('Play failed:', err));
        setNowPlayingUI(song);
        socket.emit('playSong', { roomId: roomCode, song, time: 0, songName: songNameFromPath(song) });
      });
    }

    if (tamilSelect) tamilSelect.addEventListener('change', () => { lastCategory = 'tamil'; });
    if (englishSelect) englishSelect.addEventListener('change', () => { lastCategory = 'english'; });

    socket.emit('requestState', { roomId: roomCode });
    window.__musicRoom = { socket, player };
    if (player.src) setNowPlayingUI(player.src);
  }

  if (window.location.pathname.endsWith('room.html')) {
    window.addEventListener('DOMContentLoaded', initRoom);
  }
})();
