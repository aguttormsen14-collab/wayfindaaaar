// admin/admin-ads.js — Supabase ads management (library only, no auto-init)

let cachedAds = [];

// ===== SECURITY: HTML escape helper (XSS prevention) =====
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(text || '').replace(/[&<>"']/g, ch => map[ch]);
}

function getSupabase() {
  const s = window.supabaseClient;

  // A valid client has .storage and .auth
  if (s && s.storage) {
    return s;
  }

  return null;
}

// helper to prefix local asset paths when needed
function withBase(path) {
  const base = window.SX_BASE_PATH || '/';
  return `${base}${path}`.replace(/\/\/+/g, '/');
}

// show immediate error if supabase client not ready
function isSupabaseReady() {
  const s = window.supabaseClient;
  return !!(s && s.storage);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isSupabaseReady()) {
    const msgEl = document.getElementById('adsMessage');
    if (msgEl) {
      msgEl.textContent = '❌ Supabase client not initialized';
      msgEl.style.color = '#dc2626';
    }
    console.error('[ADMIN] Supabase client not initialized');
  }
});

/** Prevent browser from opening dropped files (global) */
function preventGlobalFileOpen() {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
    window.addEventListener(
      evt,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { passive: false }
    );
  });
}

/** Read config safely */
function getCfg() {
  if (typeof window.getSupabaseConfig !== 'function') return null;
  return window.getSupabaseConfig();
}



/** Ads prefix WITHOUT trailing slash for storage.list() */
function buildAdsPrefix() {
  const cfg = getCfg();
  return `installs/${cfg.installSlug}/assets/ads`;
}

/** Helper: public URL from storage */
function getPublicUrl(bucket, fullPath) {
  const supabase = getSupabase();
  if (!supabase) return '';
  const res = supabase.storage.from(bucket).getPublicUrl(fullPath);
  return res?.data?.publicUrl || res?.publicURL || res?.publicUrl || '';
}

async function storageFileExists(bucket, folderPath, fileName) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase.storage.from(bucket).list(folderPath, {
    limit: 200,
    offset: 0,
  });

  if (error || !Array.isArray(data)) return false;
  return data.some((item) => item?.name === fileName);
}

/** Load ads list from storage */
async function loadAds() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const cfg = getCfg();
  const prefix = buildAdsPrefix();

  try {
    const { data, error } = await supabase.storage.from(cfg.bucket).list(prefix, {
      limit: 200,
      offset: 0,
    });

    if (error) {
      console.error('[ADMIN] Failed to list ads:', error);
      return [];
    }

    const files = (data || [])
      .filter((f) => {
        const dot = f.name.lastIndexOf('.');
        if (dot < 0) return false;
        const ext = f.name.slice(dot).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext);
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return files.map((f) => {
      const fullPath = `${prefix}/${f.name}`;
      const publicUrl = getPublicUrl(cfg.bucket, fullPath);
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      return {
        name: f.name,
        path: fullPath,
        publicUrl,
        type: ext === '.mp4' ? 'video' : 'image',
      };
    });
  } catch (e) {
    console.error('[ADMIN] Error loading ads:', e);
    return [];
  }
}

// AUDIT: Load playlist.json from storage
// Returns null if missing or invalid
async function loadPlaylist() {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const cfg = getCfg();
    const adsFolder = `installs/${cfg.installSlug}/assets/ads`;
    const hasPlaylist = await storageFileExists(cfg.bucket, adsFolder, 'playlist.json');
    if (!hasPlaylist) return null;
    const playlistPath = `installs/${cfg.installSlug}/assets/ads/playlist.json`;
    
    const { data, error } = await supabase.storage
      .from(cfg.bucket)
      .download(playlistPath);
    
    if (error || !data) {
      console.log('[PLAYLIST] Not found:', error?.message);
      return null;
    }
    
    const text = await data.text();
    return JSON.parse(text);
  } catch (e) {
    console.warn('[PLAYLIST] Load error:', e.message);
    return null;
  }
}

