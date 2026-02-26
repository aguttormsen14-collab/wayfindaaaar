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

function showBootError(message, details) {
  const zoneEl = document.getElementById('adsDropzone');
  const statusEl = document.getElementById('statusContent');

  const html = `
    <div style="padding:10px; border:1px solid #fecaca; background:#fff1f2; color:#991b1b; border-radius:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
      <div style="font-weight:700; margin-bottom:6px;">Setup Error</div>
      <div style="white-space:pre-wrap;">${message}</div>
      ${details ? `<div style="margin-top:8px; opacity:0.9; white-space:pre-wrap;">${details}</div>` : ''}
    </div>
  `;

  if (zoneEl) {
    zoneEl.innerHTML = html;
    zoneEl.classList.remove('drag-active');
  }
  if (statusEl) {
    statusEl.innerHTML = html;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const zoneEl = document.getElementById('adsDropzone');
  const msgEl = document.getElementById('adsMessage');
  const listEl = document.getElementById('adsList');
  const installEl = document.getElementById('currentInstall');

  // Cache-safe boot lines
  const now = new Date().toISOString();
  console.log('[BOOT]', now, 'dashboard.js loaded');

  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) console.log('[BOOT] config loaded');
  else console.warn('[BOOT] config missing');

  if (typeof window.getSupabaseConfig === 'function' && typeof window.isSupabaseConfigured === 'function') console.log('[BOOT] helpers loaded');
  else console.warn('[BOOT] helpers missing');

  if (window.supabase) console.log('[BOOT] supabase loaded');
  else console.warn('[BOOT] supabase missing');

  // If helpers missing -> supabase-config.js not loaded (likely 404/cache)
  if (typeof window.getSupabaseConfig !== 'function' || typeof window.isSupabaseConfigured !== 'function') {
    const tried = new URL('../supabase-config.js', location.href).toString();
    showBootError(
      'Mangler supabase-config.js (helpers).',
      `Åpne denne URL-en i nettleseren (må ikke være 404):\n${tried}\n\nSjekk Network-fanen for 404 og hard-reload (Ctrl+F5).`
    );
    updateStatusPanel();
    return;
  }

  // If config missing
  if (!window.isSupabaseConfigured()) {
    const tried = new URL('../config.js', location.href).toString();
    showBootError(
      'Mangler SUPABASE_URL / SUPABASE_ANON_KEY fra config.js.',
      `Åpne denne URL-en i nettleseren (må ikke være 404):\n${tried}`
    );
    updateStatusPanel();
    return;
  }

  // If supabase client not ready (singleton should have replaced the global)
  const s = window.supabase;
  const supabaseReady = !!(s && s.storage && typeof s.createClient !== 'function');
  if (!supabaseReady) {
    showBootError(
      'Supabase CDN-biblioteket er ikke lastet eller klienten er ikke klar.',
      'Sjekk at v2‑CDN lastes med 200 i Network og at supabase-config.js kjører uten feil.'
    );
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