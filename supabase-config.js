/**
 * supabase-config.js — Helper functions for Supabase configuration
 * 
 * This file provides helper functions to get Supabase config and check if it's ready.
 * It requires that config.js has already been loaded to set:
 *   - window.SUPABASE_URL
 *   - window.SUPABASE_ANON_KEY
 *   - window.SUPABASE_BUCKET (optional)
 *   - window.DEFAULT_INSTALL_SLUG (optional)
 */

/**
 * Check if Supabase is properly configured
 * @returns {boolean} true if all required credentials are present
 */
window.isSupabaseConfigured = function() {
  return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
};

/**
 * Get the current Supabase configuration object
 * @returns {Object|null} Config object with url, anonKey, bucket, installSlug, or null if not configured
 */
window.getSupabaseConfig = function() {
  if (!window.isSupabaseConfigured()) {
    console.warn('[supabase-config] Supabase not configured');
    return null;
  }

  // Allow optional override via URL param: ?install=xxx
  const params = new URLSearchParams(location.search);
  const installOverride = params.get('install');

  return {
    url: window.SUPABASE_URL,
    anonKey: window.SUPABASE_ANON_KEY,
    bucket: window.SUPABASE_BUCKET || 'saxvik-hub',
    installSlug: installOverride || window.DEFAULT_INSTALL_SLUG || 'amfi-steinkjer'
  };
};

// Create a single Supabase client instance (singleton)
// This module is responsible for ensuring exactly one client exists and
// providing clear logs. Other scripts should simply reference
// `window.supabase` after this file has run.
(function initSupabaseClientSingleton() {
  function attempt() {
    if (!window.isSupabaseConfigured()) return false;

    // nothing to do until the CDN library is available
    if (!window.supabase) return false;

    // if the object already carries our singleton flag or behaves like a
    // client (has storage but not createClient) we treat it as the instance.
    if (window.supabase.__sx_singleton || (window.supabase.storage && !window.supabase.createClient)) {
      console.log('[supabase-config] singleton exists');
      return true;
    }

    // if the CDN library is loaded, create the client now
    if (typeof window.supabase.createClient === 'function') {
      const cfg = window.getSupabaseConfig();
      const client = window.supabase.createClient(cfg.url, cfg.anonKey);
      client.__sx_singleton = true;
      window.supabase = client;
      console.log('[supabase-config] singleton created');
      return true;
    }

    return false;
  }

  // try immediately; may return false if library not yet loaded
  if (!attempt()) {
    // poll until the library object appears or a client is created
    const interval = setInterval(() => {
      if (attempt()) clearInterval(interval);
    }, 50);
  }
})();

// Debug logging
if (typeof console !== 'undefined') {
  const isConfigured = window.isSupabaseConfigured();
  const logLevel = isConfigured ? 'log' : 'warn';
  console[logLevel](
    `[supabase-config] Supabase ${isConfigured ? '✓ configured' : '✗ NOT configured'}`
  );
  if (isConfigured) {
    const cfg = window.getSupabaseConfig();
    console.log('[supabase-config] Config:', {
      url: cfg.url,
      bucket: cfg.bucket,
      installSlug: cfg.installSlug,
      anonKey: '***' // don't log sensitive values
    });
  }
}
