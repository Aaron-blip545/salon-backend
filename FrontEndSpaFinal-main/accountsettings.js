document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'loginform.html';
    return;
  }

  const API_BASE = 'http://localhost:3000/api';

  const usernameEl = document.getElementById('display-name');
  const emailEl = document.getElementById('email');
  const phoneEl = document.getElementById('phone');
  const logoutBtn = document.getElementById('logoutBtn');
  const cancelBtn = document.querySelector('.btn-cancel');
  const saveBtn = document.querySelector('.btn-save');

  // Load profile
  try {
    const resp = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await resp.json();
    if (resp.ok && data.success) {
      const user = data.data;
      usernameEl.value = user.name || '';
      emailEl.value = user.email || '';
      phoneEl.value = user.phone || '';
      // also update sidebar
      const title = document.querySelector('.profile-title');
      const emailText = document.querySelector('.profile-email');
      if (title) title.textContent = user.name || 'User';
      if (emailText) emailText.textContent = user.email || '';
    } else {
      console.error('Failed to load profile', data);
      if (resp.status === 401) window.location.href = 'loginform.html';
    }
  } catch (err) {
    console.error(err);
    alert('Could not load profile. Please try again later.');
  }

  logoutBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    window.location.href = 'loginform.html';
  });

  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    // reload values from server
    window.location.reload();
  });

  saveBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const payload = {
      name: usernameEl.value.trim(),
      email_address: emailEl.value.trim(),
      phone: phoneEl.value.trim()
    };

    try {
      const resp = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (resp.ok && data.success) {
        alert('Profile updated');
        // update display
        const title = document.querySelector('.profile-title');
        const emailText = document.querySelector('.profile-email');
        if (title) title.textContent = data.data.name || 'User';
        if (emailText) emailText.textContent = data.data.email || '';
      } else {
        alert('Failed to update profile: ' + (data.message || 'Unknown'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
    }
  });
});
