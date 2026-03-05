(() => {

function getSupabase() {
  const s = window.supabase;

  // A valid client has .storage and does NOT expose createClient
  if (s && s.storage && typeof s.createClient !== "function") {
    return s;
  }

  return null;
}

// --- render watchdog ------------------------------------------------
let lastRenderTs = Date.now();
function markRendered() { lastRenderTs = Date.now(); }
// fire guard every 2s; only recover if ads appear stuck for too long
setInterval(() => {
  const elapsed = Date.now() - lastRenderTs;
  if (elapsed > 30000 && (adsRunning || isAdsScreen(currentScreen))) {
    console.warn("[APP] render watchdog triggered during ads → forcing idle");
    setScreen('idle');
    showIdleBackground();
    markRendered();
  }
}, 2000);

const APP_START_TS = Date.now();
const HEALTH_SAMPLE_MS = 30000;
const HEALTH_REPORT_EVERY_SAMPLES = 20;
const HEALTH_HISTORY_MAX = 288;
const HEALTH_EVENT_LOOP_WARN_MS = 250;
const HEALTH_RENDER_AGE_WARN_MS = 45000;
const HEALTH_HISTORY_STORAGE_KEY = 'sx_health_history_v1';

let healthMonitorTimer = null;
let healthSampleExpectedTs = 0;
let healthSampleCounter = 0;
let healthLagSumMs = 0;
let healthSlowTickCounter = 0;
let healthMaxLagMs = 0;
let healthLastLagMs = 0;
let healthWindowErrorCount = 0;
let healthPromiseRejectCount = 0;
let healthLastSnapshot = null;

function readHeapStatsMb() {
  if (!window.performance || !window.performance.memory) return null;
  const mem = window.performance.memory;
  if (!Number.isFinite(mem.usedJSHeapSize)) return null;
  const usedMb = Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
  const limitMb = Number.isFinite(mem.jsHeapSizeLimit)
    ? Math.round((mem.jsHeapSizeLimit / (1024 * 1024)) * 10) / 10
    : null;
  return { usedMb, limitMb };
}

function getHealthReport() {
  const heap = readHeapStatsMb();
  const samples = Math.max(healthSampleCounter, 1);
  const avgLagMs = Math.round((healthLagSumMs / samples) * 10) / 10;
  const renderAgeMs = Math.max(0, Date.now() - lastRenderTs);

  return {
    ts: new Date().toISOString(),
    uptimeSec: Math.round((Date.now() - APP_START_TS) / 1000),
    screen: currentScreen || null,
    adsRunning: !!adsRunning,
    lag: {
      lastMs: healthLastLagMs,
      avgMs: avgLagMs,
      maxMs: healthMaxLagMs,
      slowTicks: healthSlowTickCounter,
      samples: healthSampleCounter,
    },
    renderAgeMs,
    heap: heap ? {
      usedMb: heap.usedMb,
      limitMb: heap.limitMb,
      usagePct: heap.limitMb ? Math.round((heap.usedMb / heap.limitMb) * 1000) / 10 : null,
    } : null,
    errors: {
      window: healthWindowErrorCount,
      promise: healthPromiseRejectCount,
    },
  };
}

function getHealthHistory() {
  try {
    const raw = localStorage.getItem(HEALTH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function appendHealthHistory(snapshot) {
  try {
    const history = getHealthHistory();
    history.push(snapshot);
    if (history.length > HEALTH_HISTORY_MAX) {
      history.splice(0, history.length - HEALTH_HISTORY_MAX);
    }
    localStorage.setItem(HEALTH_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
  }
}

function captureHealthSample() {
  const nowPerf = window.performance && typeof window.performance.now === 'function'
    ? window.performance.now()
    : Date.now();

  let lagMs = 0;
  if (healthSampleExpectedTs > 0) {
    lagMs = Math.max(0, nowPerf - healthSampleExpectedTs - HEALTH_SAMPLE_MS);
  }
  healthSampleExpectedTs = nowPerf;

  if (document.hidden) {
    lagMs = 0;
  }

  const roundedLag = Math.round(lagMs);
  healthLastLagMs = roundedLag;
  healthSampleCounter += 1;
  healthLagSumMs += roundedLag;
  if (roundedLag > HEALTH_EVENT_LOOP_WARN_MS) {
    healthSlowTickCounter += 1;
  }
  if (roundedLag > healthMaxLagMs) {
    healthMaxLagMs = roundedLag;
  }

  const snapshot = getHealthReport();
  healthLastSnapshot = snapshot;

  const isPeriodicReport = (healthSampleCounter % HEALTH_REPORT_EVERY_SAMPLES) === 0;
  const hasAnomaly = snapshot.lag.lastMs > 1000 || snapshot.renderAgeMs > HEALTH_RENDER_AGE_WARN_MS;

  if (!isPeriodicReport && !hasAnomaly) return;

  appendHealthHistory(snapshot);
  if (hasAnomaly) {
    console.warn('[HEALTH] anomaly', snapshot);
  } else {
    console.log('[HEALTH]', snapshot);
  }
}

function startHealthMonitor() {
  if (healthMonitorTimer) return;
  healthSampleExpectedTs = window.performance && typeof window.performance.now === 'function'
    ? window.performance.now()
    : Date.now();
  healthMonitorTimer = setInterval(captureHealthSample, HEALTH_SAMPLE_MS);
  captureHealthSample();
}

function stopHealthMonitor() {
  if (!healthMonitorTimer) return;
  clearInterval(healthMonitorTimer);
  healthMonitorTimer = null;
  healthSampleExpectedTs = 0;
}


// helper to prefix any local asset paths with the GitHub Pages base path
function withBase(path) {
  const base = window.SX_BASE_PATH || '/';
  return `${base}${path}`.replace(/\/\/+/g, '/');
}

// === BEHAVIOR CONFIG (easy toggle) ===
const IDLE_TO_ADS_MS = 10000;      // idle -> ads after 10s inactivity
const ACTIVE_TO_ADS_MS = 30000;    // map/menu/etc -> ads after 30s inactivity

let idleToAdsTimer = null; // timer from idle -> ads auto-start
let adsRunning = false; // true when ads are actively playing

// map artifacts cleanup (pulses, overlays, special layers)
function clearMapArtifacts() {
  document.querySelectorAll(
    ".pulse, .pulse-dot, .map-pulse, .poi-pulse, [data-pulse], [data-overlay]"
  ).forEach(el => el.remove());

  const overlay = document.getElementById("mapOverlays");
  if (overlay) overlay.innerHTML = "";

  const mapLayer = document.getElementById("mapLayer");
  if (mapLayer) {
    mapLayer.style.backgroundImage = "";
    mapLayer.style.display = "none";
  }
}

// inactivity->ads timer management
function stopIdleToAdsTimer() {
  if (idleToAdsTimer) { clearTimeout(idleToAdsTimer); idleToAdsTimer = null; }
}

function scheduleAdsAfterIdle() {
  stopIdleToAdsTimer();
  if (adsRunning || isAdsScreen(currentScreen)) return;

  const delayMs = currentScreen === 'idle' ? IDLE_TO_ADS_MS : ACTIVE_TO_ADS_MS;
  idleToAdsTimer = setTimeout(() => {
    if (!adsRunning && !isAdsScreen(currentScreen)) {
      clearMapArtifacts();
      if (typeof startAdsLoop === "function") {
        startAdsLoop();
      } else if (typeof showAdsOverlay === "function") {
        showAdsOverlay();
      }
      adsRunning = true;
    }
  }, delayMs);
}

function stopAdsNow() {
  if (!adsRunning) return;
  
  // Stop all ads and cleanup
  try { if (typeof stopAds === "function") stopAds(); } catch(e) {}
  try { if (typeof hideAdsOverlay === "function") hideAdsOverlay(); } catch(e) {}
  
  // Ensure artifacts are cleared
  clearMapArtifacts();
  
  // Reset state
  adsRunning = false;
}

function isAdsScreen(id) {
  return id === "ads" || id === "ad" || (id && id.includes("reklame"));
}

// === DEBUG TOGGLE ===
let DEBUG = false; // runtime-toggleable debug flag
let editMode = false; // true while ArrowDown is held

// demo fullscreen (Android tablet, non-kiosk) - safe, one-time attempt
let demoFullscreenArmed = true;
function demoLog(msg){ if (DEBUG) console.log(msg); }
function tryDemoFullscreenOnce(force = false){
  if (!demoFullscreenArmed && !force) return;
  if (currentScreen !== "idle") return;
  const el = document.documentElement;
  if (!el || !el.requestFullscreen || document.fullscreenElement) return;
  if (!document.fullscreenElement && el && el.requestFullscreen) {
    el.requestFullscreen().then(() => {
      demoLog("[DEMO] fullscreen ok");
      demoFullscreenArmed = false;
    }).catch(() => demoLog("[DEMO] fullscreen failed"));
  }
}

function isIdleLeftFullscreenGesture(ev) {
  if (currentScreen !== 'idle') return false;
  const x = Number(ev?.clientX);
  if (!Number.isFinite(x)) return false;
  const threshold = Math.max(120, window.innerWidth * 0.25);
  return x <= threshold;
}

// Install loader (select which install's assets to use)
const params = new URLSearchParams(location.search);
let INSTALL_ID = params.get("install") || "amfi-steinkjer";

// ===== SECURITY: Validate installSlug before use =====
function isValidInstallSlug(slug) {
  if (typeof slug !== 'string') return false;
  return /^[a-z0-9-]{2,40}$/.test(slug);
}
if (!isValidInstallSlug(INSTALL_ID)) {
  console.warn('[SECURITY] Invalid installSlug:', INSTALL_ID, '→ fallback to amfi-steinkjer');
  INSTALL_ID = "amfi-steinkjer";
}

const BASE_ASSETS = withBase(`installs/${INSTALL_ID}/assets`);
const SCREEN_ASSETS = `${BASE_ASSETS}/screens`;
const ADS_ASSETS = `${BASE_ASSETS}/ads`;
const STORES_ASSETS = `${BASE_ASSETS}/stores`;

// Ordered list of screens for left/right navigation
const SCREEN_ORDER = ["idle","menu","floors","map1","map2","map3","tech_map1"];

const ASSETS = {
  idle: `${SCREEN_ASSETS}/idle.png`,
  menu: `${SCREEN_ASSETS}/menu.png`,
  floors: `${SCREEN_ASSETS}/floors.png`,
  map1: `${SCREEN_ASSETS}/map1.png`,
  map2: `${SCREEN_ASSETS}/map2.png`,
  map3: `${SCREEN_ASSETS}/map3.png`,
  tech_map1: `${SCREEN_ASSETS}/tech_map1.png`,
};


// === ADS POLLING ===
// poll interval for listing ads (15s)
const ADS_POLL_MS = 15 * 1000; // 15 seconds
let lastAdsSig = "";
let adsPollTimer = null;
let adsReloadInFlight = false;

// SCREENS Configuration with hotspots and pulses (normalized coordinates 0..1)
const SCREENS = {
  idle: {
    bg: ASSETS.idle,
    hotspots: [ { id: "to_menu", x: 0.5, y: 0.5, w: 1, h: 1, go: "menu" } ],
    pulses: []
  },
  menu: {
  bg: ASSETS.menu,
  hotspots: [
    { id: "menu1", x: 0.301, y: 0.382, w: 0.35,  h: 0.107, go: "floors", label: "Menu 1" },
    { id: "menu2", x: 0.734, y: 0.384, w: 0.366, h: 0.099, go: "floors", label: "Menu 2" },
    { id: "menu3", x: 0.296, y: 0.659, w: 0.365, h: 0.108, go: "floors", label: "Menu 3" },
    { id: "menu4", x: 0.732, y: 0.656, w: 0.365, h: 0.108, go: "floors", label: "Menu 4" },
    { id: "back_to_idle", x: 0.125, y: 0.06, w: 0.237, h: 0.067, go: "idle", label: "Back to Idle" }
  ],
  pulses: []
},
  floors: {
  bg: ASSETS.floors,
  hotspots: [
    { id: "back_to_menu", x: 0.532, y: 0.779, w: 0.372, h: 0.101, go: "menu" },
    { id: "to_map1",      x: 0.532, y: 0.618, w: 0.372, h: 0.101, go: "map1" },
    { id: "to_map2",      x: 0.534, y: 0.437, w: 0.372, h: 0.101, go: "map2" },
    { id: "to_map3",      x: 0.536, y: 0.280, w: 0.372, h: 0.101, go: "map3" },
    { id: "corner_back_to_menu", x: 0.168, y: 0.098, w: 0.243, h: 0.074, go: "menu" }
  ],
  pulses: []
},
  map1: {
    bg: ASSETS.map1,
    hotspots: [
      { id: "back_to_floors", x: 0.173, y: 0.081, w: 0.236, h: 0.083, go: "floors", label: "Back" },
      { id: "to_tech_map", x: 0.817, y: 0.159, w: 0.236, h: 0.061, go: "tech_map1", label: "Tech" },
      { id: "minibank", x: 0.817, y: 0.262, w: 0.236, h: 0.061, uiButton: true, uiLabel: "Minibank", label: "Minibank" }
    ],
    pulses: [ { id: "you_are_here", x: 0.415, y: 0.538 } ]
  },
  tech_map1: {
    bg: ASSETS.tech_map1,
    hotspots: [
      { id: "back_to_map1", x: 0.814, y: 0.069, w: 0.356, h: 0.072, go: "map1", label: "Back" },
      { id: "elkjøp", x: 0.27, y: 0.45, w: 0.08, h: 0.08, label: "Elkjøp" },
      { id: "telia", x: 0.41, y: 0.37, w: 0.08, h: 0.08, label: "Telia" },
      { id: "telenor", x: 0.69, y: 0.64, w: 0.08, h: 0.08, label: "Telenor" },
      { id: "elkjop", x: 0.205, y: 0.336, w: 0.08, h: 0.08, storeId: "elkjop", label: "Elkjøp" }
    ],
    pulses: [
      { id: "elkjop", x: 0.206, y: 0.328 },
      { id: "telia", x: 0.306, y: 0.258 },
      { id: "telenor", x: 0.52, y: 0.516 }
    ]
  },
  map2: {
    bg: ASSETS.map2,
    hotspots: [
      { id:"back_to_menu", x:0.263, y:0.062, w:0.242, h:0.084, go:"menu" },
      { id:"to_map3", x:0.92, y:0.20, w:0.07, h:0.06, go:"map3" }
    ],
    pulses: []
  },
  map3: {
    bg: ASSETS.map3,
    hotspots: [
      { id:"to_map1", x:0.709, y:0.064, w:0.242, h:0.084, go:"menu" },
      { id:"to_map2", x:0.92, y:0.20, w:0.07, h:0.06, go:"map2" }
    ],
    pulses: []
  }
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const SCREENS_DEFAULT = cloneJson(SCREENS);
const SCREEN_ORDER_DEFAULT = [...SCREEN_ORDER];
let screensConfigSource = 'hardcoded';
const SCREENS_CONFIG_FILE = 'screens.json';
const PLAYER_SETTINGS_FILE = 'settings.json';
const LAYOUT_MODE_DEFAULT = 'default';
const PLAYER_LAYOUT_MODES = new Set(['default', 'bottom-weather', 'split-ads-weather']);
const PLAYER_SETTINGS_DEFAULT = Object.freeze({
  weather: Object.freeze({
    enabled: false,
    location: 'Trondheim, NO',
  }),
  screenLayout: Object.freeze({
    mode: LAYOUT_MODE_DEFAULT,
  }),
});
let playerSettings = {
  weather: { ...PLAYER_SETTINGS_DEFAULT.weather },
  screenLayout: { ...PLAYER_SETTINGS_DEFAULT.screenLayout },
};
const SCREENS_AUTOSAVE_DELAY_MS = 700;
let screensAutosaveTimer = null;
let screensSaveInFlight = false;
let screensSaveQueued = false;

function resolveScreenBackground(rawBg, screenId) {
  if (typeof rawBg !== 'string' || !rawBg.trim()) {
    return ASSETS[screenId] || '';
  }
  const bg = rawBg.trim();
  if (bg.startsWith('http://') || bg.startsWith('https://') || bg.startsWith('data:') || bg.startsWith('/')) {
    return bg;
  }
  if (bg.includes('/')) {
    return bg;
  }
  return `${SCREEN_ASSETS}/${bg}`;
}

function normalizeScreenItem(screenId, item) {
  if (!item || typeof item !== 'object') return null;

  const hotspots = Array.isArray(item.hotspots)
    ? item.hotspots
        .filter((hotspot) => hotspot && typeof hotspot === 'object')
        .map((hotspot, idx) => ({
          id: String(hotspot.id || `${screenId}_hotspot_${idx}`),
          x: Number(hotspot.x),
          y: Number(hotspot.y),
          w: Number(hotspot.w),
          h: Number(hotspot.h),
          go: hotspot.go ? String(hotspot.go) : undefined,
          label: hotspot.label ? String(hotspot.label) : undefined,
          uiButton: hotspot.uiButton === true,
          uiLabel: hotspot.uiLabel ? String(hotspot.uiLabel) : undefined,
          storeId: hotspot.storeId ? String(hotspot.storeId) : undefined,
          popup: hotspot.popup && typeof hotspot.popup === 'object'
            ? {
                enabled: hotspot.popup.enabled !== false,
                ...(hotspot.popup.title ? { title: String(hotspot.popup.title) } : {}),
                ...(hotspot.popup.text ? { text: String(hotspot.popup.text) } : {}),
                ...(hotspot.popup.imagePath ? { imagePath: String(hotspot.popup.imagePath) } : {}),
                ...(hotspot.popup.logoPath ? { logoPath: String(hotspot.popup.logoPath) } : {}),
                ...(hotspot.popup.layout && typeof hotspot.popup.layout === 'object' ? {
                  layout: {
                    ...(hotspot.popup.layout.logo && typeof hotspot.popup.layout.logo === 'object' ? {
                      logo: {
                        ...(Number.isFinite(Number(hotspot.popup.layout.logo.x)) ? { x: Number(hotspot.popup.layout.logo.x) } : {}),
                        ...(Number.isFinite(Number(hotspot.popup.layout.logo.y)) ? { y: Number(hotspot.popup.layout.logo.y) } : {}),
                      },
                    } : {}),
                    ...(hotspot.popup.layout.text && typeof hotspot.popup.layout.text === 'object' ? {
                      text: {
                        ...(Number.isFinite(Number(hotspot.popup.layout.text.x)) ? { x: Number(hotspot.popup.layout.text.x) } : {}),
                        ...(Number.isFinite(Number(hotspot.popup.layout.text.y)) ? { y: Number(hotspot.popup.layout.text.y) } : {}),
                      },
                    } : {}),
                  },
                } : {}),
              }
            : undefined,
        }))
        .filter((hotspot) => Number.isFinite(hotspot.x) && Number.isFinite(hotspot.y) && Number.isFinite(hotspot.w) && Number.isFinite(hotspot.h))
    : [];

  const pulses = Array.isArray(item.pulses)
    ? item.pulses
        .filter((pulse) => pulse && typeof pulse === 'object')
        .map((pulse, idx) => ({
          id: String(pulse.id || `${screenId}_pulse_${idx}`),
          x: Number(pulse.x),
          y: Number(pulse.y),
        }))
        .filter((pulse) => Number.isFinite(pulse.x) && Number.isFinite(pulse.y))
    : [];

  return {
    bg: resolveScreenBackground(item.bg, screenId),
    hotspots,
    pulses,
  };
}

function normalizeRemoteScreensConfig(rawConfig) {
  const candidate = rawConfig && typeof rawConfig === 'object' ? rawConfig : null;
  if (!candidate) return null;

  const screenMap = candidate.screens && typeof candidate.screens === 'object' && !Array.isArray(candidate.screens)
    ? candidate.screens
    : (Array.isArray(candidate) ? null : candidate);

  if (!screenMap || typeof screenMap !== 'object') return null;

  const normalizedScreens = {};
  Object.entries(screenMap).forEach(([screenId, item]) => {
    if (!screenId) return;
    const normalized = normalizeScreenItem(String(screenId), item);
    if (normalized) normalizedScreens[String(screenId)] = normalized;
  });

  if (!normalizedScreens.idle) return null;

  let nextOrder = Array.isArray(candidate.screenOrder) ? candidate.screenOrder.map((id) => String(id)) : Object.keys(normalizedScreens);
  nextOrder = nextOrder.filter((id, idx) => normalizedScreens[id] && nextOrder.indexOf(id) === idx);
  if (!nextOrder.includes('idle')) nextOrder.unshift('idle');

  const map1 = normalizedScreens.map1;
  if (map1 && Array.isArray(map1.hotspots)) {
    const hasMinibank = map1.hotspots.some((hotspot) => String(hotspot?.id || '') === 'minibank');
    if (!hasMinibank) {
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
      console.log('[SCREENS] Applied migration: added map1/minibank hotspot');
    }
  }

  return {
    screens: normalizedScreens,
    order: nextOrder,
  };
}

function applyScreensConfig(nextScreens, nextOrder, sourceLabel) {
  Object.keys(SCREENS).forEach((key) => delete SCREENS[key]);
  Object.entries(nextScreens).forEach(([key, value]) => {
    SCREENS[key] = value;
  });

  SCREEN_ORDER.splice(0, SCREEN_ORDER.length, ...nextOrder);
  screensConfigSource = sourceLabel || 'unknown';
}

function resetToDefaultScreensConfig() {
  applyScreensConfig(cloneJson(SCREENS_DEFAULT), [...SCREEN_ORDER_DEFAULT], 'hardcoded');
}

function toPersistedScreenBg(bg) {
  if (typeof bg !== 'string' || !bg.trim()) return '';
  const value = bg.trim();
  const screenPrefix = `${SCREEN_ASSETS}/`;
  if (value.startsWith(screenPrefix)) {
    return value.slice(screenPrefix.length);
  }
  return value;
}

function buildScreensConfigPayload() {
  const screens = {};

  Object.entries(SCREENS).forEach(([screenId, cfg]) => {
    const hotspots = Array.isArray(cfg.hotspots)
      ? cfg.hotspots.map((h) => ({
          id: String(h.id || ''),
          x: Math.round(Number(h.x || 0) * 1000) / 1000,
          y: Math.round(Number(h.y || 0) * 1000) / 1000,
          w: Math.round(Number(h.w || 0) * 1000) / 1000,
          h: Math.round(Number(h.h || 0) * 1000) / 1000,
          ...(h.go && { go: String(h.go) }),
          ...(h.label && { label: String(h.label) }),
          ...(h.uiButton === true && { uiButton: true }),
          ...(h.uiLabel && { uiLabel: String(h.uiLabel) }),
          ...(h.storeId && { storeId: String(h.storeId) }),
          ...(h.popup && typeof h.popup === 'object' && {
            popup: {
              enabled: h.popup.enabled !== false,
              ...(h.popup.title && { title: String(h.popup.title) }),
              ...(h.popup.text && { text: String(h.popup.text) }),
              ...(h.popup.imagePath && { imagePath: String(h.popup.imagePath) }),
              ...(h.popup.logoPath && { logoPath: String(h.popup.logoPath) }),
              ...(h.popup.layout && typeof h.popup.layout === 'object' && {
                layout: {
                  ...(h.popup.layout.logo && typeof h.popup.layout.logo === 'object' && {
                    logo: {
                      ...(Number.isFinite(Number(h.popup.layout.logo.x)) && { x: Math.round(Number(h.popup.layout.logo.x) * 1000) / 1000 }),
                      ...(Number.isFinite(Number(h.popup.layout.logo.y)) && { y: Math.round(Number(h.popup.layout.logo.y) * 1000) / 1000 }),
                    },
                  }),
                  ...(h.popup.layout.text && typeof h.popup.layout.text === 'object' && {
                    text: {
                      ...(Number.isFinite(Number(h.popup.layout.text.x)) && { x: Math.round(Number(h.popup.layout.text.x) * 1000) / 1000 }),
                      ...(Number.isFinite(Number(h.popup.layout.text.y)) && { y: Math.round(Number(h.popup.layout.text.y) * 1000) / 1000 }),
                    },
                  }),
                },
              }),
            }
          }),
        }))
      : [];

    const pulses = Array.isArray(cfg.pulses)
      ? cfg.pulses.map((p) => ({
          id: String(p.id || ''),
          x: Math.round(Number(p.x || 0) * 1000) / 1000,
          y: Math.round(Number(p.y || 0) * 1000) / 1000,
        }))
      : [];

    screens[screenId] = {
      bg: toPersistedScreenBg(cfg.bg),
      hotspots,
      pulses,
    };
  });

  return {
    screenOrder: [...SCREEN_ORDER],
    screens,
  };
}

async function saveScreensConfigToSupabase(reason = 'manual') {
  const supabase = getSupabase();
  if (!supabase || typeof window.getSupabaseConfig !== 'function') {
    console.warn('[SCREENS] save skipped (Supabase not ready)');
    return false;
  }

  const cfg = window.getSupabaseConfig();
  if (!cfg || !cfg.bucket || !cfg.installSlug) {
    console.warn('[SCREENS] save skipped (invalid Supabase config)');
    return false;
  }

  const filePath = `installs/${cfg.installSlug}/config/${SCREENS_CONFIG_FILE}`;
  const payload = buildScreensConfigPayload();
  const body = JSON.stringify(payload, null, 2);

  screensSaveInFlight = true;
  try {
    const { error } = await supabase.storage
      .from(cfg.bucket)
      .update(filePath, new Blob([body], { type: 'application/json' }), { upsert: true });

    if (error) {
      console.warn('[SCREENS] autosave failed:', error.message || error);
      return false;
    }

    screensConfigSource = 'supabase';
    console.log(`[SCREENS] saved (${reason}) → ${filePath}`);
    updateAdminStatus();
    return true;
  } catch (e) {
    console.warn('[SCREENS] autosave exception:', e?.message || e);
    return false;
  } finally {
    screensSaveInFlight = false;
  }
}

function queueScreensAutosave(reason = 'edit') {
  if (!DEBUG) return;

  if (screensAutosaveTimer) {
    clearTimeout(screensAutosaveTimer);
  }

  screensAutosaveTimer = setTimeout(async () => {
    screensAutosaveTimer = null;

    if (screensSaveInFlight) {
      screensSaveQueued = true;
      return;
    }

    await saveScreensConfigToSupabase(reason);

    if (screensSaveQueued) {
      screensSaveQueued = false;
      queueScreensAutosave('queued-edit');
    }
  }, SCREENS_AUTOSAVE_DELAY_MS);
}

async function loadScreensConfigFromSupabase() {
  const supabase = getSupabase();
  if (!supabase || typeof window.getSupabaseConfig !== 'function') {
    resetToDefaultScreensConfig();
    return false;
  }

  const cfg = window.getSupabaseConfig();
  if (!cfg || !cfg.bucket || !cfg.installSlug) {
    resetToDefaultScreensConfig();
    return false;
  }

  const folderPath = `installs/${cfg.installSlug}/config`;
  const fileName = SCREENS_CONFIG_FILE;
  const filePath = `${folderPath}/${fileName}`;

  try {
    const { data: folderItems, error: folderErr } = await supabase.storage.from(cfg.bucket).list(folderPath, {
      limit: 200,
      offset: 0,
    });

    const exists = !folderErr && Array.isArray(folderItems) && folderItems.some((item) => item?.name === fileName);
    if (!exists) {
      console.log('[SCREENS] Using hardcoded config (no screens.json found at', filePath + ')');
      resetToDefaultScreensConfig();
      return false;
    }

    const { data, error } = await supabase.storage.from(cfg.bucket).download(filePath);
    if (error || !data) {
      console.warn('[SCREENS] Failed to download screens.json, using hardcoded config:', error?.message || error);
      resetToDefaultScreensConfig();
      return false;
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeRemoteScreensConfig(parsed);
    if (!normalized) {
      console.warn('[SCREENS] Invalid screens.json format, using hardcoded config');
      resetToDefaultScreensConfig();
      return false;
    }

    applyScreensConfig(normalized.screens, normalized.order, 'supabase');
    console.log('[SCREENS] Loaded screens config from Supabase:', filePath);
    return true;
  } catch (e) {
    console.warn('[SCREENS] Error while loading screens.json, using hardcoded config:', e?.message || e);
    resetToDefaultScreensConfig();
    return false;
  }
}

function ensureWeatherPanel() {
  let panel = document.getElementById('playerWeatherPanel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'playerWeatherPanel';
  panel.className = 'player-weather-panel hidden';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="player-weather-inner">
      <p id="playerWeatherTitle" class="player-weather-title">Vær</p>
      <p id="playerWeatherStatus" class="player-weather-status">Widget er ikke aktivert</p>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function getLayoutModeFromSettings(settings) {
  const mode = String(settings?.screenLayout?.mode || LAYOUT_MODE_DEFAULT).trim();
  return PLAYER_LAYOUT_MODES.has(mode) ? mode : LAYOUT_MODE_DEFAULT;
}

function applyPlayerLayoutMode(mode) {
  const body = document.body;
  if (!body) return;

  body.classList.remove('layout-default', 'layout-bottom-weather', 'layout-split-ads-weather');

  switch (mode) {
    case 'bottom-weather':
      body.classList.add('layout-bottom-weather');
      break;
    case 'split-ads-weather':
      body.classList.add('layout-split-ads-weather');
      break;
    default:
      body.classList.add('layout-default');
      break;
  }
}

function applyWeatherPanelFromSettings(settings) {
  const panel = ensureWeatherPanel();
  const titleEl = document.getElementById('playerWeatherTitle');
  const statusEl = document.getElementById('playerWeatherStatus');
  const mode = getLayoutModeFromSettings(settings);
  const weatherEnabled = settings?.weather?.enabled === true;
  const location = String(settings?.weather?.location || PLAYER_SETTINGS_DEFAULT.weather.location);

  if (mode === 'default') {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  if (titleEl) {
    titleEl.textContent = mode === 'split-ads-weather' ? 'Vær (høyre sone)' : 'Vær (nederst)';
  }
  if (statusEl) {
    statusEl.textContent = weatherEnabled
      ? `${location} · Vær-API ikke koblet enda (placeholder)`
      : 'Widget er av i innstillinger';
  }
}

function normalizePlayerSettings(raw) {
  const weatherEnabled = raw?.weather?.enabled === true;
  const locationRaw = String(raw?.weather?.location || PLAYER_SETTINGS_DEFAULT.weather.location).trim();
  const location = locationRaw || PLAYER_SETTINGS_DEFAULT.weather.location;
  const mode = getLayoutModeFromSettings(raw);

  return {
    weather: {
      enabled: weatherEnabled,
      location,
    },
    screenLayout: {
      mode,
    },
  };
}

function applyPlayerSettings(raw) {
  playerSettings = normalizePlayerSettings(raw);
  applyPlayerLayoutMode(playerSettings.screenLayout.mode);
  applyWeatherPanelFromSettings(playerSettings);
}

async function loadPlayerSettingsFromSupabase() {
  const supabase = getSupabase();
  if (!supabase || typeof window.getSupabaseConfig !== 'function') {
    applyPlayerSettings(PLAYER_SETTINGS_DEFAULT);
    return false;
  }

  const cfg = window.getSupabaseConfig();
  if (!cfg || !cfg.bucket || !cfg.installSlug) {
    applyPlayerSettings(PLAYER_SETTINGS_DEFAULT);
    return false;
  }

  const folderPath = `installs/${cfg.installSlug}/assets`;
  const fileName = PLAYER_SETTINGS_FILE;
  const filePath = `${folderPath}/${fileName}`;

  try {
    const { data: folderItems, error: folderErr } = await supabase.storage.from(cfg.bucket).list(folderPath, {
      limit: 200,
      offset: 0,
    });

    const exists = !folderErr && Array.isArray(folderItems) && folderItems.some((item) => item?.name === fileName);
    if (!exists) {
      applyPlayerSettings(PLAYER_SETTINGS_DEFAULT);
      return false;
    }

    const { data, error } = await supabase.storage.from(cfg.bucket).download(filePath);
    if (error || !data) {
      console.warn('[SETTINGS] Failed to download settings.json, using defaults:', error?.message || error);
      applyPlayerSettings(PLAYER_SETTINGS_DEFAULT);
      return false;
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    applyPlayerSettings(parsed);
    console.log('[SETTINGS] Loaded player settings from Supabase:', filePath);
    return true;
  } catch (e) {
    console.warn('[SETTINGS] Error while loading settings.json, using defaults:', e?.message || e);
    applyPlayerSettings(PLAYER_SETTINGS_DEFAULT);
    return false;
  }
}

// allowed file extensions for ads (storage listing)
const ADS_EXT = ['.jpg','.jpeg','.png','.webp','.mp4'];
let AD_DURATION_MS = 8000;

// helper used by diagnostics/polling signature
function makeAdsSignature(ads){
  try{
    // stable signature based on path array
    return ads.map(a=>a.path||a.src||'').join('|');
  }catch(e){
    return String(Date.now());
  }
}


// quick log of Supabase readiness (no caching)
if (getSupabase() && window.isSupabaseConfigured && window.isSupabaseConfigured()) {
  console.log('[ADS] supabase singleton ready');
} else {
  console.warn('[ADS] Supabase not configured – ad playback disabled');
}

// ------------------ ads overlay helpers --------------------
function ensureAdsLayer(){
  if(adsLayer) return adsLayer;
  const div = document.createElement('div');
  div.id = 'adsLayer';
  div.className = 'ads-layer hidden';
  div.style.pointerEvents = 'none'; // ALWAYS none - tap catcher handles interaction
  document.body.appendChild(div);
  adsLayer = div;
  // move video element into overlay
  if(videoEl && videoEl.parentElement !== adsLayer){
    adsLayer.appendChild(videoEl);
    videoEl.style.zIndex = '1';
    videoEl.style.pointerEvents = 'none'; // CRITICAL: don't block tap-catcher clicks
    // ensure covers the overlay
    videoEl.style.position = 'absolute';
    videoEl.style.top = '0';
    videoEl.style.left = '0';
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';
  }
  return adsLayer;
}

function showAdsOverlay(){
  const layer = ensureAdsLayer();
  clearMapArtifacts();
  
  // Close any open store popup before showing ads
  closeStorePopup();
  
  // Explicitly remove hidden class and add show class
  // NOTE: pointer-events stays NONE - tap catcher (z-index 9996) handles clicks
  layer.classList.remove('hidden');
  layer.classList.add('show');
  
  adsRunning = true;
  showAdsTapCatcher(); // This enables pointer-events on tap catcher
}

function hideAdsOverlay(){
  const layer = ensureAdsLayer();
  layer.classList.remove('show');
  layer.classList.add('hidden');
  
  adsRunning = false;
  hideAdsTapCatcher(); // This disables pointer-events on tap catcher
}

// DOM refs
const screenEl = document.getElementById("screen");
const videoEl = document.getElementById("video");
const hotspotsEl = document.getElementById("hotspots");

let ADS = [];
let adIndex = 0;
let adTimer = null;
let adFallbackTimer = null;
let pendingVideoSkipTimer = null;
// overlay layer and state
let adsLayer = null;
// === VIDEO FAILSAFE ===
let videoWatchdogTimer = null;
let videoMaxTimer = null;
let videoStarted = false;
let currentVideoHandlers = {};

let currentScreen = null;
let currentDebugData = null; // Tracks debug state

// Clamp value to [0,1]
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Round to 3 decimals
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!target.isContentEditable;
}

function isMapScreenId(id) {
  return !!(id && String(id).includes('map'));
}

// --- Interaction helpers for onboarding/tap hint ---
function isPassiveScreen(id) {
  return id === "idle" || id === "ads" || id === "ad" || (id && id.includes("reklame"));
}

// helpers for ad tap catcher
function showAdsTapCatcher(){
  const el = document.getElementById("adsTapCatcher");
  if (!el) return;
  el.classList.remove("hidden");
  el.style.display = "block"; // Ensure visible
  el.style.pointerEvents = "auto"; // Ensure clickable
}
function hideAdsTapCatcher(){
  const el = document.getElementById("adsTapCatcher");
  if (!el) return;
  el.classList.add("hidden");
  el.style.display = "none"; // Ensure hidden
  el.style.pointerEvents = "none"; // Disable clicks
}
function stopAdsIfRunning(){ if(adsRunning && typeof stopAds==='function') stopAds(); }

function recordTouch() {
  const ts = Date.now();
  try { localStorage.setItem('sx_last_touch_ts', String(ts)); } catch(e){/*ignore*/}
  updateTouchHintOpacity();
}

function updateTouchHintOpacity() {
  const hint = document.getElementById('touchHint');
  if(!hint) return;
  const last = parseInt(localStorage.getItem('sx_last_touch_ts') || '0', 10);
  const age = Date.now() - last;
  if (!last || age > 24 * 3600 * 1000) {
    hint.style.opacity = '1';
  } else {
    hint.style.opacity = '0.35';
  }
}

function updateTouchHintVisibility() {
  const hint = document.getElementById('touchHint');
  if(!hint) return;
  if (isPassiveScreen(currentScreen)) {
    hint.style.display = 'block';
    updateTouchHintOpacity();
  } else {
    hint.style.display = 'none';
  }
}

// DOM elements creation for hint
function createTouchHint() {
  const div = document.createElement('div');
  div.id = 'touchHint';
  div.setAttribute('aria-hidden','true');
  div.textContent = 'Trykk på skjermen for å starte';
  div.style.display = 'none';
  document.body.appendChild(div);
}

// String helpers
const bgA = document.getElementById('bgA');
const bgB = document.getElementById('bgB');

let bgToken = 0;
let bgFront = 'A';         // which layer is currently visible
let bgCurrent = '';
const BG_FADE_MS = 260;

const bgWarmupSet = new Set();

function warmupBackground(url) {
  if (!url || bgWarmupSet.has(url)) return;
  bgWarmupSet.add(url);

  // warm image decode/cache to avoid first-transition hiccup
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  if (typeof img.decode === 'function') {
    img.decode().catch(() => {});
  }

  // also warm size cache used by fit-layout calculations
  ensureImageSize(url).catch(() => {});
}

function warmupAllBackgrounds() {
  Object.values(ASSETS || {}).forEach((url) => warmupBackground(url));
  Object.values(SCREENS || {}).forEach((cfg) => warmupBackground(cfg?.bg));
}

function crossfadeBackground(url){
  const token = ++bgToken;

  if(!url){
    bgA.style.backgroundImage = '';
    bgB.style.backgroundImage = '';
    bgA.style.opacity = '0';
    bgB.style.opacity = '0';
    bgCurrent = '';
    return;
  }
  markRendered();

  // if same image: do a tiny pulse so it still "feels" responsive
  const same = (url === bgCurrent);

  const frontEl = (bgFront === 'A') ? bgA : bgB;
  const backEl  = (bgFront === 'A') ? bgB : bgA;

  // load into back layer
  backEl.style.backgroundImage = `url("${url}")`;

  // ensure back starts hidden, then fade it in
  backEl.style.opacity = '0';

  // use double-rAF instead of forced reflow for smoother transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if(token !== bgToken) return;
      backEl.style.opacity = '1';
      // fade out front (unless nothing there)
      frontEl.style.opacity = same ? '1' : '0';
    });
  });

  // after transition, swap “front”
  setTimeout(() => {
    if(token !== bgToken) return;
    // if same, do a micro pulse: fade out then in quickly
    if(same){
      backEl.style.opacity = '0.92';
      requestAnimationFrame(()=> backEl.style.opacity = '1');
    }
    bgFront = (bgFront === 'A') ? 'B' : 'A';
    bgCurrent = url;
  }, BG_FADE_MS + 40);
}

// keep name so resten av koden din funker
function safeSetBackground(url){
  crossfadeBackground(url);
}

function clearHotspots(){
  while(hotspotsEl.firstChild) hotspotsEl.removeChild(hotspotsEl.firstChild);
}

let activeDemoRoute = null;
let demoRouteSvg = null;
let demoRoutePath = null;

function clearDemoRouteOverlay() {
  if (demoRouteSvg) {
    demoRouteSvg.remove();
    demoRouteSvg = null;
    demoRoutePath = null;
  }
}

function setActiveDemoRoute(screenName, from, to) {
  if (!from || !to) {
    activeDemoRoute = null;
    clearDemoRouteOverlay();
    return;
  }

  activeDemoRoute = {
    screenName,
    from: { x: clamp01(from.x), y: clamp01(from.y) },
    to: { x: clamp01(to.x), y: clamp01(to.y) },
  };
}

function renderDemoRouteOverlay(screenName, fit) {
  if (!activeDemoRoute || activeDemoRoute.screenName !== screenName) {
    clearDemoRouteOverlay();
    return;
  }

  const rect = hotspotsEl.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth || 1);
  const height = Math.max(1, rect.height || window.innerHeight || 1);

  if (!demoRouteSvg) {
    demoRouteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    demoRouteSvg.classList.add('route-overlay');
    demoRouteSvg.setAttribute('aria-hidden', 'true');

    demoRoutePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    demoRoutePath.classList.add('route-path');
    demoRouteSvg.appendChild(demoRoutePath);

    hotspotsEl.appendChild(demoRouteSvg);
  }

  demoRouteSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  demoRouteSvg.setAttribute('width', String(width));
  demoRouteSvg.setAttribute('height', String(height));

  const startX = fit.left + activeDemoRoute.from.x * fit.width;
  const startY = fit.top + activeDemoRoute.from.y * fit.height;
  const endX = fit.left + activeDemoRoute.to.x * fit.width;
  const endY = fit.top + activeDemoRoute.to.y * fit.height;
  const curveLift = Math.max(16, fit.height * 0.045);
  const controlX = (startX + endX) / 2;
  const controlY = Math.min(startY, endY) - curveLift;

  demoRoutePath.setAttribute('d', `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`);

  const pathLength = demoRoutePath.getTotalLength();
  demoRoutePath.style.strokeDasharray = `${pathLength}`;
  demoRoutePath.style.strokeDashoffset = `${pathLength}`;
  demoRoutePath.classList.remove('route-path-animate');
  demoRoutePath.getBoundingClientRect();
  demoRoutePath.classList.add('route-path-animate');
}

// Render actual hotspots and pulses for the current screen
// Ensure we can compute the visible image rect (fit rect) for mapping normalized coordinates
const imageSizeCache = {};
function ensureImageSize(url){
  if(!url) return Promise.resolve({w:1,h:1});
  if(imageSizeCache[url]) return Promise.resolve(imageSizeCache[url]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageSizeCache[url] = {w: img.naturalWidth || img.width, h: img.naturalHeight || img.height};
      resolve(imageSizeCache[url]);
    };
    img.onerror = () => { imageSizeCache[url] = {w:1,h:1}; resolve(imageSizeCache[url]); };
    img.src = url;
  });
}

async function getFitRectForCurrentScreen(screenName){
  const cfg = SCREENS[screenName] || {};
  const url = cfg.bg || '';
  const containerRect = hotspotsEl.getBoundingClientRect();
  const cW = containerRect.width || window.innerWidth;
  const cH = containerRect.height || window.innerHeight;
  const img = await ensureImageSize(url);
  const scale = Math.min(cW / img.w, cH / img.h);
  const displayW = img.w * scale;
  const displayH = img.h * scale;
  const left = (cW - displayW) / 2;
  const top = (cH - displayH) / 2;
  return { left, top, width: displayW, height: displayH };
}

let debugFitEl = null;
let layoutRequestToken = 0;
async function applyLayout(screenName){
  const cfg = SCREENS[screenName];
  if(!cfg) return;
  const layoutToken = ++layoutRequestToken;
  const fit = await getFitRectForCurrentScreen(screenName);
  if (layoutToken !== layoutRequestToken) return;
  if (screenName !== currentScreen) return;

  // debug fit rect
  if(DEBUG){
    if(!debugFitEl){ debugFitEl = document.createElement('div'); debugFitEl.style.position='absolute'; debugFitEl.style.border='2px dashed lime'; debugFitEl.style.pointerEvents='none'; debugFitEl.style.zIndex='110'; if(debugContainer) debugContainer.appendChild(debugFitEl); else hotspotsEl.appendChild(debugFitEl); }
    debugFitEl.style.left = fit.left + 'px';
    debugFitEl.style.top = fit.top + 'px';
    debugFitEl.style.width = fit.width + 'px';
    debugFitEl.style.height = fit.height + 'px';
    // ensure debugContainer matches fit rect if present
    if(debugContainer){
      debugContainer.style.left = fit.left + 'px';
      debugContainer.style.top = fit.top + 'px';
      debugContainer.style.width = fit.width + 'px';
      debugContainer.style.height = fit.height + 'px';
    }
  } else if(debugFitEl){ debugFitEl.remove(); debugFitEl = null; }

  // layout hotspots
  cfg.hotspots.forEach((h, i) => {
    const el = hotspotsEl.querySelector(`[data-hotspot-idx="${i}"][data-screen-name="${screenName}"]`);
    if(!el) return;
    const pxLeft = fit.left + h.x * fit.width;
    const pxTop = fit.top + h.y * fit.height;
    const pxW = Math.max(2, h.w * fit.width);
    const pxH = Math.max(2, h.h * fit.height);
    el.style.left = pxLeft + 'px';
    el.style.top = pxTop + 'px';
    el.style.width = pxW + 'px';
    el.style.height = pxH + 'px';
    el.style.transform = 'translate(-50%, -50%)';
  });

  // layout pulses
  cfg.pulses.forEach((p, i) => {
    const el = hotspotsEl.querySelector(`[data-pulse-idx="${i}"][data-screen-name="${screenName}"]`);
    if(!el) return;
    const pxLeft = fit.left + p.x * fit.width;
    const pxTop = fit.top + p.y * fit.height;
    el.style.left = pxLeft + 'px';
    el.style.top = pxTop + 'px';
  });

  renderDemoRouteOverlay(screenName, fit);
}

// re-layout on resize/orientation
window.addEventListener('resize', () => {
  if(!currentScreen) return;
  applyLayout(currentScreen);
});
window.addEventListener('orientationchange', () => {
  if(!currentScreen) return;
  applyLayout(currentScreen);
});

// Render actual hotspots and pulses for the current screen (mapped to image fit rect)
function setScreen(screenName) {
  if (!SCREENS[screenName]) return console.error("Unknown screen:", screenName);

  if (activeDemoRoute && activeDemoRoute.screenName !== screenName) {
    setActiveDemoRoute(null, null, null);
  }

  // detect transition from a map screen into a passive state
  const leavingMap = isMapScreenId(currentScreen);
  const goingPassive = screenName === "idle" || screenName === "menu" || screenName === "floors" || screenName === "ads" || screenName === "ad" || (screenName && screenName.includes("reklame"));
  if (leavingMap && goingPassive) {
    clearMapArtifacts();
  }

  // CRITICAL: Check BEFORE changing currentScreen
  const wasIdle = currentScreen === 'idle';
  const goingToIdle = screenName === 'idle';
  
  // when leaving idle, stop the auto-start timer
  if (wasIdle && !goingToIdle) {
    stopIdleToAdsTimer();
  }

  currentScreen = screenName;
  const config = SCREENS[screenName];

clearHotspots();
stopAds();
videoEl.style.display = 'none';
safeSetBackground(config.bg);

  const ensureMapPulse = (pulseId, x, y) => {
    if (!Array.isArray(config.pulses)) config.pulses = [];
    if (config.pulses.some((pulse) => String(pulse?.id || '') === pulseId)) return;

    config.pulses.push({
      id: pulseId,
      x: clamp01(x),
      y: clamp01(y),
    });

    const pulseIdx = config.pulses.length - 1;
    const pulseEl = document.createElement('div');
    pulseEl.className = 'pulse';
    pulseEl.dataset.pulseIdx = String(pulseIdx);
    pulseEl.dataset.screenName = screenName;
    pulseEl.style.position = 'absolute';
    pulseEl.style.pointerEvents = 'none';
    pulseEl.style.transform = 'translate(-50%, -50%)';
    hotspotsEl.appendChild(pulseEl);
    applyLayout(screenName);
  };

  // create hotspots with data attributes so layout can set px coords
  config.hotspots.forEach((h, i) => {
    const btn = document.createElement('button');
    btn.className = 'hotspot';
    btn.dataset.hotspotIdx = String(i);
    btn.dataset.screenName = screenName;
    btn.setAttribute('aria-label', h.label || h.id);
    btn.style.position = 'absolute';
    btn.style.pointerEvents = 'auto';
    btn.style.transform = 'translate(-50%, -50%)';

    if (h.uiButton) {
      btn.classList.add('hotspot-pill');
      const labelEl = document.createElement('span');
      labelEl.className = 'hotspot-pill-label';
      labelEl.textContent = h.uiLabel || h.label || h.id;
      btn.appendChild(labelEl);
    }

    let lastActivationTs = 0;
    const activateHotspot = (ev) => {
      const now = Date.now();
      if (now - lastActivationTs < 250) {
        ev.stopPropagation();
        ev.preventDefault();
        return;
      }
      lastActivationTs = now;

      if (DEBUG && editMode) { ev.stopPropagation(); ev.preventDefault(); return; }
      ev.stopPropagation();
      ev.preventDefault();

      if (screenName === 'idle' && isIdleLeftFullscreenGesture(ev)) {
        tryDemoFullscreenOnce(true);
        return;
      }

      resetIdleTimer();

      if (screenName === 'map1' && h.id === 'minibank') {
        ensureMapPulse('minibank_pulse', 0.444, 0.527);
        const fromPulse = (config.pulses || []).find((pulse) => String(pulse?.id || '') === 'you_are_here') || { x: 0.415, y: 0.538 };
        setActiveDemoRoute('map1', { x: fromPulse.x, y: fromPulse.y }, { x: 0.444, y: 0.527 });
        applyLayout(screenName);
      }

      if (h.go) {
        if (!SCREENS[h.go]) {
          console.warn('[HOTSPOT] Unknown go target:', h.go, 'from hotspot', h.id, 'on screen', screenName);
          return;
        }
        setScreen(h.go);
      } else if (h.popup?.enabled || h.storeId) {
        openStorePopup({
          storeId: h.storeId,
          title: h.popup?.title || h.label,
          text: h.popup?.text || '',
          imagePath: h.popup?.imagePath,
          logoPath: h.popup?.logoPath,
          layout: h.popup?.layout,
        });
        stopIdleToAdsTimer();
      }
    };

    btn.addEventListener('pointerdown', activateHotspot);
    btn.addEventListener('click', activateHotspot);

    hotspotsEl.appendChild(btn);
  });

  // create pulse elements
  config.pulses.forEach((p, i) => {
    const pul = document.createElement('div');
    pul.className = 'pulse';
    pul.dataset.pulseIdx = String(i);
    pul.dataset.screenName = screenName;
    pul.style.position = 'absolute';
    pul.style.pointerEvents = 'none';
    hotspotsEl.appendChild(pul);
  });

  // apply pixel layout
  applyLayout(screenName);

  // Render debug editor if enabled
  if (DEBUG) {
    renderDebugEditor(screenName);
  } else {
    clearDebugEditor();
  }

  // schedule ads countdown from current screen inactivity policy
  resetIdleTimer();

  // update hint visibility after screen change
  updateTouchHintVisibility();
}


// Debug Editor Functions
let debugContainer = null;
let debugHelp = null;
let debugDocListeners = [];

function bindDebugDocListener(type, handler) {
  document.addEventListener(type, handler);
  debugDocListeners.push({ type, handler });
}

function clearDebugDocListeners() {
  debugDocListeners.forEach(({ type, handler }) => {
    document.removeEventListener(type, handler);
  });
  debugDocListeners = [];
}

function clearDebugEditor() {
  clearDebugDocListeners();
  if (debugContainer) {
    debugContainer.remove();
    debugContainer = null;
  }
  if (debugHelp) {
    debugHelp.remove();
    debugHelp = null;
  }
}

async function renderDebugEditor(screenName) {
  clearDebugEditor();

  if (!SCREENS[screenName]) return;
  const config = SCREENS[screenName];

  // Compute fit rect for this screen and make debug container match that rect
  const fit = await getFitRectForCurrentScreen(screenName);

  debugContainer = document.createElement('div');
  debugContainer.className = 'debug-container';
  debugContainer.style.pointerEvents = (DEBUG && editMode) ? 'auto' : 'none';
  debugContainer.style.left = fit.left + 'px';
  debugContainer.style.top = fit.top + 'px';
  debugContainer.style.width = fit.width + 'px';
  debugContainer.style.height = fit.height + 'px';
  debugContainer.style.position = 'absolute';
  hotspotsEl.appendChild(debugContainer);

  // Render hotspot editors (positions are percentages inside debugContainer)
  config.hotspots.forEach((h, idx) => {
    renderHotspotBox(debugContainer, h, screenName, idx, fit);
  });

  // Render pulse editors
  config.pulses.forEach((p, idx) => {
    renderPulseDot(debugContainer, p, screenName, idx, fit);
  });

  // Show help text
  debugHelp = document.createElement('div');
  debugHelp.className = 'debug-help';
  debugHelp.innerHTML = 
    `<strong>DEBUG EDITOR</strong><br>` +
    `🟨 Yellow boxes = hotspots | Drag to move, drag corner to resize<br>` +
    `🟦 Cyan dots = pulses | Drag to move<br>` +
    `Hold ArrowDown to edit (editMode).`;
  document.body.appendChild(debugHelp);
}

function renderHotspotBox(container, hotspot, screenName, hotspotIdx, fit) {
  const box = document.createElement('div');
  box.className = 'debug-box';
  box.dataset.screenName = screenName;
  box.dataset.hotspotIdx = hotspotIdx;
  box.style.pointerEvents = 'auto';
  
  // Position and size
  updateBoxStyle(box, hotspot);
  
  // Label
  const label = document.createElement('div');
  label.className = 'debug-label';
  updateLabelText(label, hotspot);
  box.appendChild(label);
  
  // Resize handle
  const handle = document.createElement('div');
  handle.className = 'debug-handle';
  box.appendChild(handle);
  
  // Make draggable
  let isDragging = false;
  let isResizing = false;
  let startX, startY;
  let startX1, startY1, startW, startH;
  
  const onStart = (e) => {
    if (e.target === handle) {
      isResizing = true;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startX1 = hotspot.x;
      startY1 = hotspot.y;
      startW = hotspot.w;
      startH = hotspot.h;
    } else {
      isDragging = true;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startX1 = hotspot.x;
      startY1 = hotspot.y;
    }
    box.dataset.debugMode = '1';
    e.stopPropagation();
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!isDragging && !isResizing) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // compute deltas relative to the debug container (fit rect)
    const rect = container.getBoundingClientRect();
    const dX = (clientX - startX) / rect.width;
    const dY = (clientY - startY) / rect.height;
    
    if (isDragging) {
      hotspot.x = clamp01(startX1 + dX);
      hotspot.y = clamp01(startY1 + dY);
      updateBoxStyle(box, hotspot);
      updateLabelText(label, hotspot);
    } else if (isResizing) {
      // resizing adjusts width/height (normalized)
      hotspot.w = clamp01(startW + dX);
      hotspot.h = clamp01(startH + dY);
      updateBoxStyle(box, hotspot);
      updateLabelText(label, hotspot);
    }
    
    e.stopPropagation();
    e.preventDefault();
  };
  
  const onEnd = (e) => {
    if (isDragging || isResizing) {
      logHotspotsForScreen(screenName);
      logPulsesForScreen(screenName);
      queueScreensAutosave('hotspot-edit');
    }
    isDragging = false;
    isResizing = false;
    delete box.dataset.debugMode;
    e.stopPropagation();
    e.preventDefault();
  };
  
  box.addEventListener('pointerdown', onStart);
  bindDebugDocListener('pointermove', onMove);
  bindDebugDocListener('pointerup', onEnd);
  
  container.appendChild(box);
}

function renderPulseDot(container, pulse, screenName, pulseIdx, fit) {
  const dot = document.createElement('div');
  dot.className = 'debug-dot';
  dot.dataset.screenName = screenName;
  dot.dataset.pulseIdx = pulseIdx;
  dot.style.pointerEvents = 'auto';
  
  // Label
  const label = document.createElement('div');
  label.className = 'debug-dot-label';
  updatePulseLabelText(label, pulse);
  dot.appendChild(label);
  
  // Position
  updateDotStyle(dot, pulse);
  
  // Make draggable
  let isDragging = false;
  let startX, startY;
  let startX1, startY1;
  
  const onStart = (e) => {
    isDragging = true;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startX1 = pulse.x;
    startY1 = pulse.y;
    dot.classList.add('dragging');
    e.stopPropagation();
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!isDragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = container.getBoundingClientRect();
    const dX = (clientX - startX) / rect.width;
    const dY = (clientY - startY) / rect.height;

    pulse.x = clamp01(startX1 + dX);
    pulse.y = clamp01(startY1 + dY);
    updateDotStyle(dot, pulse);
    updatePulseLabelText(label, pulse);
    
    e.stopPropagation();
    e.preventDefault();
  };
  
  const onEnd = (e) => {
    if (isDragging) {
      logHotspotsForScreen(screenName);
      logPulsesForScreen(screenName);
      queueScreensAutosave('pulse-edit');
    }
    isDragging = false;
    dot.classList.remove('dragging');
    e.stopPropagation();
    e.preventDefault();
  };
  
  dot.addEventListener('pointerdown', onStart);
  bindDebugDocListener('pointermove', onMove);
  bindDebugDocListener('pointerup', onEnd);
  
  container.appendChild(dot);
}

function updateBoxStyle(boxEl, hotspot) {
  boxEl.style.left = (hotspot.x * 100) + '%';
  boxEl.style.top = (hotspot.y * 100) + '%';
  boxEl.style.width = (hotspot.w * 100) + '%';
  boxEl.style.height = (hotspot.h * 100) + '%';
  boxEl.style.transform = 'translate(-50%, -50%)';
}

function updateDotStyle(dotEl, pulse) {
  dotEl.style.left = (pulse.x * 100) + '%';
  dotEl.style.top = (pulse.y * 100) + '%';
}

function updateLabelText(labelEl, hotspot) {
  labelEl.textContent = 
    `${hotspot.id} | x:${round3(hotspot.x)} y:${round3(hotspot.y)} w:${round3(hotspot.w)} h:${round3(hotspot.h)}`;
}

function updatePulseLabelText(labelEl, pulse) {
  labelEl.textContent = `${pulse.id || '?'} | x:${round3(pulse.x)} y:${round3(pulse.y)}`;
}

// Logging functions for copy/paste
function logHotspotsForScreen(screenName) {
  const hs = SCREENS[screenName].hotspots.map(h => ({
    id: h.id,
    x: round3(h.x),
    y: round3(h.y),
    w: round3(h.w),
    h: round3(h.h),
    ...(h.go && { go: h.go }),
    ...(h.label && { label: h.label }),
    ...(h.storeId && { storeId: h.storeId })
  }));
  console.log(`[${screenName}] hotspots =`, JSON.stringify(hs, null, 2));
}

function logPulsesForScreen(screenName) {
  const ps = SCREENS[screenName].pulses.map(p => ({
    id: p.id,
    x: round3(p.x),
    y: round3(p.y)
  }));
  if (ps.length > 0) {
    console.log(`[${screenName}] pulses =`, JSON.stringify(ps, null, 2));
  }
}

// --- Store popup / modal ---
function escapeHtml(str){
  if(!str) return '';
  return String(str).replace(/[&<>"']/g, (s)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"
  }[s]));
}

async function openStorePopup(input){
  const modal = document.getElementById('storeModal');
  const body  = document.getElementById('storeBody');
  const closeBtn = document.getElementById('storeClose');
  if(!modal || !body) return;

  const popupCfg = (typeof input === 'string')
    ? { storeId: input }
    : (input && typeof input === 'object' ? input : {});

  const storeId = popupCfg.storeId || '';
  const popupTitle = popupCfg.title ? escapeHtml(popupCfg.title) : '';
  const popupText = popupCfg.text ? escapeHtml(popupCfg.text) : '';

  const resolveAssetUrl = (rawPath) => {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const path = rawPath.trim();
    if (!path) return null;

    const toPublic = (installPath) => {
      const normalized = typeof installPath === 'string' ? installPath.trim() : '';
      if (!normalized) return null;

      const supabase = getSupabase();
      const cfg = (typeof window.getSupabaseConfig === 'function') ? window.getSupabaseConfig() : null;
      const bucket = cfg?.bucket;
      if (supabase && bucket) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
        if (data?.publicUrl) return data.publicUrl;
      }

      return withBase(normalized);
    };

    if (path.startsWith('data:') || path.startsWith('/')) return path;

    if (path.startsWith('http://') || path.startsWith('https://')) {
      const match = path.match(/\/storage\/v1\/object\/public\/[^/]+\/(installs\/.*)$/i);
      if (match?.[1]) {
        return toPublic(decodeURIComponent(match[1]));
      }
      return path;
    }

    if (path.startsWith('installs/')) return toPublic(path);
    if (path.startsWith('assets/')) return toPublic(`installs/${INSTALL_ID}/${path}`);
    if (path.startsWith('stores/')) return toPublic(`installs/${INSTALL_ID}/assets/${path}`);
    return toPublic(`installs/${INSTALL_ID}/assets/stores/${path}`);
  };

  const layout = {
    logo: {
      x: clamp01(Number(popupCfg.layout?.logo?.x ?? 0.78)),
      y: clamp01(Number(popupCfg.layout?.logo?.y ?? 0.06)),
    },
    text: {
      x: clamp01(Number(popupCfg.layout?.text?.x ?? 0.06)),
      y: clamp01(Number(popupCfg.layout?.text?.y ?? 0.08)),
    },
  };

  // prøver i denne rekkefølgen (webp først, så png/jpg)
  const exts = ['.webp', '.png', '.jpg', '.jpeg'];
  let foundUrl = resolveAssetUrl(popupCfg.imagePath);
  let logoUrl = resolveAssetUrl(popupCfg.logoPath);

  const findStoreAsset = async (baseName) => {
    if (!storeId) return null;
    for (const ext of exts) {
      const url = `${STORES_ASSETS}/${storeId}/${baseName}${ext}`;
      try {
        const head = await fetch(url, { method:'HEAD', cache:'no-store' });
        if (head.ok) return url;
        const get = await fetch(url, {
          method:'GET',
          headers: { Range: 'bytes=0-0' },
          cache:'no-store'
        });
        if (get.ok) return url;
      } catch (e) {
      }
    }
    return null;
  };

  if (!foundUrl) {
    foundUrl = await findStoreAsset('popup');
  }
  if (!logoUrl) {
    logoUrl = await findStoreAsset('logo');
  }

  if(!foundUrl && !logoUrl && !popupTitle && !popupText){
    body.innerHTML = `
      <div style="color:#fff; font-family:sans-serif;">
        Fant ikke popup-data for <b>${escapeHtml(storeId || 'ukjent butikk')}</b>.<br>
        Legg inn en fil som heter <code>popup.png</code> / <code>popup.jpg</code> / <code>popup.webp</code>
        i mappen <code>stores/${storeId}/</code>.
      </div>
    `;
  } else {
    const infoHtml = (popupTitle || popupText)
      ? `
        <div class="store-popup-text" style="left:${layout.text.x * 100}%;top:${layout.text.y * 100}%">
          ${popupTitle ? `<h2>${popupTitle}</h2>` : ''}
          ${popupText ? `<p>${popupText}</p>` : ''}
        </div>
      `
      : '';

    const imageHtml = foundUrl
      ? `
        <img
          src="${foundUrl}"
          alt="${escapeHtml(storeId || popupCfg.title || 'butikk')}"
          class="store-popup-image"
          onerror="this.remove()"
        >
      `
      : '';

    const logoHtml = logoUrl
      ? `
        <img
          src="${logoUrl}"
          alt="${escapeHtml(storeId || popupCfg.title || 'logo')}"
          class="store-popup-logo"
          style="left:${layout.logo.x * 100}%;top:${layout.logo.y * 100}%"
          onerror="this.remove()"
        >
      `
      : '';

    body.innerHTML = `
      <div class="store-popup-canvas">
        ${imageHtml}
        ${logoHtml}
        ${infoHtml}
      </div>
    `;
  }

  modal.classList.remove('hidden');

  if(closeBtn) closeBtn.onclick = closeStorePopup;
  modal.onclick = (e) => { if(e.target === modal) closeStorePopup(); };
}

function closeStorePopup(){
  const modal = document.getElementById('storeModal');
  if(!modal) return;
  modal.classList.add('hidden');
  const body = document.getElementById('storeBody'); if(body) body.innerHTML='';
}

// === ADS POLLING ===
function makePlaylistSignature(){
  try{
    return JSON.stringify({ duration: AD_DURATION_MS, ads: ADS.map(a=>a.src) });
  }catch(e){ return ''+Date.now(); }
}

// helper: return the storage prefix for ads using config (no trailing slash)
function getAdsPrefix(cfg){
  return `installs/${cfg.installSlug}/assets/ads`;
}

// list all ad files from Supabase and return metadata array
async function listAdsFromSupabase(cfg){
  const supabase = getSupabase();
  if (!supabase) return [];
  const prefix = getAdsPrefix(cfg);
  console.log('[ADS] prefix:', prefix);
  const pageSize = 200;
  let offset = 0;
  const allItems = [];

  while (true) {
    const { data, error } = await supabase.storage.from(cfg.bucket || 'saxvik-hub').list(prefix, { limit: pageSize, offset });
    if (error) {
      console.error('[ADS] list error', error);
      return [];
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    allItems.push(...data);
    if (data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  const files = allItems
        .filter(f => {
           const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
           return ADS_EXT.includes(ext);
        })
        .sort((a,b)=>a.name.localeCompare(b.name));
  return files.map(f=>{
     const path = `${prefix}/${f.name}`;
     const url = supabase.storage.from(cfg.bucket || 'saxvik-hub').getPublicUrl(path).data?.publicUrl || '';
     const lower = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
     const isVideo = ['.mp4','.webm','.mov'].includes(lower);
     return { name: f.name, path, publicUrl: url, isVideo, mime: isVideo ? 'video/mp4' : '' };
  });
}

// fetch a fresh list of ads directly from Supabase and optionally start the loop
async function loadAdsFromSupabase(){
  if (adsReloadInFlight) return;
  adsReloadInFlight = true;

  const maybeShowIdleFallback = () => {
    if (adsRunning || currentScreen === 'idle' || isAdsScreen(currentScreen)) {
      showIdleBackground();
    }
  };

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[ADS] Supabase client missing');
    maybeShowIdleFallback();
    adsReloadInFlight = false;
    return;
  }
  try {
    const cfg = window.getSupabaseConfig();
    if (!cfg) {
      console.warn('[ADS] Missing Supabase config, keeping idle fallback');
      maybeShowIdleFallback();
      return;
    }
    const list = await listAdsFromSupabase(cfg);
    if (!list || list.length === 0) {
      ADS = [];
      lastAdsSig = '';
      maybeShowIdleFallback();
      return;
    }

    const nextSig = makeAdsSignature(list);
    const nextAds = list.map((item) => {
      return { src: item.publicUrl, isVideo: item.isVideo, mime: item.mime };
    });

    if (nextAds.length === 0) {
      ADS = [];
      lastAdsSig = '';
      maybeShowIdleFallback();
      return;
    }

    if (nextSig === lastAdsSig && nextAds.length === ADS.length) {
      return;
    }

    ADS = nextAds;
    lastAdsSig = nextSig;
    if (adIndex >= ADS.length) {
      adIndex = 0;
    }
  } catch (e) {
    console.error('[ADS] loadAdsFromSupabase error', e);
    maybeShowIdleFallback();
  } finally {
    adsReloadInFlight = false;
  }
}

// AUDIT: loadPlaylist - reads playlist.json from Supabase storage
// If exists and valid, returns ordered array of {filename, duration}
// If missing/invalid, returns null (fallback to all files)
async function loadPlaylist() {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    
    const cfg = window.getSupabaseConfig();
    if (!cfg) return null;
    const playlistPath = `installs/${cfg.installSlug}/assets/ads/playlist.json`;
    
    // GUARD: attempt to read playlist.json as text
    const { data, error } = await supabase.storage
      .from(cfg.bucket || 'saxvik-hub')
      .download(playlistPath);
    
    if (error || !data) {
      console.log('[PLAYLIST] Not found or error:', error?.message);
      return null;
    }
    
    const text = await data.text();
    const playlist = JSON.parse(text);
    
    // GUARD: validate structure
    if (!Array.isArray(playlist.items) || playlist.items.length === 0) {
      console.warn('[PLAYLIST] Invalid format:', playlist);
      return null;
    }
    
    console.log('[PLAYLIST] Loaded:', playlist.items.length, 'items');
    return playlist;
  } catch (e) {
    console.warn('[PLAYLIST] Load error (fallback to all files):', e.message);
    return null;
  }
}

// AUDIT: applyPlaylist - reorders/filters ADS array based on playlist
// Only keeps ads that match playlist items; respects order and duration
// ===== SECURITY: Schema-lite validation =====
function isValidPlaylistItem(item) {
  if (typeof item !== 'object' || item === null) return false;
  if (typeof item.filename !== 'string') return false;
  
  // Duration must be between 3s and 120s
  const duration = item.duration;
  if (typeof duration !== 'number' || duration < 3000 || duration > 120000) {
    return false;
  }
  
  // Optional: check file extension is safe
  const ext = (item.filename || '').toLowerCase();
  if (!ext.match(/\.(jpg|jpeg|png|webp|mp4)$/i)) {
    return false;
  }
  
  return true;
}

function applyPlaylist(allAds, playlist) {
  try {
    if (!playlist || !playlist.items) return allAds; // fallback
    
    const result = [];
    for (const item of playlist.items) {
      // ===== SECURITY: Skip invalid items silently =====
      if (!isValidPlaylistItem(item)) {
        demoLog('[PLAYLIST] Skipping invalid item:', item);
        continue;
      }
      
      const match = allAds.find(ad => ad.filename === item.filename);
      if (match) {
        const duration = item.duration; // already validated above
        result.push({ ...match, duration });
      } else {
        demoLog('[PLAYLIST] File not found:', item.filename);
      }
    }
    
    if (result.length === 0) {
      console.warn('[PLAYLIST] No valid/matching files found in ads folder');
      return allAds; // fallback to all
    }
    
    console.log('[PLAYLIST] Applied:', result.length, 'ads in playlist order');
    return result;
  } catch (e) {
    console.warn('[PLAYLIST] Apply error:', e.message);
    return allAds; // fallback
  }
}

// buildAds fetches the list of media files from Supabase storage and populates ADS
async function buildAds(){
  ADS = [];
  const supabase = getSupabase();
  if(!supabase) {
    console.warn('[ADS] Supabase client not initialized');
    return;
  }
  const cfg = window.getSupabaseConfig();
  if (!cfg) {
    console.warn('[ADS] Missing Supabase config, skipping buildAds');
    ADS = [];
    return;
  }
  const prefix = getAdsPrefix(cfg);
  console.log('[ADS] prefix:', prefix);
  const list = await listAdsFromSupabase(cfg);
  
  // AUDIT: Convert list items to ad objects with filename tracking
  const allAds = list.map(item => ({ 
    src: item.publicUrl, 
    isVideo: item.isVideo, 
    mime: item.mime,
    filename: item.name  // Track original filename for playlist matching
  }));
  console.log('[ADS] found:', allAds.length);
  
  if(allAds.length === 0){
    console.warn('[ADS] No files found at:', prefix);
    ADS = [];
    lastAdsSig = '';
    return;
  }
  
  // AUDIT: Try to load and apply playlist
  const playlist = await loadPlaylist();
  ADS = playlist ? applyPlaylist(allAds, playlist) : allAds;
  lastAdsSig = makeAdsSignature(ADS);
}

async function pollAdsAndReloadIfChanged(){
  // simplified polling now just reloads from supabase
  try{
    await loadAdsFromSupabase();
  }catch(e){ console.warn('[ADS] poll error', e); }
}

// === ADMIN MODE ===
let adminPanel = null;
let adminPanelOpen = false;
let adminStatusTimer = null;
const ADMIN_STATUS_REFRESH_MS = 5000;

function toggleAdminPanel(){
  if(adminPanelOpen) closeAdminPanel(); else openAdminPanel();
}

function openAdminPanel(){
  if(adminPanelOpen) return;
  adminPanelOpen = true;
  if(!adminPanel){
    adminPanel = document.createElement('div');
    adminPanel.id = 'adminPanel';
    adminPanel.style.position = 'fixed';
    adminPanel.style.top = '10px';
    adminPanel.style.right = '10px';
    adminPanel.style.width = '320px';
    adminPanel.style.maxWidth = '90%';
    adminPanel.style.background = 'rgba(0,0,0,0.85)';
    adminPanel.style.color = 'white';
    adminPanel.style.zIndex = '1000';
    adminPanel.style.padding = '12px';
    adminPanel.style.border = '1px solid rgba(255,255,255,0.08)';
    adminPanel.style.fontFamily = 'sans-serif';

    // Toggle Debug
    const btnDebug = document.createElement('button');
    btnDebug.textContent = 'Toggle Debug';
    btnDebug.style.width = '100%'; btnDebug.style.marginBottom = '8px';
    btnDebug.addEventListener('click', ()=>{ setDebugMode(!DEBUG); updateAdminStatus(); });
    adminPanel.appendChild(btnDebug);

    // Restart Ads
    const btnRestartAds = document.createElement('button');
    btnRestartAds.textContent = 'Restart Ads';
    btnRestartAds.style.width = '100%'; btnRestartAds.style.marginBottom = '8px';
    btnRestartAds.addEventListener('click', ()=>{ stopAds(); startAdsLoop(); updateAdminStatus(); });
    adminPanel.appendChild(btnRestartAds);

    // Go Idle
    const btnIdle = document.createElement('button');
    btnIdle.textContent = 'Go Idle';
    btnIdle.style.width = '100%'; btnIdle.style.marginBottom = '8px';
    btnIdle.addEventListener('click', ()=>{ setScreen('idle'); updateAdminStatus(); });
    adminPanel.appendChild(btnIdle);

    // Screen selector
    const sel = document.createElement('select');
    sel.style.width = '100%'; sel.style.marginBottom = '8px';
    SCREEN_ORDER.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
    sel.addEventListener('change', ()=>{ setScreen(sel.value); updateAdminStatus(); });
    adminPanel.appendChild(sel);

    // Reload Campaign
    const btnReload = document.createElement('button');
    btnReload.textContent = 'Reload Campaign';
    btnReload.style.width = '100%'; btnReload.style.marginBottom = '8px';
    btnReload.addEventListener('click', ()=>{ pollAdsAndReloadIfChanged(); updateAdminStatus(); });
    adminPanel.appendChild(btnReload);

    const btnSaveScreens = document.createElement('button');
    btnSaveScreens.textContent = 'Save Screens Now';
    btnSaveScreens.style.width = '100%'; btnSaveScreens.style.marginBottom = '8px';
    btnSaveScreens.addEventListener('click', async () => {
      await saveScreensConfigToSupabase('admin-button');
      updateAdminStatus();
    });
    adminPanel.appendChild(btnSaveScreens);

    const healthBadge = document.createElement('div');
    healthBadge.id = 'adminHealthStatus';
    healthBadge.style.fontSize = '12px';
    healthBadge.style.fontWeight = '700';
    healthBadge.style.margin = '0';
    healthBadge.style.padding = '2px 0 4px 0';
    healthBadge.style.color = '#9ef';
    healthBadge.textContent = 'HEALTH: ...';
    adminPanel.appendChild(healthBadge);

    // Status
    const status = document.createElement('pre');
    status.id = 'adminStatus';
    status.style.whiteSpace = 'pre-wrap';
    status.style.fontSize = '12px';
    status.style.margin = '0';
    status.style.background = 'transparent';
    status.style.color = '#9ef';
    status.style.padding = '6px 0 0 0';
    adminPanel.appendChild(status);

    // Close hint
    const hint = document.createElement('div');
    hint.style.fontSize = '11px'; hint.style.opacity = '0.8'; hint.style.marginTop = '8px';
    hint.textContent = 'Hold CTRL+SHIFT+D for 2s to open/close admin panel';
    adminPanel.appendChild(hint);
  }

  document.body.appendChild(adminPanel);
  updateAdminStatus();
  if (adminStatusTimer) clearInterval(adminStatusTimer);
  adminStatusTimer = setInterval(() => {
    if (adminPanelOpen) updateAdminStatus();
  }, ADMIN_STATUS_REFRESH_MS);
}

function closeAdminPanel(){
  if(!adminPanelOpen) return;
  adminPanelOpen = false;
  if (adminStatusTimer) {
    clearInterval(adminStatusTimer);
    adminStatusTimer = null;
  }
  if(adminPanel && adminPanel.parentElement) adminPanel.parentElement.removeChild(adminPanel);
}

function updateAdminStatus(){
  if(!adminPanel) return;
  const healthBadge = adminPanel.querySelector('#adminHealthStatus');
  const st = adminPanel.querySelector('#adminStatus');
  if(!st) return;
  let info = `screen: ${currentScreen}\nDEBUG: ${DEBUG}\nADS: ${ADS.length}`;
  info += `\nscreens source: ${screensConfigSource}`;
  info += `\nsave in-flight: ${screensSaveInFlight ? 'yes' : 'no'}`;
  try {
    const health = getHealthReport();
    const renderAgeSec = Math.round(health.renderAgeMs / 1000);
    const lagWarn = Number(health.lag?.lastMs || 0) > HEALTH_EVENT_LOOP_WARN_MS;
    const renderWarn = Number(health.renderAgeMs || 0) > HEALTH_RENDER_AGE_WARN_MS;
    const heapWarn = Number.isFinite(health.heap?.usagePct) ? health.heap.usagePct >= 80 : false;
    const errorWarn = Number(health.errors?.window || 0) + Number(health.errors?.promise || 0) > 0;
    const healthWarnCount = [lagWarn, renderWarn, heapWarn, errorWarn].filter(Boolean).length;
    const healthState = healthWarnCount > 0 ? `WARN (${healthWarnCount})` : 'OK';
    const healthBadgeState = healthWarnCount === 0
      ? 'GREEN'
      : (healthWarnCount >= 3 ? `RED (${healthWarnCount})` : `YELLOW (${healthWarnCount})`);
    const healthBadgeColor = healthWarnCount === 0
      ? 'lime'
      : (healthWarnCount >= 3 ? 'tomato' : 'gold');
    const heapText = health.heap
      ? `${health.heap.usedMb}MB${Number.isFinite(health.heap.usagePct) ? ` (${health.heap.usagePct}%)` : ''}`
      : 'n/a';

    if (healthBadge) {
      healthBadge.textContent = `HEALTH: ${healthBadgeState}`;
      healthBadge.style.color = healthBadgeColor;
    }

    info += `\nhealth status: ${healthState}`;
    info += `\nhealth lag ms (L/A/M): ${health.lag.lastMs}/${health.lag.avgMs}/${health.lag.maxMs}${lagWarn ? ' ⚠' : ''}`;
    info += `\nhealth render age: ${renderAgeSec}s${renderWarn ? ' ⚠' : ''}`;
    info += `\nhealth heap: ${heapText}${heapWarn ? ' ⚠' : ''}`;
    info += `\nhealth errors w/p: ${health.errors.window}/${health.errors.promise}${errorWarn ? ' ⚠' : ''}`;
  } catch (e) {
    if (healthBadge) {
      healthBadge.textContent = 'HEALTH: N/A';
      healthBadge.style.color = '#9ef';
    }
    info += `\nhealth: unavailable`;
  }
  if(DEBUG){
    try{
      const cfg = window.getSupabaseConfig();
      const prefix = getAdsPrefix(cfg);
      const now = new Date().toLocaleTimeString();
      info += `\ninstallSlug: ${cfg.installSlug}`;
      info += `\nprefix: ${prefix}`;
      info += `\nlast update: ${now}`;
    }catch(e){ /* ignore */ }
  }
  st.textContent = info;
}



function resetIdleTimer(){
  scheduleAdsAfterIdle();
}

document.addEventListener('pointerdown', () => {
  resetIdleTimer();
}, {passive:false});

// Edit mode / keyboard navigation
function updateDebugOverlayPointer(){
  if(!debugContainer) return;
  debugContainer.style.pointerEvents = (DEBUG && editMode) ? 'auto' : 'none';
}

function nextScreen(){
  const idx = SCREEN_ORDER.indexOf(currentScreen);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % SCREEN_ORDER.length;
  const next = SCREEN_ORDER[nextIdx];
  if(SCREENS[next]) setScreen(next);
  updateDebugOverlayPointer();
}

function prevScreen(){
  const idx = SCREEN_ORDER.indexOf(currentScreen);
  const prevIdx = idx === -1 ? 0 : (idx - 1 + SCREEN_ORDER.length) % SCREEN_ORDER.length;
  const prev = SCREEN_ORDER[prevIdx];
  if(SCREENS[prev]) setScreen(prev);
  updateDebugOverlayPointer();
}

document.addEventListener('keydown', (e) => {
  if (isEditableTarget(document.activeElement) || isEditableTarget(e.target)) return;
  // ArrowDown holds editMode. Ignore autorepeat flips.
  if(e.code === 'ArrowDown'){
    if(!e.repeat && !editMode){ editMode = true; updateDebugOverlayPointer(); }
    e.preventDefault();
    return;
  }
  // Arrow navigation (single press)
  if(e.code === 'ArrowRight' && !e.repeat){ nextScreen(); e.preventDefault(); return; }
  if(e.code === 'ArrowLeft' && !e.repeat){ prevScreen(); e.preventDefault(); return; }
}, {passive:false});

document.addEventListener('keyup', (e) => {
  if(e.code === 'ArrowDown'){
    if(editMode){ editMode = false; updateDebugOverlayPointer(); }
    e.preventDefault();
  }
}, {passive:false});

// === DEBUG + admin link helpers ===
function updateAdminLink(){
  const el = document.getElementById('adminLink');
  if(el){
    el.style.display = DEBUG ? 'block' : 'none';
  }
}

// === DEBUG TOGGLE ===
function setDebugMode(enabled){
  DEBUG = !!enabled;
  console.log('DEBUG:', DEBUG ? 'ON' : 'OFF');
  updateAdminLink();
  if(DEBUG){
    if(currentScreen) renderDebugEditor(currentScreen);
  } else {
    clearDebugEditor();
  }
}

// Toggle via Ctrl+D (ignore when typing)
let adminHoldTimer = null;
document.addEventListener('keydown', (e) => {
  if (isEditableTarget(document.activeElement) || isEditableTarget(e.target)) return;

  // Admin panel open: hold CTRL + SHIFT + D for 2s
  if(e.code === 'KeyD' && e.ctrlKey && e.shiftKey && !adminHoldTimer){
    e.preventDefault();
    adminHoldTimer = setTimeout(() => { toggleAdminPanel(); adminHoldTimer = null; }, 2000);
    return;
  }

  // Toggle debug with CTRL + D
  if(e.code === 'KeyD' && e.ctrlKey && !e.shiftKey && !e.repeat){
    e.preventDefault();
    setDebugMode(!DEBUG);
    return;
  }
}, {passive:false});

document.addEventListener('keyup', (e) => {
  if(e.code === 'KeyD' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ControlLeft' || e.code === 'ControlRight'){
    if(adminHoldTimer){ clearTimeout(adminHoldTimer); adminHoldTimer = null; }
  }
}, {passive:false});

// Playlist helpers

async function urlExists(url){
  try{
    const head = await fetch(url, {method: 'HEAD'});
    if(head.ok) return true;
    // some hosts disallow HEAD; try GET range 0-0
    const get = await fetch(url, {method:'GET', headers: {Range: 'bytes=0-0'}});
    return get.ok;
  }catch(e){
    return false;
  }
}


function stopAds(){
  if(adTimer) { clearTimeout(adTimer); adTimer = null; }
  if(adFallbackTimer) { clearTimeout(adFallbackTimer); adFallbackTimer = null; }
  // cleanup any running video handlers/timers
  cleanupVideoPlayback();
  try{ videoEl.pause(); }catch{}
  videoEl.removeAttribute('src');
  videoEl.style.display = 'none';
}

function cleanupVideoPlayback(){
  // === VIDEO FAILSAFE ===
  try{
    if(pendingVideoSkipTimer){ clearTimeout(pendingVideoSkipTimer); pendingVideoSkipTimer = null; }
    if(videoWatchdogTimer){ clearTimeout(videoWatchdogTimer); videoWatchdogTimer = null; }
    if(videoMaxTimer){ clearTimeout(videoMaxTimer); videoMaxTimer = null; }
    videoStarted = false;
    // remove handlers
    if(currentVideoHandlers.playing) videoEl.removeEventListener('playing', currentVideoHandlers.playing);
    if(currentVideoHandlers.ended) videoEl.removeEventListener('ended', currentVideoHandlers.ended);
    if(currentVideoHandlers.error) videoEl.removeEventListener('error', currentVideoHandlers.error);
    if(currentVideoHandlers.stalled) videoEl.removeEventListener('stalled', currentVideoHandlers.stalled);
    if(currentVideoHandlers.timeupdate) videoEl.removeEventListener('timeupdate', currentVideoHandlers.timeupdate);
    currentVideoHandlers = {};
  }catch(e){ /* ignore */ }
}

function nextAd(){
  if(!adsRunning) return;
  if(!ADS.length) {
    hideAdsOverlay();
    hideAdsTapCatcher();
    return showIdleBackground();
  }
  adIndex = (adIndex + 1) % ADS.length;
  showAdByIndex(adIndex);
}


function showIdleBackground(){
  clearMapArtifacts();
  closeStorePopup(); // Close any store popup when returning to idle
  stopAds();
  safeSetBackground(ASSETS.idle);
  markRendered();
}

// === VIDEO FAILSAFE ===
function showAdByIndex(i){
  if(!ADS.length) return showIdleBackground();
  // ensure overlay visible for each ad
  showAdsOverlay();
  const ad = ADS[i];
  markRendered();

  // cleanup any previous video playback state
  cleanupVideoPlayback();

  const layer = ensureAdsLayer();
  // remove previous image elements if any
  Array.from(layer.children).forEach(c=>{ if(c !== videoEl) c.remove(); });

  if(ad.isVideo){
    // check mime/canPlayType
    const mime = ad.mime || 'video/mp4';
    const can = videoEl.canPlayType ? videoEl.canPlayType(mime) : '';
    if(!can){
      console.warn('Video mime not supported, skipping:', mime, ad.src);
      // try next ad
      adTimer = setTimeout(nextAd, 200);
      return;
    }

    // prepare video element (already moved into overlay)
    videoEl.style.display = 'block';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'auto';
    videoEl.src = ad.src;
    videoEl.load();

    // set up watchdogs
    videoStarted = false;
    // if video hasn't started playing within 4s -> skip
    videoWatchdogTimer = setTimeout(()=>{
      if(!videoStarted){
        console.warn('Video watchdog: did not start, skipping ad', ad.src);
        cleanupVideoPlayback();
        nextAd();
      }
    }, 4000);
    // hard max duration to avoid hang (30s)
    videoMaxTimer = setTimeout(()=>{
      console.warn('Video max timeout, skipping', ad.src);
      cleanupVideoPlayback();
      nextAd();
    }, 30000);

    // event handlers
    currentVideoHandlers.playing = () => {
      videoStarted = true;
      if(videoWatchdogTimer){ clearTimeout(videoWatchdogTimer); videoWatchdogTimer = null; }
      // ensure we still advance after AD_DURATION_MS from start
      if(adFallbackTimer) clearTimeout(adFallbackTimer);
      adFallbackTimer = setTimeout(()=>{ cleanupVideoPlayback(); nextAd(); }, AD_DURATION_MS + 2000);
    };
    currentVideoHandlers.ended = () => { cleanupVideoPlayback(); nextAd(); };
    currentVideoHandlers.error = () => { console.warn('Video error, skipping', ad.src); cleanupVideoPlayback(); nextAd(); };
    currentVideoHandlers.stalled = () => { console.warn('Video stalled, skipping', ad.src); cleanupVideoPlayback(); nextAd(); };

    videoEl.addEventListener('playing', currentVideoHandlers.playing);
    videoEl.addEventListener('ended', currentVideoHandlers.ended);
    videoEl.addEventListener('error', currentVideoHandlers.error);
    videoEl.addEventListener('stalled', currentVideoHandlers.stalled);

    // attempt play and handle promise rejection
    const playPromise = videoEl.play();
    if(playPromise && typeof playPromise.then === 'function'){
      playPromise.then(()=>{
        // play started; handlers will manage progression
      }).catch((e)=>{
        console.warn('play() promise rejected, skipping ad', e);
        // small delay then skip
        if (pendingVideoSkipTimer) clearTimeout(pendingVideoSkipTimer);
        pendingVideoSkipTimer = setTimeout(()=>{
          pendingVideoSkipTimer = null;
          cleanupVideoPlayback();
          nextAd();
        }, 500);
      });
    }
  } else {
    // image ad - show inside overlay
    cleanupVideoPlayback();
    videoEl.style.display = 'none';
    const layer = ensureAdsLayer();
    const img = document.createElement('img');
    img.src = ad.src;
    layer.appendChild(img);
    if(adTimer) clearTimeout(adTimer);
    // AUDIT: Use per-ad duration if set by playlist, else fallback to default
    const duration = ad.duration || AD_DURATION_MS;
    adTimer = setTimeout(nextAd, duration);
  }
}

async function startAdsLoop(adsList){
  clearMapArtifacts();
  stopAds();
  safeSetBackground(ASSETS.idle);
  if (Array.isArray(adsList)) {
    ADS = adsList;
  } else {
    await buildAds();
  }
  if(!ADS.length) {
    hideAdsOverlay();
    return showIdleBackground();
  }
  adIndex = 0;
  showAdByIndex(adIndex);
  updateTouchHintVisibility();
}

function init(){
  if (!screenEl || !videoEl || !hotspotsEl) {
    console.error('[APP] Missing required DOM elements:', {
      screen: !!screenEl,
      video: !!videoEl,
      hotspots: !!hotspotsEl
    });
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML = '<div style="padding:20px;color:#fff;background:#111;font-family:monospace;">Setup Error: Mangler kritiske DOM-elementer i player.</div>';
    }
    return;
  }

  // ensure admin link visibility follows debug
  updateAdminLink();

  // warm known backgrounds early so first transitions feel smooth
  warmupAllBackgrounds();

  // setup onboarding UI elements
  createTouchHint();
  ensureWeatherPanel();
  applyPlayerSettings(PLAYER_SETTINGS_DEFAULT);
  // create tap catcher early (will stay hidden until ads play)
  const catcher = document.createElement('div');
  catcher.id = 'adsTapCatcher';
  catcher.className = 'ads-tap hidden';
  catcher.style.pointerEvents = 'none';
  document.body.appendChild(catcher);
  catcher.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Stop ads and return to idle
    stopAdsNow();
    clearMapArtifacts();
    setScreen('idle');
    showIdleBackground();
    // setScreen will start fresh ads timer
  });

  // global tap handler for non-hotspot taps (reaches when no stopPropagation)
  document.addEventListener('pointerdown', (ev) => {
    tryDemoFullscreenOnce();
    recordTouch();
    
    // Reset idle timer on any tap that reaches here
    resetIdleTimer();
    
    // if ads are running: return to idle
    if (adsRunning || isAdsScreen(currentScreen)) {
      ev.preventDefault();
      ev.stopPropagation();
      stopAdsNow();
      clearMapArtifacts();
      setScreen('idle');
      showIdleBackground();
      return;
    }

    // Any non-hotspot interaction resets inactivity countdown
    resetIdleTimer();
  });

  // ===== PRODUCTION HARDENING START =====
  // Prevent context menu (right-click), text selection, drag, etc.
  document.addEventListener('contextmenu', (e) => e.preventDefault(), true);
  document.addEventListener('selectstart', (e) => e.preventDefault(), true);
  document.addEventListener('dragstart', (e) => e.preventDefault(), true);
  document.addEventListener('touchmove', (e) => {
    // allow scroll on specific elements only
    const target = e.target;
    if (!target || (!target.closest('.hotspot') && !target.closest('#menuScreen'))) {
      e.preventDefault();
    }
  }, { passive: false });

  // Prevent accidental navigation via links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (link && !link.closest('.admin-panel') && !link.closest('#adminLink')) {
      e.preventDefault();
      demoLog('[HARDENING] Link click blocked: ' + link.href);
    }
  }, true);

  // Override window.open to prevent popup escape
  if (!window.__sxWindowOpenBlocked) {
    window.__sxWindowOpenBlocked = true;
    window.open = function(...args) {
      demoLog('[HARDENING] window.open blocked: ' + args[0]);
      return null;
    };
  }

  // Visibility/tab-hidden handling: pause media without breaking state
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      demoLog('[HARDENING] Tab hidden - pausing video');
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
      }
    } else {
      demoLog('[HARDENING] Tab visible - resuming video if was playing');
      if (videoEl && adsRunning && videoEl.paused) {
        videoEl.play().catch(() => demoLog('[HARDENING] Resume failed'));
      }
    }
  });

  // Fullscreen exit listener: re-enter fullscreen if on idle (kiosk mode)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && currentScreen === 'idle') {
      demoLog('[HARDENING] Fullscreen exited on idle - re-entering in 1s...');
      setTimeout(() => {
        if (currentScreen === 'idle' && !document.fullscreenElement) {
          const el = document.documentElement;
          if (el && el.requestFullscreen) {
            el.requestFullscreen().catch(() => demoLog('[HARDENING] Re-fullscreen failed'));
          }
        }
      }, 1000);
    }
  });

  // Global unhandled error handler: recovery to idle
  window.addEventListener('error', (event) => {
    healthWindowErrorCount += 1;
    demoLog('[HARDENING] Unhandled error: ' + (event.message || event.error));
    if (currentScreen !== 'idle') {
      setTimeout(() => {
        demoLog('[HARDENING] Recovering to idle after error');
        stopAdsNow();
        clearMapArtifacts();
        setScreen('idle');
        showIdleBackground();
      }, 500);
    }
  });

  // Global unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    healthPromiseRejectCount += 1;
    demoLog('[HARDENING] Unhandled promise rejection: ' + (event.reason || 'unknown'));
    event.preventDefault();
    if (currentScreen !== 'idle') {
      setTimeout(() => {
        demoLog('[HARDENING] Recovering to idle after promise rejection');
        stopAdsNow();
        clearMapArtifacts();
        setScreen('idle');
        showIdleBackground();
      }, 500);
    }
  });
  // ===== PRODUCTION HARDENING END =====

  // always render idle immediately
  setScreen('idle');
  showIdleBackground();

  // hide video element and attach error handler
  videoEl.style.display = 'none';
  videoEl.addEventListener('error', () => { console.warn('video error'); videoEl.style.display='none'; });

  // start when supabase singleton is ready
  startWhenSupabaseReady();
  startHealthMonitor();

  resetIdleTimer();
}

