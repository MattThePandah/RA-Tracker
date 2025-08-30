# PSFest RetroAchievements Tracker (Starter)

Web app for tracking a RetroAchievements completion challenge with two selection UIs and OBS-ready overlays.

## Quick start

```bash
# 1) Unzip, then install deps
npm install

# 2) Copy env templates and fill in credentials
cp .env.example .env
cp server/.env.example server/.env
# Edit both files with your keys

# 3) Run front-end only (Mock Mode if no creds set)
npm run dev

# OR run both front-end + local token proxy for IGDB
npm run dev-all
```

When RetroAchievements sync is enabled (see **Settings**), the app automatically pulls your RA library on startup and precaches covers and metadata via IGDB. No manual scripts are required.

## OBS Overlays

### Main Game Display
- Main card: `http://localhost:5173/overlay/main`
- Lower third: `http://localhost:5173/overlay/main?style=lowerthird`
- Reference card: `http://localhost:5173/overlay/main?style=reference`

### Stats & Progress
- Stats overlay: `http://localhost:5173/overlay/stats`
- Progress stats: `http://localhost:5173/overlay/stats?style=compact`

### Interactive Elements
- Game wheel/roulette: `http://localhost:5173/overlay/wheel`
- Footer bar: `http://localhost:5173/overlay/footer?clean=1`

### Achievement Overlays (RetroAchievements)
- Achievement display: `http://localhost:5173/overlay/achievements`
- Badge carousel: `http://localhost:5173/overlay/badge-carousel`
  - Shows upcoming achievements with icons, descriptions, and points
  - `&show=3` controls how many achievements are shown at once
  - `&rotate=5000` sets rotation interval

### Common URL Parameters
- `&clean=1` (transparent background)
- `&poll=5000` (update interval ms)
- `&showcover=0` (hide cover)
- `&showyear=0` and/or `&showpublisher=0` (toggle year/publisher)
- `&style=compact` or `&compact=1` (compact layout)

Server requirements:
- Run the proxy: `npm run server`
- Set `VITE_IGDB_PROXY_URL=http://localhost:8787` in root `.env`
- Covers are served from the server at `/covers/<sha1>.jpg|.png`; the overlay uses that base for cache hits.

Troubleshooting covers:
- In the overlay page DevTools → Network, you should see 200 for requests to `http://localhost:8787/covers/...` or `http://localhost:8787/cover?src=...`.
- If you see placeholders, confirm server running and `VITE_IGDB_PROXY_URL` is set.

## Recommended OBS Browser Sources

- **Main game display**: `http://localhost:5173/overlay/main?clean=1&poll=5000`
- **Stats overlay**: `http://localhost:5173/overlay/stats?clean=1&poll=5000`
- **Achievement carousel**: `http://localhost:5173/overlay/badge-carousel?clean=1&poll=5000&rotate=5000&show=3`
- **Game wheel**: `http://localhost:5173/overlay/wheel?clean=1&poll=2000`
- **Footer ticker**: `http://localhost:5173/overlay/footer?clean=1&poll=5000`

### Timer Features
- **Integrated timers**: Current game timer + PSFest total timer built into main overlay
- **Automatic tracking**: Timers start/stop automatically based on game status
- **Persistent**: Survives browser refreshes and server restarts
- **No external tools needed**: Replaces LiveSplit for basic timing needs

## Features

### Timer System
- **Current Game Timer**: Automatically tracks time spent on current game
- **PSFest Global Timer**: Tracks total streaming/event time
- **Auto-start/stop**: Timers respond to game status changes
- **Server persistence**: Timer data survives crashes and restarts

### RetroAchievements Integration
- **Live achievement tracking** with real-time updates
- **Achievement notifications** with customizable popups
- **Progress displays** showing earned vs total achievements
- **Hardcore mode detection** with visual indicators
- **Multiple overlay styles** for different stream layouts

### Game Management
- **IGDB integration** for cover art and metadata
- **Cover caching** with IndexedDB storage
- **Game wheel/roulette** for selection streams
- **Progress tracking** with completion stats

## Notes
- If IGDB creds are not set, the app falls back to placeholder covers and mock data
- RetroAchievements API calls are opt-in (enable in **Settings**)
- Cover caching uses IndexedDB - export ZIP backups in **Import/Export**
- All overlays work offline using cached data when server unavailable


## New in this build
- Live RA console ID resolution + full PS1/PS2/PSP sync (achievements-only) 
- IGDB cover fetch now uses `image_id` + `t_cover_big_2x` and stores release year
- One-click **Precache All Covers** with progress and concurrency limit

