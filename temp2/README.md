# Saxvik Hub – Signage Ad Management System

A complete admin webapp for managing advertisement playlists on wayfinding/kiosk displays using Supabase Storage.

## Features

- **User Authentication**: Email/password login with Supabase Auth
- **Multi-slot Ad Management**: Upload ads for 3 display slots
- **Drag & Drop Upload**: Easy file upload with preview support
- **Automatic Playlist Generation**: Creates `playlist.json` automatically
- **Public URL Access**: Direct URLs for storage access
- **Professional UI**: Clean, modern admin interface

## Technology Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Backend**: Supabase (Auth + Storage)
- **Client**: supabase-js

## Project Configuration

### Supabase Details (Required)

```
Project Ref:        bhunptoiypamybwgpfoz
Public Bucket:      saxvik-hub
Storage Base URL:   https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub
Install ID (v1):    amfi-steinkjer
```

### Storage Structure

Files are automatically uploaded to:

```
saxvik-hub/
└── installs/
    └── amfi-steinkjer/
        └── ads/
            ├── slot1.<ext>
            ├── slot2.<ext>
            ├── slot3.<ext>
            └── playlist.json
```

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the project root (copy from `.env.local.example`):

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://bhunptoiypamybwgpfoz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_STORAGE_BUCKET=saxvik-hub
NEXT_PUBLIC_INSTALL_ID=amfi-steinkjer
```

**Where to find your credentials:**
- Go to [Supabase Dashboard](https://app.supabase.com)
- Select project `bhunptoiypamybwgpfoz`
- Settings → API → Copy URL and anon key

### 2. Supabase Setup

#### Create Auth User

1. Go to Supabase Dashboard
2. Project → Authentication → Users
3. Click "Add user"
4. Enter email and password
5. Click "Create user"

#### Ensure Bucket is Public

1. Go to Storage → saxvik-hub bucket
2. Click "Policies" (or ⋯ → Policies)
3. Ensure "Public read" policy exists:
   - **Name**: Allow public read
   - **Effect**: ALLOW
   - **Operation**: SELECT
   - **Role**: Public
   - **Expression**: `true`

4. Ensure upload policy exists:
   - **Name**: Allow authenticated upload
   - **Effect**: ALLOW
   - **Operation**: INSERT (for new files) / UPDATE (for overwrites)
   - **Role**: Authenticated
   - **Expression**: `true`

**Note**: The bucket URL path must match:
```
installs/<INSTALL_ID>/ads/slot1.<ext>
installs/<INSTALL_ID>/ads/slot2.<ext>
installs/<INSTALL_ID>/ads/slot3.<ext>
installs/<INSTALL_ID>/ads/playlist.json
```

### 3. Local Development

#### Prerequisites

- Node.js 16+ and npm installed
- `.env.local` configured with Supabase credentials

#### Install Dependencies

```bash
npm install
```

#### Run Development Server

```bash
npm run dev
```

The app runs at `http://localhost:3000`

- **Login at**: `http://localhost:3000/login`
- **Dashboard at**: `http://localhost:3000/dashboard`

### 4. Supported File Types

- **Video**: `.mp4`, `.webm`
- **Image**: `.jpg`, `.jpeg`, `.png`, `.webp`
- **Max size**: 500 MB per file

## Usage

### 1. Login
- Navigate to `/login`
- Enter your Supabase user credentials

### 2. Upload Ads
- Go to Dashboard
- Drag & drop files into any slot (or click to browse)
- Preview appears automatically
- Clear individual slots as needed

### 3. Publish
- Click **"Publish"** button
- System automatically:
  - Uploads all files to Supabase Storage
  - Generates `playlist.json`
  - Returns public URLs for verification
- Success message shows playlist URL

### 4. Verify
- Success status displays with:
  - ✅ Confirmation message
  - Timestamp
  - Direct link to `playlist.json`
  - Copy button for easy sharing

## Deployment

### Deploy to Vercel (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Import in Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Select GitHub repository
   - Click "Import"

3. **Set Environment Variables**
   - In Vercel project settings → Environment Variables
   - Add the same variables from `.env.local`:
     ```
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     NEXT_PUBLIC_STORAGE_BUCKET
     NEXT_PUBLIC_INSTALL_ID
     ```

4. **Deploy**
   - Click "Deploy"
   - App is live at your Vercel domain

### Alternative: Docker / Manual Hosting

```bash
npm run build
npm start
```

Production server runs on port 3000

## Player Integration

Your wayfinding/kiosk player can now consume ads:

### Playlist URL

```
https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub/installs/amfi-steinkjer/ads/playlist.json
```

### Playlist Format

```json
{
  "slots": ["slot1", "slot2", "slot3"],
  "tryExt": [".webm", ".mp4", ".jpg", ".jpeg", ".png", ".webp"],
  "durationMs": 8000
}
```

### Asset URLs

Player fetches assets from:

```
https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub/installs/amfi-steinkjer/ads/slot1.<ext>
https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub/installs/amfi-steinkjer/ads/slot2.<ext>
https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub/installs/amfi-steinkjer/ads/slot3.<ext>
```

**Important**: Player automatically detects new uploads without code changes!

## Cache Busting

When updating ads, the system adds timestamp query params:

```
?t=1708956543210
```

This ensures browsers load fresh files instead of cached versions.

## Troubleshooting

### "File Upload Failed"
- Check Supabase bucket policies
- Verify ANON_KEY has upload permissions
- Ensure file size < 500 MB
- Check browser console for detailed error

### "Login Failed"
- Verify email/password in Supabase
- Check if user is created in Authentication tab
- Ensure NEXT_PUBLIC_SUPABASE_URL is correct

### "Playlist Not Found"
- Check if bucket is set to Public
- Verify file path matches expected format
- Try accessing URL directly in browser

### Browser Shows Cached Old Files
- Add `?t=<timestamp>` to resource URL
- Clear browser cache (Ctrl+Shift+Delete)
- Use Firefox DevTools → Disable Cache while open

## API Reference

### Playlist JSON Structure

```json
{
  "slots": ["slot1", "slot2", "slot3"],
  "tryExt": [".webm", ".mp4", ".jpg", ".jpeg", ".png", ".webp"],
  "durationMs": 8000
}
```

- **slots**: Array of slot identifiers
- **tryExt**: File extensions to attempt in order
- **durationMs**: Display duration per asset (milliseconds)

### Storage Paths

All ad files must follow this structure:

```
installs/<INSTALL_ID>/ads/<SLOT>.< EXT>
installs/<INSTALL_ID>/ads/playlist.json
```

- `<INSTALL_ID>`: Installation identifier (e.g., `amfi-steinkjer`)
- `<SLOT>`: Slot name (slot1, slot2, slot3)
- `<EXT>`: Original file extension (mp4, webm, jpg, etc.)

## Support & Issues

For issues or feature requests, contact your Saxvik integration team.

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-26  
**License**: Private
