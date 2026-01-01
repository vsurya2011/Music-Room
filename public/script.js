// script.js - Full synchronized music room (YT + local + playlists) with Owner Controls & UI Notifications
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

      <div id="trackInfo">
        <div id="trackThumb">♫</div>
        <div id="trackMeta">
          <div id="trackTitle">Not Playing</div>
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

      <div id="controls" class="owner-control-block">
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

  // -----------------------
  // Global Variables
  // -----------------------
  let ytPlayer, ytPlaying = false, currentYTId = null, suppressYTEmit = false, isOwner = false;

  // -----------------------
  // YouTube API Logic
  // -----------------------
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
          const canControl = isOwner || (window.__musicRoom && window.__musicRoom.publicControl);
          
          if (event.data === YT.PlayerState.PLAYING) {
            ytPlaying = true;
            if(playPauseBtn) playPauseBtn.innerHTML = "❚❚";
            if (!suppressYTEmit && socket && canControl) {
              socket.emit("playYT", { roomId: roomCode, videoId: currentYTId, time: ytPlayer.getCurrentTime() });
            }
          } else if (event.data === YT.PlayerState.PAUSED) {
            ytPlaying = false;
            if(playPauseBtn) playPauseBtn.innerHTML = "►";
            if (!suppressYTEmit && socket && canControl) {
              socket.emit("pauseSong", { roomId: roomCode });
            }
          } else if (event.data === YT.PlayerState.ENDED) {
            if (canControl) {
               const nextBtn = document.getElementById('nextBtn');
               if (nextBtn) nextBtn.click();
            }
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

    setNowPlayingUI(`🎬 YouTube: ${videoId}`);
    if (document.getElementById('playPauseBtn')) document.getElementById('playPauseBtn').innerHTML = autoplay ? "❚❚" : "►";
    
    setTimeout(() => { suppressYTEmit = false; }, 800);
  }

  // -----------------------
  // UI Notification Helper (from your attached file)
  // -----------------------
  function setNowPlayingUI(srcOrName) {
    const name = srcOrName.includes('/') ? songNameFromPath(srcOrName) : srcOrName;
    const trackTitleEl = document.getElementById('trackTitle');
    const nowPlayingEl = document.getElementById('nowPlaying');
    if (trackTitleEl) trackTitleEl.textContent = name || 'Not Playing';
    if (nowPlayingEl) nowPlayingEl.textContent = `🎶 Now Playing: ${name || 'None'}`;
  }

  // -----------------------
  // Room Initialization
  // -----------------------
  function initRoom() {
    ensurePlayerUI();
    const socket = io();
    const player = document.getElementById('player');
    const roomCode = localStorage.getItem('roomId');
    const username = localStorage.getItem('username');
    const password = localStorage.getItem('ownerPassword');

    const roomDisplay = document.getElementById('roomCodeDisplay') || document.getElementById('roomCode');
    if (roomDisplay) roomDisplay.innerText = roomCode || 'UNKNOWN';
    
    socket.emit('joinRoom', { roomId: roomCode, username, password });

    // UI Elements
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const progress = document.getElementById('progress');
    const progressFill = document.getElementById('progressFill');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const pipBtn = document.getElementById('pipBtn');
    const tamilSelect = document.getElementById('tamilSongs');
    const englishSelect = document.getElementById('englishSongs');
    const toggleControlBtn = document.getElementById('toggleControlBtn');
    const ownerOnlyInterface = document.getElementById('ownerOnlyInterface');

    let suppressEmit = false;
    let lastCategory = 'both';
    window.__musicRoom = { socket, player, publicControl: false };

    // Picture in Picture Support (from your file)
    if (pipBtn) {
      pipBtn.addEventListener('click', () => {
        const iframe = document.querySelector('#ytPlayer');
        if (iframe && iframe.requestFullscreen) {
            iframe.requestFullscreen().catch(() => {
              alert("Please click the 'Picture-in-Picture' icon inside the YouTube player bar.");
            });
        }
      });
    }

    // Permissions logic
    socket.on("permissions", (data) => {
      isOwner = data.isOwner;
      window.__musicRoom.publicControl = data.publicControl;
      updateControlUI(data.publicControl);
      if (isOwner && ownerOnlyInterface) ownerOnlyInterface.style.display = 'block';
    });

    socket.on("publicControlUpdated", (data) => {
      window.__musicRoom.publicControl = data.publicControl;
      updateControlUI(data.publicControl);
    });

    function updateControlUI(isPublic) {
      const statusMsg = document.getElementById('statusMsg');
      const ownerBlock = document.getElementById('ownerControlBlock');
      const controlBtns = document.querySelectorAll('.owner-control-block');
      const hasAccess = isOwner || isPublic;

      if (hasAccess) {
        if (ownerBlock) ownerBlock.style.display = 'block';
        controlBtns.forEach(el => el.style.display = 'block');
        if (progress) progress.style.cursor = 'pointer';
        if (statusMsg) statusMsg.innerText = isOwner ? "Connected as Admin/Owner" : "Public Control Enabled";
      } else {
        if (ownerBlock) ownerBlock.style.display = 'none';
        controlBtns.forEach(el => el.style.display = 'none');
        if (progress) progress.style.cursor = 'default';
        if (statusMsg) statusMsg.innerText = "Connected as Listener";
      }

      if (isOwner && toggleControlBtn) {
        toggleControlBtn.innerText = isPublic ? "🔒 Lock Controls" : "🔓 Allow Friends to Control";
      }
    }

    if (toggleControlBtn) {
      toggleControlBtn.onclick = () => {
        socket.emit("togglePublicControl", { roomId: roomCode });
      };
    }

    // Server Event Listeners
    socket.on("playYT", (data) => playYT(data.videoId, data.time, data.playing));

    socket.on('playSong', (data) => {
      suppressEmit = true;
      const rel = songPathToRelative(data.song || '');
      if (rel) {
        if (songPathToRelative(player.src) !== rel) player.src = rel;
        player.currentTime = data.time || 0;
        player.play().finally(() => {
          setNowPlayingUI(data.songName || rel);
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

    // Control Buttons
    playPauseBtn.addEventListener('click', () => {
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (!canControl) return;
      if (currentYTId) {
        if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) socket.emit("pauseSong", { roomId: roomCode });
        else socket.emit("playYT", { roomId: roomCode, videoId: currentYTId, time: ytPlayer.getCurrentTime() });
      } else {
        if (player.paused) player.play(); else player.pause();
      }
    });

    nextBtn.addEventListener('click', () => {
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (!canControl || currentYTId) return;
      let list = getAllSongs(lastCategory);
      let idx = (list.indexOf(songPathToRelative(player.src)) + 1) % list.length;
      player.src = list[idx]; player.play();
    });

    prevBtn.addEventListener('click', () => {
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (!canControl || currentYTId) return;
      let list = getAllSongs(lastCategory);
      let idx = (list.indexOf(songPathToRelative(player.src)) - 1 + list.length) % list.length;
      player.src = list[idx]; player.play();
    });

    // Progress Bar
    progress.addEventListener('mousedown', (e) => {
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (!canControl) return;
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

    // Audio Element Listeners
    player.addEventListener('play', () => {
      if (playPauseBtn) playPauseBtn.innerHTML = '❚❚';
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (suppressEmit || !canControl) return;
      const rel = songPathToRelative(player.src);
      setNowPlayingUI(rel);
      socket.emit('playSong', { roomId: roomCode, song: rel, time: player.currentTime, songName: songNameFromPath(rel) });
    });

    player.addEventListener('pause', () => {
      if (playPauseBtn) playPauseBtn.innerHTML = '►';
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (suppressEmit || !canControl) return;
      socket.emit('pauseSong', { roomId: roomCode });
    });

    player.addEventListener('timeupdate', () => {
      const pct = (player.currentTime / player.duration) * 100 || 0;
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (currentTimeEl) currentTimeEl.textContent = formatTime(player.currentTime);
      if (totalTimeEl) totalTimeEl.textContent = formatTime(player.duration);
    });

    player.addEventListener('ended', () => { 
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (canControl) nextBtn.click(); 
    });

    // Helpers
    function getAllSongs(cat) {
      const tamil = tamilSelect ? Array.from(tamilSelect.options).map(o => o.value) : [];
      const eng = englishSelect ? Array.from(englishSelect.options).map(o => o.value) : [];
      return (cat === 'tamil') ? tamil : (cat === 'english') ? eng : [...tamil, ...eng];
    }

    // Selection Handlers
    document.getElementById('playTamilBtn').onclick = () => {
      if (!(isOwner || window.__musicRoom.publicControl)) return;
      lastCategory='tamil'; currentYTId = null;
      player.src = tamilSelect.value; player.play();
    };

    document.getElementById('playEnglishBtn').onclick = () => {
      if (!(isOwner || window.__musicRoom.publicControl)) return;
      lastCategory='english'; currentYTId = null;
      player.src = englishSelect.value; player.play();
    };

    const playYTBtn = document.getElementById('playYTBtn');
    if (playYTBtn) {
      playYTBtn.onclick = () => {
        if (!(isOwner || window.__musicRoom.publicControl)) return;
        const videoId = extractVideoId(document.getElementById('ytLink').value.trim());
        if (videoId) socket.emit("playYT", { roomId: roomCode, videoId });
      };
    }

    // Local File Upload with Status Notifications (from your file)
    const playLocalBtn = document.getElementById("playLocalBtn");
    const localStatus = document.getElementById("localStatus");
    const fileInput = document.getElementById("fileInput");
    if (playLocalBtn && fileInput) {
      playLocalBtn.onclick = async () => {
        if (!(isOwner || window.__musicRoom.publicControl)) return;
        const file = fileInput.files[0];
        if (!file) { if(localStatus) localStatus.textContent = "❌ Choose a file"; return; }
        if(localStatus) localStatus.textContent = "⏳ Uploading & sharing...";
        
        const formData = new FormData(); formData.append("song", file);
        try {
          const res = await fetch("/upload", {method: "POST", body: formData});
          const data = await res.json();
          currentYTId = null; player.src = data.url; await player.play();
          setNowPlayingUI(file.name);
          socket.emit("playSong", {roomId: roomCode, song: data.url, time: 0, songName: file.name});
          if(localStatus) localStatus.textContent = "✅ Playing";
        } catch(e) { if(localStatus) localStatus.textContent = "❌ Failed"; }
      };
    }

    // Sync Timer for YouTube
    setInterval(() => {
      const canControl = isOwner || window.__musicRoom.publicControl;
      if (canControl && ytPlayer && ytPlaying && currentYTId && !suppressYTEmit) {
        socket.emit("syncTime", { roomId: roomCode, song: "YOUTUBE_VIDEO", time: ytPlayer.getCurrentTime() });
      }
    }, 2000);

    // Users update
    socket.on('updateUsers', (users) => {
      const userSelect = document.getElementById('userSelect');
      if (userSelect) {
        userSelect.innerHTML = '';
        users.forEach(u => { const opt = document.createElement('option'); opt.textContent = u; userSelect.appendChild(opt); });
      }
    });

    socket.emit('requestState', { roomId: roomCode });
  }

  if (window.location.pathname.includes('room.html')) {
    window.addEventListener('DOMContentLoaded', initRoom);
  }
})();