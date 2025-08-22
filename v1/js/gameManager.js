class GameManager {
    constructor() {
        this.games = [];
        this.settings = {};
        this.api = new RetroAchievementsAPI();
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadGames();
        
        if (this.settings.retroachievements?.username && this.settings.retroachievements?.api_key) {
            this.api.setCredentials(
                this.settings.retroachievements.username,
                this.settings.retroachievements.api_key
            );
        }
    }

    async loadGames() {
        try {
            // First try to load from localStorage (user data)
            console.log('GameManager: Checking localStorage for games...');
            const localData = localStorage.getItem('psfest_games');
            console.log('GameManager: localStorage data exists?', !!localData);
            
            if (localData) {
                try {
                    this.games = JSON.parse(localData);
                    // Set image_url to cache format for each game
                    this.games.forEach(game => {
                        game.image_url = `images/${game.console} - ${game.title}.jpg`;
                    });
                    console.log(`GameManager: Successfully loaded ${this.games.length} games from localStorage`);
                    this.updateStats();
                    return;
                } catch (parseError) {
                    console.error('GameManager: Error parsing localStorage data:', parseError);
                    // Clear corrupted data
                    localStorage.removeItem('psfest_games');
                }
            }
            
            console.log('GameManager: No valid localStorage data, trying JSON file...');
            
            // Try to load from JSON file (only works with http server)
            try {
                const response = await fetch('./data/games.json');
                this.games = await response.json();
                // Set image_url to cache format for each game
                this.games.forEach(game => {
                    game.image_url = `images/${game.console} - ${game.title}.jpg`;
                });
                console.log(`GameManager: Loaded ${this.games.length} games from JSON file`);
            } catch (fetchError) {
                console.log('GameManager: Cannot load from JSON file (CORS/file:// protocol), using empty array');
                this.games = [];
            }
            this.updateStats();
        } catch (error) {
            console.error('GameManager: Failed to load games:', error);
            this.games = [];
        }
    }

    async saveGames() {
        try {
            // Save to localStorage since we can't write to files from browser
            localStorage.setItem('psfest_games', JSON.stringify(this.games));
            this.updateStats();
            console.log('Games saved to local storage');
        } catch (error) {
            console.error('Failed to save games:', error);
        }
    }

    async loadSettings() {
        try {
            // First try to load from localStorage (user data)
            const localData = localStorage.getItem('psfest_settings');
            if (localData) {
                this.settings = JSON.parse(localData);
                console.log('Loaded settings from localStorage');
                return;
            }
            
            // Try to load from JSON file (only works with http server)
            try {
                const response = await fetch('./data/settings.json');
                this.settings = await response.json();
                console.log('Loaded settings from JSON file');
            } catch (fetchError) {
                console.log('Cannot load from JSON file (CORS/file:// protocol), using defaults');
                this.settings = {
                    challenge_start_date: null,
                    current_game_id: null,
                    total_games: 0,
                    completed_count: 0,
                    retroachievements: { username: "Pannboo", api_key: "l2Lj6bXELEvwPE7d8uifmcvVVPwhJqw1" },
                    challenge_settings: { title: "PSFest", goal: "Beat Career Mode" }
                };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.settings = {
                challenge_start_date: null,
                current_game_id: null,
                total_games: 0,
                completed_count: 0,
                retroachievements: { username: "Pannboo", api_key: "l2Lj6bXELEvwPE7d8uifmcvVVPwhJqw1" },
                challenge_settings: { title: "PSFest", goal: "Beat Career Mode" }
            };
        }
    }

    async saveSettings() {
        try {
            // Save to localStorage since we can't write to files from browser
            localStorage.setItem('psfest_settings', JSON.stringify(this.settings));
            console.log('Settings saved to local storage');
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    updateStats() {
        this.settings.total_games = this.games.length;
        this.settings.completed_count = this.games.filter(game => game.status === 'Completed').length;
        this.saveSettings();
    }

    async fetchGamesFromAPI() {
        if (!this.settings.retroachievements?.username || !this.settings.retroachievements?.api_key) {
            throw new Error('RetroAchievements credentials not configured');
        }

        this.api.setCredentials(
            this.settings.retroachievements.username,
            this.settings.retroachievements.api_key
        );

        const games = await this.api.getAllPlatformGames();
        this.games = games;
        await this.saveGames();
        return games;
    }

    getGame(gameId) {
        return this.games.find(game => game.id === gameId);
    }

    updateGame(gameId, updates) {
        const gameIndex = this.games.findIndex(game => game.id === gameId);
        if (gameIndex !== -1) {
            this.games[gameIndex] = { ...this.games[gameIndex], ...updates };
            
            if (updates.status === 'Completed' && !this.games[gameIndex].date_finished) {
                this.games[gameIndex].date_finished = new Date().toISOString();
            }
            
            if (updates.status === 'In Progress' && !this.games[gameIndex].date_started) {
                this.games[gameIndex].date_started = new Date().toISOString();
            }
            
            this.saveGames();
            return this.games[gameIndex];
        }
        return null;
    }

    getAvailableGames(filters = {}) {
        // Default filters: include PS1/PS2/PSP, exclude bonus games
        const defaultFilters = {
            consoles: ['PlayStation', 'PlayStation 2', 'PlayStation Portable'],
            includeBonusGames: false,
            includeCompleted: false
        };
        
        const activeFilters = { ...defaultFilters, ...filters };
        
        const available = this.games.filter(game => {
            const status = game.status;
            const title = game.title || '';
            const console = game.console || '';
            
            // Skip completed games unless specifically included
            if (!activeFilters.includeCompleted && (status === 'Completed' || status === 'completed')) {
                return false;
            }
            
            // Filter by console if specified
            if (activeFilters.consoles && activeFilters.consoles.length > 0) {
                if (!activeFilters.consoles.includes(console)) {
                    return false;
                }
            }
            
            // Handle bonus games
            const isBonusGame = this.isBonusGame(title);
            if (isBonusGame && !activeFilters.includeBonusGames) {
                return false;
            }
            if (!isBonusGame && activeFilters.onlyBonusGames) {
                return false;
            }
            
            return true;
        });
        
        // Debug logging
        if (this.games.length > 0) {
            console.log('GameManager - Filter applied:', activeFilters);
            console.log('GameManager - Available games (filtered):', available.length);
        }
        
        return available;
    }

    // Legacy method for backward compatibility
    getAvailableGamesLegacy() {
        return this.getAvailableGames();
    }

    // Get bonus games (Demo, Hack, Unlicensed, Subset)
    getBonusGames(includeCompleted = false) {
        return this.getAvailableGames({
            consoles: ['PlayStation', 'PlayStation 2', 'PlayStation Portable'],
            onlyBonusGames: true,
            includeCompleted: includeCompleted
        });
    }

    // Get games by specific console
    getGamesByConsole(console, includeBonusGames = false, includeCompleted = false) {
        return this.getAvailableGames({
            consoles: [console],
            includeBonusGames: includeBonusGames,
            includeCompleted: includeCompleted
        });
    }

    // Get all PlayStation 1 games
    getPS1Games(includeBonusGames = false, includeCompleted = false) {
        return this.getGamesByConsole('PlayStation', includeBonusGames, includeCompleted);
    }

    // Get all PlayStation 2 games
    getPS2Games(includeBonusGames = false, includeCompleted = false) {
        return this.getGamesByConsole('PlayStation 2', includeBonusGames, includeCompleted);
    }

    // Get all PlayStation Portable games
    getPSPGames(includeBonusGames = false, includeCompleted = false) {
        return this.getGamesByConsole('PlayStation Portable', includeBonusGames, includeCompleted);
    }

    // Get filtered games with custom options
    getFilteredGames(options = {}) {
        return this.getAvailableGames(options);
    }

    // Check if a game should be classified as a bonus game (filtered out)
    isBonusGame(title) {
        const lowerTitle = title.toLowerCase();
        
        // Demo games
        if (lowerTitle.includes('~demo~') || lowerTitle.includes('demo')) {
            return true;
        }
        
        // Unlicensed games
        if (lowerTitle.includes('unlicensed')) {
            return true;
        }
        
        // Hack games
        if (lowerTitle.includes('~hack~') || lowerTitle.includes('hack')) {
            return true;
        }
        
        // Subset games
        if (lowerTitle.includes('[subset') || lowerTitle.includes('subset')) {
            return true;
        }
        
        return false;
    }

    // Get bonus games separately if needed
    getBonusGames() {
        return this.games.filter(game => {
            const status = game.status;
            const title = game.title || '';
            
            // Skip completed games
            if (status === 'Completed' || status === 'completed') {
                return false;
            }
            
            // Only return bonus games
            return this.isBonusGame(title);
        });
    }

    getGamesByConsole(console) {
        return this.games.filter(game => game.console === console);
    }

    getGamesByStatus(status) {
        return this.games.filter(game => game.status === status);
    }

    searchGames(query) {
        const lowercaseQuery = query.toLowerCase();
        return this.games.filter(game => 
            game.title.toLowerCase().includes(lowercaseQuery) ||
            game.console.toLowerCase().includes(lowercaseQuery)
        );
    }

    getRandomGame() {
        const availableGames = this.getAvailableGames();
        if (availableGames.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * availableGames.length);
        return availableGames[randomIndex];
    }

    setCurrentGame(gameId) {
        this.settings.current_game_id = gameId;
        this.saveSettings();
    }

    getCurrentGame() {
        if (!this.settings.current_game_id) return null;
        return this.getGame(this.settings.current_game_id);
    }

    startChallenge() {
        if (!this.settings.challenge_start_date) {
            this.settings.challenge_start_date = new Date().toISOString();
            this.saveSettings();
        }
    }

    getChallengeStats() {
        const totalGames = this.games.length;
        const completedGames = this.games.filter(game => game.status === 'Completed').length;
        const inProgressGames = this.games.filter(game => game.status === 'In Progress').length;
        
        let totalTime = 0;
        if (this.settings.challenge_start_date) {
            totalTime = Date.now() - new Date(this.settings.challenge_start_date).getTime();
        }

        return {
            totalGames,
            completedGames,
            inProgressGames,
            remainingGames: totalGames - completedGames,
            completionPercentage: totalGames > 0 ? 
                Math.round((completedGames / totalGames * 100) * 100) / 100 : 0,
            totalTime,
            averageTimePerGame: completedGames > 0 ? totalTime / completedGames : 0
        };
    }

    exportData() {
        return {
            games: this.games,
            settings: this.settings,
            stats: this.getChallengeStats(),
            exportDate: new Date().toISOString()
        };
    }

    async importData(data) {
        if (data.games && Array.isArray(data.games)) {
            this.games = data.games;
            await this.saveGames();
        }
        
        if (data.settings) {
            this.settings = { ...this.settings, ...data.settings };
            await this.saveSettings();
        }
    }

    // Clear all local data (useful for testing)
    clearAllData() {
        localStorage.removeItem('psfest_games');
        localStorage.removeItem('psfest_settings');
        console.log('All local data cleared');
    }

    // Get storage info
    getStorageInfo() {
        const gamesData = localStorage.getItem('psfest_games');
        const settingsData = localStorage.getItem('psfest_settings');
        
        return {
            hasGamesData: !!gamesData,
            hasSettingsData: !!settingsData,
            gamesCount: gamesData ? JSON.parse(gamesData).length : 0,
            storageSize: {
                games: gamesData ? gamesData.length : 0,
                settings: settingsData ? settingsData.length : 0,
                total: (gamesData ? gamesData.length : 0) + (settingsData ? settingsData.length : 0)
            }
        };
    }
}

window.GameManager = GameManager;