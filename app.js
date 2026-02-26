(() => {

// === DEBUG TOGGLE ===
let DEBUG = false; // runtime-toggleable debug flag
let editMode = false; // true while ArrowDown is held

// Install loader (select which install's assets to use)
const params = new URLSearchParams(location.search);
const INSTALL_ID = params.get("install") || "amfi-steinkjer";

const BASE_ASSETS = `installs/${INSTALL_ID}/assets`;
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
const PLAYLIST_POLL_MS = 2 * 60 * 1000; // 2 minutes (reuse variable name)
let lastAdsSig = "";
let adsPollTimer = null;

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
      { id: "to_tech_map", x: 0.817, y: 0.159, w: 0.236, h: 0.061, go: "tech_map1", label: "Tech" }
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
      { id:"back_to_menu", x:0.263, y:0.63, w:0.242, h:0.084, go:"menu" },
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

// allowed file extensions for ads (storage listing)
const ADS_EXT = ['.jpg','.jpeg','.png','.webp','.mp4'];
let AD_DURATION_MS = 8000;

// supabase client (optional, configured via globals)
let supabaseClient = null;
if(window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
  supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
} else {
  console.warn('Supabase not configured – ad playback disabled');
}

const IDLE_TIMEOUT_MS = 30000;

// DOM refs
const screenEl = document.getElementById("screen");
const videoEl = document.getElementById("video");
const hotspotsEl = document.getElementById("hotspots");

let ADS = [];
let adIndex = 0;
let adTimer = null;
let adFallbackTimer = null;
// === VIDEO FAILSAFE ===
let videoWatchdogTimer = null;
let videoMaxTimer = null;
let videoStarted = false;
let currentVideoHandlers = {};

let idleTimer = null;
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

// String helpers
const bgA = document.getElementById('bgA');
const bgB = document.getElementById('bgB');

let bgToken = 0;
let bgFront = 'A';         // which layer is currently visible
let bgCurrent = '';

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

  // if same image: do a tiny pulse so it still "feels" responsive
  const same = (url === bgCurrent);

  const frontEl = (bgFront === 'A') ? bgA : bgB;
  const backEl  = (bgFront === 'A') ? bgB : bgA;

  // load into back layer
  backEl.style.backgroundImage = `url("${url}")`;

  // ensure back starts hidden, then fade it in
  backEl.style.opacity = '0';
  void backEl.offsetHeight;

  // always fade-in back
  requestAnimationFrame(() => {
    if(token !== bgToken) return;
    backEl.style.opacity = '1';
    // fade out front (unless nothing there)
    frontEl.style.opacity = same ? '1' : '0';
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
  }, 300);
}

// keep name so resten av koden din funker
function safeSetBackground(url){
  crossfadeBackground(url);
}

function clearHotspots(){
  while(hotspotsEl.firstChild) hotspotsEl.removeChild(hotspotsEl.firstChild);
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
async function applyLayout(screenName){
  const cfg = SCREENS[screenName];
  if(!cfg) return;
  const fit = await getFitRectForCurrentScreen(screenName);

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
    const el = hotspotsEl.querySelector(`[data-hotspot-idx="${i}"]`);
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
    const el = hotspotsEl.querySelector(`[data-pulse-idx="${i}"]`);
    if(!el) return;
    const pxLeft = fit.left + p.x * fit.width;
    const pxTop = fit.top + p.y * fit.height;
    el.style.left = pxLeft + 'px';
    el.style.top = pxTop + 'px';
  });
}

// re-layout on resize/orientation
window.addEventListener('resize', () => { if(currentScreen) applyLayout(currentScreen); });
window.addEventListener('orientationchange', () => { if(currentScreen) applyLayout(currentScreen); });

