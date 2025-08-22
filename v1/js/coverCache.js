// Cover Cache Management - Find cached covers by game name and console
if (!window.CoverCache) {
    window.CoverCache = class CoverCache {
        constructor() {
            this.baseUrl = '/cache/covers';
            this.cache = new Map(); // Cache found cover URLs
        }

        // Sanitize filename to match Python implementation
        sanitizeFilename(filename) {
            const invalidChars = '<>:"/\\|?*';
            for (const char of invalidChars) {
                filename = filename.replace(new RegExp('\\' + char, 'g'), '_');
            }
            
            // Remove multiple spaces and trim
            filename = filename.replace(/\s+/g, ' ').trim();
            
            // Limit length
            if (filename.length > 200) {
                filename = filename.substring(0, 200);
            }
            
            return filename.trim();
        }

        // Get expected filename for a game
        getExpectedFilename(gameName, console) {
            const safeName = this.sanitizeFilename(`${console} - ${gameName}`);
            return `${safeName}.jpg`;
        }

        // Check if a cached cover exists for the game
        async checkCoverExists(gameName, console) {
            const filename = this.getExpectedFilename(gameName, console);
            const url = `${this.baseUrl}/${filename}`;
            
            try {
                const response = await fetch(url, { method: 'HEAD' });
                return response.ok;
            } catch (error) {
                return false;
            }
        }

        // Get cover URL for a game (checks cache first)
        async getCoverUrl(gameName, console) {
            const cacheKey = `${console}:${gameName}`;
            
            // Check memory cache first
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const filename = this.getExpectedFilename(gameName, console);
            const url = `${this.baseUrl}/${filename}`;
            
            // Check if file exists
            const exists = await this.checkCoverExists(gameName, console);
            
            if (exists) {
                this.cache.set(cacheKey, url);
                return url;
            } else {
                this.cache.set(cacheKey, null);
                return null;
            }
        }

        // Get cover URL with fallback to placeholder
        async getCoverUrlWithFallback(game) {
            if (!game || !game.title || !game.console) {
                return this.generatePlaceholder(game);
            }

            try {
                const cachedUrl = await this.getCoverUrl(game.title, game.console);
                
                if (cachedUrl) {
                    return cachedUrl;
                }
            } catch (error) {
                console.warn('Failed to check cached cover:', error);
            }

            // Fallback to placeholder
            return this.generatePlaceholder(game);
        }

        // Generate placeholder cover (simplified version)
        generatePlaceholder(game) {
            if (!game || !game.title) {
                return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="%23333"/></svg>';
            }

            // Create a simple hash for consistent colors
            let hash = 0;
            for (let i = 0; i < game.title.length; i++) {
                hash = game.title.charCodeAt(i) + ((hash << 5) - hash);
            }
            
            const hue = Math.abs(hash) % 360;
            const saturation = 60 + (Math.abs(hash) % 40);
            const lightness = 40 + (Math.abs(hash) % 20);
            
            const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            const textColor = lightness > 50 ? '#000' : '#fff';
            
            // Create simple SVG placeholder
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
                    <rect width="200" height="300" fill="${color}"/>
                    <rect x="10" y="10" width="180" height="280" fill="none" stroke="${textColor}" stroke-width="2" opacity="0.3"/>
                    <text x="100" y="140" font-family="Arial, sans-serif" font-size="14" font-weight="bold" 
                          text-anchor="middle" fill="${textColor}" opacity="0.8">
                        ${game.console || 'PlayStation'}
                    </text>
                    <text x="100" y="170" font-family="Arial, sans-serif" font-size="12" 
                          text-anchor="middle" fill="${textColor}" opacity="0.6">
                        ${(game.title || 'Unknown Game').substring(0, 20)}
                    </text>
                </svg>
            `;
            
            return `data:image/svg+xml,${encodeURIComponent(svg)}`;
        }

        // Clear cache
        clearCache() {
            this.cache.clear();
        }

        // Preload covers for games list
        async preloadCovers(games) {
            console.log(`Preloading covers for ${games.length} games...`);
            
            const promises = games.map(async (game) => {
                if (game.title && game.console) {
                    return this.getCoverUrl(game.title, game.console);
                }
                return null;
            });

            try {
                await Promise.all(promises);
                console.log('Cover preloading complete');
            } catch (error) {
                console.warn('Some covers failed to preload:', error);
            }
        }
    };
}