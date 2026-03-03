// admin/dashboard.js — stable admin bootstrap with Supabase Auth

// ===== SECURITY: Access guard (role + tenant validation) =====
(async function checkAccess() {
  try {
    const client = window.supabaseClient;
    if (!client) {
      console.error('[DASHBOARD] Supabase client not initialized');
      window.location.replace('./login.html');
      return;
    }

    const { data: sessionData } = await client.auth.getSession();

    if (!sessionData.session) {
      window.location.replace('./login.html');
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
      window.location.replace('./login.html');
      return;
    }

    const normalizeSlug = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
    const roleInstall = normalizeSlug(roleData.install_slug);
    const params = new URLSearchParams(window.location.search);
    const installFromQuery = normalizeSlug(params.get("install"));

    // Enforce tenant check only when install is explicitly requested in URL
    if (installFromQuery && roleInstall !== installFromQuery) {
      alert("Feil installasjon");
      window.location.replace('./login.html');
      return;
    }

    // If install is missing in URL, lock URL to user's tenant for consistent behavior
    if (!installFromQuery && roleInstall) {
      params.set('install', roleInstall);
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', next);
    }
  } catch (e) {
    console.error('[DASHBOARD] Access guard failed:', e);
    window.location.replace('./login.html');
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

  if (typeof window.isSupabaseConfigured === 'function' && window.isSupabaseConfigured()) console.log('[BOOT] config loaded');
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
  await initScreenEditor(supabase, cfg);

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

const screenEditorState = {
  supabase: null,
  cfg: null,
  data: null,
  currentScreenId: null,
  selectedHotspotId: null,
  autosaveTimer: null,
  saving: false,
  queued: false,
};

function editorStatusClass(type) {
  if (type === 'ok') return 'screen-editor-status-ok';
  if (type === 'error') return 'screen-editor-status-error';
  return 'screen-editor-status-warn';
}

function setScreenEditorStatus(message, type = 'warn') {
  const el = document.getElementById('screenEditorStatus');
  if (!el) return;
  el.className = `message ${editorStatusClass(type)}`;
  el.textContent = message;
}

function withBase(path) {
  const base = window.SX_BASE_PATH || '/';
  return `${base}${path}`.replace(/\/\/+/, '/');
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function screensConfigPath(installSlug) {
  return `installs/${installSlug}/config/screens.json`;
}

function getCurrentEditorScreenConfig() {
  const { data, currentScreenId } = screenEditorState;
  if (!data || !currentScreenId) return null;
  return data.screens?.[currentScreenId] || null;
}

function ensureScreenPulses(screenCfg) {
  if (!Array.isArray(screenCfg.pulses)) {
    screenCfg.pulses = [];
  }
  return screenCfg.pulses;
}

function makePulseId(screenCfg) {
  const pulses = ensureScreenPulses(screenCfg);
  const base = 'pulse';
  let idx = pulses.length + 1;
  while (pulses.some((pulse) => pulse.id === `${base}_${idx}`)) {
    idx += 1;
  }
  return `${base}_${idx}`;
}

function getScreenBgUrl(installSlug, rawBg, screenId) {
  if (typeof rawBg !== 'string' || !rawBg.trim()) {
    return withBase(`installs/${installSlug}/assets/screens/${screenId}.png`);
  }
  const bg = rawBg.trim();
  if (bg.startsWith('http://') || bg.startsWith('https://') || bg.startsWith('data:')) return bg;
  if (bg.startsWith('/')) return bg;
  if (bg.includes('/')) return withBase(bg);
  return withBase(`installs/${installSlug}/assets/screens/${bg}`);
}

async function loadScreensConfigForEditor() {
  const { supabase, cfg } = screenEditorState;
  const path = screensConfigPath(cfg.installSlug);

  const acceptConfig = (parsed) => {
    if (!parsed || typeof parsed !== 'object' || !parsed.screens || !parsed.screenOrder) {
      return false;
    }
    screenEditorState.data = parsed;
    const firstScreen = parsed.screenOrder.find((id) => parsed.screens[id]);
    screenEditorState.currentScreenId = firstScreen || null;
    return true;
  };

  try {
    const { data, error } = await supabase.storage.from(cfg.bucket).download(path);
    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      if (!acceptConfig(parsed)) {
        setScreenEditorStatus('Ugyldig screens.json format i Storage', 'error');
        return false;
      }
      return true;
    }

    const localSeedPath = withBase(`installs/${cfg.installSlug}/config/screens.json`);
    try {
      const seedRes = await fetch(localSeedPath, { cache: 'no-store' });
      if (seedRes.ok) {
        const seedParsed = await seedRes.json();
        if (acceptConfig(seedParsed)) {
          setScreenEditorStatus('Fant ikke screens.json i Storage. Bruker lokal seed – trykk «Lagre nå» for å opprette.', 'warn');
          return true;
        }
      }
    } catch (seedErr) {
      console.warn('[SCREEN EDITOR] Local seed load failed:', seedErr);
    }

    setScreenEditorStatus(`Fant ikke screens.json i Storage (${error?.message || 'ukjent feil'})`, 'error');
    return false;
  } catch (e) {
    console.error('[SCREEN EDITOR] Load failed:', e);
    setScreenEditorStatus('Feil ved lasting av screens.json', 'error');
    return false;
  }
}

function renderScreenEditorSelect() {
  const selectEl = document.getElementById('screenEditorSelect');
  if (!selectEl || !screenEditorState.data) return;

  selectEl.innerHTML = '';
  screenEditorState.data.screenOrder.forEach((screenId) => {
    if (!screenEditorState.data.screens[screenId]) return;
    const option = document.createElement('option');
    option.value = screenId;
    option.textContent = screenId;
    selectEl.appendChild(option);
  });

  if (screenEditorState.currentScreenId) {
    selectEl.value = screenEditorState.currentScreenId;
  }
}

function updateScreenEditorHotspotVisual(element, hotspot) {
  element.style.left = `${hotspot.x * 100}%`;
  element.style.top = `${hotspot.y * 100}%`;
  element.style.width = `${hotspot.w * 100}%`;
  element.style.height = `${hotspot.h * 100}%`;
  const label = element.querySelector('.screen-editor-hotspot-label');
  if (label) {
    label.textContent = `${hotspot.id} x:${round3(hotspot.x)} y:${round3(hotspot.y)} w:${round3(hotspot.w)} h:${round3(hotspot.h)}`;
  }
}

function updateScreenEditorPulseVisual(element, pulse) {
  element.style.left = `${pulse.x * 100}%`;
  element.style.top = `${pulse.y * 100}%`;
  const label = element.querySelector('.screen-editor-pulse-label');
  if (label) {
    const linked = pulse.followHotspotId ? ` 🔗 ${pulse.followHotspotId}` : '';
    label.textContent = `${pulse.id} x:${round3(pulse.x)} y:${round3(pulse.y)}${linked}`;
  }
}

function syncLinkedPulsesForHotspot(overlayEl, screenCfg, hotspotId) {
  const pulses = ensureScreenPulses(screenCfg);
  const hotspot = (screenCfg.hotspots || []).find((h) => h.id === hotspotId);
  if (!hotspot) return;

  pulses.forEach((pulse) => {
    if (pulse.followHotspotId !== hotspotId) return;
    pulse.x = clamp01(hotspot.x);
    pulse.y = clamp01(hotspot.y);
    if (!overlayEl) return;
    const pulseEl = overlayEl.querySelector(`.screen-editor-pulse[data-pulse-id="${pulse.id}"]`);
    if (pulseEl) updateScreenEditorPulseVisual(pulseEl, pulse);
  });
}

async function saveScreensConfigNow(reason = 'manual') {
  const { supabase, cfg, data } = screenEditorState;
  if (!supabase || !cfg || !data) return false;
  const path = screensConfigPath(cfg.installSlug);
  const payload = JSON.stringify(data, null, 2);

  screenEditorState.saving = true;
  setScreenEditorStatus(`Lagrer (${reason})…`, 'warn');

  try {
    const { error } = await supabase.storage
      .from(cfg.bucket)
      .update(path, new Blob([payload], { type: 'application/json' }), { upsert: true });

    if (error) {
      setScreenEditorStatus(`Lagring feilet: ${error.message || 'ukjent feil'}`, 'error');
      return false;
    }

    setScreenEditorStatus('✅ Lagret til screens.json', 'ok');
    return true;
  } catch (e) {
    console.error('[SCREEN EDITOR] Save failed:', e);
    setScreenEditorStatus('Lagring feilet (exception)', 'error');
    return false;
  } finally {
    screenEditorState.saving = false;
  }
}

function scheduleScreenEditorAutosave(reason = 'edit') {
  if (screenEditorState.autosaveTimer) {
    clearTimeout(screenEditorState.autosaveTimer);
  }

  screenEditorState.autosaveTimer = setTimeout(async () => {
    screenEditorState.autosaveTimer = null;

    if (screenEditorState.saving) {
      screenEditorState.queued = true;
      return;
    }

    await saveScreensConfigNow(reason);

    if (screenEditorState.queued) {
      screenEditorState.queued = false;
      scheduleScreenEditorAutosave('queued-edit');
    }
  }, 700);
}

function attachHotspotEditorBehavior(overlayEl, hotspotEl, hotspot, screenCfg) {
  const handle = hotspotEl.querySelector('.screen-editor-hotspot-handle');
  let mode = null;
  let startX = 0;
  let startY = 0;
  let startHotspot = null;

  const onMove = (event) => {
    if (!mode) return;

    const rect = overlayEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dX = (event.clientX - startX) / rect.width;
    const dY = (event.clientY - startY) / rect.height;

    if (mode === 'move') {
      hotspot.x = clamp01(startHotspot.x + dX);
      hotspot.y = clamp01(startHotspot.y + dY);
    } else {
      hotspot.w = clamp01(startHotspot.w + dX);
      hotspot.h = clamp01(startHotspot.h + dY);
    }

    updateScreenEditorHotspotVisual(hotspotEl, hotspot);
    syncLinkedPulsesForHotspot(overlayEl, screenCfg, hotspot.id);
    event.preventDefault();
  };

  const onUp = (event) => {
    if (mode) {
      scheduleScreenEditorAutosave(mode === 'move' ? 'hotspot-move' : 'hotspot-resize');
    }
    mode = null;
    startHotspot = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    event.preventDefault();
  };

  hotspotEl.addEventListener('pointerdown', (event) => {
    if (event.target === handle) return;
    mode = 'move';
    screenEditorState.selectedHotspotId = hotspot.id;
    overlayEl.querySelectorAll('.screen-editor-hotspot').forEach((el) => el.classList.remove('selected'));
    hotspotEl.classList.add('selected');
    startX = event.clientX;
    startY = event.clientY;
    startHotspot = { x: hotspot.x, y: hotspot.y, w: hotspot.w, h: hotspot.h };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    event.preventDefault();
    event.stopPropagation();
  });

  if (handle) {
    handle.addEventListener('pointerdown', (event) => {
      mode = 'resize';
      startX = event.clientX;
      startY = event.clientY;
      startHotspot = { x: hotspot.x, y: hotspot.y, w: hotspot.w, h: hotspot.h };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      event.preventDefault();
      event.stopPropagation();
    });
  }
}

function attachPulseEditorBehavior(overlayEl, pulseEl, pulse) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startPulse = null;

  const onMove = (event) => {
    if (!dragging) return;
    const rect = overlayEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dX = (event.clientX - startX) / rect.width;
    const dY = (event.clientY - startY) / rect.height;

    pulse.x = clamp01(startPulse.x + dX);
    pulse.y = clamp01(startPulse.y + dY);
    delete pulse.followHotspotId;
    updateScreenEditorPulseVisual(pulseEl, pulse);
    event.preventDefault();
  };

  const onUp = (event) => {
    if (dragging) {
      scheduleScreenEditorAutosave('pulse-move');
    }
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    event.preventDefault();
  };

  pulseEl.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startPulse = { x: pulse.x, y: pulse.y };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    event.preventDefault();
    event.stopPropagation();
  });
}

