# PSFest Challenge Tracker - Project Documentation

## 🎮 Project Overview
A comprehensive PlayStation game completion tracker with OBS integration for streaming, featuring a RetroAchievements API integration and multiple game selection methods.

## 📁 Project Structure
```
Game Info Grabber/
├── index.html              # Main dashboard/navigation
├── wheel.html              # Game selection (wheel/picker)
├── games.html              # Game library management
├── obs.html                # OBS streaming overlay
├── start-server.bat        # HTTP server launcher
├── project.md              # This documentation
├── css/
│   └── styles.css          # Main stylesheet
├── js/
│   ├── retroAchievements.js # API integration
│   ├── gameManager.js      # Core game logic
│   ├── wheelLogic.js       # Traditional wheel spinner
│   ├── gamePicker.js       # Horizontal wheel CS:GO-style picker
│   ├── igdbApi.js          # IGDB API for cover art and metadata
│   └── coverCache.js       # Local cover image caching system
├── cache/
│   └── covers/             # Local game cover image cache
└── data/
    ├── games.json          # Game database (15 sample games)
    └── settings.json       # App configuration
```

## 🔧 Core Features

### 1. **Game Database Management**
- **Source**: RetroAchievements API (PS1, PS2, PSP games)
- **Storage**: localStorage with JSON fallback
- **Capacity**: 6616+ games from API
- **Status Tracking**: Not Started, In Progress, Completed
- **Metadata**: Completion time, dates, ratings, notes

### 2. **Dual Selection System**
- **Traditional Wheel**: <50 games (readable, visual segments)
- **CS:GO-Style Picker**: 50+ games (horizontal game cover strip)
- **Auto-switching**: Based on available game count
- **Stream-optimized**: Clear visibility for viewers

### 3. **OBS Integration**
- **Dual OBS widgets**: Main game display + separate stats widget
- **Main overlay**: Game cover, name, console, year
- **Stats widget**: PSFest branding, completion progress, game count
- **Local cached covers**: Fast loading for streaming
- **Auto year fetching**: IGDB API integration for missing release dates
- **Real-time updates**: 5-10 second refresh rate

### 4. **Game Management**
- **Library view**: Grid/list toggle with filtering
- **Advanced filtering**: Console, status, rating, bonus games
- **Bonus games filter**: Automatically detects hacks, demos, prototypes, subsets
- **Local cover cache**: Fast image loading from /cache/covers/
- **Quick actions**: Mark completed, set current game
- **Progress tracking**: Dates, completion times, notes
- **Visual indicators**: Bonus game badges and color coding

## 🛠 Technical Implementation

### Data Storage Strategy
```javascript
// LocalStorage (primary)
localStorage.setItem('psfest_games', JSON.stringify(games));
localStorage.setItem('psfest_settings', JSON.stringify(settings));

// JSON Files (fallback/initial data)
./data/games.json     // 15 sample games
./data/settings.json  // Configuration
```

### API Integration
```javascript
// RetroAchievements endpoints
- API_GetGameList.php    // Console-specific games
- API_GetGame.php        // Individual game details
- API_GetUserProgress.php // User completion data

// Console IDs
PlayStation: 12, PlayStation 2: 21, PlayStation Portable: 41
```

### Game Selection Logic
```javascript
if (availableGames >= 50) {
    // Use CS:GO-style picker
    gamePicker = new GamePicker('container', gameManager);
} else {
    // Use traditional wheel
    gameWheel = new GameWheel('canvas', gameManager);
}
```

## 🎨 UI/UX Design

### Color Scheme
- **Primary**: #00d4ff (cyan blue)
- **Gradient**: Linear gradient from #1e3c72 to #2a5298
- **Accent**: #ff4444 (red for pointers/alerts)
- **Status colors**: Green (completed), Yellow (in progress), Gray (not started)

### Responsive Design
- **Mobile-first**: Adapts to different screen sizes
- **OBS-ready**: Scales for streaming overlays
- **Touch-friendly**: Works on mobile devices
- **High DPI**: Supports retina displays

## 🔄 Data Flow

### Game Sync Process
1. **API Connection**: Connect with user credentials
2. **Batch Fetch**: Download all PS1/PS2/PSP games
3. **Format Data**: Structure with status tracking
4. **Save Locally**: Store in localStorage
5. **Export Option**: Download updated games.json

### Game Selection Flow
1. **Load Available**: Filter non-completed games
2. **Choose Method**: Wheel vs Picker based on count
3. **Spin Animation**: Visual selection process
4. **Result Display**: Show selected game details
5. **Status Update**: Mark as current/in progress

## 🌐 Server Setup

