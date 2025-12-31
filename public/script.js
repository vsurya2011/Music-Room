// script.js - Full synchronized music room (YT + local + playlists)
(function () {
  // -----------------------
  // Helper UI
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
  // YouTube Setup
  // -----------------------
  let ytPlayer, ytPlaying = false, currentYTId = null, suppressYTEmit = false;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player("ytPlayer", {
      height: "240",
      width: "100%",
      videoId: "",
      playerVars: { autoplay: 1, modestbranding: 1, controls: 1, playsinline: 1 },
      events: {
        onStateChange: (event) => {
          const playPauseBtn = document.getElementById('playPauseBtn');
          const roomCode = localStorage.getItem('roomId');
          const socket = window.__musicRoom ? window.__musicRoom.socket : null;

          if (event.data === YT.PlayerState.PLAYING) {
            ytPlaying = true;
            if(playPauseBtn) playPauseBtn.innerHTML = "❚❚";
            if (!suppressYTEmit && socket) {
              socket.emit("playYT", { roomId: roomCode, videoId: currentYTId, time: ytPlayer.getCurrentTime() });
            }
          } else if (event.data === YT.PlayerState.PAUSED) {
            ytPlaying = false;
            if(playPauseBtn) playPauseBtn.innerHTML = "►";
            if (!suppressYTEmit && socket) {
              socket.emit("pauseSong", { roomId: roomCode });
            }
          } else if (event.data === YT.PlayerState.ENDED) {
            // AUTO-PLAY NEXT AFTER YOUTUBE ENDS
            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn) nextBtn.click();
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
    
    let alreadyLoaded = false;
    if (ytPlayer.getVideoData && ytPlayer.getVideoData().video_id === videoId) {
        alreadyLoaded = true;
    }

    if (!alreadyLoaded) {
        currentYTId = videoId;
        ytPlayer.loadVideoById({ videoId, startSeconds: startTime });
    } else {
        ytPlayer.seekTo(startTime, true);
    }

    if (!autoplay) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();

    const trackTitleEl = document.getElementById('trackTitle');
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (trackTitleEl) trackTitleEl.textContent = "🎬 YouTube: " + videoId;
    if (playPauseBtn) playPauseBtn.innerHTML = autoplay ? "❚❚" : "►";
    
    setTimeout(() => { suppressYTEmit = false; }, 800);
  }
  // -----------------------

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
    const pipBtn = document.getElementById('pipBtn');

    const tamilSelect = document.getElementById('tamilSongs');
    const englishSelect = document.getElementById('englishSongs');

    let suppressEmit = false;
    let lastCategory = 'both';

    window.__musicRoom = { socket, player };

    // -----------------------
    // Mini Player (PiP) Fix
    // -----------------------
    if (pipBtn) {
      pipBtn.addEventListener('click', () => {
        const iframe = document.querySelector('#ytPlayer');
        if (iframe) {
          if (iframe.requestFullscreen) {
            iframe.requestFullscreen().catch(() => {
              alert("Please click the 'Picture-in-Picture' icon inside the YouTube player bar (bottom right).");
            });
          }
        }
      });
    }

    // -----------------------
    // YouTube socket events
    // -----------------------
    socket.on("playYT", ({ videoId, time = 0, playing = true }) => {
      playYT(videoId, time, playing);
    });

    setInterval(() => {
      if (ytPlayer && ytPlaying && currentYTId && !suppressYTEmit) {
        socket.emit("syncTime", {
          roomId: roomCode,
          song: "YOUTUBE_VIDEO",
          time: ytPlayer.getCurrentTime()
        });
      }
    }, 2000);

    const playYTBtn = document.getElementById('playYTBtn');
    const ytLinkInput = document.getElementById('ytLink');
    if (playYTBtn) {
      playYTBtn.onclick = () => {
        const rawValue = ytLinkInput.value.trim();
        if (!rawValue) { alert("❌ Please paste a YouTube link or ID first!"); return; }
        const videoId = extractVideoId(rawValue);
        socket.emit("playYT", { roomId: roomCode, videoId });
      };
    }

    // -----------------------
    // Local & playlist socket events
    // -----------------------
    socket.on('playSong', (data) => {
      suppressEmit = true;
      const rel = songPathToRelative(data.song || '');
      if (rel) {
        if (songPathToRelative(player.src) !== rel) player.src = rel;
        player.currentTime = data.time || 0;
        player.play().finally(() => {
          setNowPlayingUI(rel);
          lastCategory = (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === rel)) ? 'tamil'
                       : (englishSelect && Array.from(englishSelect.options).some(o => o.value === rel)) ? 'english'
                       : 'both';
          suppressEmit = false;
        });
      }
      if (ytPlayer && ytPlaying) { suppressYTEmit = true; ytPlayer.pauseVideo(); setTimeout(()=>suppressYTEmit=false,500); }
    });

    socket.on('pauseSong', () => {
      suppressEmit = true;
      player.pause();
      if (ytPlayer) { 
          suppressYTEmit = true; 
          ytPlayer.pauseVideo(); 
          setTimeout(()=>suppressYTEmit=false,500); 
      }
      setTimeout(() => { suppressEmit = false; }, 150);
    });

    socket.on('syncTime', (data) => {
      if (data.song === "YOUTUBE_VIDEO" && ytPlayer && currentYTId) {
        const diff = Math.abs(ytPlayer.getCurrentTime() - data.time);
        if (diff > 2.0) {
          suppressYTEmit = true;
          ytPlayer.seekTo(data.time, true);
          setTimeout(() => { suppressYTEmit = false; }, 800);
        }
        return;
      }
      const rel = songPathToRelative(data.song || '');
      if (songPathToRelative(player.src) === rel) {
        const diff = Math.abs(player.currentTime - data.time);
        if (diff > 0.8) {
          suppressEmit = true;
          player.currentTime = data.time;
          setTimeout(() => { suppressEmit = false; }, 150);
        }
      }
    });

    // -----------------------
    // Control buttons
    // -----------------------
    playPauseBtn.addEventListener('click', () => {
      if (currentYTId) {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            socket.emit("pauseSong", { roomId: roomCode });
        } else {
            socket.emit("playYT", { roomId: roomCode, videoId: currentYTId, time: ytPlayer.getCurrentTime() });
        }
      } else {
        if (!player.src) {
          const sel = (englishSelect && englishSelect.value) || (tamilSelect && tamilSelect.value);
          if (sel) player.src = sel;
        }
        if (player.paused) player.play();
        else player.pause();
      }
    });

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

    player.addEventListener('play', () => {
      playPauseBtn.innerHTML = '❚❚';
      if (suppressEmit) return;
      if (ytPlayer && ytPlaying) { suppressYTEmit = true; ytPlayer.pauseVideo(); setTimeout(()=>suppressYTEmit=false,500); }
      const rel = songPathToRelative(player.src);
      socket.emit('playSong', { roomId: roomCode, song: rel, time: player.currentTime, songName: songNameFromPath(rel) });
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

    // AUTO-PLAY NEXT AFTER LOCAL SONG ENDS
    player.addEventListener('ended', () => {
      nextBtn.click();
    });

    prevBtn.addEventListener('click', () => {
      if (currentYTId) return;
      let list = getAllSongs(lastCategory);
      const cur = songPathToRelative(player.src);
      let idx = list.indexOf(cur);
      if (idx === -1) idx = 0;
      const prevIndex = (idx - 1 + list.length) % list.length;
      const prevSong = list[prevIndex];
      suppressEmit = true;
      player.src = prevSong;
      player.currentTime = 0;
      player.play().finally(() => {
        setNowPlayingUI(prevSong);
        socket.emit('playSong', { roomId: roomCode, song: prevSong, time: 0, songName: songNameFromPath(prevSong) });
        suppressEmit = false;
      });
    });

    nextBtn.addEventListener('click', () => {
      if (currentYTId) return;
      let list = getAllSongs(lastCategory);
      const cur = songPathToRelative(player.src);
      let idx = list.indexOf(cur);
      if (idx === -1) idx = 0;
      const nextIndex = (idx + 1) % list.length;
      const nextSong = list[nextIndex];
      suppressEmit = true;
      player.src = nextSong;
      player.currentTime = 0;
      player.play().finally(() => {
        setNowPlayingUI(nextSong);
        socket.emit('playSong', { roomId: roomCode, song: nextSong, time: 0, songName: songNameFromPath(nextSong) });
        suppressEmit = false;
      });
    });

    let seeking = false;
    function seekFromEvent(e) {
      const rect = progress.getBoundingClientRect();
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      let pct = (clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      if (player.duration && !currentYTId) {
        player.currentTime = pct * player.duration;
        progressFill.style.width = `${pct * 100}%`;
        currentTimeEl.textContent = formatTime(player.currentTime);
        if (!suppressEmit) socket.emit('syncTime', { roomId: roomCode, song: songPathToRelative(player.src), time: player.currentTime });
      } else if (currentYTId && ytPlayer) {
          const time = pct * ytPlayer.getDuration();
          ytPlayer.seekTo(time, true);
          socket.emit("syncTime", { roomId: roomCode, song: "YOUTUBE_VIDEO", time: time });
      }
    }
    progress.addEventListener('mousedown', (e) => { seeking = true; seekFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (seeking) seekFromEvent(e); });
    window.addEventListener('mouseup', () => { if (seeking) seeking = false; });

    const playTamilBtn = document.getElementById('playTamilBtn');
    const playEnglishBtn = document.getElementById('playEnglishBtn');
    if (playTamilBtn) playTamilBtn.addEventListener('click', () => {
      const song = tamilSelect.value; if(!song) return;
      lastCategory='tamil'; currentYTId = null;
      player.src=song; player.currentTime=0; player.play();
      socket.emit('playSong', { roomId: roomCode, song, time:0, songName:songNameFromPath(song) });
      setNowPlayingUI(song);
    });
    if (playEnglishBtn) playEnglishBtn.addEventListener('click', () => {
      const song = englishSelect.value; if(!song) return;
      lastCategory='english'; currentYTId = null;
      player.src=song; player.currentTime=0; player.play();
      socket.emit('playSong', { roomId: roomCode, song, time:0, songName:songNameFromPath(song) });
      setNowPlayingUI(song);
    });

    const fileInput = document.getElementById("fileInput");
    const playLocalBtn = document.getElementById("playLocalBtn");
    const localStatus = document.getElementById("localStatus");
    if (playLocalBtn && fileInput) {
      playLocalBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) { localStatus.textContent = "❌ Please choose a song first"; return; }
        localStatus.textContent = "⏳ Uploading & sharing...";
        const formData = new FormData(); formData.append("song", file);
        try {
          const res = await fetch("/upload",{method:"POST",body:formData});
          const data = await res.json();
          if (!data.url) throw new Error("Upload failed");
          const songUrl = data.url;
          currentYTId = null;
          suppressEmit=true; player.src=songUrl; player.currentTime=0; await player.play();
          setNowPlayingUI(songUrl);
          socket.emit("playSong",{roomId: roomCode, song:songUrl, time:0, songName:file.name});
          localStatus.textContent="✅ Playing & shared"; suppressEmit=false;
          if (ytPlayer && ytPlaying) { suppressYTEmit = true; ytPlayer.pauseVideo(); setTimeout(()=>suppressYTEmit=false,500); }
        } catch(err){console.error(err); localStatus.textContent="❌ Failed to upload/play";}
      });
    }

    socket.emit('requestState', { roomId: roomCode });
  }

 if (window.location.pathname.endsWith('room.html'))
 window.addEventListener('DOMContentLoaded', initRoom);

})();