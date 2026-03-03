# Dashboard Improvements - Setup Guide

## ✅ What's Been Done

### 1. **Professional Dashboard Styling**
- **Card Header Layout**: Fixed flex layout to prevent overflow - titles stay on left, toolbar elements wrap gracefully
- **Screen Editor Toolbar**: Converted to responsive grid layout (dropdown + buttons on one line on desktop, stacked on mobile)
- **Button Styling**: Improved spacing, sizing, and hover effects for a more polished look
  - Enhanced hover states with better shadows
  - Better visual feedback on click
  - Proper sizing for small buttons

### 2. **Visual Polish**
- **Hotspots**: Better hover effects with glowing shadows, improved selection highlighting
- **Pulses**: Enhanced glow effect, better visual feedback on hover and drag
- **Labels**: Improved typography on hotspot/pulse labels (darker background, subtle borders)
- **Responsive Design**: Better handling on smaller screens with adaptive grid layout

### 3. **Layout Improvements**
- **Card Body**: Now uses flexbox to properly fill available space
- **Content Spacing**: Consistent padding and gaps throughout
- **Overflow Prevention**: All elements properly contained within their boundaries
  - No more elements flowing over boxes
  - Proper text truncation where needed
  - Safe overflow handling on all interactive elements

## 🚀 Next Steps (Required to Enable Saving)

### Step 1: Set Up Supabase RLS Policies
The dashboard can now create and edit hotspots/pulses, but saving to Supabase requires Row-Level Security (RLS) policies.

**File**: `SUPABASE_RLS_SETUP.sql` (in your project root)

**How to apply:**
1. Go to [supabase.com](https://supabase.com) and log in
2. Open your **Saxvik Hub** project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Open the `SUPABASE_RLS_SETUP.sql` file and copy all the SQL
6. Paste it into the Supabase SQL editor
7. Click **Run** to execute
8. You should see success messages for each policy created

### Step 2: Test the Dashboard
Once RLS is set up:

1. **Open the dashboard**: Go to `admin/dashboard.html`
2. **Select a screen**: Click the dropdown and pick any screen
3. **Click "Lagre nå"**: This will upload your local `screens.json` to Supabase Storage
4. **Watch the status**: Should show "✅ Lagret til screens.json"
5. **Test hotspot editing**: Drag a hotspot - should autosave every 700ms
6. **Create a pulse**: 
   - Click on a hotspot (turns blue)
   - Click "Pulse fra valgt hotspot" button
   - New cyan pulse appears at hotspot position
   - Drag the hotspot - pulse follows automatically
   - Drag pulse manually - link breaks, pulse stays independent

## 📊 Dashboard Files Modified

- **dashboard.css** (954 lines)
  - Improved card layout with flexbox
  - Better responsive grid for toolbar
  - Enhanced button styling and hover states
  - Improved spacing and visual hierarchy
  - Better overflow containment

- **dashboard.html** (264 lines)
  - No changes needed - structure is good

- **dashboard.js** (780+ lines)
  - Already has hotspot/pulse editor functionality
  - Autosave to Supabase Storage
  - Linked-pulse synchronization

## 🎯 Key Features Working Now

✅ **Hotspot Editing**
- Drag hotspots in preview
- Resize hotspots with corner handle
- Click to select (blue highlight)
- Autosave every 700ms

✅ **Pulse System**
- Create free pulses ("Ny pulse" button)
- Link pulses to hotspots ("Pulse fra valgt hotspot")
- Linked pulses auto-follow hotspot movement
- Manual drag breaks link and frees pulse

✅ **Screen Management**
- Load any screen from dropdown
- Real-time visual preview
- Status messages (saving/saved/error)
- Manual "Lagre nå" save button
- Reload button resets editor state

## ❌ Known Limitations (Pending)

- Pulses can't be deleted yet (next minor feature)
- Debug editor in player still enabled (can disable via feature flag)
- Multi-install admin UI not implemented

## 📝 Technical Details

**File Structure in Supabase Storage**:
```
saxvik-hub/installs/{slug}/config/screens.json
```

**screens.json Format**:
```json
{
  "screenOrder": ["idle", "menu", "floors", "map1", "map2", "map3"],
  "screens": {
    "idle": {
      "bg": "url_or_path",
      "hotspots": [
        {"id": "hotspot_1", "x": 0.5, "y": 0.5, "w": 0.1, "h": 0.08}
      ],
      "pulses": [
        {"id": "pulse_1", "x": 0.3, "y": 0.4},
        {"id": "pulse_2", "x": 0.7, "y": 0.2, "followHotspotId": "hotspot_1"}
      ]
    }
  }
}
```

## 🔒 Security

- ✅ RLS policies check user identity via `user_roles` table
- ✅ Users can only read/write their own install's screens.json
- ✅ Fallback to local seed file if Storage missing
- ✅ All changes logged in browser console for debugging

## 💬 Questions?

Check the browser console (F12) for debugging info:
- `__kiosk.saveScreensConfigToSupabase()` - Manual save
- `__kiosk.getScreensConfigSource()` - Shows if loading from Storage or local
- Network tab shows Supabase API calls
