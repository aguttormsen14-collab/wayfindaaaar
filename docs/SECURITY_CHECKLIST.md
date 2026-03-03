# Security Checklist – Saxvik Hub Kiosk

**Last Updated:** February 2026  
**Deployment Context:** Public shopping center kiosk (Android tablets, Chrome browser)

---

## Current Protections (Implemented)

### ✅ Player Hardening (app.js)

- **Context menu & text selection prevention**
  - Right-click, long-press menus blocked
  - Text selection disabled (preventing information leakage)
  - Drag operations prevented

- **Navigation lockdown**
  - `window.open()` overridden → returns null
  - External anchor clicks (`<a href>`) intercepted and blocked
  - Accidental deep-linking prevented

- **Visibility & tab handling**
  - Video pauses safely on `visibilitychange` hidden
  - Resumes without auto-starting ads on tab return
  - State machine remains intact (idleToAdsTimer not affected)

- **Fullscreen management**
  - Single fullscreen attempt on idle (demoFullscreenArmed flag)
  - If fullscreen exits on idle, re-enters after 1s
  - Cannot escape fullscreen via menu/map screens

- **Error resilience**
  - Global `error` handler catches unhandled JS errors
  - Global `unhandledrejection` handler catches promise failures
  - Recovery path: both return to idle screen safely (stop ads, clear artifacts)
  - Debug logging only if `DEBUG === true` (no secrets leaked)

- **Input validation**
  - `installSlug` validated on init: `/^[a-z0-9-]{2,40}$/` regex match
  - Invalid installSlug → fallback to safe default `amfi-steinkjer`
  - Playlist JSON schema-lite validation:
    - Each item must have `file` (string), `duration` (3000–120000 ms)
    - Invalid items silently ignored (no crash, no blank ads)
  - Settings JSON validated before loading (must be object with expected fields)

- **Supabase initialization guards**
  - `getSupabase()` returns null if client not ready
  - All storage calls wrapped in `if (!getSupabase()) return;`
  - Never calls storage methods until fully initialized
  - No credentials stored in client (uses public anon key only)

### ✅ CSS Hardening (styles.css)

- **Touch & zoom prevention**
  - `touch-action: manipulation` on html/body
  - `overscroll-behavior: none` blocks bounce scroll
  - Double-tap zoom disabled
  - `-webkit-user-select: none` applied globally

- **Interaction blocking**
  - User drag disabled (`-webkit-user-drag: none`)
  - Long-press callout hidden (`-webkit-touch-callout: none`)
  - Tap highlight removed (`-webkit-tap-highlight-color: transparent`)

- **Layout locks**
  - body: `position: fixed`, `width: 100%`, `height: 100%`
  - Prevents accidental scrolling or overflow artifacts
  - `max-height: 100vh` ensures no viewport escape

### ✅ Admin Panel Hardening (admin/)

- **File upload validation** (client-side)
  - Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.mp4`
  - File size cap: 25 MB per file
  - Unsupported types silently skipped (no error popups)

- **Installslug validation in admin**
  - `buildAdsPrefix()` uses `cfg.installSlug` safely
  - Path traversal prevented (no `../` or absolute paths in file uploads)

- **DOM XSS prevention**
  - File names escaped before inserting into HTML
  - Playlist item names sanitized
  - Settings text values escaped

- **Session/auth stubs**
  - Admin login exists (basic auth placeholder)
  - Currently no deep session validation (role-gating stub only)
  - Safe to add RLS later without refactoring

---

## Current Limitations (Not Protected Yet)

### ⚠️ Supabase Storage Bucket Security

**Issue:** If Storage bucket is public (anyone can list/download), then:
- Any unauthenticated user can read all ads, playlists, and settings
- Any unauthenticated user can upload files to the bucket
- No audit trail of who changed what

**Why not fixed yet:**
- Requires backend RLS policies (not implemented)
- Requires auth backend or OAuth (out of scope for this phase)
- Kiosk player uses public anon key (safe for reads if policy is locked)

### ⚠️ Secrets Management

**Current state:**
- Supabase URL & anon key are in `config.js` (client-side)
- Admin users must have access to dashboard.html (browser inspection → sees URLs)
- No service key stored (✓ good)

**Risk:** Low (anon key has limited permissions anyway), but:
- URL exposure could show infrastructure details
- Consider using env variables + Netlify/Vercel secrets in future

### ⚠️ HTTPS / Man-in-the-Middle

**Current state:**
- GitHub Pages enforces HTTPS (✓ good)
- Supabase API calls over HTTPS (✓ good)
- Media (ads/images) served over HTTPS (✓ good)

**Not protected:**
- If deployed to self-hosted server without HTTPS → credentials at risk
- Recommend: Always use HTTPS in production

### ⚠️ Admin Authentication

**Current state:**
- Basic login screen exists (`admin/login.html`)
- No backend validation (localStorage-only placeholder)
- Cannot prevent unauthorized access from browser dev tools

### ⚠️ Rate Limiting & DDoS

**Current state:**
- No rate limits on Supabase Storage calls
- Ads polling every 15s (low volume)
- Could theoretically spam Supabase API if JavaScript modified

---

## Next Steps for Production Hardening

### Phase 1: Storage RLS (Required for multi-customer)

1. **Add Row Level Security policies** to Supabase Storage:

```sql
-- Concept: Only authenticated users with correct installSlug can read/write

