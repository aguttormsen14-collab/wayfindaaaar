# Wayfinding static app

To run the signage/player locally with Live Server, **open VS Code on the repository root** (the folder containing `index.html`).

Live Server must be started from that folder; otherwise routes such as `/admin/login.html` will return "Cannot GET". If you see that error, double-check your workspace root.

This repository is served as plain static files and is safe to deploy to GitHub Pages.

## Supabase setup

Ads are now loaded dynamically from a Supabase Storage bucket. You must provide the
public project URL and anon key at runtime. The easiest way is to edit or create
`supabase-config.js` (ignored by git) with the two lines:

```js
window.SUPABASE_URL = 'https://your-project.supabase.co';
window.SUPABASE_ANON_KEY = 'public-anon-key';
```

or inject them via a `<script>` tag in your HTML. The bucket name is `saxvik-hub` and
files are read from `installs/<installSlug>/assets/ads/`.

The admin dashboard provides drag‑and‑drop upload to that same path.
