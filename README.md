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

## Library Management (Covers + Metadata)

- One-shot build from `games.json`:
  - `npm run server` (ensure `server/.env` has Twitch/IGDB creds; RA key optional)
  - `npm run build:library`
  - Writes `games.with-covers.json` with cover URLs and `publisher`/`release_year`, and prefetches images to `covers/`.

- Update existing file in-place:
  - `npm run build:library:inplace`

- Update only newly added RA games (diff old vs new):
  - `npm run update:new -- old-games.json games.json games.with-covers.json 1 750 8`
  - Args: `<old> <new> [target] [igdbConcurrency=1] [igdbDelayMs=750] [prefetchConcurrency=8]`

Notes:
- IGDB requests use backoff + jitter; increase delay if you see 429s.
- Publisher/year are stored in the JSON file only when you run these scripts (the in-app precache keeps them in localStorage).

## Overlays

- Main card: `http://localhost:5173/overlay/main`
- Lower third: `http://localhost:5173/overlay/main?style=lowerthird`
- Reference card: `http://localhost:5173/overlay/main?style=reference`
- Stats: `http://localhost:5173/overlay/stats`
- Wheel: `http://localhost:5173/overlay/wheel`
- Footer: `http://localhost:5173/overlay/footer?clean=1`
- Badge carousel (upcoming achievements with icons, descriptions, and points): `http://localhost:5173/overlay/badge-carousel`
  - `&show=3` controls how many achievements are shown at once

Common options:
- `&clean=1` (transparent background)
- `&poll=5000` (update interval ms)
- `&showcover=0` (hide cover)
- `&showyear=0` and/or `&showpublisher=0` (toggle year/publisher)

Server requirements:
- Run the proxy: `npm run server`
- Set `VITE_IGDB_PROXY_URL=http://localhost:8787` in root `.env`
- Covers are served from the server at `/covers/<sha1>.jpg|.png`; the overlay uses that base for cache hits.

Troubleshooting covers:
- In the overlay page DevTools → Network, you should see 200 for requests to `http://localhost:8787/covers/...` or `http://localhost:8787/cover?src=...`.
- If you see placeholders, confirm server running and `VITE_IGDB_PROXY_URL` is set.

## OBS Browser sources

- Main overlay: `http://localhost:5173/overlay/main?poll=5000`
- Stats overlay: `http://localhost:5173/overlay/stats?poll=5000`
- Badge carousel overlay: `http://localhost:5173/overlay/badge-carousel?poll=5000&rotate=5000&show=3` (rotates through upcoming achievements, showing three at a time)

## Notes
- If IGDB creds are not set, the app falls back to a placeholder cover and mock data so you can test the UI immediately.
- RetroAchievements API calls are opt-in (enable in **Settings**). Without RA creds, UI uses mock data.
- Cover caching uses IndexedDB. Export a ZIP of cached covers in **Import/Export**.


## New in this build
- Live RA console ID resolution + full PS1/PS2/PSP sync (achievements-only) 
- IGDB cover fetch now uses `image_id` + `t_cover_big_2x` and stores release year
- One-click **Precache All Covers** with progress and concurrency limit

## Utilities

### Enrich metadata (publisher + year) via Node script

Prefer a script instead of the in‑app precache? You can enrich your `games.json` with IGDB publisher and release year via a Node script (uses the same local proxy):

```
# Use build:library instead for end-to-end (covers + metadata + prefetch)
npm run build:library
```

This reads `games.json` and writes `games.with-meta.json`. You can also run it directly:

```
node server/build-library.js <input.json> [output.json] [igdbConcurrency=1] [igdbDelayMs=750] [prefetchConcurrency=8]
```

Notes:
- Requires the local server running (`npm run server`) with Twitch/IGDB creds set in `server/.env`.
- Fills missing `image_url`, `release_year`, and `publisher`; existing values are preserved.
