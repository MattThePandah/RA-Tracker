# 🎨 Modern OBS Overlay URLs

**✨ Redesigned with modern, stream-friendly styling**

For use in OBS Browser Source widgets:

## 🎮 Main Game Display (Modern Design + Integrated Timers)
- **Modern Card Style with Timers**: http://localhost:5174/overlay/main
- **Modern Lower Third**: http://localhost:5174/overlay/main?style=lowerthird  
- **Transparent Background**: http://localhost:5174/overlay/main?clean=1
- **No Cover Image**: http://localhost:5174/overlay/main?showcover=0

## 📊 Progress Stats (Modern Design)
- **Modern Progress Display**: http://localhost:5174/overlay/stats
- **Transparent Background**: http://localhost:5174/overlay/stats?clean=1
- **Faster Updates**: http://localhost:5174/overlay/stats?poll=2000
- **Compact Bar**: http://localhost:5174/overlay/stats?style=compact  (or `?compact=1`)
  - Optional: `&title=Your%20Text` and `&width=300`

## 🎡 Game Wheel/Roulette (Modern Design)
- **Modern Wheel**: http://localhost:5174/overlay/wheel
- **Transparent Background**: http://localhost:5174/overlay/wheel?clean=1
- **Hide Game Strip**: http://localhost:5174/overlay/wheel?strip=0
- **Custom Title**: http://localhost:5174/overlay/wheel?title=Game%20Selection

## 🏆 **NEW: Achievement Overlays (RetroAchievements)**
- **Achievement Progress**: http://localhost:5174/overlay/achievements?style=progress&poll=5000
- **Achievement Grid**: http://localhost:5174/overlay/achievements?style=grid&compact=1&max=20
- **Recent Achievements**: http://localhost:5174/overlay/achievements?style=recent&max=10
- **Transparent Background**: http://localhost:5174/overlay/achievements?clean=1
- **Show Hardcore Mode**: http://localhost:5174/overlay/achievements?hardcore=1

## 🚨 **Achievement Notifications & Features**
- **Popup Notifications**: Configurable achievement unlock popups with animations
- **Achievement Gallery**: Browse all earned/locked achievements with detailed view
- **Hardcore Mode Detection**: Visual indicators for hardcore achievements
- **Real-time Progress**: Live achievement progress tracking during gameplay
- **Multiple Display Modes**: Grid view, progress bars, recent feed
- **Customizable Settings**: Configure popup duration, ticker speed, and display options

## ⏱️ **NEW: Integrated Timer System**
- **Current Game Timer**: Automatically tracks time spent on current game (starts when game status changes to "In Progress")
- **PSFest Global Timer**: Tracks total streaming time across entire event
- **No Manual Management**: Timers start/stop automatically - no LiveSplit needed!
- **Persistent**: Survives browser refreshes and crashes
- **Styled to Match**: Modern timer cards with brand colors
- **Control from Settings**: Start/reset PSFest timer from Settings page

## 🎨 Modern Design Features
- **Gradient text effects** for titles and headings
- **Glassmorphism design** with backdrop blur
- **Animated elements** for spinning wheel and winner displays
- **Modern color scheme** with brand colors
- **Enhanced typography** with better hierarchy
- **Responsive layouts** that work on different screen sizes
- **Status badges** for game progress states

## ⚙️ Technical Notes
- Server must be running on port 8787 for overlays to work properly
- **Clean mode** (`?clean=1`) removes page background while keeping card designs
- Overlays automatically fall back to localStorage if server is unavailable
- Polling interval adjustable with `?poll=milliseconds` parameter
- All overlays now use modern CSS with backdrop-filter and gradients
- Optimized for streaming with better contrast and readability

## 🎯 **Timer Setup Instructions**
1. Go to **Settings** page in the main app
2. Find the **"🎯 PSFest Timer"** section
3. Click **"▶️ Start PSFest Timer"** to begin tracking total stream time
4. Current Game timers start automatically when you select a game and it changes to "In Progress"
5. Both timers will appear in the **Main Game Display** overlay

## 🚀 Recommended OBS Settings
- **Width**: 1920px | **Height**: 1080px
- **CSS**: Enable "Shutdown source when not visible" for performance
- **Refresh**: Enable "Refresh browser when scene becomes active"
- **Main Overlay**: Use `?clean=1` for transparent background perfect for streaming
## 📺 Bottom Ticker Bar (New)
- **Footer Bar**: http://localhost:5174/overlay/footer?clean=1
  - Options: `&barheight=72` `&title=PSFest` `&width=320` `&time=datetime|time` `&timefmt=24|12` `&seconds=1|0` `&datefmt=short|long` `&timestyle=psfest|neon|glow|solid` `&showtimers=1|0` `&showcurrent=1|0` `&cgcover=1|0` `&containerwidth=1276` `&poll=5000`
  - Tips:
    - `timestyle=psfest` matches the PSFest gradient text style.
    - `timestyle=glow` is most compatible across OBS systems.
  - Layout: full-width bar at bottom; date/time on left; compact PSFest stats at far right. Center is clear for OBS captions.
