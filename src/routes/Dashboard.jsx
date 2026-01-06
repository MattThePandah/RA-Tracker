import React from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import { fetchPublicGames, fetchSuggestions } from '../services/publicApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { adminFetch } from '../utils/adminFetch.js'
import AdminTimerWidget from '../components/AdminTimerWidget.jsx'

const statusOrder = ['Idea', 'Scripting', 'Recording', 'Editing', 'Scheduled', 'Published', 'Scrapped']
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
  const [events, setEvents] = React.useState([])
  const [activeEventId, setActiveEventId] = React.useState(null)
  const [eventStatus, setEventStatus] = React.useState('')
  const [startingSoon, setStartingSoon] = React.useState(false)
  const [soonMinutes, setSoonMinutes] = React.useState(10)
  const [trailers, setTrailers] = React.useState([])
  const [youtubeUrl, setYoutubeUrl] = React.useState('')
  const [downloading, setDownloading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState([])
  const [searching, setSearching] = React.useState(false)

  const loadTrailers = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/trailers`)
      if (res.ok) {
        const data = await res.json()
        setTrailers(Array.isArray(data) ? data : [])
      }
    } catch { }
  }, [])

  const loadEvents = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const [eventRes, currentRes] = await Promise.all([
        adminFetch(`${base}/api/admin/events`),
        adminFetch(`${base}/overlay/current`)
      ])

      if (eventRes.ok) {
        const data = await eventRes.json()
        setEvents(Array.isArray(data.events) ? data.events : [])
        setActiveEventId(data.activeEventId || null)
      }

      if (currentRes.ok) {
        const data = await currentRes.json()
        setStartingSoon(!!data.startingSoon)
      }
      loadTrailers()
    } catch { }
  }, [loadTrailers])

  React.useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const handleDownloadTrailer = async (url) => {
    const targetUrl = url || youtubeUrl
    if (!targetUrl) return
    setDownloading(true)
    setEventStatus('Starting download...')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/trailers/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      })
      if (res.ok) {
        if (!url) setYoutubeUrl('')
        setEventStatus('Download started/finished.')
        setTimeout(() => setEventStatus(''), 3000)
        await loadTrailers()
      } else {
        setEventStatus('Download failed.')
      }
    } catch (err) {
      setEventStatus('Network error.')
    } finally {
      setDownloading(false)
    }
  }

  const handleSearchTrailers = async (query) => {
    const q = query || searchQuery
    if (!q) return
    setSearching(true)
    setSearchResults([])
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/trailers/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q })
      })
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data)
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleDeleteTrailer = async (name) => {
    if (!window.confirm(`Delete trailer "${name}"?`)) return
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/trailers/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await loadTrailers()
      }
    } catch { }
  }

  const handleToggleStartingSoon = async () => {
    const newState = !startingSoon
    const endTime = newState ? (Date.now() + soonMinutes * 60 * 1000) : null
    setEventStatus('Updating Soon Mode...')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/overlay/starting-soon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState, endTime })
      })
      if (res.ok) {
        setStartingSoon(newState)
        setEventStatus(`Soon Mode ${newState ? 'ON' : 'OFF'}`)
        setTimeout(() => setEventStatus(''), 2000)
      } else {
        setEventStatus('Failed to toggle Soon Mode')
      }
    } catch (err) {
      setEventStatus('Network error')
    }
  }

  const handleSetActiveEvent = async (eventId) => {
    setEventStatus('Updating...')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/events/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: eventId || null })
      })
      if (res.ok) {
        setActiveEventId(eventId || null)
        setEventStatus('Saved.')
        setTimeout(() => setEventStatus(''), 2000)
      } else {
        const data = await res.json().catch(() => ({}))
        setEventStatus(`Error: ${data.error || 'Failed'}`)
      }
    } catch (err) {
      console.error('Failed to update active event:', err)
      setEventStatus('Network error.')
    }
  }

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
      .filter(g => g.studio && !['Published', 'Scrapped'].includes(getStudioStatus(g)))
      .filter(g => g.status !== 'DNF')
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
    <div className="dashboard-v2">
      {/* Header / Quick Stats */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="h3 mb-1">Command Center</h2>
          <p className="text-secondary mb-0">System status and broadcast controls</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-light d-flex align-items-center gap-2" onClick={refreshHistory}>
            <i className="bi bi-arrow-clockwise"></i>
            <span>Refresh</span>
          </button>
          <div className="btn-group">
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
              Log
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {view === 'history' ? (
        <div className="card bg-panel p-4">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h5 className="mb-0">Session Log</h5>
            <span className="badge bg-dark border border-secondary text-secondary">Last 40 entries</span>
          </div>

          <div className="card bg-dark border-secondary p-3 mb-4">
            <h6 className="small text-uppercase text-secondary mb-3">Manual Entry</h6>
            <div className="row g-2 align-items-end">
              <div className="col-lg-3">
                <input
                  className="form-control form-control-sm bg-dark text-light border-secondary"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search games..."
                />
              </div>
              <div className="col-lg-3">
                <select
                  className="form-select form-select-sm bg-dark text-light border-secondary"
                  value={entryGameId}
                  onChange={(e) => setEntryGameId(e.target.value)}
                >
                  <option value="">Select Game</option>
                  {historyGameOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-lg-3 d-flex gap-1">
                <input className="form-control form-control-sm bg-dark text-light border-secondary" type="number" value={entryHours} onChange={e => setEntryHours(e.target.value)} placeholder="HH" />
                <input className="form-control form-control-sm bg-dark text-light border-secondary" type="number" value={entryMinutes} onChange={e => setEntryMinutes(e.target.value)} placeholder="MM" />
              </div>
              <div className="col-lg-3">
                <button className="btn btn-sm btn-primary w-100" onClick={submitManualEntry}>Add Entry</button>
              </div>
            </div>
          </div>

          {historyItems.length === 0 ? (
            <div className="text-center py-5 text-secondary">No sessions recorded yet.</div>
          ) : (
            <div className="timeline-v2">
              {historyItems.map(item => (
                <div key={item.id || `${item.gameId}-${item.timestamp}`} className="timeline-entry mb-3 p-3 rounded bg-dark border-start border-4 border-primary">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="fw-bold">{item.title}</div>
                      <div className="small text-secondary">{item.console} &bull; {historyLabels[item.eventType]}</div>
                    </div>
                    <div className="text-end">
                      <div className="fw-bold text-brand">{formatDuration(item.duration)}</div>
                      <div className="small text-secondary" style={{ fontSize: '0.7rem' }}>
                        {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="row g-4">
          {/* Main Controls Column */}
          <div className="col-lg-8">
            <div className="row g-4">
              {/* Broadcast Control */}
              <div className="col-12">
                <div className="card bg-panel overflow-hidden border-0 shadow-sm">
                  <div className="bg-brand p-2 px-3 d-flex justify-content-between align-items-center">
                    <span className="text-dark fw-bold small text-uppercase letter-spacing-1">
                      <i className="bi bi-broadcast me-2"></i>Broadcast Control
                    </span>
                    {startingSoon && <span className="badge bg-danger pulse-slow">LIVE: SOON MODE</span>}
                  </div>
                  <div className="p-4">
                    <div className="row align-items-center">
                      <div className="col-md-6">
                        <label className="form-label small text-secondary text-uppercase fw-bold">Starting Soon Timer</label>
                        <div className="d-flex gap-2 mb-3">
                          <div className="input-group input-group-lg" style={{ maxWidth: '200px' }}>
                            <input
                              type="number"
                              className="form-control bg-dark border-secondary text-light fw-bold text-center"
                              value={soonMinutes}
                              onChange={e => setSoonMinutes(Math.max(1, parseInt(e.target.value) || 0))}
                              disabled={startingSoon}
                            />
                            <span className="input-group-text bg-dark border-secondary text-secondary">min</span>
                          </div>
                          <button
                            className={`btn btn-lg px-4 fw-bold ${startingSoon ? 'btn-danger' : 'btn-brand text-dark'}`}
                            onClick={handleToggleStartingSoon}
                          >
                            {startingSoon ? 'STOP' : 'START'}
                          </button>
                        </div>
                      </div>
                      <div className="col-md-6 border-start border-secondary border-opacity-25 ps-md-4">
                        <label className="form-label small text-secondary text-uppercase fw-bold">Active Event Profile</label>
                        <select
                          className="form-select form-select-lg bg-dark border-secondary text-light mb-2"
                          value={activeEventId || ''}
                          onChange={(e) => handleSetActiveEvent(e.target.value)}
                        >
                          <option value="">No Active Event</option>
                          {events.map(event => (
                            <option key={event.id} value={event.id}>{event.name}</option>
                          ))}
                        </select>
                        <p className="small text-secondary mb-0">
                          {activeEventId ? 'Event is active. TV will show BRB screen if no game is live.' : 'No event active. TV will power off when idle.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-top border-secondary border-opacity-10">
                      <div className="row">
                        <div className="col-12">
                          <label className="form-label small text-secondary text-uppercase fw-bold">Live Timers</label>
                          <AdminTimerWidget />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Gameplay Widget */}
              <div className="col-md-12">
                <div className="card bg-panel p-4 h-100 border-0 shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="h6 mb-0 text-uppercase text-secondary fw-bold">Active Gameplay</h5>
                    <Link to="/admin/current" className="btn btn-sm btn-outline-light">Switch Game</Link>
                  </div>

                  {currentGame ? (
                    <div className="d-flex gap-4">
                      <div className="flex-shrink-0" style={{ width: '140px' }}>
                        <img
                          className="img-fluid rounded shadow-lg border border-secondary border-opacity-25"
                          src={buildCoverUrl(currentGame.image_url)}
                          alt=""
                        />
                      </div>
                      <div className="flex-grow-1">
                        <div className="h4 mb-1">{currentGame.title}</div>
                        <div className="d-flex gap-2 mb-3">
                          <span className="badge bg-dark border border-secondary text-secondary">{currentGame.console}</span>
                          <span className="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-50">{currentGame.status}</span>
                        </div>

                        <div className="row g-3">
                          <div className="col-6">
                            <div className="small text-secondary text-uppercase fw-bold" style={{ fontSize: '0.65rem' }}>Video Status</div>
                            <div className="fw-bold">{getStudioStatus(currentGame)}</div>
                          </div>
                          <div className="col-6">
                            <div className="small text-secondary text-uppercase fw-bold" style={{ fontSize: '0.65rem' }}>Achievements</div>
                            <div className="fw-bold">Ready</div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-top border-secondary border-opacity-10 d-flex gap-2">
                          <Link className="btn btn-sm btn-brand text-dark fw-bold px-3" to="/admin/studio">Studio Notes</Link>
                          <Link className="btn btn-sm btn-outline-light px-3" to="/admin/achievements">View Trophies</Link>
                          <button
                            className="btn btn-sm btn-outline-secondary px-3"
                            onClick={() => {
                              const query = `${currentGame.title} ${currentGame.console} trailer`
                              setSearchQuery(query)
                              handleSearchTrailers(query)
                              // Scroll to trailer section
                              const el = document.querySelector('.trailer-library-section')
                              if (el) el.scrollIntoView({ behavior: 'smooth' })
                            }}
                          >
                            Find Trailer
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-dark rounded border border-dashed border-secondary border-opacity-50">
                      <p className="text-secondary mb-0">No game is currently active.</p>
                      <Link to="/admin/current" className="btn btn-sm btn-brand text-dark mt-2">Select Game</Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Video Studio Pipeline */}
              <div className="col-12">
                <div className="card bg-panel p-4 border-0 shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="h6 mb-0 text-uppercase text-secondary fw-bold">Video Pipeline</h5>
                    <Link to="/admin/studio" className="text-brand small text-decoration-none">Full Studio &rarr;</Link>
                  </div>
                  {studioPipeline.length === 0 ? (
                    <p className="text-secondary py-3 mb-0">No active video projects.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-dark table-hover align-middle mb-0 border-0">
                        <thead className="bg-dark text-secondary small">
                          <tr>
                            <th className="border-0">Project</th>
                            <th className="border-0">Phase</th>
                            <th className="border-0">Priority</th>
                            <th className="border-0 text-end">Target</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studioPipeline.map(item => (
                            <tr key={item.id} className="border-secondary border-opacity-10">
                              <td className="border-0">
                                <div className="fw-bold">{item.title}</div>
                                <div className="small text-secondary">{item.console}</div>
                              </td>
                              <td className="border-0">
                                <span className={`badge rounded-pill bg-opacity-10 ${item.status === 'Recording' ? 'bg-danger text-danger' :
                                  item.status === 'Editing' ? 'bg-warning text-warning' :
                                    'bg-info text-info'
                                  }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="border-0 small">{item.priority}</td>
                              <td className="border-0 text-end small text-secondary">{item.target || '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Trailer Manager */}
              <div className="col-12 trailer-library-section">
                <div className="card bg-panel p-4 border-0 shadow-sm">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="h6 mb-0 text-uppercase text-secondary fw-bold">Trailer Library</h5>
                    <span className="badge bg-dark border border-secondary text-secondary">{trailers.length} Files</span>
                  </div>

                  <div className="bg-dark p-3 rounded border border-secondary border-opacity-25 mb-4">
                    <label className="form-label small text-secondary text-uppercase fw-bold">Find Trailers</label>
                    <div className="d-flex gap-2 mb-3">
                      <input
                        type="text"
                        className="form-control form-control-sm bg-dark border-secondary text-light"
                        placeholder="Search YouTube (e.g. 'PS1 game trailers')..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearchTrailers()}
                      />
                      <button
                        className="btn btn-sm btn-brand text-dark fw-bold px-3"
                        disabled={searching || !searchQuery}
                        onClick={() => handleSearchTrailers()}
                      >
                        {searching ? 'Searching...' : 'Search'}
                      </button>
                    </div>

                    <div className="d-flex flex-wrap gap-2 mb-3">
                      {['PS1 Trailers', 'PS2 Trailers', 'PSP Trailers', 'Best Game Trailers'].map(chip => (
                        <button
                          key={chip}
                          className="btn btn-xs btn-outline-secondary rounded-pill px-2"
                          style={{ fontSize: '0.65rem' }}
                          onClick={() => {
                            setSearchQuery(chip)
                            handleSearchTrailers(chip)
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    {searchResults.length > 0 && (
                      <div className="search-results-mini mt-3 pt-3 border-top border-secondary border-opacity-10">
                        <div className="row g-2">
                          {searchResults.map(result => (
                            <div key={result.id} className="col-12">
                              <div className="d-flex align-items-center gap-2 p-2 rounded bg-panel border border-secondary border-opacity-25">
                                {result.thumbnail && (
                                  <img src={result.thumbnail} alt="" className="rounded" style={{ width: '60px', height: '34px', objectFit: 'cover' }} />
                                )}
                                <div className="flex-grow-1 min-width-0">
                                  <div className="small fw-bold text-truncate" title={result.title}>{result.title}</div>
                                  <div className="text-secondary" style={{ fontSize: '0.65rem' }}>{result.uploader} • {result.duration}</div>
                                </div>
                                <button
                                  className="btn btn-xs btn-brand text-dark fw-bold d-flex align-items-center gap-1"
                                  onClick={() => handleDownloadTrailer(result.url)}
                                  disabled={downloading}
                                >
                                  {downloading ? '...' : <><i className="bi bi-download"></i> Get</>}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          className="btn btn-xs btn-link text-secondary w-100 mt-2"
                          onClick={() => setSearchResults([])}
                        >
                          Clear Results
                        </button>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-top border-secondary border-opacity-10">
                      <label className="form-label small text-secondary text-uppercase fw-bold">Add from URL</label>
                      <div className="d-flex gap-2">
                        <input
                          type="text"
                          className="form-control form-control-sm bg-dark border-secondary text-light"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={e => setYoutubeUrl(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-outline-light px-3"
                          disabled={downloading || !youtubeUrl}
                          onClick={() => handleDownloadTrailer()}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  </div>

                  {trailers.length === 0 ? (
                    <p className="text-secondary py-2 mb-0">No trailers found in <code>/trailers</code> folder.</p>
                  ) : (
                    <div className="row g-2">
                      {trailers.map(file => (
                        <div key={file.name} className="col-md-6">
                          <div className="d-flex align-items-center justify-content-between p-2 rounded bg-dark border border-secondary border-opacity-10">
                            <div className="text-truncate me-2 small">
                              <i className="bi bi-film me-2 text-secondary"></i>
                              {file.name}
                            </div>
                            <button
                              className="btn btn-xs btn-outline-danger border-0 d-flex align-items-center gap-1"
                              style={{ padding: '2px 8px' }}
                              onClick={() => handleDeleteTrailer(file.name)}
                            >
                              <i className="bi bi-trash"></i>
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Info Column */}
          <div className="col-lg-4">
            <div className="d-flex flex-column gap-4">

              {/* Stats Overview */}
              <div className="card bg-panel p-4 border-0 shadow-sm">
                <h5 className="h6 mb-4 text-uppercase text-secondary fw-bold">System Snapshot</h5>
                <div className="d-flex flex-column gap-3">
                  <div className="d-flex justify-content-between align-items-center p-2 rounded bg-dark border border-secondary border-opacity-10">
                    <span className="text-secondary small">Total Library</span>
                    <span className="h5 mb-0 fw-bold">{state.games.length}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center p-2 rounded bg-dark border border-secondary border-opacity-10">
                    <span className="text-secondary small">Public Completed</span>
                    <span className="h5 mb-0 fw-bold text-success">{publicCounts.completed}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center p-2 rounded bg-dark border border-secondary border-opacity-10">
                    <span className="text-secondary small">Needs Review</span>
                    <span className="h5 mb-0 fw-bold text-warning">{reviewBacklogCount || '0'}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center p-2 rounded bg-dark border border-secondary border-opacity-10">
                    <span className="text-secondary small">Open Suggestions</span>
                    <span className="h5 mb-0 fw-bold text-info">{openSuggestions}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <Link to="/admin/public-site" className="btn btn-sm btn-outline-secondary w-100 mb-2">Edit Public Site</Link>
                  <Link to="/admin/library" className="btn btn-sm btn-outline-secondary w-100">Full Library</Link>
                </div>
              </div>

              {/* Suggestions Widget */}
              <div className="card bg-panel p-4 border-0 shadow-sm">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h5 className="h6 mb-0 text-uppercase text-secondary fw-bold">Top Suggestions</h5>
                  <Link to="/admin/suggestions" className="text-brand small text-decoration-none">View All</Link>
                </div>
                {suggestions.length === 0 ? (
                  <p className="text-secondary small mb-0">No open suggestions.</p>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {suggestions.slice(0, 4).map(item => (
                      <div key={item.id} className="p-2 rounded bg-dark border border-secondary border-opacity-10">
                        <div className="fw-bold small">{item.title}</div>
                        <div className="d-flex justify-content-between align-items-center mt-1">
                          <span className="badge bg-secondary bg-opacity-25 text-secondary p-1 px-2" style={{ fontSize: '0.6rem' }}>{item.console || 'Retro'}</span>
                          <span className="text-secondary" style={{ fontSize: '0.65rem' }}>{item.requester}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Review Backlog */}
              <div className="card bg-panel p-4 border-0 shadow-sm">
                <h5 className="h6 mb-4 text-uppercase text-secondary fw-bold">Recent Backlog</h5>
                {reviewBacklog.length === 0 ? (
                  <p className="text-secondary small mb-0">Reviews are up to date!</p>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {reviewBacklog.slice(0, 3).map(game => (
                      <div key={game.id} className="d-flex align-items-center justify-content-between gap-2">
                        <div className="min-width-0">
                          <div className="fw-bold small text-truncate">{game.title}</div>
                          <div className="text-secondary" style={{ fontSize: '0.65rem' }}>{game.console}</div>
                        </div>
                        <Link className="btn btn-xs btn-outline-brand" to={`/admin/library?edit=${encodeURIComponent(game.id)}`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                          Add
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
