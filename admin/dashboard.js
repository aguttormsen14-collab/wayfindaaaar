// admin/dashboard.js — stable admin bootstrap with Supabase Auth

// ===== SECURITY: Access guard (role + tenant validation) =====
(async function checkAccess() {
  const client = window.supabaseClient;
  if (!client) {
    console.error('[DASHBOARD] Supabase client not initialized');
    window.location.href = "/admin/login.html";
    return;
  }

  const { data: sessionData } = await client.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "/admin/login.html";
    return;
  }

  const user = sessionData.session.user;

  const { data: roleData, error } = await client
    .from("user_roles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !roleData) {
    alert("Ingen tilgang");
    await client.auth.signOut();
    window.location.href = "/admin/login.html";
    return;
  }

  const currentInstall =
    new URLSearchParams(window.location.search).get("install");

  if (roleData.install_slug !== currentInstall) {
    alert("Feil installasjon");
    window.location.href = "/admin/login.html";
    return;
  }
})();

async function checkAuth() {
  const { user, error } = await adminGetSession();
  
  if (!user || error) {
    console.log('[ADMIN] No valid session, redirecting to login');
    location.href = './login.html';
    return false;
  }
  
  console.log('[ADMIN] User authenticated:', user.email);
  return true;
}

// Perform auth check immediately
let authCheckPromise = checkAuth();

// helper for dynamic supabase client retrieval (mirrors admin-ads.js)
function getSupabase() {
  const s = window.supabaseClient;
  if (s && s.storage) return s;
  return null;
}