// AUDIT: Save playlist.json to storage
async function savePlaylist(playlist) {
  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not ready');
    
    const cfg = getCfg();
    const playlistPath = `installs/${cfg.installSlug}/assets/ads/playlist.json`;
    const json = JSON.stringify(playlist, null, 2);
    
    const { error } = await supabase.storage
      .from(cfg.bucket)
      .update(playlistPath, new Blob([json], { type: 'application/json' }), { upsert: true });
    
    if (error) throw error;
    console.log('[PLAYLIST] Saved');
    return true;
  } catch (e) {
    console.error('[PLAYLIST] Save error:', e.message);
    return false;
  }
}

/** Upload files to storage */
async function uploadFiles(fileList, onProgress) {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[ADMIN] Supabase client not initialized');
    if (onProgress) onProgress('❌ Supabase client not initialized');
    return [];
  }

  const cfg = getCfg();
  const prefix = buildAdsPrefix();
  const bucket = cfg.bucket;
  const uploaded = [];

  const supportedExt = ['.jpg', '.jpeg', '.png', '.webp', '.mp4'];
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  // ===== SECURITY: Input validation =====
  for (const file of fileList) {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const msg = `❌ ${file.name}: exceeds 25 MB limit`;
      console.warn('[ADMIN] File too large:', file.name, file.size);
      if (onProgress) onProgress(msg);
      continue;
    }

    const dot = file.name.lastIndexOf('.');
    let ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';

    // simple filter for allowed extensions
    if (!ext && file.type === 'image/png') {
      ext = '.png';
    }
    if (!supportedExt.includes(ext)) {
      const msg = `❌ ${file.name}: unsupported file type`;
      console.warn('[ADMIN] Skipping unsupported file:', { name: file.name, type: file.type, ext });
      if (onProgress) onProgress(msg);
      continue;
    }

    // ===== SECURITY: Prevent path traversal =====
    const sanitizedName = file.name.replace(/\.\.\//g, '').replace(/\\/g, '/');
    const fullPath = `installs/${cfg.installSlug}/assets/ads/${sanitizedName}`;
    
    console.log('[ADMIN] Uploading to:', fullPath);
    if (onProgress) onProgress(`Uploading ${file.name}...`);

    try {
      const { error } = await supabase.storage.from(bucket).upload(fullPath, file, { upsert: true });
      if (error) {
        console.error('[ADMIN] Upload failed:', error);
        const msg = `❌ ${file.name}: ${error.message || 'Unknown error'}`;
        if (onProgress) onProgress(msg);
        continue;
      }
      if (onProgress) onProgress(`✅ ${file.name} uploaded`);
      uploaded.push(file.name);
    } catch (e) {
      console.error('[ADMIN] Upload exception:', e);
      const msg = `❌ ${file.name}: ${e?.message || 'Unknown error'}`;
      if (onProgress) onProgress(msg);
    }
  }

  return uploaded;
}

