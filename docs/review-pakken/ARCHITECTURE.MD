# Architecture Overview

## Runtime-modell

Player kjører som én statisk webapp.

State-model (forenklet):

Screens:
- idle
- menu
- floors
- map1
- tech_map1
- ads (overlay)

Ads er overlay over idle.
Ads må aldri starte hvis currentScreen !== "idle".

## Timer-logikk

To hovedtimere:
- idleTimer → return to idle
- idleToAdsTimer → start ads

Disse må være deterministiske.
Race conditions har tidligere vært et problem.

## Supabase

Brukes til:
- Storage (media)
- playlist.json
- settings.json

Supabase client ligger på window.supabase (singleton).

Må ikke brukes før initialisert.

## Install-modell

Hver kunde identifiseres av installSlug.
Eksempel:
installs/amfi-steinkjer/assets/ads/

Plan:
Senere migrere konfigurasjon fra JSON → Supabase DB.