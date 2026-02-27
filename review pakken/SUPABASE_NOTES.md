# Supabase Notes

Storage brukes per install:
installs/<slug>/assets/

Per nå:
- Public read bucket (?)
- Upload via admin

Vurderinger:
- Bør uploads kreve auth?
- Bør RLS policies begrense tilgang per installSlug?
- Bør settings/playlist flyttes til DB?

Service role key brukes aldri i frontend.
Kun public anon key.