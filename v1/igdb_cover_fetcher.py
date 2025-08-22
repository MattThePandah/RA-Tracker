#!/usr/bin/env python3
"""
IGDB Cover Fetcher - Bulk download covers for PS1, PS2, and PSP games
Populates the local cache directory used by the Node.js proxy server.
"""

import requests
import json
import os
import time
import hashlib
from pathlib import Path
from urllib.parse import urlparse
import argparse
from typing import List, Dict, Optional

class IGDBCoverFetcher:
    def __init__(self, client_id: str, client_secret: str, cache_dir: str = "./cache/covers"):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
        self.cache_dir = Path(cache_dir)
        self.base_url = "https://api.igdb.com/v4"
        
        # Platform IDs for PlayStation consoles
        self.platforms = {
            "PlayStation": 7,
            "PlayStation 2": 8, 
            "PlayStation Portable": 38
        }
        
        # Rate limiting
        self.last_request_time = 0
        self.min_delay = 0.3  # 300ms between requests (3.33/sec)
        
        # Progress tracking
        self.progress_file = "igdb_progress.json"
        self.downloaded_count = 0
        self.skipped_count = 0
        self.failed_count = 0
        
        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
    def authenticate(self) -> bool:
        """Get OAuth2 access token from Twitch"""
        print("🔐 Authenticating with Twitch OAuth2...")
        
        url = "https://id.twitch.tv/oauth2/token"
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials"
        }
        
        try:
            response = requests.post(url, data=data, timeout=10)
            response.raise_for_status()
            
            token_data = response.json()
            self.access_token = token_data["access_token"]
            expires_in = token_data.get("expires_in", 0)
            
            print(f"✅ Authentication successful! Token expires in {expires_in} seconds.")
            return True
            
        except requests.RequestException as e:
            print(f"❌ Authentication failed: {e}")
            return False
    
    def rate_limit(self):
        """Ensure we don't exceed IGDB rate limits (4 requests/second)"""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_delay:
            sleep_time = self.min_delay - time_since_last
            print(f"⏱️  Rate limiting: waiting {sleep_time:.2f}s")
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    def make_igdb_request(self, endpoint: str, query: str) -> Optional[List[Dict]]:
        """Make a request to IGDB API with proper headers and rate limiting"""
        if not self.access_token:
            print("❌ No access token available")
            return None
            
        self.rate_limit()
        
        url = f"{self.base_url}/{endpoint}"
        headers = {
            "Client-ID": self.client_id,
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(url, headers=headers, data=query, timeout=30)
            
            if response.status_code == 429:
                print("⚠️  Rate limited by IGDB, waiting 60 seconds...")
                time.sleep(60)
                return self.make_igdb_request(endpoint, query)
            
            response.raise_for_status()
            return response.json()
            
        except requests.RequestException as e:
            print(f"❌ IGDB API request failed: {e}")
            return None
    
    def get_games_for_platform(self, platform_name: str, limit: int = 500, offset: int = 0) -> List[Dict]:
        """Get games for a specific platform with covers"""
        platform_id = self.platforms.get(platform_name)
        if not platform_id:
            print(f"❌ Unknown platform: {platform_name}")
            return []
        
        print(f"🎮 Fetching {platform_name} games (offset: {offset}, limit: {limit})...")
        
        query = f"""
        fields name, cover.url, cover.image_id;
        where platforms = {platform_id} & cover != null;
        limit {limit};
        offset {offset};
        """
        
        games = self.make_igdb_request("games", query)
        return games if games else []
    
    def get_image_hash(self, image_url: str) -> str:
        """Generate MD5 hash for image URL (matches Node.js implementation)"""
        return hashlib.md5(image_url.encode()).hexdigest()
    
    def get_cache_path(self, image_url: str, game_name: str = "", console: str = "") -> Path:
        """Get local cache file path for an image URL with meaningful filename"""
        if game_name and console:
            # Create meaningful filename: sanitize for filesystem
            safe_name = self.sanitize_filename(f"{console} - {game_name}")
            return self.cache_dir / f"{safe_name}.jpg"
        else:
            # Fallback to hash-based naming
            hash_name = self.get_image_hash(image_url)
            return self.cache_dir / f"{hash_name}.jpg"
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for filesystem compatibility"""
        # Remove/replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        
        # Remove multiple spaces and trim
        filename = ' '.join(filename.split())
        
        # Limit length to prevent filesystem issues
        if len(filename) > 200:
            filename = filename[:200]
        
        return filename.strip()
    
    def download_cover(self, cover_url: str, game_name: str = "", console: str = "") -> bool:
        """Download a cover image to local cache"""
        if not cover_url:
            return False
            
        # Convert to full HTTPS URL and high resolution
        if cover_url.startswith("//"):
            full_url = f"https:{cover_url}"
        else:
            full_url = cover_url
            
        # Get high resolution version
        high_res_url = full_url.replace("t_thumb", "t_cover_big")
        cache_path = self.get_cache_path(high_res_url, game_name, console)
        
        # Skip if already cached
        if cache_path.exists():
            self.skipped_count += 1
            return True
        
        try:
            display_name = f"{console} - {game_name}" if game_name and console else (game_name or "Unknown Game")
            print(f"📥 Downloading: {display_name[:60]}...")
            
            response = requests.get(high_res_url, timeout=30, stream=True)
            response.raise_for_status()
            
            with open(cache_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            self.downloaded_count += 1
            print(f"✅ Cached: {cache_path.name}")
            return True
            
        except requests.RequestException as e:
            print(f"❌ Failed to download {high_res_url}: {e}")
            self.failed_count += 1
            return False
    
    def load_progress(self) -> Dict:
        """Load progress from previous run"""
        if not os.path.exists(self.progress_file):
            return {"completed_platforms": [], "last_offset": {}}
        
        try:
            with open(self.progress_file, 'r') as f:
                return json.load(f)
        except:
            return {"completed_platforms": [], "last_offset": {}}
    
    def save_progress(self, platform: str, offset: int, completed: bool = False):
        """Save current progress"""
        progress = self.load_progress()
        
        if completed and platform not in progress["completed_platforms"]:
            progress["completed_platforms"].append(platform)
        
        progress["last_offset"][platform] = offset
        
        with open(self.progress_file, 'w') as f:
            json.dump(progress, f, indent=2)
    
    def fetch_platform_covers(self, platform_name: str, resume: bool = True):
        """Fetch all covers for a specific platform"""
        print(f"\n🎯 Starting {platform_name} cover download...")
        
        progress = self.load_progress() if resume else {"completed_platforms": [], "last_offset": {}}
        
        if platform_name in progress.get("completed_platforms", []):
            print(f"✅ {platform_name} already completed!")
            return
        
        start_offset = progress.get("last_offset", {}).get(platform_name, 0) if resume else 0
        offset = start_offset
        batch_size = 500  # IGDB limit
        
        while True:
            games = self.get_games_for_platform(platform_name, batch_size, offset)
            
            if not games:
                print(f"✅ {platform_name} completed! (No more games)")
                self.save_progress(platform_name, offset, completed=True)
                break
            
            print(f"📦 Processing {len(games)} games from offset {offset}...")
            
            for game in games:
                if game.get("cover") and game["cover"].get("url"):
                    self.download_cover(
                        game["cover"]["url"], 
                        game.get("name", "Unknown Game"),
                        platform_name
                    )
            
            offset += len(games)
            self.save_progress(platform_name, offset)
            
            # If we got less than batch_size, we're done
            if len(games) < batch_size:
                print(f"✅ {platform_name} completed!")
                self.save_progress(platform_name, offset, completed=True)
                break
            
            print(f"📊 Progress: Downloaded={self.downloaded_count}, Skipped={self.skipped_count}, Failed={self.failed_count}")
    
    def fetch_all_covers(self, platforms: List[str] = None, resume: bool = True):
        """Fetch covers for all specified platforms"""
        if platforms is None:
            platforms = list(self.platforms.keys())
        
        print(f"🚀 Starting IGDB cover fetch for: {', '.join(platforms)}")
        print(f"📁 Cache directory: {self.cache_dir.absolute()}")
        
        if not self.authenticate():
            return False
        
        start_time = time.time()
        
        for platform in platforms:
            try:
                self.fetch_platform_covers(platform, resume)
            except KeyboardInterrupt:
                print(f"\n⏹️  Interrupted! Progress saved for {platform}")
                break
            except Exception as e:
                print(f"❌ Error processing {platform}: {e}")
                continue
        
        elapsed = time.time() - start_time
        print(f"\n🎉 Fetch complete!")
        print(f"⏱️  Total time: {elapsed:.1f} seconds")
        print(f"📊 Final stats: Downloaded={self.downloaded_count}, Skipped={self.skipped_count}, Failed={self.failed_count}")
        
        return True

def load_credentials():
    """Load IGDB credentials from settings.json"""
    try:
        with open('./data/settings.json', 'r') as f:
            settings = json.load(f)
        
        igdb_config = settings.get('igdb', {})
        client_id = igdb_config.get('client_id')
        client_secret = igdb_config.get('client_secret')
        
        if not client_id or not client_secret:
            print("❌ IGDB credentials not found in settings.json")
            print("Please ensure both client_id and client_secret are configured.")
            return None, None
        
        return client_id, client_secret
        
    except FileNotFoundError:
        print("❌ settings.json not found")
        return None, None
    except json.JSONDecodeError:
        print("❌ Invalid JSON in settings.json")
        return None, None

def main():
    parser = argparse.ArgumentParser(description="Bulk download IGDB covers for PlayStation games")
    parser.add_argument("--platforms", nargs="+", 
                       choices=["PlayStation", "PlayStation 2", "PlayStation Portable"],
                       help="Platforms to fetch (default: all)")
    parser.add_argument("--no-resume", action="store_true",
                       help="Start fresh instead of resuming previous progress")
    parser.add_argument("--cache-dir", default="./cache/covers",
                       help="Cache directory path (default: ./cache/covers)")
    
    args = parser.parse_args()
    
    # Load credentials
    client_id, client_secret = load_credentials()
    if not client_id or not client_secret:
        return 1
    
    # Initialize fetcher
    fetcher = IGDBCoverFetcher(client_id, client_secret, args.cache_dir)
    
    # Start fetching
    success = fetcher.fetch_all_covers(
        platforms=args.platforms,
        resume=not args.no_resume
    )
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())