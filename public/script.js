// script.js
// Combined room logic + custom player UI (Play/Pause, Prev, Next, Seek, Progress)
// Replaces default audio controls visually (but keeps <audio id="player"> as the actual audio element)

(function () {
  // --- YouTube API Globals ---
  let ytPlayer;
  let isYtReady = false;

  // Initialize YouTube API and handle global state changes
  window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('yt-player', {
      events: {
        'onReady': () => { isYtReady = true; },
        'onStateChange': (event) => {
            // Forward state changes to the initRoom logic
            if (window._ytSyncHandler) window._ytSyncHandler(event);
        }
      }
    });
  };

  // Extract ID from full URL
  function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
  }

  // -----------------------
  // Helper UI injector (Kept Original)
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
  // Utility functions (Kept Original)
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
    } catch { return p || ''; }
  }

  function songNameFromPath(path) {
    try {
      const parts = path.split('/');
      return parts[parts.length - 1] || path;
    } catch { return path; }
  }

  // -----------------------
  // Main init (room logic + player + YouTube)
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
    const tamilSelect = document.getElementById('tamilSongs');
    const englishSelect = document.getElementById('englishSongs');

    // New YouTube UI references
    const ytContainer = document.getElementById('yt-container');
    const ytInput = document.getElementById('ytUrl');
    const playYtBtn = document.getElementById('playYtBtn');
    const customPlayerUI = document.getElementById('custom-player');

    let suppressEmit = false;
    let currentMode = 'audio'; // 'audio' or 'youtube'

    function switchMode(mode) {
        currentMode = mode;
        if (mode === 'youtube') {
            player.pause();
            customPlayerUI.style.display = 'none';
            ytContainer.style.display = 'block';
        } else {
            if (isYtReady) ytPlayer.stopVideo();
            ytContainer.style.display = 'none';
            customPlayerUI.style.display = 'block';
        }
    }

    let lastCategory = 'both'; 
    function getAllSongs(category = 'both') {
      const tamil = tamilSelect ? Array.from(tamilSelect.options).map(o => o.value) : [];
      const eng = englishSelect ? Array.from(englishSelect.options).map(o => o.value) : [];
      if (category === 'tamil') return tamil;
      if (category === 'english') return eng;
      return [...tamil, ...eng];
    }

    function setNowPlayingUI(src, isYt = false) {
      if (isYt) {
          trackTitleEl.textContent = src || "YouTube Video";
          if (nowPlayingEl) nowPlayingEl.textContent = `🎶 Now Playing: ${src || "YouTube Video"}`;
      } else {
          const rel = songPathToRelative(src || '');
          const name = songNameFromPath(rel);
          trackTitleEl.textContent = name || 'Not Playing';
          if (nowPlayingEl) nowPlayingEl.textContent = `🎶 Now Playing: ${name || 'None'}`;
      }
    }

    // --- YouTube Sync Event Handler ---
    window._ytSyncHandler = (event) => {
        if (suppressEmit || currentMode !== 'youtube') return;
        if (event.data === YT.PlayerState.PLAYING) {
            socket.emit('playSong', { roomId: roomCode, type: 'youtube', song: ytPlayer.getVideoData().video_id, time: ytPlayer.getCurrentTime(), songName: ytPlayer.getVideoData().title });
        } else if (event.data === YT.PlayerState.PAUSED) {
            socket.emit('pauseSong', { roomId: roomCode, type: 'youtube' });
        }
    };

    // -----------------------
    // Local file Play & Share (Kept Original)
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
          const res = await fetch("/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (!data.url) throw new Error("Upload failed");
          
          switchMode('audio');
          suppressEmit = true;
          player.src = data.url;
          player.currentTime = 0;
          await player.play();
          setNowPlayingUI(data.url);
          socket.emit("playSong", { roomId: roomCode, type: 'audio', song: data.url, time: 0, songName: data.name || file.name });
          localStatus.textContent = "✅ Playing & shared with room";
          suppressEmit = false;
        } catch (err) {
          console.error(err);
          localStatus.textContent = "❌ Failed to upload or play song";
        }
      });
    }

    // --- Socket Handlers ---
    socket.on('updateUsers', (users) => {
      if (!userSelect) return;
      userSelect.innerHTML = '';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u; opt.textContent = u; userSelect.appendChild(opt);
      });
    });

    socket.on('playSong', (data) => {
      suppressEmit = true;
      switchMode(data.type || 'audio');
      
      if (data.type === 'youtube') {
          if (isYtReady) {
              ytPlayer.loadVideoById(data.song, data.time || 0);
              ytPlayer.playVideo();
          }
          setNowPlayingUI(data.songName || "YouTube", true);
      } else {
          const rel = songPathToRelative(data.song || '');
          if (rel && songPathToRelative(player.src) !== rel) player.src = rel;
          player.currentTime = typeof data.time === 'number' ? data.time : 0;
          player.play().catch(err => console.log('Blocked:', err)).finally(() => {
            setNowPlayingUI(rel || player.src);
            if (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === rel)) lastCategory = 'tamil';
            else if (englishSelect && Array.from(englishSelect.options).some(o => o.value === rel)) lastCategory = 'english';
            else lastCategory = 'both';
            setTimeout(() => { suppressEmit = false; }, 150);
          });
      }
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('pauseSong', () => {
      suppressEmit = true;
      if (currentMode === 'youtube' && isYtReady) ytPlayer.pauseVideo();
      else player.pause();
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('syncTime', (data) => {
      if (suppressEmit) return;
      if (currentMode === 'youtube' && isYtReady) {
          const diff = Math.abs(ytPlayer.getCurrentTime() - data.time);
          if (diff > 2) ytPlayer.seekTo(data.time, true);
      } else {
          const rel = songPathToRelative(data.song || '');
          if (songPathToRelative(player.src) === rel) {
            const diff = Math.abs(player.currentTime - data.time);
            if (diff > 0.8) {
              suppressEmit = true;
              player.currentTime = data.time;
              setTimeout(() => { suppressEmit = false; }, 150);
            }
          }
      }
    });

    // --- Audio Player Events (Kept Original) ---
    player.addEventListener('play', () => {
      playPauseBtn.innerHTML = '❚❚';
      if (suppressEmit || currentMode !== 'audio') return;
      const rel = songPathToRelative(player.src);
      const name = songNameFromPath(rel);
      socket.emit('playSong', { roomId: roomCode, type: 'audio', song: rel, time: player.currentTime, songName: name });
      setNowPlayingUI(rel);
    });

    player.addEventListener('pause', () => {
      playPauseBtn.innerHTML = '►';
      if (suppressEmit || currentMode !== 'audio') return;
      socket.emit('pauseSong', { roomId: roomCode, type: 'audio' });
    });

    player.addEventListener('timeupdate', () => {
      if (currentMode !== 'audio') return;
      const cur = player.currentTime || 0;
      const dur = player.duration || 0;
      const pct = dur ? (cur / dur) * 100 : 0;
      progressFill.style.width = `${pct}%`;
      currentTimeEl.textContent = formatTime(cur);
      totalTimeEl.textContent = formatTime(dur);
    });

    // Periodic Background Sync (Every 3 seconds)
    setInterval(() => {
        if (suppressEmit) return;
        if (currentMode === 'youtube' && isYtReady && ytPlayer.getPlayerState() === 1) {
            socket.emit('syncTime', { roomId: roomCode, type: 'youtube', song: ytPlayer.getVideoData().video_id, time: ytPlayer.getCurrentTime() });
        } else if (currentMode === 'audio' && !player.paused) {
            socket.emit('syncTime', { roomId: roomCode, type: 'audio', song: songPathToRelative(player.src), time: player.currentTime });
        }
    }, 3000);

    player.addEventListener('ended', () => {
      if (currentMode !== 'audio') return;
      const all = getAllSongs();
      const currentRel = songPathToRelative(player.src);
      const idx = all.indexOf(currentRel);
      const nextIndex = (idx + 1) % all.length;
      const nextSong = all[nextIndex];
      const name = songNameFromPath(nextSong);
      suppressEmit = true;
      player.src = nextSong;
      player.currentTime = 0;
      player.play().catch(() => {}).finally(() => {
        setNowPlayingUI(nextSong);
        socket.emit('playSong', { roomId: roomCode, type: 'audio', song: nextSong, time: 0, songName: name });
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    // --- Interaction Listeners ---
    playYtBtn.addEventListener('click', () => {
        const videoId = extractVideoId(ytInput.value);
        if (!videoId) return alert("Please enter a valid YouTube URL");
        socket.emit('playSong', { roomId: roomCode, type: 'youtube', song: videoId, time: 0, songName: "YouTube Video" });
    });

    playPauseBtn.addEventListener('click', () => {
      if (currentMode === 'youtube' && isYtReady) {
          const state = ytPlayer.getPlayerState();
          state === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
      } else {
          if (!player.src) {
            const sel = (englishSelect && englishSelect.value) || (tamilSelect && tamilSelect.value);
            if (sel) player.src = sel;
          }
          player.paused ? player.play().catch(() => {}) : player.pause();
      }
    });

    prevBtn.addEventListener('click', () => {
      if (currentMode !== 'audio') return;
      let list = getAllSongs(lastCategory);
      const cur = songPathToRelative(player.src);
      let idx = list.indexOf(cur);
      const prevIndex = (idx - 1 + list.length) % list.length;
      const prevSong = list[prevIndex];
      suppressEmit = true;
      player.src = prevSong;
      player.currentTime = 0;
      player.play().catch(() => {}).finally(() => {
        setNowPlayingUI(prevSong);
        socket.emit('playSong', { roomId: roomCode, type: 'audio', song: prevSong, time: 0, songName: songNameFromPath(prevSong) });
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    nextBtn.addEventListener('click', () => {
      if (currentMode !== 'audio') return;
      let list = getAllSongs(lastCategory);
      const cur = songPathToRelative(player.src);
      let idx = list.indexOf(cur);
      const nextIndex = (idx + 1) % list.length;
      const nextSong = list[nextIndex];
      suppressEmit = true;
      player.src = nextSong;
      player.currentTime = 0;
      player.play().catch(() => {}).finally(() => {
        setNowPlayingUI(nextSong);
        socket.emit('playSong', { roomId: roomCode, type: 'audio', song: nextSong, time: 0, songName: songNameFromPath(nextSong) });
        setTimeout(() => { suppressEmit = false; }, 150);
      });
    });

    // Seek Logic (Kept Original)
    let seeking = false;
    function seekFromEvent(e) {
      if (currentMode !== 'audio') return;
      const rect = progress.getBoundingClientRect();
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      let pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (player.duration) {
        player.currentTime = pct * player.duration;
        if (!suppressEmit) socket.emit('syncTime', { roomId: roomCode, type: 'audio', song: songPathToRelative(player.src), time: player.currentTime });
      }
    }
    progress.addEventListener('mousedown', (e) => { seeking = true; seekFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (seeking) seekFromEvent(e); });
    window.addEventListener('mouseup', () => { if (seeking) seeking = false; });

    // Category Buttons (Kept Original)
    document.getElementById('playTamilBtn').addEventListener('click', () => {
        const song = tamilSelect.value;
        lastCategory = 'tamil';
        switchMode('audio');
        player.src = song;
        player.play().catch(() => {});
        socket.emit('playSong', { roomId: roomCode, type: 'audio', song, time: 0, songName: songNameFromPath(song) });
        setNowPlayingUI(song);
    });

    document.getElementById('playEnglishBtn').addEventListener('click', () => {
        const song = englishSelect.value;
        lastCategory = 'english';
        switchMode('audio');
        player.src = song;
        player.play().catch(() => {});
        socket.emit('playSong', { roomId: roomCode, type: 'audio', song, time: 0, songName: songNameFromPath(song) });
        setNowPlayingUI(song);
    });

    socket.emit('requestState', { roomId: roomCode });
    window.__musicRoom = { socket, player };
    if (player.src) setNowPlayingUI(player.src);
  }

  if (window.location.pathname.endsWith('room.html')) {
    window.addEventListener('DOMContentLoaded', initRoom);
  }
})();