// Logout with Supabase Auth
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await adminSignOut();
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

  // If supabase client not ready
  const s = window.supabaseClient;
  const supabaseReady = !!(s && s.storage);
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

  // ensure supabase client is ready before interacting with UI
  const supabase = getSupabase();
  if (!supabase) {
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

  // AUDIT: Init playlist editor
  await refreshPlaylistEditor();
  
  // AUDIT: Init weather settings
  await refreshWeatherSettings();

  // demo orientation/weather controls
  const orientRadios = document.querySelectorAll('input[name="orientation"]');
  const previewEl = document.getElementById('orientationPreview');
  const orientMsg = document.getElementById('orientationMessage');
  function updateOrientation(){
    const val = localStorage.getItem('sx_orientation') || 'portrait';
    orientRadios.forEach(r=> r.checked = (r.value===val));
    if(previewEl) previewEl.className = 'preview '+val;
  }
  orientRadios.forEach(r=> r.addEventListener('change', () => {
    const val = r.value;
    localStorage.setItem('sx_orientation', val);
    updateOrientation();
    if(orientMsg) orientMsg.textContent = `✅ Lagret: ${val==='landscape'?'Vannrett':'Loddrett'}`;
  }));
  updateOrientation();

  const weatherToggle = document.getElementById('weatherToggle');
  const weatherPreview = document.getElementById('weatherPreview');
  const weatherMsg = document.getElementById('weatherMessage');
  function updateWeather(){
    const enabled = localStorage.getItem('sx_weather_enabled') === 'true';
    if(weatherToggle) weatherToggle.checked = enabled;
    if(weatherPreview) weatherPreview.classList.toggle('hidden', !enabled);
  }
  if(weatherToggle){
    weatherToggle.addEventListener('change', () => {
      const enabled = weatherToggle.checked;
      localStorage.setItem('sx_weather_enabled', enabled?'true':'false');
      updateWeather();
      if(weatherMsg) weatherMsg.textContent = enabled ? '✅ Vær-widget aktivert' : '';
    });
  }
  const addWeatherBtn = document.getElementById('addWeatherBtn');
  if(addWeatherBtn){
    addWeatherBtn.addEventListener('click', () => {
      localStorage.setItem('sx_weather_enabled','true');
      updateWeather();
      if(weatherMsg) weatherMsg.textContent = '🌦️ Demo: Vær-widget lagt til (ikke aktiv ennå)';
    });
  }
  updateWeather();

  updateStatusPanel();

  // DEBUG MODE: Press D to enable/disable dragging & resizing
  let debugMode = false;
  let draggedEl = null;
  let offsetX = 0;
  let offsetY = 0;
  let isResizing = false;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let debugInfo = null;

  function createDebugInfo() {
    const info = document.createElement('div');
    info.id = 'debugInfo';
    info.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(0,0,0,0.9);
      color: #0f0;
      font-family: monospace;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 99998;
      line-height: 1.6;
      border: 2px solid #0f0;
    `;
    info.innerHTML = `
      <div>🐛 DEBUG INFO</div>
      <div id="debugDims" style="margin-top: 8px;">x: 0 | y: 0 | w: 0 | h: 0</div>
      <div style="margin-top: 8px; font-size: 11px; color: #0a0;">
        <div>📍 Shift+Dra = RESIZE</div>
        <div>👆 Normal Dra = MOVE</div>
      </div>
    `;
    document.body.appendChild(info);
    return info;
  }

  function updateDebugInfo(el) {
    if (!debugInfo) return;
    const dims = document.getElementById('debugDims');
    if (dims && el) {
      const rect = el.getBoundingClientRect();
      dims.textContent = `x: ${Math.round(rect.left)} | y: ${Math.round(rect.top)} | w: ${Math.round(rect.width)} | h: ${Math.round(rect.height)}`;
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      debugMode = !debugMode;
      document.body.classList.toggle('debug-mode', debugMode);
      console.log(`🐛 Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
      
      if (debugMode) {
        debugInfo = createDebugInfo();
        const draggables = document.querySelectorAll('.logo, .panel, .title, button');
        draggables.forEach(el => {
          el.style.cursor = 'grab';
          el.addEventListener('mousedown', startDrag);
        });
        
        alert('🐛 DEBUG MODE ON\n\n👆 Dra elementer for å flytte\n⬆️ Shift+Dra for å strekke/resize\n\nInfo vises nederst til venstre!');
      } else {
        if (debugInfo) debugInfo.remove();
        debugInfo = null;
        const draggables = document.querySelectorAll('.logo, .panel, .title, button');
        draggables.forEach(el => {
          el.style.cursor = '';
          el.removeEventListener('mousedown', startDrag);
          el.style.position = '';
          el.style.left = '';
          el.style.top = '';
          el.style.width = '';
          el.style.height = '';
        });
      }
    }
  });

  function startDrag(e) {
    if (!debugMode) return;
    draggedEl = e.target.closest('.logo, .panel, .title, button') || e.target;
    if (!draggedEl) return;

    e.preventDefault();
    isResizing = e.shiftKey;
    
    if (isResizing) {
      draggedEl.style.position = 'fixed';
      draggedEl.style.zIndex = '9999';
      draggedEl.style.cursor = 'nwse-resize';
      
      const rect = draggedEl.getBoundingClientRect();
      resizeStartWidth = rect.width;
      resizeStartHeight = rect.height;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
    } else {
      draggedEl.style.position = 'fixed';
      draggedEl.style.zIndex = '9999';
      draggedEl.style.cursor = 'grabbing';

      const rect = draggedEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    }

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  }

  function drag(e) {
    if (!draggedEl || !debugMode) return;
    
    if (isResizing) {
      const deltaX = e.clientX - resizeStartX;
      const deltaY = e.clientY - resizeStartY;
      const newWidth = Math.max(50, resizeStartWidth + deltaX);
      const newHeight = Math.max(50, resizeStartHeight + deltaY);
      
      draggedEl.style.width = newWidth + 'px';
      draggedEl.style.height = newHeight + 'px';
    } else {
      draggedEl.style.left = (e.clientX - offsetX) + 'px';
      draggedEl.style.top = (e.clientY - offsetY) + 'px';
    }
    
    updateDebugInfo(draggedEl);
  }

  function stopDrag() {
    if (draggedEl) {
      draggedEl.style.cursor = debugMode ? 'grab' : '';
      updateDebugInfo(draggedEl);
    }
    draggedEl = null;
    isResizing = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }
});

// Called by Refresh button
async function refreshAdsPanel() {
  const listEl = document.getElementById('adsList');
  const msgEl = document.getElementById('adsMessage');
  if (msgEl) msgEl.textContent = 'Oppdaterer…';
  if (typeof renderAdsList === 'function') await renderAdsList(listEl, msgEl);
  if (msgEl) msgEl.textContent = '';
}

// AUDIT: Refresh playlist editor
async function refreshPlaylistEditor() {
  const containerEl = document.getElementById('playlistEditor');
  if (!containerEl) return;
  if (typeof renderPlaylistEditor === 'function') {
    await renderPlaylistEditor(containerEl);
  }
}

// AUDIT: Refresh weather settings
async function refreshWeatherSettings() {
  const containerEl = document.getElementById('weatherSettings');
  if (!containerEl) return;
  if (typeof renderWeatherSettings === 'function') {
    await renderWeatherSettings(containerEl);
  }
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