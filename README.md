# RetroAchievements Tracker (Starter)

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
- **Integrated timers**: Current game timer + Event total timer built into main overlay
- **Automatic tracking**: Timers start/stop automatically based on game status
- **Persistent**: Survives browser refreshes and server restarts
- **No external tools needed**: Replaces LiveSplit for basic timing needs

## Features

### Timer System
- **Current Game Timer**: Automatically tracks time spent on current game
- **Event Global Timer**: Tracks total streaming/event time
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

## Deprecation Notice: v1

The `v1/` folder is deprecated and no longer maintained. It remains for historical reference only and may contain legacy code paths that are not compatible with current builds. Do not use v1 in new setups.

## Configuration

- Root `.env` (copied from `.env.example`):
  - `VITE_APP_NAME`: Optional display name.
  - `VITE_RA_USERNAME`, `VITE_RA_API_KEY`: Optional client usage. Prefer setting them in-app Settings.
  - `VITE_RA_ENABLED`: Enable client-side RA sync (true/false).
  - `VITE_IGDB_PROXY_URL`: Server URL for IGDB token and cover proxy, default `http://localhost:8787`.
  - `VITE_IGDB_ENABLED`: Toggle client IGDB helpers.
  - `VITE_V2_ENABLED`, `VITE_ALL_CONSOLES_ENABLED`: Enable newer server-backed library UI.

- Server `server/.env` (copied from `server/.env.example`):
  - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: Required for IGDB app token.
  - `RA_USERNAME`, `RA_API_KEY` (optional): Enables server-side RA jobs/fallbacks.
  - Flags: `ALL_CONSOLES_ENABLED`, `CONSOLES_ALLOWLIST`, `COVER_PREFETCH_ENABLED`, `LIBRARY_BUILD_ON_START`.
  - Limits: `IGDB_RPS`, `IGDB_MAX_CONCURRENCY`, `IGDB_MAX_RETRIES`, `RA_RPS`, `RA_MAX_CONCURRENCY`, `RA_MAX_RETRIES`.
  - Logging: `COVERS_VERBOSE`, `COVERS_LOG_EVERY`.

## Building and Running

- Install: `npm install`
- Frontend only: `npm run dev`
- Server only: `npm run server` (needs `server/.env`)
- Frontend + Server: `npm run dev-all`

## Adding Games

There are two supported ways to populate your library:

- Sync from RetroAchievements (recommended)
  1) Open the app → Settings.
  2) Enable RA Sync and enter your RA username + API Key.
  3) Click “Sync RA Games”. This pulls platforms and games (achievements-only by default). Optionally enable IGDB in Settings to cache covers and release years.

- Import a `games.json` file (manual)
  1) Create a file named `games.json` with an array of games matching this minimal shape:
     [
       { "id": "game:ra:1234", "title": "Game Title", "console": "PlayStation", "status": "Not Started" }
     ]
     Optional fields: `image_url`, `release_year`, `publisher`, `date_started`, `date_finished`, `completion_time`, `rating`, `notes`.
  2) In the app, go to Import/Export → select your `games.json` → Import.
  3) To add covers, enable IGDB in Settings and use “Precache All Covers”.

Note: The repo no longer includes sample `games.json` files. This avoids shipping stale data and keeps the repo clean.

## Security and Public Repo Readiness

- No secrets are needed in the client bundle. Keep keys in `.env` files, which are already `.gitignore`d.
- The legacy `v1/data/settings.json` file previously contained credentials. It is now sanitized and added to `.gitignore`. If any keys there were real, rotate them immediately.
- Before making this repo public:
  - Rotate any Twitch/IGDB and RetroAchievements keys that may have been exposed.
  - Consider rewriting Git history to purge old secrets (e.g., using `git filter-repo` or BFG Repo-Cleaner).
  - Optionally run a secret scan (e.g., `gitleaks detect`).

### Suggested Secret Scan

You can run a local scan with gitleaks:

```
gitleaks detect --no-banner --redact
```

## Troubleshooting

- Covers not loading: ensure `npm run server` is running and `VITE_IGDB_PROXY_URL` points to it.
- RA sync disabled: set RA credentials in Settings or `.env`, and enable RA in Settings.
- Large libraries: server-backed endpoints are more efficient; set `VITE_V2_ENABLED=true` and use `npm run dev`.
- LocalStorage quota exceeded: the app now falls back to saving a slimmed game list when the browser quota is hit. For very large libraries, prefer the server-backed UI (`VITE_V2_ENABLED=true`) to avoid client storage limits.
