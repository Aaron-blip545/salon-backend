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
        
        // Determine if actions should be shown
        const isConfirmed = appt.status === 'confirmed';
        const isCanceled = appt.status === 'canceled';
        const showActions = !isConfirmed && !isCanceled;
        
        tr.innerHTML = `
          <td>${escapeHtml(appt.client)}</td>
          <td>${escapeHtml(appt.service)}</td>
          <td>${escapeHtml(formatDate(appt.date))}</td>
          <td>${escapeHtml(appt.time)}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td>
            ${showActions ? `
              <button class="action-btn confirm" data-id="${appt.id}">Confirm</button>
              <button class="action-btn cancel" data-id="${appt.id}">Cancel</button>
            ` : '-'}
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

  function updateSummaryStats(){
    totalBookingsEl.textContent = appointments ? appointments.length : 0;
    const revenueValue = appointments && appointments.length ? 
      appointments.filter(a=>a.status==='confirmed').reduce((s,a)=>s+(parseFloat(a.price)||0),0) : 0;
    revenueEl.textContent = formatCurrency(revenueValue);
    activeClientsEl.textContent = appointments && appointments.length ? new Set(appointments.map(a=>a.client)).size : 0;
    newClientsEl.textContent = 0; // placeholder - could calculate from booking dates
  }

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
      
      const data = await response.json();
      const payload = Array.isArray(data) ? data : (data && data.data ? data.data : []);
      
      if(Array.isArray(payload)){
        appointments = payload.map((b)=>({
          id: b.BOOKING_ID || b.id,
          client: b.client_name || b.CLIENT_NAME || b.USERNAME || 'Client',
          service: b.SERVICE_NAME || b.service || 'Service',
          date: b.BOOKING_DATE || b.booking_date || b.date || '',
          time: b.BOOKING_TIME || b.booking_time || b.time || '',
          status: (b.booking_status || b.STATUS || b.status || b.status_name || 'pending').toLowerCase(),
          price: parseFloat(b.service_price || b.PRICE || b.price || 0)
        }));
        
        renderAppointments();
        updateChart();
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
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  
  refreshBtn.addEventListener('click', ()=>{ 
    fetchBookings(); 
    fetchAnalytics();
  });
  
  loadSampleBtn.addEventListener('click', ()=>{ 
    // Sample data for testing
    appointments = [
      {id:1,client:'John Doe',service:'Haircut',date:'2025-11-20',time:'10:00 AM',status:'pending',price:500},
      {id:2,client:'Jane Smith',service:'Manicure',date:'2025-11-21',time:'2:00 PM',status:'confirmed',price:300}
    ];
    renderAppointments(); 
    updateChart(); 
  });

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
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      
      // Handle section navigation within the page
      if (href && href.startsWith('#')) {
        e.preventDefault();
        
        // Update active state
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        link.classList.add('active');
        
        const section = href.substring(1); // Remove #
        
        // Hide all sections
        document.querySelector('.content > .grid').style.display = 'grid';
        const analyticsSection = document.getElementById('analyticsSection');
        const reportsSection = document.getElementById('reportsSection');
        if (analyticsSection) analyticsSection.classList.add('hidden');
        if (reportsSection) reportsSection.classList.add('hidden');
        
        // Update page title and content based on section
        const titleEl = document.querySelector('.main-header h1');
        const subtitleEl = document.querySelector('.main-header .muted');
        
        switch(section) {
          case 'bookings':
            if (titleEl) titleEl.textContent = 'Bookings Management';
            if (subtitleEl) subtitleEl.textContent = 'View and manage all customer bookings';
            document.querySelector('.content > .grid').style.display = 'grid';
            break;
          case 'analytics':
            if (titleEl) titleEl.textContent = 'Analytics';
            if (subtitleEl) subtitleEl.textContent = 'Performance metrics and insights';
            document.querySelector('.content > .grid').style.display = 'none';
            if (analyticsSection) {
              analyticsSection.classList.remove('hidden');
              initAnalytics();
            }
            break;
          case 'reports':
            if (titleEl) titleEl.textContent = 'Reports';
            if (subtitleEl) subtitleEl.textContent = 'Generate and download reports';
            document.querySelector('.content > .grid').style.display = 'none';
            if (reportsSection) {
              reportsSection.classList.remove('hidden');
              initReports();
            }
            break;
          default:
            if (titleEl) titleEl.textContent = 'Dashboard';
            if (subtitleEl) subtitleEl.textContent = 'Overview of bookings and performance';
            document.querySelector('.content > .grid').style.display = 'grid';
        }
      }
      // External links (like editservice.html) will navigate normally
    });
  });

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
    let html = '<h3>Revenue by Service</h3><table style="width:100%; border-collapse: collapse;"><tr style="background: #f3f4f6;"><th style="padding:10px; text-align:left;">Service</th><th style="padding:10px; text-align:right;">Revenue</th></tr>';
    
    Object.entries(revenueByService).forEach(([service, revenue]) => {
      html += `<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding:10px;">${service}</td><td style="padding:10px; text-align:right;">${formatCurrency(revenue)}</td></tr>`;
    });
    
    const total = Object.values(revenueByService).reduce((a,b) => a+b, 0);
    html += `<tr style="font-weight:bold; background:#f9fafb;"><td style="padding:10px;">TOTAL</td><td style="padding:10px; text-align:right;">${formatCurrency(total)}</td></tr></table>`;
    
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

})();
