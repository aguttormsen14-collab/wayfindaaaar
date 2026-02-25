(() => {

const DEBUG = true; // Set to true to enable drag & drop debug editor
let editMode = false; // true while ArrowDown is held

// Ordered list of screens for left/right navigation
const SCREEN_ORDER = ["idle","menu","floors","map1","tech_map1"];

const ASSETS = {
  idle: "assets/idle.png",
  menu: "assets/menu.png",
  floors: "assets/floors.png",
  map1: "assets/map1.png",
  tech_map1: "assets/tech_map1.png",
};

const PLAYLIST_URL = "assets/ads/playlist.json";

// SCREENS Configuration with hotspots and pulses (normalized coordinates 0..1)
const SCREENS = {
  idle: {
    bg: ASSETS.idle,
    hotspots: [
      { id: "to_menu", x: 0.5, y: 0.5, w: 1, h: 1, go: "menu" }
    ],
    pulses: []
  },
  menu: {
    bg: ASSETS.menu,
    hotspots: [
      { id: "menu1", x: 0.531, y: 0.282, w: 0.35, h: 0.107, go: "floors", label: "Menu 1" },
      { id: "menu2", x: 0.532, y: 0.465, w: 0.366, h: 0.099, go: "floors", label: "Menu 2" },
      { id: "menu3", x: 0.533, y: 0.615, w: 0.365, h: 0.108, go: "floors", label: "Menu 3" },
      { id: "menu4", x: 0.532, y: 0.781, w: 0.375, h: 0.115, go: "floors", label: "Menu 4" }
    ],
    pulses: []
  },
  floors: {
    bg: ASSETS.floors,
    hotspots: [
      { id: "back_to_menu", x: 0.527, y: 0.627, w: 0.372, h: 0.101, go: "menu", label: "Back" },
      { id: "to_map1", x: 0.535, y: 0.627, w: 0.372, h: 0.101, go: "map1", label: "Map 1" }
    ],
    pulses: []
  },
  map1: {
    bg: ASSETS.map1,
    hotspots: [
      { id: "back_to_floors", x: 0.164, y: 0.046, w: 0.225, h: 0.059, go: "floors", label: "Back" },
      { id: "to_tech_map", x: 0.791, y: 0.046, w: 0.236, h: 0.061, go: "tech_map1", label: "Tech" }
    ],
    pulses: [
      { id: "you_are_here", x: 0.415, y: 0.538 }
    ]
  },
  tech_map1: {
    bg: ASSETS.tech_map1,
    hotspots: [
      { id: "back_to_map1", x: 0.819, y: 0.061, w: 0.356, h: 0.072, go: "map1", label: "Back" },
      { id: "elkjop", x: 0.27, y: 0.45, w: 0.08, h: 0.08, label: "Elkjøp" },
      { id: "telia", x: 0.41, y: 0.37, w: 0.08, h: 0.08, label: "Telia" },
      { id: "telenor", x: 0.69, y: 0.64, w: 0.08, h: 0.08, label: "Telenor" }
    ],
    pulses: [
      { id: "elkjop", x: 0.207, y: 0.333 },
      { id: "telia", x: 0.306, y: 0.258 },
      { id: "telenor", x: 0.52, y: 0.516 }
    ]
  }
};

let SLOT_NAMES = ["slot1","slot2","slot3"];
let TRY_EXT = [".mp4",".jpg",".jpeg",".png",".webm",".mov"];
let AD_DURATION_MS = 8000;

const IDLE_TIMEOUT_MS = 30000;

// DOM refs
const screenEl = document.getElementById("screen");
const videoEl = document.getElementById("video");
const hotspotsEl = document.getElementById("hotspots");

let ADS = [];
let adIndex = 0;
let adTimer = null;
let adFallbackTimer = null;
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
function safeSetBackground(url){
  try{
    screenEl.style.backgroundImage = `url("${url}")`;
  }catch{
    screenEl.style.backgroundImage = '';
  }
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

// Playlist helpers
async function loadPlaylist(){
  try{
    const r = await fetch(PLAYLIST_URL, {cache: 'no-store'});

    if(!r.ok) throw new Error('no playlist');
    const d = await r.json();
    SLOT_NAMES = d.slots || SLOT_NAMES;
    TRY_EXT = d.tryExt || TRY_EXT;
    AD_DURATION_MS = d.durationMs || AD_DURATION_MS;
  }catch(e){
    console.warn('Failed to load playlist.json, using defaults', e);
  }
}

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

async function resolveSlot(slot){
  for(const ext of TRY_EXT){
    const url = `assets/ads/${slot}${ext}`;
    try{
      const ok = await urlExists(url);
      if(ok){
        const isVideo = ['.mp4','.webm','.mov'].includes(ext.toLowerCase());
        return {src: url, isVideo};
      }
    }catch(e){ /* ignore */ }
  }
  return null;
}

async function buildAds(){
  ADS = [];
  for(const s of SLOT_NAMES){
    const r = await resolveSlot(s);
    if(r) ADS.push(r);
  }
}

function stopAds(){
  if(adTimer) { clearTimeout(adTimer); adTimer = null; }
  if(adFallbackTimer) { clearTimeout(adFallbackTimer); adFallbackTimer = null; }
  try{ videoEl.pause(); }catch{}
  videoEl.removeAttribute('src');
  videoEl.style.display = 'none';
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

function showAdByIndex(i){
  if(!ADS.length) return showIdleBackground();
  const ad = ADS[i];
  if(ad.isVideo){
    videoEl.style.display = 'block';
    videoEl.src = ad.src;
    videoEl.load();
    safeSetBackground(ASSETS.idle);
    const playPromise = videoEl.play();
    if(playPromise && typeof playPromise.then === 'function'){
      playPromise.then(()=>{
        if(adFallbackTimer) clearTimeout(adFallbackTimer);
        adFallbackTimer = setTimeout(()=>{ nextAd(); }, AD_DURATION_MS + 2000);
      }).catch((e)=>{
        console.warn('Autoplay failed, skipping video ad', e);
        videoEl.style.display = 'none';
        adTimer = setTimeout(nextAd, AD_DURATION_MS);
      });
    } else {
      adFallbackTimer = setTimeout(()=>{ nextAd(); }, AD_DURATION_MS + 2000);
    }
    const onEnded = () => { videoEl.removeEventListener('ended', onEnded); nextAd(); };
    videoEl.addEventListener('ended', onEnded);
  } else {
    videoEl.style.display = 'none';
    safeSetBackground(ad.src);
    if(adTimer) clearTimeout(adTimer);
    adTimer = setTimeout(nextAd, AD_DURATION_MS);
  }
}

async function startAdsLoop(){
  stopAds();
  safeSetBackground(ASSETS.idle);
  await loadPlaylist();
  await buildAds();
  if(!ADS.length) return showIdleBackground();
  adIndex = 0;
  showAdByIndex(adIndex);
}

function init(){
  safeSetBackground(ASSETS.idle);
  videoEl.addEventListener('error', () => { console.warn('video error'); videoEl.style.display='none'; });
  loadPlaylist().then(()=>{
    setScreen('idle');
    startAdsLoop();
  });
  resetIdleTimer();
}

// Expose API for debugging
window.__kiosk = {
  setScreen,
  SCREENS,
  DEBUG: () => window.__kiosk.DEBUG_ON(),
  DEBUG_ON: () => { window.__kiosk._DEBUG = true; renderDebugEditor(currentScreen || 'idle'); },
  DEBUG_OFF: () => { window.__kiosk._DEBUG = false; clearDebugEditor(); }
};

document.addEventListener('DOMContentLoaded', init);

})();