### HTTP Server (Required)
```batch
# start-server.bat
python -m http.server 8000
# OR
npx http-server -p 8000
```

**Why needed**: 
- localStorage sharing between pages
- CORS restrictions with file:// protocol
- Proper JSON file loading

### Access URLs
- **Dashboard**: http://localhost:8000
- **Game Wheel**: http://localhost:8000/wheel.html
- **Game Library**: http://localhost:8000/games.html
- **OBS Main Overlay**: http://localhost:8000/obs.html
- **OBS Stats Widget**: http://localhost:8000/obs-stats.html

## 📊 Game Data Structure

### Individual Game Object
```json
{
    "id": "12-1",
    "retroId": 1,
    "title": "Crash Bandicoot",
    "console": "PlayStation",
    "image_url": "https://retroachievements.org/Images/085573.png",
    "status": "Not Started",
    "completion_time": null,
    "date_started": null,
    "date_finished": null,
    "rating": null,
    "notes": ""
}
```

### Settings Configuration
```json
{
    "challenge_start_date": "2025-08-21T00:00:00.000Z",
    "current_game_id": "41-1",
    "total_games": 6616,
    "completed_count": 0,
    "retroachievements": {
        "username": "Pannboo",
        "api_key": "l2Lj6bXELEvwPE7d8uifmcvVVPwhJqw1"
    },
    "challenge_settings": {
        "title": "PSFest",
        "goal": "Beat Career Mode",
        "target_completion": null
    }
}
```

## 🎥 OBS Integration Setup

### Browser Source Configuration
1. **URL**: `http://localhost:8000/obs.html`
2. **Width**: 400px (adjustable)
3. **Height**: 300px (adjustable)
4. **CSS**: Custom styling applied automatically
5. **Refresh Rate**: Updates every 5 seconds

### Display Elements
- **Current game**: Cover art + title
- **Progress counter**: Game #X / Total
- **Challenge goal**: Customizable text
- **PSFest branding**: Stream-ready design

## 🎲 Selection Methods

### Traditional Wheel (Small Collections)
- **Visual segments**: Color-coded game sections
- **Text overlay**: Game titles and console info
- **Spin animation**: Smooth deceleration
- **Selection highlight**: Golden glow effect
- **Optimal for**: <50 games

### CS:GO-Style Picker (Large Collections)
- **Horizontal strip**: Game cover images
- **Infinite scroll**: Seamless game cycling
- **Selection box**: Yellow highlight with glow
- **Roulette wheel physics**: Fast start with exponential slowdown
- **15-second spins**: Perfect for streaming drama
- **Auto-centering**: Perfect alignment after spin
- **Optimal for**: 50+ games (6616 total)

## 🔧 Key Functions

### Core Game Management
```javascript
gameManager.loadGames()           // Load from localStorage/JSON
gameManager.saveGames()           // Save to localStorage
gameManager.getAvailableGames()   // Filter non-completed
gameManager.updateGame(id, data)  // Update game status
gameManager.setCurrentGame(id)    // Set active game
```

### Selection Systems
```javascript
gameWheel.spin()                  // Traditional wheel spin
gamePicker.spin()                 // CS:GO-style picker
handleGameSelection(game)         // Process selection result
```

### API Operations
```javascript
api.getAllPlatformGames()         // Fetch all PS games
api.getGameDetails(id)            // Individual game info
api.testConnection(user, key)     // Validate credentials
```

## 🐛 Known Issues & Solutions

### 1. localStorage Isolation (SOLVED)
- **Problem**: file:// protocol blocks localStorage sharing
- **Solution**: HTTP server requirement
- **Status**: ✅ Fixed with start-server.bat

### 2. Large Game Collections (SOLVED)
- **Problem**: 6616 games don't fit on traditional wheel
- **Solution**: CS:GO-style picker for large collections
- **Status**: ✅ Auto-switching implemented

### 3. API Rate Limiting
- **Problem**: RetroAchievements may limit requests
- **Solution**: Local caching in localStorage
- **Status**: ✅ Implemented

### 4. File Writing Restrictions (SOLVED)
- **Problem**: Browser can't write to games.json directly
- **Solution**: Download functionality for updated JSON
- **Status**: ✅ Export button implemented

## 🚀 Usage Workflow

### Initial Setup
1. Start HTTP server (`start-server.bat`)
2. Open `http://localhost:8000`
3. Configure RetroAchievements credentials
4. Sync games from API (6616 games)
5. Download updated games.json if needed

### Daily Streaming
1. Navigate to wheel/picker page
2. Spin for game selection
3. Mark game as "In Progress"
4. Add OBS overlay for stream
5. Update completion status when done

