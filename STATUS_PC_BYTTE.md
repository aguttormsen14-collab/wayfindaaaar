# Status - Fortsett her etter PC-bytte

## 🎯 Hvor vi er nå
Du holder på med **Skjermeditor** i admin-dashboardet. Alt er kodet og klar, men Supabase Storage policies er ikke satt opp ennå.

## ✅ Hva som er ferdig
- ✅ **Dashboard design forbedret** - ingen overflow, profesjonelt layout
- ✅ **Hotspot editor** - drag/resize hotspots med autosave (700ms debounce)
- ✅ **Pulse system** - kan lage pulses som følger hotspots
- ✅ **Autosave til Supabase Storage** - kode er klar i dashboard.js
- ✅ **Fallback system** - laster fra Storage, faller tilbake til lokal screens.json

## 🚧 Hva som mangler (BLOKKERER LAGRING)
**Supabase Storage Policy** må settes opp før "Lagre nå" knappen fungerer.

### Siste problem:
Fikk feil ved å lage policy i Supabase UI:
```
ERROR: syntax error at or near "with"
LINE 7: with check ((bucket_id = 'saxvik-hub'name starts with...
```

## 🔧 Løsning (gjør dette neste)

### Metode 1: Tillat alt midlertidig (raskeste)
1. Gå til **Supabase Dashboard** → ditt prosjekt
2. **Storage** → **saxvik-hub** bucket → **Policies** tab
3. Klikk **"Allow all"** (gul/rød varsel øverst)
4. Velg **"Authenticated users"**
5. Klikk **"Save"** eller **"Allow"**
6. Test dashboard → klikk **"Lagre nå"**

### Metode 2: Riktig policy (sikrere)
1. **Storage** → **saxvik-hub** → **Policies** → **"New Policy"**
2. Velg template: **"Allow one user to access their own data"**
3. Eller bruk **Custom policy** med:
   ```sql
   bucket_id = 'saxvik-hub' 
   AND name ILIKE 'installs/amfi-steinkjer/%'
   ```
4. Gjenta for SELECT, INSERT, UPDATE operations

## 📂 Viktige filer
- **Dashboard:** `admin/dashboard.html` + `dashboard.css` + `dashboard.js`
- **Player:** `app.js` (har også autosave-kode)
- **Config:** `installs/amfi-steinkjer/config/screens.json` (lokal seed)
- **Setup filer:**
  - `SUPABASE_RLS_SETUP.sql` (UI-instruksjoner)
  - `DASHBOARD_IMPROVEMENTS.md` (detaljert guide)

## 🧪 Testing når Storage fungerer
1. Åpne `admin/dashboard.html` i browser
2. Velg en screen i dropdown
3. Klikk **"Lagre nå"** → skal vise "✅ Lagret til screens.json"
4. Dra en hotspot → autosave etter 700ms
5. Klikk hotspot (blir blå)
6. Klikk **"Pulse fra valgt hotspot"** → cyan dot vises
7. Dra hotspot → pulse følger automatisk
8. Dra pulse manuelt → link brytes, pulse blir fri

## 📊 Supabase Storage struktur
```
saxvik-hub (bucket)
└── installs/
    └── amfi-steinkjer/
        └── config/
            └── screens.json  ← Her lagres all data
```

## 🔑 Viktig kode-info

### Dashboard autosave
```javascript
// i dashboard.js
screenEditorState.autosaveTimer = setTimeout(() => {
  saveScreensConfigToSupabase();
}, 700);
```

### Supabase client (dashboard)
```javascript
const supabase = window.supabase.createClient(
  window.getSupabaseConfig().url, 
  window.getSupabaseConfig().key
);
```

### Storage path
```javascript
const path = `installs/${INSTALL_ID}/config/screens.json`;
```

## ⚡ Quick commands for testing
**Browser console (F12):**
```javascript
// Sjekk kilde (Storage eller local)
__kiosk.getScreensConfigSource()

// Manuell lagring
__kiosk.saveScreensConfigToSupabase()

// Se current config
SCREENS
```

## 🎬 Neste steg (i rekkefølge)
1. ✅ Åpne Supabase Dashboard
2. ⏳ Sett opp Storage policy (Metode 1 eller 2 over)
3. ⏳ Test "Lagre nå" i dashboard
4. ⏳ Test hotspot drag + autosave
5. ⏳ Test pulse creation + linking

## 💡 Hvis det fortsatt ikke fungerer
- Sjekk browser Console (F12) for error messages
- Sjekk Network tab → se Supabase API calls
- Verifiser at du er logget inn (admin-auth-supabase.js)
- Sjekk at `supabase-config.js` er lastet

God tur! 🚀
