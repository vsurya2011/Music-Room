(function () {

  const socket = io();
  const player = document.getElementById("player");
  const roomId = localStorage.getItem("roomId");
  const username = localStorage.getItem("username");

  const playBtn = document.getElementById("playPauseBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const tamilSel = document.getElementById("tamilSongs");
  const engSel = document.getElementById("englishSongs");

  const playTamilBtn = document.getElementById("playTamilBtn");
  const playEnglishBtn = document.getElementById("playEnglishBtn");

  const fileInput = document.getElementById("fileInput");
  const playLocalBtn = document.getElementById("playLocalBtn");

  const titleEl = document.getElementById("trackTitle");

  let playlist = [];
  let index = 0;
  let category = "";
  let suppress = false;

  socket.emit("joinRoom", { roomId, username });

  function buildPlaylist(select) {
    return [...select.options].map(o => o.value);
  }

  function playIndex(i, emit = true) {
    if (!playlist.length) return;
    index = (i + playlist.length) % playlist.length;
    suppress = true;

    player.src = playlist[index];
    player.currentTime = 0;
    player.play();

    titleEl.textContent = playlist[index].split("/").pop();

    setTimeout(() => suppress = false, 200);

    if (emit) {
      socket.emit("playSong", {
        roomId,
        src: player.src,
        playlist,
        index,
        category,
        time: 0
      });
    }
  }

  // ---- Tamil ----
  playTamilBtn.onclick = () => {
    playlist = buildPlaylist(tamilSel);
    category = "tamil";
    index = tamilSel.selectedIndex;
    playIndex(index);
  };

  // ---- English ----
  playEnglishBtn.onclick = () => {
    playlist = buildPlaylist(engSel);
    category = "english";
    index = engSel.selectedIndex;
    playIndex(index);
  };

  // ---- Local File ----
  playLocalBtn.onclick = () => {
    const file = fileInput.files[0];
    if (!file) return alert("Select a file first");

    const reader = new FileReader();
    reader.onload = e => {
      playlist = [e.target.result];
      category = "local";
      playIndex(0);
    };
    reader.readAsDataURL(file);
  };

  // ---- Controls ----
  playBtn.onclick = () => player.paused ? player.play() : player.pause();
  prevBtn.onclick = () => playIndex(index - 1);
  nextBtn.onclick = () => playIndex(index + 1);

  // ---- Sync ----
  socket.on("playSong", data => {
    suppress = true;
    playlist = data.playlist;
    index = data.index;
    category = data.category;

    player.src = data.src;
    player.currentTime = data.time || 0;
    player.play();

    titleEl.textContent = data.src.split("/").pop();
    setTimeout(() => suppress = false, 200);
  });

  socket.on("pauseSong", () => {
    suppress = true;
    player.pause();
    setTimeout(() => suppress = false, 200);
  });

  setInterval(() => {
    if (!player.paused && !suppress) {
      socket.emit("syncTime", {
        roomId,
        time: player.currentTime
      });
    }
  }, 2000);

  socket.on("syncTime", t => {
    if (Math.abs(player.currentTime - t) > 0.5) {
      suppress = true;
      player.currentTime = t;
      setTimeout(() => suppress = false, 200);
    }
  });

})();
