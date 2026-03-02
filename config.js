// GitHub Pages configuration
// SECURITY: This file should be empty or load from config.local.js
// When deploying to production, ensure environment-specific config is loaded FIRST
// 
// For local development:
//   1. Copy config.js.example to config.local.js
//   2. Fill in your Supabase credentials
//   3. config.local.js is git-ignored
//
// For GitHub Pages:
//   1. Use repository secrets to inject credentials via a build step
//   2. OR load credentials from a secure endpoint at runtime

if (typeof window.SUPABASE_URL === 'undefined' || window.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
  console.error(
    '[CONFIG] Supabase credentials not configured. ' +
    'Copy config.js.example to config.local.js and fill in your values. ' +
    'On production, ensure credentials are injected via environment or deployment secrets.'
  );
}