create policy "public_read_ads_only"
  on storage.objects
  for select
  using (bucket_id = 'kiosk-assets' AND name LIKE 'installs/%/assets/ads/%');

-- Only allow authenticated uploads to own install
create policy "authenticated_write_own_install"
  on storage.objects
  for insert
  with check (
    bucket_id = 'kiosk-assets'
    AND auth.uid() != null
    AND name LIKE 'installs/' || auth.user_metadata.install_slug || '/%'
  );
```

2. **Implement admin JWT workflow:**
   - Admin logs in via Auth backend (email + password)
   - Backend returns JWT with `install_slug` claim
   - Admin dashboard uses JWT for all Supabase calls
   - Kiosk player continues using public anon key (read-only)

### Phase 2: Input Sanitization (Recommended)

1. Upgrade playlist JSON validation to reject:
   - Giant file sizes in metadata (DoS prevention)
   - Invalid JSON structures early (fail-fast)

2. Add CSP headers (if self-hosted):
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.supabase.io; ...
   ```

### Phase 3: Audit & Logging

1. Add optional logging endpoint (security audit trail):
   - Player: errors, fullscreen exits, navigation attempts
   - Admin: file uploads, playlist edits, deletions
   - Exclude sensitive data; log user agent, timestamp, action only

2. Enable Supabase audit logs in dashboard (automatic)

### Phase 4: Deployment Hardening

1. **Network security:**
   - Deploy to CDN (Cloudflare, AWS CloudFront) for DDoS protection
   - Enable geo-blocking if customer is in specific region
   - Monitor bandwidth usage for anomalies

2. **Device management (if using MDM):**
   - Lock down Chrome/browser app (kiosk mode via Knox or similar)
   - Disable dev tools access
   - Enforce HTTPS only
   - Whitelist domains

---

## Testing Checklist

### Player (app.js) – Manual Tests on Tablet

- [ ] **Context menu blocked**: Long-press on screen → no menu appears
- [ ] **Text selection blocked**: Triple-tap → no highlight
- [ ] **Zoom prevented**: Pinch gesture → no zoom, stays 100%
- [ ] **Navigation blocked**: Tap any menu link → app doesn't leave
- [ ] **Fullscreen**: Launch app → enters fullscreen automatically
- [ ] **Fullscreen recovery**: While on idle, press back → fullscreen re-enters within 2s
- [ ] **Tab hidden**: Switch to another app, return → ads resume correctly
- [ ] **Invalid installSlug**: Use URL `?install=../../../etc/passwd` → app loads with safe default

### Admin (admin/) – Manual Tests in Desktop Browser

- [ ] **File size validation**: Try uploading 30 MB file → rejected with message
- [ ] **Extension validation**: Try uploading `.exe` file → rejected
- [ ] **Playlist save**: Edit playlist, save → file persists in Supabase Storage
- [ ] **XSS prevention**: Upload file named `<img src=x onerror=alert()>` → sanitized in HTML
- [ ] **Session**: Close browser dev tools → login still required to access admin

### Integration Tests

- [ ] Build playlist with valid items (3s, 10s, 60s duration) → ads play correctly
- [ ] Build playlist with invalid duration (2s, 121s) → items ignored silently
- [ ] Load playlist from empty Supabase → fallback to all ads works
- [ ] Supabase client fails to load → player defaults to local assets (no blank screen)

---

## Compliance Notes

### GDPR
- No personal data collected by kiosk player (✓)
- No cookies or tracking (✓)
- Admin panel: if users log in with email, must comply with GDPR (future phase)

### Data Retention
- Supabase audit logs: check retention policy in dashboard
- Media files: no automatic cleanup (customer responsibility)

---

## Questions for Internal Review

1. Should kiosk player be signed with Apple MDM for iOS tablets in future?
2. Should admin panel require 2FA or SSO (e.g., Google Workspace)?
3. Should media files be encrypted at rest in Supabase?
4. Should we implement device fingerprinting to prevent unauthorized tablets?

---

## Related Files

| File | Purpose | Security Status |
|------|---------|-----------------|
| `app.js` | Kiosk player | ✅ Hardened |
| `styles.css` | Player styling | ✅ Hardened |
| `admin/admin-ads.js` | Admin library | ✅ Client validation added |
| `admin/dashboard.html` | Admin UI | ✅ XSS prevention added |
| `admin/login.html` | Auth stub | 🔄 Placeholder only |
| `config.js` | Supabase config | ⚠️ Contains public key |
| `index.html` | Entry point | ✅ Safe |
| `sw.js` | Service worker | ✅ No caching (good) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial security hardening: content menu blocking, navigation lockdown, error resilience, input validation |
| — | — | — |
