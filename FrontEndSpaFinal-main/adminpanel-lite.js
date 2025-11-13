// adminpanel-lite.js — minimal admin page behavior for other admin pages
(function(){
  // Theme handling
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('theme') || 'light';
  function setTheme(t){
    if(!t) return;
    if(t === 'dark'){
      document.documentElement.setAttribute('data-theme','dark');
      if(themeToggle) themeToggle.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if(themeToggle) themeToggle.textContent = '🌙';
    }
  }
  setTheme(savedTheme);
  if(themeToggle){
    themeToggle.addEventListener('click', ()=>{
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
      localStorage.setItem('theme', next);
    });
  }

  // Admin access guard
  function ensureAdminAccess(){
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
    const role = (localStorage.getItem('role') || '').toString().toLowerCase();
    if(!token || role !== 'admin'){
      ['token','authToken','jwt','role'].forEach(k=>localStorage.removeItem(k));
      window.location.replace('loginform.html');
      return false;
    }
    return true;
  }
  ensureAdminAccess();
  window.addEventListener('pageshow', (evt)=>{ if(evt.persisted) ensureAdminAccess(); });

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      ['token','authToken','jwt','role'].forEach(k=>localStorage.removeItem(k));
      window.location.href = 'loginform.html';
    });
  }
})();
