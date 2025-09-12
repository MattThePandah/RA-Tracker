import React, { useMemo, useState } from 'react'
import { useGame } from '../context/GameContext.jsx'
import * as Bonus from '../utils/bonusDetection.js'
import { collectGenres, detectGenres } from '../utils/genreDetection.js'
import SmartRoulette3D from '../components/SmartRoulette3D.jsx'

// Use proxy image for viewer contexts (works in OBS too). Fallback to direct URL.
const proxyImage = (url) => {
  const base = import.meta.env.VITE_IGDB_PROXY_URL
  if (!url) return null
  return base ? `${base}/cover?src=${encodeURIComponent(url)}` : url
}

export default function Select() {
  const { state, dispatch } = useGame()
  const [selected, setSelected] = useState(null)
  const [q, setQ] = useState('')
  const [consoleFilter, setConsoleFilter] = useState('All')
  const [bonusMode, setBonusMode] = useState(state.settings.hideBonusGames ? 'exclude' : 'include')
  const [hideAllBonus, setHideAllBonus] = useState(state.settings.hideBonusGames || false)
  const [bonusCats, setBonusCats] = useState(() => Object.keys(Bonus.bonusCategories).reduce((m,k)=>(m[k]=true,m),{}))
  const allGenres = useMemo(() => collectGenres(state.games), [state.games])
  const [selectedGenres, setSelectedGenres] = useState([])
  const consoles = useMemo(() => Array.from(new Set(state.games.map(g => g.console))), [state.games])

  const eligible = useMemo(() => {
    let arr = state.games.filter(g => g.status !== 'Completed')
    // Search
    if (q) arr = arr.filter(g => g.title.toLowerCase().includes(q.toLowerCase()))
    // Console filter
    if (consoleFilter !== 'All') arr = arr.filter(g => g.console === consoleFilter)
    // Bonus mode
    if (hideAllBonus || bonusMode === 'exclude') {
      arr = arr.filter(g => !Bonus.isBonus(g.title))
    } else if (bonusMode === 'only') {
      arr = arr.filter(g => {
        const tags = Bonus.detectBonusTags(g.title)
        if (!tags.length) return false
        return tags.some(t => bonusCats[t])
      })
    }
    // Genres
    if (selectedGenres.length) {
      arr = arr.filter(g => {
        const gs = detectGenres(g.title)
        return gs.some(x => selectedGenres.includes(x))
      })
    }
    return arr
  }, [state.games, q, consoleFilter, bonusMode, bonusCats, selectedGenres])

  // Stable key reflecting only membership (ids), not metadata changes
  const poolKey = useMemo(() => {
    const ids = eligible.map(g => g.id)
    ids.sort()
    return ids.join('|')
  }, [eligible])

  const onGameSelected = (game) => {
    setSelected(game)
    // Auto-flag as In Progress if not started, and set start date
    if (game.status === 'Not Started') {
      const updated = { ...game, status: 'In Progress', date_started: game.date_started || new Date().toISOString() }
      dispatch({ type: 'UPDATE_GAME', game: updated })
    }
    dispatch({ type: 'SET_CURRENT', id: game.id })
  }

  // Build filters object for SmartRoulette
  const filters = {
    console: consoleFilter,
    search: q,
    hasCovers: false, // Could add this as a filter option
    bonusMode,
    selectedGenres
  }

  return (
    <div className="p-3">
      <h2 className="h4">🎮 Game Selection</h2>
      <div className="text-secondary mb-3">
        Filter your game library and pick randomly from {eligible.length.toLocaleString()} eligible games.
      </div>

      {/* Filter Panel */}
      <div className="card bg-panel border border-secondary rounded-4 p-3 mb-4">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label small">Search</label>
            <input 
              className="form-control form-control-sm" 
              value={q} 
              onChange={e=>setQ(e.target.value)} 
              placeholder="Find title..." 
            />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small">Console</label>
            <select 
              className="form-select form-select-sm" 
              value={consoleFilter} 
              onChange={e=>setConsoleFilter(e.target.value)}
            >
              <option>All</option>
              {consoles.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small">Bonus Games</label>
            <select 
              className="form-select form-select-sm" 
              value={bonusMode} 
              onChange={e=>setBonusMode(e.target.value)}
              >
              <option value="include">Include</option>
              <option value="exclude">Exclude</option>
              <option value="only">Only Bonus</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small">RetroAchievements Bonus</label>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="hideAllBonus" checked={hideAllBonus} onChange={e=>setHideAllBonus(e.target.checked)} />
              <label className="form-check-label small" htmlFor="hideAllBonus">Hide subsets, unlicensed, etc.</label>
            </div>
          </div>

          {!hideAllBonus && bonusMode !== 'exclude' && (
            <div className="col-12">
              <label className="form-label small">Bonus Categories</label>
              <div className="d-flex flex-wrap gap-2 small">
                {Object.keys(Bonus.bonusCategories).map(cat => (
                  <label 
                    key={cat} 
                    className={`badge ${bonusCats[cat] ? 'bg-primary' : 'badge-soft'}`} 
                    style={{cursor:'pointer'}}
                  >
                    <input 
                      type="checkbox" 
                      className="form-check-input me-1" 
                      checked={!!bonusCats[cat]} 
                      onChange={e=>setBonusCats(prev=>({...prev,[cat]:e.target.checked}))} 
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="col-12">
            <label className="form-label small">Genres</label>
            <div className="d-flex flex-wrap gap-2">
              {allGenres.map(g => (
                <button 
                  key={g} 
                  className={`btn btn-sm ${selectedGenres.includes(g) ? 'btn-info' : 'btn-outline-info'}`} 
                  onClick={() => setSelectedGenres(s => s.includes(g) ? s.filter(x => x !== g) : [...s, g])}
                >
                  {g}
                </button>
              ))}
              {allGenres.length === 0 && (
                <div className="text-secondary small">No genres detected from titles.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Revolutionary 3D Smart Roulette */}
      <div className="card bg-panel border border-secondary rounded-4 p-4 mb-4">
        <SmartRoulette3D 
          games={eligible} 
          poolKey={poolKey}
          onGameSelected={onGameSelected}
          onSampleUpdate={(data) => {
            // Could update UI with sample info if needed
            console.log('3D Wheel sample updated:', data)
          }}
        />
      </div>

      {/* Selected Game Panel */}
      {selected && <SelectedPanel game={selected} />}
    </div>
  )
}

function SelectedPanel({ game }) {
  const [cover, setCover] = useState(null)

  React.useEffect(() => {
    setCover(game?.image_url ? proxyImage(game.image_url) : null)
  }, [game?.image_url])

  return (
    <div className="card bg-panel border border-secondary rounded-4 p-3 d-flex gap-3 align-items-center">
      <div className="ratio ratio-4x3" style={{width: 240}}>
        {cover ? (
          <img className="rounded-3 w-100 h-100 object-fit-cover" src={cover} alt="" />
        ) : (
          <div className="rounded-3 w-100 h-100 d-flex align-items-center justify-content-center text-secondary bg-dark">
            No Cover
          </div>
        )}
      </div>
      <div className="flex-grow-1">
        <div className="fs-4 fw-bold text-primary">🎯 Selected: {game.title}</div>
        <div className="text-secondary mb-2">
          {game.console}{game.release_year ? ` • ${game.release_year}` : ''}
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <span className="badge bg-primary">{game.status || 'Not Started'}</span>
          {game.rating && <span className="badge bg-info">⭐ {game.rating}/10</span>}
          {game.is_bonus && <span className="badge bg-warning">🎁 Bonus</span>}
        </div>
        {game.notes && (
          <div className="mt-2 small text-muted">
            <strong>Notes:</strong> {game.notes}
          </div>
        )}
      </div>
    </div>
  )
}
