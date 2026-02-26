// protect dashboard - redirect to login if no valid session
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

const logoutBtn = document.getElementById('logoutBtn');
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('sx_auth');
  location.href = './login.html';
});

// --- supabase / ads management ------------------------------------------------
const INSTALL_ID = new URLSearchParams(location.search).get('install') || 'amfi-steinkjer';
const BUCKET = 'saxvik-hub';
let supabaseClient = null;

if(window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
  supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
} else {
  console.warn('Supabase client not configured. Ads features disabled');
}

const ADS_EXT = ['.jpg','.jpeg','.png','.webp','.mp4'];

async function listAds(){
  if(!supabaseClient) return [];
  const prefix = `installs/${INSTALL_ID}/assets/ads/`;
  const { data, error } = await supabaseClient.storage.from(BUCKET).list(prefix, { limit: 100, offset: 0 });
  if(error){ console.error('storage list error', error); return []; }
  return data.sort((a,b)=>a.name.localeCompare(b.name));
}

async function refreshAdsPanel(){
  const listEl = document.getElementById('adsList');
  const msgEl = document.getElementById('adsMessage');
  if(!listEl) return;
  listEl.innerHTML = '';
  const items = await listAds();
  if(items.length === 0){
    listEl.innerHTML = '<li>Ingen filer</li>';
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    const name = item.name;
    const span = document.createElement('span');
    span.textContent = name;
    li.appendChild(span);

    const del = document.createElement('button');
    del.textContent = 'Slett';
    del.addEventListener('click', async () => {
      if(!supabaseClient) return;
      const path = `installs/${INSTALL_ID}/assets/ads/${name}`;
      const { error } = await supabaseClient.storage.from(BUCKET).remove([path]);
      if(error){
        console.error('delete error', error);
        msgEl.textContent = 'Slett feil';
      } else {
        refreshAdsPanel();
      }
    });
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

function initUploadZone(){
  const zone = document.getElementById('uploadZone');
  const msgEl = document.getElementById('adsMessage');
  if(!zone) return;
  if(!supabaseClient){
    zone.textContent = 'Supabase ikke konfigurert';
    zone.style.color = 'var(--sx-blue)';
    return;
  }
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', e => { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if(!supabaseClient) return;
    const files = e.dataTransfer.files;
    for(const file of files){
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if(!ADS_EXT.includes(ext)){
        msgEl.textContent = 'Ugyldig fil: ' + file.name;
        continue;
      }
      const path = `installs/${INSTALL_ID}/assets/ads/${file.name}`;
      msgEl.textContent = 'Laster opp ' + file.name + '...';
      const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file, { upsert: true });
      if(error){
        console.error('upload error', error);
        msgEl.textContent = 'Last opp feilet: ' + file.name;
      } else {
        msgEl.textContent = 'Lastet opp ' + file.name;
      }
    }
    refreshAdsPanel();
  });
}

// initialize panel after DOM ready
window.addEventListener('DOMContentLoaded', () => {
  initUploadZone();
  refreshAdsPanel();
});

