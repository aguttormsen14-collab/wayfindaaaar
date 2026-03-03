# Security Goals – Public Deployment

## Trusselbilde

Miljø:
- Offentlig kjøpesenter
- Touchscreen tilgjengelig for alle
- Android nettbrett

Risikoer:
- Bruker forsøker å forlate app
- Bruker forsøker å åpne devtools/lenker
- Nettverk faller ut
- Supabase utilgjengelig
- Ugyldig installSlug manipulert i URL
- Ondsinnet JSON i playlist/settings

## Sikkerhetsmål

1. Ingen navigasjonsflukt
2. Ingen blank screen
3. Defensive async-calls (try/catch)
4. Ingen uvaliderte brukerdata inn i DOM
5. installSlug valideres
6. Playlist valideres (filtyper + varighet)
7. Ingen hemmelige nøkler i frontend

## Ikke mål (enda)

- Full enterprise RLS
- Komplett audit-logg
- Multi-role system

Dette kan komme i SaaS-fase.