# Staging Migration Runbook – Wayfinding + Supabase

**Dato:** 2026-03-03  
**Mål:** Etablere et trygt staging-miljø uten å påvirke live-kunder.

---

## 1. Prinsipp (viktig)
Du flytter **ikke kode** til Supabase. Du gjør dette:
1. Beholder samme kodebase/repo
2. Oppretter separat Supabase-prosjekt for staging
3. Knytter staging-deploy til staging-secrets
4. Kopierer nødvendig data (Storage/Auth/ev. DB) fra prod til staging

Resultat: Samme appkode, men helt egne testdata og testbrukere.

---

## 2. Scope for dette prosjektet
Denne runbooken dekker:
- Statisk app i repo-root (`index.html`, `app.js`, `admin/*`)
- Supabase Storage (bucket: `saxvik-hub`)
- Supabase Auth (admin-brukere)
- Skjermkonfig (`installs/<slug>/config/screens.json`)
- Ads/playlist (`installs/<slug>/assets/ads/*`)

---

## 3. Forberedelser (før du begynner)

## 3.1 Definer miljønavn
- Prod: `amfi-steinkjer`
- Staging: `amfi-steinkjer-staging`

## 3.2 Opprett staging Supabase-prosjekt
- Opprett nytt prosjekt i Supabase (anbefalt separat prosjekt)
- Noter:
  - `PROJECT_URL_STAGING`
  - `ANON_KEY_STAGING`

## 3.3 Opprett bucket i staging
- Bucket navn: `saxvik-hub` (samme som prod for minst mulig kodefriksjon)
- Sett bucket access i tråd med deres policy-strategi

## 3.4 Opprett Auth-brukere i staging
- Lag minimum én admin testkonto
- Ikke gjenbruk prod-brukere/passord

---

## 4. Migrer struktur og data til staging

## 4.1 Storage-struktur som må finnes
Opprett/last opp slik at følgende finnes i staging:

```text
saxvik-hub/
└── installs/
    └── amfi-steinkjer-staging/
        ├── assets/
        │   ├── ads/
        │   │   ├── playlist.json
        │   │   └── ...mediafiler
        │   ├── screens/
        │   ├── stores/
        │   └── brand/
        └── config/
            └── screens.json
```

## 4.2 Hva du bør kopiere fra prod
- `installs/amfi-steinkjer/config/screens.json` → staging-slug
- `installs/amfi-steinkjer/assets/ads/*` (inkl. `playlist.json`) → staging-slug
- Eventuelle nødvendige assets under `screens/`, `stores/`, `brand/`

## 4.3 Databaser/tabeller (hvis i bruk)
Hvis dere bruker tabeller som f.eks. `user_roles`:
- Opprett samme schema i staging
- Legg inn testdata/roller for staging-brukere
- Verifiser tenant/install-kobling mot staging-slug

---

## 5. Policies/RLS i staging

## 5.1 Storage policies
Legg inn samme policy-logikk som prod, men rettet mot staging-path.
Eksempel (idé):
- Bucket: `saxvik-hub`
- Path: `installs/amfi-steinkjer-staging/config/screens.json`

Hvis dere bruker SQL-basert policyoppsett:
- Kjør en staging-variant av `SUPABASE_RLS_SETUP.sql`
- Bytt path fra `amfi-steinkjer` til `amfi-steinkjer-staging`

## 5.2 Verifisering
- `SELECT`, `INSERT`, `UPDATE` skal fungere for authenticated users i staging
- `Lagre nå` i dashboard skal skrive til staging-path

---

## 6. Koble kode til staging (uten kode-duplisering)

## 6.1 Deploy-prinsipp
- `develop` branch → staging URL
- `main` branch → production URL

## 6.2 Secrets per miljø
Sett separate secrets i deployplattformen:
- `SUPABASE_URL` = staging URL
- `SUPABASE_ANON_KEY` = staging anon key
- `DEFAULT_INSTALL_SLUG` = `amfi-steinkjer-staging`
- `SUPABASE_BUCKET` = `saxvik-hub`

## 6.3 Lokal test (valgfritt)
Lag lokal config som peker til staging før deploy-test.

---

## 7. Smoke-test (må passere før staging godkjennes)
Kjør i denne rekkefølgen:

1. Åpne `admin/login.html` (staging URL)
2. Logg inn med staging admin-bruker
3. Åpne `admin/dashboard.html?install=amfi-steinkjer-staging`
4. Trykk `Lagre nå` i skjermeditor
5. Dra hotspot, vent autosave (~700ms)
6. Lag pulse fra valgt hotspot
7. Last opp testfil i Reklamestyring
8. Oppdater playlist/editor
9. Verifiser at filer havner under staging-path i Storage
10. Åpne player med staging-install
11. Verifiser fallback oppførsel hvis data mangler

Godkjent = alle over grønne uten manuelle workarounds.

---

## 8. Release-flyt med staging

1. Utvikling i `feature/*`
2. PR til `develop`
3. Auto deploy til staging
4. Smoke-test + funksjonstest
5. Godkjenning
6. Merge `develop` → `main`
7. Deploy prod
8. Kort prod smoke-test

---

## 9. Rollback-plan
Hvis feil oppdages etter deploy:

1. Stopp videre endringer
2. Redeploy forrige stabile commit/tag
3. Bekreft:
   - login
   - screens save
   - ads playback
4. Logg hendelsen i release-notat
5. Feilrett i staging før nytt prod-forsøk

---

## 10. Sjekkliste (operativ)

## Oppsett
- [ ] Staging Supabase-prosjekt opprettet
- [ ] Staging bucket `saxvik-hub` opprettet
- [ ] Staging Auth-bruker(e) opprettet
- [ ] Staging slug definert (`amfi-steinkjer-staging`)

## Data
- [ ] screens.json kopiert til staging-path
- [ ] ads + playlist kopiert til staging-path
- [ ] nødvendige screen/store/brand assets kopiert

## Sikkerhet
- [ ] Storage policies lagt inn i staging
- [ ] RLS/policy verifisert med faktisk lagring
- [ ] Prod- og staging-secrets holdes adskilt

## Deploy
- [ ] `develop` peker til staging
- [ ] `main` peker til prod
- [ ] Staging smoke-test bestått

## Drift
- [ ] Rollback-prosedyre testet
- [ ] Team vet hvem som godkjenner prod-release

---

## 11. Vanlige feil og rask løsning

1. **"Lagre nå" feiler i staging**
- Sjekk policy path (ofte fortsatt prod-slug)
- Sjekk at bruker er authenticated

2. **Ingen data vises i player**
- Sjekk at assets finnes under staging-slug
- Sjekk query `?install=amfi-steinkjer-staging`

3. **Feil miljø brukes ved deploy**
- Sjekk branch-mapping (`develop` vs `main`)
- Sjekk secrets i deployplattform

4. **UI ser uendret ut**
- Hard reload (`Ctrl+F5`)
- Verifiser at riktig URL/miljø er åpnet

---

## 12. Anbefalt neste dokument
Opprett gjerne også:
- `docs/RELEASE_CHECKLIST.md` (kortversjon for hver release)
- `docs/ENV_MATRIX.md` (prod/staging variabler side om side)
