class GameWheel {
    constructor(canvasId, gameManager, filters = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.gameManager = gameManager;
        this.filters = filters;
        this.games = [];
        this.isSpinning = false;
        this.currentRotation = 0;
        this.spinSpeed = 0;
        this.selectedGame = null;
        
        this.setupCanvas();
        // Don't automatically load games - let the caller do it when ready
    }

    setupCanvas() {
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight, 500);
        
        this.canvas.width = size;
        this.canvas.height = size;
        this.centerX = size / 2;
        this.centerY = size / 2;
        this.radius = (size / 2) - 20;
        
        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.ctx.scale(dpr, dpr);
    }

    loadGames() {
        console.log('Wheel: loadGames() called');
        console.log('Wheel: gameManager exists?', !!this.gameManager);
        console.log('Wheel: gameManager.games exists?', !!this.gameManager?.games);
        console.log('Wheel: gameManager.games.length:', this.gameManager?.games?.length);
        
        if (!this.gameManager || !this.gameManager.games) {
            console.error('Wheel: GameManager or games not available');
            this.showNoGamesMessage();
            return;
        }
        
        this.games = this.gameManager.getAvailableGames(this.filters);
        // Shuffle games for true randomization
        this.shuffleArray(this.games);
        console.log(`Wheel: Found ${this.games.length} available games out of ${this.gameManager.games.length} total games (shuffled)`);
        
        // Debug: Check game statuses
        const statusCounts = this.gameManager.games.reduce((acc, game) => {
            acc[game.status] = (acc[game.status] || 0) + 1;
            return acc;
        }, {});
        console.log('Wheel: Game status breakdown:', statusCounts);
        
        if (this.games.length === 0) {
            console.log('Wheel: No available games, showing no games message');
            this.showNoGamesMessage();
            return;
        }
        
        console.log('Wheel: Drawing wheel with', this.games.length, 'games');
        this.draw();
    }

    showNoGamesMessage() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#666';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('No available games', this.centerX, this.centerY - 10);
        this.ctx.font = '14px Arial';
        this.ctx.fillText('All games are completed!', this.centerX, this.centerY + 15);
    }

    draw() {
        if (this.games.length === 0) {
            this.showNoGamesMessage();
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const segmentAngle = (2 * Math.PI) / this.games.length;
        
        // Draw wheel segments
        for (let i = 0; i < this.games.length; i++) {
            const startAngle = i * segmentAngle + this.currentRotation;
            const endAngle = (i + 1) * segmentAngle + this.currentRotation;
            
            // Better color distribution with more contrast
            const hue = (i * 137.5) % 360; // Golden angle for better distribution
            const saturation = 60 + (i % 2) * 20; // Alternate saturation
            const lightness = 55 + (i % 3) * 10; // Vary lightness
            this.ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX, this.centerY);
            this.ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Draw segment border - thicker for better visibility
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = Math.max(1, Math.min(3, this.games.length < 20 ? 3 : 1));
            this.ctx.stroke();
            
            // Draw game text
            this.drawGameText(i, startAngle, endAngle, segmentAngle);
        }
        
        // Draw center circle - size based on wheel size
        const centerRadius = Math.max(20, Math.min(40, this.radius * 0.15));
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, centerRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Add center circle border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw pointer
        this.drawPointer();
    }

    drawGameText(index, startAngle, endAngle, segmentAngle) {
        const game = this.games[index];
        const midAngle = (startAngle + endAngle) / 2;
        
        // Only draw text if segment is large enough to be readable
        const segmentDegrees = (segmentAngle * 180) / Math.PI;
        if (segmentDegrees < 10) {
            return; // Skip text for very small segments
        }
        
        const textRadius = this.radius * 0.75;
        const x = this.centerX + Math.cos(midAngle) * textRadius;
        const y = this.centerY + Math.sin(midAngle) * textRadius;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Improve text rotation logic
        let rotation = midAngle;
        if (midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2) {
            // Flip text that would be upside down
            rotation = midAngle + Math.PI;
        }
        this.ctx.rotate(rotation);
        
        // Adjust font size based on segment size
        let fontSize = Math.max(8, Math.min(14, segmentDegrees / 2));
        this.ctx.font = `bold ${fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // White text with black outline for better visibility
        this.ctx.strokeStyle = '#000';
        this.ctx.fillStyle = '#fff';
        this.ctx.lineWidth = 2;
        
        // Truncate title based on segment size
        let title = game.title;
        const maxChars = Math.max(5, Math.floor(segmentDegrees / 3));
        if (title.length > maxChars) {
            title = title.substring(0, maxChars - 3) + '...';
        }
        
        // Draw text with outline
        this.ctx.strokeText(title, 0, -5);
        this.ctx.fillText(title, 0, -5);
        
        // Only draw console for larger segments
        if (segmentDegrees > 20) {
            const consoleFontSize = Math.max(6, fontSize - 2);
            this.ctx.font = `${consoleFontSize}px Arial`;
            this.ctx.strokeText(this.getConsoleShort(game.console), 0, 8);
            this.ctx.fillText(this.getConsoleShort(game.console), 0, 8);
        }
        
        this.ctx.restore();
    }

    drawPointer() {
        // Make pointer more visible and proportional
        const pointerSize = Math.max(12, this.radius * 0.08);
        const pointerX = this.centerX + this.radius + 5;
        
        // Main pointer triangle
        this.ctx.fillStyle = '#ff4444';
        this.ctx.beginPath();
        this.ctx.moveTo(pointerX, this.centerY);
        this.ctx.lineTo(this.centerX + this.radius - pointerSize, this.centerY - pointerSize);
        this.ctx.lineTo(this.centerX + this.radius - pointerSize, this.centerY + pointerSize);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Pointer outline for better visibility
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Inner white highlight
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }

    getConsoleShort(console) {
        switch (console) {
            case 'PlayStation': return 'PS1';
            case 'PlayStation 2': return 'PS2';
            case 'PlayStation Portable': return 'PSP';
            default: return console;
        }
    }

    spin() {
        if (this.isSpinning || this.games.length === 0) return;
        
        this.isSpinning = true;
        this.selectedGame = null;
        
        // Random spin speed and duration
        this.spinSpeed = 0.2 + Math.random() * 0.3;
        const spinDuration = 3000 + Math.random() * 2000;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / spinDuration, 1);
            
            // Ease out animation
            const easeOut = 1 - Math.pow(1 - progress, 3);
            this.currentRotation += this.spinSpeed * (1 - easeOut);
            
            this.draw();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isSpinning = false;
                this.selectWinningGame();
            }
        };
        
        requestAnimationFrame(animate);
    }

    selectWinningGame() {
        if (this.games.length === 0) return;
        
        // Calculate which segment the pointer is pointing to
        const normalizedRotation = (this.currentRotation % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const segmentAngle = (2 * Math.PI) / this.games.length;
        const pointerAngle = 0; // Pointer points to the right (0 radians)
        
        // Adjust for rotation direction and find the selected segment
        const selectedIndex = Math.floor(((2 * Math.PI - normalizedRotation + pointerAngle) % (2 * Math.PI)) / segmentAngle);
        const finalIndex = selectedIndex % this.games.length;
        
        this.selectedGame = this.games[finalIndex];
        this.highlightSelectedGame(finalIndex);
        
        // Trigger callback
        if (this.onGameSelected) {
            this.onGameSelected(this.selectedGame);
        }
    }

    highlightSelectedGame(index) {
        const segmentAngle = (2 * Math.PI) / this.games.length;
        const startAngle = index * segmentAngle + this.currentRotation;
        const endAngle = (index + 1) * segmentAngle + this.currentRotation;
        
        // Draw highlight
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, this.centerY);
        this.ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Highlight border
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
    }

    getSelectedGame() {
        return this.selectedGame;
    }

    reset() {
        this.selectedGame = null;
        this.currentRotation = 0;
        this.loadGames();
    }

    onGameSelected(callback) {
        this.onGameSelected = callback;
    }

    // Fisher-Yates shuffle algorithm for true randomization
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

window.GameWheel = GameWheel;