// Render actual hotspots and pulses for the current screen (mapped to image fit rect)
function setScreen(screenName) {
  if (!SCREENS[screenName]) return console.error("Unknown screen:", screenName);
  currentScreen = screenName;
  const config = SCREENS[screenName];

clearHotspots();
stopAds();
videoEl.style.display = 'none';
safeSetBackground(config.bg);

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

    btn.addEventListener('pointerdown', (ev) => {
      if (DEBUG && editMode) { ev.stopPropagation(); ev.preventDefault(); return; }
      ev.stopPropagation();
      ev.preventDefault();
      resetIdleTimer();
      if (h.go) setScreen(h.go);
      else if (h.storeId) openStorePopup(h.storeId);
    });

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
}


// Debug Editor Functions
let debugContainer = null;
let debugHelp = null;

function clearDebugEditor() {
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
    }
    isDragging = false;
    isResizing = false;
    delete box.dataset.debugMode;
    e.stopPropagation();
    e.preventDefault();
  };
  
  box.addEventListener('pointerdown', onStart);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  
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
    }
    isDragging = false;
    dot.classList.remove('dragging');
    e.stopPropagation();
    e.preventDefault();
  };
  
  dot.addEventListener('pointerdown', onStart);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  
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
    ...(h.label && { label: h.label })
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

