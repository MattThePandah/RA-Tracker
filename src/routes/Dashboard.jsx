import React from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import { fetchPublicGames, fetchSuggestions } from '../services/publicApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { adminFetch } from '../utils/adminFetch.js'

const statusOrder = ['Idea', 'Scripting', 'Recording', 'Editing', 'Scheduled', 'Published']
const historyLabels = {
  session_end: 'Session ended',
  session_switch: 'Game switched',
  manual: 'Manual backfill',
  legacy_total: 'Legacy total',
  legacy_fields: 'Legacy edit'
}

function getStudioStatus(game) {
  return game?.studio?.status || 'Idea'
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${secs.toString().padStart(2, '0')}s`
  return `${secs}s`
}

export default function Dashboard() {
  const { state } = useGame()
  const currentGame = state.games.find(g => g.id === state.currentGameId) || null
  const [publicCounts, setPublicCounts] = React.useState({ planned: 0, completed: 0 })
  const [publicGames, setPublicGames] = React.useState([])
  const [publicLoaded, setPublicLoaded] = React.useState(false)
  const [publicLoadError, setPublicLoadError] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState([])
  const [error, setError] = React.useState('')
  const [view, setView] = React.useState('overview')
  const [history, setHistory] = React.useState([])
  const [historyError, setHistoryError] = React.useState('')
  const [historySearch, setHistorySearch] = React.useState('')
  const [entryGameId, setEntryGameId] = React.useState('')
  const [entryHours, setEntryHours] = React.useState('')
  const [entryMinutes, setEntryMinutes] = React.useState('')
  const [entrySeconds, setEntrySeconds] = React.useState('')
  const [entryTimestamp, setEntryTimestamp] = React.useState('')
  const [entryType, setEntryType] = React.useState('manual')
  const [entryStatus, setEntryStatus] = React.useState('')

  React.useEffect(() => {
    let mounted = true
    const load = async () => {
      setError('')
      try {
        const [publicData, suggestionData] = await Promise.allSettled([
          fetchPublicGames(),
          fetchSuggestions({ status: 'open' })
        ])
        if (!mounted) return
        if (publicData.status === 'fulfilled') {
          const games = publicData.value.games || []
          setPublicGames(games)
          setPublicLoadError(false)
          setPublicCounts({
            planned: games.filter(g => g.publicStatus === 'Planned' || g.publicStatus === 'Queued').length,
            completed: games.filter(g => g.publicStatus === 'Completed').length
          })
        } else {
          setPublicGames([])
          setPublicCounts({ planned: 0, completed: 0 })
          setPublicLoadError(true)
        }
        if (suggestionData.status === 'fulfilled') {
          setSuggestions(suggestionData.value.suggestions || [])
        }
      } catch (err) {
        if (mounted) setError('Failed to load dashboard data.')
      } finally {
        if (mounted) setPublicLoaded(true)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const refreshHistory = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/user/history`)
      if (!res.ok) throw new Error('history_fetch_failed')
      const data = await res.json()
      setHistory(Array.isArray(data.history) ? data.history : [])
      setHistoryError('')
    } catch (err) {
      setHistoryError('Failed to load session history.')
    }
  }, [])

  React.useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  const studioPipeline = React.useMemo(() => {
    const rows = state.games
      .filter(g => g.studio && getStudioStatus(g) !== 'Published')
      .map(g => ({
        id: g.id,
        title: g.title,
        console: g.console,
        status: getStudioStatus(g),
        priority: g.studio?.priority || 'Medium',
        target: g.studio?.target_date || '',
        image: g.image_url
      }))
    return rows.sort((a, b) => {
      const aIdx = statusOrder.indexOf(a.status)
      const bIdx = statusOrder.indexOf(b.status)
      if (aIdx !== bIdx) return aIdx - bIdx
      if (a.priority !== b.priority) return a.priority === 'High' ? -1 : 1
      return (a.target || '').localeCompare(b.target || '')
    }).slice(0, 6)
  }, [state.games])

  const openSuggestions = suggestions.length
  const publicById = React.useMemo(() => {
    return new Map((publicGames || []).map(item => [String(item.id), item]))
  }, [publicGames])
  const reviewBacklog = React.useMemo(() => {
    if (!publicLoaded || publicLoadError) return []
    return state.games
      .filter(game => game.status === 'Completed')
      .filter(game => {
        const meta = publicById.get(String(game.id))
        if (!meta) return true
        const title = String(meta.publicReviewTitle || '').trim()
        const review = String(meta.publicReview || '').trim()
        return !title && !review
      })
      .sort((a, b) => {
        const aDate = a.date_finished ? new Date(a.date_finished).getTime() : 0
        const bDate = b.date_finished ? new Date(b.date_finished).getTime() : 0
        if (aDate !== bDate) return bDate - aDate
        return String(a.title || '').localeCompare(String(b.title || ''))
      })
  }, [publicLoaded, publicById, state.games])
  const reviewBacklogCount = publicLoaded && !publicLoadError ? reviewBacklog.length : null

  const historyItems = React.useMemo(() => {
    const byId = new Map(state.games.map(g => [String(g.id), g]))
    return (history || [])
      .map(entry => {
        const game = byId.get(String(entry.gameId))
        return {
          ...entry,
          title: game?.title || 'Unknown game',
          console: game?.console || 'Unknown console'
        }
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 40)
  }, [history, state.games])

  const historyGameOptions = React.useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    let list = state.games
    if (query) {
      list = list.filter(g => {
        const title = String(g.title || '').toLowerCase()
        const consoleName = String(g.console || '').toLowerCase()
        return title.includes(query) || consoleName.includes(query)
      })
    }
    const order = (g) => {
      if (g.status === 'Completed') return 0
      if (g.status === 'In Progress') return 1
      if (g.status === 'Queued') return 2
      return 3
    }
    return list
      .slice()
      .sort((a, b) => {
        const aKey = order(a)
        const bKey = order(b)
        if (aKey !== bKey) return aKey - bKey
        return String(a.title || '').localeCompare(String(b.title || ''))
      })
      .slice(0, 250)
  }, [state.games, historySearch])

  const submitManualEntry = async () => {
    const hours = Math.max(0, Number(entryHours) || 0)
    const minutes = Math.max(0, Number(entryMinutes) || 0)
    const seconds = Math.max(0, Number(entrySeconds) || 0)
    const duration = Math.floor((hours * 3600) + (minutes * 60) + seconds)
    if (!entryGameId) {
      setEntryStatus('Pick a game to log.')
      return
    }
    if (!duration) {
      setEntryStatus('Add a duration before saving.')
      return
    }
    const timestamp = entryTimestamp ? new Date(entryTimestamp).getTime() : Date.now()
    if (!Number.isFinite(timestamp)) {
      setEntryStatus('Date/time is invalid.')
      return
    }
    setEntryStatus('Saving entry...')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/user/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: entryGameId,
          duration,
          timestamp,
          eventType: entryType
        })
      })
      if (!res.ok) throw new Error('history_save_failed')
      setEntryStatus('Entry saved.')
      setEntryHours('')
      setEntryMinutes('')
      setEntrySeconds('')
      setEntryTimestamp('')
      setEntryType('manual')
      await refreshHistory()
    } catch (err) {
      setEntryStatus('Failed to save entry.')
    }
  }

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-1">Creator HQ</h2>
          <div className="text-secondary small">Quick view of pipeline, public status, and suggestions.</div>
        </div>
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <div className="btn-group btn-group-sm" role="group" aria-label="Dashboard view">
            <button
              className={`btn ${view === 'overview' ? 'btn-light' : 'btn-outline-light'}`}
              onClick={() => setView('overview')}
            >
              Overview
            </button>
            <button
              className={`btn ${view === 'history' ? 'btn-light' : 'btn-outline-light'}`}
              onClick={() => setView('history')}
            >
              History
            </button>
          </div>
          <Link className="btn btn-sm btn-outline-light" to="/admin/public-site">Edit Public Site</Link>
          <Link className="btn btn-sm btn-outline-primary" to="/admin/suggestions">View Suggestions</Link>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {view === 'history' ? (
        <div className="card bg-panel p-3">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <h5 className="h6 mb-0">Activity Timeline</h5>
            <span className="text-secondary small">Latest sessions and milestones.</span>
            <button className="btn btn-sm btn-outline-light ms-auto" onClick={refreshHistory}>
              Refresh
            </button>
          </div>
          <div className="card bg-dark border border-secondary p-3 mb-3">
            <div className="fw-semibold mb-2">Manual Backfill</div>
            <div className="row g-2 align-items-end">
              <div className="col-lg-4">
                <label className="form-label small">Search</label>
                <input
                  className="form-control form-control-sm"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Find game or console..."
                />
              </div>
              <div className="col-lg-4">
                <label className="form-label small">Game</label>
                <select
                  className="form-select form-select-sm"
                  value={entryGameId}
                  onChange={(e) => setEntryGameId(e.target.value)}
                >
                  <option value="">Select a game</option>
                  {historyGameOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.title} ({option.console || 'Unknown'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-lg-2">
                <label className="form-label small">Hours</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  min="0"
                  value={entryHours}
                  onChange={(e) => setEntryHours(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="col-6 col-lg-2">
                <label className="form-label small">Minutes</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  min="0"
                  max="59"
                  value={entryMinutes}
                  onChange={(e) => setEntryMinutes(e.target.value)}
                  placeholder="30"
                />
              </div>
              <div className="col-6 col-lg-2">
                <label className="form-label small">Seconds</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  min="0"
                  max="59"
                  value={entrySeconds}
                  onChange={(e) => setEntrySeconds(e.target.value)}
                  placeholder="15"
                />
              </div>
              <div className="col-lg-4">
                <label className="form-label small">Date / time</label>
                <input
                  className="form-control form-control-sm"
                  type="datetime-local"
                  value={entryTimestamp}
                  onChange={(e) => setEntryTimestamp(e.target.value)}
                />
              </div>
              <div className="col-lg-3">
                <label className="form-label small">Entry type</label>
                <select
                  className="form-select form-select-sm"
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value)}
                >
                  <option value="manual">Manual backfill</option>
                  <option value="session_end">Session ended</option>
                  <option value="session_switch">Game switched</option>
                </select>
              </div>
              <div className="col-lg-5 d-flex align-items-end gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={submitManualEntry}>
                  Add entry
                </button>
                {entryStatus && <div className="text-secondary small">{entryStatus}</div>}
              </div>
            </div>
          </div>
          {historyError && <div className="alert alert-danger">{historyError}</div>}
          {historyItems.length === 0 ? (
            <div className="text-secondary small">No sessions logged yet. Start a timer session to build history.</div>
          ) : (
            <div className="timeline">
              {historyItems.map(item => (
                <div key={item.id || `${item.gameId}-${item.timestamp}`} className="timeline-item">
                  <div className="timeline-marker" />
                  <div className="timeline-content">
                    <div className="fw-semibold">{item.title}</div>
                    <div className="text-secondary small">
                      {historyLabels[item.eventType] || 'Session logged'} - {item.console}
                    </div>
                    <div className="timeline-meta">
                      {formatDuration(item.duration)} - {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card bg-panel p-3 h-100">
                <h5 className="h6 mb-3">Current Game</h5>
                {currentGame ? (
                  <div className="d-flex gap-3">
                    <div style={{ width: 120 }}>
                      {currentGame.image_url ? (
                        <img className="rounded-3 w-100" src={buildCoverUrl(currentGame.image_url)} alt="" />
                      ) : (
                        <div className="rounded-3 bg-dark text-secondary d-flex align-items-center justify-content-center" style={{ height: 120 }}>No cover</div>
                      )}
                    </div>
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{currentGame.title}</div>
                      <div className="text-secondary small">{currentGame.console}</div>
                      <div className="text-secondary small">Status: {currentGame.status}</div>
                      <div className="text-secondary small">Video: {getStudioStatus(currentGame)}</div>
                      <div className="d-flex gap-2 mt-2 flex-wrap">
                        <Link className="btn btn-sm btn-outline-light" to="/admin/current">Open Current</Link>
                        <Link className="btn btn-sm btn-outline-primary" to="/admin/studio">Studio Notes</Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-secondary">Select a current game to unlock studio tracking.</div>
                )}
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card bg-panel p-3 h-100">
                <h5 className="h6 mb-3">At a glance</h5>
                <div className="row g-3">
                  <div className="col-6">
                    <div className="stat-chip d-flex justify-content-between">
                      <span>Total Games</span>
                      <strong>{state.games.length}</strong>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="stat-chip d-flex justify-content-between">
                      <span>Completed (public)</span>
                      <strong>{publicCounts.completed}</strong>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="stat-chip d-flex justify-content-between">
                      <span>Planned + Queued</span>
                      <strong>{publicCounts.planned}</strong>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="stat-chip d-flex justify-content-between">
                      <span>Open Suggestions</span>
                      <strong>{openSuggestions}</strong>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="stat-chip d-flex justify-content-between">
                      <span>Needs Review</span>
                      <strong>{reviewBacklogCount === null ? '-' : reviewBacklogCount}</strong>
                    </div>
                  </div>
                </div>
                <div className="text-secondary small mt-3">Use the Public Site editor to update hero copy and featured review.</div>
              </div>
            </div>
          </div>

          <div className="row g-3 mt-0">
            <div className="col-lg-7">
              <div className="card bg-panel p-3 h-100">
                <h5 className="h6 mb-3">Video Pipeline</h5>
                {studioPipeline.length === 0 ? (
                  <div className="text-secondary">No active video projects yet.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm table-dark align-middle">
                      <thead>
                        <tr>
                          <th>Game</th>
                          <th>Status</th>
                          <th>Priority</th>
                          <th>Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studioPipeline.map(item => (
                          <tr key={item.id}>
                            <td>
                              <div className="fw-semibold">{item.title}</div>
                              <div className="small text-secondary">{item.console}</div>
                            </td>
                            <td>{item.status}</td>
                            <td>{item.priority}</td>
                            <td>{item.target || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="col-lg-5">
              <div className="card bg-panel p-3 h-100">
                <h5 className="h6 mb-3">Latest Suggestions</h5>
                {suggestions.length === 0 ? (
                  <div className="text-secondary">No suggestions yet.</div>
                ) : (
                  <div className="d-grid gap-2">
                    {suggestions.slice(0, 5).map(item => (
                      <div key={item.id} className="p-2 rounded bg-dark border border-secondary">
                        <div className="fw-semibold">{item.title}</div>
                        <div className="d-flex flex-wrap gap-2 small">
                          <span className="badge rounded-pill bg-secondary">{item.console || 'Unknown console'}</span>
                          <span className="badge rounded-pill bg-secondary">{item.requester || 'Viewer'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="row g-3 mt-0">
            <div className="col-12">
              <div className="card bg-panel p-3 h-100">
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                  <h5 className="h6 mb-0">Review Backlog</h5>
                  <span className="text-secondary small">Completed games missing a public review.</span>
                  <Link className="btn btn-sm btn-outline-primary ms-auto" to="/admin/library">Open Library</Link>
                </div>
                {!publicLoaded ? (
                  <div className="text-secondary small">Loading review backlog...</div>
                ) : publicLoadError ? (
                  <div className="text-secondary">Unable to load public review data.</div>
                ) : reviewBacklog.length === 0 ? (
                  <div className="text-secondary">All completed games have reviews.</div>
                ) : (
                  <div className="d-grid gap-2">
                    {reviewBacklog.slice(0, 6).map(game => (
                      <div key={game.id} className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 rounded bg-dark border border-secondary">
                        <div>
                          <div className="fw-semibold">{game.title}</div>
                          <div className="text-secondary small">
                            {game.console || 'Unknown console'}
                            {game.date_finished ? ` \u2022 ${new Date(game.date_finished).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <Link className="btn btn-sm btn-outline-light" to={`/admin/library?edit=${encodeURIComponent(game.id)}`}>
                          Add Review
                        </Link>
                      </div>
                    ))}
                    {reviewBacklog.length > 6 && (
                      <div className="text-secondary small">
                        Showing 6 of {reviewBacklog.length} completed games without reviews.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