/** Delete file from storage */
async function deleteFile(fullPath) {
  const supabase = getSupabase();
  if (!supabase) return false;
  const cfg = getCfg();

  try {
    const { error } = await supabase.storage.from(cfg.bucket).remove([fullPath]);
    if (error) {
      console.error('[ADMIN] Delete error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[ADMIN] Delete exception:', e);
    return false;
  }
}

/** Render ads list in UI */
async function renderAdsList(containerEl, messageEl) {
  if (!containerEl) return;

  containerEl.innerHTML = '<div class="asset-empty">Laster reklamefiler…</div>';
  const ads = await loadAds();
  cachedAds = ads;

  const searchEl = document.getElementById('adsSearch');
  if (searchEl && !searchEl.dataset.adsSearchBound) {
    searchEl.dataset.adsSearchBound = '1';
    searchEl.addEventListener('input', () => {
      renderAdsListFromCache(containerEl);
    });
  }

  renderAdsListFromCache(containerEl);
}

function renderAdsListFromCache(containerEl) {
  if (!containerEl) return;

  const summaryEl = document.getElementById('adsSummary');
  const searchEl = document.getElementById('adsSearch');
  const query = String(searchEl?.value || '').trim().toLowerCase();

  const filteredAds = query
    ? cachedAds.filter((ad) => String(ad.name || '').toLowerCase().includes(query))
    : cachedAds;

  if (summaryEl) {
    const total = cachedAds.length;
    const shown = filteredAds.length;
    summaryEl.textContent = query
      ? `Viser ${shown} av ${total} filer`
      : `${total} filer i biblioteket`;
  }

  if (cachedAds.length === 0) {
    containerEl.innerHTML =
      '<div class="asset-empty">Ingen reklamefiler lastet opp ennå.</div>';
    return;
  }

  if (filteredAds.length === 0) {
    containerEl.innerHTML =
      '<div class="asset-empty">Ingen treff på søket ditt.</div>';
    return;
  }

  let html = '';
  filteredAds.forEach((ad) => {
    const isVideo = ad.type === 'video';
    // ===== SECURITY: Escape filename for safe HTML rendering =====
    const escapedName = escapeHtml(ad.name);
    const escapedPath = escapeHtml(ad.path);
    const escapedUrl = escapeHtml(ad.publicUrl);
    
    const thumb = isVideo
      ? `<div class="asset-thumb"><div style="width:100%;height:100%;background:#1e7bb8;display:flex;align-items:center;justify-content:center;border-radius:6px;"><span style="color:#fff;font-size:28px;">🎬</span></div></div>`
      : `<div class="asset-thumb"><img src="${escapedUrl}" alt="${escapedName}" onerror="this.style.display='none';"></div>`;

    html += `
      <div class="asset-row">
        ${thumb}
        <div class="asset-info">
          <div class="asset-name">${escapedName}</div>
          <div class="asset-meta">${isVideo ? 'Video' : 'Bilde'}</div>
        </div>
        <div class="asset-actions">
          <button class="asset-btn" onclick="copyAdUrl('${escapedUrl}', this)">📋 Kopier</button>
          <button class="asset-btn" onclick="window.open('${escapedUrl}', '_blank')">🔗 Åpne</button>
          <button class="asset-btn asset-btn-delete" onclick="deleteAdAndRefresh('${escapedPath}')">🗑️ Slett</button>
        </div>
      </div>
    `;
  });

  containerEl.innerHTML = html;
}

/** Copy URL to clipboard */
async function copyAdUrl(url, btn) {
  try {
    await navigator.clipboard.writeText(url);
    const original = btn.textContent;
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => (btn.textContent = original), 2000);
  } catch (e) {
    console.error('[ADMIN] Copy failed:', e);
  }
}

/** Delete file and refresh list */
async function deleteAdAndRefresh(path) {
  if (!confirm('Slett denne filen?')) return;
  const success = await deleteFile(path);
  if (success) location.reload();
}

/** Initialize upload zone (drag/drop + click upload) */
function initUploadZone(zoneEl, messageEl, onComplete) {
  if (!zoneEl) return;

  preventGlobalFileOpen();

  const supabase = getSupabase();
  if (!supabase) {
    zoneEl.textContent = '❌ Supabase client not initialized';
    zoneEl.style.color = '#dc2626';
    return;
  }

  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add('is-dragover');
  });

  zoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('is-dragover');
  });

  zoneEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('is-dragover');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const uploaded = await uploadFiles(files, (msg) => {
      if (messageEl) messageEl.textContent = msg;
    });

    if (messageEl) messageEl.textContent = `Lastet opp ${uploaded.length} fil(er)`;
    if (onComplete) setTimeout(() => onComplete(), 500);
  });

  // Click to upload
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.jpg,.jpeg,.png,.webp,.mp4';
  input.style.display = 'none';

  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const uploaded = await uploadFiles(files, (msg) => {
      if (messageEl) messageEl.textContent = msg;
    });

    if (messageEl) messageEl.textContent = `Lastet opp ${uploaded.length} fil(er)`;
    if (onComplete) setTimeout(() => onComplete(), 500);
  });

  zoneEl.appendChild(input);
  zoneEl.addEventListener('click', () => input.click());
  zoneEl.style.cursor = 'pointer';
}

