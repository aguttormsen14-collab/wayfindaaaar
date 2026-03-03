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

function initDashboardModuleNavigation() {
  const moduleStorageKey = 'sx_admin_dashboard_module';
  const navItems = Array.from(document.querySelectorAll('.sidebar .nav-item[data-dashboard-module]'));
  const cards = Array.from(document.querySelectorAll('.content-grid .card[data-modules]'));
  const pageTitleEl = document.getElementById('pageTitle');

  if (!navItems.length || !cards.length) return;

  function setActiveModule(moduleName) {
    navItems.forEach((item) => {
      const isActive = item.dataset.dashboardModule === moduleName;
      item.classList.toggle('active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    cards.forEach((card) => {
      const modules = (card.dataset.modules || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      card.classList.toggle('hidden', !modules.includes(moduleName));
    });

    const activeItem = navItems.find((item) => item.dataset.dashboardModule === moduleName);
    if (pageTitleEl && activeItem) {
      pageTitleEl.textContent = activeItem.dataset.moduleTitle || 'Oversikt';
    }

    localStorage.setItem(moduleStorageKey, moduleName);
  }

  navItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const moduleName = item.dataset.dashboardModule;
      if (!moduleName) return;
      setActiveModule(moduleName);
    });
  });

  const savedModule = localStorage.getItem(moduleStorageKey);
  const hasSavedModule = savedModule && navItems.some((item) => item.dataset.dashboardModule === savedModule);
  const initialModule = hasSavedModule
    ? savedModule
    : (navItems[0] && navItems[0].dataset.dashboardModule);

  if (initialModule) {
    setActiveModule(initialModule);
  }
}

function initWelcomeScreenDemo() {
  const buttons = Array.from(document.querySelectorAll('[data-send-welcome-alert]'));
  const statusEl = document.getElementById('welcomeAlertStatus');

  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const recipient = button.dataset.sendWelcomeAlert || button.textContent?.trim() || 'ukjent';
      const now = new Date();
      const timeLabel = now.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
      if (statusEl) {
        statusEl.textContent = `✅ Varsel sendt til ${recipient} kl. ${timeLabel} (demo)`;
      }
    });
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

  initDashboardModuleNavigation();
  initWelcomeScreenDemo();
  initWayfinderTabs();

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

  if (configured) {
    statusEl.innerHTML = `
      <div class="sidebar-status-line">
        <span class="sidebar-status-dot ok" aria-hidden="true"></span>
        <span>Supabase konfigurert</span>
      </div>
      <p class="sidebar-status-meta">Installasjon: <strong>${cfg.installSlug || 'ukjent'}</strong></p>
    `;
  } else {
    statusEl.innerHTML = `
      <div class="sidebar-status-line">
        <span class="sidebar-status-dot error" aria-hidden="true"></span>
        <span>Supabase ikke konfigurert</span>
      </div>
      <p class="sidebar-status-meta">Sjekk at config.js + supabase-config.js lastes</p>
    `;
  }
}

const screenEditorState = {
  supabase: null,
  cfg: null,
  data: null,
  currentScreenId: null,
  selectedHotspotId: null,
  selectedPulseId: null,
  clickMode: 'select',
  clickTargetScreenId: null,
  autosaveTimer: null,
  saving: false,
  queued: false,
  popupDesignerInitialized: false,
  resizeBound: false,
  viewportBound: false,
  viewport: {
    scale: 1,
    minScale: 1,
    maxScale: 3,
    tx: 0,
    ty: 0,
    isPanning: false,
    panPointerId: null,
    panStartX: 0,
    panStartY: 0,
    startTx: 0,
    startTy: 0,
  },
};

const routeSketchState = {
  initialized: false,
  drawing: false,
  points: [],
  canvas: null,
  ctx: null,
};

function initWayfinderTabs() {
  const tabButtons = Array.from(document.querySelectorAll('[data-wayfinder-tab]'));
  const panes = Array.from(document.querySelectorAll('[data-wayfinder-pane]'));
  if (!tabButtons.length || !panes.length) return;

  const setActiveTab = (tabName) => {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.wayfinderTab === tabName;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panes.forEach((pane) => {
      pane.classList.toggle('hidden', pane.dataset.wayfinderPane !== tabName);
    });

    if (tabName === 'editor' && screenEditorState.data && screenEditorState.currentScreenId) {
      requestAnimationFrame(() => {
        renderScreenEditorStage();
      });
    }

    if (tabName === 'routes') {
      requestAnimationFrame(() => {
        renderRouteSketchCanvas();
      });
    }
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.wayfinderTab;
      if (!next) return;
      setActiveTab(next);
    });
  });

  setActiveTab('editor');
}

