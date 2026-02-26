// Admin Dashboard App

// Check auth first
function checkAuth() {
  const raw = localStorage.getItem('sx_auth');
  try {
    const obj = JSON.parse(raw);
    if (!obj || !obj.ok) throw new Error('bad');
    return;
  } catch (e) {
    console.log('no valid auth, redirecting');
    location.href = './login.html';
  }
}

checkAuth();

// Logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('sx_auth');
    location.href = './login.html';
  });
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Supabase client (from admin-ads.js)
  await initSupabaseClient();
  
  // Show current install
  const cfg = window.getSupabaseConfig();
  const installEl = document.getElementById('currentInstall');
  if (installEl) {
    installEl.textContent = cfg.installSlug;
  }
  
  // Initialize ads panel
  const zoneEl = document.getElementById('adsDropzone');
  const msgEl = document.getElementById('adsMessage');
  const listEl = document.getElementById('adsList');
  
  if (!window.isSupabaseConfigured()) {
    if (zoneEl) {
      zoneEl.textContent = '❌ Supabase ikke konfigurert';
      zoneEl.style.color = '#dc2626';
    }
  } else {
    initUploadZone(zoneEl, msgEl, () => {
      renderAdsList(listEl, msgEl);
    });
    renderAdsList(listEl, msgEl);
  }
  
  // Initialize status panel
  updateStatusPanel();
});

// Refresh ads list
async function refreshAdsPanel() {
  const listEl = document.getElementById('adsList');
  const msgEl = document.getElementById('adsMessage');
  if (msgEl) msgEl.textContent = 'Oppdaterer…';
  await renderAdsList(listEl, msgEl);
  if (msgEl) msgEl.textContent = '';
}

// Update status panel
async function updateStatusPanel() {
  const statusEl = document.getElementById('statusContent');
  if (!statusEl) return;
  
  const isConfigured = window.isSupabaseConfigured();
  const cfg = window.getSupabaseConfig();
  const status = isConfigured
    ? `✅ Supabase tilkoblet\nInstallasjon: <strong>${cfg.installSlug}</strong>`
    : `❌ Supabase ikke konfigurert\nKonfigurer config.js`;
  
  statusEl.innerHTML = `<p>${status.split('\n').join('<br>')}</p>`;
}

