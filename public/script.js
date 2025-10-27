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

  document.getElementById("roomCode").innerText = roomCode;
  socket.emit("joinRoom", { roomId: roomCode, username });

  const userList = document.getElementById("userList");

  // Update user list when server sends updates
  socket.on("updateUsers", (users) => {
    userList.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = u;
      userList.appendChild(li);
    });
  });

  // Function to play a song
  window.changeSong = function (type) {
    let song;
    if (type === "tamil") {
      song = document.getElementById("tamilSongs").value;
    } else {
      song = document.getElementById("englishSongs").value;
    }

    player.src = song;
    player.currentTime = 0;
    player.play();

    socket.emit("playSong", { roomId: roomCode, song, time: 0 });
  };

  // Emit play/pause events
  player.onplay = () => {
    socket.emit("playSong", { roomId: roomCode, song: player.src, time: player.currentTime });
  };

  player.onpause = () => {
    socket.emit("pauseSong", { roomId: roomCode });
  };

  // Autoplay next song when current ends
  player.onended = () => {
    const allSongs = [
      ...Array.from(document.getElementById("tamilSongs").options).map(o => o.value),
      ...Array.from(document.getElementById("englishSongs").options).map(o => o.value)
    ];
    const currentIndex = allSongs.indexOf(player.src.split("/").slice(-2).join("/"));
    const nextIndex = (currentIndex + 1) % allSongs.length;
    const nextSong = allSongs[nextIndex];
    player.src = nextSong;
    player.play();
    socket.emit("playSong", { roomId: roomCode, song: nextSong, time: 0 });
  };

  // Sync updates from others
  socket.on("playSong", (data) => {
    if (data.song && player.src !== location.origin + "/" + data.song) {
      player.src = data.song;
    }
    player.currentTime = data.time || 0;
    player.play().catch(err => console.log("Autoplay blocked:", err));
  });

  socket.on("pauseSong", () => {
    player.pause();
  });

  socket.on("syncTime", (data) => {
    if (player.src.endsWith(data.song)) {
      const diff = Math.abs(player.currentTime - data.time);
      if (diff > 0.5) player.currentTime = data.time;
    }
  });
}

// Initialize if on room.html
if (window.location.pathname.endsWith("room.html")) {
  window.onload = initRoom;
}
