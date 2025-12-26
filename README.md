# RA Creator Studio

Creator suite for RetroAchievements: a locked-down admin studio for managing games, reviews, and video plans, plus a public portal for viewers and OBS-ready overlays.

## App surfaces

- Public portal: `http://localhost:5173/` (alias: `/public`)
- Game detail pages: `http://localhost:5173/game/<public-game-id>`
- Admin studio: `http://localhost:5173/admin`
- Public site settings: `http://localhost:5173/admin/public-site`
- Overlay studio: `http://localhost:5173/admin/overlays`
- Overlays: `http://localhost:5173/overlay/...`

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

The RetroAchievements catalog is refreshed on server boot and nightly (configure `LIBRARY_BUILD_ON_START` and `LIBRARY_REFRESH_NIGHTLY` in `server/.env`). Covers and metadata are cached via IGDB with RA fallback; no manual sync button is needed.

## Run locally

Use one of these:

```bash
# Terminal 1: start the API + cover proxy
npm run server

# Terminal 2: start the Vite client
npm run dev
```

```bash
# Or run both together
npm run dev-all
```

Public + admin routing:
- Public portal: `http://localhost:5173/`
- Admin studio: `http://localhost:5173/admin`

## Security (production)

- Admin routes/APIs are gated by Twitch OAuth sessions.
- Set `ADMIN_TWITCH_ALLOWLIST`, `SESSION_SECRET`, and `CORS_ORIGINS` in `server/.env`.
- Configure Postgres via `DATABASE_URL` or `PG*` variables for public data + sessions.
- Enable Turnstile by setting `TURNSTILE_SECRET` and `VITE_TURNSTILE_SITE_KEY`.
- Protect overlays by setting `OVERLAY_ACCESS_TOKEN` and adding `?token=YOUR_TOKEN` to overlay URLs (or set `VITE_OVERLAY_TOKEN`).

## OBS Overlays

Overlay defaults and URL generation are managed in the Overlay Studio (`/admin/overlays`).

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

- **Main game display**: `http://localhost:5173/overlay/main?clean=1&poll=5000&token=YOUR_TOKEN`
- **Stats overlay**: `http://localhost:5173/overlay/stats?clean=1&poll=5000&token=YOUR_TOKEN`
- **Achievement carousel**: `http://localhost:5173/overlay/badge-carousel?clean=1&poll=5000&rotate=5000&show=3&token=YOUR_TOKEN`
- **Game wheel**: `http://localhost:5173/overlay/wheel?clean=1&poll=2000&token=YOUR_TOKEN`
- **Footer ticker**: `http://localhost:5173/overlay/footer?clean=1&poll=5000&token=YOUR_TOKEN`

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

### Public Publishing
- **Public review fields** (rating, written review, optional YouTube link)
- **Planned/queued visibility** for the next games on deck
- **Viewer suggestions** intake with an admin inbox

## Notes
- If IGDB creds are not set, the app falls back to placeholder covers and mock data.
- RetroAchievements achievement polling is opt-in (enable in **Settings**).
- Cover caching uses IndexedDB - export ZIP backups in **Import/Export**.
- Overlays fall back to local cached data when the server is unavailable.


## New in this build
- Automatic RA catalog refresh on boot + nightly (server-side), with all consoles support via `ALL_CONSOLES_ENABLED`.
- IGDB cover fetch uses `image_id` + `t_cover_big_2x` and stores release year.
- One-click **Precache All Covers** with progress and concurrency limit.

## Deprecation Notice: v1

The `v1/` folder is deprecated and no longer maintained. It remains for historical reference only and may contain legacy code paths that are not compatible with current builds. Do not use v1 in new setups.

## License

- License: Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)
- Summary: You may use, modify, and share this project for non‑commercial purposes, provided you give appropriate credit and link to the license. Commercial use is not permitted without prior permission.
- Attribution example: “Based on RetroAchievements Tracker — CC BY‑NC 4.0.”
- Full text: see the `LICENSE` file in the repo.

## Configuration

- Root `.env` (copied from `.env.example`):
  - `VITE_APP_NAME`: Optional display name.
  - `VITE_RA_USERNAME`, `VITE_RA_API_KEY`: Optional client usage. Prefer setting them in-app Settings.
  - `VITE_RA_ENABLED`: Enable client-side RA fallback sync (true/false).
- `VITE_IGDB_PROXY_URL`: Server URL for IGDB token and cover proxy, default `http://localhost:8787`.
  - `VITE_IGDB_ENABLED`: Toggle client IGDB helpers.
  - `VITE_OVERLAY_TOKEN`: Optional token for overlay API access if you don't want to pass it via URL.
  - `VITE_V2_ENABLED`, `VITE_ALL_CONSOLES_ENABLED`: Enable newer server-backed library UI.

- Server `server/.env` (copied from `server/.env.example`):
  - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: Required for IGDB app token.
  - `RA_USERNAME`, `RA_API_KEY` (optional): Enables server-side RA jobs/fallbacks.
  - Flags: `ALL_CONSOLES_ENABLED`, `CONSOLES_ALLOWLIST`, `COVER_PREFETCH_ENABLED`, `LIBRARY_BUILD_ON_START`, `LIBRARY_REFRESH_NIGHTLY`.
  - `OVERLAY_ACCESS_TOKEN`: Required token for overlay APIs when accessed outside the admin session.
  - `TWITCH_CHANNEL`: Optional fallback Twitch channel for live status.
  - `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`: Enables YouTube live status + uploads.
  - `SUGGESTIONS_API_KEY`, `TURNSTILE_SECRET`: Protect public suggestion intake.
  - Limits: `IGDB_RPS`, `IGDB_MAX_CONCURRENCY`, `IGDB_MAX_RETRIES`, `RA_RPS`, `RA_MAX_CONCURRENCY`, `RA_MAX_RETRIES`.
  - Logging: `COVERS_VERBOSE`, `COVERS_LOG_EVERY`.

## Building and Running

- Install: `npm install`
- Frontend only: `npm run dev`
- Server only: `npm run server` (needs `server/.env`)
- Frontend + Server: `npm run dev-all`

## Adding Games

Your library is populated automatically from RetroAchievements:

- On boot and nightly refresh, the server builds a catalog using the RA API.
- Use `ALL_CONSOLES_ENABLED` or `CONSOLES_ALLOWLIST` to control scope.
- Use **Import/Export** only if you want to append custom or legacy games.

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
- RA achievements not loading: set RA credentials in Settings and ensure `RA_API_KEY` is set on the server for catalog builds.
- Large libraries: server-backed endpoints are more efficient; set `VITE_V2_ENABLED=true` and use `npm run dev`.
- LocalStorage quota exceeded: the app now falls back to saving a slimmed game list when the browser quota is hit. For very large libraries, prefer the server-backed UI (`VITE_V2_ENABLED=true`) to avoid client storage limits.

## Production roadmap

- OAuth-based admin authentication with server-side route protection
- Postgres-backed storage for public metadata and suggestions
- Public rate limiting + captcha, StreamerBot API key support
- Nightly automated RetroAchievements catalog refresh
- IGDB covers with RetroAchievements fallback
- Suggestion intake controls (open/closed and per-console caps)
