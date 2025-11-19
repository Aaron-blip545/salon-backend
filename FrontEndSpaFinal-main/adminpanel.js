// adminpanel.js - handles theme, API data fetching, table rendering, chart, and real-time updates
(function(){
  const root = document.documentElement;
  const app = document.getElementById('app');
  let appointments = [];
  let refreshInterval = null;
  
  // Ensure only authenticated admins can view this page. If not, clear auth and redirect to login.
  function ensureAdminAccess(){
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
    const role = (localStorage.getItem('role') || '').toString().toLowerCase();
    if(!token || role !== 'admin'){
      // clear any leftover auth and send to login (use replace to avoid polluting history)
      ['token','authToken','jwt','role'].forEach(k=>localStorage.removeItem(k));
      window.location.replace('loginform.html');
      return false;
    }
    return true;
  }
  // Run guard immediately (prevents rendering when using back button / cached pages)
  ensureAdminAccess();
  // Also re-run when page is shown (handles bfcache/back-forward navigation)
  window.addEventListener('pageshow', (evt)=>{ if(evt.persisted) ensureAdminAccess(); });
  
  const themeToggle = document.getElementById('themeToggle');
  const appointmentsTableBody = document.querySelector('#appointmentsTable tbody');
  const totalBookingsEl = document.getElementById('totalBookings');
  const revenueEl = document.getElementById('revenue');
  const activeClientsEl = document.getElementById('activeClients');
  const newClientsEl = document.getElementById('newClients');

  // Simple theme handling (persist in localStorage)
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);

  themeToggle.addEventListener('click', ()=>{
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
  });

  function setTheme(t){
    if(t === 'dark'){
      document.documentElement.setAttribute('data-theme','dark');
      themeToggle.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggle.textContent = '🌙';
    }
  }

  // Load Dashboard Section - shows summary cards + recent 10 bookings (read-only)
  function loadDashboardSection() {
    updateSummaryCards();
    
    const tableBody = document.querySelector('#dashboardAppointmentsTable tbody');
    if (!tableBody) return;
    
    // Show only recent 10 bookings
    const recentBookings = appointments.slice(0, 10);
    
    if (recentBookings.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--muted);">No recent bookings</td></tr>';
      return;
    }
    
    tableBody.innerHTML = recentBookings.map(appt => {
      const statusClass = (appt.status || 'pending').toLowerCase();
      const statusText = capitalizeFirst(appt.status || 'pending');
      const paymentMethodLabel = appt.paymentMethod
        ? (String(appt.paymentMethod).toUpperCase() === 'GCASH'
            ? 'GCash'
            : capitalizeFirst(String(appt.paymentMethod).toLowerCase()))
        : '—';
      
      // Service status badge
      const serviceStatus = appt.serviceStatus || appt.service_status || 'waiting';
      let serviceStatusBadge = '';
      switch(serviceStatus) {
        case 'waiting':
          serviceStatusBadge = '<span class="service-badge waiting">⏱️ Waiting</span>';
          break;
        case 'arrived':
          serviceStatusBadge = '<span class="service-badge arrived">👤 Arrived</span>';
          break;
        case 'in-progress':
          serviceStatusBadge = '<span class="service-badge in-progress">🔄 In Progress</span>';
          break;
        case 'completed':
          serviceStatusBadge = '<span class="service-badge completed">✅ Completed</span>';
          break;
        default:
          serviceStatusBadge = '<span class="service-badge waiting">⏱️ Waiting</span>';
      }
      
      return `
        <tr>
          <td>${escapeHtml(appt.client)}</td>
          <td>${escapeHtml(appt.service)}</td>
          <td>${escapeHtml(formatDate(appt.date))}</td>
          <td>${escapeHtml(formatTime(appt.time))}</td>
          <td>${escapeHtml(appt.staff)}</td>
          <td><span class="badge badge-${statusClass}">${statusText}</span></td>
          <td>${serviceStatusBadge}</td>
          <td><span class="badge badge-${paymentMethodLabel.toLowerCase().replace(' ', '-')}">${paymentMethodLabel}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderAppointments(){
    appointmentsTableBody.innerHTML = '';

    // Toggle empty state vs table
    const emptyState = document.getElementById('emptyState');
    const tableWrap = document.getElementById('tableWrap');

    if(!appointments || appointments.length === 0){
      emptyState.classList.remove('hidden');
      tableWrap.classList.add('hidden');
    } else {
      emptyState.classList.add('hidden');
      tableWrap.classList.remove('hidden');

      appointments.forEach(appt => {
        const tr = document.createElement('tr');
        const statusClass = (appt.status || 'pending').toLowerCase();
        const statusText = capitalizeFirst(appt.status || 'pending');

        const paymentMethodLabel = appt.paymentMethod
          ? (String(appt.paymentMethod).toUpperCase() === 'GCASH'
              ? 'GCash'
              : capitalizeFirst(String(appt.paymentMethod).toLowerCase()))
          : '—';

        const paymentMethodRaw = (appt.paymentMethod || '').toString().toLowerCase();
        let paymentProofHtml = '<span class="muted" style="font-size:12px;">No proof</span>';

        if (paymentMethodRaw === 'cash') {
          paymentProofHtml = '<span class="muted" style="font-size:12px;">Not required</span>';
        } else if (appt.paymentMethod && paymentMethodRaw !== 'cash' && appt.receiptImage) {
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          const borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
          paymentProofHtml = `
            <a href="${appt.receiptImage}" target="_blank">
              <img src="${appt.receiptImage}"
                   alt="Receipt"
                   style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid ${borderColor};" />
            </a>`;
        }
        
        // Determine if actions should be shown
        const isConfirmed = appt.status === 'confirmed';
        const isCanceled = appt.status === 'canceled';
        const showActions = !isConfirmed && !isCanceled;
        
        // Service completion status
        const serviceStatus = appt.serviceStatus || appt.service_status || 'waiting'; // waiting, arrived, in-progress, completed
        let serviceStatusBadge = '';
        let serviceStatusActions = '';
        
        switch(serviceStatus) {
          case 'waiting':
            serviceStatusBadge = '<span class="service-badge waiting">⏱️ Waiting</span>';
            if (isConfirmed && !isCanceled) {
              serviceStatusActions = `<button class="status-action-btn arrived-btn" onclick="markAsArrived(${appt.id})">✓ Mark Arrived</button>`;
            }
            break;
          case 'arrived':
            serviceStatusBadge = '<span class="service-badge arrived">👤 Client Arrived</span>';
            serviceStatusActions = `<button class="status-action-btn complete-btn" onclick="markAsCompleted(${appt.id})">✓ Mark Completed</button>`;
            break;
          case 'in-progress':
            serviceStatusBadge = '<span class="service-badge in-progress">🔄 In Progress</span>';
            serviceStatusActions = `<button class="status-action-btn complete-btn" onclick="markAsCompleted(${appt.id})">✓ Mark Completed</button>`;
            break;
          case 'completed':
            serviceStatusBadge = '<span class="service-badge completed">✅ Completed</span>';
            break;
          default:
            serviceStatusBadge = '<span class="service-badge waiting">⏱️ Waiting</span>';
        }
        
        tr.innerHTML = `
          <td>${escapeHtml(appt.client)}</td>
          <td>${escapeHtml(appt.service)}</td>
          <td>${escapeHtml(formatDate(appt.date))}</td>
          <td>${escapeHtml(formatTime(appt.time))}</td>
          <td>${escapeHtml(appt.staff || '—')}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td>${serviceStatusBadge}</td>
          <td>${escapeHtml(paymentMethodLabel)}</td>
          <td>${paymentProofHtml}</td>
          <td>
            ${serviceStatusActions || (showActions ? `
              <button class="action-btn confirm" data-id="${appt.id}">Confirm</button>
              <button class="action-btn cancel" data-id="${appt.id}">Cancel</button>
            ` : '—')}
          </td>
        `;
        appointmentsTableBody.appendChild(tr);
      });

      // bind action buttons
      document.querySelectorAll('.action-btn.confirm').forEach(btn=>btn.addEventListener('click', onConfirm));
      document.querySelectorAll('.action-btn.cancel').forEach(btn=>btn.addEventListener('click', onCancel));
    }

    // summary (always update)
    updateSummaryStats();
  }

  function normalizeStatus(raw){
    const val = String(raw || '').toLowerCase();
    if(val === 'pending_payment' || val === 'pending-payment') return 'pending';
    if(val === 'cancelled') return 'canceled';
    return val;
  }

  function updateSummaryStats(){
    totalBookingsEl.textContent = appointments ? appointments.length : 0;
    const revenueValue = appointments && appointments.length ? 
      appointments.filter(a=>a.status==='confirmed' || a.status==='completed').reduce((s,a)=>s+(parseFloat(a.price)||0),0) : 0;
    revenueEl.textContent = formatCurrency(revenueValue);
    
    // Calculate client statistics
    if (appointments && appointments.length > 0) {
      // Active clients (unique clients with bookings)
      const uniqueClients = new Set(appointments.map(a => a.client));
      activeClientsEl.textContent = uniqueClients.size;
      
      // Get current date boundaries
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Track first booking date for each client
      const clientFirstBooking = {};
      appointments.forEach(appt => {
        const clientName = appt.client;
        const bookingDate = new Date(appt.date);
        
        if (!clientFirstBooking[clientName] || bookingDate < clientFirstBooking[clientName]) {
          clientFirstBooking[clientName] = bookingDate;
        }
      });
      
      // New clients this week
      const newThisWeek = Object.values(clientFirstBooking).filter(date => date >= startOfWeek).length;
      document.getElementById('newClientsWeek').textContent = newThisWeek;
      
      // New clients this month
      const newThisMonth = Object.values(clientFirstBooking).filter(date => date >= startOfMonth).length;
      newClientsEl.textContent = newThisMonth;
      
      // Returning clients (clients with more than 1 booking)
      const clientBookingCounts = {};
      appointments.forEach(appt => {
        clientBookingCounts[appt.client] = (clientBookingCounts[appt.client] || 0) + 1;
      });
      const returningCount = Object.values(clientBookingCounts).filter(count => count > 1).length;
      document.getElementById('returningClients').textContent = returningCount;
      
      // Update top clients list
      updateTopClients(clientBookingCounts);
      updateTopStaff(); // Add staff ranking
    } else {
      activeClientsEl.textContent = 0;
      document.getElementById('newClientsWeek').textContent = 0;
      newClientsEl.textContent = 0;
      document.getElementById('returningClients').textContent = 0;
      updateTopClients({});
      updateTopStaff();
    }
  }

  function updateTopClients(clientBookingCounts) {
    const topClientsList = document.getElementById('topClientsList');
    if (!topClientsList) return;
    
    // Calculate total revenue per client
    const clientRevenue = {};
    const clientData = {};
    
    appointments.forEach(appt => {
      const clientName = appt.client;
      
      // Count visits
      if (!clientData[clientName]) {
        clientData[clientName] = { visits: 0, revenue: 0 };
      }
      clientData[clientName].visits++;
      
      // Calculate revenue (only for confirmed/completed bookings)
      if (appt.status === 'confirmed' || appt.status === 'completed') {
        const revenue = parseFloat(appt.price) || 0;
        clientData[clientName].revenue += revenue;
      }
    });
    
    // Convert to array and sort by revenue (not visits)
    const sortedClients = Object.entries(clientData)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10); // Top 10 clients
    
    if (sortedClients.length === 0) {
      topClientsList.innerHTML = '<p style="text-align: center; padding: 1rem; color: var(--muted);">No client data available</p>';
      return;
    }
    
    topClientsList.innerHTML = sortedClients.map(([clientName, data], index) => {
      const rankColor = index === 0 ? '#f59e0b' : index === 1 ? '#9ca3af' : index === 2 ? '#cd7f32' : 'var(--muted)';
      const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const hoverBg = isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb';
      const borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
      
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid ${borderColor}; transition: background 0.2s;" 
             onmouseover="this.style.background='${hoverBg}'" 
             onmouseout="this.style.background='transparent'">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
            <span style="font-size: 1.25rem; color: ${rankColor}; min-width: 30px;">${rankIcon}</span>
            <div style="flex: 1;">
              <div style="font-weight: 600; color: var(--text); font-size: 0.875rem;">${escapeHtml(clientName)}</div>
              <div style="font-size: 0.75rem; color: var(--muted);">${data.visits} visit${data.visits > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600; color: var(--success); font-size: 0.875rem;">₱${data.revenue.toFixed(2)}</div>
            <div style="font-size: 0.7rem; color: var(--muted);">revenue</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function updateTopStaff() {
    const topStaffList = document.getElementById('topStaffList');
    if (!topStaffList) return;
    
    // Get current month's start and end dates
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Count bookings per staff member for this month
    const staffBookings = {};
    
    appointments.forEach(appt => {
      const bookingDate = new Date(appt.date);
      
      // Only count bookings from this month
      if (bookingDate >= monthStart && bookingDate <= monthEnd) {
        const staffName = appt.staff || appt.STAFF_NAME || 'Unassigned';
        
        // Skip unassigned bookings
        if (staffName === 'Unassigned' || !staffName) return;
        
        staffBookings[staffName] = (staffBookings[staffName] || 0) + 1;
      }
    });
    
    // Convert to array and sort by booking count
    const sortedStaff = Object.entries(staffBookings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5 staff
    
    if (sortedStaff.length === 0) {
      topStaffList.innerHTML = '<p style="text-align: center; padding: 1rem; color: var(--muted);">No staff booking data for this month</p>';
      return;
    }
    
    // Find max bookings for progress bar calculation
    const maxBookings = sortedStaff[0][1];
    
    topStaffList.innerHTML = sortedStaff.map(([staffName, bookingCount], index) => {
      const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
      const rankClass = index < 3 ? 'medal' : 'number';
      const initial = staffName.charAt(0).toUpperCase();
      const progressPercent = (bookingCount / maxBookings) * 100;
      
      return `
        <div class="staff-item">
          <div class="staff-rank ${rankClass}">${rankIcon}</div>
          <div class="staff-avatar">${initial}</div>
          <div class="staff-info">
            <p class="staff-name">${escapeHtml(staffName)}</p>
            <p class="staff-bookings-text">${bookingCount} booking${bookingCount !== 1 ? 's' : ''}</p>
          </div>
          <div class="staff-count">
            <div class="staff-number">${bookingCount}</div>
            <div class="staff-label">PICKS</div>
          </div>
          <button class="action-btn confirm" onclick="viewStaffActivity('${escapeHtml(staffName).replace(/'/g, "\\'")}')" style="margin-left: 0.5rem;">View Activity</button>
        </div>
      `;
    }).join('');
  }

  // View staff activity and booking history
  window.viewStaffActivity = function(staffName) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const modalBg = isDark ? 'var(--panel)' : 'white';
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
    const tableHeaderBg = isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6';
    
    // Filter bookings for this staff member
    const staffBookings = appointments.filter(appt => {
      const apptStaff = appt.staff || appt.STAFF_NAME;
      return apptStaff === staffName;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first
    
    // Group bookings by date for daily activity
    const dailyActivity = {};
    staffBookings.forEach(booking => {
      const date = new Date(booking.date).toLocaleDateString();
      if (!dailyActivity[date]) {
        dailyActivity[date] = [];
      }
      dailyActivity[date].push(booking);
    });
    
    // Calculate stats
    const totalBookings = staffBookings.length;
    const completedBookings = staffBookings.filter(b => b.status === 'completed' || b.status === 'confirmed').length;
    const canceledBookings = staffBookings.filter(b => b.status === 'canceled').length;
    const upcomingBookings = staffBookings.filter(b => {
      const bookingDate = new Date(b.date);
      return bookingDate > new Date() && b.status !== 'canceled';
    }).length;
    
    let bookingsHTML = '';
    if (staffBookings.length === 0) {
      bookingsHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted);">No bookings found for ${escapeHtml(staffName)}</td></tr>`;
    } else {
      bookingsHTML = staffBookings.map(booking => {
        const bookingDate = new Date(booking.date).toLocaleDateString();
        const bookingTime = formatTime(booking.time || booking.BOOKING_TIME) || 'N/A';
        const clientName = booking.client || 'Guest';
        const serviceName = booking.service || booking.SERVICE_NAME || 'N/A';
        const status = booking.status || 'pending';
        const statusColor = status === 'confirmed' || status === 'completed' ? 'var(--success)' : 
                           status === 'canceled' ? 'var(--danger)' : '#f59e0b';
        
        return `
          <tr style="border-bottom: 1px solid ${borderColor};">
            <td style="padding: 0.75rem; color: var(--text);">${bookingDate}</td>
            <td style="padding: 0.75rem; color: var(--text);">${bookingTime}</td>
            <td style="padding: 0.75rem; color: var(--text);">${escapeHtml(clientName)}</td>
            <td style="padding: 0.75rem; color: var(--text);">${escapeHtml(serviceName)}</td>
            <td style="padding: 0.75rem;">
              <span style="padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem; font-weight: 500; background: ${statusColor}; color: white;">
                ${escapeHtml(status)}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
    
    // Create daily activity summary
    let dailyActivityHTML = '';
    const sortedDates = Object.keys(dailyActivity).sort((a, b) => new Date(b) - new Date(a));
    
    if (sortedDates.length === 0) {
      dailyActivityHTML = '<p style="text-align:center;padding:1rem;color:var(--muted);">No activity recorded</p>';
    } else {
      dailyActivityHTML = sortedDates.slice(0, 10).map(date => {
        const dayBookings = dailyActivity[date];
        const dayCount = dayBookings.length;
        const dayDate = new Date(dayBookings[0].date);
        const isToday = dayDate.toDateString() === new Date().toDateString();
        
        return `
          <div style="padding: 0.75rem 1rem; border-bottom: 1px solid ${borderColor}; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; color: var(--text); font-size: 0.9rem;">
                ${date} ${isToday ? '<span style="color: var(--primary); font-size: 0.75rem;">(Today)</span>' : ''}
              </div>
              <div style="font-size: 0.8rem; color: var(--muted);">
                ${dayBookings.map(b => formatTime(b.time || b.BOOKING_TIME) || 'N/A').join(', ')}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 700; font-size: 1.25rem; color: var(--primary);">${dayCount}</div>
              <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">booking${dayCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    const modalHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;" id="staffActivityModal" onclick="if(event.target===this) this.remove()">
        <div style="background:${modalBg};color:var(--text);border-radius:12px;padding:0;max-width:1000px;width:95%;max-height:90vh;overflow:hidden;box-shadow:var(--shadow);border:1px solid ${borderColor};display:flex;flex-direction:column;">
          
          <!-- Header -->
          <div style="padding:1.5rem;border-bottom:2px solid ${borderColor};display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));">
            <div>
              <h2 style="margin:0;color:var(--text);font-size:1.5rem;">${escapeHtml(staffName)}'s Activity</h2>
              <p style="margin:0.5rem 0 0 0;color:var(--muted);font-size:0.875rem;">Complete booking history and daily schedule</p>
            </div>
            <button onclick="document.getElementById('staffActivityModal').remove()" style="background:transparent;border:none;font-size:1.5rem;cursor:pointer;color:var(--muted);padding:0.5rem;line-height:1;">✕</button>
          </div>
          
          <!-- Stats Cards -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;padding:1.5rem;background:${isDark ? 'rgba(255,255,255,0.02)' : '#f9fafb'};">
            <div style="text-align:center;padding:1rem;background:${modalBg};border-radius:8px;border:1px solid ${borderColor};">
              <div style="font-size:1.75rem;font-weight:700;color:var(--primary);">${totalBookings}</div>
              <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;margin-top:0.25rem;">Total Bookings</div>
            </div>
            <div style="text-align:center;padding:1rem;background:${modalBg};border-radius:8px;border:1px solid ${borderColor};">
              <div style="font-size:1.75rem;font-weight:700;color:var(--success);">${completedBookings}</div>
              <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;margin-top:0.25rem;">Completed</div>
            </div>
            <div style="text-align:center;padding:1rem;background:${modalBg};border-radius:8px;border:1px solid ${borderColor};">
              <div style="font-size:1.75rem;font-weight:700;color:#f59e0b;">${upcomingBookings}</div>
              <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;margin-top:0.25rem;">Upcoming</div>
            </div>
            <div style="text-align:center;padding:1rem;background:${modalBg};border-radius:8px;border:1px solid ${borderColor};">
              <div style="font-size:1.75rem;font-weight:700;color:var(--danger);">${canceledBookings}</div>
              <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;margin-top:0.25rem;">Canceled</div>
            </div>
          </div>
          
          <!-- Content Tabs -->
          <div style="flex:1;overflow:auto;padding:1.5rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
              
              <!-- Daily Activity -->
              <div>
                <h3 style="margin:0 0 1rem 0;color:var(--text);font-size:1.125rem;display:flex;align-items:center;gap:0.5rem;">
                  📅 Daily Activity
                </h3>
                <div style="border:1px solid ${borderColor};border-radius:8px;overflow:hidden;max-height:400px;overflow-y:auto;">
                  ${dailyActivityHTML}
                </div>
              </div>
              
              <!-- All Bookings -->
              <div>
                <h3 style="margin:0 0 1rem 0;color:var(--text);font-size:1.125rem;display:flex;align-items:center;gap:0.5rem;">
                  📋 All Bookings (${totalBookings})
                </h3>
                <div style="border:1px solid ${borderColor};border-radius:8px;overflow:hidden;max-height:400px;overflow-y:auto;">
                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr style="background:${tableHeaderBg};position:sticky;top:0;">
                        <th style="padding:0.75rem;text-align:left;font-size:0.8rem;font-weight:600;color:var(--muted);">Date</th>
                        <th style="padding:0.75rem;text-align:left;font-size:0.8rem;font-weight:600;color:var(--muted);">Time</th>
                        <th style="padding:0.75rem;text-align:left;font-size:0.8rem;font-weight:600;color:var(--muted);">Client</th>
                        <th style="padding:0.75rem;text-align:left;font-size:0.8rem;font-weight:600;color:var(--muted);">Service</th>
                        <th style="padding:0.75rem;text-align:left;font-size:0.8rem;font-weight:600;color:var(--muted);">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${bookingsHTML}
                    </tbody>
                  </table>
                </div>
              </div>
              
            </div>
          </div>
          
          <!-- Footer -->
          <div style="padding:1rem 1.5rem;border-top:1px solid ${borderColor};display:flex;justify-content:flex-end;gap:0.5rem;">
            <button onclick="document.getElementById('staffActivityModal').remove()" class="action-btn confirm">Close</button>
          </div>
          
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  };

  // Service Completion Status Functions
  window.markAsArrived = async function(bookingId) {
    try {
      const appt = appointments.find(a => a.id === bookingId);
      if (!appt) {
        showNotification('Booking not found', 'error');
        return;
      }
      
      console.log('Before update:', { id: bookingId, serviceStatus: appt.serviceStatus });
      
      // Persist to database first
      const response = await fetch(`http://localhost:3000/api/bookings/${bookingId}/service-status`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_status: 'arrived' })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.message || 'Failed to update status');
      }
      
      const result = await response.json();
      console.log('API Response:', result);
      
      // Update local state only after successful database update
      appt.serviceStatus = 'arrived';
      appt.service_status = 'arrived'; // Update both for consistency
      console.log('After update:', { id: bookingId, serviceStatus: appt.serviceStatus });
      
      renderAppointments();
      showNotification(`✓ ${appt.client} marked as arrived`, 'success');
      
    } catch (error) {
      console.error('Error marking as arrived:', error);
      showNotification('Failed to update status', 'error');
    }
  };

  window.markAsCompleted = async function(bookingId) {
    try {
      const appt = appointments.find(a => a.id === bookingId);
      if (!appt) {
        showNotification('Booking not found', 'error');
        return;
      }
      
      if (!confirm(`Mark service as completed for ${appt.client}?`)) {
        return;
      }
      
      // Persist to database first
      const response = await fetch(`http://localhost:3000/api/bookings/${bookingId}/service-status`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_status: 'completed' })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update status');
      }
      
      // Update local state after successful database update
      appt.serviceStatus = 'completed';
      appt.service_status = 'completed';
      appt.status = 'completed'; // Also update booking status
      
      // Update UI
      renderAppointments();
      updateChart();
      updateSummaryStats();
      updateTopStaff();
      
      showNotification(`✅ Service completed for ${appt.client}`, 'success');
      
    } catch (error) {
      console.error('Error marking as completed:', error);
      showNotification('Failed to update status', 'error');
    }
  };

  async function onConfirm(e){
    const id = Number(e.currentTarget.dataset.id);
    const btn = e.currentTarget;
    
    // Optimistically update UI
    const appt = appointments.find(a=>a.id===id);
    if(!appt) return;
    
    const originalStatus = appt.status;
    appt.status = 'confirmed';
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    
    try {
      await updateBookingStatus(id, 'confirmed');
      renderAppointments();
      updateChart();
      showNotification('Booking confirmed successfully', 'success');
    } catch(error) {
      // Revert on error
      appt.status = originalStatus;
      btn.disabled = false;
      btn.textContent = 'Confirm';
      showNotification('Failed to confirm booking: ' + error.message, 'error');
    }
  }

  async function onCancel(e){
    const id = Number(e.currentTarget.dataset.id);
    const btn = e.currentTarget;
    
    if(!confirm('Are you sure you want to cancel this booking?')) return;
    
    const appt = appointments.find(a=>a.id===id);
    if(!appt) return;
    
    const originalStatus = appt.status;
    appt.status = 'canceled';
    btn.disabled = true;
    btn.textContent = 'Canceling...';
    
    try {
      await updateBookingStatus(id, 'canceled');
      renderAppointments();
      updateChart();
      showNotification('Booking canceled successfully', 'success');
    } catch(error) {
      // Revert on error
      appt.status = originalStatus;
      btn.disabled = false;
      btn.textContent = 'Cancel';
      showNotification('Failed to cancel booking: ' + error.message, 'error');
    }
  }

  // API call to update booking status
  async function updateBookingStatus(bookingId, status){
    const token = getAuthToken();
    const response = await fetch(`http://localhost:3000/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ status })
    });
    
    if(!response.ok){
      const errorData = await response.json().catch(()=>({message:'Request failed'}));
      throw new Error(errorData.message || 'Failed to update booking status');
    }
    
    return await response.json();
  }

  // Chart
  let statusChart;
  function initChart(){
    const ctx = document.getElementById('statusChart').getContext('2d');
    statusChart = new Chart(ctx,{
      type:'doughnut',
      data:{
        labels:['Confirmed','Pending','Canceled'],
        datasets:[{data:getStatusCounts(),backgroundColor:['#10b981','#f59e0b','#ef4444'],borderWidth:0}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:getComputedStyle(document.body).color}}}
      }
    });
  }

  function updateChart(){
    if(!statusChart) return;
    statusChart.data.datasets[0].data = getStatusCounts();
    statusChart.update();
  }

  function getStatusCounts(){
    const confirmed = appointments.filter(a=>a.status==='confirmed').length;
    const pending = appointments.filter(a=>a.status==='pending').length;
    const canceled = appointments.filter(a=>a.status==='canceled').length;
    return [confirmed,pending,canceled];
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>\"]/g, function(tag){
      const chars = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
      return chars[tag] || tag;
    });
  }

  function capitalizeFirst(str){
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatDate(dateStr){
    if(!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch(e) {
      return dateStr;
    }
  }

  function formatTime(timeStr){
    if(!timeStr) return '';
    try {
      // Parse time string (HH:MM:SS or HH:MM)
      const parts = timeStr.split(':');
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1] || '00';
      
      // Convert to 12-hour format
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12; // Convert 0 to 12 for midnight, 13-23 to 1-11
      
      return `${hours}:${minutes} ${period}`;
    } catch(e) {
      return timeStr;
    }
  }

  // Currency formatting for Philippine Peso
  function formatCurrency(amount){
    try{
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount);
    }catch(e){
      // Fallback to symbol and number
      return '₱' + Number(amount || 0).toFixed(0);
    }
  }

  function getAuthToken(){
    return localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
  }

  function showNotification(message, type = 'info'){
    // Simple notification (could be enhanced with a toast library)
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Fetch bookings from API (safe fallback to empty)
  async function fetchBookings(){
    const url = 'http://localhost:3000/api/bookings/all';
    const token = getAuthToken();
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if(!response.ok) throw new Error('Failed to fetch bookings');
      
      const result = await response.json();
      const payload = Array.isArray(result) ? result : (result && result.data ? result.data : []);
      
      if(Array.isArray(payload)){
        appointments = payload.map((b)=>{
          const mapped = {
            id: b.BOOKING_ID || b.id,
            client: b.client_name || b.CLIENT_NAME || b.USERNAME || 'Client',
            service: b.SERVICE_NAME || b.service || 'Service',
            date: b.BOOKING_DATE || b.booking_date || b.date || '',
            time: b.BOOKING_TIME || b.booking_time || b.time || '',
            staff: b.staff_name || b.STAFF_NAME || '',
            status: normalizeStatus(b.booking_status || b.STATUS || b.status || b.status_name || 'pending'),
            serviceStatus: b.service_status || 'waiting',
            price: parseFloat(b.service_price || b.PRICE || b.price || 0),
            paymentStatus: (b.PAYMENT_STATUS || b.payment_status || 'pending').toLowerCase(),
            paymentMethod: b.PAYMENT_METHOD || b.payment_method || null,
            receiptImage: b.RECEIPT_IMAGE || b.receipt_image || null
          };
          return mapped;
        });
        
        console.log('Loaded bookings:', appointments.length, 'Sample:', appointments[0]);
        console.log('All booking dates:', appointments.map(a => ({ id: a.id, date: a.date, type: typeof a.date })));
        
        renderAppointments();
        updateChart();
        updateSummaryCards();
        updateSummaryStats();
        loadDashboardSection(); // Load dashboard recent bookings
      }
    } catch(err) {
      console.warn('Could not fetch bookings from API:', err.message);
      showNotification('Failed to load bookings. Please refresh the page.', 'error');
    }
  }

  // Fetch analytics data
  async function fetchAnalytics(){
    const url = 'http://localhost:3000/api/bookings/analytics';
    const token = getAuthToken();
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if(!response.ok) throw new Error('Failed to fetch analytics');
      
      const result = await response.json();
      if(result.success && result.data){
        const { summary } = result.data;
        if(summary){
          totalBookingsEl.textContent = summary.totalBookings || 0;
          revenueEl.textContent = formatCurrency(summary.totalRevenue || 0);
          activeClientsEl.textContent = summary.activeClients || 0;
          newClientsEl.textContent = summary.newClients || 0;
        }
      }
    } catch(err) {
      console.warn('Could not fetch analytics:', err.message);
    }
  }

  // Auto-refresh bookings every 30 seconds
  function startAutoRefresh(){
    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      fetchBookings();
      fetchAnalytics();
    }, 30000); // 30 seconds
  }

  function stopAutoRefresh(){
    if(refreshInterval){
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  // Bind empty-state buttons
  const refreshBtn = document.getElementById('refreshBtn');
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', ()=>{ 
      fetchBookings(); 
      fetchAnalytics();
    });
  }

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      stopAutoRefresh();
      ['token','authToken','jwt','role'].forEach(k=>localStorage.removeItem(k));
      window.location.href = 'loginform.html';
    });
  }

  // Sidebar navigation handler
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    console.log('Setting up navigation, found nav items:', navItems.length);
    
    navItems.forEach((link, index) => {
      const href = link.getAttribute('href');
      const dataSection = link.getAttribute('data-section');
      console.log(`Nav item ${index}:`, link.textContent.trim(), 'href:', href, 'data-section:', dataSection);
      
      link.addEventListener('click', (e) => {
        console.log('Nav item clicked:', href);
        
        // Only handle hash links (internal navigation), let external links work normally
        if (!href || !href.startsWith('#')) {
          console.log('External link, allowing navigation to:', href);
          return; // Let the browser handle external links
        }
        
        // Prevent default only for hash links
        e.preventDefault();
        console.log('Internal navigation to section:', href);
        
        // Update active state
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        link.classList.add('active');
        
        const section = href.substring(1); // Remove #
      
      // Hide/show sections
      const dashboardSection = document.getElementById('dashboardSection');
      const bookingsSection = document.getElementById('bookingsSection');
      const servicesSection = document.getElementById('servicesSection');
      const clientsSection = document.getElementById('clientsSection');
      const staffSection = document.getElementById('staffSection');
      const analyticsSection = document.getElementById('analyticsSection');
      const reportsSection = document.getElementById('reportsSection');
      
      // Hide all sections first
      [dashboardSection, bookingsSection, servicesSection, clientsSection, staffSection, analyticsSection, reportsSection].forEach(s => {
        if (s) s.classList.add('hidden');
      });
      
      // Update page title and content based on section
      const titleEl = document.querySelector('.main-header h1');
      const subtitleEl = document.querySelector('.main-header .muted');
      
      switch(section) {
        case 'dashboard':
          if (titleEl) titleEl.textContent = 'Dashboard';
          if (subtitleEl) subtitleEl.textContent = 'Overview of bookings and performance';
          if (dashboardSection) {
            dashboardSection.classList.remove('hidden');
            loadDashboardSection();
          }
          break;
        case 'bookings':
          if (titleEl) titleEl.textContent = 'Bookings Management';
          if (subtitleEl) subtitleEl.textContent = 'View and manage all customer bookings';
          if (bookingsSection) {
            bookingsSection.classList.remove('hidden');
            renderAppointments();
          }
          break;
        case 'services':
          if (titleEl) titleEl.textContent = 'Services Management';
          if (subtitleEl) subtitleEl.textContent = 'Manage salon services and pricing';
          if (servicesSection) {
            servicesSection.classList.remove('hidden');
            loadServicesSection();
          }
          break;
        case 'clients':
          if (titleEl) titleEl.textContent = 'Clients Management';
          if (subtitleEl) subtitleEl.textContent = 'View and manage customer information';
          if (clientsSection) {
            clientsSection.classList.remove('hidden');
            loadClientsSection();
          }
          break;
        case 'staff':
          if (titleEl) titleEl.textContent = 'Staff Management';
          if (subtitleEl) subtitleEl.textContent = 'Manage staff members and assignments';
          if (staffSection) {
            staffSection.classList.remove('hidden');
            loadStaffSection();
          }
          break;
        case 'analytics':
          if (titleEl) titleEl.textContent = 'Analytics';
          if (subtitleEl) subtitleEl.textContent = 'Performance metrics and insights';
          if (analyticsSection) {
            analyticsSection.classList.remove('hidden');
            initAnalytics();
          }
          break;
        case 'reports':
          if (titleEl) titleEl.textContent = 'Reports';
          if (subtitleEl) subtitleEl.textContent = 'Generate and download reports';
          if (reportsSection) {
            reportsSection.classList.remove('hidden');
            initReports();
          }
          break;
        default:
          if (titleEl) titleEl.textContent = 'Dashboard';
          if (subtitleEl) subtitleEl.textContent = 'Overview of bookings and performance';
          if (dashboardSection) dashboardSection.classList.remove('hidden');
      }
    });
  });
  }

  // Call setup navigation
  setupNavigation();

  // Initialize on page load
  renderAppointments();
  initChart();
  fetchBookings();
  fetchAnalytics();
  startAutoRefresh();

  // Stop auto-refresh when page is hidden
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){
      stopAutoRefresh();
    } else {
      fetchBookings();
      fetchAnalytics();
      startAutoRefresh();
    }
  });

  // =============== ANALYTICS FUNCTIONS ===============
  let revenueChart, serviceChart, peakTimesChart, trendsChart;
  let currentRevenueView = 'monthly';

  function initAnalytics() {
    if (!appointments || appointments.length === 0) {
      showNotification('No booking data available for analytics', 'info');
      return;
    }

    // Initialize all analytics charts
    initRevenueChart();
    initServicePopularityChart();
    initPeakTimesChart();
    initTrendsChart();

    // Setup view toggle buttons
    document.getElementById('dailyViewBtn')?.addEventListener('click', () => {
      currentRevenueView = 'daily';
      updateRevenueChart();
      document.querySelectorAll('#dailyViewBtn, #weeklyViewBtn, #monthlyViewBtn').forEach(b => b.classList.remove('confirm'));
      document.getElementById('dailyViewBtn').classList.add('confirm');
    });
    document.getElementById('weeklyViewBtn')?.addEventListener('click', () => {
      currentRevenueView = 'weekly';
      updateRevenueChart();
      document.querySelectorAll('#dailyViewBtn, #weeklyViewBtn, #monthlyViewBtn').forEach(b => b.classList.remove('confirm'));
      document.getElementById('weeklyViewBtn').classList.add('confirm');
    });
    document.getElementById('monthlyViewBtn')?.addEventListener('click', () => {
      currentRevenueView = 'monthly';
      updateRevenueChart();
      document.querySelectorAll('#dailyViewBtn, #weeklyViewBtn, #monthlyViewBtn').forEach(b => b.classList.remove('confirm'));
      document.getElementById('monthlyViewBtn').classList.add('confirm');
    });
  }

  function initRevenueChart() {
    const ctx = document.getElementById('revenueChart')?.getContext('2d');
    if (!ctx) return;

    if (revenueChart) revenueChart.destroy();

    const revenueData = calculateRevenueData(currentRevenueView);
    
    revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: revenueData.labels,
        datasets: [{
          label: 'Revenue (₱)',
          data: revenueData.values,
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderColor: '#10b981',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: true }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  function updateRevenueChart() {
    if (!revenueChart) return;
    const revenueData = calculateRevenueData(currentRevenueView);
    revenueChart.data.labels = revenueData.labels;
    revenueChart.data.datasets[0].data = revenueData.values;
    revenueChart.update();
  }

  function calculateRevenueData(view) {
    const confirmedBookings = appointments.filter(a => a.status === 'confirmed');
    const dataMap = {};

    confirmedBookings.forEach(booking => {
      const date = new Date(booking.date);
      let key;
      
      if (view === 'daily') {
        key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (view === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = 'Week of ' + weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      dataMap[key] = (dataMap[key] || 0) + (parseFloat(booking.price) || 0);
    });

    return {
      labels: Object.keys(dataMap),
      values: Object.values(dataMap)
    };
  }

  function initServicePopularityChart() {
    const ctx = document.getElementById('serviceChart')?.getContext('2d');
    if (!ctx) return;

    if (serviceChart) serviceChart.destroy();

    const serviceData = {};
    appointments.forEach(a => {
      serviceData[a.service] = (serviceData[a.service] || 0) + 1;
    });

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    serviceChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(serviceData),
        datasets: [{
          data: Object.values(serviceData),
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' }
        }
      }
    });
  }

  function initPeakTimesChart() {
    const ctx = document.getElementById('peakTimesChart')?.getContext('2d');
    if (!ctx) return;

    if (peakTimesChart) peakTimesChart.destroy();

    const timeData = {};
    appointments.forEach(a => {
      const hour = a.time.split(':')[0] + ':00';
      timeData[hour] = (timeData[hour] || 0) + 1;
    });

    const sortedTimes = Object.keys(timeData).sort();

    peakTimesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedTimes,
        datasets: [{
          label: 'Bookings',
          data: sortedTimes.map(t => timeData[t]),
          backgroundColor: '#3b82f6',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  function initTrendsChart() {
    const ctx = document.getElementById('trendsChart')?.getContext('2d');
    if (!ctx) return;

    if (trendsChart) trendsChart.destroy();

    const dailyBookings = {};
    appointments.forEach(a => {
      const date = new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyBookings[date] = (dailyBookings[date] || 0) + 1;
    });

    trendsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Object.keys(dailyBookings),
        datasets: [{
          label: 'Total Bookings',
          data: Object.values(dailyBookings),
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: '#3b82f6',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: true }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  // =============== REPORTS FUNCTIONS ===============
  function initReports() {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    document.getElementById('reportEndDate').valueAsDate = today;
    document.getElementById('reportStartDate').valueAsDate = thirtyDaysAgo;

    // Bind report buttons
    document.getElementById('exportCSVBtn')?.addEventListener('click', exportToCSV);
    document.getElementById('exportExcelBtn')?.addEventListener('click', exportToExcel);
    document.getElementById('generatePDFBtn')?.addEventListener('click', generatePDFReport);
    document.getElementById('revenueReportBtn')?.addEventListener('click', showRevenueReport);
    document.getElementById('customerHistoryBtn')?.addEventListener('click', showCustomerHistory);
  }

  function getFilteredBookings() {
    const startDate = new Date(document.getElementById('reportStartDate').value);
    const endDate = new Date(document.getElementById('reportEndDate').value);
    
    return appointments.filter(a => {
      const bookingDate = new Date(a.date);
      return bookingDate >= startDate && bookingDate <= endDate;
    });
  }

  function exportToCSV() {
    const filtered = getFilteredBookings();
    if (filtered.length === 0) {
      showNotification('No bookings in selected date range', 'error');
      return;
    }

    let csv = 'Client,Service,Date,Time,Status,Price\n';
    filtered.forEach(b => {
      csv += `"${b.client}","${b.service}","${b.date}","${b.time}","${b.status}",${b.price}\n`;
    });

    downloadFile(csv, 'bookings-report.csv', 'text/csv');
    showNotification('CSV exported successfully!', 'success');
  }

  function exportToExcel() {
    const filtered = getFilteredBookings();
    if (filtered.length === 0) {
      showNotification('No bookings in selected date range', 'error');
      return;
    }

    // Create simple HTML table for Excel
    let html = '<table><tr><th>Client</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th></tr>';
    filtered.forEach(b => {
      html += `<tr><td>${b.client}</td><td>${b.service}</td><td>${b.date}</td><td>${b.time}</td><td>${b.status}</td><td>${b.price}</td></tr>`;
    });
    html += '</table>';

    downloadFile(html, 'bookings-report.xls', 'application/vnd.ms-excel');
    showNotification('Excel file exported successfully!', 'success');
  }

  function generatePDFReport() {
    const filtered = getFilteredBookings();
    if (filtered.length === 0) {
      showNotification('No bookings in selected date range', 'error');
      return;
    }

    const preview = document.getElementById('reportPreview');
    const totalRevenue = filtered.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + (parseFloat(b.price) || 0), 0);
    
    preview.innerHTML = `
      <h3>Bookings Report</h3>
      <p><strong>Period:</strong> ${document.getElementById('reportStartDate').value} to ${document.getElementById('reportEndDate').value}</p>
      <p><strong>Total Bookings:</strong> ${filtered.length}</p>
      <p><strong>Confirmed:</strong> ${filtered.filter(b => b.status === 'confirmed').length}</p>
      <p><strong>Pending:</strong> ${filtered.filter(b => b.status === 'pending').length}</p>
      <p><strong>Canceled:</strong> ${filtered.filter(b => b.status === 'canceled').length}</p>
      <p><strong>Total Revenue:</strong> ${formatCurrency(totalRevenue)}</p>
      <p class="muted" style="margin-top: 20px;">PDF generation requires additional library. Preview shown above. Click Export CSV for now.</p>
    `;
    showNotification('Report preview generated', 'success');
  }

  function showRevenueReport() {
    const filtered = getFilteredBookings();
    if (filtered.length === 0) {
      showNotification('No bookings in selected date range', 'error');
      return;
    }

    const revenueByService = {};
    filtered.filter(b => b.status === 'confirmed').forEach(b => {
      revenueByService[b.service] = (revenueByService[b.service] || 0) + (parseFloat(b.price) || 0);
    });

    const preview = document.getElementById('reportPreview');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const headerBg = isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6';
    const rowBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
    const totalBg = isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb';
    
    let html = `<h3>Revenue by Service</h3><table style="width:100%; border-collapse: collapse;"><tr style="background: ${headerBg};"><th style="padding:10px; text-align:left;">Service</th><th style="padding:10px; text-align:right;">Revenue</th></tr>`;
    
    Object.entries(revenueByService).forEach(([service, revenue]) => {
      html += `<tr style="border-bottom: 1px solid ${rowBorder};"><td style="padding:10px;">${service}</td><td style="padding:10px; text-align:right;">${formatCurrency(revenue)}</td></tr>`;
    });
    
    const total = Object.values(revenueByService).reduce((a,b) => a+b, 0);
    html += `<tr style="font-weight:bold; background:${totalBg};"><td style="padding:10px;">TOTAL</td><td style="padding:10px; text-align:right;">${formatCurrency(total)}</td></tr></table>`;
    
    preview.innerHTML = html;
    showNotification('Revenue report generated', 'success');
  }

  function showCustomerHistory() {
    const filtered = getFilteredBookings();
    if (filtered.length === 0) {
      showNotification('No bookings in selected date range', 'error');
      return;
    }

    const customerData = {};
    filtered.forEach(b => {
      if (!customerData[b.client]) {
        customerData[b.client] = { bookings: 0, revenue: 0 };
      }
      customerData[b.client].bookings++;
      if (b.status === 'confirmed') {
        customerData[b.client].revenue += parseFloat(b.price) || 0;
      }
    });

    const preview = document.getElementById('reportPreview');
    let html = '<h3>Customer Booking History</h3><table style="width:100%; border-collapse: collapse;"><tr style="background: #f3f4f6;"><th style="padding:10px; text-align:left;">Customer</th><th style="padding:10px; text-align:center;">Total Bookings</th><th style="padding:10px; text-align:right;">Total Revenue</th></tr>';
    
    Object.entries(customerData).forEach(([customer, data]) => {
      html += `<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding:10px;">${customer}</td><td style="padding:10px; text-align:center;">${data.bookings}</td><td style="padding:10px; text-align:right;">${formatCurrency(data.revenue)}</td></tr>`;
    });
    
    html += '</table>';
    preview.innerHTML = html;
    showNotification('Customer history report generated', 'success');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ===== NEW FEATURES: FILTERS & ENHANCEMENTS =====

  // Summary cards calculation
  function updateSummaryCards() {
    console.log('updateSummaryCards called, appointments:', appointments.length);
    if (!appointments || appointments.length === 0) {
      console.log('No appointments, setting cards to 0');
      const todayBookingsEl = document.getElementById('todayBookings');
      const pendingBookingsEl = document.getElementById('pendingBookings');
      const completedTodayEl = document.getElementById('completedToday');
      const revenueTodayEl = document.getElementById('revenueToday');
      if (todayBookingsEl) todayBookingsEl.textContent = '0';
      if (pendingBookingsEl) pendingBookingsEl.textContent = '0';
      if (completedTodayEl) completedTodayEl.textContent = '0';
      if (revenueTodayEl) revenueTodayEl.textContent = '₱0';
      return;
    }
    
    // Get today's date in local timezone (not UTC)
    const today = new Date();
    const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    const todayBookings = appointments.filter(a => {
      // Convert UTC date to local date for comparison
      const utcDate = new Date(a.date);
      const localDate = new Date(utcDate.getTime() - (utcDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      return localDate === localToday;
    });
    
    console.log('Filtering today bookings. Local Today:', localToday);
    todayBookings.forEach(b => console.log('Today booking:', b.id, 'Date:', b.date, 'Status:', b.status, 'ServiceStatus:', b.serviceStatus, b.service_status, 'Price:', b.price));
    
    const pendingBookings = appointments.filter(a => a.status === 'pending');
    const completedToday = todayBookings.filter(a => {
      const sStatus = a.serviceStatus || a.service_status || 'waiting';
      return sStatus === 'completed';
    });
    const revenueToday = todayBookings.filter(a => {
      const sStatus = a.serviceStatus || a.service_status || 'waiting';
      return sStatus === 'completed' || a.status === 'confirmed';
    }).reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);
    
    console.log('Today:', localToday, 'Today bookings:', todayBookings.length, 'Completed:', completedToday.length, 'Revenue:', revenueToday);

    const todayBookingsEl = document.getElementById('todayBookings');
    const pendingBookingsEl = document.getElementById('pendingBookings');
    const completedTodayEl = document.getElementById('completedToday');
    const revenueTodayEl = document.getElementById('revenueToday');
    
    if (todayBookingsEl) todayBookingsEl.textContent = todayBookings.length;
    if (pendingBookingsEl) pendingBookingsEl.textContent = pendingBookings.length;
    if (completedTodayEl) completedTodayEl.textContent = completedToday.length;
    if (revenueTodayEl) revenueTodayEl.textContent = formatCurrency(revenueToday);
  }

  // Filters for appointments table
  let filteredAppointments = [];

  function applyFilters() {
    const searchText = document.getElementById('searchClient')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const paymentFilter = document.getElementById('filterPayment')?.value || '';

    filteredAppointments = appointments.filter(appt => {
      const matchesSearch = !searchText || appt.client.toLowerCase().includes(searchText);
      const matchesStatus = !statusFilter || appt.status.toLowerCase() === statusFilter;
      const matchesPayment = !paymentFilter || (appt.paymentMethod || '').toUpperCase() === paymentFilter;
      
      return matchesSearch && matchesStatus && matchesPayment;
    });

    renderFilteredAppointments();
  }

  function renderFilteredAppointments() {
    appointmentsTableBody.innerHTML = '';

    const emptyState = document.getElementById('emptyState');
    const tableWrap = document.getElementById('tableWrap');

    if (!filteredAppointments || filteredAppointments.length === 0) {
      emptyState.classList.remove('hidden');
      tableWrap.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tableWrap.classList.remove('hidden');

    filteredAppointments.forEach(appt => {
      const tr = document.createElement('tr');
      const statusClass = (appt.status || 'pending').toLowerCase();
      const statusText = capitalizeFirst(appt.status || 'pending');

      const paymentMethodLabel = appt.paymentMethod
        ? (String(appt.paymentMethod).toUpperCase() === 'GCASH' ? 'GCash' : capitalizeFirst(String(appt.paymentMethod).toLowerCase()))
        : '—';

      const paymentMethodRaw = (appt.paymentMethod || '').toString().toLowerCase();
      let paymentProofHtml = '<span class="muted" style="font-size:12px;">No proof</span>';

      if (paymentMethodRaw === 'cash') {
        paymentProofHtml = '<span class="muted" style="font-size:12px;">Not required</span>';
      } else if (appt.paymentMethod && paymentMethodRaw !== 'cash' && appt.receiptImage) {
        paymentProofHtml = `
          <a href="${appt.receiptImage}" target="_blank">
            <img src="${appt.receiptImage}"
                 alt="Receipt"
                 style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;" />
          </a>`;
      }

      tr.innerHTML = `
        <td>${escapeHtml(appt.client)}</td>
        <td>${escapeHtml(appt.service)}</td>
        <td>${escapeHtml(formatDate(appt.date))}</td>
        <td>${escapeHtml(formatTime(appt.time))}</td>
        <td>${escapeHtml(appt.staff || 'Unassigned')}</td>
        <td><span class="badge badge-${statusClass}">${statusText}</span></td>
        <td>${paymentMethodLabel}</td>
        <td>${paymentProofHtml}</td>
        <td class="actions-cell">
          ${appt.status === 'pending' ? `<button class="action-btn confirm" onclick="confirmBooking(${appt.id})">Confirm</button>` : ''}
          ${appt.status !== 'canceled' && appt.status !== 'completed' ? `<button class="action-btn danger" onclick="cancelBooking(${appt.id})">Cancel</button>` : ''}
          ${appt.status === 'confirmed' ? `<button class="action-btn success" onclick="completeBooking(${appt.id})">Complete</button>` : ''}
          <button class="action-btn" onclick="viewBookingDetails(${appt.id})">View</button>
        </td>
      `;
      appointmentsTableBody.appendChild(tr);
    });
  }

  // Setup filter listeners (only if elements exist)
  const searchClientEl = document.getElementById('searchClient');
  const filterStatusEl = document.getElementById('filterStatus');
  const filterPaymentEl = document.getElementById('filterPayment');
  
  if (searchClientEl) searchClientEl.addEventListener('input', applyFilters);
  if (filterStatusEl) filterStatusEl.addEventListener('change', applyFilters);
  if (filterPaymentEl) filterPaymentEl.addEventListener('change', applyFilters);

  // Clients Section
  async function loadClientsSection() {
    const tbody = document.querySelector('#clientsTable tbody');
    
    try {
      const token = getAuthToken();
      console.log('Fetching clients with token:', token ? 'Present' : 'Missing');
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      const response = await fetch('http://localhost:3000/api/auth/users', {
        method: 'GET',
        headers: { 
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', response.headers.get('content-type'));
      
      // Get the raw text first to see what we're getting
      const rawText = await response.text();
      console.log('Raw response:', rawText.substring(0, 200));
      
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        console.error('Failed to parse JSON. Raw response:', rawText);
        throw new Error('Server returned invalid response. Check if server is running correctly.');
      }
      
      if (!response.ok) {
        console.error('Error response:', data);
        throw new Error(data.message || `Server error: ${response.status}`);
      }
      
      const clients = data.data || data || [];
      
      console.log('Loaded clients:', clients.length, clients);
      
      // Calculate booking counts for each client
      const bookingCounts = {};
      appointments.forEach(booking => {
        const clientName = booking.client;
        bookingCounts[clientName] = (bookingCounts[clientName] || 0) + 1;
      });
      
      tbody.innerHTML = '';
      
      if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted);">No clients found. Clients will appear here after they register.</td></tr>';
        showNotification('No clients found', 'info');
        return;
      }
      
      clients.forEach(client => {
        const clientName = client.NAME || client.name || 'N/A';
        const bookingCount = bookingCounts[clientName] || 0;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(clientName)}</td>
          <td>${escapeHtml(client.EMAIL_ADDRESS || client.EMAIL || client.email || 'N/A')}</td>
          <td>${escapeHtml(client.PHONE || client.phone || 'N/A')}</td>
          <td>${bookingCount}</td>
          <td>${formatDate(client.CREATED_AT || client.created_at || '')}</td>
          <td>
            <button class="action-btn confirm" onclick="viewClientDetails(${client.USER_ID || client.id})">View Profile</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      
      showNotification(`Loaded ${clients.length} client(s)`, 'success');
    } catch (err) {
      console.error('Failed to load clients:', err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger);">Error: ${err.message}<br><small>Check console for details</small></td></tr>`;
      showNotification('Failed to load clients: ' + err.message, 'error');
    }
  }

  // Staff Section
  async function loadStaffSection() {
    const tbody = document.querySelector('#staffTable tbody');
    
    try {
      const token = getAuthToken();
      console.log('Fetching staff with token:', token ? 'Present' : 'Missing');
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      const response = await fetch('http://localhost:3000/api/staff', {
        method: 'GET',
        headers: { 
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Staff response status:', response.status, response.statusText);
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        throw new Error('Server returned invalid response');
      }
      
      if (!response.ok) {
        console.error('Error response:', data);
        throw new Error(data.message || `Server error: ${response.status}`);
      }
      
      const staff = data.data || data || [];
      
      console.log('Loaded staff:', staff.length, staff);
      
      tbody.innerHTML = '';
      
      if (staff.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted);">No staff members found. Add staff members to manage your team.</td></tr>';
        showNotification('No staff members found', 'info');
        return;
      }
      
      // Count assigned bookings per staff member
      const staffBookings = {};
      appointments.forEach(booking => {
        const staffName = booking.staff || booking.STAFF_NAME;
        if (staffName) {
          staffBookings[staffName] = (staffBookings[staffName] || 0) + 1;
        }
      });
      
      staff.forEach(member => {
        const staffName = member.full_name || member.FULL_NAME || member.name;
        const assignedCount = staffBookings[staffName] || 0;
        const staffId = member.staff_id || member.STAFF_ID || member.id;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(staffName || 'N/A')}</td>
          <td>${escapeHtml(member.email || member.EMAIL || 'N/A')}</td>
          <td>${escapeHtml(member.phone || member.PHONE || 'N/A')}</td>
          <td>${escapeHtml(member.role || member.ROLE || 'Staff')}</td>
          <td>
            ${assignedCount > 0 ? `<a href="#" onclick="viewStaffClients(${staffId}, '${escapeHtml(staffName)}'); return false;" style="color: var(--primary); text-decoration: underline; cursor: pointer;">${assignedCount}</a>` : assignedCount}
          </td>
          <td>
            <button class="action-btn confirm" onclick="viewStaffActivity('${escapeHtml(staffName).replace(/'/g, "\\'")}')">View Activity</button>
            <button class="action-btn warning" onclick="editStaff(${staffId})">Edit</button>
            <button class="action-btn danger" onclick="deleteStaff(${staffId})">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      
      showNotification(`Loaded ${staff.length} staff member(s)`, 'success');
    } catch (err) {
      console.error('Failed to load staff:', err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger);">Error: ${err.message}<br><small>Check console for details</small></td></tr>`;
      showNotification('Failed to load staff: ' + err.message, 'error');
    }
  }

  // Services Section
  async function loadServicesSection() {
    try {
      const token = getAuthToken();
      const response = await fetch('http://localhost:3000/api/services', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!response.ok) throw new Error('Failed to fetch services');
      
      const data = await response.json();
      const services = data.data || data || [];
      
      const grid = document.getElementById('servicesGrid');
      grid.innerHTML = '';
      
      services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.innerHTML = `
          ${service.IMAGE_URL ? `<img src="${service.IMAGE_URL}" alt="${escapeHtml(service.SERVICE_NAME)}">` : ''}
          <div class="service-card-body">
            <h3>${escapeHtml(service.SERVICE_NAME || service.name || 'Service')}</h3>
            <p>${escapeHtml(service.DESCRIPTION || service.description || '')}</p>
            <span class="price">${formatCurrency(service.PRICE || service.price || 0)}</span>
            <div class="service-actions">
              <button class="action-btn confirm" onclick="editService(${service.SERVICE_ID || service.id})">Edit</button>
              <button class="action-btn danger" onclick="deleteService(${service.SERVICE_ID || service.id})">Delete</button>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load services:', err);
      showNotification('Failed to load services', 'error');
    }
  }

  // Global action functions (accessible from onclick)
  window.confirmBooking = async function(id) {
    if (!confirm('Confirm this booking?')) return;
    try {
      const token = getAuthToken();
      const response = await fetch(`http://localhost:3000/api/bookings/${id}/confirm`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (response.ok) {
        showNotification('Booking confirmed', 'success');
        fetchBookings();
      }
    } catch (err) {
      showNotification('Failed to confirm booking', 'error');
    }
  };

  window.cancelBooking = async function(id) {
    if (!confirm('Cancel this booking?')) return;
    try {
      const token = getAuthToken();
      const response = await fetch(`http://localhost:3000/api/bookings/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (response.ok) {
        showNotification('Booking canceled', 'success');
        fetchBookings();
      }
    } catch (err) {
      showNotification('Failed to cancel booking', 'error');
    }
  };

  window.completeBooking = async function(id) {
    if (!confirm('Mark this booking as completed?')) return;
    try {
      const token = getAuthToken();
      const response = await fetch(`http://localhost:3000/api/bookings/${id}/complete`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (response.ok) {
        showNotification('Booking completed', 'success');
        fetchBookings();
      }
    } catch (err) {
      showNotification('Failed to complete booking', 'error');
    }
  };

  window.viewBookingDetails = function(id) {
    const booking = appointments.find(a => a.id === id);
    if (booking) {
      alert(`Booking Details:\n\nClient: ${booking.client}\nService: ${booking.service}\nDate: ${booking.date}\nTime: ${booking.time}\nStatus: ${booking.status}`);
    }
  };

  window.viewClientDetails = async function(userId) {
    try {
      const token = getAuthToken();
      const response = await fetch(`http://localhost:3000/api/auth/users`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!response.ok) throw new Error('Failed to fetch client data');
      
      const data = await response.json();
      const clients = data.data || [];
      const client = clients.find(c => (c.USER_ID || c.id) === userId);
      
      if (!client) {
        alert('Client not found');
        return;
      }
      
      // Get client's bookings
      const clientBookings = appointments.filter(a => a.client === (client.NAME || client.name));
      
      const bookingHistory = clientBookings.length > 0 
        ? clientBookings.map(b => `
            <tr>
              <td>${escapeHtml(b.service)}</td>
              <td>${formatDate(b.date)}</td>
              <td>${formatTime(b.time)}</td>
              <td><span class="badge badge-${b.status.toLowerCase()}">${capitalizeFirst(b.status)}</span></td>
              <td>${formatCurrency(b.price)}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted);">No bookings yet</td></tr>';
      
      const totalSpent = clientBookings
        .filter(b => b.status === 'confirmed')
        .reduce((sum, b) => sum + parseFloat(b.price || 0), 0);
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const infoBg = isDark ? 'rgba(255,255,255,0.03)' : '#f9fafb';
      const tableHeaderBg = isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6';
      
      const modalHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;" id="clientModal">
          <div style="background:var(--panel);color:var(--text);border-radius:12px;padding:2rem;max-width:800px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow);border:1px solid rgba(15,23,42,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
              <h2 style="margin:0;color:var(--text);">Client Profile</h2>
              <button onclick="document.getElementById('clientModal').remove()" style="background:transparent;border:none;font-size:1.5rem;cursor:pointer;color:var(--muted);">✕</button>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:2rem;padding:1rem;background:${infoBg};border-radius:8px;">
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Full Name</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--text);">${escapeHtml(client.NAME || client.name || 'N/A')}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Email</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--text);">${escapeHtml(client.EMAIL_ADDRESS || client.EMAIL || client.email || 'N/A')}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Phone</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--text);">${escapeHtml(client.PHONE || client.phone || 'N/A')}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Gender</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--text);">${escapeHtml(client.GENDER || client.gender || 'N/A')}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Total Bookings</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--primary);">${clientBookings.length}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Total Spent</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--success);">${formatCurrency(totalSpent)}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Member Since</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--text);">${formatDate(client.CREATED_AT || client.created_at || '')}</p>
              </div>
              <div>
                <p style="margin:0;font-size:0.875rem;color:var(--muted);">Account Status</p>
                <p style="margin:0.25rem 0 0 0;font-weight:600;color:var(--success);">Active</p>
              </div>
            </div>
            
            <h3 style="margin:0 0 1rem 0;color:var(--text);">Booking History</h3>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:${tableHeaderBg};">
                    <th style="padding:0.75rem;text-align:left;font-size:0.875rem;font-weight:600;color:var(--muted);">Service</th>
                    <th style="padding:0.75rem;text-align:left;font-size:0.875rem;font-weight:600;color:var(--muted);">Date</th>
                    <th style="padding:0.75rem;text-align:left;font-size:0.875rem;font-weight:600;color:var(--muted);">Time</th>
                    <th style="padding:0.75rem;text-align:left;font-size:0.875rem;font-weight:600;color:var(--muted);">Status</th>
                    <th style="padding:0.75rem;text-align:right;font-size:0.875rem;font-weight:600;color:var(--muted);">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${bookingHistory}
                </tbody>
              </table>
            </div>
            
            <div style="margin-top:1.5rem;display:flex;justify-content:flex-end;gap:0.5rem;">
              <button onclick="document.getElementById('clientModal').remove()" class="action-btn">Close</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHTML);
    } catch (err) {
      console.error('Failed to load client details:', err);
      alert('Failed to load client details: ' + err.message);
    }
  };

  window.editStaff = async function(id) {
    try {
      const token = getAuthToken();
      
      // Fetch staff details
      const response = await fetch(`http://localhost:3000/api/staff/${id}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!response.ok) throw new Error('Failed to fetch staff details');
      
      const result = await response.json();
      const staff = result.data;
      
      // Create edit modal
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      
      const modalHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;" id="editStaffModal">
          <div style="background:var(--panel);color:var(--text);border-radius:12px;padding:2rem;max-width:500px;width:90%;box-shadow:var(--shadow);border:1px solid rgba(15,23,42,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
              <h2 style="margin:0;color:var(--text);">Edit Staff Member</h2>
              <button onclick="document.getElementById('editStaffModal').remove()" style="background:transparent;border:none;font-size:1.5rem;cursor:pointer;color:var(--muted);">✕</button>
            </div>
            
            <form id="editStaffForm" style="display:flex;flex-direction:column;gap:1rem;">
              <div>
                <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Full Name *</label>
                <input type="text" id="editFullName" value="${escapeHtml(staff.full_name)}" required style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
              </div>
              
              <div>
                <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Email *</label>
                <input type="email" id="editEmail" value="${escapeHtml(staff.email)}" required style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
              </div>
              
              <div>
                <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Phone</label>
                <input type="tel" id="editPhone" value="${escapeHtml(staff.phone || '')}" style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
              </div>
              
              <div>
                <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Role</label>
                <input type="text" id="editRole" value="${escapeHtml(staff.role || 'Staff')}" style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
              </div>
              
              <div>
                <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Gender</label>
                <select id="editGender" style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
                  <option value="">Not specified</option>
                  <option value="Male" ${staff.gender === 'Male' ? 'selected' : ''}>Male</option>
                  <option value="Female" ${staff.gender === 'Female' ? 'selected' : ''}>Female</option>
                </select>
              </div>
              
              <div style="display:flex;gap:0.5rem;margin-top:1rem;">
                <button type="submit" class="action-btn confirm" style="flex:1;">Save Changes</button>
                <button type="button" onclick="document.getElementById('editStaffModal').remove()" class="action-btn" style="flex:1;">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      
      // Handle form submission
      document.getElementById('editStaffForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const updatedData = {
          full_name: document.getElementById('editFullName').value,
          email: document.getElementById('editEmail').value,
          phone: document.getElementById('editPhone').value,
          role: document.getElementById('editRole').value,
          gender: document.getElementById('editGender').value
        };
        
        try {
          const updateResponse = await fetch(`http://localhost:3000/api/staff/${id}`, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
          });
          
          if (!updateResponse.ok) {
            const error = await updateResponse.json();
            throw new Error(error.message || 'Failed to update staff');
          }
          
          showNotification('Staff member updated successfully', 'success');
          document.getElementById('editStaffModal').remove();
          loadStaffSection();
        } catch (error) {
          showNotification('Error: ' + error.message, 'error');
        }
      });
    } catch (err) {
      console.error('Failed to load staff details:', err);
      showNotification('Failed to load staff details: ' + err.message, 'error');
    }
  };

  window.deleteStaff = async function(id) {
    if (!confirm('Are you sure you want to delete this staff member? This action cannot be undone.')) return;
    
    try {
      const token = getAuthToken();
      const response = await fetch(`http://localhost:3000/api/staff/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete staff');
      }
      
      const result = await response.json();
      showNotification(result.message || 'Staff member deleted successfully', 'success');
      
      // Find and remove the row from the table
      const rows = document.querySelectorAll('#staffTable tbody tr');
      rows.forEach(row => {
        const deleteBtn = row.querySelector(`button[onclick*="deleteStaff(${id})"]`);
        if (deleteBtn) {
          row.remove();
        }
      });
      
      // Check if table is now empty
      const tbody = document.querySelector('#staffTable tbody');
      if (tbody && tbody.children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted);">No staff members found. Add staff members to manage your team.</td></tr>';
      }
    } catch (err) {
      console.error('Failed to delete staff:', err);
      showNotification('Error: ' + err.message, 'error');
    }
  };

  // View clients who chose a specific staff member
  window.viewStaffClients = async function(staffId, staffName) {
    try {
      const token = getAuthToken();
      console.log('Fetching bookings for staff ID:', staffId);
      console.log('API URL:', `http://localhost:3000/api/staff/${staffId}/bookings`);
      
      const response = await fetch(`http://localhost:3000/api/staff/${staffId}/bookings`, {
        method: 'GET',
        headers: { 
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', response.headers);
      
      // Check content type before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('Non-JSON response received:', textResponse.substring(0, 200));
        throw new Error('Server returned non-JSON response. Please check if the server is running correctly.');
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load staff bookings');
      }
      
      const bookings = data.data.bookings || [];
      
      // Create modal to display clients
      const modal = document.createElement('div');
      modal.id = 'staffClientsModal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
      
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const tableHeaderBg = isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6';
      const borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
      
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `background:var(--panel);color:var(--text);border-radius:8px;padding:2rem;max-width:800px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:var(--shadow);border:1px solid ${borderColor};`;
      
      let bookingsHTML = '';
      if (bookings.length === 0) {
        bookingsHTML = `<p style="text-align:center;color:var(--muted);padding:2rem;">No bookings found for this staff member.</p>`;
      } else {
        bookingsHTML = `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:${tableHeaderBg};text-align:left;">
                <th style="padding:0.75rem;border-bottom:2px solid ${borderColor};color:var(--muted);">Client</th>
                <th style="padding:0.75rem;border-bottom:2px solid ${borderColor};color:var(--muted);">Service</th>
                <th style="padding:0.75rem;border-bottom:2px solid ${borderColor};color:var(--muted);">Date & Time</th>
                <th style="padding:0.75rem;border-bottom:2px solid ${borderColor};color:var(--muted);">Status</th>
                <th style="padding:0.75rem;border-bottom:2px solid ${borderColor};color:var(--muted);">Payment</th>
              </tr>
            </thead>
            <tbody>
              ${bookings.map(booking => {
                const bookingDate = new Date(booking.BOOKING_DATE).toLocaleDateString();
                const bookingTime = booking.BOOKING_TIME || 'N/A';
                return `
                  <tr style="border-bottom:1px solid ${borderColor};">
                    <td style="padding:0.75rem;">
                      <div style="font-weight:600;color:var(--text);">${escapeHtml(booking.client_name || 'Guest')}</div>
                      <div style="font-size:0.875rem;color:var(--muted);">${escapeHtml(booking.client_email || 'N/A')}</div>
                      ${booking.client_phone ? `<div style="font-size:0.875rem;color:var(--muted);">${escapeHtml(booking.client_phone)}</div>` : ''}
                    </td>
                    <td style="padding:0.75rem;">
                      <div style="color:var(--text);">${escapeHtml(booking.SERVICE_NAME || 'N/A')}</div>
                      <div style="font-size:0.875rem;color:var(--muted);">₱${parseFloat(booking.service_price || 0).toFixed(2)}</div>
                    </td>
                    <td style="padding:0.75rem;">
                      <div style="color:var(--text);">${bookingDate}</div>
                      <div style="font-size:0.875rem;color:var(--muted);">${bookingTime}</div>
                    </td>
                    <td style="padding:0.75rem;">
                      <span style="padding:0.25rem 0.5rem;border-radius:4px;font-size:0.875rem;font-weight:500;background:${getStatusColor(booking.booking_status)};color:white;">
                        ${escapeHtml(booking.booking_status || 'N/A')}
                      </span>
                    </td>
                    <td style="padding:0.75rem;">
                      <span style="padding:0.25rem 0.5rem;border-radius:4px;font-size:0.875rem;font-weight:500;background:${getPaymentStatusColor(booking.payment_status)};color:white;">
                        ${escapeHtml(booking.payment_status || 'pending')}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }
      
      modalContent.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;border-bottom:2px solid ${borderColor};padding-bottom:1rem;">
          <div>
            <h2 style="margin:0;color:var(--text);">Clients for ${escapeHtml(staffName)}</h2>
            <p style="margin:0.5rem 0 0 0;color:var(--muted);">Total bookings: ${bookings.length}</p>
          </div>
          <button onclick="document.getElementById('staffClientsModal').remove()" class="action-btn confirm">Close</button>
        </div>
        ${bookingsHTML}
      `;
      
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      // Close modal when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
      
    } catch (err) {
      console.error('Failed to load staff clients:', err);
      showNotification('Error: ' + err.message, 'error');
    }
  };

  // Helper function for status colors
  function getStatusColor(status) {
    const colors = {
      'pending': '#f59e0b',
      'confirmed': '#10b981',
      'completed': '#3b82f6',
      'cancelled': '#ef4444',
      'pending_payment': '#f59e0b'
    };
    return colors[status] || '#6b7280';
  }

  // Helper function for payment status colors
  function getPaymentStatusColor(status) {
    const colors = {
      'pending': '#f59e0b',
      'paid': '#10b981',
      'partial': '#3b82f6',
      'failed': '#ef4444'
    };
    return colors[status] || '#6b7280';
  }
  
  window.addStaff = function() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    const modalHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;" id="addStaffModal">
        <div style="background:var(--panel);color:var(--text);border-radius:12px;padding:2rem;max-width:500px;width:90%;box-shadow:var(--shadow);border:1px solid rgba(15,23,42,0.1);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h2 style="margin:0;color:var(--text);">Add New Staff Member</h2>
            <button onclick="document.getElementById('addStaffModal').remove()" style="background:transparent;border:none;font-size:1.5rem;cursor:pointer;color:var(--muted);">✕</button>
          </div>
          
          <form id="addStaffForm" style="display:flex;flex-direction:column;gap:1rem;">
            <div>
              <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Full Name *</label>
              <input type="text" id="addFullName" required style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
            </div>
            
            <div>
              <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Email *</label>
              <input type="email" id="addEmail" required style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
            </div>
            
            <div>
              <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Phone</label>
              <input type="tel" id="addPhone" style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
            </div>
            
            <div>
              <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Role</label>
              <input type="text" id="addRole" value="Staff" style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
            </div>
            
            <div>
              <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:var(--text);">Gender</label>
              <select id="addGender" style="width:100%;padding:0.75rem;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'};border-radius:6px;font-size:1rem;background:var(--bg);color:var(--text);">
                <option value="">Not specified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            
            <div style="display:flex;gap:0.5rem;margin-top:1rem;">
              <button type="submit" class="action-btn confirm" style="flex:1;">Add Staff Member</button>
              <button type="button" onclick="document.getElementById('addStaffModal').remove()" class="action-btn" style="flex:1;">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Handle form submission
    document.getElementById('addStaffForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const staffData = {
        full_name: document.getElementById('addFullName').value,
        email: document.getElementById('addEmail').value,
        phone: document.getElementById('addPhone').value,
        role: document.getElementById('addRole').value,
        gender: document.getElementById('addGender').value
      };
      
      try {
        const token = getAuthToken();
        const response = await fetch('http://localhost:3000/api/staff', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(staffData)
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to add staff');
        }
        
        showNotification('Staff member added successfully', 'success');
        document.getElementById('addStaffModal').remove();
        loadStaffSection();
      } catch (error) {
        showNotification('Error: ' + error.message, 'error');
      }
    });
  };

  window.editService = function(id) {
    window.location.href = `editservice.html?id=${id}`;
  };

  window.deleteService = async function(id) {
    if (!confirm('Delete this service?')) return;
    try {
      const token = getAuthToken();
      const response = await fetch(`http://localhost:3000/api/services/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (response.ok) {
        showNotification('Service deleted', 'success');
        loadServicesSection();
      }
    } catch (err) {
      showNotification('Failed to delete service', 'error');
    }
  };

  // ===== BOOKING CALENDAR =====
  let currentCalendarMonth = new Date().getMonth();
  let currentCalendarYear = new Date().getFullYear();

  function initializeCalendar() {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentCalendarMonth--;
        if (currentCalendarMonth < 0) {
          currentCalendarMonth = 11;
          currentCalendarYear--;
        }
        renderCalendar();
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentCalendarMonth++;
        if (currentCalendarMonth > 11) {
          currentCalendarMonth = 0;
          currentCalendarYear++;
        }
        renderCalendar();
      });
    }
    
    renderCalendar();
  }

  function renderCalendar() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthTitle = document.getElementById('currentMonth');
    const calendarGrid = document.getElementById('calendarGrid');
    
    if (!monthTitle || !calendarGrid) return;
    
    monthTitle.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;
    
    // Get bookings for this month
    const bookedDates = new Set();
    if (appointments && appointments.length > 0) {
      appointments.forEach(appt => {
        if (appt.date) {
          const apptDate = new Date(appt.date);
          if (apptDate.getMonth() === currentCalendarMonth && 
              apptDate.getFullYear() === currentCalendarYear) {
            bookedDates.add(apptDate.getDate());
          }
        }
      });
    }
    
    // Get first day of month and total days
    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentCalendarMonth && 
                          today.getFullYear() === currentCalendarYear;
    const todayDate = isCurrentMonth ? today.getDate() : -1;
    
    // Clear calendar
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
      const dayHeader = document.createElement('div');
      dayHeader.textContent = day;
      dayHeader.className = 'calendar-day-header';
      calendarGrid.appendChild(dayHeader);
    });
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.style.cssText = 'padding: 0.75rem; text-align: center;';
      calendarGrid.appendChild(emptyCell);
    }
    
    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCell = document.createElement('div');
      dayCell.textContent = day;
      dayCell.className = 'calendar-day';
      
      // Check if this day has bookings
      if (bookedDates.has(day)) {
        dayCell.classList.add('has-booking');
      }
      
      // Check if today
      if (day === todayDate) {
        dayCell.classList.add('today');
      }
      
      // Add click handler to show bookings for that day
      if (bookedDates.has(day)) {
        dayCell.addEventListener('click', () => showDayBookings(day));
      }
      
      calendarGrid.appendChild(dayCell);
    }
  }

  function showDayBookings(day) {
    const selectedDate = new Date(currentCalendarYear, currentCalendarMonth, day);
    const dateStr = selectedDate.toISOString().split('T')[0];
    
    const dayBookings = appointments.filter(appt => {
      if (!appt.date) return false;
      const apptDate = new Date(appt.date).toISOString().split('T')[0];
      return apptDate === dateStr;
    });
    
    if (dayBookings.length === 0) return;
    
    // Create modal to show bookings
    const modal = document.createElement('div');
    modal.id = 'dayBookingsModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background:var(--panel);color:var(--text);border-radius:12px;padding:2rem;max-width:700px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:var(--shadow);border:1px solid rgba(15,23,42,0.1);';
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const headerBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
    const tableHeaderBg = isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6';
    const tableBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb';
    
    modalContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;border-bottom:2px solid ${headerBorder};padding-bottom:1rem;">
        <h2 style="margin:0;color:var(--text);">Bookings for ${selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
        <button onclick="document.getElementById('dayBookingsModal').remove()" class="action-btn danger">Close</button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:${tableHeaderBg};text-align:left;">
            <th style="padding:0.75rem;border-bottom:2px solid ${tableBorder};color:var(--text);">Time</th>
            <th style="padding:0.75rem;border-bottom:2px solid ${tableBorder};color:var(--text);">Client</th>
            <th style="padding:0.75rem;border-bottom:2px solid ${tableBorder};color:var(--text);">Service</th>
            <th style="padding:0.75rem;border-bottom:2px solid ${tableBorder};color:var(--text);">Staff</th>
            <th style="padding:0.75rem;border-bottom:2px solid ${tableBorder};color:var(--text);">Status</th>
          </tr>
        </thead>
        <tbody>
          ${dayBookings.map(booking => `
            <tr style="border-bottom:1px solid ${tableBorder};">
              <td style="padding:0.75rem;color:var(--text);">${escapeHtml(formatTime(booking.time))}</td>
              <td style="padding:0.75rem;color:var(--text);">${escapeHtml(booking.client)}</td>
              <td style="padding:0.75rem;color:var(--text);">${escapeHtml(booking.service)}</td>
              <td style="padding:0.75rem;color:var(--text);">${escapeHtml(booking.staff || '—')}</td>
              <td style="padding:0.75rem;">
                <span style="padding:0.25rem 0.5rem;border-radius:4px;font-size:0.875rem;font-weight:500;background:${getStatusColor(booking.status)};color:white;">
                  ${escapeHtml(capitalizeFirst(booking.status || 'pending'))}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Initialize calendar when dashboard is loaded
  const originalLoadDashboard = loadDashboardSection;
  loadDashboardSection = function() {
    originalLoadDashboard();
    initializeCalendar();
  };

})();

