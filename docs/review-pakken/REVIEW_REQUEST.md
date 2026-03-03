# Code Review Request

## Hva vi ønsker

En profesjonell gjennomgang av:

1. Sikkerhet (frontend + Supabase bruk)
2. Stabilitet (state/timer race conditions)
3. Public kiosk hardening
4. Defensive coding
5. Fremtidig SaaS-beredskap

## Viktige begrensninger

- Ingen refactor til React
- Ingen build tools
- Stabilitet > arkitektonisk perfeksjon
- Må fungere på Android nettbrett i offentlig miljø

## Spesifikke spørsmål

1. Er timer/state-modellen robust?
2. Er installSlug-modellen trygg?
3. Er det åpenbare XSS-vektorer?
4. Bør Storage policies strammes inn?
5. Hvilke 3 tiltak gir størst sikkerhetsløft med minst risiko?

## Deploy-mål

Systemet skal:
- Kjøres på Android
- Kunne låses i kiosk
- Tåle nettverksbrudd
- Ikke vise blank skjerm