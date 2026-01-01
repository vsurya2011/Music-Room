(function () {
  /**
   * UI HELPER: Creates the custom music player interface
   */
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
        #controls { display:flex; align-items:center; justify-content:center; gap:18px; margin-top:12px; }
        .player-btn { width:44px; height:44px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; border:none; background:transparent; color:#c7d2fe; }
        .player-btn:active{ transform:scale(.98) }
        #progressWrap { margin-top:12px; }
        #progress { width:100%; height:8px; background: rgba(255,255,255,0.08); border-radius:999px; position:relative; overflow:hidden; cursor:pointer; }
        #progressFill { height:100%; width:0%; background: linear-gradient(90deg,#6366f1,#06b6d4); border-radius:999px; transition: width 0.08s linear; }
        #timeRow { display:flex; justify-content:space-between; color:#a5b4fc; font-size:12px; margin-top:6px; }
      </style>
      <div id="trackInfo"><div id="trackThumb">♫</div><div id="trackMeta"><div id="trackTitle">Not Playing</div></div></div>
      <div id="progressWrap"><div id="progress"><div id="progressFill"></div></div><div id="timeRow"><div id="currentTime">0:00</div><div id="totalTime">0:00</div></div></div>
      <div id="controls" class="owner-control-block">
        <button id="prevBtn" class="player-btn">&#9664;&#9664;</button>
        <button id="playPauseBtn" class="player-btn">&#9654;</button>
        <button id="nextBtn" class="player-btn">&#9654;&#9654;</button>
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

  function formatTime(totalSeconds) {
    if (!isFinite(totalSeconds)) return '0:00';
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function songPathToRelative(p) {
    try { return new URL(p, location.origin).pathname.replace(/^\//, ''); }
    catch { return p || ''; }
  }

  function songNameFromPath(path) {
    try { const parts = path.split('/'); return parts[parts.length - 1] || path; } 
    catch { return path; }
  }

  let ytPlayer, ytPlaying = false, currentYTId = null, suppressYTEmit = false, isOwner = false;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player("ytPlayer", {
      height: "240", width: "100%", videoId: "",
      playerVars: { autoplay: 1, modestbranding: 1, controls: 1, playsinline: 1 },
      events: {
        onStateChange: (event) => {
          const playPauseBtn = document.getElementById('playPauseBtn');
          const roomCode = localStorage.getItem('roomId');
          const socket = window.__musicRoom ? window.__musicRoom.socket : null;
          if (event.data === YT.PlayerState.PLAYING) {
            ytPlaying = true;
            if(playPauseBtn) playPauseBtn.innerHTML = "❚❚";
            if (!suppressYTEmit && socket && isOwner) socket.emit("playYT", { roomId: roomCode, videoId: currentYTId, time: ytPlayer.getCurrentTime() });
          } else if (event.data === YT.PlayerState.PAUSED) {
            ytPlaying = false;
            if(playPauseBtn) playPauseBtn.innerHTML = "►";
            if (!suppressYTEmit && socket && isOwner) socket.emit("pauseSong", { roomId: roomCode });
          } else if (event.data === YT.PlayerState.ENDED) {
            if (isOwner) document.getElementById('nextBtn').click();
          }
        }
      },
    });
  };

  function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : url;
  }

  function playYT(videoId, startTime = 0, autoplay = true) {
    if (!ytPlayer || !ytPlayer.loadVideoById) return;
    const localPlayer = document.getElementById('player');
    if (localPlayer) localPlayer.pause();
    suppressYTEmit = true;
    if (ytPlayer.getVideoData && ytPlayer.getVideoData().video_id !== videoId) {
        currentYTId = videoId;
        ytPlayer.loadVideoById({ videoId, startSeconds: startTime });
    } else {
        ytPlayer.seekTo(startTime, true);
    }
    if (!autoplay) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
    document.getElementById('trackTitle').textContent = "🎬 YouTube: " + videoId;
    if (document.getElementById('playPauseBtn')) document.getElementById('playPauseBtn').innerHTML = autoplay ? "❚❚" : "►";
    setTimeout(() => { suppressYTEmit = false; }, 800);
  }

  function initRoom() {
    ensurePlayerUI();
    const socket = io();
    const player = document.getElementById('player');
    const roomCode = localStorage.getItem('roomId');
    const username = localStorage.getItem('username');
    const password = localStorage.getItem('ownerPassword');

    document.getElementById('roomCodeDisplay').innerText = roomCode || 'UNKNOWN';
    
    // IMPORTANT: Send the password stored in localStorage to the server for verification
    socket.emit('joinRoom', { roomId: roomCode, username, password });

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

    let suppressEmit = false;
    let lastCategory = 'both';
    window.__musicRoom = { socket, player };

    /**
     * PERMISSIONS HANDLER: 
     * Hides or shows buttons based on server verification
     */
    socket.on("permissions", (data) => {
      isOwner = data.isOwner;
      const statusMsg = document.getElementById('statusMsg');
      
      if (isOwner) {
        // Show all control blocks for authorized user
        document.querySelectorAll('.owner-control-block').forEach(el => el.style.display = 'block');
        document.getElementById('ownerControlBlock').style.display = 'block';
        if (statusMsg) statusMsg.innerText = "Connected as Admin/Owner";
        if (progress) progress.style.cursor = 'pointer';
      } else {
        // Hide control blocks for listeners
        document.querySelectorAll('.owner-control-block').forEach(el => el.style.display = 'none');
        document.getElementById('ownerControlBlock').style.display = 'none';
        if (statusMsg) statusMsg.innerText = "Connected as Listener";
        if (progress) progress.style.cursor = 'default';
      }
    });

    socket.on("playYT", ({ videoId, time = 0, playing = true }) => playYT(videoId, time, playing));

    setInterval(() => {
      if (isOwner && ytPlayer && ytPlaying && currentYTId && !suppressYTEmit) {
        socket.emit("syncTime", { roomId: roomCode, song: "YOUTUBE_VIDEO", time: ytPlayer.getCurrentTime() });
      }
    }, 2000);

    document.getElementById('playYTBtn').onclick = () => {
      if(!isOwner) return;
      const videoId = extractVideoId(document.getElementById('ytLink').value.trim());
      if (videoId) socket.emit("playYT", { roomId: roomCode, videoId });
    };

    socket.on('playSong', (data) => {
      suppressEmit = true;
      const rel = songPathToRelative(data.song || '');
      if (rel) {
        if (songPathToRelative(player.src) !== rel) player.src = rel;
        player.currentTime = data.time || 0;
        player.play().finally(() => {
          trackTitleEl.textContent = data.songName || songNameFromPath(rel);
          lastCategory = (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === rel)) ? 'tamil' : 'english';
          suppressEmit = false;
        });
      }
      if (ytPlayer && ytPlaying) { suppressYTEmit = true; ytPlayer.pauseVideo(); setTimeout(()=>suppressYTEmit=false,500); }
    });

    socket.on('pauseSong', () => {
      suppressEmit = true; player.pause();
      if (ytPlayer) { suppressYTEmit = true; ytPlayer.pauseVideo(); setTimeout(()=>suppressYTEmit=false,500); }
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('syncTime', (data) => {
      if (data.song === "YOUTUBE_VIDEO" && ytPlayer) {
        const diff = Math.abs(ytPlayer.getCurrentTime() - data.time);
        if (diff > 2.0) { suppressYTEmit = true; ytPlayer.seekTo(data.time, true); setTimeout(() => { suppressYTEmit = false; }, 800); }
        return;
      }
      if (songPathToRelative(player.src) === songPathToRelative(data.song)) {
        const diff = Math.abs(player.currentTime - data.time);
        if (diff > 0.8) { suppressEmit = true; player.currentTime = data.time; setTimeout(() => { suppressEmit = false; }, 150); }
      }
    });

    playPauseBtn.addEventListener('click', () => {
      if (!isOwner) return;
      if (currentYTId) {
        if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) socket.emit("pauseSong", { roomId: roomCode });
        else socket.emit("playYT", { roomId: roomCode, videoId: currentYTId, time: ytPlayer.getCurrentTime() });
      } else {
        if (player.paused) player.play(); else player.pause();
      }
    });

    function getAllSongs(cat) {
      const tamil = Array.from(tamilSelect.options).map(o => o.value);
      const eng = Array.from(englishSelect.options).map(o => o.value);
      return (cat === 'tamil') ? tamil : (cat === 'english') ? eng : [...tamil, ...eng];
    }

    socket.on('updateUsers', (users) => {
      const userSelect = document.getElementById('userSelect');
      userSelect.innerHTML = '';
      users.forEach(u => { const opt = document.createElement('option'); opt.textContent = u; userSelect.appendChild(opt); });
    });

    player.addEventListener('play', () => {
      playPauseBtn.innerHTML = '❚❚';
      if (suppressEmit || !isOwner) return;
      const rel = songPathToRelative(player.src);
      socket.emit('playSong', { roomId: roomCode, song: rel, time: player.currentTime, songName: songNameFromPath(rel) });
    });

    player.addEventListener('pause', () => {
      playPauseBtn.innerHTML = '►';
      if (suppressEmit || !isOwner) return;
      socket.emit('pauseSong', { roomId: roomCode });
    });

    player.addEventListener('timeupdate', () => {
      const pct = (player.currentTime / player.duration) * 100 || 0;
      progressFill.style.width = `${pct}%`;
      currentTimeEl.textContent = formatTime(player.currentTime);
      totalTimeEl.textContent = formatTime(player.duration);
    });

    player.addEventListener('ended', () => { if (isOwner) nextBtn.click(); });

    nextBtn.addEventListener('click', () => {
      if (!isOwner || currentYTId) return;
      let list = getAllSongs(lastCategory);
      let idx = (list.indexOf(songPathToRelative(player.src)) + 1) % list.length;
      player.src = list[idx]; player.play();
    });

    prevBtn.addEventListener('click', () => {
      if (!isOwner || currentYTId) return;
      let list = getAllSongs(lastCategory);
      let idx = (list.indexOf(songPathToRelative(player.src)) - 1 + list.length) % list.length;
      player.src = list[idx]; player.play();
    });

    progress.addEventListener('mousedown', (e) => {
      if (!isOwner) return;
      const rect = progress.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (currentYTId) {
        const time = pct * ytPlayer.getDuration();
        ytPlayer.seekTo(time, true);
        socket.emit("syncTime", { roomId: roomCode, song: "YOUTUBE_VIDEO", time });
      } else {
        player.currentTime = pct * player.duration;
        socket.emit('syncTime', { roomId: roomCode, song: songPathToRelative(player.src), time: player.currentTime });
      }
    });

    document.getElementById('playTamilBtn').onclick = () => {
      if(!isOwner) return;
      lastCategory='tamil'; currentYTId = null;
      player.src = tamilSelect.value; player.play();
    };

    document.getElementById('playEnglishBtn').onclick = () => {
      if(!isOwner) return;
      lastCategory='english'; currentYTId = null;
      player.src = englishSelect.value; player.play();
    };

    document.getElementById("playLocalBtn").onclick = async () => {
      if(!isOwner) return;
      const file = document.getElementById("fileInput").files[0];
      if (!file) return;
      const formData = new FormData(); formData.append("song", file);
      const res = await fetch("/upload",{method:"POST",body:formData});
      const data = await res.json();
      currentYTId = null; player.src = data.url; player.play();
      socket.emit("playSong",{roomId: roomCode, song: data.url, time:0, songName:file.name});
    };
  }

  // Ensure init runs on room.html
  if (window.location.pathname.includes('room.html')) {
    window.addEventListener('DOMContentLoaded', initRoom);
  }
})();