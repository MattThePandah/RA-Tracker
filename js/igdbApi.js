// Safe warn function to avoid TypeError if console.warn is not a function
function safeWarn(...args) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(...args);
    } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log('WARN:', ...args);
    }
}

// IGDBApi class for managing IGDB API interactions
if (!window.IGDBApi) {
    window.IGDBApi = class IGDBApi {
        constructor() {
            // Singleton pattern - return existing instance if available
            if (window.IGDBApiInstance) {
                return window.IGDBApiInstance;
            }
            
            this.clientId = null;
            this.accessToken = null;
            this.baseUrl = '/api/igdb'; // Use local proxy
            this.cache = new Map(); // Simple in-memory cache
            this.initialized = false;
            
            // Start initialization asynchronously but don't wait for it
            this.initPromise = this.initialize();
            
            // Store singleton instance
            window.IGDBApiInstance = this;
        }

        // Initialize with credentials from settings.json
    async initialize() {
        if (this.initialized) return;
        
        try {
            const response = await fetch('./data/settings.json');
            const settings = await response.json();
            if (settings.igdb && settings.igdb.client_id) {
                // Using proxy server - no credentials needed on frontend
                console.log('IGDB proxy mode - credentials handled by server');
            } else {
                safeWarn('IGDB credentials not found in settings.json');
            }
        } catch (error) {
            safeWarn('Failed to load IGDB credentials from settings:', error);
        }
        
        this.initialized = true;
    }

    // Set IGDB credentials
    setCredentials(clientId, accessToken) {
        this.clientId = clientId;
        this.accessToken = accessToken;
        console.log('IGDB credentials set successfully:', !!this.clientId, !!this.accessToken);
    }
    async getAccessToken(clientId, clientSecret) {
        try {
            const response = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
            });

            if (!response.ok) {
                throw new Error(`Token request failed: ${response.status}`);
            }

            const data = await response.json();
            return data.access_token;
        } catch (error) {
            console.error('Failed to get IGDB access token:', error);
            return null;
        }
    }

    // Search for a game and get its cover art
    async getGameCover(gameTitle, console = null) {
        // Ensure API is initialized
        if (!this.initialized) {
            await this.initialize();
        }

        const cacheKey = `${gameTitle}_${console || 'any'}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // Using proxy server - credentials handled server-side
        // No credential check needed here

        try {
            // Clean up game title for search
            const searchTitle = gameTitle
                .replace(/~[^~]*~/g, '') // Remove ~Demo~, ~Hack~ tags
                .replace(/\[.*?\]/g, '') // Remove [Subset] tags
                .replace(/\s+/g, ' ')
                .trim();

            // Build search query
            let searchQuery = `search "${searchTitle}";`;
            searchQuery += 'fields name,cover.url,platforms.name;';
            searchQuery += 'limit 5;';

            // Add platform filter if specified
            if (console) {
                const platformMap = {
                    'PlayStation': 'PlayStation',
                    'PlayStation 2': 'PlayStation 2',
                    'PlayStation Portable': 'PlayStation Portable'
                };
                
                if (platformMap[console]) {
                    searchQuery += `where platforms.name = "${platformMap[console]}";`;
                }
            }

            const response = await fetch(`${this.baseUrl}/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: searchQuery
            });

            if (!response.ok) {
                throw new Error(`IGDB API error: ${response.status}`);
            }

            const games = await response.json();
            
            if (games.length > 0 && games[0].cover && games[0].cover.url) {
                // Convert to high resolution cover URL
                const coverUrl = games[0].cover.url.replace('t_thumb', 't_cover_big');
                const fullUrl = `https:${coverUrl}`;
                
                // Cache the result
                this.cache.set(cacheKey, fullUrl);
                return fullUrl;
            }

        } catch (error) {
            if (typeof console !== 'undefined' && typeof console.error === 'function') {
                console.error('Error fetching IGDB cover:', error);
            } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
                console.log('ERROR: Error fetching IGDB cover:', error);
            }
        }

        // Cache null result to avoid repeated failed requests
        this.cache.set(cacheKey, null);
        return null;
    }

    // Generate a placeholder cover URL based on game info
    generatePlaceholderCover(game) {
        // Create a deterministic color based on game title
        const titleHash = this.hashCode(game.title);
        const hue = Math.abs(titleHash) % 360;
        const saturation = 60 + (Math.abs(titleHash) % 40);
        const lightness = 40 + (Math.abs(titleHash) % 20);
        
        const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        const textColor = lightness > 50 ? '#000' : '#fff';
        
        // Create SVG placeholder
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
                <rect width="200" height="300" fill="${color}"/>
                <rect x="10" y="10" width="180" height="280" fill="none" stroke="${textColor}" stroke-width="2" opacity="0.3"/>
                <text x="100" y="120" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
                    <tspan x="100" dy="0">${this.truncateText(game.title, 15)}</tspan>
                    <tspan x="100" dy="20">${game.console}</tspan>
                </text>
                <text x="100" y="200" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-size="12" opacity="0.7">
                    No Cover Available
                </text>
            </svg>
        `;
        
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    // Simple hash function for generating colors
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    // Truncate text to fit in placeholder
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Get cache statistics
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
    }
}