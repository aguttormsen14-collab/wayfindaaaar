# 🔑 Security Alert: Key Rotation Required

**Date:** March 2, 2026  
**Status:** URGENT – Anon key exposed in git history

---

## What Happened

The Supabase anon key was hardcoded in `config.js` and `.env` files, which are now part of the git repository history:

```
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodW5wdG9peXBhbXlid2dwZm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODkzMzMsImV4cCI6MjA4NzY2NTMzM30.nQzSxxP9MH2x5tSeA-t-ZSaYZ_OK8ni8kjvnZjdQ7Sc
Project ID: bhunptoiypamybwgpfoz
```

**Risk Level:** MEDIUM
- Anon key is read-only by design (cannot delete/modify without RLS)
- But if bucket is public, any unauthenticated user can list/read all files
- If RLS is not in place, entire Storage bucket is accessible

---

## Immediate Actions Required

### 1. Revoke Old Anon Key (Supabase Console)

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select project `bhunptoiypamybwgpfoz`
3. **Settings → API → Anon (public) key**
4. Click **"Rotate Key"** or **"Revoke"** → **"Create New Key"**
5. Copy new key
6. Update:
   - `config.local.js` (local dev)
   - Deploy secrets on GitHub/Vercel/hosting
   - **Never** commit to git again

**New key will be live in ~5 seconds.** Old key immediately becomes invalid.

### 2. Clean Git History (Optional but Recommended)

Remove the exposed key from git history using `git-filter-repo` or `BFG`:

```bash
# Install BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/
bfg --replace-text secrets.txt .  # See secrets.txt format below

# Or use git-filter-repo:
git filter-repo --replace-text secrets.txt
```

**File: `secrets.txt`**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodW5wdG9peXBhbXlid2dwZm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODkzMzMsImV4cCI6MjA4NzY2NTMzM30.nQzSxxP9MH2x5tSeA-t-ZSaYZ_OK8ni8kjvnZjdQ7Sc==>***REDACTED***
```

**Warning:** This rewrites git history. All collaborators must pull fresh clones.

---

## Going Forward

### Local Development

1. **Never** commit credentials to git
2. Use `.env.local` (git-ignored)
3. Copy from `config.js.example` or `.env.example`

### Production Deployment

**GitHub Pages** (static):
- Use GitHub Actions + Secrets to inject credentials at build time
- OR load from a secure backend at runtime

**Vercel/Next.js:**
- Use Vercel Environment Variables dashboard
- Set `NEXT_PUBLIC_SUPABASE_*` in project settings
- Vercel injects automatically at build

**Self-hosted:**
- Load credentials from environment variables
- Use `.env.production` (git-ignored, loaded from secure source)

---

## Verification Checklist

- [ ] Old anon key revoked in Supabase console
- [ ] New key copied to `config.local.js`
- [ ] New key added to deploy secrets (GitHub/Vercel/etc)
- [ ] `config.js` and `.env` now contain only templates (no real values)
- [ ] `.gitignore` includes `config.local.js` and `.env.local`
- [ ] Git history cleaned (optional but recommended)
- [ ] All developers have pulled fresh clones

---

## FAQ

**Q: Can the attacker use the old key?**  
A: No. Once rotated, the old key is immediately invalid.

**Q: Do I need to rotate the Service Key?**  
A: No. The Service Key was never exposed. Only the Anon key was at risk.

**Q: Should I notify users?**  
A: Only if RLS is not in place and the bucket was truly public. Otherwise, no user data was at risk (only internal media files).

**Q: How do I prevent this in the future?**  
A: Use a pre-commit hook to prevent secrets in git:
```bash
npm install --save-dev husky lint-staged
husky install
# Create .husky/pre-commit to run: git-secrets or similar
```

---

**Created:** 2026-03-02  
**Status:** Ready to rotate
