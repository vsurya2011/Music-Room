/**
 * script.js - Production-Level Music Room Logic
 * -----------------------------------------------------------------------
 * Version: 2.0.0 (Stable)
 * Features: 
 * - YouTube & Audio Sync
 * - Drift Correction (Socket.io)
 * - Late-joiner synchronization
 * - Custom UI Injection
 * - Loop suppression (suppressEmit)
 * -----------------------------------------------------------------------
 */

(function () {
    // --- YouTube API Globals ---
    let ytPlayer;
    let isYtReady = false;

    /**
     * FIX 4: YouTube Iframe Safety Guard
     * Ensures the DOM is ready and the player element exists before initialization.
     */
    window.onYouTubeIframeAPIReady = function () {
        const playerEl = document.getElementById('yt-player');
        if (!playerEl) {
            console.warn("[YouTube API] 'yt-player' element not found. Initialization skipped.");
            return;
        }

        ytPlayer = new YT.Player('yt-player', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1
            },
            events: {
                'onReady': () => { 
                    isYtReady = true; 
                    console.log("[YouTube API] Player Ready.");
                },
                'onStateChange': (event) => {
                    // Forward internal state changes to the room synchronization logic
                    if (window._ytSyncHandler) window._ytSyncHandler(event);
                },
                'onError': (e) => {
                    console.error("[YouTube API] Player Error:", e.data);
                }
            }
        });
    };

    /**
     * Extracts Video ID from various YouTube URL formats or returns the ID if already clean.
     */
    function extractVideoId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : url;
    }

    // -------------------------------------------------------
    // UI Injection: Custom Player Interface
    // -------------------------------------------------------
    function ensurePlayerUI() {
        if (document.getElementById('custom-player')) return;

        const container = document.createElement('div');
        container.id = 'custom-player';
        container.innerHTML = `
      <style>
        #custom-player { 
            background: rgba(15, 23, 42, 0.85); 
            padding: 16px; 
            border-radius: 14px; 
            color: #fff; 
            font-family: 'Roboto', sans-serif; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.4); 
            border: 1px solid rgba(255,255,255,0.1);
            margin-top: 15px;
            backdrop-filter: blur(10px);
        }
        #trackInfo { display: flex; align-items: center; gap: 15px; }
        #trackThumb { 
            width: 60px; height: 60px; border-radius: 12px; 
            background: linear-gradient(135deg, #6366f1, #a855f7); 
            display: flex; align-items: center; justify-content: center; 
            font-size: 24px; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        #trackMeta { flex: 1; overflow: hidden; }
        #trackTitle { font-weight: 700; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #trackSub { color: #94a3b8; font-size: 13px; }
        
        #controls { display: flex; align-items: center; justify-content: center; gap: 20px; margin-top: 15px; }
        .player-btn { 
            width: 48px; height: 48px; border-radius: 50%; 
            display: inline-flex; align-items: center; justify-content: center; 
            cursor: pointer; border: none; background: rgba(255,255,255,0.05); 
            color: #e2e8f0; font-size: 18px; transition: all 0.2s ease;
        }
        .player-btn:hover { background: rgba(255,255,255,0.15); color: #fff; transform: translateY(-2px); }
        .player-btn:active { transform: scale(0.95); }
        
        #progressWrap { margin-top: 15px; }
        #progress { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; position: relative; cursor: pointer; }
        #progressFill { height: 100%; width: 0%; background: linear-gradient(90deg, #3b82f6, #2dd4bf); border-radius: 10px; transition: width 0.1s linear; }
        #timeRow { display: flex; justify-content: space-between; color: #94a3b8; font-size: 12px; margin-top: 8px; font-weight: 500; }
      </style>

      <div id="trackInfo">
        <div id="trackThumb">♫</div>
        <div id="trackMeta">
          <div id="trackTitle">Nothing Playing</div>
          <div id="trackSub">Join a room to start</div>
        </div>
      </div>

      <div id="progressWrap">
        <div id="progress" title="Seek position">
          <div id="progressFill"></div>
        </div>
        <div id="timeRow">
          <div id="currentTime">0:00</div>
          <div id="totalTime">0:00</div>
        </div>
      </div>

      <div id="controls">
        <button id="prevBtn" class="player-btn" title="Previous Song">⏮</button>
        <button id="playPauseBtn" class="player-btn" title="Play/Pause" style="font-size: 22px; background: #6366f1; color: white;">▶</button>
        <button id="nextBtn" class="player-btn" title="Next Song">⏭</button>
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

    // -------------------------------------------------------
    // Utilities
    // -------------------------------------------------------
    function formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
        seconds = Math.max(0, Math.floor(seconds));
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function songPathToRelative(p) {
        try {
            const u = new URL(p, location.origin);
            return u.pathname.replace(/^\//, '');
        } catch { return p || ''; }
    }

    function songNameFromPath(path) {
        if (!path) return "Unknown Track";
        try {
            const parts = path.split('/');
            const filename = parts[parts.length - 1];
            return decodeURIComponent(filename).replace(/\.[^/.]+$/, "").replace(/_/g, " ");
        } catch { return path; }
    }

    // -------------------------------------------------------
    // Main Initialization
    // -------------------------------------------------------
    function initRoom() {
        ensurePlayerUI();

        /**
         * FIX 1: Socket.io Context
         * Uses the default namespace served by the local server.
         */
        const socket = typeof io !== 'undefined' ? io() : null;
        if (!socket) {
            console.error("Socket.io failed to load from /socket.io/socket.io.js");
            return;
        }

        const player = document.getElementById('player');
        const roomCode = localStorage.getItem('roomId');
        const username = localStorage.getItem('username') || "Guest";

        const roomCodeEl = document.getElementById('roomCode');
        if (roomCodeEl) roomCodeEl.innerText = roomCode || 'UNKNOWN';

        // Join the room immediately
        socket.emit('joinRoom', { roomId: roomCode, username });

        // DOM References
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
        const ytContainer = document.getElementById('yt-container');
        const ytInput = document.getElementById('ytUrl');
        const playYtBtn = document.getElementById('playYtBtn');
        const customPlayerUI = document.getElementById('custom-player');
        const tamilSelect = document.getElementById('tamilSongs');
        const englishSelect = document.getElementById('englishSongs');

        /**
         * FIX 3: Suppress-Emit Guard
         * Essential to prevent infinite event loops between clients.
         */
        let suppressEmit = false;
        let currentMode = 'audio'; 
        let lastCategory = 'both';

        // -------------------------------------------------------
        // Mode Management
        // -------------------------------------------------------
        function switchMode(mode) {
            if (currentMode === mode) return;
            console.log(`[Mode] Switching to ${mode}`);
            currentMode = mode;

            if (mode === 'youtube') {
                player.pause();
                customPlayerUI.style.display = 'none';
                if (ytContainer) ytContainer.style.display = 'block';
            } else {
                if (isYtReady) ytPlayer.stopVideo();
                if (ytContainer) ytContainer.style.display = 'none';
                customPlayerUI.style.display = 'block';
            }
        }

        function getAllSongs(category = 'both') {
            const tamil = tamilSelect ? Array.from(tamilSelect.options).map(o => o.value) : [];
            const eng = englishSelect ? Array.from(englishSelect.options).map(o => o.value) : [];
            if (category === 'tamil') return tamil;
            if (category === 'english') return eng;
            return [...tamil, ...eng];
        }

        function setNowPlayingUI(name, isYt = false) {
            const cleanName = isYt ? name : songNameFromPath(name);
            trackTitleEl.textContent = cleanName || 'Nothing Playing';
            if (nowPlayingEl) {
                nowPlayingEl.textContent = `🎶 Now Playing: ${cleanName}`;
            }
        }

        // -------------------------------------------------------
        // YouTube Logic
        // -------------------------------------------------------
        window._ytSyncHandler = (event) => {
            if (suppressEmit || currentMode !== 'youtube' || !isYtReady) return;

            if (event.data === YT.PlayerState.PLAYING) {
                socket.emit('playSong', { 
                    roomId: roomCode, 
                    type: 'youtube', 
                    song: ytPlayer.getVideoData().video_id, 
                    time: ytPlayer.getCurrentTime(), 
                    songName: ytPlayer.getVideoData().title 
                });
            } else if (event.data === YT.PlayerState.PAUSED) {
                socket.emit('pauseSong', { roomId: roomCode, type: 'youtube' });
            }
        };

        // -------------------------------------------------------
        // Local File Sharing
        // -------------------------------------------------------
        const fileInput = document.getElementById("fileInput");
        const playLocalBtn = document.getElementById("playLocalBtn");
        const localStatus = document.getElementById("localStatus");

        if (fileInput && playLocalBtn) {
            playLocalBtn.addEventListener("click", async () => {
                const file = fileInput.files[0];
                if (!file) return;

                localStatus.textContent = "⏳ Sharing...";
                const formData = new FormData();
                formData.append("song", file);

                try {
                    const res = await fetch("/upload", { method: "POST", body: formData });
                    const data = await res.json();
                    if (!data.url) throw new Error("Upload Error");

                    switchMode('audio');
                    suppressEmit = true;
                    player.src = data.url;
                    player.currentTime = 0;
                    await player.play();
                    
                    setNowPlayingUI(data.name || file.name);
                    socket.emit("playSong", { 
                        roomId: roomCode, 
                        type: 'audio', 
                        song: data.url, 
                        time: 0, 
                        songName: data.name || file.name 
                    });
                    
                    localStatus.textContent = "✅ Shared!";
                    suppressEmit = false;
                } catch (err) {
                    localStatus.textContent = "❌ Failed to share.";
                }
            });
        }

        // -------------------------------------------------------
        // Socket Event Handlers
        // -------------------------------------------------------
        socket.on('updateUsers', (users) => {
            if (!userSelect) return;
            userSelect.innerHTML = '';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u; opt.textContent = u; 
                userSelect.appendChild(opt);
            });
        });

        socket.on('playSong', (data) => {
            console.log("[Socket] Play Received:", data);
            suppressEmit = true;
            switchMode(data.type || 'audio');

            if (data.type === 'youtube') {
                if (isYtReady) {
                    const currentId = ytPlayer.getVideoData().video_id;
                    if (currentId !== data.song) {
                        ytPlayer.loadVideoById(data.song, data.time || 0);
                    } else {
                        const diff = Math.abs(ytPlayer.getCurrentTime() - data.time);
                        if (diff > 2) ytPlayer.seekTo(data.time, true);
                        ytPlayer.playVideo();
                    }
                }
                setNowPlayingUI(data.songName || "YouTube Video", true);
                setTimeout(() => { suppressEmit = false; }, 500);
            } else {
                const rel = songPathToRelative(data.song || '');
                if (rel && songPathToRelative(player.src) !== rel) {
                    player.src = rel;
                }
                player.currentTime = typeof data.time === 'number' ? data.time : 0;
                player.play().catch(e => console.warn("Autoplay blocked")).finally(() => {
                    setNowPlayingUI(data.songName || rel);
                    // Update category for next/prev logic
                    if (tamilSelect && Array.from(tamilSelect.options).some(o => o.value === rel)) lastCategory = 'tamil';
                    else if (englishSelect && Array.from(englishSelect.options).some(o => o.value === rel)) lastCategory = 'english';
                    
                    setTimeout(() => { suppressEmit = false; }, 200);
                });
            }
        });

        socket.on('pauseSong', () => {
            suppressEmit = true;
            if (currentMode === 'youtube' && isYtReady) {
                ytPlayer.pauseVideo();
            } else {
                player.pause();
            }
            setTimeout(() => { suppressEmit = false; }, 200);
        });

        socket.on('syncTime', (data) => {
            if (suppressEmit) return;
            if (currentMode === 'youtube' && isYtReady) {
                const diff = Math.abs(ytPlayer.getCurrentTime() - data.time);
                if (diff > 2.5) ytPlayer.seekTo(data.time, true);
            } else if (currentMode === 'audio') {
                const rel = songPathToRelative(data.song || '');
                if (songPathToRelative(player.src) === rel) {
                    const diff = Math.abs(player.currentTime - data.time);
                    if (diff > 1.2) {
                        suppressEmit = true;
                        player.currentTime = data.time;
                        setTimeout(() => { suppressEmit = false; }, 200);
                    }
                }
            }
        });

        // -------------------------------------------------------
        // Audio Element Listeners
        // -------------------------------------------------------
        player.addEventListener('play', () => {
            playPauseBtn.innerHTML = '❚❚';
            if (suppressEmit || currentMode !== 'audio') return;
            const rel = songPathToRelative(player.src);
            socket.emit('playSong', { 
                roomId: roomCode, 
                type: 'audio', 
                song: rel, 
                time: player.currentTime, 
                songName: songNameFromPath(rel) 
            });
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

        player.addEventListener('ended', () => {
            if (currentMode !== 'audio' || suppressEmit) return;
            const all = getAllSongs(lastCategory);
            const currentRel = songPathToRelative(player.src);
            const idx = all.indexOf(currentRel);
            if (idx === -1) return;

            const nextIndex = (idx + 1) % all.length;
            const nextSong = all[nextIndex];
            
            suppressEmit = true;
            player.src = nextSong;
            player.play().catch(() => {}).finally(() => {
                setNowPlayingUI(nextSong);
                socket.emit('playSong', { 
                    roomId: roomCode, 
                    type: 'audio', 
                    song: nextSong, 
                    time: 0, 
                    songName: songNameFromPath(nextSong) 
                });
                setTimeout(() => { suppressEmit = false; }, 200);
            });
        });

        // -------------------------------------------------------
        // UI Controls Interaction
        // -------------------------------------------------------
        playYtBtn.addEventListener('click', () => {
            const videoId = extractVideoId(ytInput.value);
            if (!videoId) return alert("Please enter a valid YouTube URL");
            socket.emit('playSong', { 
                roomId: roomCode, 
                type: 'youtube', 
                song: videoId, 
                time: 0, 
                songName: "YouTube Video" 
            });
            ytInput.value = '';
        });

        playPauseBtn.addEventListener('click', () => {
            if (currentMode === 'youtube' && isYtReady) {
                const state = ytPlayer.getPlayerState();
                state === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
            } else {
                if (!player.src) {
                    const first = getAllSongs()[0];
                    if (first) player.src = first;
                }
                player.paused ? player.play() : player.pause();
            }
        });

        const handleNavigation = (direction) => {
            if (currentMode !== 'audio') return;
            const list = getAllSongs(lastCategory);
            const cur = songPathToRelative(player.src);
            let idx = list.indexOf(cur);
            if (idx === -1) idx = 0;

            const newIdx = direction === 'next' 
                ? (idx + 1) % list.length 
                : (idx - 1 + list.length) % list.length;
            
            const newSong = list[newIdx];
            suppressEmit = true;
            player.src = newSong;
            player.currentTime = 0;
            player.play().catch(() => {}).finally(() => {
                setNowPlayingUI(newSong);
                socket.emit('playSong', { 
                    roomId: roomCode, 
                    type: 'audio', 
                    song: newSong, 
                    time: 0, 
                    songName: songNameFromPath(newSong) 
                });
                setTimeout(() => { suppressEmit = false; }, 200);
            });
        };

        nextBtn.addEventListener('click', () => handleNavigation('next'));
        prevBtn.addEventListener('click', () => handleNavigation('prev'));

        // Seek Logic
        let isSeeking = false;
        function performSeek(e) {
            if (currentMode !== 'audio') return;
            const rect = progress.getBoundingClientRect();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            if (player.duration) {
                player.currentTime = pct * player.duration;
                // Emit immediate sync on seek
                socket.emit('syncTime', { 
                    roomId: roomCode, 
                    type: 'audio', 
                    song: songPathToRelative(player.src), 
                    time: player.currentTime 
                });
            }
        }

        progress.addEventListener('mousedown', (e) => { isSeeking = true; performSeek(e); });
        window.addEventListener('mousemove', (e) => { if (isSeeking) performSeek(e); });
        window.addEventListener('mouseup', () => { isSeeking = false; });

        // Category Selection
        const setupCategoryBtn = (btnId, selectId, category) => {
            const btn = document.getElementById(btnId);
            const sel = document.getElementById(selectId);
            if (!btn || !sel) return;

            btn.addEventListener('click', () => {
                const song = sel.value;
                lastCategory = category;
                switchMode('audio');
                suppressEmit = true;
                player.src = song;
                player.play().catch(() => {}).finally(() => {
                    setNowPlayingUI(song);
                    socket.emit('playSong', { 
                        roomId: roomCode, 
                        type: 'audio', 
                        song: song, 
                        time: 0, 
                        songName: songNameFromPath(song) 
                    });
                    setTimeout(() => { suppressEmit = false; }, 200);
                });
            });
        };

        setupCategoryBtn('playTamilBtn', 'tamilSongs', 'tamil');
        setupCategoryBtn('playEnglishBtn', 'englishSongs', 'english');

        // -------------------------------------------------------
        // Background Sync (Every 3 seconds)
        // -------------------------------------------------------
        setInterval(() => {
            if (suppressEmit) return;
            
            if (currentMode === 'youtube' && isYtReady && ytPlayer.getPlayerState() === 1) {
                socket.emit('syncTime', { 
                    roomId: roomCode, 
                    type: 'youtube', 
                    song: ytPlayer.getVideoData().video_id, 
                    time: ytPlayer.getCurrentTime() 
                });
            } else if (currentMode === 'audio' && !player.paused) {
                socket.emit('syncTime', { 
                    roomId: roomCode, 
                    type: 'audio', 
                    song: songPathToRelative(player.src), 
                    time: player.currentTime 
                });
            }
        }, 3000);

        /**
         * FIX 2: Late Joiner Sync
         * Asks the server for the current room state upon connection.
         */
        socket.emit('requestState', { roomId: roomCode });

        // Debug & Initial UI State
        window.__musicRoom = { socket, player, ytPlayer };
        if (player.src && player.src !== window.location.href) {
            setNowPlayingUI(player.src);
        }
    }

    // Start only on room page
    if (window.location.pathname.includes('room.html')) {
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', initRoom);
        } else {
            initRoom();
        }
    }
})();