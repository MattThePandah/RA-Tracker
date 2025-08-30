# 🎨 Modern OBS Overlay URLs

**✨ Redesigned with modern, stream-friendly styling**

For use in OBS Browser Source widgets (Vite default port 5173):

## 🎮 Main Game Display (Modern Design + Integrated Timers)
- Modern Card: http://localhost:5173/overlay/main
- Lower Third: http://localhost:5173/overlay/main?style=lowerthird
- Reference Card: http://localhost:5173/overlay/main?style=reference
- Options:
  - `&clean=1` (transparent background)
  - `&poll=5000` (update interval in ms)
  - `&showcover=0` (hide cover)
  - `&showyear=0` and/or `&showpublisher=0` (toggle year/publisher)
  - `&achievements=0` (hide achievement display)
  - `&rapoll=60000` (achievement update interval)
  - `&refresh=300` (meta refresh every N seconds)
  - `&hardrefresh=60` (force reload every N minutes)
  - `&timerpx=24` (timer font size override)
  - **Reference style extras**: `&maxwidth=1400` `&coverw=220` `&showtotal=0` `&titlelines=2`
  - **RetroAchievement controls**: `&ramode=compact` `&rasize=58` `&ramax=10` `&rascroll=1` `&raspeed=30s` `&rashow=all` `&rarows=2`
  - **Auto showcase**: `&raauto=1` `&raautoduration=30` `&raautosize=72` `&raautomax=15`
  - **Announcement mode**: `&raannounce=1` `&raannounceduration=30` `&raannouncesize=116` `&rainline=0`

## 📊 Progress Stats (Modern Design)
- http://localhost:5173/overlay/stats
- http://localhost:5173/overlay/stats?clean=1 (transparent)
- http://localhost:5173/overlay/stats?poll=2000 (faster updates)
- http://localhost:5173/overlay/stats?style=compact (or `?compact=1`)
  - Optional: `&title=Your%20Text` and `&width=300`

## 🎡 Game Wheel/Roulette (Modern Design)
- Standard: http://localhost:5173/overlay/wheel
- Options:
  - `&clean=1` (transparent background)
  - `&strip=0` (hide bottom info strip)
  - `&title=Game%20Selection` (custom title)

## 🏆 Achievement Overlays (RetroAchievements)
- Progress Style: http://localhost:5173/overlay/achievements?style=progress&poll=5000
- Grid Style: http://localhost:5173/overlay/achievements?style=grid&compact=1&max=20
- Recent Style: http://localhost:5173/overlay/achievements?style=recent&max=10
- Tracker Style: http://localhost:5173/overlay/achievements?style=tracker&speed=30&direction=left
- Options:
  - `&clean=1` (transparent background)
  - `&poll=5000` (overlay update interval)
  - `&rapoll=60000` (achievement data update interval)
  - `&style=progress|grid|recent|tracker` (display style)
  - `&hardcore=0` (hide hardcore indicators)
  - `&compact=1` (compact layout)
  - `&max=20` (limit displayed achievements)
  - **Tracker style**: `&speed=30` (scroll speed in seconds) `&direction=left|right`

## 🎡 Badge Carousel (Upcoming Achievements)
- Standard: http://localhost:5173/overlay/badge-carousel?show=3&rotate=8000
- Options:
  - `&clean=1` (transparent background)
  - `&poll=5000` (overlay update interval)
  - `&rapoll=60000` (achievement data update interval)
  - `&show=3` (achievements shown at once)
  - `&rotate=8000` (rotation interval in ms)
  - `&position=top-left` (top-right, bottom-left, bottom-right, center)

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
- **Transparency**: Use `?clean=1` for transparent backgrounds
- **Polling**: Use `?poll=5000` for good balance of updates vs performance
- **Server**: Ensure server running on port 8787 for full functionality
## 📺 Footer Bar (Bottom Ticker)
- Footer Bar: http://localhost:5173/overlay/footer?clean=1
- Full Options:
  - `&clean=1` (transparent background)
  - `&poll=5000` (update interval)
  - `&barheight=70` (bar height 40-200px)
  - `&title=PSFest` (title text)
  - `&width=320` (stats section width 180-600px)
  - `&time=datetime|time` (show date+time or time only)
  - `&timefmt=24|12` (24-hour or 12-hour format)
  - `&seconds=1` (show seconds, 0 to hide)
  - `&datefmt=short|long` (date format)
  - `&timestyle=psfest|neon|glow|solid` (time display style)
  - `&showtimers=1` (show PSFest/current game timers)
  - `&showcurrent=1` (show current game info)
  - `&cgcover=1` (show current game cover, 0 to hide)
  - `&containerwidth=1276` (layout container width 600-3840px)
- Layout: Date/time left, PSFest stats right, center clear for OBS captions
- Tip: `timestyle=glow` is most OBS-compatible
