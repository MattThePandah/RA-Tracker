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

## OBS Browser sources

- Main overlay: `http://localhost:5173/overlay/main?poll=5000`
- Stats overlay: `http://localhost:5173/overlay/stats?poll=5000`

## Notes
- If IGDB creds are not set, the app falls back to a placeholder cover and mock data so you can test the UI immediately.
- RetroAchievements API calls are opt-in (enable in **Settings**). Without RA creds, UI uses mock data.
- Cover caching uses IndexedDB. Export a ZIP of cached covers in **Import/Export**.


## New in this build
- Live RA console ID resolution + full PS1/PS2/PSP sync (achievements-only) 
- IGDB cover fetch now uses `image_id` + `t_cover_big_2x` and stores release year
- One-click **Precache All Covers** with progress and concurrency limit
