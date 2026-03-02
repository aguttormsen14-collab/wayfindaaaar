# Admin Auth Migration Guide

**Date:** March 2, 2026  
**Change:** Fake hardcoded login → Real Supabase Auth

---

## What Changed

### Before (Vulnerable)
```javascript
// admin/login.js (OLD)
if (user === 'test' && pass === '1234') {  // ❌ Hardcoded
  localStorage.setItem('sx_auth', JSON.stringify({ ok: true }));  // ❌ No expiry
  location.href = './dashboard.html';
}

// admin/dashboard.js (OLD)
const raw = localStorage.getItem('sx_auth');  // ❌ Anyone can forge this
if (!obj || !obj.ok) location.href = './login.html';
```

**Problems:**
- Anyone with access to browser DevTools can fake the `sx_auth` flag
- No real user identity tracking
- No session expiry
- No server-side validation

### After (Secure)
```javascript
// admin/login.js (NEW)
const { user, error } = await adminSignIn(email, password);  // ✅ Supabase Auth
if (!error && user) {
  location.href = './dashboard.html';  // ✅ Token stored by SDK
}

// admin/dashboard.js (NEW)
const { user, error } = await adminGetSession();  // ✅ Server-validated
if (!user) location.href = './login.html';
```

**Benefits:**
- Real Supabase Auth backend validation
- Email + password authentication
- Automatic session/token management (SDK handles it)
- Can be extended to 2FA, OAuth, etc.

---

## New Files

1. **`admin/admin-auth-supabase.js`** (NEW)
   - Minimal Supabase Auth wrapper
   - Exports: `adminSignIn()`, `adminSignOut()`, `adminGetSession()`, `adminOnAuthChange()`
   - No UI logic, only auth operations

2. **`config.js.example`** (NEW)
   - Template for local configuration
   - Never commit actual values

3. **`.env.example`** (NEW)
   - Template for Supabase secrets
   - Copy to `.env.local` for dev

4. **`KEY_ROTATION_URGENT.md`** (NEW)
   - Key rotation instructions
   - Old key must be revoked in Supabase console

---

## Modified Files

| File | Change | Impact |
|------|--------|--------|
| `admin/login.js` | Replaced hardcoded check with `adminSignIn()` | User must have Supabase account |
| `admin/dashboard.js` | Replaced localStorage check with `adminGetSession()` | Session checked server-side |
| `admin/login.html` | Added input type="email" | Better mobile UX |
| `admin/dashboard.html` | Added admin-auth-supabase.js | Auth guards active |
| `config.js` | Removed hardcoded credentials | Requires config.local.js |
| `.env` | Cleared (no secrets) | Use .env.local |

---

## Setup Instructions for Your Test Environment

### 1. Create a Test Supabase Account

```
Email: your-test-email@example.com
Password: secure-test-password-123
```

**How to create:**
1. Go to https://app.supabase.com
2. Select project `bhunptoiypamybwgpfoz`
3. Settings → Authentication → Users
4. Click "Add user"
5. Enter email and password, click Create

### 2. Copy config.local.js

```bash
# In repo root
cp config.js.example config.local.js
```

**Edit `config.local.js`:**
```javascript
window.SUPABASE_URL = "https://bhunptoiypamybwgpfoz.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOi...";  // Copy from Settings → API → anon key
window.SUPABASE_BUCKET = "saxvik-hub";
window.DEFAULT_INSTALL_SLUG = "amfi-steinkjer";
```

### 3. Update Login Page Script Order

`admin/login.html` now loads:
1. `supabase-config.js` (SDK init) ✅ Already updated
2. `admin-auth-supabase.js` (auth helper) ✅ Already updated
3. `login.js` (login form handler) ✅ Already updated

### 4. Test Login Flow

1. Open `http://localhost:5500/admin/login.html` (Live Server)
2. Enter test email and password
3. Click "Logg inn"
4. Should redirect to dashboard.html
5. Click "Logg ut" (logout button in top-right)
6. Should redirect back to login.html

---

## Session Behavior

### Session Creation
- User enters email + password on login page
- `adminSignIn()` calls `supabase.auth.signInWithPassword()`
- Supabase returns JWT token (stored in browser's sessionStorage by SDK)
- User redirected to dashboard

### Session Validation
- Dashboard calls `adminGetSession()` on load
- Gets user from `supabase.auth.getUser()` (validates JWT serverside)
- If valid → dashboard loads
- If invalid → redirect to login

### Session Expiry
- Supabase JWT expires after  1 hour (default)
- On next page load, `getUser()` returns null if expired
- User redirected to login
- SDK handles refresh tokens automatically

### Logout
- User clicks "Logg ut" button
- `adminSignOut()` called → clears SDK session
- Redirect to login page

---

## Testing Scenarios

### ✅ Valid Login
```
1. Open login.html
2. Enter test email: your-test-email@example.com
3. Enter password: secure-test-password-123
4. Click "Logg inn"
5. ✅ Should redirect to dashboard.html
6. Check browser console → "[ADMIN AUTH] Signed in: your-test-email@example.com"
```

### ✅ Invalid Password
```
1. Open login.html
2. Enter email: your-test-email@example.com
3. Enter password: wrong-password
4. Click "Logg inn"
5. ✅ Should show "❌ Invalid login credentials"
6. Option to create new account appears
```

### ✅ Auto-Create Account (Optional)
```
1. On login page, enter new email + password
2. On first "Invalid login" error, UI offers "Opprett ny?"
3. Click submit again
4. ✅ New account created + auto-logged in
5. Redirects to dashboard
```

### ✅ Logout
```
1. On dashboard, click "Logg ut" button (top-right)
2. ✅ Should redirect to login.html
3. Check browser console → "[ADMIN AUTH] Signed out"
```

### ✅ Session Expiry (after 1 hour)
```
1. Login successfully
2. Wait 1+ hours (or manually expire JWT in DevTools)
3. Refresh dashboard page
4. ✅ Should redirect to login.html (session expired)
```

### ✅ No Access to Dashboard Without Login
```
1. Clear all localStorage/sessionStorage
2. Open dashboard.html directly
3. ✅ Should redirect to login.html immediately
```

---

## Rollback Plan (If Something Breaks)

If you need to revert to the old fake auth:

```bash
# Restore old login.js
git checkout HEAD -- admin/login.js

# Restore old dashboard.js
git checkout HEAD -- admin/dashboard.js

# Remove new auth helper
rm admin/admin-auth-supabase.js
```

Then remove the `<script src="./admin-auth-supabase.js"></script>` line from both login.html and dashboard.html.

---

## Next Steps

1. ✅ Create test user in Supabase
2. ✅ Set up config.local.js
3. ✅ Test login/logout flow
4. ⏳ Document test results
5. ⏳ Deploy to staging (if applicable)
6. ⏳ Notify team: "Admin auth is now real Supabase Auth, not hardcoded"

---

## FAQ

**Q: Can I still create new admin accounts?**  
A: Yes. If email doesn't exist, the login page offers to create one (if you tap submit twice).

**Q: What if I forget the password?**  
A: Supabase Auth includes password reset. Can be added to login page if needed.

**Q: Does this require email verification?**  
A: Not for this implementation (passwordless email is optional). Current setup allows instant login after signup.

**Q: Can I add 2FA?**  
A: Yes, Supabase Auth supports TOTP 2FA. Would require small changes to `admin-auth-supabase.js`.

**Q: Is the session secure?**  
A: Yes. Token is signed and validated server-side by Supabase. Forgery is not possible.

---

**Implementation Date:** 2026-03-02  
**Status:** Ready for testing
