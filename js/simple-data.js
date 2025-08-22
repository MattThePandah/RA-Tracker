// Simple data management - uses localStorage only
class SimpleGameData {
    constructor() {
        this.games = [];
        this.settings = {
            retroUsername: '',
            retroApiKey: '',
            challengeTitle: 'PSFest',
            challengeStartDate: null,
            currentGameId: null
        };
        this.load();
    }

    // Load data from localStorage
    load() {
        try {
            const savedGames = localStorage.getItem('psfest-games');
            const savedSettings = localStorage.getItem('psfest-settings');
            
            if (savedGames) {
                this.games = JSON.parse(savedGames);
            }
            
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
            
            console.log(`Loaded ${this.games.length} games from storage`);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    // Save data to localStorage
    save() {
        try {
            localStorage.setItem('psfest-games', JSON.stringify(this.games));
            localStorage.setItem('psfest-settings', JSON.stringify(this.settings));
            console.log(`Saved ${this.games.length} games to storage`);
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    // Add or update a game
    addGame(gameData) {
        const existingIndex = this.games.findIndex(g => g.id === gameData.id);
        if (existingIndex >= 0) {
            this.games[existingIndex] = { ...this.games[existingIndex], ...gameData };
        } else {
            this.games.push({
                id: gameData.id,
                title: gameData.title,
                console: gameData.console,
                imageUrl: gameData.imageUrl || '',
                status: 'Not Started',
                dateStarted: null,
                dateCompleted: null,
                rating: null,
                notes: '',
                ...gameData
            });
        }
        this.save();
    }

    // Update game status
    updateGame(gameId, updates) {
        const game = this.games.find(g => g.id === gameId);
        if (game) {
            Object.assign(game, updates);
            
            // Auto-set dates
            if (updates.status === 'In Progress' && !game.dateStarted) {
                game.dateStarted = new Date().toISOString();
            }
            if (updates.status === 'Completed' && !game.dateCompleted) {
                game.dateCompleted = new Date().toISOString();
            }
            
            this.save();
            return game;
        }
        return null;
    }

    // Get games by status
    getAvailableGames() {
        return this.games.filter(game => game.status !== 'Completed');
    }

    getCompletedGames() {
        return this.games.filter(game => game.status === 'Completed');
    }

    // Get random available game
    getRandomGame() {
        const available = this.getAvailableGames();
        if (available.length === 0) return null;
        return available[Math.floor(Math.random() * available.length)];
    }

    // Set current game
    setCurrentGame(gameId) {
        this.settings.currentGameId = gameId;
        this.save();
    }

    getCurrentGame() {
        if (!this.settings.currentGameId) return null;
        return this.games.find(g => g.id === this.settings.currentGameId);
    }

    // Update settings
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.save();
    }

    // Start challenge
    startChallenge() {
        if (!this.settings.challengeStartDate) {
            this.settings.challengeStartDate = new Date().toISOString();
            this.save();
        }
    }

    // Get stats
    getStats() {
        const total = this.games.length;
        const completed = this.getCompletedGames().length;
        const inProgress = this.games.filter(g => g.status === 'In Progress').length;
        const remaining = total - completed;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        let totalTime = 0;
        if (this.settings.challengeStartDate) {
            totalTime = Date.now() - new Date(this.settings.challengeStartDate).getTime();
        }

        return {
            total,
            completed,
            inProgress,
            remaining,
            percentage,
            totalTime,
            hasStarted: !!this.settings.challengeStartDate
        };
    }

    // Clear all data
    clearAll() {
        this.games = [];
        this.settings = {
            retroUsername: '',
            retroApiKey: '',
            challengeTitle: 'PSFest',
            challengeStartDate: null,
            currentGameId: null
        };
        localStorage.removeItem('psfest-games');
        localStorage.removeItem('psfest-settings');
        console.log('All data cleared');
    }

    // Export data
    exportData() {
        return {
            games: this.games,
            settings: this.settings,
            exportDate: new Date().toISOString()
        };
    }

    // Import data
    importData(data) {
        if (data.games && Array.isArray(data.games)) {
            this.games = data.games;
        }
        if (data.settings) {
            this.settings = { ...this.settings, ...data.settings };
        }
        this.save();
    }
}

// RetroAchievements API helper
class RetroAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
    }

    async request(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        url.searchParams.set('z', this.username);
        url.searchParams.set('y', this.apiKey);
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('RetroAchievements API error:', error);
            throw error;
        }
    }

    async getConsoleGames(consoleId) {
        const data = await this.request('API_GetGameList.php', { i: consoleId });
        return data || [];
    }

    async getAllPSGames() {
        const consoles = {
            'PlayStation': 12,
            'PlayStation 2': 21,
            'PlayStation Portable': 41
        };

        const allGames = [];
        for (const [consoleName, consoleId] of Object.entries(consoles)) {
            console.log(`Fetching ${consoleName} games...`);
            try {
                const games = await this.getConsoleGames(consoleId);
                const formattedGames = games.map(game => ({
                    id: `${consoleId}-${game.ID}`,
                    title: game.Title,
                    console: consoleName,
                    imageUrl: game.ImageIcon ? `https://retroachievements.org${game.ImageIcon}` : '',
                    status: 'Not Started'
                }));
                allGames.push(...formattedGames);
            } catch (error) {
                console.error(`Failed to fetch ${consoleName} games:`, error);
            }
        }
        
        return allGames;
    }

    static async testConnection(username, apiKey) {
        try {
            const api = new RetroAPI(username, apiKey);
            await api.request('API_GetUserSummary.php', { u: username });
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Global instance
window.gameData = new SimpleGameData();
window.RetroAPI = RetroAPI;