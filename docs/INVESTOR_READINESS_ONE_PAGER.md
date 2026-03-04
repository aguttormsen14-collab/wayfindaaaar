# Investor Readiness – One Pager

**Dato:** 4. mars 2026  
**Produkt:** Wayfinding + reklameplattform for kiosker (multi-install setup)  
**Målgruppe:** Investor / mentor / pilotpartner

---

## 1) Executive Snapshot

Plattformen er **klar for investor-/mentor-demo nå** og egnet for **kontrollert pilot** med begrenset antall lokasjoner.

- **Demo-ready:** Ja
- **Pilot-ready (begrenset):** Ja, med manuell oppfølging
- **Scale-ready (større utrulling):** Ikke helt ennå

Kjernen fungerer: interaktiv wayfinding, popup-editor, reklamestyring, spillelisteflyt, adminpanel og install-spesifikk konfigurasjon via Supabase Storage.

---

## 2) Hva som allerede er på plass

### Produkt og brukeropplevelse
- Stabil spillerflyt mellom idle, kart, popup og reklame.
- Adminpanel med reell verdileveranse: opplasting/sletting av assets, spilleliste, værinnstillinger, wayfinder-konfig.
- Demo-/presentasjonsfunksjoner (f.eks. rute-demo) for salgsmøter.

### Teknisk fundament
- Installasjonsbasert mappestruktur (`installs/{slug}/...`) som skalerer konseptuelt til flere kunder.
- Supabase-integrasjon for auth/storage med robust klienthåndtering i frontend.
- Flere konkrete hardening-tiltak allerede implementert (kiosk-lockdown, inputvalidering, XSS-sikring i adminrendring).

### Leveranseevne
- Rask iterasjon med verifiserte forbedringer i produksjonsnære flows.
- Dokumentasjon for sikkerhet, test og oppsett eksisterer og kan vises ved due diligence-light.

---

## 3) Åpne gap før større kommersiell utrulling

Disse punktene bør kommuniseres ærlig som "neste fase":

1. **RLS ferdigstilles bredt**
   - Policyer må dekke alle relevante paths/actions per install/tenant.
2. **Nøkkelrotasjon fullføres**
   - Offentlig nøkkelhistorikk og rutine for videre rotasjon må lukkes.
3. **Publish/rollback-prosess**
   - Snapshot + trygg rollback bør være standard før bred pilot.
4. **Observability/ops-basics**
   - Sentral feilsporing og enkel install-statusdashboard.
5. **Miljøseparasjon**
   - Strammere dev/staging/prod-disciplin for tryggere releases.

---

## 4) Risiko- og modenhetsvurdering (for møtebruk)

- **Produkt-risiko:** Lav–moderat (verdiforslaget er tydelig demonstrerbart).
- **Operasjonell risiko:** Moderat (mangler noen guardrails for rask skalering).
- **Sikkerhetsrisiko:** Moderat uten komplett RLS/rotasjon; håndterbar med planlagt tiltakspakke.

**Foreslått formulering i møte:**
> "Vi er forbi prototypefasen og kan demonstrere reell kundeverdi i pilot nå. Neste 30–60 dager handler primært om operasjonell skalering og sikkerhetsguardrails, ikke om å bevise kjerneproduktet." 

---

## 5) 30–60 dagers handlingsplan

### Neste 30 dager (must-have)
- Fullføre RLS for lagringsobjekter per install.
- Roterte nøkler verifisert i alle miljøer.
- Innføre enkel publish + rollback (manuell/semiautomatisk er OK i første steg).
- Definere en kort release-sjekkliste før deploy.

### Dag 31–60 (scale prep)
- Sentral feillogging (f.eks. Sentry) og alarm på kritiske feil.
- Bedre miljøseparasjon + staging-rutine.
- Minimum smoke-testpakke for kritiske flyter (login, publish, player-load, ads/playlist).

---

## 6) Konklusjon

Ja, løsningen er **godt egnet for investor-/mentor-visning nå**.

Det riktige budskapet er:
- **Kjerneproduktet fungerer og leverer verdi i dag.**
- **Skaleringslaget er identifisert, avgrenset og planlagt.**

Dette gir en sterk og troverdig "build + de-risk"-fortelling i tidlig kommersiell fase.