function getRouteSketchPointFromEvent(event) {
  const canvas = routeSketchState.canvas;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function toAlphaColor(hex, alpha) {
  if (typeof hex !== 'string') return `rgba(15, 23, 42, ${alpha})`;
  const value = hex.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [, rgb] = short;
    const r = parseInt(rgb[0] + rgb[0], 16);
    const g = parseInt(rgb[1] + rgb[1], 16);
    const b = parseInt(rgb[2] + rgb[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const full = /^#([0-9a-f]{6})$/i.exec(value);
  if (full) {
    const [, rgb] = full;
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(15, 23, 42, ${alpha})`;
}

function getRouteSketchTheme() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;

  return {
    bg: read('--bg-subtle', '#eef3f8'),
    card: read('--card', '#ffffff'),
    border: read('--border', '#dde6f0'),
    text: read('--text', '#0f172a'),
    textMuted: read('--text-muted', '#5f6f84'),
    success: read('--success', '#10b981'),
    danger: read('--danger', '#ef4444'),
    info: read('--info', '#3b82f6'),
    warning: read('--warning', '#f59e0b'),
  };
}

function drawRouteSketchBase(ctx, width, height) {
  const theme = getRouteSketchTheme();

  ctx.fillStyle = theme.card;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = toAlphaColor(theme.border, 0.45);
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = toAlphaColor(theme.warning, 0.2);
  ctx.fillRect(width * 0.08, height * 0.1, width * 0.32, height * 0.28);
  ctx.fillRect(width * 0.48, height * 0.18, width * 0.22, height * 0.22);
  ctx.fillRect(width * 0.72, height * 0.42, width * 0.2, height * 0.26);

  ctx.fillStyle = toAlphaColor(theme.success, 0.22);
  ctx.fillRect(width * 0.06, height * 0.5, width * 0.86, height * 0.09);
  ctx.fillRect(width * 0.42, height * 0.12, width * 0.08, height * 0.68);

  ctx.fillStyle = theme.text;
  ctx.font = '600 28px Inter, Segoe UI, Arial, sans-serif';
  ctx.fillText('Fiktivt rutekart (demo)', width * 0.04, height * 0.07);
}

function renderRouteSketchCanvas() {
  const { canvas, ctx, points } = routeSketchState;
  if (!canvas || !ctx) return;

  const theme = getRouteSketchTheme();

  drawRouteSketchBase(ctx, canvas.width, canvas.height);
  if (!points.length) return;

  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = toAlphaColor(theme.info, 0.95);
  ctx.shadowColor = toAlphaColor(theme.info, 0.25);
  ctx.shadowBlur = 10;

  points.forEach((point, idx) => {
    if (idx === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  const start = points[0];
  const end = points[points.length - 1];

  ctx.fillStyle = theme.success;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.danger;
  ctx.beginPath();
  ctx.arc(end.x, end.y, 9, 0, Math.PI * 2);
  ctx.fill();
}

function initRouteSketchDemo() {
  if (routeSketchState.initialized) return;

  const canvas = document.getElementById('routeSketchCanvas');
  const clearBtn = document.getElementById('routeSketchClearBtn');
  const statusEl = document.getElementById('routeSketchStatus');
  if (!canvas || !clearBtn || !statusEl) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  routeSketchState.canvas = canvas;
  routeSketchState.ctx = ctx;

  const beginDraw = (event) => {
    const point = getRouteSketchPointFromEvent(event);
    if (!point) return;

    routeSketchState.drawing = true;
    routeSketchState.points = [point];
    statusEl.textContent = 'Tegner rute…';
    renderRouteSketchCanvas();

    event.preventDefault();
  };

  const moveDraw = (event) => {
    if (!routeSketchState.drawing) return;
    const point = getRouteSketchPointFromEvent(event);
    if (!point) return;

    const last = routeSketchState.points[routeSketchState.points.length - 1];
    if (last) {
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if ((dx * dx + dy * dy) < 40) return;
    }

    routeSketchState.points.push(point);
    renderRouteSketchCanvas();
    event.preventDefault();
  };

  const endDraw = () => {
    if (!routeSketchState.drawing) return;
    routeSketchState.drawing = false;
    statusEl.textContent = routeSketchState.points.length > 1
      ? `Rute tegnet (${routeSketchState.points.length} punkter)`
      : 'Klikk og dra for å tegne en rute.';
  };

  canvas.addEventListener('pointerdown', beginDraw);
  canvas.addEventListener('pointermove', moveDraw);
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointerleave', endDraw);
  canvas.addEventListener('pointercancel', endDraw);

  clearBtn.addEventListener('click', () => {
    routeSketchState.points = [];
    statusEl.textContent = 'Fiktivt kart: hold museknapp inne og tegn en rute.';
    renderRouteSketchCanvas();
  });

  renderRouteSketchCanvas();
  routeSketchState.initialized = true;
}

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

function ensureMap1MinibankHotspot(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.screens || typeof data.screens !== 'object') return false;

  const map1 = data.screens.map1;
  if (!map1 || typeof map1 !== 'object') return false;

  if (!Array.isArray(map1.hotspots)) {
    map1.hotspots = [];
  }

  const exists = map1.hotspots.some((hotspot) => String(hotspot?.id || '') === 'minibank');
  if (exists) return false;

  map1.hotspots.push({
    id: 'minibank',
    x: 0.817,
    y: 0.262,
    w: 0.236,
    h: 0.061,
    uiButton: true,
    uiLabel: 'Minibank',
    label: 'Minibank',
  });

  return true;
}

function getCurrentEditorScreenConfig() {
  const { data, currentScreenId } = screenEditorState;
  if (!data || !currentScreenId) return null;
  return data.screens?.[currentScreenId] || null;
}

function getSelectedHotspot(screenCfg = getCurrentEditorScreenConfig()) {
  if (!screenCfg || !Array.isArray(screenCfg.hotspots)) return null;
  return screenCfg.hotspots.find((hotspot) => hotspot.id === screenEditorState.selectedHotspotId) || null;
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

function makeHotspotId(screenCfg) {
  const hotspots = Array.isArray(screenCfg.hotspots) ? screenCfg.hotspots : [];
  const base = 'hotspot';
  let idx = hotspots.length + 1;
  while (hotspots.some((hotspot) => hotspot.id === `${base}_${idx}`)) {
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
    ensureMap1MinibankHotspot(parsed);
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

function getScreenEditorTargetScreens() {
  const data = screenEditorState.data;
  if (!data || !Array.isArray(data.screenOrder)) return [];
  return data.screenOrder.filter((screenId) => screenId !== screenEditorState.currentScreenId && data.screens?.[screenId]);
}

function renderScreenEditorTargetSelects() {
  const clickTargetEl = document.getElementById('screenEditorClickTarget');
  const hotspotGoTargetEl = document.getElementById('screenEditorHotspotGoTarget');
  const targets = getScreenEditorTargetScreens();

  const fillSelect = (selectEl, selectedValue) => {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    targets.forEach((screenId) => {
      const option = document.createElement('option');
      option.value = screenId;
      option.textContent = screenId;
      selectEl.appendChild(option);
    });

    if (!targets.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Ingen målsider';
      selectEl.appendChild(option);
      selectEl.value = '';
      return;
    }

    const fallback = targets[0];
    const next = (selectedValue && targets.includes(selectedValue)) ? selectedValue : fallback;
    selectEl.value = next;
  };

  fillSelect(clickTargetEl, screenEditorState.clickTargetScreenId);
  screenEditorState.clickTargetScreenId = clickTargetEl?.value || null;

  const selectedHotspot = getSelectedHotspot();
  fillSelect(hotspotGoTargetEl, selectedHotspot?.go || screenEditorState.clickTargetScreenId);
}

function updateScreenEditorClickModeUI() {
  const clickModeEl = document.getElementById('screenEditorClickMode');
  const clickTargetEl = document.getElementById('screenEditorClickTarget');
  const stageOverlayEl = document.querySelector('#screenEditorStage .screen-editor-overlay');
  const mode = clickModeEl?.value || screenEditorState.clickMode || 'select';

  screenEditorState.clickMode = mode;

  if (clickTargetEl) {
    clickTargetEl.classList.toggle('hidden', mode !== 'hotspot-nav');
  }

  if (stageOverlayEl) {
    stageOverlayEl.classList.toggle('click-create', mode !== 'select');
  }
}

function updateScreenEditorHotspotVisual(element, hotspot) {
  element.style.left = `${hotspot.x * 100}%`;
  element.style.top = `${hotspot.y * 100}%`;
  element.style.width = `${hotspot.w * 100}%`;
  element.style.height = `${hotspot.h * 100}%`;
  const label = element.querySelector('.screen-editor-hotspot-label');
  if (label) {
    const displayName = hotspot.label || hotspot.id;
    const popupMarker = hotspot.popup?.enabled ? ' 🗨️' : '';
    label.textContent = `${displayName}${popupMarker}`;
  }
}

function updateHotspotActionFieldVisibility() {
  const actionEl = document.getElementById('screenEditorHotspotAction');
  const popupFieldsEl = document.getElementById('screenEditorPopupFields');
  const navigateFieldsEl = document.getElementById('screenEditorNavigateFields');
  if (!actionEl || !popupFieldsEl || !navigateFieldsEl) return;

  const action = actionEl.value || 'none';
  popupFieldsEl.classList.toggle('hidden', action !== 'popup');
  navigateFieldsEl.classList.toggle('hidden', action !== 'navigate');
}

function sanitizePopupLayout(layout) {
  const logo = layout && typeof layout.logo === 'object' ? layout.logo : {};
  const text = layout && typeof layout.text === 'object' ? layout.text : {};
  return {
    logo: {
      x: clamp01(Number(logo.x ?? 0.78)),
      y: clamp01(Number(logo.y ?? 0.06)),
    },
    text: {
      x: clamp01(Number(text.x ?? 0.06)),
      y: clamp01(Number(text.y ?? 0.08)),
    },
  };
}

function ensurePopupConfig(hotspot) {
  if (!hotspot || typeof hotspot !== 'object') return null;
  if (!hotspot.popup || typeof hotspot.popup !== 'object') {
    hotspot.popup = { enabled: true };
  }
  hotspot.popup.enabled = hotspot.popup.enabled !== false;
  hotspot.popup.layout = sanitizePopupLayout(hotspot.popup.layout);
  return hotspot.popup;
}

function getPopupAssetUrlForEditor(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return '';
  const path = rawPath.trim();
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('/')) {
    return path;
  }
  if (path.startsWith('installs/')) {
    return withBase(path);
  }
  if (path.startsWith('assets/')) {
    return withBase(`installs/${screenEditorState.cfg.installSlug}/${path}`);
  }
  if (path.startsWith('stores/')) {
    return withBase(`installs/${screenEditorState.cfg.installSlug}/assets/${path}`);
  }
  return withBase(`installs/${screenEditorState.cfg.installSlug}/assets/stores/${path}`);
}

function renderPopupDesignerPreview(hotspot) {
  const previewImageEl = document.getElementById('screenEditorPopupPreviewImage');
  const previewLogoEl = document.getElementById('screenEditorPopupPreviewLogo');
  const previewTextEl = document.getElementById('screenEditorPopupPreviewText');
  const previewTitleEl = document.getElementById('screenEditorPopupPreviewTitle');
  const previewBodyEl = document.getElementById('screenEditorPopupPreviewBody');
  const imageDropEl = document.getElementById('screenEditorPopupImageDrop');
  const logoDropEl = document.getElementById('screenEditorPopupLogoDrop');

  if (!previewImageEl || !previewLogoEl || !previewTextEl || !previewTitleEl || !previewBodyEl) return;

  const popup = hotspot ? ensurePopupConfig(hotspot) : null;
  const layout = popup ? popup.layout : sanitizePopupLayout(null);

  const title = (popup?.title || '').trim() || 'Popup tittel';
  const text = (popup?.text || '').trim() || 'Popup tekst';
  previewTitleEl.textContent = title;
  previewBodyEl.textContent = text;

  const imageUrl = popup?.imagePath ? getPopupAssetUrlForEditor(popup.imagePath) : '';
  if (imageUrl) {
    previewImageEl.src = imageUrl;
    previewImageEl.style.display = 'block';
  } else {
    previewImageEl.removeAttribute('src');
    previewImageEl.style.display = 'none';
  }

  const logoUrl = popup?.logoPath ? getPopupAssetUrlForEditor(popup.logoPath) : '';
  if (logoUrl) {
    previewLogoEl.src = logoUrl;
    previewLogoEl.style.display = 'block';
  } else {
    previewLogoEl.removeAttribute('src');
    previewLogoEl.style.display = 'none';
  }

  previewLogoEl.style.left = `${layout.logo.x * 100}%`;
  previewLogoEl.style.top = `${layout.logo.y * 100}%`;
  previewTextEl.style.left = `${layout.text.x * 100}%`;
  previewTextEl.style.top = `${layout.text.y * 100}%`;

  if (imageDropEl) {
    imageDropEl.textContent = popup?.imagePath ? `Popup-bilde: ${popup.imagePath}` : 'Dra bilde hit eller klikk for å laste opp';
  }
  if (logoDropEl) {
    logoDropEl.textContent = popup?.logoPath ? `Logo: ${popup.logoPath}` : 'Dra logo hit eller klikk for å laste opp';
  }
}

async function uploadPopupAssetForSelectedHotspot(kind, file) {
  const hotspot = getSelectedHotspot();
  if (!hotspot) {
    setScreenEditorStatus('Velg en hotspot i preview først', 'warn');
    return;
  }

  if (!screenEditorState.supabase || !screenEditorState.cfg) {
    setScreenEditorStatus('Supabase er ikke klar – prøv å laste editoren på nytt', 'error');
    return;
  }

  const actionEl = document.getElementById('screenEditorHotspotAction');
  if ((actionEl?.value || 'none') !== 'popup') {
    if (actionEl) {
      actionEl.value = 'popup';
      updateHotspotActionFieldVisibility();
    }
    delete hotspot.go;
    ensurePopupConfig(hotspot);
  }

  if (!file) return;

  const storeIdEl = document.getElementById('screenEditorStoreId');
  const fallbackStoreId = String(hotspot.id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  const storeId = (storeIdEl?.value || hotspot.storeId || fallbackStoreId).trim();
  if (!storeId) {
    setScreenEditorStatus('Legg inn Butikk-ID før opplasting', 'warn');
    return;
  }

  if (storeIdEl && !storeIdEl.value.trim()) {
    storeIdEl.value = storeId;
  }

  const extMatch = String(file.name || '').toLowerCase().match(/\.(webp|png|jpe?g|svg)$/i);
  const ext = extMatch ? extMatch[0] : '.png';
  const baseName = kind === 'logo' ? 'logo' : 'popup';
  const fileName = `${baseName}${ext}`;
  const storagePath = `installs/${screenEditorState.cfg.installSlug}/assets/stores/${storeId}/${fileName}`;

  setScreenEditorStatus(`Laster opp ${fileName}…`, 'warn');

  const { error } = await screenEditorState.supabase.storage
    .from(screenEditorState.cfg.bucket)
    .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });

  if (error) {
    setScreenEditorStatus(`Opplasting feilet: ${error.message || 'ukjent feil'}`, 'error');
    return;
  }

  hotspot.storeId = storeId;
  const popup = ensurePopupConfig(hotspot);
  const configPath = `assets/stores/${storeId}/${fileName}`;
  if (kind === 'logo') {
    popup.logoPath = configPath;
  } else {
    popup.imagePath = configPath;
  }

  renderSelectedHotspotPanel();
  scheduleScreenEditorAutosave(`popup-upload-${kind}`);
  setScreenEditorStatus(`✅ Lastet opp ${fileName}`, 'ok');
}

function bindPopupPreviewDrag(element, part) {
  if (!element) return;
  element.dataset.popupDragBound = '1';

  element.addEventListener('pointerdown', (event) => {
    const hotspot = getSelectedHotspot();
    if (!hotspot) return;

    const popup = ensurePopupConfig(hotspot);
    const previewEl = document.getElementById('screenEditorPopupPreview');
    if (!previewEl) return;

    const rect = previewEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const offsetX = event.clientX - rect.left - (popup.layout[part].x * rect.width);
    const offsetY = event.clientY - rect.top - (popup.layout[part].y * rect.height);
    element.classList.add('dragging');

    const onMove = (moveEvent) => {
      const x = clamp01((moveEvent.clientX - rect.left - offsetX) / rect.width);
      const y = clamp01((moveEvent.clientY - rect.top - offsetY) / rect.height);
      popup.layout[part].x = x;
      popup.layout[part].y = y;
      element.style.left = `${x * 100}%`;
      element.style.top = `${y * 100}%`;
      moveEvent.preventDefault();
    };

    const onUp = (upEvent) => {
      element.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      scheduleScreenEditorAutosave(`popup-layout-${part}`);
      upEvent.preventDefault();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    event.preventDefault();
    event.stopPropagation();
  });
}

function renderSelectedHotspotPanel() {
  const shellEl = document.querySelector('.screen-editor-shell');
  const panelEl = document.getElementById('screenEditorHotspotPanel');
  const nameEl = document.getElementById('screenEditorHotspotName');
  const actionEl = document.getElementById('screenEditorHotspotAction');
  const hotspotGoTargetEl = document.getElementById('screenEditorHotspotGoTarget');
  const storeIdEl = document.getElementById('screenEditorStoreId');
  const popupTitleEl = document.getElementById('screenEditorPopupTitle');
  const popupTextEl = document.getElementById('screenEditorPopupText');

  if (!panelEl || !nameEl || !actionEl || !hotspotGoTargetEl || !storeIdEl || !popupTitleEl || !popupTextEl) return;

  const screenCfg = getCurrentEditorScreenConfig();
  const hotspot = getSelectedHotspot(screenCfg);

  if (!hotspot) {
    panelEl.classList.add('hidden');
    if (shellEl) shellEl.classList.remove('with-detail');
    renderPopupDesignerPreview(null);
    return;
  }

  panelEl.classList.remove('hidden');
  if (shellEl) shellEl.classList.add('with-detail');
  nameEl.value = hotspot.label || '';

  let action = 'none';
  if (hotspot.go) action = 'navigate';
  else if (hotspot.popup?.enabled) action = 'popup';
  actionEl.value = action;

  storeIdEl.value = hotspot.storeId || '';
  popupTitleEl.value = hotspot.popup?.title || '';
  popupTextEl.value = hotspot.popup?.text || '';
  renderScreenEditorTargetSelects();
  if (hotspot.go && hotspotGoTargetEl.querySelector(`option[value="${hotspot.go}"]`)) {
    hotspotGoTargetEl.value = hotspot.go;
  }
  updateHotspotActionFieldVisibility();
  renderPopupDesignerPreview(hotspot);
}

function updateScreenEditorPulseVisual(element, pulse) {
  element.style.left = `${pulse.x * 100}%`;
  element.style.top = `${pulse.y * 100}%`;
  const label = element.querySelector('.screen-editor-pulse-label');
  if (label) {
    const linked = pulse.followHotspotId ? ' 🔗' : '';
    label.textContent = `${pulse.id}${linked}`;
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
  ensureMap1MinibankHotspot(data);
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
    screenEditorState.selectedPulseId = null;
    overlayEl.querySelectorAll('.screen-editor-hotspot').forEach((el) => el.classList.remove('selected'));
    overlayEl.querySelectorAll('.screen-editor-pulse').forEach((el) => el.classList.remove('selected'));
    hotspotEl.classList.add('selected');
    startX = event.clientX;
    startY = event.clientY;
    startHotspot = { x: hotspot.x, y: hotspot.y, w: hotspot.w, h: hotspot.h };
    renderSelectedHotspotPanel();
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
    screenEditorState.selectedPulseId = pulse.id;
    screenEditorState.selectedHotspotId = null;
    overlayEl.querySelectorAll('.screen-editor-pulse').forEach((el) => el.classList.remove('selected'));
    overlayEl.querySelectorAll('.screen-editor-hotspot').forEach((el) => el.classList.remove('selected'));
    pulseEl.classList.add('selected');
    renderSelectedHotspotPanel();

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

function addHotspotToCurrentScreen() {
  addHotspotAtPosition({ x: 0.5, y: 0.5, mode: 'none' });
}

function getSelectedClickTargetScreen() {
  const clickTargetEl = document.getElementById('screenEditorClickTarget');
  const target = clickTargetEl?.value || screenEditorState.clickTargetScreenId;
  if (target) return target;

  const fallbackTargets = getScreenEditorTargetScreens();
  return fallbackTargets[0] || null;
}

function addHotspotAtPosition({ x, y, mode = 'none' }) {
  const screenCfg = getCurrentEditorScreenConfig();
  if (!screenCfg) return;

  if (!Array.isArray(screenCfg.hotspots)) {
    screenCfg.hotspots = [];
  }

  const newHotspot = {
    id: makeHotspotId(screenCfg),
    label: 'Ny hotspot',
    x: clamp01(x),
    y: clamp01(y),
    w: 0.12,
    h: 0.08,
  };

  if (mode === 'navigate') {
    const targetScreen = getSelectedClickTargetScreen();
    if (!targetScreen) {
      setScreenEditorStatus('Ingen målsider tilgjengelig for navigasjon', 'warn');
      return;
    }
    newHotspot.go = targetScreen;
  }

  if (mode === 'popup') {
    newHotspot.popup = {
      enabled: true,
      title: 'Ny popup',
      text: 'Legg inn butikkinfo her',
      layout: sanitizePopupLayout(null),
    };
  }

  screenCfg.hotspots.push(newHotspot);
  screenEditorState.selectedHotspotId = newHotspot.id;
  screenEditorState.selectedPulseId = null;
  renderScreenEditorStage();
  renderSelectedHotspotPanel();
  scheduleScreenEditorAutosave(mode === 'navigate' ? 'new-hotspot-nav' : mode === 'popup' ? 'new-hotspot-popup' : 'new-hotspot');
  setScreenEditorStatus(`✅ Opprettet ${newHotspot.id}`, 'ok');
}

function addPulseAtPosition({ x, y }) {
  const screenCfg = getCurrentEditorScreenConfig();
  if (!screenCfg) return;

  const pulses = ensureScreenPulses(screenCfg);
  const newPulse = {
    id: makePulseId(screenCfg),
    x: clamp01(x),
    y: clamp01(y),
  };

  pulses.push(newPulse);
  screenEditorState.selectedPulseId = newPulse.id;
  screenEditorState.selectedHotspotId = null;
  renderScreenEditorStage();
  scheduleScreenEditorAutosave('new-pulse-click');
  setScreenEditorStatus(`✅ Opprettet ${newPulse.id}`, 'ok');
}

function confirmScreenEditorAction(message, title = 'Bekreft sletting') {
  const modalEl = document.getElementById('screenEditorConfirmModal');
  const titleEl = document.getElementById('screenEditorConfirmTitle');
  const messageEl = document.getElementById('screenEditorConfirmMessage');
  const cancelBtn = document.getElementById('screenEditorConfirmCancel');
  const okBtn = document.getElementById('screenEditorConfirmOk');

  if (!modalEl || !titleEl || !messageEl || !cancelBtn || !okBtn) {
    return Promise.resolve(window.confirm(message));
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  modalEl.classList.remove('hidden');

  return new Promise((resolve) => {
    const cleanup = () => {
      modalEl.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onConfirm);
      modalEl.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKeydown);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onBackdrop = (event) => {
      if (event.target === modalEl) {
        onCancel();
      }
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') onConfirm();
    };

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onConfirm);
    modalEl.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKeydown);
    okBtn.focus();
  });
}

async function deleteSelectedPulseFromCurrentScreen() {
  const screenCfg = getCurrentEditorScreenConfig();
  if (!screenCfg) return;

  const pulses = ensureScreenPulses(screenCfg);
  if (!screenEditorState.selectedPulseId) {
    setScreenEditorStatus('Velg en pulse i preview først', 'warn');
    return;
  }

  const idx = pulses.findIndex((pulse) => pulse.id === screenEditorState.selectedPulseId);
  if (idx < 0) {
    setScreenEditorStatus('Fant ikke valgt pulse', 'warn');
    return;
  }

  const pulseId = pulses[idx].id;
  const confirmed = await confirmScreenEditorAction(`Slette pulse "${pulseId}"?`);
  if (!confirmed) return;

  const [removed] = pulses.splice(idx, 1);
  screenEditorState.selectedPulseId = null;
  renderScreenEditorStage();
  scheduleScreenEditorAutosave('delete-pulse');
  setScreenEditorStatus(`🗑️ Slettet ${removed.id}`, 'ok');
}

async function deleteSelectedHotspotFromCurrentScreen() {
  const screenCfg = getCurrentEditorScreenConfig();
  if (!screenCfg) return;

  if (!screenEditorState.selectedHotspotId) {
    setScreenEditorStatus('Velg en hotspot i preview først', 'warn');
    return;
  }

  if (!Array.isArray(screenCfg.hotspots)) {
    screenCfg.hotspots = [];
  }

  const hotspotIdx = screenCfg.hotspots.findIndex((hotspot) => hotspot.id === screenEditorState.selectedHotspotId);
  if (hotspotIdx < 0) {
    setScreenEditorStatus('Fant ikke valgt hotspot', 'warn');
    return;
  }

  const hotspotId = screenCfg.hotspots[hotspotIdx].id;
  const confirmed = await confirmScreenEditorAction(`Slette hotspot "${hotspotId}"?`);
  if (!confirmed) return;

  const [removed] = screenCfg.hotspots.splice(hotspotIdx, 1);
  ensureScreenPulses(screenCfg).forEach((pulse) => {
    if (pulse.followHotspotId === removed.id) {
      delete pulse.followHotspotId;
    }
  });

  screenEditorState.selectedHotspotId = null;
  renderScreenEditorStage();
  renderSelectedHotspotPanel();
  scheduleScreenEditorAutosave('delete-hotspot');
  setScreenEditorStatus(`🗑️ Slettet ${removed.id}`, 'ok');
}

function bindHotspotPanelEvents() {
  const nameEl = document.getElementById('screenEditorHotspotName');
  const actionEl = document.getElementById('screenEditorHotspotAction');
  const hotspotGoTargetEl = document.getElementById('screenEditorHotspotGoTarget');
  const storeIdEl = document.getElementById('screenEditorStoreId');
  const popupTitleEl = document.getElementById('screenEditorPopupTitle');
  const popupTextEl = document.getElementById('screenEditorPopupText');
  const popupImageDropEl = document.getElementById('screenEditorPopupImageDrop');
  const popupImageInputEl = document.getElementById('screenEditorPopupImageInput');
  const popupLogoDropEl = document.getElementById('screenEditorPopupLogoDrop');
  const popupLogoInputEl = document.getElementById('screenEditorPopupLogoInput');
  const popupPreviewLogoEl = document.getElementById('screenEditorPopupPreviewLogo');
  const popupPreviewTextEl = document.getElementById('screenEditorPopupPreviewText');

  if (!nameEl || !actionEl || !hotspotGoTargetEl || !storeIdEl || !popupTitleEl || !popupTextEl) return;

  const applyChanges = (reason) => {
    const hotspot = getSelectedHotspot();
    if (!hotspot) return;

    hotspot.label = nameEl.value.trim() || undefined;

    const action = actionEl.value || 'none';
    if (action === 'navigate') {
      const target = hotspotGoTargetEl.value || getSelectedClickTargetScreen();
      if (!target) {
        setScreenEditorStatus('Velg målside for navigasjon', 'warn');
        return;
      }
      hotspot.go = target;
      if (hotspotGoTargetEl.value !== target) {
        hotspotGoTargetEl.value = target;
      }
      delete hotspot.popup;
      if (!storeIdEl.value.trim()) delete hotspot.storeId;
    } else if (action === 'popup') {
      delete hotspot.go;
      hotspot.storeId = storeIdEl.value.trim() || undefined;
      const popup = ensurePopupConfig(hotspot);
      hotspot.popup = {
        ...popup,
        enabled: true,
        ...(popupTitleEl.value.trim() && { title: popupTitleEl.value.trim() }),
        ...(popupTextEl.value.trim() && { text: popupTextEl.value.trim() }),
      };
    } else {
      delete hotspot.go;
      delete hotspot.popup;
      if (!storeIdEl.value.trim()) {
        delete hotspot.storeId;
      }
    }

    renderScreenEditorStage();
    renderSelectedHotspotPanel();
    scheduleScreenEditorAutosave(reason);
  };

  nameEl.addEventListener('input', () => applyChanges('hotspot-name'));
  actionEl.addEventListener('change', () => {
    updateHotspotActionFieldVisibility();
    applyChanges('hotspot-action');
  });
  hotspotGoTargetEl.addEventListener('change', () => applyChanges('hotspot-go-target'));
  storeIdEl.addEventListener('input', () => applyChanges('hotspot-storeid'));
  popupTitleEl.addEventListener('input', () => applyChanges('hotspot-popup-title'));
  popupTextEl.addEventListener('input', () => applyChanges('hotspot-popup-text'));

  if (!screenEditorState.popupDesignerInitialized) {
    bindPopupPreviewDrag(popupPreviewLogoEl, 'logo');
    bindPopupPreviewDrag(popupPreviewTextEl, 'text');

    const wireUpload = (dropEl, inputEl, kind) => {
      if (!dropEl || !inputEl) return;

      const extractFile = (event) => {
        const files = Array.from(event?.dataTransfer?.files || []);
        if (files.length) return files[0];
        const items = Array.from(event?.dataTransfer?.items || []);
        for (const item of items) {
          if (item.kind === 'file') {
            const asFile = item.getAsFile();
            if (asFile) return asFile;
          }
        }
        return null;
      };

      dropEl.addEventListener('click', () => inputEl.click());

      inputEl.addEventListener('change', async () => {
        const file = inputEl.files?.[0];
        if (file) {
          await uploadPopupAssetForSelectedHotspot(kind, file);
        }
        inputEl.value = '';
      });

      dropEl.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropEl.classList.add('drag-over');
      });

      dropEl.addEventListener('dragleave', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropEl.classList.remove('drag-over');
      });

      dropEl.addEventListener('drop', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropEl.classList.remove('drag-over');
        const file = extractFile(event);
        if (file) {
          await uploadPopupAssetForSelectedHotspot(kind, file);
        } else {
          setScreenEditorStatus('Fant ingen fil i drag-and-drop', 'warn');
        }
      });
    };

    wireUpload(popupImageDropEl, popupImageInputEl, 'popup');
    wireUpload(popupLogoDropEl, popupLogoInputEl, 'logo');
    screenEditorState.popupDesignerInitialized = true;
  }
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

  const fitEl = document.createElement('div');
  fitEl.className = 'screen-editor-fit';

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

  overlay.classList.toggle('click-create', screenEditorState.clickMode !== 'select');
  overlay.addEventListener('pointerdown', (event) => {
    if (screenEditorState.viewport.isPanning || event.shiftKey) return;
    if (event.target !== overlay) return;

    const mode = screenEditorState.clickMode || 'select';
    if (mode === 'select') return;

    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);

    if (mode === 'hotspot-nav') {
      addHotspotAtPosition({ x, y, mode: 'navigate' });
    } else if (mode === 'hotspot-popup') {
      addHotspotAtPosition({ x, y, mode: 'popup' });
    } else if (mode === 'pulse') {
      addPulseAtPosition({ x, y });
    }

    event.preventDefault();
    event.stopPropagation();
  });

  fitEl.appendChild(image);
  fitEl.appendChild(overlay);
  stageEl.appendChild(fitEl);
  applyScreenEditorViewportTransform();
  renderSelectedHotspotPanel();
}

async function initScreenEditor(supabase, cfg) {
  const selectEl = document.getElementById('screenEditorSelect');
  const clickModeEl = document.getElementById('screenEditorClickMode');
  const clickTargetEl = document.getElementById('screenEditorClickTarget');
  const addHotspotBtn = document.getElementById('screenEditorAddHotspotBtn');
  const deleteHotspotBtn = document.getElementById('screenEditorDeleteHotspotBtn');
  const addPulseBtn = document.getElementById('screenEditorAddPulseBtn');
  const addPulseFromHotspotBtn = document.getElementById('screenEditorAddPulseFromHotspotBtn');
  const deletePulseBtn = document.getElementById('screenEditorDeletePulseBtn');
  const reloadBtn = document.getElementById('screenEditorReloadBtn');
  const saveBtn = document.getElementById('screenEditorSaveBtn');
  const stageEl = document.getElementById('screenEditorStage');

  if (!selectEl || !clickModeEl || !clickTargetEl || !addHotspotBtn || !deleteHotspotBtn || !addPulseBtn || !addPulseFromHotspotBtn || !deletePulseBtn || !reloadBtn || !saveBtn || !stageEl) return;

  screenEditorState.supabase = supabase;
  screenEditorState.cfg = cfg;

  setScreenEditorStatus('Laster screens.json…', 'warn');
  const ok = await loadScreensConfigForEditor();
  if (!ok) return;

  renderScreenEditorSelect();
  renderScreenEditorTargetSelects();
  updateScreenEditorClickModeUI();
  bindScreenEditorViewportInteractions();
  renderScreenEditorStage();
  bindHotspotPanelEvents();
  initRouteSketchDemo();
  setScreenEditorStatus('✅ Klar – dra hotspots for å redigere', 'ok');

  selectEl.addEventListener('change', () => {
    screenEditorState.currentScreenId = selectEl.value;
    screenEditorState.selectedHotspotId = null;
    screenEditorState.selectedPulseId = null;
    resetScreenEditorViewport();
    renderScreenEditorTargetSelects();
    renderScreenEditorStage();
    setScreenEditorStatus(`Viser ${selectEl.value}`, 'ok');
  });

  clickModeEl.addEventListener('change', () => {
    screenEditorState.clickMode = clickModeEl.value;
    updateScreenEditorClickModeUI();
    renderScreenEditorStage();
    const label = clickModeEl.options[clickModeEl.selectedIndex]?.textContent || clickModeEl.value;
    setScreenEditorStatus(label, 'ok');
  });

  clickTargetEl.addEventListener('change', () => {
    screenEditorState.clickTargetScreenId = clickTargetEl.value || null;
  });

  addHotspotBtn.addEventListener('click', () => {
    addHotspotToCurrentScreen();
  });

  deleteHotspotBtn.addEventListener('click', async () => {
    await deleteSelectedHotspotFromCurrentScreen();
  });

  addPulseBtn.addEventListener('click', () => {
    addPulseToCurrentScreen({ followSelectedHotspot: false });
  });

  addPulseFromHotspotBtn.addEventListener('click', () => {
    addPulseToCurrentScreen({ followSelectedHotspot: true });
  });

  deletePulseBtn.addEventListener('click', async () => {
    await deleteSelectedPulseFromCurrentScreen();
  });

  reloadBtn.addEventListener('click', async () => {
    setScreenEditorStatus('Laster på nytt…', 'warn');
    const loaded = await loadScreensConfigForEditor();
    if (!loaded) return;
    screenEditorState.selectedHotspotId = null;
    screenEditorState.selectedPulseId = null;
    resetScreenEditorViewport();
    renderScreenEditorSelect();
    renderScreenEditorTargetSelects();
    updateScreenEditorClickModeUI();
    renderScreenEditorStage();
    setScreenEditorStatus('✅ Lastet på nytt', 'ok');
  });

  saveBtn.addEventListener('click', async () => {
    await saveScreensConfigNow('manual-save');
  });

  if (!screenEditorState.resizeBound) {
    window.addEventListener('resize', () => {
      if (!screenEditorState.data || !screenEditorState.currentScreenId) return;
      renderScreenEditorStage();
    });
    screenEditorState.resizeBound = true;
  }
}

function resetScreenEditorViewport() {
  screenEditorState.viewport.scale = 1;
  screenEditorState.viewport.tx = 0;
  screenEditorState.viewport.ty = 0;
  screenEditorState.viewport.isPanning = false;
  screenEditorState.viewport.panPointerId = null;
}

function getScreenEditorFitElement() {
  return document.querySelector('#screenEditorStage .screen-editor-fit');
}

function clampScreenEditorViewport(stageEl, fitEl) {
  const vp = screenEditorState.viewport;
  if (!stageEl || !fitEl) return;
  const stageW = stageEl.clientWidth || 1;
  const stageH = stageEl.clientHeight || 1;
  const fitW = fitEl.offsetWidth || 1;
  const fitH = fitEl.offsetHeight || 1;
  const scaledW = fitW * vp.scale;
  const scaledH = fitH * vp.scale;
  const maxX = Math.max(0, (scaledW - stageW) / 2);
  const maxY = Math.max(0, (scaledH - stageH) / 2);
  vp.tx = Math.max(-maxX, Math.min(maxX, vp.tx));
  vp.ty = Math.max(-maxY, Math.min(maxY, vp.ty));
}

function applyScreenEditorViewportTransform() {
  const stageEl = document.getElementById('screenEditorStage');
  const fitEl = getScreenEditorFitElement();
  if (!stageEl || !fitEl) return;

  clampScreenEditorViewport(stageEl, fitEl);
  const vp = screenEditorState.viewport;
  fitEl.style.transformOrigin = '50% 50%';
  fitEl.style.transform = `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})`;
  stageEl.classList.toggle('screen-editor-stage-panning', vp.isPanning);
}

function setScreenEditorViewportScale(nextScale, anchorClientX, anchorClientY) {
  const stageEl = document.getElementById('screenEditorStage');
  const fitEl = getScreenEditorFitElement();
  if (!stageEl || !fitEl) return;

  const vp = screenEditorState.viewport;
  const prevScale = vp.scale;
  const clamped = Math.max(vp.minScale, Math.min(vp.maxScale, nextScale));
  if (Math.abs(clamped - prevScale) < 0.0001) return;

  const stageRect = stageEl.getBoundingClientRect();
  const cX = stageRect.width / 2;
  const cY = stageRect.height / 2;
  const anchorX = (anchorClientX ?? (stageRect.left + cX)) - stageRect.left;
  const anchorY = (anchorClientY ?? (stageRect.top + cY)) - stageRect.top;

  const k = clamped / prevScale;
  const oX = anchorX - cX;
  const oY = anchorY - cY;

  vp.tx = oX - ((oX - vp.tx) * k);
  vp.ty = oY - ((oY - vp.ty) * k);
  vp.scale = clamped;

  if (vp.scale <= 1.0001) {
    vp.scale = 1;
    vp.tx = 0;
    vp.ty = 0;
  }

  applyScreenEditorViewportTransform();
}

function bindScreenEditorViewportInteractions() {
  if (screenEditorState.viewportBound) return;

  const stageEl = document.getElementById('screenEditorStage');
  const zoomInBtn = document.getElementById('screenEditorZoomInBtn');
  const zoomOutBtn = document.getElementById('screenEditorZoomOutBtn');
  const zoomResetBtn = document.getElementById('screenEditorZoomResetBtn');
  if (!stageEl || !zoomInBtn || !zoomOutBtn || !zoomResetBtn) return;

  stageEl.addEventListener('wheel', (event) => {
    const fitEl = getScreenEditorFitElement();
    if (!fitEl || !event.target || !event.target.closest || !event.target.closest('#screenEditorStage')) return;
    const direction = event.deltaY < 0 ? 1 : -1;
    const step = 0.12;
    setScreenEditorViewportScale(screenEditorState.viewport.scale + (direction * step), event.clientX, event.clientY);
    event.preventDefault();
  }, { passive: false });

  stageEl.addEventListener('pointerdown', (event) => {
    const fitEl = getScreenEditorFitElement();
    if (!fitEl) return;
    const shouldPan = (event.button === 1 || event.shiftKey) && event.target?.closest('#screenEditorStage');
    if (!shouldPan || screenEditorState.viewport.scale <= 1.0001) return;

    const vp = screenEditorState.viewport;
    vp.isPanning = true;
    vp.panPointerId = event.pointerId;
    vp.panStartX = event.clientX;
    vp.panStartY = event.clientY;
    vp.startTx = vp.tx;
    vp.startTy = vp.ty;
    applyScreenEditorViewportTransform();
    event.preventDefault();
    event.stopPropagation();
  }, true);

  window.addEventListener('pointermove', (event) => {
    const vp = screenEditorState.viewport;
    if (!vp.isPanning || vp.panPointerId !== event.pointerId) return;

    vp.tx = vp.startTx + (event.clientX - vp.panStartX);
    vp.ty = vp.startTy + (event.clientY - vp.panStartY);
    applyScreenEditorViewportTransform();
    event.preventDefault();
  });

  const endPan = (event) => {
    const vp = screenEditorState.viewport;
    if (vp.panPointerId !== event.pointerId) return;
    vp.isPanning = false;
    vp.panPointerId = null;
    applyScreenEditorViewportTransform();
  };

  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);

  zoomInBtn.addEventListener('click', () => {
    setScreenEditorViewportScale(screenEditorState.viewport.scale + 0.15);
  });
  zoomOutBtn.addEventListener('click', () => {
    setScreenEditorViewportScale(screenEditorState.viewport.scale - 0.15);
  });
  zoomResetBtn.addEventListener('click', () => {
    resetScreenEditorViewport();
    applyScreenEditorViewportTransform();
  });

  screenEditorState.viewportBound = true;
}