// admin/admin-ads.js — Supabase ads management (library only, no auto-init)

let supabaseClient = null;

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

/** Supabase client init */
async function initSupabaseClient() {
  if (typeof window.isSupabaseConfigured !== 'function' || !window.isSupabaseConfigured()) {
    console.warn('[ADMIN] Supabase not configured or helper missing');
    return null;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('[ADMIN] supabase-js CDN not loaded (window.supabase missing)');
    return null;
  }

  const cfg = getCfg();
  if (!cfg?.url || !cfg?.anonKey || !cfg?.bucket) {
    console.warn('[ADMIN] config incomplete:', cfg);
    return null;
  }

  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  console.log('[ADMIN] Supabase client initialized');
  console.log('[ADMIN] config:', { url: cfg.url, bucket: cfg.bucket, installSlug: cfg.installSlug });

  // Non-blocking storage check
  try {
    const { error } = await supabaseClient.storage.from(cfg.bucket).list('', { limit: 1 });
    if (error) console.warn('[ADMIN] ⚠️ Storage access failed:', error.message);
    else console.log('[ADMIN] ✅ Storage connection verified');
  } catch (e) {
    console.warn('[ADMIN] ⚠️ Connection check failed:', e?.message || e);
  }

  return supabaseClient;
}

/** Ads prefix WITHOUT trailing slash for storage.list() */
function buildAdsPrefix() {
  const cfg = getCfg();
  return `installs/${cfg.installSlug}/assets/ads`;
}

/** Helper: public URL from storage */
function getPublicUrl(bucket, fullPath) {
  const res = supabaseClient.storage.from(bucket).getPublicUrl(fullPath);
  return res?.data?.publicUrl || res?.publicURL || res?.publicUrl || '';
}

/** Load ads list from storage */
async function loadAds() {
  if (!supabaseClient) return [];
  const cfg = getCfg();
  const prefix = buildAdsPrefix();

  try {
    const { data, error } = await supabaseClient.storage.from(cfg.bucket).list(prefix, {
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

/** Upload files to storage */
async function uploadFiles(fileList, onProgress) {
  if (typeof window.isSupabaseConfigured !== 'function' || !window.isSupabaseConfigured()) {
    alert('Supabase ikke konfigurert – fyll inn config.js');
    return [];
  }
  if (!window.supabase?.createClient) {
    alert('Supabase biblioteket er ikke lastet (CDN).');
    return [];
  }

  const cfg = getCfg();
  const client = window.supabase.createClient(cfg.url, cfg.anonKey);
  const prefix = buildAdsPrefix();
  const bucket = cfg.bucket;
  const uploaded = [];

  for (const file of fileList) {
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
    if (!['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext)) {
      console.warn('[ADMIN] Skipping unsupported file:', file.name);
      continue;
    }

    const timestamp = Date.now();
    const uuid =
      (crypto?.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2, 11);

    const filename = `${timestamp}-${uuid}${ext}`;
    const fullPath = `${prefix}/${filename}`;

    console.log('[ADMIN] Uploading', file.name, 'as', fullPath);
    if (onProgress) onProgress(`Laster opp ${file.name}…`);

    try {
      const { error } = await client.storage.from(bucket).upload(fullPath, file, { upsert: false });
      if (error) {
        console.error('[ADMIN] Upload error for', file.name, error);
        if (onProgress) onProgress(`Feil: ${file.name}`);
        continue;
      }
      uploaded.push(filename);
    } catch (e) {
      console.error('[ADMIN] Upload exception for', file.name, e);
    }
  }

  return uploaded;
}

/** Delete file from storage */
async function deleteFile(fullPath) {
  if (!supabaseClient) return false;
  const cfg = getCfg();

  try {
    const { error } = await supabaseClient.storage.from(cfg.bucket).remove([fullPath]);
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

  containerEl.innerHTML = '<p>Laster…</p>';
  const ads = await loadAds();

  if (ads.length === 0) {
    containerEl.innerHTML =
      '<p style="color: var(--sx-muted); font-size: 12px;">Ingen filer ennå</p>';
    return;
  }

  let html = '';
  ads.forEach((ad) => {
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

  if (!supabaseClient) {
    zoneEl.textContent = '❌ Supabase ikke konfigurert';
    zoneEl.style.color = '#dc2626';
    return;
  }

  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add('drag-active');
  });

  zoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('drag-active');
  });

  zoneEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove('drag-active');

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