function addPulseToCurrentScreen({ followSelectedHotspot = false } = {}) {
  const screenCfg = getCurrentEditorScreenConfig();
  if (!screenCfg) return;

  const pulses = ensureScreenPulses(screenCfg);
  const newPulse = {
    id: makePulseId(screenCfg),
    x: 0.5,
    y: 0.5,
  };

  if (followSelectedHotspot) {
    const hotspotId = screenEditorState.selectedHotspotId;
    const hotspot = (screenCfg.hotspots || []).find((h) => h.id === hotspotId);
    if (!hotspot) {
      setScreenEditorStatus('Velg først en hotspot i preview', 'warn');
      return;
    }
    newPulse.x = clamp01(hotspot.x);
    newPulse.y = clamp01(hotspot.y);
    newPulse.followHotspotId = hotspot.id;
  }

  pulses.push(newPulse);
  renderScreenEditorStage();
  scheduleScreenEditorAutosave(followSelectedHotspot ? 'pulse-from-hotspot' : 'new-pulse');
  setScreenEditorStatus(`✅ Opprettet ${newPulse.id}`, 'ok');
}

function renderScreenEditorStage() {
  const stageEl = document.getElementById('screenEditorStage');
  const { data, cfg, currentScreenId } = screenEditorState;
  if (!stageEl || !data || !cfg || !currentScreenId) return;

  const screenCfg = data.screens[currentScreenId];
  if (!screenCfg) return;

  stageEl.innerHTML = '';

  const image = document.createElement('img');
  image.className = 'screen-editor-image';
  image.alt = currentScreenId;
  image.src = getScreenBgUrl(cfg.installSlug, screenCfg.bg, currentScreenId);
  image.draggable = false;

  image.addEventListener('error', () => {
    setScreenEditorStatus(`Bakgrunn mangler for ${currentScreenId}`, 'error');
  });

  const overlay = document.createElement('div');
  overlay.className = 'screen-editor-overlay';

  (screenCfg.hotspots || []).forEach((hotspot) => {
    const hotspotEl = document.createElement('div');
    hotspotEl.className = 'screen-editor-hotspot';
    hotspotEl.dataset.hotspotId = hotspot.id;
    if (screenEditorState.selectedHotspotId === hotspot.id) {
      hotspotEl.classList.add('selected');
    }

    const labelEl = document.createElement('div');
    labelEl.className = 'screen-editor-hotspot-label';
    hotspotEl.appendChild(labelEl);

    const handleEl = document.createElement('div');
    handleEl.className = 'screen-editor-hotspot-handle';
    hotspotEl.appendChild(handleEl);

    updateScreenEditorHotspotVisual(hotspotEl, hotspot);
    attachHotspotEditorBehavior(overlay, hotspotEl, hotspot, screenCfg);
    overlay.appendChild(hotspotEl);
  });

  ensureScreenPulses(screenCfg).forEach((pulse) => {
    const pulseEl = document.createElement('div');
    pulseEl.className = 'screen-editor-pulse';
    pulseEl.dataset.pulseId = pulse.id;

    const labelEl = document.createElement('div');
    labelEl.className = 'screen-editor-pulse-label';
    pulseEl.appendChild(labelEl);

    updateScreenEditorPulseVisual(pulseEl, pulse);
    attachPulseEditorBehavior(overlay, pulseEl, pulse);
    overlay.appendChild(pulseEl);
  });

  stageEl.appendChild(image);
  stageEl.appendChild(overlay);
}

