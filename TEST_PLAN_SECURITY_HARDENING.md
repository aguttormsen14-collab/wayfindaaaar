# Test Plan: Security & Auth Hardening (March 2, 2026)

---

## Part 1: Secrets Removal Validation

### ✅ Test 1: Config Files No Longer Contain Hardcoded Secrets

**Procedure:**
```bash
# 1. Check that config.js has no credentials
cat config.js | grep -i "supabase_url\|anon_key"

# 2. Check that .env has no credentials
cat .env | grep -i "supabase\|anon"

# 3. Verify examples exist
ls -la config.js.example .env.example
```

**Expected:**
- ❌ No SUPABASE_URL in config.js
- ❌ No anon key in config.js
- ❌ No SUPABASE in .env
- ✅ `.env.example` exists and is readable
- ✅ `config.js.example` exists and is readable

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 2: Git History Doesn't Expose New Keys

**Procedure:**
```bash
# Check history for hardcoded secrets
git log --all --oneline | head -20

# Search recent commits for secrets (should find NONE after this patch)
git log -p --all -S "eyJhbGciOi" | head -50
```

**Expected:**
- ❌ No JWT tokens in recent commits
- ❌ No project IDs in config.js commits (after today)

**Result:** [ ] PASS [ ] FAIL  
**Note:** Old commits still have secrets; need `git-filter-repo` to scrub history (see KEY_ROTATION_URGENT.md)

---

## Part 2: Admin Auth (Supabase Auth) Validation

### Setup: Create Test Admin Account

1. Go to https://app.supabase.com
2. Project: bhunptoiypamybwgpfoz
3. Authentication → Users → "Add user"
4. Email: `test-admin@saxvik-hub.local`
5. Password: `SecureTest123!@#` (pick your own)
6. Click "Create user"

**Note:** Email does NOT need to be verified; can login immediately.

---

### ✅ Test 3: Login Page Loads Without Errors

**Procedure:**
1. Open `http://localhost:5500/admin/login.html` (or your Live Server URL)
2. Open DevTools (F12)
3. Check Console tab

**Expected:**
- ✅ No red errors in console
- ✅ "E-post" label visible (not "Brukernavn")
- ✅ Email input type="email" (mobile keyboard shows @)
- ✅ Password input type="password"
- ✅ "Logg inn" button visible
- ✅ Console shows: `[ADMIN AUTH] User has valid session: ...` OR `[ADMIN AUTH] No valid session found`

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 4: Invalid Credentials Are Rejected

**Procedure:**
1. On login page, enter:
   - Email: `test-admin@saxvik-hub.local`
   - Password: `WrongPassword123`
2. Click "Logg inn"
3. Observe message

**Expected:**
- ❌ Should NOT redirect to dashboard
- ✅ Error message: "❌ Invalid login credentials"
- ✅ Console shows: `[ADMIN AUTH] Sign in failed: Invalid login credentials`
- ✅ Form still visible; can retry

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 5: Valid Credentials Succeed

**Procedure:**
1. On login page, enter:
   - Email: `test-admin@saxvik-hub.local`
   - Password: `SecureTest123!@#` (correct password)
2. Click "Logg inn"
3. Observe

**Expected:**
- ✅ Message shows: "✅ Innlogging vellykket!"
- ✅ After ~1 second, redirect to `./dashboard.html`
- ✅ Console shows: `[ADMIN AUTH] Signed in: test-admin@saxvik-hub.local`

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 6: Dashboard Verifies Session on Load

**Procedure:**
1. (After successful login) You should now be on dashboard.html
2. Refresh the page (F5)
3. Check Console

**Expected:**
- ✅ Dashboard stays visible (no redirect)
- ✅ Console shows: `[ADMIN AUTH] User authenticated: test-admin@saxvik-hub.local`
- ✅ "Logg ut" button visible in top-right
- ✅ Admin panels (Reklame, Playlist, etc.) visible

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 7: Logout Clears Session

