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

  React.useEffect(() => {
    if (!game?.current) return
    if (!RA.hasRetroAchievementsSupport(game.current)) return
    loadGameAchievements(game.current.id)
  }, [game, loadGameAchievements])

  const upcoming = React.useMemo(() => {
    return state.currentGameAchievements
      .filter(a => !a.isEarned)
      .sort((a, b) => b.points - a.points)
  }, [state.currentGameAchievements])

  const [index, setIndex] = React.useState(0)
  React.useEffect(() => {
    if (upcoming.length === 0) return
    setIndex(0)
    if (upcoming.length <= showCount) return
    
    const id = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setIndex(i => (i + 1) % upcoming.length) // Rotate one at a time for smoother transitions
        setIsTransitioning(false)
      }, 300) // Short transition delay
    }, rotateMs)
    return () => clearInterval(id)
  }, [upcoming.length, rotateMs, showCount])
  
  const visible = React.useMemo(() => {
    const count = Math.min(showCount, upcoming.length)
    return Array.from({ length: count }, (_, i) => upcoming[(index + i) % upcoming.length])
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

