# SAXVIK HUB

Webbasert wayfinding + digital signage system (kiosk-first).

## Stack
- Vanilla HTML / CSS / JavaScript
- Ingen build tools
- Ingen React / npm
- GitHub Pages (static deploy fra main)
- Supabase (Storage i bruk, DB planlagt)

## Primært bruksområde
Offentlig infoskjerm i kjøpesenter (touchscreen Android nettbrett).

## Kritiske UX-regler
- Idle = idle.png
- Ingen modals
- Flow: idle → (inaktivitet) ads → (trykk) tilbake til idle
- Hvert trykk resetter ads countdown
- Ads kan kun starte når currentScreen === "idle"
- Systemet må aldri vise blank skjerm

## Struktur

Player:
- index.html
- app.js
- styles.css
- config.js
- supabase-config.js

Admin:
- /admin/

Installs:
- installs/<installSlug>/assets/

Eksempel:
installs/amfi-steinkjer/assets/ads/

## Multi-tenant modell
installSlug bestemmer hvilken kunde/installasjon som kjøres.
Media + settings lagres under:
installs/${installSlug}/assets/

## Mål
Stabil og sikker offentlig kiosk.
Skal videreutvikles til SaaS.