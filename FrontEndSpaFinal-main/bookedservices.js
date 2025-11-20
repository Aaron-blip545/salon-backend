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
    Swal.fire({
      icon: 'success',
      title: 'Success!',
      text: success,
      confirmButtonColor: '#3085d6'
    });
    sessionStorage.removeItem('bookingSuccess');
  }

  const table = document.querySelector('table');
  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
  }

  if (!token) {
     tbody.innerHTML = '<tr><td colspan="7">Please login to view your bookings.</td></tr>';
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

    // Deduplicate by booking ID to avoid multiple rows per booking
    // when there are multiple transactions. Prefer rows with staff_name
    // and more specific payment_status (e.g. PARTIAL_PENDING over PENDING).
    const byBookingId = new Map();
    allBookings.forEach((b) => {
      const id = b.BOOKING_ID || b.booking_id;
      if (!id) {
        // keep rows without id as-is
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

      // Prefer row with staff name over one without
      if (!existingStaff && newStaff) {
        useNew = true;
      }

      // Prefer more advanced payment status
      const rankStatus = (s) => {
        if (!s) return 0; // unknown / empty
        if (s === 'APPROVED' || s === 'PAID' || s === 'FULLY_PAID') return 3;
        if (s.includes('PARTIAL')) return 2; // PARTIAL_PENDING, PARTIAL_PAID, etc.
        if (s === 'PENDING') return 1;
        return 0;
      };
      const existingRank = rankStatus(existingStatus);
      const newRank = rankStatus(newStatus);
      if (!useNew && newRank > existingRank) {
        useNew = true;
      }

      if (useNew) {
        byBookingId.set(id, b);
      }
    });

    allBookings = Array.from(byBookingId.values());

    // Additional deduplication by logical slot (service + date + time)
    // in case multiple booking records exist for the same appointment.
    const bySlotKey = new Map();
    allBookings.forEach((b) => {
      const svcName = (b.SERVICE_NAME || b.service_name || '').trim();
      const dateVal = (b.BOOKING_DATE || b.booking_date || '').toString();
      const timeVal = (b.BOOKING_TIME || b.booking_time || '').toString();
      const key = `${svcName}|${dateVal}|${timeVal}`;

      const existing = bySlotKey.get(key);
      if (!existing) {
        bySlotKey.set(key, b);
        return;
      }

      const existingStatus = (existing.payment_status || existing.PAYMENT_STATUS || '').toUpperCase();
      const newStatus = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();

      const existingStaff = (existing.staff_name || '').trim();
      const newStaff = (b.staff_name || '').trim();

      let useNew = false;

      // Prefer row with staff name over one without
      if (!existingStaff && newStaff) {
        useNew = true;
      }

      // Prefer more advanced payment status (same priority as above)
      const rankStatus = (s) => {
        if (!s) return 0;
        if (s === 'APPROVED' || s === 'PAID' || s === 'FULLY_PAID') return 3;
        if (s.includes('PARTIAL')) return 2;
        if (s === 'PENDING') return 1;
        return 0;
      };
      const existingRank = rankStatus(existingStatus);
      const newRank = rankStatus(newStatus);
      if (!useNew && newRank > existingRank) {
        useNew = true;
      }

      if (useNew) {
        bySlotKey.set(key, b);
      }
    });

    allBookings = Array.from(bySlotKey.values());

    // Debug: see what API actually returns
    console.log('Bookings API raw response:', json);
    console.log('Normalized bookings array:', allBookings);

    const searchInput = document.getElementById('booking-search');

    function isPendingBooking(b) {
      const bookingStatusRaw = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();
      const serviceStatusRaw = (b.service_status || b.SERVICE_STATUS || '').toUpperCase();

      // Treat a booking as cancelled/completed for Appointments if either
      // the booking status or the service status says so.
      const isCancelled =
        bookingStatusRaw === 'CANCELLED' ||
        bookingStatusRaw === 'CANCELED' ||
        serviceStatusRaw === 'CANCELLED' ||
        serviceStatusRaw === 'CANCELED';

      const isCompleted =
        bookingStatusRaw === 'COMPLETED' ||
        serviceStatusRaw === 'COMPLETED';

      return !isCancelled && !isCompleted;
    }

    function renderBookings(filterText = '') {
      if (!allBookings.length) {
        tbody.innerHTML = '<tr><td colspan="9">No bookings found.</td></tr>';
        return;
      }

      const term = filterText.trim().toLowerCase();

      let filtered = allBookings.filter(isPendingBooking);

      filtered = filtered.filter((b) => {
        if (!term) return true;

        const svc = (b.SERVICE_NAME || b.service_name || '').toString().toLowerCase();
        const staff = (b.staff_name || '').toString().toLowerCase();
        const dateStr = new Date(b.BOOKING_DATE || b.booking_date).toLocaleDateString().toLowerCase();
        const bookingStatus = (b.booking_status || b.STATUS_NAME || b.status_name || '').toLowerCase();
        const paymentStatus = (b.payment_status || b.PAYMENT_STATUS || '').toLowerCase();
        return (
          svc.includes(term) ||
          staff.includes(term) ||
          dateStr.includes(term) ||
          bookingStatus.includes(term) ||
          paymentStatus.includes(term)
        );
      });

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9">No bookings found.</td></tr>';
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

        // TIME column: show range based on service duration, e.g. 9:00 AM - 9:30 AM
        const time = document.createElement('td');
        const rawStartTime = (b.BOOKING_TIME || b.booking_time || '').toString();
        const durationMinutes = getDurationMinutes(b.service_duration || b.DURATION);
        const rawEndTime = addMinutesToTime(rawStartTime, durationMinutes);
        time.textContent = `${formatTime(rawStartTime)} - ${formatTime(rawEndTime)}`;

        // Total amount
        const total = document.createElement('td');
        const servicePriceVal = parseFloat(b.service_price || b.PRICE || 0) || 0;
        const bookingFeeVal = parseFloat(b.booking_fee || b.BOOKING_FEE || 0) || 0;
        const totalVal = servicePriceVal + bookingFeeVal;
        const displayTotal = totalVal > 0 ? totalVal : (parseFloat(b.transaction_price || 0) || 0);
        total.textContent = `₱${displayTotal.toFixed(2)}`;

        // Remaining balance
        const remainingTd = document.createElement('td');
        const remainingVal = parseFloat(b.remaining_balance || b.REMAINING_BALANCE || 0) || 0;
        remainingTd.textContent = remainingVal > 0 ? `₱${remainingVal.toFixed(2)}` : '₱0.00';

        const bookingStatusRaw = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();
        const serviceStatusRaw = (b.service_status || b.SERVICE_STATUS || '').toUpperCase();
        const paymentStatusRaw = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();

        // Service status label
        let serviceLabel = '-';
        let statusForService = serviceStatusRaw || bookingStatusRaw;
        // If booking_status itself is completed/cancelled, treat that as final
        if (
          bookingStatusRaw === 'COMPLETED' ||
          bookingStatusRaw === 'CANCELLED' ||
          bookingStatusRaw === 'CANCELED'
        ) {
          statusForService = bookingStatusRaw;
        }

        if (statusForService === 'PENDING' || statusForService === 'PENDING_PAYMENT') {
          serviceLabel = 'Pending';
        } else if (statusForService === 'CONFIRMED') {
          serviceLabel = 'Waiting';
        } else if (statusForService === 'ARRIVED' || statusForService === 'IN_PROGRESS') {
          serviceLabel = 'In Progress';
        } else if (statusForService === 'COMPLETED') {
          serviceLabel = 'Completed';
        } else if (statusForService === 'CANCELLED' || statusForService === 'CANCELED') {
          serviceLabel = 'Cancelled';
        }

        const serviceStatusTd = document.createElement('td');
        serviceStatusTd.textContent = serviceLabel;

        // Payment status label
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
        paymentStatusTd.className = `status-badge status-badge--payment status-badge--${paymentKey}`;

        const action = document.createElement('td');

        const isCancelled = bookingStatusRaw === 'CANCELLED' || bookingStatusRaw === 'CANCELED';
        const isCompleted = bookingStatusRaw === 'COMPLETED';
        const isPaid =
          paymentStatusRaw === 'APPROVED' || paymentStatusRaw === 'PAID' || paymentStatusRaw === 'FULLY_PAID';

        // User can cancel ONLY while booking is still pending (or pending payment)
        // and payment has not been fully approved/paid yet.
        const isPendingLike = bookingStatusRaw === 'PENDING' || bookingStatusRaw === 'PENDING_PAYMENT';
        const canCancel = isPendingLike && !isCancelled && !isCompleted && !isPaid;

        if (canCancel) {
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'cancel-btn';
          cancelBtn.textContent = 'Cancel';

          cancelBtn.addEventListener('click', async () => {
            const result = await Swal.fire({
              title: 'Cancel Booking?',
              text: 'Are you sure you want to cancel this booking?',
              icon: 'warning',
              showCancelButton: true,
              confirmButtonColor: '#d33',
              cancelButtonColor: '#3085d6',
              confirmButtonText: 'Yes, cancel it!',
              cancelButtonText: 'No, keep it'
            });

            if (!result.isConfirmed) return;

            try {
              const id = b.BOOKING_ID || b.booking_id;

              cancelBtn.disabled = true;
              cancelBtn.textContent = 'Cancelling...';

              const del = await fetch(`${API_BASE}/bookings/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const resjson = await del.json();
              if (resjson && resjson.success) {
                serviceStatusTd.textContent = 'Cancelled';
                paymentStatusTd.textContent = 'Cancelled';
                paymentStatusTd.className = 'status-badge status-badge--payment status-badge--cancelled';
                action.textContent = '-';

                Swal.fire({
                  icon: 'success',
                  title: 'Cancelled!',
                  text: 'Booking cancelled successfully!',
                  confirmButtonColor: '#3085d6'
                });
              } else {
                Swal.fire({
                  icon: 'error',
                  title: 'Error',
                  text: 'Failed to cancel booking: ' + (resjson.message || 'Unknown error'),
                  confirmButtonColor: '#d33'
                });
                cancelBtn.disabled = false;
                cancelBtn.textContent = 'Cancel';
              }
            } catch (err) {
              console.error(err);
              Swal.fire({
                icon: 'error',
                title: 'Network Error',
                text: 'Network error. Please try again.',
                confirmButtonColor: '#d33'
              });
              cancelBtn.disabled = false;
              cancelBtn.textContent = 'Cancel';
            }
          });

          action.appendChild(cancelBtn);
        } else {
          action.textContent = '-';
        }

        tr.appendChild(svc);
        tr.appendChild(staffTd);
        tr.appendChild(date);
        tr.appendChild(time);
        tr.appendChild(total);
        tr.appendChild(remainingTd);
        tr.appendChild(serviceStatusTd);
        tr.appendChild(paymentStatusTd);
        tr.appendChild(action);
        tbody.appendChild(tr);
      });
    }

    // Initial render (pending bookings)
    renderBookings('');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderBookings(e.target.value || '');
      });
    }

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7">Failed to load bookings.</td></tr>';
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

// Parse service duration into minutes.
// Supports DB time format (HH:MM:SS), "60 min", "30 mins", "1 hr", "2 hours", or plain numbers.
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