**Procedure:**
1. On dashboard.html, click "Logg ut" button (top-right)
2. Observe

**Expected:**
- ✅ Redirect to login.html
- ✅ Console shows: `[ADMIN AUTH] Signed out`
- ✅ Form is empty (cleared)

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 8: Direct Dashboard Access Without Login Redirects

**Procedure:**
1. Clear all storage: DevTools → Application → Storage → Clear All
2. Open new tab
3. Navigate to `http://localhost:5500/admin/dashboard.html` directly
4. Observe

**Expected:**
- ❌ Dashboard should NOT load
- ✅ Should redirect to login.html
- ✅ Console shows: `[ADMIN AUTH] No valid session found, redirecting to login`

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 9: Session Persists Across Page Reloads

**Procedure:**
1. Login successfully (Test 5)
2. Open DevTools → Network tab
3. Refresh dashboard 3 times
4. Observe network requests

**Expected:**
- ✅ Each refresh, dashboard loads (no redirect to login)
- ✅ No 401 Unauthorized errors
- ✅ Console shows auth check succeeds each time

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 10: Session Token Is Not Stored in localStorage (Malicious Prevention)

**Procedure:**
1. (After login) Open DevTools → Application → Storage → LocalStorage
2. Check what's stored

**Expected:**
- ❌ NO `sx_auth` key (OLD mock auth)
- ❌ NO plain-text email/password
- ✅ Supabase SDK stores token in sessionStorage/secured storage
  - You may see `sb-xxx-auth-token` (Supabase's encrypted session)
  - NOT user-readable/forgeable

**Result:** [ ] PASS [ ] FAIL  
**Note:** This is a security test; attackers can no longer just set localStorage.sx_auth = true

---

## Part 3: Account Creation Flow (Optional)

### ✅ Test 11: New Account Creation via Login (Optional)

**Procedure:**
1. Open login page
2. Enter NEW email (e.g., `brand-new-admin@example.com`)
3. Enter password (e.g., `NewPassword123!@#`)
4. Click "Logg inn"
5. Should see: "❌ Invalid login credentials" + "Opprett ny?" option
6. Click "Logg inn" button again (submit form)
7. Should create account and auto-login

**Expected:**
- ✅ Message: "❌ Invalid login credentials" (first attempt)
- ✅ Message: "✅ Konto opprettet og du er logget inn!" (second attempt)
- ✅ Redirect to dashboard
- ✅ Console shows: `[ADMIN AUTH] Signed up and logged in: brand-new-admin@example.com`

**Result:** [ ] PASS [ ] FAIL  
**Note:** This is nice-to-have; can disable if you prefer manual account creation in Supabase console

---

## Part 4: Configuration & Secrets

### ✅ Test 12: config.local.js Is Git-Ignored

**Procedure:**
```bash
# Check .gitignore
grep "config.local.js" .gitignore

# Verify file is not tracked
git status config.local.js 2>&1 | grep "not a git repository\|nothing to commit\|fatal"
```

**Expected:**
- ✅ `.gitignore` contains `config.local.js`
- ✅ `git status` does NOT list config.local.js (it's ignored)

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 13: .env.local Is Git-Ignored (saxvik-hub Next.js)

**Procedure:**
```bash
cd saxvik-hub

# Check .gitignore
grep ".env.local" .gitignore

# Verify file is not tracked
git status .env.local 2>&1
```

**Expected:**
- ✅ `.gitignore` contains `.env.local` (or `.env.*`)
- ✅ `.env.local` not listed in `git status`

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 14: KEY_ROTATION_URGENT.md Exists & Is Readable

**Procedure:**
```bash
cat KEY_ROTATION_URGENT.md | head -30
```

**Expected:**
- ✅ File exists
- ✅ Contains instructions for key rotation
- ✅ Includes warning about exposed key in git history
- ✅ Provides remediation steps

**Result:** [ ] PASS [ ] FAIL

---

### ✅ Test 15: AUTH_MIGRATION_GUIDE.md Exists

**Procedure:**
```bash
cat admin/AUTH_MIGRATION_GUIDE.md | head -30
```

**Expected:**
- ✅ File explains old vs new auth
- ✅ Contains setup instructions
- ✅ Includes test scenarios
- ✅ Has rollback plan

**Result:** [ ] PASS [ ] FAIL

---

## Part 5: Player (app.js) - Regression Tests

### ✅ Test 16: Player Still Works (Basic Flow)

**Procedure:**
1. Open `http://localhost:5500/index.html`
2. Wait 10 seconds on idle screen
3. Ads should auto-play

**Expected:**
- ✅ Idle screen shows
- ✅ After 10s, ads start playing (or ads list appears)
- ✅ No console errors
- ✅ Tap on screen stops ads, returns to idle
- ✅ Countdown restarts automatically

**Result:** [ ] PASS [ ] FAIL  
**Note:** This confirms app.js was NOT inadvertently broken by auth changes

---

### ✅ Test 17: Admin Panel Links (Secret Access)

**Procedure:**
1. On player (index.html), press Shift+D for 2 seconds
2. Should see debug panel appear

**Expected:**
- ✅ Debug panel visible with hotspot editor
- ✅ No auth required (debug is local-only)
- ✅ Admin link still accessible

**Result:** [ ] PASS [ ] FAIL

---

## Summary Table

| Test # | Name | Result | Notes |
|--------|------|--------|-------|
| 1 | Secrets removed from config files | [ ] | See KEY_ROTATION_URGENT.md for history cleanup |
| 2 | Git history check | [ ] | Old commits still have secrets; requires git-filter-repo |
| 3 | Login page loads | [ ] | Check console for errors |
| 4 | Invalid credentials rejected | [ ] | Should show error, not redirect |
| 5 | Valid credentials succeed | [ ] | Should redirect to dashboard |
| 6 | Dashboard verifies session | [ ] | Refresh should maintain login |
| 7 | Logout works | [ ] | Should redirect to login |
| 8 | Direct dashboard access denied | [ ] | Should redirect to login |
| 9 | Session persists |[ ] | Multiple reloads should work |
| 10 | Token not in localStorage | [ ] | Security test; no sx_auth key |
| 11 | Account creation (optional) | [ ] | Only if auto-signup enabled |
| 12 | config.local.js ignored | [ ] | Git ignore rule working |
| 13 | .env.local ignored | [ ] | Git ignore rule working |
| 14-15 | Documentation exists | [ ] | Migration guides present |
| 16-17 | Player regression test | [ ] | app.js not broken by changes |

---

## Checklist Before Committing

- [ ] All tests 1-10 passed (critical path)
- [ ] All tests 12-13 passed (secrets isolation)
- [ ] Tests 16-17 passed (no player regression)
- [ ] Reviewed KEY_ROTATION_URGENT.md
- [ ] Key rotated in Supabase console (if deploying to prod)
- [ ] config.local.js created with YOUR credentials
- [ ] .env.local created with YOUR credentials
- [ ] No credentials visible in `git status`
- [ ] Reviewed git diff before committing

---

## Deployment Checklist

**Before pushing to GitHub:**
- [ ] Confirm no secrets in git status
- [ ] Run: `git diff --cached | grep -i "supabase\|password\|key"` → No matches
- [ ] Confirm config.js.example and .env.example exist
- [ ] Commit message includes: "chore: secure admin auth + remove hardcoded secrets"

**After pushing (and before going live):**
- [ ] Rotate old anon key in Supabase console
- [ ] Update GitHub/Vercel secrets with NEW anon key
- [ ] Test login on staging
- [ ] Notify team of auth changes

---

**Test Date:** ___________  
**Tester:** ___________  
**Status:** ⏳ In Progress | ✅ Complete | ❌ Failed  
**Sign-off:** ___________
