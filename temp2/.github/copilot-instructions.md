# Project Setup Instructions - Saxvik Hub

Saxvik Hub is a complete Next.js admin application for managing signage advertisements with Supabase backend integration.

## Current Project Status

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Backend**: Supabase (Auth + Storage)
- **Status**: Ready for setup and development

## Setup Checklist

### ✅ 1. Project Scaffolding (COMPLETED)

The project structure has been created with:
- Next.js App Router setup
- TypeScript configuration
- TailwindCSS styling
- Supabase client integration
- Authentication provider
- Dashboard and login pages
- Ad slot management components

### 2. Environment Configuration (MANUAL STEP)

Create `.env.local` file with Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://bhunptoiypamybwgpfoz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_STORAGE_BUCKET=saxvik-hub
NEXT_PUBLIC_INSTALL_ID=amfi-steinkjer
```

Get ANON_KEY from:
- Supabase Dashboard → Project → Settings → API
- Copy the "anon" public key

### 3. Install Dependencies

```bash
npm install
```

### 4. Supabase Configuration (MANUAL STEP)

**Create Auth User:**
1. Go to Supabase Dashboard
2. Select project: bhunptoiypamybwgpfoz
3. Authentication → Users → Add user
4. Enter test email and password
5. Click "Create user"

**Verify Bucket Policies:**
1. Storage → saxvik-hub bucket
2. Policies → Ensure public read is enabled
3. Verify upload policies allow authenticated users

For detailed instructions, see README.md

### 5. Run Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in browser

### 6. Test the Application

- Navigate to `http://localhost:3000/login`
- Login with Supabase credentials
- Upload test files to dashboard
- Click "Publish" to test upload

## Project Structure

```
saxvik-hub/
├── app/
│   ├── layout.tsx              # Root layout with AuthProvider
│   ├── page.tsx                # Home redirect
│   ├── globals.css             # Tailwind styles
│   ├── login/
│   │   ├── layout.tsx
│   │   └── page.tsx            # Login page
│   └── dashboard/
│       ├── layout.tsx          # Dashboard wrapper
│       └── page.tsx            # Main dashboard
├── components/
│   ├── AuthProvider.tsx        # Auth context
│   └── AdSlot.tsx              # Ad slot upload component
├── lib/
│   └── supabaseClient.ts       # Supabase initialization
├── public/                     # Static files
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── middleware.ts               # Route protection
└── README.md
```

## Key Features Implemented

### Authentication
- Supabase email/password login
- Automatic redirect to dashboard
- Sign out functionality
- Auth state persistence

### Dashboard
- Three ad slot cards
- Drag & drop file upload
- File preview (video/image)
- File validation
- File size limits

### Publishing
- Batch file upload to Supabase Storage
- Automatic playlist.json generation
- Public URL retrieval
- Success/error status display
- Copy-to-clipboard functionality

### Storage Structure
```
saxvik-hub/installs/amfi-steinkjer/ads/
├── slot1.<ext>
├── slot2.<ext>
├── slot3.<ext>
└── playlist.json
```

## Deployment

### Local Testing
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm start            # Run production build
```

### Deploy to Vercel
1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

### Important URLs

**Supabase Project**: https://app.supabase.com/projects
**Project Ref**: bhunptoiypamybwgpfoz

**Storage Base URL**:
```
https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub
```

**Playlist URL**:
```
https://bhunptoiypamybwgpfoz.supabase.co/storage/v1/object/public/saxvik-hub/installs/amfi-steinkjer/ads/playlist.json
```

## Supported File Types

- **Video**: mp4, webm
- **Image**: jpg, jpeg, png, webp
- **Max Size**: 500 MB per file

## Troubleshooting

**Issue**: Login fails
- Check Supabase credentials in .env.local
- Verify user exists in Supabase Authentication
- Check browser console for error messages

**Issue**: Upload fails
- Verify bucket policies allow uploads
- Check ANON_KEY permissions
- Ensure file size < 500 MB

**Issue**: Playlist not accessible
- Verify bucket is set to Public
- Check file path format
- Try accessing URL directly in browser

**Issue**: Old files shown after upload
- Add `?t=<timestamp>` to URL
- Clear browser cache
- Check storage for new file

## Next Steps

1. Install Node.js dependencies: `npm install`
2. Configure `.env.local` with Supabase credentials
3. Create test user in Supabase Authentication
4. Run `npm run dev`
5. Test login and dashboard
6. Upload test files and publish
7. Verify files in Supabase Storage Console
8. Deploy to Vercel for production

## Development Tips

- Use VS Code with TypeScript for full IDE support
- Check browser DevTools Console for detailed error messages
- Use Supabase Dashboard to verify file uploads
- Test with different file types and sizes
- Verify storage paths match exactly

## Documentation

- See README.md for complete setup and usage
- See .env.local.example for environment variables
- Check code comments for implementation details

## Support

Refer to Supabase documentation for authentication and storage questions:
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/storage
