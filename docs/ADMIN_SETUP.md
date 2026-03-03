# Admin & Ads Setup Guide

## 🔧 Supabase Configuration

### Step 1: Hent dine Supabase credententials

1. Gå til https://supabase.com/dashboard
2. Velg ditt prosjekt
3. Gå til **Settings** > **API**
4. Kopier:
   - **Project URL** (hele URLen)
   - **anon public** key (under "Project API keys")

### Step 2: Fyll inn `config.local.js`

Åpne `config.local.js` i rotmappen og bytt:

```javascript
window.SUPABASE_URL = "https://your-project.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
window.SUPABASE_BUCKET = "saxvik-hub";
window.DEFAULT_INSTALL_SLUG = "amfi-steinkjer";
```

**OBS:** `config.local.js` er `.gitignore`d – den ligger aldri i git! 🔐

### Step 3: Hent logoen

Plasser `saxvik-hub-logo.png` (eller SVG) i `assets/brand/` mappen.

**Lokalt:** Du kan kopiere fra en faktisk logofile hvis du har den.
**Demo:** Vi har en SVG-placeholder der nå.

---

## 🎬 Admin Dashboard

**URL:** `http://localhost:5500/admin/dashboard.html` (lokalt)

### Login
- **Brukernavn:** `test`
- **Passord:** `1234`

### Reklame-kort
1. **Dropzone:** Dra filer (jpg, png, webp, mp4) inn i boksen
2. **Alternativt:** Klikk på boksen for filvelger
3. **Automatisk upload:** Filene lastes opp til `installs/amfi-steinkjer/assets/ads/`

### Actions per fil
- **📋 Kopier:** Kopier offentlig URL til clipboard
- **🔗 Åpne:** Åpne fil i ny fane
- **🗑️ Slett:** Slett fra storage (etter 📊 Refresh må du klikke)
- **🔄 Refresh:** Oppdater listen

### Status-kort
Viser:
- ✅/❌ Supabase tilkoblet status
- Aktiv installasjon (amfi-steinkjer)
- Når info sist ble oppdatert

---

## 📺 Player Integration

Ads blir automatisk hentet fra Supabase hvert minutt. Når du loader opp nye filer i admin:

1. Venter ca. 2 minutter eller trykk "Reload Campaign" i debug-panelet
2. Player avspiller alle filer fra `installs/amfi-steinkjer/assets/ads/` i alfabetisk rekkefølge
3. Bilder vises i 8 sekunder, video spilles til slutt

---

## 🐛 Debugging

### Åpne admin-panelet på player:
- Press **Shift + D** i 2 sekunder
- Klikk "Reload Campaign" for å refresh ad-listen manually
- Klikk "Toggle Debug" for å se hotspot-redigering

### Browser console:
- Åpne **F12**
- Se loggmeldinger hvis noe feiler
- Sjekk at `window.isSupabaseConfigured()` returner `true`

---

## 📂 Filstruktur

```
.
├── config.local.js              ← LOKAL CONFIG (not in git)
├── supabase-config.js           ← CONFIG HELPERS
├── index.html                   ← Player
├── app.js                       ← Player app
├── admin/
│   ├── login.html              ← Login side
│   ├── login.js                ← Login logics
│   ├── login.css               ← Login styles
│   ├── dashboard.html          ← Admin dashboard
│   ├── dashboard.js            ← Dashboard app
│   ├── dashboard.css           ← Dashboard styles
│   └── admin-ads.js            ← Ads management (Supabase)
├── assets/
│   ├── brand/
│   │   └── saxvik-hub-logo.png ← Logo (placeholder eller ekte)
└── installs/
    └── amfi-steinkjer/
        └── assets/
            └── ads/            ← Reklame-filer lastes her
```

---

## ✅ Sjekkliste for Setup

- [ ] `config.local.js` fyllt inn med Supabase credentials
- [ ] Supabase bucket heter `saxvik-hub`
- [ ] Mappen `installs/amfi-steinkjer/assets/ads/` eksisterer i Supabase Storage
- [ ] Logo er på plass i `assets/brand/saxvik-hub-logo.png`
- [ ] Live Server kjører fra **repo-root** (der `index.html` er)
- [ ] Admin er tilgjengelig på `/admin/login.html`

---

## 🚀 Next Steps

1. Logg inn til admin
2. Upload ein testfil (jpg/png/mp4)
3. Gå til Player og trykk **Shift+D** → "Reload Campaign"
4. Verifiser at annonsen spilles
5. **Lykke til!** 🎉
