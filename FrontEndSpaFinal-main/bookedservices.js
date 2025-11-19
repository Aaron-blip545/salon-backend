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

      // Prefer more specific payment status (e.g. PARTIAL_*, APPROVED over plain PENDING)
      const isExistingPendingOnly = existingStatus === 'PENDING';
      const isNewMoreSpecific =
        newStatus.includes('PARTIAL') || newStatus === 'APPROVED' || newStatus === 'FULLY_PAID';
      if (!useNew && isExistingPendingOnly && isNewMoreSpecific) {
        useNew = true;
      }

      if (useNew) {
        byBookingId.set(id, b);
      }
    });

    allBookings = Array.from(byBookingId.values());

    // Debug: see what API actually returns
    console.log('Bookings API raw response:', json);
    console.log('Normalized bookings array:', allBookings);

    const searchInput = document.getElementById('booking-search');

    function isPendingBooking(b) {
      const bookingStatus = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();
      const paymentStatus = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();
      // Only show bookings that already have a payment_status entry
      if (!paymentStatus) return false;

      // Treat bookings as active unless they are explicitly CANCELLED or COMPLETED
      const isBookingActive = bookingStatus !== 'CANCELLED' && bookingStatus !== 'COMPLETED';
      // Pending-like payment statuses (e.g. PARTIAL_PENDING, PENDING, PARTIAL_PAID)
      const isPaymentPending = paymentStatus.includes('PENDING') || paymentStatus === 'PARTIAL_PAID';
      return isBookingActive && isPaymentPending;
    }

    function renderBookings(filterText = '') {
      if (!allBookings.length) {
        tbody.innerHTML = '<tr><td colspan="9">No bookings found.</td></tr>';
        return;
      }

      const term = filterText.trim().toLowerCase();

      let filtered = allBookings.filter(isPendingBooking);

      // If pending-filter removed everything but we do have bookings,
      // fall back to showing all so the user sees their data.
      if (!filtered.length && allBookings.length) {
        console.warn('No bookings matched pending filter; falling back to all bookings.');
        filtered = allBookings.slice();
      }

      filtered = filtered.filter((b) => {
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
        const time = document.createElement('td');
        time.textContent = formatTime(b.BOOKING_TIME || b.booking_time || '');

        // Total amount (prefer service_price or transaction price)
        const total = document.createElement('td');
        const priceVal = parseFloat(b.service_price || b.transaction_price || b.PRICE || 0) || 0;
        total.textContent = `₱${priceVal.toFixed(2)}`;

        // Remaining balance (for down payment / partial payments)
        const remainingTd = document.createElement('td');
        const remainingVal = parseFloat(b.remaining_balance || b.REMAINING_BALANCE || 0) || 0;
        remainingTd.textContent = remainingVal > 0 ? `₱${remainingVal.toFixed(2)}` : '₱0.00';

        const bookingStatusRaw = (b.booking_status || b.STATUS_NAME || b.status_name || '').toUpperCase();
        const paymentStatusRaw = (b.payment_status || b.PAYMENT_STATUS || '').toUpperCase();

        // SERVICE column: show simple text only (no badge) so the UI is cleaner.
        let serviceLabel = '-';
        if (bookingStatusRaw === 'PENDING') {
          serviceLabel = 'Pending';
        } else if (bookingStatusRaw === 'IN_PROGRESS') {
          serviceLabel = 'In Progress';
        } else if (bookingStatusRaw === 'COMPLETED') {
          serviceLabel = 'Completed';
        } else if (bookingStatusRaw === 'CANCELLED') {
          serviceLabel = 'Cancelled';
        }

        const serviceStatusTd = document.createElement('td');
        serviceStatusTd.textContent = serviceLabel;
        serviceStatusTd.className = '';

        // PAYMENT STATUS column: keep badge and distinguish partial payments.
        let paymentLabel = 'Pending';
        let paymentKey = 'pending';
        if (paymentStatusRaw === 'APPROVED' || paymentStatusRaw === 'PAID' || paymentStatusRaw === 'FULLY_PAID') {
          paymentLabel = 'Approved';
          paymentKey = 'approved';
        } else if (paymentStatusRaw.includes('PARTIAL')) {
          // e.g. PARTIAL_PENDING, PARTIAL_PAID, etc.
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

        // Allow cancellation for all bookings except already CANCELLED or COMPLETED
        const canCancel = bookingStatusRaw !== 'CANCELLED' && bookingStatusRaw !== 'COMPLETED';

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
              
              // Disable button and show loading state
              cancelBtn.disabled = true;
              cancelBtn.textContent = 'Cancelling...';
              
              const del = await fetch(`${API_BASE}/bookings/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
              const resjson = await del.json();
              if (resjson && resjson.success) {
                // Update service status column
                serviceStatusTd.textContent = 'Cancelled';
                serviceStatusTd.className = '';

                // Update payment status column to Cancelled as well
                paymentStatusTd.textContent = 'Cancelled';
                paymentStatusTd.className = 'status-badge status-badge--payment status-badge--cancelled';

                // Remove the cancel button and replace with dash
                action.innerHTML = '';
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
                // Re-enable button if failed
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
              // Re-enable button if error
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