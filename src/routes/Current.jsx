import React from 'react'
import { useGame } from '../context/GameContext.jsx'
import { startCurrentTimer, pauseCurrentTimer, resetCurrentTimer, resetPSFestTimer, getTimerStatus } from '../services/storage.js'

// Proxy cover helper (uses disk cache via server if available)
const proxyImage = (url) => {
  const base = import.meta.env.VITE_IGDB_PROXY_URL
  if (!url) return null
  return base ? `${base}/cover?src=${encodeURIComponent(url)}` : url
}

export default function Current() {
  const { state, dispatch } = useGame()
  const game = state.games.find(g => g.id === state.currentGameId) || null
  const [running, setRunning] = React.useState(false)
  const [form, setForm] = React.useState(() => ({
    status: game?.status || 'Not Started',
    rating: game?.rating || '',
    completion_time: game?.completion_time || '',
    date_started: game?.date_started ? game.date_started.split('T')[0] : '',
    date_finished: game?.date_finished ? game.date_finished.split('T')[0] : '',
    notes: game?.notes || ''
  }))

  React.useEffect(() => {
    if (!game) return
    setForm({
      status: game.status || 'Not Started',
      rating: game.rating || '',
      completion_time: game.completion_time || '',
      date_started: game.date_started ? game.date_started.split('T')[0] : '',
      date_finished: game.date_finished ? game.date_finished.split('T')[0] : '',
      notes: game.notes || ''
    })
  }, [game?.id])

  // Poll timer running status for UI
  React.useEffect(() => {
    let id
    const tick = async () => {
      const s = await getTimerStatus()
      setRunning(!!s.running)
    }
    tick()
    id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [])

  const update = (patch) => {
    if (!game) return
    const updated = {
      ...game,
      ...patch
    }
    dispatch({ type: 'UPDATE_GAME', game: updated })
  }

  const onField = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }))
    const mapped = (key, val) => (val === '' ? null : val)
    const patch = { [k]: mapped(k, v) }
    if (k === 'status') {
      const now = new Date().toISOString()
      if (v === 'In Progress' && !game.date_started) patch.date_started = now
      if (v === 'Completed' && !game.date_finished) patch.date_finished = now
    }
    update(patch)
  }

  if (!game) {
    return (
      <div className="p-3">
        <h2 className="h4">Current Game</h2>
        <div className="text-secondary">No game selected. Use the Select tab to pick one.</div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <h2 className="h4 mb-3">Current Game</h2>

      {/* Summary Card */}
      <div className="overlay-card rebrand rounded-4 p-3 d-flex gap-3 align-items-center mb-3">
        <div className="ratio ratio-4x3" style={{width: 260}}>
          {game.image_url ? (
            <img className="rounded-3 w-100 h-100 object-fit-cover" src={proxyImage(game.image_url)} alt="" />
          ) : (
            <div className="rounded-3 w-100 h-100 d-flex align-items-center justify-content-center text-secondary bg-dark">No cover</div>
          )}
        </div>
        <div className="flex-grow-1">
          <div className="title-strong fs-3 mb-1">{game.title}</div>
          <div className="overlay-subtle mb-2">{game.console}{game.release_year ? ` • ${game.release_year}` : ''}</div>
          <div className="d-flex gap-2 flex-wrap mb-2">
            <span className="badge bg-primary">{game.status || 'Not Started'}</span>
            {game.rating && <span className="badge bg-info">⭐ {game.rating}/10</span>}
            {game.is_bonus && <span className="badge bg-warning text-dark">🎁 Bonus</span>}
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <button className="btn btn-sm btn-warning" onClick={()=>update({ status: 'In Progress', date_started: game.date_started || new Date().toISOString() })}>Set In Progress</button>
            <button className="btn btn-sm btn-success" onClick={()=>update({ status: 'Completed', date_finished: game.date_finished || new Date().toISOString() })}>Mark Completed</button>
            <button className="btn btn-sm btn-outline-light" onClick={()=>dispatch({ type: 'SET_CURRENT', id: null })}>Clear Current</button>
            <span className="text-secondary ms-2" style={{fontSize: '0.9rem'}}>Timer: {running ? 'Running' : 'Paused'}</span>
          </div>
          <div className="d-flex gap-2 flex-wrap mt-2">
            {running ? (
              <button className="btn btn-sm btn-outline-warning" onClick={pauseCurrentTimer}>Pause Timer</button>
            ) : (
              <button className="btn btn-sm btn-outline-success" onClick={startCurrentTimer}>Start Timer</button>
            )}
            <button className="btn btn-sm btn-outline-light" onClick={resetCurrentTimer}>Reset Current Timer</button>
            <button className="btn btn-sm btn-outline-danger" onClick={resetPSFestTimer}>Reset PSFest Total</button>
          </div>
        </div>
      </div>

      {/* Editable Details */}
      <div className="card bg-panel border border-secondary rounded-4 p-3">
        <div className="row g-3">
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label text-light">Status</label>
              <select className="form-select" value={form.status} onChange={e=>onField('status', e.target.value)}>
                <option>Not Started</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Rating (1-10)</label>
              <input type="number" min="1" max="10" className="form-control" value={form.rating} onChange={e=>onField('rating', e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Completion Time (hours)</label>
              <input type="number" step="0.5" min="0" className="form-control" value={form.completion_time} onChange={e=>onField('completion_time', e.target.value)} />
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label text-light">Date Started</label>
              <input type="date" className="form-control" value={form.date_started} onChange={e=>onField('date_started', e.target.value + 'T00:00:00.000Z')} />
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Date Finished</label>
              <input type="date" className="form-control" value={form.date_finished} onChange={e=>onField('date_finished', e.target.value + 'T00:00:00.000Z')} />
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Notes</label>
              <textarea className="form-control" rows="6" value={form.notes} onChange={e=>onField('notes', e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
