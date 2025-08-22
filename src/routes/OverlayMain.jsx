import React from 'react'
import * as Storage from '../services/storage.js'

// Use proxy URL for images so OBS doesn't rely on IndexedDB. Fallback to direct URL if no proxy.
const proxyImage = (url) => {
  const base = import.meta.env.VITE_IGDB_PROXY_URL
  if (!url) return null
  return base ? `${base}/cover?src=${encodeURIComponent(url)}` : url
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
  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const style = (params.get('style') || 'card').toLowerCase() // 'card' | 'lowerthird'
  const showCover = params.get('showcover') !== '0'
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
  const [currentGameTime, setCurrentGameTime] = React.useState('00:00:00')
  const [psfestTime, setPsfestTime] = React.useState('000:00:00')
  const [lastUpdate, setLastUpdate] = React.useState('')

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
            setCover(g?.image_url ? proxyImage(g.image_url) : null)
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
        setCover(g?.image_url ? proxyImage(g.image_url) : null)
      } catch (storageErr) {
        console.log('localStorage fallback failed:', storageErr.message)
        setGame(null)
        setCover(null)
      }
    }
    tryFetch()
  }, [tick, storageUpdate])

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

  if (!game) return <div className="overlay-chrome p-3">No current game</div>

  if (style === 'lowerthird') {
    return (
      <div className={`overlay-chrome ${isClean ? 'overlay-clean' : ''}`} style={{width:'100vw', height:'100vh', ...(timerPx>0?{'--timer-font-size': `${timerPx}px`}:{})}}>
        <div className="lowerthird-wrap">
          <div className="lowerthird modern-lowerthird">
            {showCover && (
              <div className="cover-container" style={{width: 140, height: 96}}>
                {cover ? (
                  <img className="cover-image" src={cover} alt="" />
                ) : (
                  <div className="cover-placeholder">
                    <i className="bi bi-controller"></i>
                  </div>
                )}
              </div>
            )}
            <div className="game-info">
              <div className="game-title lowerthird-title">{game.title}</div>
              <div className="game-meta lowerthird-meta">
                {game.console}{game.release_year ? ` • ${game.release_year}` : ''}
                {game.status && (
                  <span className={`game-status ${game.status.toLowerCase().replace(' ', '-')} ms-2`}>
                    {game.status}
                  </span>
                )}
              </div>
            </div>
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
          <div className="game-info flex-grow-1">
            <div className="game-title">{game.title}</div>
            <div className="game-meta mb-3">
              {game.console}{game.release_year ? ` • ${game.release_year}` : ''}
            </div>
            {game.status && (
              <div className={`game-status ${game.status.toLowerCase().replace(' ', '-')}`}>
                {game.status}
              </div>
            )}
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
