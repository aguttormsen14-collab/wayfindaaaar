# IMMEDIATE ACTION ITEMS — Security Hardening Phase 1–2

**Last Updated:** March 2, 2026  
**Status:** READY FOR DEPLOYMENT (pending testing)

---

## 🔴 BLOCKING (Do This First)

### [ ] 1. Create Test Admin Account in Supabase

**Time:** 5 min  
**Who:** You (or whoever has Supabase project access)

**Steps:**
1. Open https://app.supabase.com
2. Select project **bhunptoiypamybwgpfoz**
3. Go to **Authentication** → **Users**
4. Click **"Add user"**
5. Email: `testadmin@example.com` (or your choice)
6. Password: `SecureTestPassword123!` (or your choice)
7. Click **"Create user"**
8. **Save this email + password** (you'll need it to test login)

**Verify:** User appears in Users list with email visible

---

### [ ] 2. Set Up Local config.local.js

**Time:** 5 min  
**Where:** Project root

**Steps:**
1. Copy `config.js.example` to `config.local.js`
2. Open `config.local.js` in editor
3. Find your Supabase credentials:
   - Go to https://app.supabase.com → project bhunptoiypamybwgpfoz
   - Settings → **API**
   - Copy **Project URL** (https://bhunptoiypamybwgpfoz.supabase.co)
   - Copy **anon (public) key** (the NEW key after rotation)
4. Paste into `config.local.js`:
   ```javascript
   window.SUPABASE_URL = "https://bhunptoiypamybwgpfoz.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGci..."; // Paste actual key here
   ```
5. **DO NOT commit this file** (it's .gitignore'd locally)

**Verify:** File exists locally but not in git

```bash
git status | grep config.local.js  # Should be: "not tracked"
```

---

### [ ] 3. Run 17 Test Cases

**Time:** 30 min  
**Reference:** `TEST_PLAN_SECURITY_HARDENING.md`

**Quick summary:**
- Tests 1–3: Verify secrets removed from git
- Tests 4–10: Verify login/logout/session works
- Tests 12–13: Verify .env.local + config.local.js are ignored
- Tests 16–17: Verify player still works

**How to run:**
1. Start local dev server (index.html → admin/login.html path accessible)
2. Open http://localhost:5500/admin/login.html
3. Follow test steps in `TEST_PLAN_SECURITY_HARDENING.md`
4. Check boxes: ✅ (pass) or ❌ (fail)

**Expected result:** All 17 green checkmarks

---

### [ ] 4. Rotate Supabase Keys (Mandatory)

**Time:** 5 min  
**Reference:** `KEY_ROTATION_URGENT.md`

**Why:** Old key exposed in git history (even though config.js now empty)

**Steps:**
1. Go to https://app.supabase.com → project bhunptoiypamybwgpfoz
2. Settings → **API**
3. Find "anon (public)" row
4. Click **"Rotate"** button
5. Click **"Rotate anon key"** in confirmation dialog
6. New key generated instantly
7. Copy new key
8. Update `config.local.js` with new key
9. Update deploy secrets (GitHub/Vercel) with new key

**Verify:** Old key revoked, new key active

```bash
# In config.local.js, the key should be different from the exposed one
cat config.local.js | grep SUPABASE_ANON_KEY
```

---

## 🟡 HIGH PRIORITY (After Blocking Done)

### [ ] 5. Commit All Changes to Git

**Time:** 5 min

**Steps:**
```bash
# Verify: No secrets in staging
git status  # Should show new files + modified files, NO .env or config files with secrets

# Review changes
git diff HEAD -- config.js
git diff HEAD -- admin/login.js
git diff HEAD -- admin/dashboard.js

# Stage all
git add .

# Commit message (required)
git commit -m "chore: secure admin auth + remove hardcoded secrets

- Remove Supabase credentials from config.js + .env
- Replace mock admin login (test/1234) with Supabase Auth
- Add session validation on dashboard (async auth check)
- Create config.js.example + .env.example templates
- Expand .gitignore to prevent future secrets leaks
- Add comprehensive key rotation guide + test plan

BREAKING: Admin login now requires Supabase auth
REQUIRES: config.local.js with Supabase credentials + test account

Refs: KEY_ROTATION_URGENT.md, auth_MIGRATION_GUIDE.md, TEST_PLAN.md"

# Push (only after tests pass!)
git push origin main
```

**Verify:** Commit appears in git log without secrets

```bash
git show HEAD | grep SUPABASE_ANON_KEY  # Should show NOTHING or "removed"
```

---

### [ ] 6. Update Deploy Environment Secrets

**Time:** 10 min  
**Where:** GitHub or Vercel (depending on your setup)

**For GitHub Actions:**
1. Go to your GitHub repo
2. Settings → **Secrets and variables** → **Actions**
3. Create new secrets:
   - `SUPABASE_URL`: Paste your URL
   - `SUPABASE_ANON_KEY`: Paste NEW rotated key
4. Any existing old secrets: **DELETE** them

**For Vercel (if using saxvik-hub Next.js):**
1. Go to Vercel dashboard
2. Select project
3. Settings → **Environment Variables**
4. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`: Paste your URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Paste NEW rotated key
5. Delete old variables

**Verify:** Test environment can access Supabase

---

## 🟢 NICE TO HAVE (After Deploy)

### [ ] 7. Clean Git History (Optional But Recommended)

**Time:** 15 min (if you do this)  
**Reference:** `KEY_ROTATION_URGENT.md` → Git Cleanup Section

**Why:** Old key still in git history (even though revoked in Supabase)

**Tool:** `git-filter-repo` (recommended over `git-filter-branch`)

**Steps (if you do this):**
```bash
# Install git-filter-repo (one-time)
pip install git-filter-repo

# Remove old key from history
git filter-repo --replace-text replacements.txt --force

# Verify
git log --all -- config.js | grep SUPABASE_ANON_KEY  # Should be empty now

# Force push (careful!)
git push origin --force-with-lease main
```

**Warning:** Force-push affects all collaborators; coordinate with team

**Safe option:** Skip this; key is already rotated in Supabase (safest approach)

---

## 📋 CHECKLIST

Print this out and check off as you go:

```
🔴 BLOCKING:
  [ ] Test admin account created in Supabase
  [ ] config.local.js set up with real credentials
  [ ] All 17 tests passing locally
  [ ] Supabase keys rotated (old key revoked)

🟡 HIGH PRIORITY:
  [ ] Changes committed to git
  [ ] Deploy environment secrets updated
  [ ] Staging/production can access Supabase

🟢 NICE TO HAVE:
  [ ] Git history cleaned (optional)

✅ DONE:
  [ ] Team notified: auth now real (test account: testadmin@example.com)
  [ ] Documentation reviewed (AUTH_MIGRATION_GUIDE.md, TEST_PLAN.md)
  [ ] Rollback plan saved somewhere safe
```

---

## Questions During Rollout?

1. **"Login not working"** → See `admin/AUTH_MIGRATION_GUIDE.md` → FAQ
2. **"How to test?"** → See `TEST_PLAN_SECURITY_HARDENING.md`
3. **"What if I need to rollback?"** → See `admin/AUTH_MIGRATION_GUIDE.md` → Rollback Plan
4. **"Old key still usable?"** → See `KEY_ROTATION_URGENT.md` → Key has been rotated, old one dead

---

## Timeline

| Task | Duration | Blocker? |
|------|----------|----------|
| Create test account | 5 min | ✅ Yes |
| Set up config.local.js | 5 min | ✅ Yes |
| Run 17 tests | 30 min | ✅ Yes |
| Rotate keys | 5 min | ✅ Yes |
| Git commit | 5 min | Depends on tests |
| Deploy secrets | 10 min | After commit |
| Git cleanup | 15 min | Optional |
| **TOTAL** | **~75 min** | **~50 min critical** |

---

## Success = All Boxes Checked ✅

When done, you'll have:
- ✅ Real Supabase Auth (not fake admin panel)
- ✅ Session validation on every dashboard load
- ✅ No hardcoded secrets in production
- ✅ Keys rotated (old one revoked)
- ✅ Proper .gitignore (prevents future leaks)
- ✅ Comprehensive documentation for onboarding

**Then:** You can close Phase 1–2 and start Phase 3 (app.js modularization) after pilot.

---

**Start with blocking items. Go. 🚀**
