import React from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import AchievementNotificationManager from '../components/AchievementNotificationManager.jsx'
import * as Storage from '../services/storage.js'
import * as RA from '../services/retroachievements.js'
import * as Cache from '../services/cache.js'

// Enhanced cover loading that handles custom covers, local hashed covers, and proxies
const loadCoverUrl = async (imageUrl) => {
  if (!imageUrl) return null
  
  // Handle custom covers (stored in IndexedDB)
  if (imageUrl.startsWith('custom-covers/')) {
    try {
      const blob = await Cache.getCover(imageUrl)
      if (blob) {
        return URL.createObjectURL(blob)
      }
    } catch (error) {
      console.warn('Failed to load custom cover from cache:', error)
    }
  }
  
  // Try to find local hashed file for HTTPS URLs
  if (imageUrl.startsWith('https://')) {
    try {
      // Create a hash from the URL to match file system naming
      const urlBuffer = new TextEncoder().encode(imageUrl)
      const hashBuffer = await crypto.subtle.digest('SHA-1', urlBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      // Try to load from local covers directory (both .jpg and .png)
      // RetroAchievements URLs are always .png, so try .png first for those
      const extensions = imageUrl.includes('retroachievements.org') 
        ? ['.png', '.jpg'] 
        : ['.jpg', '.png']
      
      // Prefer fetching from the overlay server if configured (port 8787)
      const base = import.meta.env.VITE_IGDB_PROXY_URL || ''
      for (const ext of extensions) {
        const localPath = base ? `${base}/covers/${hashHex}${ext}` : `/covers/${hashHex}${ext}`
        try {
          const response = await fetch(localPath)
          if (response.ok) {
            return localPath
          }
        } catch (e) {
          // Continue to next extension
        }
      }
    } catch (error) {
      console.log('Local cover lookup failed:', error)
    }
    
    // Handle IGDB URLs with proxy support
    const base = import.meta.env.VITE_IGDB_PROXY_URL
    if (base) {
      return `${base}/cover?src=${encodeURIComponent(imageUrl)}`
    }
  }
  
  // Return direct URL for local paths or when no proxy
  return imageUrl
}

// Format seconds to HH:MM:SS or HHH:MM:SS for longer durations
const formatTime = (seconds, longHours = false) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  const hourStr = longHours && hours >= 100 ? 
    hours.toString().padStart(3, '0') : 
    hours.toString().padStart(2, '0')
  
  return `${hourStr}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

function useStorageListener() {
  const [lastUpdate, setLastUpdate] = React.useState(0)
  
  React.useEffect(() => {
    const handleStorageChange = () => {
      setLastUpdate(Date.now())
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('gameDataUpdated', handleStorageChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('gameDataUpdated', handleStorageChange)
    }
  }, [])
  
  return lastUpdate
}

export default function OverlayMain() {
  const { 
    state, 
    loadGameAchievements, 
    isConfigured,
    getUnlockRate,
    getHardcoreUnlockRate,
    isInHardcoreMode,
    clearCurrentGameData
  } = useAchievements()

  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const achievementPoll = parseInt(params.get('rapoll') || '60000', 10) // Default 60 seconds for achievements
  const style = (params.get('style') || 'card').toLowerCase() // 'card' | 'lowerthird' | 'slim'
  const showCover = params.get('showcover') !== '0'
  const showYear = params.get('showyear') !== '0'
  const showPublisher = params.get('showpublisher') !== '0'
  const showAchievements = params.get('achievements') !== '0'
  const isClean = params.get('clean') === '1'
  // RA presentation controls for reference style
  const raMode = (params.get('ramode') || 'default').toLowerCase() // 'default' | 'compact' | 'ticker'
  const raSize = parseInt(params.get('rasize') || '58', 10) // badge size in px (default 58)
  const raMax = parseInt(params.get('ramax') || '10', 10) // max badges to display
  const raScroll = params.get('rascroll') === '1' // enable auto-scroll of badges
  const raSpeed = params.get('raspeed') || '30s' // ticker speed duration (e.g., '30s')
  const raShow = (params.get('rashow') || 'earned').toLowerCase() // 'earned' | 'all'
  const raDebug = params.get('radebug') === '1' // show debug overlay
  // Auto mode: switch to emblem showcase for a duration when a new achievement is earned
  const raAuto = params.get('raauto') === '1'
  const raAutoDuration = parseInt(params.get('raautoduration') || '30', 10) // seconds
  const raAutoTest = params.get('raautotest') === '1' // force showcase once for testing
  const raAutoSize = parseInt(params.get('raautosize') || '72', 10) // preferred badge size during auto showcase
  const raAutoMax = parseInt(params.get('raautomax') || String(Math.max(raMax, 0)), 10) // preferred max badges during auto showcase
  // Announcement overlay: keep bar visible and slide in a large achievement card for N seconds
  const raAnnounce = params.get('raannounce') === '1'
  const raAnnounceDuration = parseInt(params.get('raannounceduration') || String(raAutoDuration), 10)
  const raAnnounceSize = parseInt(params.get('raannouncesize') || '116', 10)
  // Inline badges visibility: by default, hide when announcement mode is on
  const raInlineParam = params.get('rainline')
  const showInlineBadges = raInlineParam != null ? (raInlineParam !== '0') : !raAnnounce
  const raRows = parseInt(params.get('rarows') || '0', 10) // limit rows when wrapping; 0 = unlimited
  const refreshSec = parseInt(params.get('refresh') || '0', 10) // optional: add <meta refresh> every N seconds
  const hardRefreshMin = parseInt(params.get('hardrefresh') || '0', 10) // optional: force reload every N minutes
  const timerPx = parseInt(params.get('timerpx') || '0', 10) // optional: override timer font size in px
  const tick = usePoll(poll)
  const storageUpdate = useStorageListener()

  // Apply clean overlay styling to document body
  React.useEffect(() => {
    if (isClean) {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [isClean])

  // Optional auto-refresh (off by default to avoid surprise reloads in OBS)
  React.useEffect(() => {
    let forceRefresh
    let metaRefresh
    if (refreshSec > 0) {
      metaRefresh = document.createElement('meta')
      metaRefresh.httpEquiv = 'refresh'
      metaRefresh.content = String(refreshSec)
      document.head.appendChild(metaRefresh)
    }
    if (hardRefreshMin > 0) {
      forceRefresh = setTimeout(() => {
        window.location.reload()
      }, hardRefreshMin * 60 * 1000)
    }
    return () => {
      if (metaRefresh) document.head.removeChild(metaRefresh)
      if (forceRefresh) clearTimeout(forceRefresh)
    }
  }, [refreshSec, hardRefreshMin])

  const [game, setGame] = React.useState(null)
  const [cover, setCover] = React.useState(null)
  const [prevImageUrl, setPrevImageUrl] = React.useState(null)
  const [currentGameTime, setCurrentGameTime] = React.useState('00:00:00')
  const [totalTime, setTotalTime] = React.useState('000:00:00')
  const [lastUpdate, setLastUpdate] = React.useState('')
  const [stats, setStats] = React.useState({ total: 0, completed: 0, percent: 0 })
  const [raShowcaseUntil, setRaShowcaseUntil] = React.useState(0)
  const [announceUntil, setAnnounceUntil] = React.useState(0)
  const autoTestTriggeredForGame = React.useRef(null)

  // Track earned achievements to trigger auto showcase
  const earnedCount = React.useMemo(() => (state.currentGameAchievements || []).filter(a => a.isEarned).length, [state.currentGameAchievements])
  const latestEarnedTs = React.useMemo(() => {
    const times = (state.currentGameAchievements || [])
      .filter(a => a.isEarned && a.dateEarned)
      .map(a => new Date(a.dateEarned).getTime())
    return times.length ? Math.max(...times) : 0
  }, [state.currentGameAchievements])
  const prevEarnedRef = React.useRef({ count: 0, latest: 0 })

  React.useEffect(() => {
    const prev = prevEarnedRef.current
    const gained = earnedCount > prev.count || latestEarnedTs > prev.latest
    if (raAuto && gained) {
      const now = Date.now()
      setRaShowcaseUntil(now + raAutoDuration * 1000)
      if (raAnnounce) setAnnounceUntil(now + raAnnounceDuration * 1000)
    }
    prevEarnedRef.current = { count: earnedCount, latest: latestEarnedTs }
  }, [earnedCount, latestEarnedTs, raAuto, raAutoDuration])

  // Auto-test trigger to preview the showcase without earning
  React.useEffect(() => {
    if (raAuto && raAutoTest) {
      const now = Date.now()
      setRaShowcaseUntil(now + raAutoDuration * 1000)
      if (raAnnounce) setAnnounceUntil(now + raAnnounceDuration * 1000)
    }
  }, [raAuto, raAutoTest, raAutoDuration])

  // Ensure autotest also fires after a game switch when achievements finish loading
  React.useEffect(() => {
    if (!raAuto || !raAutoTest) return
    if (!game?.id) return
    if (autoTestTriggeredForGame.current === game.id) return
    if (state.loading?.gameAchievements) return
    if ((state.currentGameAchievements || []).length === 0) return
    autoTestTriggeredForGame.current = game.id
    const now = Date.now()
    setRaShowcaseUntil(now + raAutoDuration * 1000)
    if (raAnnounce) setAnnounceUntil(now + raAnnounceDuration * 1000)
  }, [raAuto, raAutoTest, raAutoDuration, game?.id, state.loading?.gameAchievements, state.currentGameAchievements])

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const tryFetch = async () => {
      let g = null
      
      // Prioritize server for OBS compatibility
      try {
        const res = await fetch(`${base}/overlay/current`)
        if (res.ok) {
          const json = await res.json()
          g = json?.current || null
          if (g) {
            setGame(g)
            if (g.image_url !== prevImageUrl) {
              setPrevImageUrl(g.image_url)
              loadCoverUrl(g.image_url).then(setCover)
            }
            return
          }
        }
      } catch (err) {
        console.log('Server current failed, falling back to localStorage:', err.message)
      }
      
      // Fallback to localStorage (same-browser usage)
      try {
        let games = Storage.getGames()
        let curId = Storage.getCurrentGameId()
        g = games.find(x => x.id === curId) || null
        setGame(g)
        if (g?.image_url !== prevImageUrl) {
          setPrevImageUrl(g?.image_url || null)
          loadCoverUrl(g?.image_url).then(setCover)
        }
      } catch (storageErr) {
        console.log('localStorage fallback failed:', storageErr.message)
        setGame(null)
        setCover(null)
        setPrevImageUrl(null)
      }
    }
    tryFetch()
  }, [tick, storageUpdate])

  // Load achievements when game changes; clear stale data, force reload, reset auto state
  React.useEffect(() => {
    if (!game?.id) return
    // Clear old game's achievements and reset auto showcase tracking
    clearCurrentGameData()
    prevEarnedRef.current = { count: 0, latest: 0 }
    setRaShowcaseUntil(0)
    setAnnounceUntil(0)
    autoTestTriggeredForGame.current = null
    if (RA.hasRetroAchievementsSupport(game) && isConfigured && showAchievements) {
      loadGameAchievements(game.id, true)
    }
  }, [game?.id, isConfigured, showAchievements])

  // Simple reliable achievement polling - polls every 60 seconds (or custom rapoll parameter)
  React.useEffect(() => {
    if (!game?.id || !RA.hasRetroAchievementsSupport(game) || !isConfigured || !showAchievements) {
      return
    }
    
    console.log('Main overlay: Setting up achievement polling every', achievementPoll, 'ms')
    
    const achievementPollInterval = setInterval(() => {
      console.log('Main overlay: Polling achievements for game', game.id)
      // Only poll if not currently loading and we have a game
      if (game?.id && !state.loading?.gameAchievements) {
        loadGameAchievements(game.id, true) // Force refresh to get latest achievement state
      }
    }, achievementPoll)
    
    return () => {
      console.log('Main overlay: Clearing achievement polling interval')
      clearInterval(achievementPollInterval)
    }
  }, [game?.id, isConfigured, showAchievements, achievementPoll])

  // Timer updates: prefer server-calculated timers for OBS reliability.
  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let id

    const fetchTimers = async () => {
      try {
        const res = await fetch(`${base}/overlay/timers`)
        if (res.ok) {
          const t = await res.json()
          if (t?.currentGameTime && (t?.totalTime || t?.psfestTime)) {
            setCurrentGameTime(t.currentGameTime)
            setTotalTime(t.totalTime || t.psfestTime)
            setLastUpdate(new Date().toLocaleTimeString())
            return
          }
        }
      } catch {}

      // Fallback to local calculation if server unreachable (browser only)
      try {
        const now = Date.now()
        if (game && game.date_started) {
          const gameStartTime = new Date(game.date_started).getTime()
          const gameElapsed = Math.floor((now - gameStartTime) / 1000)
          setCurrentGameTime(formatTime(Math.max(0, gameElapsed)))
        } else {
          setCurrentGameTime('00:00:00')
        }
        // No offline fallback for total time
        setTotalTime('000:00:00')
        setLastUpdate(new Date().toLocaleTimeString())
      } catch {
        setCurrentGameTime('00:00:00')
        setTotalTime('000:00:00')
      }
    }

    fetchTimers()
    id = setInterval(fetchTimers, 1000)
    return () => clearInterval(id)
  }, [game])

  // Overlay stats (for game number in reference layout)
  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let stopped = false
    const load = async () => {
      try {
        const r = await fetch(`${base}/overlay/stats`)
        if (r.ok) {
          const j = await r.json()
          const total = Number(j.total || 0)
          const completed = Number(j.completed || 0)
          const percent = typeof j.percent === 'number' ? j.percent : (total ? Math.round((completed / total) * 100) : 0)
          if (!stopped) setStats({ total, completed, percent })
        }
      } catch {}
    }
    load()
    const t = setInterval(load, 5000)
    return () => { stopped = true; clearInterval(t) }
  }, [])

  if (!game) return <div className="overlay-chrome p-3">No current game</div>

  if (style === 'reference') {
    const maxWidth = params.get('maxwidth') ? parseInt(params.get('maxwidth'), 10) : 1400
    const coverW = parseInt(params.get('coverw') || '220', 10)
    const coverH = Math.round(coverW * 4/3)
    const gameNumber = (stats.completed || 0) + 1
    const showTotal = params.get('showtotal') !== '0'
    const titleLines = parseInt(params.get('titlelines') || '1', 10)
    
    // Achievement data
    const { currentGameAchievements, currentGameProgress, loading } = state
    const hasRASupport = game && RA.hasRetroAchievementsSupport(game)
    const achievementCount = currentGameProgress?.numAchieved || currentGameAchievements.filter(a => a.isEarned).length
    const totalAchievements = currentGameProgress?.numPossibleAchievements || currentGameAchievements.length
    const achievementPercent = totalAchievements > 0 ? Math.round((achievementCount / totalAchievements) * 100) : 0
    const hardcoreCount = currentGameProgress?.numAchievedHardcore || currentGameAchievements.filter(a => a.isEarnedHardcore).length
    const showHardcore = hardcoreCount > 0 || isInHardcoreMode()
    
    // Effective RA mode: if auto is active, force compact (emblem showcase)
    const now = Date.now()
    const isAutoShowcase = raAuto && now < raShowcaseUntil
    let effMode = (isAutoShowcase && !raAnnounce) ? 'compact' : raMode
    const effSize = isAutoShowcase ? Math.max(raSize, raAutoSize) : raSize
    const effMax = isAutoShowcase ? raAutoMax : raMax
    // If no badges are allowed (ramax=0), don't hide the bar during auto
    if (effMode === 'compact' && effMax <= 0) {
      effMode = 'default'
    }

    return (
      <>
        <div className={`overlay-chrome ${isClean ? 'overlay-clean' : ''}`} style={{ ...(timerPx>0?{'--timer-font-size': `${timerPx}px`}:{}) }}>
          <div className="ref-container" style={{ maxWidth, margin: '0 auto' }}>
            <div className="overlay-card ref-card">
              <div className="ref-top">
                <div className="ref-left">
                  {showCover && (
                    <div className="cover-container" style={{width: coverW, height: coverH}}>
                      {cover ? (
                        <img className="cover-image" src={cover} alt="" />
                      ) : (
                        <div className="cover-placeholder"><i className="bi bi-controller"></i></div>
                      )}
                    </div>
                  )}
                  <div className="ref-title-block">
                    <div className={`ref-title ${titleLines === 2 ? 'title-wrap-2' : 'title-wrap-1'}`}>{game.title}</div>
                    <div className="ref-sub">
                      {game.console}
                      {showYear && game.release_year ? ` • ${game.release_year}` : ''}
                      {showPublisher && game.publisher ? ` • ${game.publisher}` : ''}
                    </div>
                  </div>
                </div>
                <div className="ref-right">
                  <div className="timer-block blue">
                    <div className="t-label">Current Game</div>
                    <div className="t-time">{currentGameTime}</div>
                  </div>
                </div>
              </div>
              <div className="ref-divider" />
              
                <div className="ref-bottom">
                  <div className="event-left">
                    <span className="event-game">Game {gameNumber}{showTotal && stats.total ? ` of ${stats.total}` : ''}</span>
                  </div>
                  <div className="timer-block pink">
                    <div className="t-label">Total Time</div>
                    <div className="t-time">{totalTime}</div>
                  </div>
              </div>

            {/* Split with another gradient divider, then show an expanded achievements section */}
            {showAchievements && hasRASupport && isConfigured && totalAchievements > 0 && (
              <>
                <div className="ref-divider" />
                <div className="ref-achievements">
                  <div className="achievement-info">
                    {/* Progress row (hidden in compact mode) */}
                    {effMode !== 'compact' && (
                      <div className="achievement-progress">
                        <div className="achievement-count">
                          <span className="event-achievements" title={`${achievementPercent}% complete`}>
                            {achievementCount}/{totalAchievements} Achievements
                          </span>
                        </div>
                        <div className="achievement-bar" style={{flex: 1}}>
                          <div className="achievement-fill" style={{width: `${achievementPercent}%`}} />
                          <div className="achievement-percent">{achievementPercent}%</div>
                        </div>
                      </div>
                    )}

                    {/* Inline announcement inside the card; expands the card instead of floating */}
                    {raAnnounce && (() => {
                      const nowMs = Date.now()
                      const active = nowMs < announceUntil
                      const lastAchievement = (state.currentGameAchievements || [])
                        .filter(a => a.isEarned)
                        .sort((a,b) => new Date(b.dateEarned) - new Date(a.dateEarned))[0]
                      const a = lastAchievement || (state.currentGameAchievements || [])[0] || null
                      return (
                        <div className={`ra-announce-inline ${active ? 'open' : ''}`} style={{ '--ra-announce-size': `${raAnnounceSize}px` }}>
                          {a && (
                            <div className="ra-announce-card">
                              <div className="ra-announce-heading">
                                <span className="ra-announce-text">Achievement unlocked</span>
                              </div>
                              <div className="ra-announce-badge">
                                <img src={`https://media.retroachievements.org/Badge/${a.badgeName}.png`} alt={a.title} />
                              </div>
                              <div className="ra-announce-info">
                                <div className="ra-announce-title" title={a.title}>{a.title}</div>
                                <div className="ra-announce-desc" title={a.description}>{a.description}</div>
                                {raDebug && (
                                  <div className="ra-announce-debug">Announce {active ? 'active' : 'idle'} • hides in {Math.max(0, Math.ceil((announceUntil - nowMs)/1000))}s</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {raDebug && (
                      <div className="ra-debug-controls" style={{marginTop:'6px', display:'flex', gap:'8px', flexWrap:'wrap'}}>
                        <button onClick={() => setAnnounceUntil(Date.now() + raAnnounceDuration * 1000)} style={{padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer'}}>
                          Test Announce ({raAnnounceDuration}s)
                        </button>
                        <button onClick={() => setRaShowcaseUntil(Date.now() + raAutoDuration * 1000)} style={{padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer'}}>
                          Test Showcase ({raAutoDuration}s)
                        </button>
                      </div>
                    )}

                    {/* Inline badge strip (optional) */}
                    {showInlineBadges && (() => {
                      // Build the list for the strip based on rashow/debug
                      let list = [...(state.currentGameAchievements || [])]
                      let autoFallbackUsed = false
                      if (raShow === 'earned' && !raDebug) {
                        list = list.filter(a => a.isEarned)
                        // Sort by most recent earned
                        list.sort((a,b) => new Date(b.dateEarned) - new Date(a.dateEarned))
                      } else {
                        // Include all, prioritize earned first then display order
                        list.sort((a,b) => {
                          if (a.isEarned !== b.isEarned) return a.isEarned ? -1 : 1
                          // Prefer recently earned on top within earned
                          const da = a.dateEarned ? new Date(a.dateEarned).getTime() : 0
                          const db = b.dateEarned ? new Date(b.dateEarned).getTime() : 0
                          if (db !== da) return db - da
                          return (a.displayOrder || 0) - (b.displayOrder || 0)
                        })
                      }

                      // If auto showcase is active but nothing earned to show, fall back to locked badges
                      if (effMode === 'compact' && list.length === 0 && (raAuto || raAutoTest)) {
                        autoFallbackUsed = true
                        list = [...(state.currentGameAchievements || [])].sort((a,b) => {
                          if (a.isEarned !== b.isEarned) return a.isEarned ? -1 : 1
                          const da = a.dateEarned ? new Date(a.dateEarned).getTime() : 0
                          const db = b.dateEarned ? new Date(b.dateEarned).getTime() : 0
                          if (db !== da) return db - da
                          return (a.displayOrder || 0) - (b.displayOrder || 0)
                        })
                      }

                      // Determine visible items and +X more pill when exceeding max
                      let visible = list
                      let moreCount = 0
                      const cap = Math.max(0, (effMode === 'ticker' ? raMax : (isAutoShowcase ? raAutoMax : raMax)))
                      if (cap === 0) return null // hidden when max is 0
                      if (cap > 0 && list.length > cap) {
                        const visibleCount = Math.max(1, cap - 1) // reserve one slot for +X more
                        visible = list.slice(0, visibleCount)
                        moreCount = list.length - visibleCount
                      } else if (cap > 0) {
                        visible = list.slice(0, cap)
                      }

                      if (!visible.length && moreCount === 0) return raDebug ? (
                        <div className="ra-empty-note" style={{opacity:0.7, fontSize: '12px'}}>RA badge strip: no achievements to show</div>
                      ) : null

                      // For 'ticker' duplicate list for seamless loop
                      const items = effMode === 'ticker' ? [...visible, ...visible] : visible
                      const containerClass = effMode === 'ticker' ? 'badge-strip ticker' : (raScroll ? 'badge-strip scroll' : 'badge-strip')

                      return (
                        <>
                          <div 
                            className={containerClass}
                            style={{
                              marginTop: '6px',
                              '--ra-badge-size': `${effSize}px`,
                              '--ra-ticker-speed': raSpeed,
                              ...(raRows > 0 ? { maxHeight: `${(effSize * raRows) + (Math.max(raRows - 1, 0) * 6)}px` } : {})
                            }}
                          >
                            {items.map((a, idx) => (
                              <div 
                                key={`${a.id}-${idx}`} 
                                className={`badge-mini ${a.isEarnedHardcore ? 'hardcore' : ''} ${!a.isEarned ? 'locked' : ''}`} 
                                title={`${a.title} • ${a.points} pts${!a.isEarned ? ' (locked)' : ''}`}
                              >
                                <img src={`https://media.retroachievements.org/Badge/${a.badgeName}.png`} alt={a.title} />
                                {a.isEarnedHardcore && <span className="hc-dot" aria-label="Hardcore" />}
                              </div>
                            ))}
                            {moreCount > 0 && effMode !== 'ticker' && (
                              <div className="badge-more" title={`${moreCount} more achievements`}>
                                +{moreCount}
                              </div>
                            )}
                          </div>

                          {raDebug && (
                            <div className="ra-debug" style={{marginTop: '8px'}}>
                              <div className="ra-debug-row"><b>RA Configured:</b> {String(isConfigured)}</div>
                              <div className="ra-debug-row"><b>Has RA Support:</b> {String(hasRASupport)}</div>
                              <div className="ra-debug-row"><b>Counts:</b> {achievementCount}/{totalAchievements} ({achievementPercent}%) • HC {hardcoreCount}</div>
                              <div className="ra-debug-row"><b>Mode:</b> {effMode} (requested: {raMode}) • <b>Show:</b> {raShow} • <b>Size:</b> {isAutoShowcase ? `${Math.max(raSize, raAutoSize)} (auto)` : raSize}px • <b>Max:</b> {isAutoShowcase ? `${raAutoMax} (auto)` : raMax}</div>
                              <div className="ra-debug-row"><b>Scroll:</b> {String(raScroll)} • <b>Speed:</b> {raSpeed}</div>
                              <div className="ra-debug-row"><b>Auto:</b> {String(raAuto)} • <b>Auto Test:</b> {String(raAutoTest)} • <b>Duration:</b> {raAutoDuration}s • <b>Time left:</b> {Math.max(0, Math.ceil((raShowcaseUntil - now)/1000))}s • <b>Fallback:</b> {String(autoFallbackUsed)} • <b>+More:</b> {moreCount}</div>
                              <div className="ra-debug-row" style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
                                <button onClick={() => setRaShowcaseUntil(Date.now() + raAutoDuration * 1000)} style={{marginTop: '4px', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer'}}>
                                  Trigger Auto Showcase ({raAutoDuration}s)
                                </button>
                                <button onClick={() => setAnnounceUntil(Date.now() + raAnnounceDuration * 1000)} style={{marginTop: '4px', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer'}}>
                                  Trigger Announce ({raAnnounceDuration}s)
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  return (
    <>
      <div className={`overlay-chrome p-4 d-flex align-items-center justify-content-center ${isClean ? 'overlay-clean' : ''}`} style={{width:'100vw', height:'100vh', ...(timerPx>0?{'--timer-font-size': `${timerPx}px`}:{})}}>
        <div className="main-overlay-container" style={{maxWidth: '900px', width: '100%'}}>
          {/* Main Game Card */}
          <div className="overlay-card modern p-4 d-flex gap-4 align-items-center mb-4">
            {showCover && (
              <div className="cover-container" style={{width: 240, height: 320}}>
                {cover ? (
                  <img className="cover-image" src={cover} alt="" />
                ) : (
                  <div className="cover-placeholder">
                    <i className="bi bi-controller"></i>
                    <span>No Cover</span>
                  </div>
                )}
              </div>
            )}
            <div className="game-info flex-grow-1 d-flex flex-column">
              <div className="game-title title-wrap-2" style={{fontSize: '2.5rem', fontWeight: '700', marginBottom: '1rem'}}>{game.title}</div>
              <div className="game-meta" style={{fontSize: '1.5rem', fontWeight: '500'}}>
                {game.console}
                {showYear && game.release_year ? ` • ${game.release_year}` : ''}
                {showPublisher && game.publisher ? ` • ${game.publisher}` : ''}
              </div>

            {/* Inline Achievements inside main card */}
            {(() => {
              const { currentGameAchievements, currentGameProgress, loading } = state
              const hasRASupport = game && RA.hasRetroAchievementsSupport(game)
              const canShow = showAchievements && isConfigured && hasRASupport
              if (!canShow) return null

              if (loading?.gameAchievements) {
                return (
                  <div className="inline-achievements mt-3">
                    <div className="achievement-text">Loading achievements…</div>
                  </div>
                )
              }

              const earned = currentGameProgress?.numAchieved || currentGameAchievements.filter(a => a.isEarned).length
              const total = currentGameProgress?.numPossibleAchievements || currentGameAchievements.length
              if (!total) return null
              const percent = Math.round((earned / total) * 100)
              const recentEarned = currentGameAchievements
                .filter(a => a.isEarned)
                .sort((a,b) => new Date(b.dateEarned) - new Date(a.dateEarned))
                .slice(0, 6)

              return (
                <div className="inline-achievements mt-3">
                  <div className="achievement-progress-inline">
                    <span className="achievement-text">{earned}/{total} Achievements ({percent}%)</span>
                    <div className="achievement-bar-inline">
                      <div className="achievement-fill" style={{width: `${percent}%`}}></div>
                    </div>
                  </div>
                  {recentEarned.length > 0 && (
                    <div className="badge-strip mt-2">
                      {recentEarned.map(a => (
                        <div key={a.id} className={`badge-mini ${a.isEarnedHardcore ? 'hardcore' : ''}`} title={`${a.title} • ${a.points} pts`}>
                          <img src={`https://media.retroachievements.org/Badge/${a.badgeName}.png`} alt={a.title} />
                          {a.isEarnedHardcore && <span className="hc-dot" aria-label="Hardcore" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Timer Section */}
        <div className="timer-section d-flex gap-3">
          <div className="timer-card current-game">
            <div className="timer-label">Current Game</div>
            <div className="timer-value">{currentGameTime}</div>
          </div>
          <div className="timer-card event-total">
            <div className="timer-label">Event Total</div>
            <div className="timer-value">{totalTime}</div>
          </div>
          {/* Debug indicator - only show when not clean mode */}
          {!isClean && (
            <div className="debug-indicator" style={{fontSize: '10px', color: '#666', position: 'absolute', bottom: '5px', right: '5px'}}>
              Last: {lastUpdate}
            </div>
          )}
        </div>
      </div>
      </div>
      <AchievementNotificationManager />
    </>
  )
}
