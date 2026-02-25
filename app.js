(() => {

const ASSETS = {
  idle: "assets/idle.png",
  menu: "assets/menu.png",
  floors: "assets/floors.png",
  map1: "assets/map1.png",
  tech_map1: "assets/tech_map1.png",
};

const PLAYLIST_URL = "assets/ads/playlist.json";

let SLOT_NAMES = ["slot1","slot2","slot3"];
let TRY_EXT = [".mp4",".jpg",".jpeg",".png",".webm",".mov"];
let AD_DURATION_MS = 8000;

const IDLE_TIMEOUT_MS = 30000; // X milliseconds of inactivity -> back to idle

// DOM refs (defined once)
const screenEl = document.getElementById("screen");
const videoEl = document.getElementById("video");
const hotspotsEl = document.getElementById("hotspots");

let ADS = [];
let adIndex = 0;
let adTimer = null;
let adFallbackTimer = null;
let idleTimer = null;
let currentScreen = null;

// Helpers
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

function createHotspot(opts){
  const el = document.createElement('button');
  el.className = 'hotspot';
  el.setAttribute('aria-label', opts.label || 'hotspot');
  el.style.position = 'absolute';
  if(opts.fullscreen){
    el.classList.add('fullscreen');
  } else {
    if(typeof opts.left === 'number' || typeof opts.left === 'string') el.style.left = typeof opts.left === 'number' ? opts.left+'%' : opts.left;
    if(typeof opts.top === 'number' || typeof opts.top === 'string') el.style.top = typeof opts.top === 'number' ? opts.top+'%' : opts.top;
    if(opts.width) el.style.width = opts.width;
    if(opts.height) el.style.height = opts.height;
    el.style.transform = 'translate(-50%, -50%)';
  }
  el.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    resetIdleTimer();
    try{ opts.onClick && opts.onClick(ev); }catch(e){ console.error(e); }
  });
  hotspotsEl.appendChild(el);
  return el;
}

function resetIdleTimer(){
  if(idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if(currentScreen !== 'idle'){
    idleTimer = setTimeout(()=>{ goIdle(); }, IDLE_TIMEOUT_MS);
  }
}

document.addEventListener('pointerdown', () => {
  // global pointer only resets idle timer; navigation only via hotspots
  resetIdleTimer();
}, {passive:true});

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
    // play video above screen
    videoEl.style.display = 'block';
    videoEl.src = ad.src;
    videoEl.load();
    // ensure idle background behind video
    safeSetBackground(ASSETS.idle);
    const playPromise = videoEl.play();
    // fallback if autoplay blocked
    if(playPromise && typeof playPromise.then === 'function'){
      playPromise.then(()=>{
        // play started; wait for ended or fallback timer
        if(adFallbackTimer) clearTimeout(adFallbackTimer);
        adFallbackTimer = setTimeout(()=>{ nextAd(); }, AD_DURATION_MS + 2000);
      }).catch((e)=>{
        console.warn('Autoplay failed, skipping video ad', e);
        videoEl.style.display = 'none';
        adTimer = setTimeout(nextAd, AD_DURATION_MS);
      });
    } else {
      // non-promise play (older browsers)
      adFallbackTimer = setTimeout(()=>{ nextAd(); }, AD_DURATION_MS + 2000);
    }
    // ended listener
    const onEnded = () => { videoEl.removeEventListener('ended', onEnded); nextAd(); };
    videoEl.addEventListener('ended', onEnded);
  } else {
    // image ad
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

// Navigation and screens
function goIdle(){
  currentScreen = 'idle';
  clearHotspots();
  stopAds();
  safeSetBackground(ASSETS.idle);
  // add full screen hotspot to go to menu
  createHotspot({fullscreen: true, label: 'Open menu', onClick: ()=>{ goMenu(); stopAds(); }});
}

function goMenu(){
  currentScreen = 'menu';
  clearHotspots();
  stopAds();
  safeSetBackground(ASSETS.menu);
  // create 4 menu buttons
  const positions = [20,40,60,80];
  positions.forEach((left, idx)=>{
    createHotspot({left, top: 70, width: '18%', height: '12%', label: `Menu ${idx+1}`, onClick: ()=>{ goFloors(); }});
  });
}

function goFloors(){
  currentScreen = 'floors';
  clearHotspots();
  stopAds();
  safeSetBackground(ASSETS.floors);
  // placeholder: one hotspot to map1
  createHotspot({left: 50, top: 70, width: '25%', height: '15%', label: 'Open map1', onClick: ()=>{ goMap1(); }});
  // back to menu
  createHotspot({left: 10, top: 10, width: '12%', height: '8%', label: 'Back', onClick: ()=>{ goMenu(); }});
}

function goMap1(){
  currentScreen = 'map1';
  clearHotspots();
  stopAds();
  safeSetBackground(ASSETS.map1);
  createHotspot({left: 90, top: 10, width: '10%', height: '8%', label: 'Back', onClick: ()=>{ goFloors(); }});
  createHotspot({left: 80, top: 70, width: '12%', height: '12%', label: 'Tech', onClick: ()=>{ goTechMap1(); }});
}

function goTechMap1(){
  currentScreen = 'tech_map1';
  clearHotspots();
  stopAds();
  safeSetBackground(ASSETS.tech_map1);
  createHotspot({left: 90, top: 10, width: '10%', height: '8%', label: 'Back', onClick: ()=>{ goMap1(); }});
  // three store hotspots
  const shops = [ {left: 30, top: 45}, {left: 50, top: 55}, {left: 70, top: 40} ];
  shops.forEach((s, i)=>{
    createHotspot({left: s.left, top: s.top, width: '8%', height: '8%', label: `Shop ${i+1}`, onClick: ()=>{ /* placeholder action */ alert(`Shop ${i+1}`); }});
  });
  // add three pulse visuals at same fixed points
  shops.forEach((s)=>{
    const p = document.createElement('div');
    p.className = 'pulse';
    p.style.left = s.left + '%';
    p.style.top = s.top + '%';
    hotspotsEl.appendChild(p);
  });
}

// start app
function init(){
  // ensure we always have idle bg
  safeSetBackground(ASSETS.idle);
  // wire up video fallback to ensure we don't get stuck
  videoEl.addEventListener('error', () => { console.warn('video error'); videoEl.style.display='none'; });
  // load playlist but don't start until idle
  loadPlaylist().then(()=>{
    // start in idle
    goIdle();
    // start ads loop while idle
    startAdsLoop();
  });
  // ensure initial idle timer
  resetIdleTimer();
}

// expose minimal API to window for debugging (optional)
window.__kiosk = {goIdle, goMenu, goFloors, goMap1, goTechMap1};

document.addEventListener('DOMContentLoaded', init);

})();
