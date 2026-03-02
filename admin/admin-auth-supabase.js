/**
 * admin-auth-supabase.js
 * Minimal Supabase Auth integration for admin panel
 * 
 * Provides:
 * - signInWithEmail(email, password)
 * - signUp(email, password)
 * - signOut()
 * - getSession()
 * - onSessionChange(callback)
 */

let adminAuthSessionToken = null;
let adminAuthUser = null;

/**
 * Get current Supabase client (from supabase-config.js)
 */
function getAdminSupabase() {
  if (!window.supabaseClient) {
    console.error('[ADMIN AUTH] Supabase client not available');
    return null;
  }
  return window.supabaseClient;
}

/**
 * Sign in with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{user, error}>}
 */
async function adminSignIn(email, password) {
  const client = getAdminSupabase();
  if (!client) {
    return { user: null, error: 'Supabase not initialized' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    
    if (error) {
      console.warn('[ADMIN AUTH] Sign in failed:', error.message);
      return { user: null, error: error.message };
    }

    adminAuthSessionToken = data.session?.access_token;
    adminAuthUser = data.user;
    
    console.log('[ADMIN AUTH] Signed in:', adminAuthUser?.email);
    return { user: data.user, error: null };
  } catch (e) {
    console.error('[ADMIN AUTH] Sign in exception:', e.message);
    return { user: null, error: e.message };
  }
}

/**
 * Sign out current admin user
 * @returns {Promise<void>}
 */
async function adminSignOut() {
  const client = getAdminSupabase();
  if (!client) return;

  try {
    await client.auth.signOut();
    adminAuthSessionToken = null;
    adminAuthUser = null;
    console.log('[ADMIN AUTH] Signed out');
  } catch (e) {
    console.error('[ADMIN AUTH] Sign out error:', e.message);
  }
}

/**
 * Get current session/user
 * @returns {Promise<{user, token, error}>}
 */
async function adminGetSession() {
  const client = getAdminSupabase();
  if (!client) {
    return { user: null, token: null, error: 'Supabase not initialized' };
  }

  try {
    const { data, error } = await client.auth.getUser();
    
    if (error) {
      console.warn('[ADMIN AUTH] No valid session:', error.message);
      return { user: null, token: null, error: error.message };
    }

    if (data.user) {
      adminAuthUser = data.user;
      const { data: sessionData } = await client.auth.getSession();
      adminAuthSessionToken = sessionData.session?.access_token;
      
      return {
        user: data.user,
        token: adminAuthSessionToken,
        error: null
      };
    }

    return { user: null, token: null, error: 'No authenticated user' };
  } catch (e) {
    console.error('[ADMIN AUTH] Session check error:', e.message);
    return { user: null, token: null, error: e.message };
  }
}

/**
 * Watch for auth state changes
 * @param {Function} callback - Called with {user, token} when state changes
 * @returns {Function} Unsubscribe function
 */
function adminOnAuthChange(callback) {
  const client = getAdminSupabase();
  if (!client) {
    console.error('[ADMIN AUTH] Cannot watch auth changes without Supabase client');
    return () => {};
  }

  const {
    data: { subscription }
  } = client.auth.onAuthStateChange((event, session) => {
    adminAuthUser = session?.user ?? null;
    adminAuthSessionToken = session?.access_token ?? null;
    
    console.log('[ADMIN AUTH] Auth change:', event, adminAuthUser?.email || 'logged out');
    
    if (callback && typeof callback === 'function') {
      callback({
        user: adminAuthUser,
        token: adminAuthSessionToken,
        event
      });
    }
  });

  return () => {
    if (subscription) {
      subscription.unsubscribe();
    }
  };
}

/**
 * Check if admin is currently authenticated
 * @returns {boolean}
 */
function adminIsAuthenticated() {
  return !!(adminAuthUser && adminAuthSessionToken);
}

// Initialize auth state on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Check if user already has a valid session
  const { user, token, error } = await adminGetSession();
  
  if (user) {
    console.log('[ADMIN AUTH] User has valid session:', user.email);
  } else {
    console.log('[ADMIN AUTH] No valid session found');
  }
});