async function initScreenEditor(supabase, cfg) {
  const selectEl = document.getElementById('screenEditorSelect');
  const addPulseBtn = document.getElementById('screenEditorAddPulseBtn');
  const addPulseFromHotspotBtn = document.getElementById('screenEditorAddPulseFromHotspotBtn');
  const reloadBtn = document.getElementById('screenEditorReloadBtn');
  const saveBtn = document.getElementById('screenEditorSaveBtn');
  const stageEl = document.getElementById('screenEditorStage');

  if (!selectEl || !addPulseBtn || !addPulseFromHotspotBtn || !reloadBtn || !saveBtn || !stageEl) return;

  screenEditorState.supabase = supabase;
  screenEditorState.cfg = cfg;

  setScreenEditorStatus('Laster screens.json…', 'warn');
  const ok = await loadScreensConfigForEditor();
  if (!ok) return;

  renderScreenEditorSelect();
  renderScreenEditorStage();
  setScreenEditorStatus('✅ Klar – dra hotspots for å redigere', 'ok');

  selectEl.addEventListener('change', () => {
    screenEditorState.currentScreenId = selectEl.value;
    screenEditorState.selectedHotspotId = null;
    renderScreenEditorStage();
    setScreenEditorStatus(`Viser ${selectEl.value}`, 'ok');
  });

  addPulseBtn.addEventListener('click', () => {
    addPulseToCurrentScreen({ followSelectedHotspot: false });
  });

  addPulseFromHotspotBtn.addEventListener('click', () => {
    addPulseToCurrentScreen({ followSelectedHotspot: true });
  });

  reloadBtn.addEventListener('click', async () => {
    setScreenEditorStatus('Laster på nytt…', 'warn');
    const loaded = await loadScreensConfigForEditor();
    if (!loaded) return;
    screenEditorState.selectedHotspotId = null;
    renderScreenEditorSelect();
    renderScreenEditorStage();
    setScreenEditorStatus('✅ Lastet på nytt', 'ok');
  });

  saveBtn.addEventListener('click', async () => {
    await saveScreensConfigNow('manual-save');
  });
}