# Quick Start Guide

## 1. Get Supabase Credentials

Go to [Supabase Dashboard](https://app.supabase.com):
- Project: `bhunptoiypamybwgpfoz`
- Settings → API → Copy URL and anon key

## 2. Create Auth User

- Authentication → Users → Add user
- Email: your@email.com
- Password: your_password

## 3. Setup Project

```bash
# Copy env template
cp .env.local.example .env.local

# Edit with your credentials
nano .env.local

# Install dependencies
npm install

# Run development server
npm run dev
```

## 4. Test

- Open http://localhost:3000/login
- Login with your Supabase credentials
- Upload test files to dashboard
- Click "Publish"

## 5. Deploy

```bash
# Build for production
npm run build

# Test production build locally
npm start

# Or deploy to Vercel (recommended)
git push origin main
```

## Verify Setup

### Check Supabase Access
```bash
curl https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub/installs/amfi-steinkjer/ads/playlist.json
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Unknown auth method" | Check ANON_KEY in .env.local |
| "Bucket not found" | Verify bucket name and region |
| "Upload failed" | Check bucket policies allow AUTHENTICATED users |
| "Old files showing" | Add `?t=<timestamp>` to URL |

## File Structure

```
saxvik-hub/installs/amfi-steinkjer/ads/
├── slot1.mp4
├── slot2.png
├── slot3.webm
└── playlist.json
```

## Useful Commands

```bash
npm run dev      # Development
npm run build    # Production build
npm run lint     # Check code quality  
npm start        # Production server
```

---

See README.md for full documentation.
