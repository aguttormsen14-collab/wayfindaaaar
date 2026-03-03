# Environment Matrix – Wayfinding

**Formål:** Unngå forveksling mellom `staging` og `production` ved deploy, testing og drift.

## Miljøoversikt

| Felt | Staging | Production | Merknad |
|------|---------|------------|---------|
| Miljønavn | staging | production | Fast navn i dokumentasjon |
| Git branch | develop | main | Deploy-regel |
| App URL | `https://<staging-url>` | `https://<prod-url>` | Fyll inn faktiske domener |
| Admin URL | `https://<staging-url>/admin/login.html` | `https://<prod-url>/admin/login.html` | |
| Supabase Project ID | `<staging-project-id>` | `<prod-project-id>` | Ikke bland prosjekter |
| SUPABASE_URL | `<staging-supabase-url>` | `<prod-supabase-url>` | Settes som secret |
| SUPABASE_ANON_KEY | `<staging-anon-key>` | `<prod-anon-key>` | Settes som secret |
| SUPABASE_BUCKET | `saxvik-hub` | `saxvik-hub` | Samme navn er ok |
| DEFAULT_INSTALL_SLUG | `amfi-steinkjer-staging` | `amfi-steinkjer` | Viktig for data-separasjon |
| Storage root path | `installs/amfi-steinkjer-staging/` | `installs/amfi-steinkjer/` | Må være tydelig forskjellig |
| Auth users | Egne testbrukere | Ekte/live brukere | Del aldri passord |
| RLS/Policies | Staging-variant | Prod-variant | Samme policylogikk |
| Monitoring/Alerts | `<staging-kanal>` | `<prod-kanal>` | Egne varslingskanaler |
| Rollback target | Siste stabile `develop` deploy | Siste stabile `main` deploy | Dokumentér commit/tag |

---

## Required Secrets (per miljø)

### Staging
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_BUCKET`
- `DEFAULT_INSTALL_SLUG`

### Production
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_BUCKET`
- `DEFAULT_INSTALL_SLUG`

---

## Endringsregel
Oppdater denne filen når ett av disse endres:
1. Supabase-prosjekt (URL/keys)
2. Deploy-domene
3. Branch-strategi
4. Install slug / storage path
5. Policy-oppsett

---

## Pre-deploy kontroll (30 sek)
- [ ] Riktig branch til riktig miljø
- [ ] Riktige secrets i deploy-plattform
- [ ] Riktig install slug for miljø
- [ ] Riktig Supabase-prosjekt valgt
- [ ] Smoke-testliste tilgjengelig

---

## Referanser
- `docs/STAGING_MIGRATION_RUNBOOK.md`
- `docs/STRUCTURE_PLAN_2026-03.md`
