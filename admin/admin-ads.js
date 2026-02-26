// admin-ads.js — Supabase ads management for admin dashboard

let supabaseClient = null;

// Initialize Supabase client if configured
async function initSupabaseClient() {
  if (typeof window.isSupabaseConfigured !== 'function' || !window.isSupabaseConfigured()) {
    console.warn('[ADMIN] Supabase not configured or helper missing');
    return null;
  }
  if (window.supabase) {
    const cfg = window.getSupabaseConfig ? window.getSupabaseConfig() : {};
    console.log('[ADMIN] config:', cfg);
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    console.log('[ADMIN] Supabase client initialized');
    
    // Live test: attempt to list root with limit 1 (non-blocking)
    try {
      const { data, error } = await supabaseClient.storage
        .from(cfg.bucket)
        .list('', { limit: 1 });
      if (!error) {
        console.log('[ADMIN] ✅ Storage connection verified');
      } else {
        console.warn('[ADMIN] ⚠️ Storage access failed:', error.message);
      }
    } catch (e) {
      console.warn('[ADMIN] ⚠️ Connection check failed:', e.message);
    }
  }
  return supabaseClient;
}

// global prevention of default drag/drop so browser never opens files
function preventGlobalFileOpen() {
  ['dragenter','dragover','dragleave','drop'].forEach(evt => {
    window.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
    }, {passive:false});
  });
}

// Get the ads prefix path for current install
function buildAdsPrefix() {
  const cfg = window.getSupabaseConfig();
  return `installs/${cfg.installSlug}/assets/ads/`;
}

// Load ads list from storage
async function loadAds() {
  if (!supabaseClient) return [];
  
  const cfg = window.getSupabaseConfig();
  const prefix = buildAdsPrefix();
  
  try {
    const { data, error } = await supabaseClient.storage
      .from(cfg.bucket)
      .list(prefix, { limit: 200, offset: 0 });
    
    if (error) {
      console.error('Failed to list ads:', error);
      return [];
    }
    
    const files = data.filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext);
    }).sort((a, b) => a.name.localeCompare(b.name));
    
    return files.map(f => {
      const fullPath = prefix + f.name;
      const publicUrl = supabaseClient.storage.from(cfg.bucket).getPublicUrl(fullPath).publicURL;
      return {
        name: f.name,
        path: fullPath,
        publicUrl: publicUrl,
        type: f.name.endsWith('.mp4') ? 'video' : 'image'
      };
    });
  } catch (e) {
    console.error('Error loading ads:', e);
    return [];
  }
}

// Upload files to storage
async function uploadFiles(fileList, onProgress) {
  if (!window.isSupabaseConfigured()) {
    alert('Supabase ikke konfigurert – fyll inn config.local.js');
    return [];
  }
  const cfg = window.getSupabaseConfig();
  const client = window.supabase.createClient(cfg.url, cfg.anonKey);
  const prefix = `installs/${cfg.installSlug}/assets/ads/`;
  const bucket = cfg.bucket;
  const uploaded = [];

  for (const file of fileList) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext)) {
      console.warn('Skipping unsupported file:', file.name);
      continue;
    }

    const timestamp = Date.now();
    const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);
    const filename = `${timestamp}-${uuid}${ext}`;
    const fullPath = prefix + filename;

    console.log('Uploading', file.name, 'as', fullPath);
    if (onProgress) onProgress(`Laster opp ${file.name}…`);
    try {
      const { error } = await client.storage
        .from(bucket)
        .upload(fullPath, file, { upsert: false });
      if (error) {
        console.error('Upload error for', file.name, error);
        if (onProgress) onProgress(`Feil: ${file.name}`);
        continue;
      }
      uploaded.push(filename);
    } catch (e) {
      console.error('Upload exception for', file.name, e);
    }
  }

  if (window.loadAds) {
    window.loadAds();
  }
  return uploaded;
}

