import React from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import * as Storage from '../services/storage.js'
import * as RA from '../services/retroachievements.js'

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

export default function OverlayBadgeCarousel() {
  const { state, loadGameAchievements, isConfigured } = useAchievements()
  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const achievementPoll = parseInt(params.get('rapoll') || '60000', 10) // Default 60 seconds for achievements
  const rotateMs = parseInt(params.get('rotate') || '8000', 10) // Longer rotation for readability
  const isClean = params.get('clean') === '1'
  
  // Stream-friendly: compact layout for corner positioning  
  const showCount = Math.max(parseInt(params.get('show') || '3', 10), 1)
  const position = params.get('position') || 'top-left' // top-right, top-left, bottom-right, bottom-left, center

  const tick = usePoll(poll)
  const [game, setGame] = React.useState(null)
  const [isTransitioning, setIsTransitioning] = React.useState(false)

  // Fetch current game periodically
  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const tryFetch = async () => {
      let g = null
      try {
        const r = await fetch(`${base}/overlay/current`)
        if (r.ok) g = await r.json()
        if (!g) {
          const id = Storage.getCurrentGameId()
          if (id) {
            const games = Storage.getGames()
            g = games.find(x => x.id === id)
          }
        }
      } catch {}
      setGame(g)
    }
    tryFetch()
  }, [tick])

  // Load achievements when game changes
  // Apply clean overlay styling to document body
  React.useEffect(() => {
    if (isClean) {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [isClean])

  // Track game ID separately to avoid reloading achievements on every game object update
  const [currentGameId, setCurrentGameId] = React.useState(null)
  const [lastAchievementCheck, setLastAchievementCheck] = React.useState(0)
  const [recentActivityDetected, setRecentActivityDetected] = React.useState(false)
  const [lastUpdateTime, setLastUpdateTime] = React.useState(0)
  
  React.useEffect(() => {
    const newGameId = game?.current?.id || null
    if (newGameId !== currentGameId) {
      setCurrentGameId(newGameId)
      if (newGameId && RA.hasRetroAchievementsSupport(game.current)) {
        loadGameAchievements(newGameId, true) // Only reload when game ID actually changes
      }
    }
  }, [game?.current?.id, currentGameId, loadGameAchievements])

  // Detect achievement changes and adjust polling frequency
  React.useEffect(() => {
    const earnedCount = state.currentGameAchievements.filter(a => a.isEarned).length
    const now = Date.now()
    
    // Update timestamp when achievements change
    if (state.currentGameAchievements.length > 0) {
      setLastUpdateTime(now)
    }
    
    if (lastAchievementCheck > 0 && earnedCount > 0) {
      const latestEarnedTime = Math.max(...state.currentGameAchievements
        .filter(a => a.isEarned && a.dateEarned)
        .map(a => new Date(a.dateEarned).getTime()), 0)
      
      // If we have a recent achievement (within last 5 minutes), enable frequent checking
      const recentThreshold = now - (5 * 60 * 1000) // 5 minutes
      const hasRecentActivity = latestEarnedTime > recentThreshold
      
      if (hasRecentActivity !== recentActivityDetected) {
        console.log('Badge carousel: Recent activity detected:', hasRecentActivity, 'Latest earned:', new Date(latestEarnedTime).toLocaleTimeString())
        setRecentActivityDetected(hasRecentActivity)
      }
    }
    
    setLastAchievementCheck(now)
  }, [state.currentGameAchievements, lastAchievementCheck, recentActivityDetected])

  // Smart polling: frequent when recent activity, normal otherwise
  React.useEffect(() => {
    if (!currentGameId || !game?.current || !RA.hasRetroAchievementsSupport(game.current) || !isConfigured) {
      console.log('Badge carousel: Skipping achievement polling', { currentGameId, hasRA: !!game?.current && RA.hasRetroAchievementsSupport(game.current), isConfigured })
      return
    }
    
    // Use shorter intervals if recent activity detected
    const pollInterval = recentActivityDetected ? 15000 : achievementPoll // 15 seconds vs 60 seconds
    console.log('Badge carousel: Setting up achievement polling every', pollInterval, 'ms', recentActivityDetected ? '(frequent - recent activity)' : '(normal)')
    
    const achievementPollInterval = setInterval(() => {
      console.log('Badge carousel: Polling achievements for game', currentGameId)
      // Only poll if not currently loading and we have a game
      if (currentGameId && !state.loading?.gameAchievements) {
        loadGameAchievements(currentGameId, true) // Force refresh to get latest achievement state
      }
    }, pollInterval)
    
    return () => {
      console.log('Badge carousel: Clearing achievement polling interval')
      clearInterval(achievementPollInterval)
    }
  }, [currentGameId, isConfigured, achievementPoll, recentActivityDetected]) // Include recentActivityDetected

  const upcoming = React.useMemo(() => {
    return state.currentGameAchievements
      .filter(a => !a.isEarned)
      .sort((a, b) => b.points - a.points)
  }, [state.currentGameAchievements])

  const [index, setIndex] = React.useState(0)
  const [lastUpcomingLength, setLastUpcomingLength] = React.useState(0)
  
  React.useEffect(() => {
    if (upcoming.length === 0) {
      setIndex(0)
      setLastUpcomingLength(0)
      return
    }
    
    // Only reset index if the number of achievements changed significantly (not just updates)
    if (Math.abs(upcoming.length - lastUpcomingLength) > 0) {
      console.log('Badge carousel: Achievement count changed from', lastUpcomingLength, 'to', upcoming.length)
      setIndex(0)
      setLastUpcomingLength(upcoming.length)
    }
    
    if (upcoming.length <= showCount) return
    
    const id = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setIndex(i => {
          const nextIndex = i + showCount
          return nextIndex >= upcoming.length ? 0 : nextIndex // Jump to next page, wrap to start
        })
        setIsTransitioning(false)
      }, 300) // Short transition delay
    }, rotateMs)
    return () => clearInterval(id)
  }, [upcoming.length, rotateMs, showCount, lastUpcomingLength])
  
  const visible = React.useMemo(() => {
    const remainingFromIndex = upcoming.length - index
    const count = Math.min(showCount, remainingFromIndex)
    return upcoming.slice(index, index + count)
  }, [upcoming, index, showCount])

  const containerClass = `overlay-chrome badge-carousel-overlay position-${position} ${isClean ? 'overlay-clean' : ''} ${isTransitioning ? 'transitioning' : ''}`
  const currentGame = game?.current
  const pageCount = Math.ceil(upcoming.length / showCount)
  const currentPage = Math.floor(index / showCount) + 1

  if (!currentGame) {
    return <div className={containerClass}>No game selected</div>
  }
  if (!isConfigured || !RA.hasRetroAchievementsSupport(currentGame)) {
    return <div className={containerClass}>RetroAchievements not configured</div>
  }
  if (state.loading.gameAchievements) {
    return <div className={containerClass}>Loading achievements…</div>
  }
  if (upcoming.length === 0) {
    return <div className={containerClass}>All achievements earned!</div>
  }

  return (
    <div className={containerClass}>
      <div className="badge-header">
        <div className="badge-heading">Locked Achievements</div>
        {pageCount > 1 && (
          <div className="badge-counter">{currentPage}/{pageCount}</div>
        )}
        {lastUpdateTime > 0 && (
          <div style={{fontSize: '10px', opacity: 0.6, marginTop: '2px'}}>
            Updated: {new Date(lastUpdateTime).toLocaleTimeString()}
          </div>
        )}
      </div>
      <div className="badge-list">
        {visible.map((achievement, i) => (
          <div className="badge-item" key={`${achievement.id}-${index}-${i}`} style={{'--delay': `${i * 0.1}s`}}>
            <div className="badge-image">
              <img src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`} alt={achievement.title} />
            </div>
            <div className="badge-info">
              <div className="badge-title">{achievement.title}</div>
              <div className="badge-desc">{achievement.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

