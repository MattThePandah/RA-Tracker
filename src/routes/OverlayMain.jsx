import React from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import * as Storage from '../services/storage.js'
import * as RA from '../services/retroachievements.js'
import * as Cache from '../services/cache.js'

// Enhanced cover loading that handles custom covers and proxies
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
  
  // Handle IGDB URLs with proxy support
  const base = import.meta.env.VITE_IGDB_PROXY_URL
  if (imageUrl.startsWith('https://') && base) {
    return `${base}/cover?src=${encodeURIComponent(imageUrl)}`
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
    isInHardcoreMode
  } = useAchievements()

  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const style = (params.get('style') || 'card').toLowerCase() // 'card' | 'lowerthird' | 'slim'
  const showCover = params.get('showcover') !== '0'
  const showAchievements = params.get('achievements') !== '0'
  const isClean = params.get('clean') === '1'
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
  const [psfestTime, setPsfestTime] = React.useState('000:00:00')
  const [lastUpdate, setLastUpdate] = React.useState('')
  const [stats, setStats] = React.useState({ total: 0, completed: 0, percent: 0 })

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

  // Load achievements when game changes
  React.useEffect(() => {
    if (game && RA.hasRetroAchievementsSupport(game) && isConfigured && showAchievements) {
      loadGameAchievements(game.id)
    }
  }, [game, isConfigured, loadGameAchievements, showAchievements])

  // Timer updates: prefer server-calculated timers for OBS reliability.
  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let id

    const fetchTimers = async () => {
      try {
        const res = await fetch(`${base}/overlay/timers`)
        if (res.ok) {
          const t = await res.json()
          if (t?.currentGameTime && t?.psfestTime) {
            setCurrentGameTime(t.currentGameTime)
            setPsfestTime(t.psfestTime)
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
        const settings = Storage.getSettings()
        if (settings.psfestStartTime) {
          const psfestStartTime = new Date(settings.psfestStartTime).getTime()
          const psfestElapsed = Math.floor((now - psfestStartTime) / 1000)
          setPsfestTime(formatTime(Math.max(0, psfestElapsed), true))
        } else {
          setPsfestTime('000:00:00')
        }
        setLastUpdate(new Date().toLocaleTimeString())
      } catch {
        setCurrentGameTime('00:00:00')
        setPsfestTime('000:00:00')
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
    
    return (
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
                  <div className="ref-sub">{game.console}</div>
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
                <div className="psfest-left">
                  <span className="psfest-game">Game {gameNumber}{showTotal && stats.total ? ` of ${stats.total}` : ''}</span>
                </div>
                <div className="timer-block pink">
                  <div className="t-label">Total Time</div>
                  <div className="t-time">{psfestTime}</div>
                </div>
            </div>

            {/* Split with another gradient divider, then show an expanded achievements section */}
            {showAchievements && hasRASupport && isConfigured && totalAchievements > 0 && (
              <>
                <div className="ref-divider" />
                <div className="ref-achievements">
                  <div className="achievement-info">
                    <div className="achievement-progress">
                      <div className="achievement-count">
                        <span className="psfest-achievements" title={`${achievementPercent}% complete`}>
                          {achievementCount}/{totalAchievements} Achievements
                      </span>
                      </div>
                      <div className="achievement-bar" style={{flex: 1}}>
                        <div className="achievement-fill" style={{width: `${achievementPercent}%`}} />
                        <div className="achievement-percent">{achievementPercent}%</div>
                      </div>
                      {showHardcore && (
                        <div className="hardcore-count" title="Hardcore achievements earned">
                          <i className="bi bi-lightning-charge-fill hardcore-icon"></i>
                          <span className="hardcore-text">{hardcoreCount} HC</span>
                        </div>
                      )}
                    </div>

                    {/* Recently earned badge strip */}
                    {(() => {
                      const recentEarned = state.currentGameAchievements
                        .filter(a => a.isEarned)
                        .sort((a,b) => new Date(b.dateEarned) - new Date(a.dateEarned))
                        .slice(0, 10)
                      if (!recentEarned.length) return null
                      return (
                        <div className="badge-strip" style={{marginTop: '6px'}}>
                          {recentEarned.map(a => (
                            <div key={a.id} className={`badge-mini ${a.isEarnedHardcore ? 'hardcore' : ''}`} title={`${a.title} • ${a.points} pts`}>
                              <img src={`https://media.retroachievements.org/Badge/${a.badgeName}.png`} alt={a.title} />
                              {a.isEarnedHardcore && <span className="hc-dot" aria-label="Hardcore" />}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
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
              {game.console}{game.release_year ? ` • ${game.release_year}` : ''}
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
          <div className="timer-card psfest-total">
            <div className="timer-label">PSFest Total</div>
            <div className="timer-value">{psfestTime}</div>
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
  )
}
