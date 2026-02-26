// admin/dashboard.js — stable admin bootstrap

function checkAuth() {
  const raw = localStorage.getItem('sx_auth');
  try {
    const obj = JSON.parse(raw);
    if (!obj || !obj.ok) throw new Error('bad');
  } catch (e) {
    console.log('no valid auth, redirecting');
    location.href = './login.html';
  }
}
checkAuth();

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('sx_auth');
    location.href = './login.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const zoneEl = document.getElementById('adsDropzone');
  const msgEl = document.getElementById('adsMessage');
  const listEl = document.getElementById('adsList');
  const installEl = document.getElementById('currentInstall');

  // Quick boot logs (helps spot cache/404 immediately)
  console.log('[ADMIN] has config:', !!window.SUPABASE_URL, !!window.SUPABASE_ANON_KEY);
  console.log('[ADMIN] has helpers:', typeof window.getSupabaseConfig, typeof window.isSupabaseConfigured);
  console.log('[ADMIN] has supabase lib:', !!window.supabase);
  console.log('[ADMIN] has admin functions:', typeof initSupabaseClient, typeof initUploadZone, typeof renderAdsList);

  // If helpers missing -> supabase-config.js not loaded (likely 404/cache)
  if (typeof window.getSupabaseConfig !== 'function' || typeof window.isSupabaseConfigured !== 'function') {
    if (zoneEl) {
      zoneEl.textContent = '❌ Mangler supabase-config.js (helpers)';
      zoneEl.style.color = '#dc2626';
    }
    updateStatusPanel();
    return;
  }

  // Show install slug
  const cfg = window.getSupabaseConfig();
  if (installEl) installEl.textContent = cfg.installSlug || 'ukjent';

  // Init client (from admin-ads.js)
  const client = (typeof initSupabaseClient === 'function') ? await initSupabaseClient() : null;

  if (!client) {
    if (zoneEl) {
      zoneEl.textContent = '❌ Supabase ikke konfigurert / ikke tilkoblet';
      zoneEl.style.color = '#dc2626';
    }
    updateStatusPanel();
    return;
  }

  // Init upload + list
  if (typeof initUploadZone === 'function') {
    initUploadZone(zoneEl, msgEl, () => renderAdsList(listEl, msgEl));
  }
  if (typeof renderAdsList === 'function') {
    renderAdsList(listEl, msgEl);
  }

  updateStatusPanel();
});

// Called by Refresh button
async function refreshAdsPanel() {
  const listEl = document.getElementById('adsList');
  const msgEl = document.getElementById('adsMessage');
  if (msgEl) msgEl.textContent = 'Oppdaterer…';
  if (typeof renderAdsList === 'function') await renderAdsList(listEl, msgEl);
  if (msgEl) msgEl.textContent = '';
}

async function updateStatusPanel() {
  const statusEl = document.getElementById('statusContent');
  if (!statusEl) return;

  const configured = (typeof window.isSupabaseConfigured === 'function') && window.isSupabaseConfigured();
  const cfg = (typeof window.getSupabaseConfig === 'function') ? window.getSupabaseConfig() : {};

  const statusHtml = configured
    ? `✅ Supabase konfigurert<br>Installasjon: <strong>${cfg.installSlug || 'ukjent'}</strong>`
    : `❌ Supabase ikke konfigurert<br>Sjekk at config.js + supabase-config.js lastes`;

  statusEl.innerHTML = `<p>${statusHtml}</p>`;
}