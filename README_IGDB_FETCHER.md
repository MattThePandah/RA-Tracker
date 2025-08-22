# IGDB Cover Fetcher

A Python utility to bulk download cover images for PlayStation games from IGDB API. This populates the local cache used by your Node.js proxy server.

## Features

- ✅ **Bulk downloads** for PS1, PS2, and PSP covers
- ✅ **Proper rate limiting** (3.33 requests/second - safely under IGDB's 4/sec limit)
- ✅ **Resume functionality** - interrupted downloads can be continued
- ✅ **Progress tracking** - saves progress between runs
- ✅ **High-resolution covers** - downloads `t_cover_big` versions
- ✅ **Compatible caching** - uses same MD5 hash system as Node.js proxy
- ✅ **Smart skipping** - won't re-download existing covers

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Ensure credentials are in `settings.json`:**
   ```json
   {
     "igdb": {
       "client_id": "your_client_id_here",
       "client_secret": "your_client_secret_here"
     }
   }
   ```

## Usage

### Download all PlayStation covers:
```bash
python igdb_cover_fetcher.py
```

### Download specific platforms:
```bash
python igdb_cover_fetcher.py --platforms "PlayStation" "PlayStation 2"
```

### Start fresh (ignore previous progress):
```bash
python igdb_cover_fetcher.py --no-resume
```

### Custom cache directory:
```bash
python igdb_cover_fetcher.py --cache-dir "./my_custom_cache"
```

## How It Works

1. **Authentication**: Gets OAuth2 token from Twitch using your credentials
2. **Platform Querying**: Fetches games in batches of 500 for each platform
3. **Cover Download**: Downloads high-res covers with proper rate limiting
4. **Cache Storage**: Saves images with MD5-hashed filenames (same as Node.js proxy)
5. **Progress Tracking**: Saves progress in `igdb_progress.json`

## Rate Limiting

- **300ms delay** between IGDB API requests (3.33/sec)
- **Automatic 429 handling** - waits 60 seconds if rate limited
- **Respects IGDB limits** - designed to run safely 24/7

## Progress Tracking

The utility creates `igdb_progress.json` to track:
- Completed platforms
- Last offset for each platform
- Can resume interrupted downloads

## Expected Results

- **PlayStation (PS1)**: ~1,000+ games
- **PlayStation 2**: ~4,000+ games  
- **PlayStation Portable**: ~1,500+ games

Total: **~6,500+ cover images**

## Performance

- **Download speed**: ~200-300 covers per hour (due to rate limiting)
- **Storage**: ~50-100MB total for all covers
- **Network**: ~10KB per cover image

## Integration

Downloaded covers automatically work with your Node.js proxy server:
- Same cache directory (`./cache/covers/`)
- Same MD5 naming scheme
- Same high-resolution format
- Instant loading in your game picker

## Troubleshooting

### "Authentication failed"
- Check `client_id` and `client_secret` in `settings.json`
- Verify credentials are valid in Twitch Developer Console

### "Rate limited by IGDB"
- Script will automatically wait and retry
- This is normal for large downloads

### "Failed to download"
- Some covers may be unavailable from IGDB
- Script continues with other covers
- Check internet connection

## Example Output

```
🔐 Authenticating with Twitch OAuth2...
✅ Authentication successful! Token expires in 5587808 seconds.

🎯 Starting PlayStation cover download...
🎮 Fetching PlayStation games (offset: 0, limit: 500)...
📦 Processing 500 games from offset 0...
📥 Downloading: Crash Bandicoot...
✅ Cached: a1b2c3d4e5f6.jpg
⏱️  Rate limiting: waiting 0.25s
📊 Progress: Downloaded=245, Skipped=12, Failed=3

🎉 Fetch complete!
⏱️  Total time: 1847.3 seconds
📊 Final stats: Downloaded=6543, Skipped=234, Failed=23
```