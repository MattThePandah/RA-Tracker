class RetroAchievementsAPI {
    constructor() {
        this.baseURL = 'https://retroachievements.org/API';
        this.username = null;
        this.apiKey = null;
        this.consoleIds = {
            'PlayStation': 12,
            'PlayStation 2': 21,
            'PlayStation Portable': 41
        };
    }

    setCredentials(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
    }

    async makeRequest(endpoint, params = {}) {
        if (!this.username || !this.apiKey) {
            throw new Error('API credentials not set');
        }

        const url = new URL(`${this.baseURL}/${endpoint}`);
        url.searchParams.append('z', this.username);
        url.searchParams.append('y', this.apiKey);
        
        Object.keys(params).forEach(key => {
            url.searchParams.append(key, params[key]);
        });

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('RetroAchievements API error:', error);
            throw error;
        }
    }

    async getConsoleGames(consoleId) {
        try {
            const data = await this.makeRequest('API_GetGameList.php', { i: consoleId });
            return data || [];
        } catch (error) {
            console.error(`Failed to fetch games for console ${consoleId}:`, error);
            return [];
        }
    }

    async getAllPlatformGames() {
        const allGames = [];
        
        for (const [consoleName, consoleId] of Object.entries(this.consoleIds)) {
            console.log(`Fetching ${consoleName} games...`);
            const games = await this.getConsoleGames(consoleId);
            
            const formattedGames = games.map(game => ({
                id: `${consoleId}-${game.ID}`,
                retroId: game.ID,
                title: game.Title,
                console: consoleName,
                image_url: game.ImageIcon ? `https://retroachievements.org${game.ImageIcon}` : null,
                status: 'Not Started',
                completion_time: null,
                date_started: null,
                date_finished: null,
                rating: null,
                notes: ''
            }));
            
            allGames.push(...formattedGames);
        }
        
        return allGames;
    }

    async getGameDetails(gameId) {
        try {
            const data = await this.makeRequest('API_GetGame.php', { i: gameId });
            return data;
        } catch (error) {
            console.error(`Failed to fetch game details for ${gameId}:`, error);
            return null;
        }
    }

    async getUserProgress(gameId) {
        try {
            const data = await this.makeRequest('API_GetUserProgress.php', { 
                u: this.username,
                i: gameId 
            });
            return data;
        } catch (error) {
            console.error(`Failed to fetch user progress for ${gameId}:`, error);
            return null;
        }
    }

    static async testConnection(username, apiKey) {
        const api = new RetroAchievementsAPI();
        api.setCredentials(username, apiKey);
        
        try {
            await api.makeRequest('API_GetUserSummary.php', { u: username });
            return true;
        } catch (error) {
            return false;
        }
    }
}

window.RetroAchievementsAPI = RetroAchievementsAPI;