// adminpanel.js - handles theme, sample data, table rendering and chart
(function(){
  const root = document.documentElement;
  const app = document.getElementById('app');
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

  // Start with no appointments by default. The UI will show an empty state until bookings exist.
  

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
        tr.innerHTML = `
          <td>${escapeHtml(appt.client)}</td>
          <td>${escapeHtml(appt.service)}</td>
          <td>${escapeHtml(appt.date)}</td>
          <td>${escapeHtml(appt.time)}</td>
          <td><span class="badge ${appt.status.toLowerCase()}">${appt.status}</span></td>
          <td>
            <button class="action-btn confirm" data-id="${appt.id}">Confirm</button>
            <button class="action-btn cancel" data-id="${appt.id}">Cancel</button>
          </td>
        `;
        appointmentsTableBody.appendChild(tr);
      });

      // bind action buttons
      document.querySelectorAll('.action-btn.confirm').forEach(btn=>btn.addEventListener('click', onConfirm));
      document.querySelectorAll('.action-btn.cancel').forEach(btn=>btn.addEventListener('click', onCancel));
    }

    // summary (always update)
    totalBookingsEl.textContent = appointments ? appointments.length : 0;
    const revenueValue = appointments && appointments.length ? appointments.filter(a=>a.status!=='Canceled').reduce((s,a)=>s+a.price,0) : 0;
    revenueEl.textContent = formatCurrency(revenueValue);
    activeClientsEl.textContent = appointments && appointments.length ? new Set(appointments.map(a=>a.client)).size : 0;
    newClientsEl.textContent = 0; // placeholder
  }

  function onConfirm(e){
    const id = Number(e.currentTarget.dataset.id);
    const appt = appointments.find(a=>a.id===id);
    if(appt){
      appt.status = 'Confirmed';
      renderAppointments();
      updateChart();
    }
  }
  function onCancel(e){
    const id = Number(e.currentTarget.dataset.id);
    const appt = appointments.find(a=>a.id===id);
    if(appt){
      appt.status = 'Canceled';
      renderAppointments();
      updateChart();
    }
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
    const confirmed = appointments.filter(a=>a.status==='Confirmed').length;
    const pending = appointments.filter(a=>a.status==='Pending').length;
    const canceled = appointments.filter(a=>a.status==='Canceled').length;
    return [confirmed,pending,canceled];
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>\"]/g, function(tag){
      const chars = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
      return chars[tag] || tag;
    });
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

  // initialize
  // bind empty-state buttons
  const refreshBtn = document.getElementById('refreshBtn');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  refreshBtn.addEventListener('click', ()=>{ fetchBookings(); });
  loadSampleBtn.addEventListener('click', ()=>{ appointments = sampleAppointments.slice(); renderAppointments(); updateChart(); });

  // Logout handler: clear stored auth and redirect to login form
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      // Clear common auth keys
      ['token','authToken','jwt','role'].forEach(k=>localStorage.removeItem(k));
      // Optionally clear other app state
      window.location.href = 'loginform.html';
    });
  }

  renderAppointments();
  initChart();

  // Try fetch on load (safe - won't crash if endpoint missing). We call the admin endpoint (/all) which requires an authenticated admin JWT.
  fetchBookings();

  // Attempt to fetch bookings from API (safe fallback to empty)
  function fetchBookings(){
    // Call the admin endpoint that returns all bookings. This route requires authentication and admin role.
    const url = '/api/bookings/all';
    if(!window.fetch) return;
    // Try to include JWT from localStorage under common keys
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
    const headers = {};
    if(token) headers['Authorization'] = 'Bearer ' + token;

    fetch(url, {method:'GET', headers}).then(r=>{
      if(!r.ok) throw new Error('No bookings endpoint');
      return r.json();
    }).then(data=>{
      // The controllers in this project return an object { success, message, data }.
      // Normalize to accept either an array or the { data: [...] } shape.
      const payload = Array.isArray(data) ? data : (data && data.data ? data.data : []);
      if(Array.isArray(payload) && payload.length){
        // map to expected shape if necessary
        appointments = payload.map((b,i)=>({
          id: b.BOOKING_ID || b.id || i+1,
          client: b.CLIENT_NAME || b.client || b.user || b.USERNAME || b.name || 'Client',
          service: b.SERVICE_NAME || b.service || 'Service',
          date: b.DATE || b.booking_date || b.date || '',
          time: b.TIME || b.booking_time || b.time || '',
          status: (b.STATUS || b.status || b.status_name || 'Pending'),
          price: b.PRICE || b.price || 0
        }));
        renderAppointments();
        updateChart();
      }
    }).catch(err=>{
      // no API available or network error — keep empty state
      console.warn('Could not fetch bookings from API (this is optional):', err.message);
    });
  }

})();