### Game Management
1. Use Game Library for detailed management
2. Filter by status, console, rating
3. Update completion times and notes
4. Track overall challenge progress

## 🎯 Stream Integration

### For Streamers
- **Visual appeal**: CS:GO-style picker for viewer engagement
- **Real-time updates**: OBS overlay shows current progress
- **Viewer interaction**: Chat can see game selection process
- **Professional branding**: PSFest theme for consistency

### For Viewers
- **Clear visibility**: Game covers easy to see
- **Exciting selection**: Spinning animation builds suspense
- **Progress tracking**: See overall challenge progress
- **Goal clarity**: Understand current objective

## 📈 Future Enhancements

### Potential Features
- **Achievement integration**: Show RetroAchievements progress
- **Stream alerts**: Game completion notifications
- **Statistics dashboard**: Completion rates, time tracking
- **Custom game lists**: User-defined collections
- **Social features**: Share progress, compare with friends

### Technical Improvements
- **Database backend**: Move from localStorage to proper DB
- **Real-time sync**: WebSocket for live updates
- **Mobile app**: Companion app for game tracking
- **Cloud backup**: Save progress across devices

## 🏆 Current Status

### Completed Features ✅
- ✅ RetroAchievements API integration
- ✅ Dual selection system (wheel + picker)
- ✅ OBS streaming overlay
- ✅ Game library management
- ✅ Progress tracking
- ✅ HTTP server setup
- ✅ localStorage data persistence
- ✅ JSON export functionality
- ✅ Responsive design
- ✅ Stream-optimized UI

### Working System ✅
- **15 sample games**: Immediate testing
- **6616 API games**: Full PlayStation library
- **Smart mode switching**: Optimal selection method
- **Cross-page persistence**: Data shared properly
- **Export capability**: Update games.json as needed

---

## 📝 Development Notes

### Architecture Decisions
- **Vanilla JavaScript**: No framework dependencies
- **localStorage**: Browser-native persistence
- **HTTP server**: Solves CORS and localStorage issues
- **Modular design**: Separate concerns (API, UI, logic)
- **Progressive enhancement**: Works with/without API

### Performance Considerations
- **Lazy loading**: Images loaded as needed
- **Efficient filtering**: Client-side game filtering
- **Smooth animations**: RequestAnimationFrame usage
- **Memory management**: Cleanup on page changes

### Security Measures
- **API key handling**: Stored locally only
- **No server storage**: All data client-side
- **CORS compliance**: Proper HTTP server setup
- **Input validation**: Sanitized user inputs

---

---

## 🆕 Latest Improvements (Session Update)

### ✅ **Enhanced Horizontal Wheel**
- **Roulette wheel physics**: Exponential decay for realistic slowdown
- **15-second spins**: Extended duration for streaming excitement
- **Auto-centering**: Perfect game alignment after spin
- **Massive game support**: 250+ duplicates for long spins
- **Wrapping logic**: Prevents games going off-screen

### ✅ **Dual OBS System**
- **obs.html**: Simplified game display (cover, name, console, year)
- **obs-stats.html**: Separate stats widget (PSFest, game count, completion %)
- **IGDB integration**: Auto-fetches missing release years
- **Local cache priority**: Fast loading from /cache/covers/
- **Correct math**: Fixed completion percentage calculation

### ✅ **Advanced Game Library**
- **Bonus games filter**: Smart detection of hacks, demos, prototypes, subsets
- **Visual indicators**: Orange badges and borders for bonus content
- **Performance optimization**: Cached covers instead of external URLs
- **Batch loading**: 20 images at a time for responsive UI
- **Enhanced stats**: Shows regular vs bonus game counts

### ✅ **Bonus Game Detection**
**Automatically identifies:**
- `~Hack~` - ROM hacks
- `~Homebrew~` - Fan-made games  
- `~Demo~` - Demo versions
- `~Prototype~` - Prototype builds
- `~Unlicensed~` - Unofficial releases
- `[Subset` - Achievement subsets
- `~Z~` - Educational games

### ✅ **Performance Improvements**
- **Local image caching**: No more slow external downloads
- **Better completion math**: Shows accurate small percentages (0.02% vs 0%)
- **Optimized filtering**: Smart bonus game detection
- **Responsive loading**: Progressive image loading

### ✅ **Technical Enhancements**
- **Cover cache system**: `/cache/covers/` directory management
- **API integration**: IGDB for missing game metadata
- **Error handling**: Graceful fallbacks for missing data
- **Memory optimization**: Efficient image loading and caching

---

**Project Status**: ✅ **COMPLETE & ENHANCED**  
**Last Updated**: August 22, 2025  
**Version**: 1.1.0 - Major Performance & Feature Update