async function openStorePopup(storeId){
  const modal = document.getElementById('storeModal');
  const body  = document.getElementById('storeBody');
  const closeBtn = document.getElementById('storeClose');
  if(!modal || !body) return;

  // prøver i denne rekkefølgen (webp først, så png/jpg)
  const exts = ['.webp', '.png', '.jpg', '.jpeg'];
  let foundUrl = null;

  for(const ext of exts){
    const url = `${STORES_ASSETS}/${storeId}/popup${ext}`;
    try{
      // HEAD kan være blokkert noen steder -> bruk GET med Range fallback
      const head = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(head.ok){ foundUrl = url; break; }

      const get = await fetch(url, {
        method:'GET',
        headers: { Range: 'bytes=0-0' },
        cache:'no-store'
      });
      if(get.ok){ foundUrl = url; break; }
    }catch(e){
      // ignorer og prøv neste ext
    }
  }

  if(!foundUrl){
    body.innerHTML = `
      <div style="color:#fff; font-family:sans-serif;">
        Fant ikke popup-bilde for <b>${storeId}</b>.<br>
        Legg inn en fil som heter <code>popup.png</code> / <code>popup.jpg</code> / <code>popup.webp</code>
        i mappen <code>stores/${storeId}/</code>.
      </div>
    `;
  } else {
    body.innerHTML = `
      <img
        src="${foundUrl}"
        alt="${storeId}"
        style="width:100%;height:auto;display:block;border-radius:12px;"
        onerror="this.remove()"
      >
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

// buildAds fetches the list of media files from Supabase storage and populates ADS
async function buildAds(){
  ADS = [];
  if(!supabaseClient) return;
  const prefix = `installs/${INSTALL_ID}/assets/ads/`;
  const { data, error } = await supabaseClient.storage.from('saxvik-hub').list(prefix, { limit: 200, offset: 0 });
  if(error){ console.warn('ads list error', error); return; }
  const files = data
        .filter(f => {
           const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
           return ADS_EXT.includes(ext);
        })
        .sort((a,b)=>a.name.localeCompare(b.name));
  files.forEach(f=>{
     const path = prefix + f.name;
     const url = supabaseClient.storage.from('saxvik-hub').getPublicUrl(path).publicURL;
     const lower = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
     const isVideo = ['.mp4','.webm','.mov'].includes(lower);
     ADS.push({ src: url, isVideo, mime: isVideo ? 'video/mp4' : '' });
  });
}

async function pollAdsAndReloadIfChanged(){
  try{
    await buildAds();
    const sig = makePlaylistSignature();
    if(sig !== lastAdsSig){
      console.log('Ads list changed');
      lastAdsSig = sig;
      if(currentScreen === 'idle'){
        stopAds();
        startAdsLoop();
      }
    }
  }catch(e){ console.warn('poll error', e); }
}

// === ADMIN MODE ===
let adminPanel = null;
let adminPanelOpen = false;

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
    hint.textContent = 'Hold SHIFT+D for 2s to open/close admin panel';
    adminPanel.appendChild(hint);
  }

  document.body.appendChild(adminPanel);
  updateAdminStatus();
}

function closeAdminPanel(){
  if(!adminPanelOpen) return;
  adminPanelOpen = false;
  if(adminPanel && adminPanel.parentElement) adminPanel.parentElement.removeChild(adminPanel);
}

function updateAdminStatus(){
  if(!adminPanel) return;
  const st = adminPanel.querySelector('#adminStatus');
  if(!st) return;
  const info = `screen: ${currentScreen}\nDEBUG: ${DEBUG}\nADS: ${ADS.length}`;
  st.textContent = info;
}



function resetIdleTimer(){
  if(idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if(currentScreen !== 'idle'){
    idleTimer = setTimeout(()=>{ setScreen('idle'); }, IDLE_TIMEOUT_MS);
  }
}

document.addEventListener('pointerdown', () => {
  resetIdleTimer();
}, {passive:true});

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

// Toggle via KeyD (ignore when input/textarea focused)
let adminHoldTimer = null; // used by admin open (Shift+D hold)
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;

  // Admin panel open: hold SHIFT + D for 2s
  if(e.code === 'KeyD' && e.shiftKey && !adminHoldTimer){
    adminHoldTimer = setTimeout(() => { toggleAdminPanel(); adminHoldTimer = null; }, 2000);
    return;
  }

  // Toggle debug with plain D (no shift)
  if(e.code === 'KeyD' && !e.shiftKey && !e.repeat){
    setDebugMode(!DEBUG);
    return;
  }
}, {passive:true});

document.addEventListener('keyup', (e) => {
  if(e.code === 'KeyD'){
    if(adminHoldTimer){ clearTimeout(adminHoldTimer); adminHoldTimer = null; }
  }
}, {passive:true});

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
  if(!ADS.length) return showIdleBackground();
  adIndex = (adIndex + 1) % ADS.length;
  showAdByIndex(adIndex);
}


function showIdleBackground(){
  stopAds();
  safeSetBackground(ASSETS.idle);
}

// === VIDEO FAILSAFE ===
function showAdByIndex(i){
  if(!ADS.length) return showIdleBackground();
  const ad = ADS[i];

  // cleanup any previous video playback state
  cleanupVideoPlayback();

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

    // prepare video element
    videoEl.style.display = 'block';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'auto';
    videoEl.src = ad.src;
    videoEl.load();
    safeSetBackground(ASSETS.idle);

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
        setTimeout(()=>{ cleanupVideoPlayback(); nextAd(); }, 500);
      });
    }
  } else {
    // image ad - display as background
    cleanupVideoPlayback();
    videoEl.style.display = 'none';
    safeSetBackground(ad.src);
    if(adTimer) clearTimeout(adTimer);
    adTimer = setTimeout(nextAd, AD_DURATION_MS);
  }
}

async function startAdsLoop(){
  stopAds();
  safeSetBackground(ASSETS.idle);
  await buildAds();
  if(!ADS.length) return showIdleBackground();
  adIndex = 0;
  showAdByIndex(adIndex);
}

function init(){
  // ensure admin link visibility follows debug
  updateAdminLink();
  safeSetBackground(ASSETS.idle);
  videoEl.style.display = 'none';
  videoEl.addEventListener('error', () => { console.warn('video error'); videoEl.style.display='none'; });
  // initial load and ads
  (async () => {
    try{
      await buildAds();
      lastAdsSig = makePlaylistSignature();
      setScreen('idle');
      startAdsLoop();
      // start ads polling
      if(adsPollTimer) clearInterval(adsPollTimer);
      adsPollTimer = setInterval(pollAdsAndReloadIfChanged, PLAYLIST_POLL_MS);
    }catch(e){
      console.warn('init error', e);
      // fallback
      setScreen('idle');
      startAdsLoop();
    }
  })();
  resetIdleTimer();
}

// Expose API for debugging
window.__kiosk = {
  setScreen,
  SCREENS,
  setDebugMode,
  openAdmin: () => { toggleAdminPanel(); }
};

document.addEventListener('DOMContentLoaded', init);

})();
