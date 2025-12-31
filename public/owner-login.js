document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('loginBtn');
  const passwordInput = document.getElementById('passwordInput');
  const statusEl = document.getElementById('status');

  // Extract roomId from URL
  const urlParts = window.location.pathname.split('/');
  const roomId = urlParts[urlParts.length - 1];

  loginBtn.addEventListener('click', async () => {
    const password = passwordInput.value.trim();
    if (!password) {
      statusEl.textContent = "❌ Please enter a password";
      return;
    }

    try {
      const res = await fetch('/owner-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, roomId })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('ownerName', 'owner');
        localStorage.setItem('roomId', roomId);
        // Redirect to the room page with owner=true
        window.location.href = `/room/${roomId}?owner=true`;
      } else {
        statusEl.textContent = "❌ Incorrect password";
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = "❌ Server error, try again";
    }
  });
});
