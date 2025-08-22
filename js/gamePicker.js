// GamePicker class for CS:GO-style game selection
class GamePicker {
    constructor(containerId, gameManager, filters = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('GamePicker: Container not found:', containerId);
            return;
        }
        this.gameManager = gameManager;
        this.filters = filters;
        this.games = [];
        this.isSpinning = false;
        this.selectedGame = null;
        this.stripPosition = 0;
        this.targetPosition = 0;
        this.gameWidth = 120;
        this.gameHeight = 160;
        this.visibleGames = 7; // Show 7 games at once
        this.animationId = null;
        
        if (this.gameManager && this.gameManager.games) {
            this.init();
        } else {
            console.error('GamePicker: GameManager or games not available');
        }
    }

    init() {
        this.createPickerHTML();
        this.loadGames();
    }

    createPickerHTML() {
        this.container.innerHTML = `
            <div class="picker-container">
                <div class="picker-viewport">
                    <div class="picker-strip" id="pickerStrip">
                        <!-- Games will be dynamically added here -->
                    </div>
                    <div class="picker-selector">
                        <div class="selector-arrow"></div>
                    </div>
                </div>
            </div>
            
            <style>
                .picker-container {
                    width: 100%;
                    max-width: 840px; /* 7 games * 120px */
                    margin: 0 auto;
                    position: relative;
                }
                
                .picker-viewport {
                    width: 100%;
                    height: 180px;
                    overflow: hidden;
                    position: relative;
                    border: 3px solid #00d4ff;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                    box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
                }
                
                .picker-strip {
                    display: flex;
                    height: 100%;
                    position: relative;
                    transition: transform 0.1s ease-out;
                    align-items: center;
                    padding: 10px 0;
                }
                
                .picker-game {
                    flex-shrink: 0;
                    width: 120px;
                    height: 160px;
                    margin: 0 5px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    transition: all 0.2s ease;
                    cursor: pointer;
                }
                
                .picker-game:hover {
                    transform: scale(1.05);
                    border-color: #00d4ff;
                    box-shadow: 0 0 15px rgba(0, 212, 255, 0.5);
                }
                
                .picker-game.selected {
                    transform: scale(1.1);
                    border-color: #ffff00;
                    box-shadow: 0 0 20px rgba(255, 255, 0, 0.8);
                    z-index: 10;
                }
                
                .game-image {
                    width: 80px;
                    height: 80px;
                    border-radius: 6px;
                    object-fit: cover;
                    margin-bottom: 8px;
                    background: #333;
                }
                
                .game-title {
                    font-size: 11px;
                    font-weight: bold;
                    color: #fff;
                    text-align: center;
                    padding: 0 4px;
                    line-height: 1.2;
                    max-height: 36px;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                }
                
                .game-console {
                    font-size: 9px;
                    color: #00d4ff;
                    margin-top: 2px;
                }
                
                .picker-selector {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 130px;
                    height: 170px;
                    border: 4px solid #ffff00;
                    border-radius: 12px;
                    pointer-events: none;
                    z-index: 5;
                    box-shadow: 
                        0 0 20px rgba(255, 255, 0, 0.8),
                        inset 0 0 20px rgba(255, 255, 0, 0.2);
                    background: rgba(255, 255, 0, 0.15);
                }
                
                .selector-arrow {
                    position: absolute;
                    top: -15px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 10px solid transparent;
                    border-right: 10px solid transparent;
                    border-top: 12px solid #ffff00;
                    filter: drop-shadow(0 0 5px rgba(255, 255, 0, 0.8));
                }
                
                @keyframes glow {
                    0%, 100% { 
                        box-shadow: 
                            0 0 20px rgba(255, 255, 0, 0.8),
                            inset 0 0 20px rgba(255, 255, 0, 0.2);
                    }
                    50% { 
                        box-shadow: 
                            0 0 40px rgba(255, 255, 0, 1),
                            inset 0 0 30px rgba(255, 255, 0, 0.4);
                    }
                }
                
                @keyframes finalSelection {
                    0%, 100% { 
                        transform: translate(-50%, -50%) scale(1);
                        box-shadow: 
                            0 0 20px rgba(255, 255, 0, 0.8),
                            inset 0 0 20px rgba(255, 255, 0, 0.2);
                    }
                    50% { 
                        transform: translate(-50%, -50%) scale(1.05);
                        box-shadow: 
                            0 0 50px rgba(255, 255, 0, 1),
                            inset 0 0 40px rgba(255, 255, 0, 0.5);
                    }
                }
                
                .picker-selector.spinning {
                    animation: glow 0.4s ease-in-out infinite;
                }
                
                .picker-selector.final-selection {
                    animation: finalSelection 1s ease-in-out 3;
                }
            </style>
        `;
        
        this.strip = document.getElementById('pickerStrip');
        this.selector = document.querySelector('.picker-selector');
    }

    loadGames() {
        let allGames = this.gameManager.getAvailableGames(this.filters);
        // Shuffle and limit to 25 random games
        this.shuffleArray(allGames);
        this.games = allGames.length > 25 ? allGames.slice(0, 25) : allGames;
        console.log(`GamePicker: Loaded ${this.games.length} available games (shuffled, max 25) with filters:`, this.filters);
        console.log(`GamePicker: Sample games:`, this.games.slice(0, 3).map(g => g.title));
        this.renderGames();
    }

    // Fisher-Yates shuffle algorithm for true randomization
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    renderGames() {
        if (this.games.length === 0) {
            this.strip.innerHTML = '<div class="no-games-picker">No available games!</div>';
            return;
        }

        // Create enough duplicates to handle 15+ second spins - need extensive coverage
        // For 15 second spins with large distances, we need 200+ elements minimum
        const minElements = 250; // Minimum elements for 15-second spin coverage
        const repeatCount = Math.max(10, Math.ceil(minElements / this.games.length));
        const totalGames = this.games.length * repeatCount;
        
        console.log(`GamePicker: Creating ${totalGames} elements (${this.games.length} unique games × ${repeatCount} repeats)`);

        this.strip.innerHTML = '';

        for (let i = 0; i < totalGames; i++) {
            const game = this.games[i % this.games.length];
            
            if (!game || !game.title || !game.id) {
                console.warn(`GamePicker: Skipping invalid game at index ${i}:`, game);
                continue;
            }
            
            const gameElement = document.createElement('div');
            gameElement.className = 'picker-game';
            gameElement.dataset.gameId = game.id;
            
            // Simplified image handling
            const cacheUrl = `cache/covers/${game.console} - ${game.title}.jpg`;
            const placeholderSrc = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23444"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23ccc" font-family="Arial" font-size="8">${this.getConsoleShort(game.console)}</text></svg>`;
            
            // Create image element separately for better error handling
            const img = document.createElement('img');
            img.className = 'game-image';
            img.src = cacheUrl;
            img.alt = game.title;
            img.onerror = function() { this.src = placeholderSrc; };
            
            const titleDiv = document.createElement('div');
            titleDiv.className = 'game-title';
            titleDiv.textContent = game.title;
            
            const consoleDiv = document.createElement('div');
            consoleDiv.className = 'game-console';
            consoleDiv.textContent = this.getConsoleShort(game.console);
            
            gameElement.appendChild(img);
            gameElement.appendChild(titleDiv);
            gameElement.appendChild(consoleDiv);
            
            this.strip.appendChild(gameElement);
        }

        // Position the strip to start with games visible in center
        const gameSpacing = this.gameWidth + 10; // 130px per game
        const totalWidth = totalGames * gameSpacing;
        const containerWidth = this.container.offsetWidth;
        
        // Start with the middle section of games visible
        this.stripPosition = -(totalWidth / 2) + (containerWidth / 2);
        this.totalWidth = totalWidth;
        this.gameSpacing = gameSpacing;
        this.updateStripPosition();
        
        console.log(`GamePicker: Rendered ${this.strip.children.length} game elements`);
    }

    spin() {
        if (this.isSpinning || this.games.length === 0) return;

        this.isSpinning = true;
        this.selectedGame = null;
        this.selector.classList.add('spinning');

    // Extended spin for better streaming experience - 15 seconds
    const spinDuration = 14000 + Math.random() * 2000; // 14-16 seconds for dramatic effect
    const spinDistance = 8000 + Math.random() * 4000; // Larger distance for longer spins
        const targetGameIndex = Math.floor(Math.random() * this.games.length);

        const startTime = Date.now();
        const startPosition = this.stripPosition;
        const endPosition = startPosition - spinDistance;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / spinDuration, 1);

            // Roulette wheel style: very fast start, then gradual deceleration
            // Using easeOutExpo for that roulette wheel "spinning down" effect
            const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            this.stripPosition = startPosition + (endPosition - startPosition) * easeOut;

            // Simple consistent spinning animation
            this.selector.className = 'picker-selector spinning';

            this.updateStripPosition();

            if (progress < 1) {
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.finishSpin();
            }
        };

        this.animationId = requestAnimationFrame(animate);
    }

    finishSpin() {
        this.isSpinning = false;
        this.selector.classList.remove('spinning');

        // Find the game closest to center with better detection
        const centerX = this.container.offsetWidth / 2;
        const gameElements = this.strip.querySelectorAll('.picker-game');
        let closestGame = null;
        let closestDistance = Infinity;
        let closestGameCenterX = 0;

        console.log(`GamePicker: Looking for closest game to center (${centerX}px) among ${gameElements.length} elements`);
        console.log(`GamePicker: Current strip position: ${this.stripPosition}px`);
        console.log(`GamePicker: Container bounds: 0 to ${this.container.offsetWidth}px`);

        gameElements.forEach((gameEl, index) => {
            const rect = gameEl.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();
            const gameCenterX = rect.left + rect.width / 2 - containerRect.left;
            const distance = Math.abs(gameCenterX - centerX);

            // Only consider elements that are actually visible within the container viewport
            const isVisible = rect.width > 0 && rect.height > 0 && 
                             rect.right > containerRect.left && 
                             rect.left < containerRect.right &&
                             gameEl.dataset.gameId;

            if (isVisible) {
                console.log(`Element ${index}: center at ${gameCenterX}px, distance ${distance}px, gameId: ${gameEl.dataset.gameId}`);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestGame = gameEl;
                    closestGameCenterX = gameCenterX;
                }
            } else {
                console.log(`Element ${index}: invisible or invalid (${rect.width}x${rect.height}, left: ${rect.left}, right: ${rect.right}, gameId: ${gameEl.dataset.gameId})`);
            }
        });

        if (closestGame && closestGame.dataset.gameId) {
            // Fine-tune position to perfectly center the selected game
            const adjustmentNeeded = centerX - closestGameCenterX;
            this.stripPosition += adjustmentNeeded;
            
            // Animate the final centering for visual clarity
            const startPos = this.stripPosition - adjustmentNeeded;
            const endPos = this.stripPosition;
            const centeringDuration = 800; // 0.8 seconds for final centering
            const centeringStart = Date.now();
            
            const centeringAnimate = () => {
                const elapsed = Date.now() - centeringStart;
                const progress = Math.min(elapsed / centeringDuration, 1);
                const easeInOut = progress < 0.5 ? 
                    2 * progress * progress : 
                    1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                this.stripPosition = startPos + (endPos - startPos) * easeInOut;
                this.updateStripPosition();
                
                if (progress < 1) {
                    requestAnimationFrame(centeringAnimate);
                } else {
                    // Final selection after centering is complete
                    gameElements.forEach(el => el.classList.remove('selected'));
                    closestGame.classList.add('selected');
                    
                    // Add final selection animation
                    this.selector.classList.add('final-selection');
                    setTimeout(() => {
                        this.selector.classList.remove('final-selection');
                    }, 3000);
                    
                    const gameId = closestGame.dataset.gameId;
                    this.selectedGame = this.gameManager.getGame(gameId);
                    
                    console.log('GamePicker: Selected game:', this.selectedGame?.title, 'with ID:', gameId);
                    
                    // Trigger callback
                    if (this.onGameSelected && this.selectedGame) {
                        this.onGameSelected(this.selectedGame);
                    } else {
                        console.error('GamePicker: No valid game selected or callback missing');
                    }
                }
            };
            
            requestAnimationFrame(centeringAnimate);
        } else {
            console.error('GamePicker: No valid game element found at center');
            
            // Fallback 1: Try to find any visible game
            const containerRect = this.container.getBoundingClientRect();
            const visibleGames = Array.from(gameElements).filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && 
                       rect.right > containerRect.left && 
                       rect.left < containerRect.right &&
                       el.dataset.gameId;
            });
            
            console.log(`GamePicker: Found ${visibleGames.length} visible games for fallback`);
            
            if (visibleGames.length > 0) {
                const randomGame = visibleGames[Math.floor(Math.random() * visibleGames.length)];
                randomGame.classList.add('selected');
                const gameId = randomGame.dataset.gameId;
                this.selectedGame = this.gameManager.getGame(gameId);
                console.log('GamePicker: Fallback selected game:', this.selectedGame?.title);
                
                if (this.onGameSelected && this.selectedGame) {
                    this.onGameSelected(this.selectedGame);
                }
            } else {
                // Fallback 2: If no games are visible, force reposition and try again
                console.warn('GamePicker: No visible games found, repositioning strip');
                this.stripPosition = -(this.totalWidth / 4); // Move to different position
                this.updateStripPosition();
                
                // Try once more after repositioning
                setTimeout(() => {
                    const newVisibleGames = Array.from(gameElements).filter(el => {
                        const rect = el.getBoundingClientRect();
                        const containerRect = this.container.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && 
                               rect.right > containerRect.left && 
                               rect.left < containerRect.right &&
                               el.dataset.gameId;
                    });
                    
                    if (newVisibleGames.length > 0) {
                        const randomGame = newVisibleGames[Math.floor(Math.random() * newVisibleGames.length)];
                        randomGame.classList.add('selected');
                        const gameId = randomGame.dataset.gameId;
                        this.selectedGame = this.gameManager.getGame(gameId);
                        console.log('GamePicker: Emergency fallback selected game:', this.selectedGame?.title);
                        
                        if (this.onGameSelected && this.selectedGame) {
                            this.onGameSelected(this.selectedGame);
                        }
                    } else {
                        // Last resort: pick any game from our games array
                        console.error('GamePicker: All fallbacks failed, selecting random game from array');
                        this.selectedGame = this.games[Math.floor(Math.random() * this.games.length)];
                        if (this.onGameSelected && this.selectedGame) {
                            this.onGameSelected(this.selectedGame);
                        }
                    }
                }, 100);
            }
        }
    }

    updateStripPosition() {
        // Enhanced wrapping logic for 15+ second spins with large distances
        if (this.totalWidth && this.gameSpacing) {
            const containerWidth = this.container.offsetWidth;
            const bufferZone = containerWidth * 2; // Larger buffer for smoother wrapping
            
            // Wrap around more aggressively to maintain coverage
            while (this.stripPosition < -this.totalWidth - bufferZone) {
                this.stripPosition += this.totalWidth;
            }
            while (this.stripPosition > bufferZone) {
                this.stripPosition -= this.totalWidth;
            }
        }
        
        this.strip.style.transform = `translateX(${this.stripPosition}px)`;
    }

    getSelectedGame() {
        return this.selectedGame;
    }

    reset() {
        this.selectedGame = null;
        this.stripPosition = 0;
        this.loadGames();
        
        // Remove selection highlights
        const gameElements = this.strip.querySelectorAll('.picker-game');
        gameElements.forEach(el => el.classList.remove('selected'));
    }

    getConsoleShort(console) {
        switch (console) {
            case 'PlayStation': return 'PS1';
            case 'PlayStation 2': return 'PS2';
            case 'PlayStation Portable': return 'PSP';
            default: return console;
        }
    }

    async loadGameCover(gameElement, game) {
        // Use cache format for image - no encoding needed for Python server
        const filename = `${game.console} - ${game.title}.jpg`;
        const cacheUrl = `cache/covers/${filename}`;
        const img = gameElement.querySelector('.game-image');
        if (img) {
            img.onerror = function() {
                // Fallback to placeholder SVG if image not found
                img.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23444"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23ccc" font-family="Arial" font-size="10">${game.console}</text></svg>`;
            };
            img.src = cacheUrl;
        }
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

// Make GamePicker available globally
window.GamePicker = GamePicker;