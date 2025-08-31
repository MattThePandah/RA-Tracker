import React from 'react'
import * as Storage from '../services/storage.js'
import { useAchievements } from '../context/AchievementContext.jsx'
import * as RA from '../services/retroachievements.js'

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

function useClock() {
  const [now, setNow] = React.useState(new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function OverlayFooter() {
  const { state, loadGameAchievements, isConfigured } = useAchievements()
  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const isClean = params.get('clean') === '1'
  const barHeight = Math.max(40, Math.min(200, parseInt(params.get('barheight') || '70', 10)))
  const title = params.get('title') || 'PSFest'
  const widthParam = params.get('width') ? Math.max(180, Math.min(600, parseInt(params.get('width'), 10) || 0)) : null
  const timeMode = (params.get('time') || 'datetime').toLowerCase() // 'datetime' | 'time'
  const timeFmt = (params.get('timefmt') || '24').toLowerCase() // '24' | '12'
  const showSeconds = params.get('seconds') !== '0'
  const showDate = timeMode !== 'time'
  const dateFmt = (params.get('datefmt') || 'short').toLowerCase() // 'short' | 'long'
  const timeStyle = (params.get('timestyle') || 'glow').toLowerCase() // 'glow' | 'neon' | 'solid' | 'psfest'
  const showTimers = params.get('showtimers') === '1'
  const showCurrent = params.get('showcurrent') === '1'
  const currentCover = params.get('cgcover') !== '0'
  const containerWidth = params.get('containerwidth') ? Math.max(600, Math.min(3840, parseInt(params.get('containerwidth'), 10) || 0)) : null
  
  // Badge carousel integration parameters
  const showBadges = params.get('showbadges') === '1'
  const badgeCount = Math.max(1, Math.min(8, parseInt(params.get('badgecount') || '4', 10)))
  const rotateMs = parseInt(params.get('badgerotate') || '8000', 10)
  const achievementPoll = parseInt(params.get('rapoll') || '60000', 10)
  const now = useClock()
  const timeStr = formatTimeString(now, { timeFmt, showSeconds })
  const dateStr = formatDate(now, dateFmt)
  const isTight = barHeight <= 72
  const tick = usePoll(poll)

  // Apply clean overlay styling to document body
  React.useEffect(() => {
    if (isClean) {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [isClean])

  const [stats, setStats] = React.useState({ total: 0, completed: 0, percent: 0 })
  const [timers, setTimers] = React.useState({ currentGameTime: '00:00:00', psfestTime: '000:00:00' })
  const [current, setCurrent] = React.useState(null)
  
  // Badge carousel state
  const [game, setGame] = React.useState(null)
  const [badgeIndex, setBadgeIndex] = React.useState(0)
  const [isTransitioning, setIsTransitioning] = React.useState(false)

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const load = async () => {
      try {
        const r = await fetch(`${base}/overlay/stats`)
        if (r.ok) {
          const j = await r.json()
          const total = Number(j.total || 0)
          const completed = Number(j.completed || 0)
          const percent = typeof j.percent === 'number' ? j.percent : (total ? Math.round((completed / total) * 100) : 0)
          setStats({ total, completed, percent })
          return
        }
      } catch (err) {
        // fall through to localStorage
      }

      try {
        const games = Storage.getGames()
        const total = games.length
        const completed = games.filter(g => g.status === 'Completed').length
        const percent = total ? Math.round((completed / total) * 100) : 0
        setStats({ total, completed, percent })
      } catch {
        setStats({ total: 0, completed: 0, percent: 0 })
      }
    }
    load()
  }, [tick, poll])

  // Load current game for chip
  React.useEffect(() => {
    if (!showCurrent) return
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const tryFetch = async () => {
      let g = null
      try {
        const res = await fetch(`${base}/overlay/current`)
        if (res.ok) {
          const json = await res.json()
          g = json?.current || null
          if (g) {
            setCurrent(g)
            return
          }
        }
      } catch {}
      try {
        let games = Storage.getGames()
        let curId = Storage.getCurrentGameId()
        g = games.find(x => x.id === curId) || null
        setCurrent(g)
      } catch { setCurrent(null) }
    }
    tryFetch()
  }, [tick, showCurrent])

  React.useEffect(() => {
    if (!showTimers) return
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let id
    const fetchTimers = async () => {
      try {
        const res = await fetch(`${base}/overlay/timers`)
        if (res.ok) {
          const t = await res.json()
          if (t?.currentGameTime && t?.psfestTime) {
            setTimers({ currentGameTime: t.currentGameTime, psfestTime: t.psfestTime })
          }
        }
      } catch {}
    }
    fetchTimers()
    id = setInterval(fetchTimers, 1000)
    return () => clearInterval(id)
  }, [showTimers])

  // Badge carousel game loading
  React.useEffect(() => {
    if (!showBadges) return
    
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const tryFetch = async () => {
      let g = null
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        const r = await fetch(`${base}/overlay/current`, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (r.ok) {
          g = await r.json()
        }
        
        if (!g?.current) {
          const id = Storage.getCurrentGameId()
          if (id) {
            const games = Storage.getGames()
            const found = games.find(x => x.id === id)
            if (found) {
              g = { current: found }
            }
          }
        }
      } catch (error) {
        const id = Storage.getCurrentGameId()
        if (id) {
          const games = Storage.getGames()
          const found = games.find(x => x.id === id)
          if (found) {
            g = { current: found }
          }
        }
      }
      setGame(g)
    }
    tryFetch()
  }, [tick, showBadges])

  // Load achievements when game changes
  const [currentGameId, setCurrentGameId] = React.useState(null)
  
  React.useEffect(() => {
    if (!showBadges) return
    
    const newGameId = game?.current?.id || null
    if (newGameId !== currentGameId) {
      setCurrentGameId(newGameId)
      if (newGameId && RA.hasRetroAchievementsSupport(game.current)) {
        loadGameAchievements(newGameId, true)
      }
    }
  }, [game?.current?.id, currentGameId, loadGameAchievements, showBadges])

  // Badge carousel rotation
  const upcoming = React.useMemo(() => {
    if (!showBadges) return []
    return state.currentGameAchievements
      .filter(a => !a.isEarned)
      .sort((a, b) => b.points - a.points)
  }, [state.currentGameAchievements, showBadges])

  React.useEffect(() => {
    if (!showBadges || upcoming.length <= badgeCount) return
    
    const id = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setBadgeIndex(i => {
          const nextIndex = i + badgeCount
          return nextIndex >= upcoming.length ? 0 : nextIndex
        })
        setIsTransitioning(false)
      }, 300)
    }, rotateMs)
    return () => clearInterval(id)
  }, [upcoming.length, rotateMs, badgeCount, showBadges])
  
  const visibleBadges = React.useMemo(() => {
    if (!showBadges) return []
    const remainingFromIndex = upcoming.length - badgeIndex
    const count = Math.min(badgeCount, remainingFromIndex)
    return upcoming.slice(badgeIndex, badgeIndex + count)
  }, [upcoming, badgeIndex, badgeCount, showBadges])

  return (
    <div className={`overlay-chrome ${isClean ? 'overlay-clean' : ''}`} style={{ width: '100vw', height: '100vh' }}>
      <div className="overlay-footer-bar" style={{ height: `${barHeight}px` }}>
        <div className="footer-inner" style={{ ...(containerWidth ? { maxWidth: containerWidth, margin: '0 auto' } : {}) }}>
          {/* Badge carousel at far left */}
          {showBadges && game?.current && isConfigured && RA.hasRetroAchievementsSupport(game.current) && visibleBadges.length > 0 && (
            <div className="footer-badges-section">
              <div className="footer-badges-label">
                <i className="bi bi-trophy"></i>
                <span>Upcoming Achievements</span>
              </div>
              <div className={`footer-inline-badges ${isTransitioning ? 'transitioning' : ''}`}>
              {visibleBadges.map((achievement, i) => (
                <div className="footer-inline-badge" key={`${achievement.id}-${badgeIndex}-${i}`} style={{'--delay': `${i * 0.1}s`}}>
                  <div className="inline-badge-image">
                    <img src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`} alt={achievement.title} />
                    <div className="badge-lock-overlay">
                      <i className="bi bi-lock-fill"></i>
                    </div>
                  </div>
                  <div className="inline-badge-info">
                    <div className="inline-badge-title">{achievement.title}</div>
                    <div className="inline-badge-desc">{achievement.description}</div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* Spacer pushes time + PSFest cluster to the right */}
          <div className="footer-spacer" />

          {/* Optional: Current Game chip (left of timer/time cluster) */}
          {showCurrent && current && (
            <div className={`current-chip ${isTight ? 'tight' : ''}`} title={current.title}>
              {currentCover && (
                current.image_url ? (
                  <img className="chip-cover" src={current.image_url} alt="" />
                ) : (
                  <div className="chip-cover placeholder"><i className="bi bi-controller"></i></div>
                )
              )}
              <div className="chip-info">
                <span className="chip-title" title={current.title}>{current.title}</span>
                <span className="chip-meta">{current.console}{current.release_year ? ` • ${current.release_year}` : ''}</span>
              </div>
            </div>
          )}

          {/* Optional compact timers (to the left of time) */}
          {showTimers && (
            <div className="footer-timers d-flex align-items-center" style={{ gap: 8 }}>
              <div className={`timer-chip ${isTight ? 'tight' : ''}`} title="Current Game">
                <span className="timer-label">Current</span>
                <span className="timer-value">{timers.currentGameTime}</span>
              </div>
              <div className={`timer-chip ${isTight ? 'tight' : ''}`} title="PSFest Total">
                <span className="timer-label">PSFest</span>
                <span className="timer-value">{timers.psfestTime}</span>
              </div>
            </div>
          )}

          {/* Time just to the left of PSFest */}
          {timeStyle === 'psfest' ? (
            <div className={`footer-time time--psfest`} title="Date & Time">
              <span className="time-text">{timeStr}{showDate ? ` • ${dateStr}` : ''}</span>
            </div>
          ) : (
            <div className={`footer-time ${timeStyle === 'neon' ? 'time--neon' : timeStyle === 'glow' ? 'time--glow' : 'time--solid'}`} title="Date & Time">
              {renderTime(now, { timeFmt, showSeconds })}
              {showDate && (
                <span className="time-sep"> • </span>
              )}
              {showDate && (
                <span className="time-date">{dateStr}</span>
              )}
            </div>
          )}

          {/* PSFest compact at far right */}
          <div className={`stats-compact-card footer-psfest ${isTight ? 'tight' : ''}`} style={{ ...(widthParam ? { width: widthParam } : {}) }}>
            <div className="d-flex align-items-center justify-content-between" style={{ gap: 8, marginBottom: 6 }}>
              <div className="stats-compact-title">{title}</div>
              <div className="percent-badge">{stats.percent}%</div>
            </div>
            <div className="progress-bar-bg stats-compact-bar">
              <div className="progress-bar-fill" style={{ width: `${stats.percent}%` }} />
            </div>
            <div className="d-flex justify-content-end stats-compact-counts">
              <span>{stats.completed.toLocaleString()}/{stats.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderTime(date, { timeFmt = '24', showSeconds = true }) {
  const hRaw = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()
  const is12 = timeFmt === '12'
  const ampm = is12 ? (hRaw >= 12 ? 'PM' : 'AM') : ''
  const h = is12 ? (hRaw % 12 === 0 ? 12 : hRaw % 12) : hRaw
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return (
    <>
      <span className="time-hh">{hh}</span>
      <span className="time-colon blink">:</span>
      <span className="time-mm">{mm}</span>
      {showSeconds && <><span className="time-colon blink">:</span><span className="time-ss">{ss}</span></>}
      {is12 && <span className="time-ampm"> {ampm}</span>}
    </>
  )
}

function formatDate(date, mode = 'short') {
  if (mode === 'long') {
    return date.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }
  // short
  return date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatTimeString(date, { timeFmt = '24', showSeconds = true }) {
  const hRaw = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()
  const is12 = timeFmt === '12'
  const ampm = is12 ? (hRaw >= 12 ? 'PM' : 'AM') : ''
  const h = is12 ? (hRaw % 12 === 0 ? 12 : hRaw % 12) : hRaw
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return `${hh}:${mm}${showSeconds ? `:${ss}` : ''}${is12 ? ` ${ampm}` : ''}`
}

 
