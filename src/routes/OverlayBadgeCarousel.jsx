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
  const rotateMs = parseInt(params.get('rotate') || '5000', 10)
  const showCount = Math.max(parseInt(params.get('show') || '3', 10), 1)
  const isClean = params.get('clean') === '1'

  const tick = usePoll(poll)
  const [game, setGame] = React.useState(null)

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
  React.useEffect(() => {
    if (!game) return
    if (!RA.hasRetroAchievementsSupport(game)) return
    loadGameAchievements(game.id)
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
      setIndex(i => (i + showCount) % upcoming.length)
    }, rotateMs)
    return () => clearInterval(id)
  }, [upcoming.length, rotateMs, showCount])

  const containerClass = `overlay-chrome badge-carousel-overlay ${isClean ? 'overlay-clean' : ''}`

  if (!game) {
    return <div className={containerClass}>No game selected</div>
  }
  if (!isConfigured || !RA.hasRetroAchievementsSupport(game)) {
    return <div className={containerClass}>RetroAchievements not configured</div>
  }
  if (state.loading.gameAchievements) {
    return <div className={containerClass}>Loading achievements…</div>
  }
  if (upcoming.length === 0) {
    return <div className={containerClass}>All achievements earned!</div>
  }

  const visible = React.useMemo(() => {
    const count = Math.min(showCount, upcoming.length)
    return Array.from({ length: count }, (_, i) => upcoming[(index + i) % upcoming.length])
  }, [upcoming, index, showCount])

  const pageCount = Math.ceil(upcoming.length / showCount)
  const currentPage = Math.floor(index / showCount) + 1

  return (
    <div className={containerClass}>
      <div className="badge-heading">Upcoming Achievements</div>
      <div className="badge-list">
        {visible.map(a => (
          <div className="badge-item" key={a.id}>
            <div className="badge-image">
              <img src={`https://media.retroachievements.org/Badge/${a.badgeName}.png`} alt={a.title} />
            </div>
            <div className="badge-info">
              <div className="badge-title">{a.title}</div>
              <div className="badge-desc">{a.description}</div>
              <div className="badge-points">{a.points} pts</div>
            </div>
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <div className="badge-counter">{currentPage}/{pageCount}</div>
      )}
    </div>
  )
}

