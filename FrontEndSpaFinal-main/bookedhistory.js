const API_BASE = 'http://localhost:3000/api';

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

// Parse service duration into minutes (same logic as bookedservices.js)
function getDurationMinutes(rawDuration) {
  if (!rawDuration) return 60;
  const rawStr = String(rawDuration).trim();

  // If looks like time HH:MM or HH:MM:SS
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(rawStr)) {
    const parts = rawStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  const match = rawStr.match(/(\d+)/);
  if (!match) return 60;

  const num = parseInt(match[1], 10) || 60;
  if (/hour|hr/i.test(rawStr)) {
    return num * 60;
  }
  if (!/min/i.test(rawStr) && num <= 12) {
    // small integer without 'min' => assume hours
    return num * 60;
  }
  return num; // treat as minutes
}

// Add minutes to a HH:MM or HH:MM:SS time string and return HH:MM.
function addMinutesToTime(timeString, minutesToAdd) {
  if (!timeString) return '';
  const parts = timeString.split(':');
  if (parts.length < 2) return timeString;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  let totalMinutes = h * 60 + m + (minutesToAdd || 0);
  if (totalMinutes < 0) totalMinutes = 0;
  const endHour = Math.floor(totalMinutes / 60);
  const endMin = totalMinutes % 60;
  const hh = String(endHour).padStart(2, '0');
  const mm = String(endMin).padStart(2, '0');
  return `${hh}:${mm}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const table = document.querySelector('table');
  let tbody = document.getElementById('history-tbody') || table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    tbody.id = 'history-tbody';
    table.appendChild(tbody);
  }

  // Sidebar profile + logout
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
      }
    } else {
      if (profileTitleEl) profileTitleEl.textContent = 'Guest';
      if (profileEmailEl) profileEmailEl.textContent = '';
    }
  } catch (e) {
    console.error('Failed to load profile for sidebar:', e);
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      window.location.href = 'loginform.html';
    });
  }

  if (!token) {
    tbody.innerHTML = '<tr><td colspan="9">Please login to view your booked history.</td></tr>';
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/bookings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await resp.json();
    let allBookings = [];
    if (json && json.success && Array.isArray(json.data)) allBookings = json.data;
    else if (Array.isArray(json)) allBookings = json;

    // Deduplicate by booking ID similar to bookedservices
    const byBookingId = new Map();
    allBookings.forEach((b) => {
      const id = b.BOOKING_ID || b.booking_id;
      if (!id) {
        const tempId = `noid-${Math.random()}`;
        byBookingId.set(tempId, b);
        return;
      }
      const existing = byBookingId.get(id);
      if (!existing) {
        byBookingId.set(id, b);
        return;
      }
      const existingStatus = (existing.payment_status || existing.PAYMENT_STATUS || '').toUpperCase();
      const newStatus = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();
      const existingStaff = (existing.staff_name || '').trim();
      const newStaff = (b.staff_name || '').trim();
      let useNew = false;
      if (!existingStaff && newStaff) useNew = true;
      const isExistingPendingOnly = existingStatus === 'PENDING';
      const isNewMoreSpecific =
        newStatus.includes('PARTIAL') || newStatus === 'APPROVED' || newStatus === 'FULLY_PAID';
      if (!useNew && isExistingPendingOnly && isNewMoreSpecific) useNew = true;
      if (useNew) byBookingId.set(id, b);
    });
    allBookings = Array.from(byBookingId.values());

    const searchInput = document.getElementById('history-search');

    function shouldIncludeInHistory(b) {
      const bookingStatus = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();
      const paymentStatus = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();

      // Booking-level decisions
      const isCompleted  = bookingStatus === 'COMPLETED' || bookingStatus === 'CONFIRMED';
      const isCancelled  = bookingStatus === 'CANCELLED' || bookingStatus === 'CANCELED';

      // Payment-level decisions
      const isApproved   = paymentStatus === 'APPROVED' || paymentStatus === 'PAID' || paymentStatus === 'FULLY_PAID';
      const isRejected   = paymentStatus === 'REJECTED' || paymentStatus === 'FAILED';

      // Include only when something final has happened
      return isCompleted || isCancelled || isApproved || isRejected;
    }

    function renderHistory(filterText = '') {
      if (!allBookings.length) {
        tbody.innerHTML = '<tr><td colspan="9">No booking history found.</td></tr>';
        return;
      }

      const term = filterText.trim().toLowerCase();
      const filtered = allBookings.filter((b) => {
        // Only include bookings that are finished/approved/cancelled/rejected
        if (!shouldIncludeInHistory(b)) return false;

        if (!term) return true;
        const svc = (b.SERVICE_NAME || b.service_name || '').toString().toLowerCase();
        const staff = (b.staff_name || '').toString().toLowerCase();
        const dateStr = new Date(b.BOOKING_DATE || b.booking_date).toLocaleDateString().toLowerCase();
        const bookingStatus = (b.booking_status || b.STATUS_NAME || b.status_name || '').toLowerCase();
        const paymentStatus = (b.payment_status || '').toLowerCase();
        return (
          svc.includes(term) ||
          staff.includes(term) ||
          dateStr.includes(term) ||
          bookingStatus.includes(term) ||
          paymentStatus.includes(term)
        );
      });

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9">No matching history.</td></tr>';
        return;
      }

      tbody.innerHTML = '';

      filtered.forEach((b) => {
        const tr = document.createElement('tr');

        const svc = document.createElement('td');
        svc.textContent = b.SERVICE_NAME || b.service_name || '';

        const staffTd = document.createElement('td');
        staffTd.textContent = b.staff_name || '-';

        const date = document.createElement('td');
        date.textContent = new Date(b.BOOKING_DATE || b.booking_date).toLocaleDateString();

        const time = document.createElement('td');
        const rawStartTime = (b.BOOKING_TIME || b.booking_time || '').toString();
        const durationMinutes = getDurationMinutes(b.service_duration || b.DURATION);
        const rawEndTime = addMinutesToTime(rawStartTime, durationMinutes);
        time.textContent = `${formatTime(rawStartTime)} - ${formatTime(rawEndTime)}`;

        const total = document.createElement('td');
        const servicePriceVal = parseFloat(b.service_price || b.PRICE || 0) || 0;
        const bookingFeeVal = parseFloat(b.booking_fee || b.BOOKING_FEE || 0) || 0;
        const totalVal = servicePriceVal + bookingFeeVal;
        const displayTotal = totalVal > 0 ? totalVal : (parseFloat(b.transaction_price || 0) || 0);
        total.textContent = `₱${displayTotal.toFixed(2)}`;

        const remainingTd = document.createElement('td');
        const remainingVal = parseFloat(b.remaining_balance || b.REMAINING_BALANCE || 0) || 0;
        remainingTd.textContent = remainingVal > 0 ? `₱${remainingVal.toFixed(2)}` : '₱0.00';

        const bookingStatusRaw = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();
        const serviceStatusRaw = (b.service_status || b.SERVICE_STATUS || '').toUpperCase();
        const paymentStatusRaw = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();

        const serviceStatusTd = document.createElement('td');
        let serviceLabel = '-';
        let statusForService = serviceStatusRaw || bookingStatusRaw;
        // If booking_status is completed/cancelled, treat that as final state
        if (
          bookingStatusRaw === 'COMPLETED' ||
          bookingStatusRaw === 'CANCELLED' ||
          bookingStatusRaw === 'CANCELED'
        ) {
          statusForService = bookingStatusRaw;
        }
        if (statusForService === 'PENDING' || statusForService === 'PENDING_PAYMENT') {
          serviceLabel = 'Pending';
        } else if (statusForService === 'WAITING' || statusForService === 'CONFIRMED') {
          serviceLabel = 'Waiting';
        } else if (statusForService === 'ARRIVED' || statusForService === 'IN_PROGRESS') {
          serviceLabel = 'In Progress';
        } else if (statusForService === 'COMPLETED') {
          serviceLabel = 'Completed';
        } else if (statusForService === 'CANCELLED' || statusForService === 'CANCELED') {
          serviceLabel = 'Cancelled';
        }
        serviceStatusTd.textContent = serviceLabel;

        let paymentLabel = 'Pending';
        let paymentKey = 'pending';
        const isFullyCleared = remainingVal <= 0;

        if (
          isFullyCleared &&
          (paymentStatusRaw.includes('PARTIAL') || !paymentStatusRaw || paymentStatusRaw.includes('PENDING'))
        ) {
          paymentLabel = 'Approved';
          paymentKey = 'approved';
        } else if (paymentStatusRaw === 'APPROVED' || paymentStatusRaw === 'PAID' || paymentStatusRaw === 'FULLY_PAID') {
          paymentLabel = 'Approved';
          paymentKey = 'approved';
        } else if (paymentStatusRaw.includes('PARTIAL')) {
          paymentLabel = 'Partial Pending';
          paymentKey = 'partial';
        } else if (!paymentStatusRaw || paymentStatusRaw.includes('PENDING')) {
          paymentLabel = 'Pending';
          paymentKey = 'pending';
        } else if (paymentStatusRaw === 'REJECTED' || paymentStatusRaw === 'FAILED') {
          paymentLabel = 'Rejected';
          paymentKey = 'rejected';
        }

        const paymentStatusTd = document.createElement('td');
        paymentStatusTd.textContent = paymentLabel;
        if (paymentKey) {
          paymentStatusTd.className = `status-badge status-badge--payment status-badge--${paymentKey}`;
        }

        const actionTd = document.createElement('td');
        // History is read-only: no actions, show dash
        actionTd.textContent = '-';

        tr.appendChild(svc);
        tr.appendChild(staffTd);
        tr.appendChild(date);
        tr.appendChild(time);
        tr.appendChild(total);
        tr.appendChild(remainingTd);
        tr.appendChild(serviceStatusTd);
        tr.appendChild(paymentStatusTd);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
      });
    }

    renderHistory('');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderHistory(e.target.value || '');
      });
    }
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="9">Failed to load booking history.</td></tr>';
  }
});