// Delete a file from storage
async function deleteFile(fullPath) {
  if (!supabaseClient) return false;
  
  const cfg = window.getSupabaseConfig();
  try {
    const { error } = await supabaseClient.storage
      .from(cfg.bucket)
      .remove([fullPath]);
    
    if (error) {
      console.error('Delete error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Delete exception:', e);
    return false;
  }
}

// Render ads list in UI
async function renderAdsList(containerEl, messageEl) {
  if (!containerEl) return;
  
  containerEl.innerHTML = '<p>Laster…</p>';
  const ads = await loadAds();
  
  if (ads.length === 0) {
    containerEl.innerHTML = '<p style="color: var(--sx-muted); font-size: 12px;">Ingen filer ennå</p>';
    return;
  }
  
  let html = '';
  ads.forEach(ad => {
    const isVideo = ad.type === 'video';
    const thumb = isVideo 
      ? `<div style="width:60px;height:60px;background:#222;display:flex;align-items:center;justify-content:center;border-radius:8px;"><span style="color:#fff;font-size:24px;">🎬</span></div>`
      : `<img src="${ad.publicUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" alt="${ad.name}" onerror="this.style.display='none';">`;
    
    html += `
      <div class="ads-item">
        <div class="ads-thumb">${thumb}</div>
        <div class="ads-info">
          <div class="ads-name">${ad.name}</div>
          <div class="ads-actions">
            <button class="ads-btn" onclick="copyAdUrl('${ad.publicUrl}', this)">📋 Kopier</button>
            <button class="ads-btn" onclick="window.open('${ad.publicUrl}', '_blank')">🔗 Åpne</button>
            <button class="ads-btn ads-btn-delete" onclick="deleteAdAndRefresh('${ad.path}')">🗑️ Slett</button>
          </div>
        </div>
      </div>
    `;
  });
  
  containerEl.innerHTML = html;
}

// Copy URL to clipboard
async function copyAdUrl(url, btn) {
  try {
    await navigator.clipboard.writeText(url);
    const original = btn.textContent;
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => {
      btn.textContent = original;
    }, 2000);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}

// Delete file and refresh list
async function deleteAdAndRefresh(path) {
  if (!confirm('Slett denne filen?')) return;
  const success = await deleteFile(path);
  if (success) {
    location.reload(); // Simple refresh
  }
}

// prevent browser opening files globally
function preventGlobalFileOpen() {
  ['dragenter','dragover','dragleave','drop'].forEach(evt => {
    window.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
    }, {passive:false});
  });
}

// Initialize upload zone
function initUploadZone(zoneEl, messageEl, onComplete) {
  if (!zoneEl) return;

  preventGlobalFileOpen();
  
  if (!supabaseClient) {
    zoneEl.textContent = '❌ Supabase ikke konfigurert';
    zoneEl.style.color = 'var(--sx-blue)';
    return;
  }
  
  zoneEl.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add('drag-active');
  });
  
  zoneEl.addEventListener('dragleave', e => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('drag-active');
  });
  
  zoneEl.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('drag-active');

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const uploaded = await uploadFiles(files, msg => {
      if (messageEl) messageEl.textContent = msg;
    });

    if (messageEl) {
      messageEl.textContent = `Lastet opp ${uploaded.length} fil(er)`;
    }

    if (onComplete) {
      setTimeout(() => onComplete(), 500);
    }
  });
  
  // Also allow file input via click
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.jpg,.jpeg,.png,.webp,.mp4';
  input.style.display = 'none';
  
  input.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const uploaded = await uploadFiles(files, msg => {
      if (messageEl) messageEl.textContent = msg;
    });
    
    if (messageEl) {
      messageEl.textContent = `Lastet opp ${uploaded.length} fil(er)`;
    }
    
    if (onComplete) {
      setTimeout(() => onComplete(), 500);
    }
  });
  
  zoneEl.appendChild(input);
  zoneEl.addEventListener('click', () => input.click());
  zoneEl.style.cursor = 'pointer';
}

// DOM-ready initialization
window.addEventListener('DOMContentLoaded', async () => {
  preventGlobalFileOpen();
  await initSupabaseClient();

  const drop = document.getElementById('adsDropzone');
  const msgEl = document.getElementById('adsMessage');
  const listEl = document.getElementById('adsList');

  if (!drop) {
    console.error('adsDropzone element not found');
    return;
  }

  initUploadZone(drop, msgEl, () => {
    if (window.loadAds) window.loadAds();
    else renderAdsList(listEl, msgEl);
  });

  renderAdsList(listEl, msgEl);
});