// AUDIT: Render playlist editor UI
async function renderPlaylistEditor(containerEl) {
  if (!containerEl) return;
  
  const ads = await loadAds();
  const playlist = await loadPlaylist();
  const playlistItems = playlist?.items || [];

  let html = '<div class="playlist-editor">';
  html += '<div class="playlist-editor-head">';
  html += '<h3 class="playlist-editor-title">Spilleliste</h3>';
  html += '<p class="playlist-editor-subtitle">Velg hvilke filer som skal spilles og sett varighet per fil.</p>';
  html += '</div>';

  if (ads.length === 0) {
    html += '<div class="asset-empty">Ingen reklamer lastet opp ennå.</div>';
    containerEl.innerHTML = html + '</div>';
    return;
  }

  html += `
    <div class="playlist-tools">
      <div class="playlist-tools-actions">
        <button id="playlistSelectAllBtn" class="btn btn-secondary btn-sm" type="button">Velg alle</button>
        <button id="playlistClearBtn" class="btn btn-secondary btn-sm" type="button">Tøm valg</button>
      </div>
      <p id="playlistSummary" class="playlist-summary">0 valgt</p>
    </div>
  `;

  html += '<div id="playlistItems" class="playlist-items">';
  
  for (let i = 0; i < ads.length; i++) {
    const ad = ads[i];
    const playlistItem = playlistItems.find(p => p.filename === ad.name);
    const isChecked = !!playlistItem;
    const duration = playlistItem?.duration || 8000;
    const mediaLabel = ad.type === 'video' ? 'Video' : 'Bilde';
    const escapedName = escapeHtml(ad.name);
    
    html += `
      <div class="playlist-item" data-filename="${escapedName}">
        <label class="playlist-item-toggle">
          <input type="checkbox" class="playlist-checkbox" data-filename="${escapedName}" ${isChecked ? 'checked' : ''}>
        </label>
        <div class="playlist-item-info">
          <p class="playlist-item-name">${escapedName}</p>
          <p class="playlist-item-meta">${mediaLabel}</p>
        </div>
        <div class="playlist-item-duration-wrap">
          <input type="number" class="playlist-duration" value="${duration / 1000}" min="1" max="60" placeholder="Sek.">
          <span class="playlist-item-duration-unit">sek</span>
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  html += `
    <div class="playlist-actions">
      <button id="savePlaylistBtn" class="btn btn-primary" type="button">Lagre spilleliste</button>
      <p id="playlistSaveStatus" class="message"></p>
    </div>
  `;
  html += '</div>';
  
  containerEl.innerHTML = html;

  const summaryEl = containerEl.querySelector('#playlistSummary');
  const saveStatusEl = containerEl.querySelector('#playlistSaveStatus');
  const checkboxes = Array.from(containerEl.querySelectorAll('.playlist-checkbox'));

  const updateSummary = () => {
    const selected = checkboxes.filter((cb) => cb.checked).length;
    summaryEl.textContent = `${selected} valgt`;
  };

  updateSummary();

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', updateSummary);
  });

  const selectAllBtn = containerEl.querySelector('#playlistSelectAllBtn');
  const clearBtn = containerEl.querySelector('#playlistClearBtn');

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      checkboxes.forEach((checkbox) => { checkbox.checked = true; });
      updateSummary();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      checkboxes.forEach((checkbox) => { checkbox.checked = false; });
      updateSummary();
    });
  }
  
  // Bind save button
  const saveBtn = containerEl.querySelector('#savePlaylistBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const items = [];
      containerEl.querySelectorAll('.playlist-checkbox:checked').forEach(cb => {
        const filename = cb.dataset.filename;
        const row = cb.closest('.playlist-item');
        const durationInput = row ? row.querySelector('.playlist-duration') : null;
        const seconds = Math.max(1, Math.min(60, parseInt(durationInput?.value, 10) || 8));
        const duration = seconds * 1000;
        items.push({ filename, duration });
      });
      
      const newPlaylist = { items };
      if (saveStatusEl) {
        saveStatusEl.textContent = 'Lagrer spilleliste…';
      }
      const success = await savePlaylist(newPlaylist);
      if (success) {
        if (saveStatusEl) saveStatusEl.textContent = '✅ Spilleliste lagret';
      } else {
        if (saveStatusEl) saveStatusEl.textContent = '❌ Feil ved lagring av spilleliste';
      }
    });
  }
}

// AUDIT: Render weather settings editor
async function renderWeatherSettings(containerEl) {
  if (!containerEl) return;
  
  let html = '<div style="padding: 16px; background: var(--bg); border-radius: 8px;">';
  html += '<h3 style="margin-top: 0; margin-bottom: 8px;">Værinnstillinger</h3>';
  html += '<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Konfigurer værdisplay på kioskene</p>';
  html += `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <input type="checkbox" id="weatherEnabled" style="cursor: pointer;" />
        <span>Aktiver værdisplay</span>
      </label>
      <div>
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">Lokasjon:</label>
        <input id="weatherLocation" type="text" placeholder="F.eks. Trondheim, NO" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
      </div>
      <button id="saveWeatherBtn" class="btn btn-primary" style="width: 100%;">Lagre værinnstillinger</button>
      <p style="font-size: 12px; color: var(--text-muted); margin: 0;">💡 Tipp: Været hentes fra API når aktivert</p>
    </div>
  `;
  html += '</div>';
  
  containerEl.innerHTML = html;
  
  // Load current settings
  try {
    const supabase = getSupabase();
    if (supabase) {
      const cfg = getCfg();
      const assetsFolder = `installs/${cfg.installSlug}/assets`;
      const hasSettings = await storageFileExists(cfg.bucket, assetsFolder, 'settings.json');
      if (hasSettings) {
        const settingsPath = `installs/${cfg.installSlug}/assets/settings.json`;
        const { data, error } = await supabase.storage.from(cfg.bucket).download(settingsPath);

        if (!error && data) {
          const text = await data.text();
          const settings = JSON.parse(text);
          if (settings.weather) {
            document.getElementById('weatherEnabled').checked = settings.weather.enabled;
            document.getElementById('weatherLocation').value = settings.weather.location || 'Trondheim, NO';
          }
        }
      }
    }
  } catch (e) {
    console.warn('[WEATHER] Load error:', e.message);
  }
  
  // Bind save button
  const saveBtn = containerEl.querySelector('#saveWeatherBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase not ready');
        
        const cfg = getCfg();
        const enabled = document.getElementById('weatherEnabled').checked;
        const location = document.getElementById('weatherLocation').value || 'Trondheim, NO';
        
        const settings = {
          weather: { enabled, location }
        };
        
        const settingsPath = `installs/${cfg.installSlug}/assets/settings.json`;
        const json = JSON.stringify(settings, null, 2);
        
        const { error } = await supabase.storage
          .from(cfg.bucket)
          .update(settingsPath, new Blob([json], { type: 'application/json' }), { upsert: true });
        
        if (error) throw error;
        alert('✅ Værinnstillinger lagret!');
      } catch (e) {
        console.error('[WEATHER] Save error:', e);
        alert('❌ Feil ved lagring av værinnstillinger');
      }
    });
  }
}