const SUPABASE_INIT_MAX_WAIT_MS = 10000;
let supabaseInitStartTs = 0;
let supabaseWaitLogTs = 0;
let screensConfigInitialized = false;

function startAdsPollingLoop() {
  console.log('[APP] supabase ready → starting ads polling');
  loadAdsFromSupabase();
  if (adsPollTimer) clearInterval(adsPollTimer);
  adsPollTimer = setInterval(loadAdsFromSupabase, ADS_POLL_MS);
}

function startWhenSupabaseReady(){
  if (!supabaseInitStartTs) {
    supabaseInitStartTs = Date.now();
  }

  if (!getSupabase()){
    const waitedMs = Date.now() - supabaseInitStartTs;
    if (waitedMs > SUPABASE_INIT_MAX_WAIT_MS) {
      console.error('[APP] Supabase init timeout after', waitedMs, 'ms. Retrying in 5s...');
      const appEl = document.getElementById('app');
      if (appEl && currentScreen === 'idle') {
        const hint = document.getElementById('supabaseInitHint');
        if (!hint) {
          const el = document.createElement('div');
          el.id = 'supabaseInitHint';
          el.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9999;padding:8px 10px;background:rgba(0,0,0,0.75);color:#fff;font:12px sans-serif;border-radius:8px;';
          el.textContent = 'Tilkobler innhold… prøver igjen';
          document.body.appendChild(el);
        }
      }
      supabaseInitStartTs = 0;
      setTimeout(startWhenSupabaseReady, 5000);
      return;
    }

    if ((Date.now() - supabaseWaitLogTs) > 2000) {
      console.log('[APP] waiting for supabase...');
      supabaseWaitLogTs = Date.now();
    }
    requestAnimationFrame(startWhenSupabaseReady);
    return;
  }

  const hint = document.getElementById('supabaseInitHint');
  if (hint) hint.remove();
  supabaseInitStartTs = 0;
  supabaseWaitLogTs = 0;

  if (!screensConfigInitialized) {
    screensConfigInitialized = true;
    Promise.all([
      loadScreensConfigFromSupabase(),
      loadPlayerSettingsFromSupabase(),
    ])
      .then(() => {
        if (currentScreen) {
          const nextScreen = SCREENS[currentScreen] ? currentScreen : 'idle';
          setScreen(nextScreen);
          if (nextScreen === 'idle') {
            showIdleBackground();
          }
        }
      })
      .catch((e) => {
        console.warn('[SCREENS] init failed:', e?.message || e);
      })
      .finally(() => {
        startAdsPollingLoop();
      });
    return;
  }

  startAdsPollingLoop();
}

// Expose API for debugging
window.__kiosk = {
  setScreen,
  SCREENS,
  SCREEN_ORDER,
  getPlayerSettings: () => ({
    weather: { ...playerSettings.weather },
    screenLayout: { ...playerSettings.screenLayout },
  }),
  loadPlayerSettingsFromSupabase,
  setDebugMode,
  loadScreensConfigFromSupabase,
  saveScreensConfigToSupabase,
  queueScreensAutosave,
  getScreensConfigSource: () => screensConfigSource,
  getHealthReport,
  getHealthHistory,
  getLastHealthSnapshot: () => healthLastSnapshot,
  clearHealthHistory: () => {
    try { localStorage.removeItem(HEALTH_HISTORY_STORAGE_KEY); } catch (e) {}
  },
  startHealthMonitor,
  stopHealthMonitor,
  openAdmin: () => { toggleAdminPanel(); }
};

document.addEventListener('DOMContentLoaded', init);

})();
