document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE = 'http://localhost:3000/api';
  const token = localStorage.getItem('token');

  // Populate sidebar profile data from authenticated user
  try {
    const profileTitleEl = document.querySelector('.profile-title');
    const profileEmailEl = document.querySelector('.profile-email');
    if (token) {
      const profileResp = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const profileJson = await profileResp.json();
      if (profileResp.ok && profileJson.success) {
        const user = profileJson.data;
        if (profileTitleEl) profileTitleEl.textContent = user.name || 'User';
        if (profileEmailEl) profileEmailEl.textContent = user.email || '';
      } else if (profileResp.status === 401) {
        // not authenticated, clear token
        localStorage.removeItem('token');
        if (profileTitleEl) profileTitleEl.textContent = 'Guest';
        if (profileEmailEl) profileEmailEl.textContent = '';
      }
    } else {
      if (profileTitleEl) profileTitleEl.textContent = 'Guest';
      if (profileEmailEl) profileEmailEl.textContent = '';
    }
  } catch (err) {
    console.error('Failed to load profile for sidebar:', err);
  }

  // Wire logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      window.location.href = 'loginform.html';
    });
  }

  // Show one-time success message if present
  const success = sessionStorage.getItem('bookingSuccess');
  if (success) {
    alert(success);
    sessionStorage.removeItem('bookingSuccess');
  }

  const table = document.querySelector('table');
  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
  }

  if (!token) {
     tbody.innerHTML = '<tr><td colspan="6">Please login to view your bookings.</td></tr>';
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/bookings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await resp.json();
    let bookings = [];
    if (json && json.success && Array.isArray(json.data)) bookings = json.data;
    else if (Array.isArray(json)) bookings = json;

    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No bookings found.</td></tr>';
      return;
    }

      // Clear placeholder rows before populating
      tbody.innerHTML = '';

    bookings.forEach(b => {
      const tr = document.createElement('tr');
      const svc = document.createElement('td');
      svc.textContent = b.SERVICE_NAME || b.service_name || '';
      const date = document.createElement('td');
      date.textContent = new Date(b.BOOKING_DATE || b.booking_date).toLocaleDateString();
      const time = document.createElement('td');
      time.textContent = formatTime(b.BOOKING_TIME || b.booking_time || '');

      // Total amount (prefer service_price or transaction price)
      const total = document.createElement('td');
      const priceVal = parseFloat(b.service_price || b.transaction_price || b.PRICE || 0) || 0;
      total.textContent = `₱${priceVal.toFixed(2)}`;

      const status = document.createElement('td');
      status.className = 'status';
      status.textContent = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();

      const action = document.createElement('td');

      // Only allow cancellation when payment method is CASH (or no payment method recorded)
      const paymentMethod = (b.payment_method || b.PAYMENT_METHOD || '').toUpperCase();
      const canCancel = paymentMethod === '' || paymentMethod === 'CASH';

      if (canCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', async () => {
          if (!confirm('Cancel this booking?')) return;
          try {
            const id = b.BOOKING_ID || b.booking_id;
            const del = await fetch(`${API_BASE}/bookings/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            const resjson = await del.json();
            if (resjson && resjson.success) {
              alert('Booking cancelled');
              tr.remove();
            } else {
              alert('Failed to cancel booking: ' + (resjson.message || 'Unknown'));
            }
          } catch (err) {
            console.error(err);
            alert('Network error');
          }
        });

        action.appendChild(cancelBtn);
      } else {
        action.textContent = '-';
      }
      tr.appendChild(svc);
      tr.appendChild(date);
      tr.appendChild(time);
      tr.appendChild(total);
      tr.appendChild(status);
      tr.appendChild(action);
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5">Failed to load bookings.</td></tr>';
  }
});

// Helper: format time string (HH:MM or HH:MM:SS) to 12-hour AM/PM
function formatTime(timeString) {
  if (!timeString) return '';
  const parts = timeString.split(':');
  if (parts.length < 2) return timeString;
  const hour = parseInt(parts[0], 10);
  const minute = parts[1];
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${meridiem}`;
}