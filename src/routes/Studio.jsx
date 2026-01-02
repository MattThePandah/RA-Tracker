import React from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { adminFetch } from '../utils/adminFetch.js'

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const normalizeStatus = (value) => String(value || '').trim().toLowerCase()

const isInProgress = (game) => {
  const status = normalizeStatus(game?.status)
  if (!status) return false
  if (status === 'in progress' || status === 'in-progress') return true
  return status.includes('progress')
}

const formatRelativeTime = (timestamp) => {
  const ts = Number(timestamp || 0)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (deltaSec < 60) return `${deltaSec}s ago`
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
  return `${Math.floor(deltaSec / 86400)}d ago`
}

const getStudio = (game) => {
  const base = game?.studio || {}
  return {
    status: base.status || 'Idea',
    priority: base.priority || 'Medium',
    active: !!base.active,
    last_edited_at: base.last_edited_at || null,
    series: base.series || '',
    episode: base.episode || '',
    target_date: base.target_date || '',
    runtime: base.runtime || '',
    hook: base.hook || '',
    outline: base.outline || '',
    script: base.script || '',
    thumbnail: base.thumbnail || '',
    tags: base.tags || '',
    review_summary: base.review_summary || '',
    review_pros: base.review_pros || '',
    review_cons: base.review_cons || '',
    review_score: base.review_score || '',
    verdict: base.verdict || '',
    recording_setup: base.recording_setup || '',
    recording_notes: base.recording_notes || '',
    sessions: Array.isArray(base.sessions) ? base.sessions : [],
    clips: Array.isArray(base.clips) ? base.clips : [],
    research: Array.isArray(base.research) ? base.research : [],
    achievement_notes: Array.isArray(base.achievement_notes) ? base.achievement_notes : []
  }
}

export default function Studio() {
  const { state, dispatch } = useGame()
  const [studioSearch, setStudioSearch] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)
  const [selectedGameId, setSelectedGameId] = React.useState(() => {
    try { return localStorage.getItem('ra.studio.gameId') || '' } catch { return '' }
  })

  const studioPersistRef = React.useRef(new Map())
  const studioPersistTimerRef = React.useRef(null)

  const queueStudioPersist = React.useCallback((gameId, studioData) => {
    if (!gameId) return
    const key = String(gameId)
    studioPersistRef.current.set(key, studioData)
    if (studioPersistTimerRef.current) {
      clearTimeout(studioPersistTimerRef.current)
    }
    studioPersistTimerRef.current = setTimeout(async () => {
      const pending = Array.from(studioPersistRef.current.entries())
      studioPersistRef.current.clear()
      studioPersistTimerRef.current = null
      if (!pending.length) return
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      await Promise.all(pending.map(([id, studio]) => (
        adminFetch(`${base}/api/user/metadata/${encodeURIComponent(id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studio })
        }).catch(() => null)
      )))
    }, 700)
  }, [])

  const updateStudioForGame = React.useCallback((target, patch) => {
    if (!target) return
    const base = target.studio || {}
    const next = { ...base, ...patch, last_edited_at: Date.now() }
    dispatch({ type: 'UPDATE_GAME', game: { ...target, studio: next } })
    queueStudioPersist(target.id, next)
  }, [dispatch, queueStudioPersist])

  const resolveDefaultGameId = React.useCallback(() => {
    const current = state.currentGameId && state.games.find(g => g.id === state.currentGameId) ? state.currentGameId : ''
    if (current) return current
    const active = state.games.find(g => g?.studio?.active)
    if (active) return active.id
    const preferred = state.games.find(g => isInProgress(g))
      || state.games.find(g => g.status === 'Queued' || g.status === 'Planned')
      || state.games[0]
    return preferred?.id || ''
  }, [state.currentGameId, state.games])

  React.useEffect(() => {
    if (selectedGameId && state.games.some(g => g.id === selectedGameId)) return
    const fallback = resolveDefaultGameId()
    if (fallback && fallback !== selectedGameId) {
      setSelectedGameId(fallback)
    }
  }, [selectedGameId, resolveDefaultGameId, state.games])

  React.useEffect(() => {
    try {
      if (selectedGameId) {
        localStorage.setItem('ra.studio.gameId', selectedGameId)
      }
    } catch {}
  }, [selectedGameId])

  const activeProjects = React.useMemo(() => (
    state.games.filter(g => g?.studio?.active)
  ), [state.games])

  const inProgressSuggestions = React.useMemo(() => {
    const activeIds = new Set(activeProjects.map(g => g.id))
    return state.games.filter(g => isInProgress(g) && !activeIds.has(g.id))
  }, [state.games, activeProjects])

  const recentProjects = React.useMemo(() => {
    const list = state.games
      .filter(g => g?.studio?.last_edited_at)
      .sort((a, b) => (b.studio?.last_edited_at || 0) - (a.studio?.last_edited_at || 0))
    return list.slice(0, 4)
  }, [state.games])

  const quickJumpProject = React.useMemo(() => {
    if (!recentProjects.length) return null
    const candidate = recentProjects[0]
    if (candidate && candidate.id !== selectedGameId) return candidate
    return recentProjects[1] || null
  }, [recentProjects, selectedGameId])

  const studioOptions = React.useMemo(() => {
    const query = studioSearch.trim().toLowerCase()
    let list = state.games
    if (!showAll) {
      list = list.filter(g => ['Queued', 'Planned'].includes(g.status) || isInProgress(g) || g?.studio?.active)
    }
    if (query) {
      list = list.filter(g => {
        const title = String(g.title || '').toLowerCase()
        const consoleName = String(g.console || '').toLowerCase()
        return title.includes(query) || consoleName.includes(query)
      })
    }
    const total = list.length
    let options = list.slice(0, 250)
    if (selectedGameId) {
      const selected = state.games.find(g => g.id === selectedGameId)
      if (selected && !options.some(option => option.id === selected.id)) {
        options = [selected, ...options]
      }
    }
    return { total, options }
  }, [state.games, showAll, studioSearch, selectedGameId])

  const game = state.games.find(g => g.id === selectedGameId) || null
  const studio = getStudio(game)

  const studioMetrics = React.useMemo(() => {
    if (!studio) return []
    return [
      { label: 'Sessions', value: studio.sessions.length },
      { label: 'Clips', value: studio.clips.length },
      { label: 'Research', value: studio.research.length },
      { label: 'Callouts', value: studio.achievement_notes.length }
    ]
  }, [studio])

  const sectionLinks = [
    { id: 'studio-plan', label: 'Video Plan' },
    { id: 'studio-recording', label: 'Recording' },
    { id: 'studio-clips', label: 'Clips' },
    { id: 'studio-research', label: 'Research' },
    { id: 'studio-review', label: 'Review' },
    { id: 'studio-achievements', label: 'Achievements' }
  ]

  const [newSession, setNewSession] = React.useState({
    date: '',
    duration: '',
    file: '',
    notes: ''
  })
  const [newClip, setNewClip] = React.useState({
    timestamp: '',
    description: '',
    type: 'Highlight'
  })
  const [newResearch, setNewResearch] = React.useState({
    type: 'Guide',
    title: '',
    url: '',
    notes: '',
    tags: '',
    used: false
  })
  const [newAchievement, setNewAchievement] = React.useState({
    title: '',
    note: '',
    status: 'Target'
  })

  React.useEffect(() => {
    setNewSession({ date: '', duration: '', file: '', notes: '' })
    setNewClip({ timestamp: '', description: '', type: 'Highlight' })
    setNewResearch({ type: 'Guide', title: '', url: '', notes: '', tags: '', used: false })
    setNewAchievement({ title: '', note: '', status: 'Target' })
  }, [game?.id])

  const updateStudio = (patch) => {
    updateStudioForGame(game, patch)
  }

  const updateSession = (id, patch) => {
    const next = studio.sessions.map(session => session.id === id ? { ...session, ...patch } : session)
    updateStudio({ sessions: next })
  }
  const addSession = () => {
    if (!newSession.date && !newSession.notes && !newSession.file && !newSession.duration) return
    const next = [...studio.sessions, { id: createId(), ...newSession }]
    updateStudio({ sessions: next })
    setNewSession({ date: '', duration: '', file: '', notes: '' })
  }
  const removeSession = (id) => {
    const next = studio.sessions.filter(session => session.id !== id)
    updateStudio({ sessions: next })
  }

  const updateClip = (id, patch) => {
    const next = studio.clips.map(clip => clip.id === id ? { ...clip, ...patch } : clip)
    updateStudio({ clips: next })
  }
  const addClip = () => {
    if (!newClip.timestamp && !newClip.description) return
    const next = [...studio.clips, { id: createId(), ...newClip }]
    updateStudio({ clips: next })
    setNewClip({ timestamp: '', description: '', type: 'Highlight' })
  }
  const removeClip = (id) => {
    const next = studio.clips.filter(clip => clip.id !== id)
    updateStudio({ clips: next })
  }

  const updateResearch = (id, patch) => {
    const next = studio.research.map(item => item.id === id ? { ...item, ...patch } : item)
    updateStudio({ research: next })
  }
  const addResearch = () => {
    if (!newResearch.title && !newResearch.url && !newResearch.notes) return
    const next = [...studio.research, { id: createId(), ...newResearch }]
    updateStudio({ research: next })
    setNewResearch({ type: 'Guide', title: '', url: '', notes: '', tags: '', used: false })
  }
  const removeResearch = (id) => {
    const next = studio.research.filter(item => item.id !== id)
    updateStudio({ research: next })
  }

  const updateAchievement = (id, patch) => {
    const next = studio.achievement_notes.map(item => item.id === id ? { ...item, ...patch } : item)
    updateStudio({ achievement_notes: next })
  }
  const addAchievement = () => {
    if (!newAchievement.title && !newAchievement.note) return
    const next = [...studio.achievement_notes, { id: createId(), ...newAchievement }]
    updateStudio({ achievement_notes: next })
    setNewAchievement({ title: '', note: '', status: 'Target' })
  }
  const removeAchievement = (id) => {
    const next = studio.achievement_notes.filter(item => item.id !== id)
    updateStudio({ achievement_notes: next })
  }

  if (!game) {
    return (
      <div className="p-3">
        <h2 className="h4">Creator Studio</h2>
        <div className="text-secondary mb-3">
          Pick any game to manage recordings, research, and review notes. This no longer depends on the current game.
        </div>
        <div className="card bg-panel p-3 mb-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <div className="me-auto">
              <div className="fw-semibold">Active Project</div>
              <div className="text-secondary small">Showing {studioOptions.options.length} of {studioOptions.total} matches</div>
            </div>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="studioShowAllEmpty"
                checked={showAll}
                onChange={e => setShowAll(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="studioShowAllEmpty">All games</label>
            </div>
          </div>
          {quickJumpProject && (
            <div className="studio-quick mt-3">
              <div>
                <div className="fw-semibold">Quick Jump</div>
                <div className="text-secondary small">
                  {quickJumpProject.title} - {formatRelativeTime(quickJumpProject.studio?.last_edited_at)}
                </div>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {!quickJumpProject.studio?.active && (
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => updateStudioForGame(quickJumpProject, { active: true })}
                  >
                    Add
                  </button>
                )}
                <button
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setSelectedGameId(quickJumpProject.id)}
                >
                  Open
                </button>
              </div>
            </div>
          )}
          <div className="mt-3">
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <div className="fw-semibold">Working Set</div>
              <div className="text-secondary small">{activeProjects.length} active</div>
            </div>
            {activeProjects.length === 0 ? (
              <div className="text-secondary small mt-1">
                No active projects yet. Add from the picker or promote an in-progress game.
              </div>
            ) : (
              <div className="studio-list mt-2">
                {activeProjects.map(project => (
                  <div key={project.id} className="studio-item d-flex flex-wrap align-items-center gap-2">
                    <div className="me-auto">
                      <div className="fw-semibold">{project.title}</div>
                      <div className="text-secondary small">
                        {project.console || 'Unknown'} - {project.status || 'Not Started'}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-outline-light"
                      onClick={() => setSelectedGameId(project.id)}
                    >
                      Open
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => updateStudioForGame(project, { active: false })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {inProgressSuggestions.length > 0 && (
            <div className="mt-3">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <div className="fw-semibold">In Progress</div>
                <div className="text-secondary small">{inProgressSuggestions.length} not in working set</div>
              </div>
              <div className="studio-list mt-2">
                {inProgressSuggestions.map(project => (
                  <div key={project.id} className="studio-item d-flex flex-wrap align-items-center gap-2">
                    <div className="me-auto">
                      <div className="fw-semibold">{project.title}</div>
                      <div className="text-secondary small">
                        {project.console || 'Unknown'} - {project.status || 'In Progress'}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => updateStudioForGame(project, { active: true })}
                    >
                      Add
                    </button>
                    <button
                      className="btn btn-sm btn-outline-light"
                      onClick={() => setSelectedGameId(project.id)}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="row g-2 mt-2">
            <div className="col-md-5">
              <input
                className="form-control"
                placeholder="Filter by title or console..."
                value={studioSearch}
                onChange={e => setStudioSearch(e.target.value)}
              />
            </div>
            <div className="col-md-7">
              <select
                className="form-select"
                value={selectedGameId}
                onChange={e => setSelectedGameId(e.target.value)}
              >
                <option value="">Select a game</option>
                {studioOptions.options.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.title} ({option.console || 'Unknown'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link className="btn btn-sm btn-outline-primary" to="/admin/library">Browse Library</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 studio-page">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-1">Creator Studio</h2>
          <div className="text-secondary small">
            Plan recordings, track sessions, keep research, and capture review notes for your active project.
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link className="btn btn-sm btn-outline-light" to={`/admin/library?edit=${encodeURIComponent(String(game.id))}`}>
            Edit Game
          </Link>
          <Link
            className="btn btn-sm btn-outline-primary"
            to={`/admin/achievements?gameId=${encodeURIComponent(String(game.id))}`}
          >
            Achievement Lookup
          </Link>
        </div>
      </div>
      <div className="studio-nav mb-3">
        {sectionLinks.map(link => (
          <a key={link.id} className="btn btn-sm btn-outline-light studio-nav-link" href={`#${link.id}`}>
            {link.label}
          </a>
        ))}
      </div>

      <div className="card bg-panel p-3 mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <div className="me-auto">
            <div className="fw-semibold">Active Project</div>
            <div className="text-secondary small">Showing {studioOptions.options.length} of {studioOptions.total} matches</div>
          </div>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="studioShowAll"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="studioShowAll">All games</label>
          </div>
        </div>
        {quickJumpProject && (
          <div className="studio-quick mt-3">
            <div>
              <div className="fw-semibold">Quick Jump</div>
              <div className="text-secondary small">
                {quickJumpProject.title} - {formatRelativeTime(quickJumpProject.studio?.last_edited_at)}
              </div>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {!quickJumpProject.studio?.active && (
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => updateStudioForGame(quickJumpProject, { active: true })}
                >
                  Add
                </button>
              )}
              <button
                className="btn btn-sm btn-outline-light"
                onClick={() => setSelectedGameId(quickJumpProject.id)}
              >
                Open
              </button>
            </div>
          </div>
        )}
        <div className="mt-3">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <div className="fw-semibold">Working Set</div>
            <div className="text-secondary small">{activeProjects.length} active</div>
          </div>
          {activeProjects.length === 0 ? (
            <div className="text-secondary small mt-1">
              No active projects yet. Add from the picker or promote an in-progress game.
            </div>
          ) : (
            <div className="studio-list mt-2">
              {activeProjects.map(project => (
                <div key={project.id} className="studio-item d-flex flex-wrap align-items-center gap-2">
                  <div className="me-auto">
                    <div className="fw-semibold">{project.title}</div>
                    <div className="text-secondary small">
                      {project.console || 'Unknown'} - {project.status || 'Not Started'}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-light"
                    onClick={() => setSelectedGameId(project.id)}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => updateStudioForGame(project, { active: false })}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {inProgressSuggestions.length > 0 && (
          <div className="mt-3">
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <div className="fw-semibold">In Progress</div>
              <div className="text-secondary small">{inProgressSuggestions.length} not in working set</div>
            </div>
            <div className="studio-list mt-2">
              {inProgressSuggestions.map(project => (
                <div key={project.id} className="studio-item d-flex flex-wrap align-items-center gap-2">
                  <div className="me-auto">
                    <div className="fw-semibold">{project.title}</div>
                    <div className="text-secondary small">
                      {project.console || 'Unknown'} - {project.status || 'In Progress'}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => updateStudioForGame(project, { active: true })}
                  >
                    Add
                  </button>
                  <button
                    className="btn btn-sm btn-outline-light"
                    onClick={() => setSelectedGameId(project.id)}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="row g-2 mt-2">
          <div className="col-md-5">
            <input
              className="form-control"
              placeholder="Filter by title or console..."
              value={studioSearch}
              onChange={e => setStudioSearch(e.target.value)}
            />
          </div>
          <div className="col-md-7">
            <select
              className="form-select"
              value={selectedGameId}
              onChange={e => setSelectedGameId(e.target.value)}
            >
              <option value="">Select a game</option>
              {studioOptions.options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.title} ({option.console || 'Unknown'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="studio-hero card bg-panel p-3 h-100">
            <div className="ratio ratio-4x3 studio-cover">
              {game.image_url ? (
                <img className="rounded-3 w-100 h-100 object-fit-cover" src={buildCoverUrl(game.image_url)} alt="" />
              ) : (
                <div className="rounded-3 w-100 h-100 d-flex align-items-center justify-content-center text-secondary bg-dark">No cover</div>
              )}
            </div>
            <div className="mt-3">
              <div className="studio-kicker">Active Project</div>
              <div className="h5 mb-1">{game.title}</div>
              <div className="text-secondary small">
                {game.console}{game.release_year ? ` - ${game.release_year}` : ''}
              </div>
              <div className="d-flex gap-2 flex-wrap mt-2">
                <span className="studio-chip">{game.status || 'Not Started'}</span>
                <span className="studio-chip studio-chip-alt">Video: {studio.status}</span>
                <span className="studio-chip studio-chip-muted">Priority: {studio.priority}</span>
              </div>
            </div>
            <div className="studio-metrics">
              {studioMetrics.map(metric => (
                <div key={metric.label} className="studio-metric">
                  <div className="studio-metric-label">{metric.label}</div>
                  <div className="studio-metric-value">{metric.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="studioActiveToggle"
                  checked={!!studio.active}
                  onChange={e => updateStudio({ active: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="studioActiveToggle">
                  Working set
                </label>
              </div>
            </div>

            <div className="mt-3">
              <label className="form-label small text-secondary">Video Status</label>
              <select
                className="form-select form-select-sm"
                value={studio.status}
                onChange={e => updateStudio({ status: e.target.value })}
              >
                <option>Idea</option>
                <option>Scripting</option>
                <option>Recording</option>
                <option>Editing</option>
                <option>Scheduled</option>
                <option>Published</option>
                <option>Scrapped</option>
              </select>
            </div>

            <div className="mt-2">
              <label className="form-label small text-secondary">Priority</label>
              <select
                className="form-select form-select-sm"
                value={studio.priority}
                onChange={e => updateStudio({ priority: e.target.value })}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>

            <div className="mt-2">
              <label className="form-label small text-secondary">Target Publish Date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={studio.target_date}
                onChange={e => updateStudio({ target_date: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card bg-panel p-3 h-100" id="studio-plan">
            <h3 className="h6 text-light mb-3">Video Plan</h3>
            <div className="row g-3">
              <div className="col-md-6">
                <div className="mb-3">
                  <label className="form-label small text-secondary">Series</label>
                  <input
                    className="form-control"
                    value={studio.series}
                    onChange={e => updateStudio({ series: e.target.value })}
                    placeholder="Retro review series"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small text-secondary">Episode</label>
                  <input
                    className="form-control"
                    value={studio.episode}
                    onChange={e => updateStudio({ episode: e.target.value })}
                    placeholder="Episode 12"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small text-secondary">Runtime Target (min)</label>
                  <input
                    className="form-control"
                    value={studio.runtime}
                    onChange={e => updateStudio({ runtime: e.target.value })}
                    placeholder="15"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small text-secondary">Tags</label>
                  <input
                    className="form-control"
                    value={studio.tags}
                    onChange={e => updateStudio({ tags: e.target.value })}
                    placeholder="speedrun, retro, challenge"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="mb-3">
                  <label className="form-label small text-secondary">Hook</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    value={studio.hook}
                    onChange={e => updateStudio({ hook: e.target.value })}
                    placeholder="Open with the most intense moment."
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small text-secondary">Outline</label>
                  <textarea
                    className="form-control"
                    rows="5"
                    value={studio.outline}
                    onChange={e => updateStudio({ outline: e.target.value })}
                    placeholder="Intro, gameplay beats, achievement focus, verdict."
                  />
                </div>
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label small text-secondary">Script / Narrative Notes</label>
              <textarea
                className="form-control"
                rows="4"
                value={studio.script}
                onChange={e => updateStudio({ script: e.target.value })}
              />
            </div>
            <div className="mb-0">
              <label className="form-label small text-secondary">Thumbnail Ideas</label>
              <textarea
                className="form-control"
                rows="3"
                value={studio.thumbnail}
                onChange={e => updateStudio({ thumbnail: e.target.value })}
                placeholder="Key art, badge highlights, bold text."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-0">
        <div className="col-lg-6">
          <div className="card bg-panel p-3 h-100" id="studio-recording">
            <h3 className="h6 text-light mb-3">Recording Log</h3>
            <div className="mb-3">
              <label className="form-label small text-secondary">Recording Setup</label>
              <textarea
                className="form-control"
                rows="3"
                value={studio.recording_setup}
                onChange={e => updateStudio({ recording_setup: e.target.value })}
                placeholder="Capture card, emulator settings, audio chain."
              />
            </div>
            <div className="mb-3">
              <label className="form-label small text-secondary">Production Notes</label>
              <textarea
                className="form-control"
                rows="2"
                value={studio.recording_notes}
                onChange={e => updateStudio({ recording_notes: e.target.value })}
                placeholder="Audio fixes, capture quirks, follow-ups."
              />
            </div>
            <div className="row g-2 align-items-end">
              <div className="col-sm-6 col-lg-4">
                <label className="form-label small text-secondary">Session Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={newSession.date}
                  onChange={e => setNewSession(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="col-sm-6 col-lg-4">
                <label className="form-label small text-secondary">Duration</label>
                <input
                  className="form-control form-control-sm"
                  value={newSession.duration}
                  onChange={e => setNewSession(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="2h 30m"
                />
              </div>
              <div className="col-lg-4">
                <label className="form-label small text-secondary">File Ref</label>
                <input
                  className="form-control form-control-sm"
                  value={newSession.file}
                  onChange={e => setNewSession(prev => ({ ...prev, file: e.target.value }))}
                  placeholder="D:\\captures\\session01"
                />
              </div>
              <div className="col-12">
                <label className="form-label small text-secondary">Session Notes</label>
                <textarea
                  className="form-control form-control-sm"
                  rows="2"
                  value={newSession.notes}
                  onChange={e => setNewSession(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Key moments, performance notes, issues."
                />
              </div>
              <div className="col-12">
                <button className="btn btn-sm btn-primary" onClick={addSession}>Add Session</button>
              </div>
            </div>

            <div className="studio-list mt-3">
              {studio.sessions.length === 0 ? (
                <div className="text-secondary small">No recording sessions logged yet.</div>
              ) : studio.sessions.map(session => (
                <div key={session.id} className="studio-item">
                  <div className="row g-2 align-items-end">
                    <div className="col-sm-6 col-lg-3">
                      <label className="form-label small text-secondary">Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={session.date || ''}
                        onChange={e => updateSession(session.id, { date: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-6 col-lg-3">
                      <label className="form-label small text-secondary">Duration</label>
                      <input
                        className="form-control form-control-sm"
                        value={session.duration || ''}
                        onChange={e => updateSession(session.id, { duration: e.target.value })}
                      />
                    </div>
                    <div className="col-lg-4">
                      <label className="form-label small text-secondary">File Ref</label>
                      <input
                        className="form-control form-control-sm"
                        value={session.file || ''}
                        onChange={e => updateSession(session.id, { file: e.target.value })}
                      />
                    </div>
                    <div className="col-lg-2 text-end">
                      <button className="btn btn-sm btn-outline-danger w-100" onClick={() => removeSession(session.id)}>Remove</button>
                    </div>
                    <div className="col-12">
                      <label className="form-label small text-secondary">Notes</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows="2"
                        value={session.notes || ''}
                        onChange={e => updateSession(session.id, { notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card bg-panel p-3 h-100" id="studio-clips">
            <h3 className="h6 text-light mb-3">Clip List</h3>
            <div className="row g-2 align-items-end">
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Timestamp</label>
                <input
                  className="form-control form-control-sm"
                  value={newClip.timestamp}
                  onChange={e => setNewClip(prev => ({ ...prev, timestamp: e.target.value }))}
                  placeholder="00:12:34"
                />
              </div>
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Type</label>
                <select
                  className="form-select form-select-sm"
                  value={newClip.type}
                  onChange={e => setNewClip(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option>Highlight</option>
                  <option>Achievement</option>
                  <option>Tip</option>
                  <option>Boss</option>
                  <option>B-roll</option>
                </select>
              </div>
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Description</label>
                <input
                  className="form-control form-control-sm"
                  value={newClip.description}
                  onChange={e => setNewClip(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Perfect run segment"
                />
              </div>
              <div className="col-12">
                <button className="btn btn-sm btn-primary" onClick={addClip}>Add Clip</button>
              </div>
            </div>

            <div className="studio-list mt-3">
              {studio.clips.length === 0 ? (
                <div className="text-secondary small">No clips logged yet.</div>
              ) : studio.clips.map(clip => (
                <div key={clip.id} className="studio-item">
                  <div className="row g-2 align-items-end">
                    <div className="col-sm-3">
                      <label className="form-label small text-secondary">Timestamp</label>
                      <input
                        className="form-control form-control-sm"
                        value={clip.timestamp || ''}
                        onChange={e => updateClip(clip.id, { timestamp: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-3">
                      <label className="form-label small text-secondary">Type</label>
                      <select
                        className="form-select form-select-sm"
                        value={clip.type || 'Highlight'}
                        onChange={e => updateClip(clip.id, { type: e.target.value })}
                      >
                        <option>Highlight</option>
                        <option>Achievement</option>
                        <option>Tip</option>
                        <option>Boss</option>
                        <option>B-roll</option>
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label small text-secondary">Description</label>
                      <input
                        className="form-control form-control-sm"
                        value={clip.description || ''}
                        onChange={e => updateClip(clip.id, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-2 text-end">
                      <button className="btn btn-sm btn-outline-danger w-100" onClick={() => removeClip(clip.id)}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-0">
        <div className="col-lg-6">
          <div className="card bg-panel p-3 h-100" id="studio-research">
            <h3 className="h6 text-light mb-3">Research Library</h3>
            <div className="row g-2 align-items-end">
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Type</label>
                <select
                  className="form-select form-select-sm"
                  value={newResearch.type}
                  onChange={e => setNewResearch(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option>Guide</option>
                  <option>Wiki</option>
                  <option>Forum</option>
                  <option>Video</option>
                  <option>Notes</option>
                </select>
              </div>
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Title</label>
                <input
                  className="form-control form-control-sm"
                  value={newResearch.title}
                  onChange={e => setNewResearch(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Boss strategy thread"
                />
              </div>
              <div className="col-sm-4">
                <label className="form-label small text-secondary">URL</label>
                <input
                  className="form-control form-control-sm"
                  value={newResearch.url}
                  onChange={e => setNewResearch(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://"
                />
              </div>
              <div className="col-12">
                <label className="form-label small text-secondary">Notes</label>
                <textarea
                  className="form-control form-control-sm"
                  rows="2"
                  value={newResearch.notes}
                  onChange={e => setNewResearch(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Key takeaway, quotes, timestamps."
                />
              </div>
              <div className="col-sm-8">
                <label className="form-label small text-secondary">Tags</label>
                <input
                  className="form-control form-control-sm"
                  value={newResearch.tags}
                  onChange={e => setNewResearch(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="speed tech, hidden routes"
                />
              </div>
              <div className="col-sm-4">
                <div className="form-check mt-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="newResearchUsed"
                    checked={newResearch.used}
                    onChange={e => setNewResearch(prev => ({ ...prev, used: e.target.checked }))}
                  />
                  <label className="form-check-label small" htmlFor="newResearchUsed">Already used</label>
                </div>
              </div>
              <div className="col-12">
                <button className="btn btn-sm btn-primary" onClick={addResearch}>Add Research</button>
              </div>
            </div>

            <div className="studio-list mt-3">
              {studio.research.length === 0 ? (
                <div className="text-secondary small">No research items saved yet.</div>
              ) : studio.research.map(item => (
                <div key={item.id} className="studio-item">
                  <div className="row g-2 align-items-end">
                    <div className="col-sm-3">
                      <label className="form-label small text-secondary">Type</label>
                      <select
                        className="form-select form-select-sm"
                        value={item.type || 'Guide'}
                        onChange={e => updateResearch(item.id, { type: e.target.value })}
                      >
                        <option>Guide</option>
                        <option>Wiki</option>
                        <option>Forum</option>
                        <option>Video</option>
                        <option>Notes</option>
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label small text-secondary">Title</label>
                      <input
                        className="form-control form-control-sm"
                        value={item.title || ''}
                        onChange={e => updateResearch(item.id, { title: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-3">
                      <label className="form-label small text-secondary">URL</label>
                      <input
                        className="form-control form-control-sm"
                        value={item.url || ''}
                        onChange={e => updateResearch(item.id, { url: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-2 text-end">
                      <button className="btn btn-sm btn-outline-danger w-100" onClick={() => removeResearch(item.id)}>Remove</button>
                    </div>
                    <div className="col-12">
                      <label className="form-label small text-secondary">Notes</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows="2"
                        value={item.notes || ''}
                        onChange={e => updateResearch(item.id, { notes: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-8">
                      <label className="form-label small text-secondary">Tags</label>
                      <input
                        className="form-control form-control-sm"
                        value={item.tags || ''}
                        onChange={e => updateResearch(item.id, { tags: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-4">
                      <div className="form-check mt-4">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`researchUsed-${item.id}`}
                          checked={!!item.used}
                          onChange={e => updateResearch(item.id, { used: e.target.checked })}
                        />
                        <label className="form-check-label small" htmlFor={`researchUsed-${item.id}`}>
                          Already used
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card bg-panel p-3" id="studio-review">
            <h3 className="h6 text-light mb-3">Review Notes</h3>
            <div className="mb-3">
              <label className="form-label small text-secondary">Summary</label>
              <textarea
                className="form-control"
                rows="3"
                value={studio.review_summary}
                onChange={e => updateStudio({ review_summary: e.target.value })}
              />
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small text-secondary">Pros</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={studio.review_pros}
                  onChange={e => updateStudio({ review_pros: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small text-secondary">Cons</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={studio.review_cons}
                  onChange={e => updateStudio({ review_cons: e.target.value })}
                />
              </div>
            </div>
            <div className="row g-3 mt-1">
              <div className="col-sm-6">
                <label className="form-label small text-secondary">Verdict</label>
                <input
                  className="form-control"
                  value={studio.verdict}
                  onChange={e => updateStudio({ verdict: e.target.value })}
                  placeholder="Must-play for fans, rough for newcomers."
                />
              </div>
              <div className="col-sm-6">
                <label className="form-label small text-secondary">Score</label>
                <input
                  className="form-control"
                  value={studio.review_score}
                  onChange={e => updateStudio({ review_score: e.target.value })}
                  placeholder="8.5"
                />
              </div>
            </div>
          </div>

          <div className="card bg-panel p-3 mt-3" id="studio-achievements">
            <h3 className="h6 text-light mb-3">Achievement Callouts</h3>
            <div className="row g-2 align-items-end">
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Achievement</label>
                <input
                  className="form-control form-control-sm"
                  value={newAchievement.title}
                  onChange={e => setNewAchievement(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Name or ID"
                />
              </div>
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Status</label>
                <select
                  className="form-select form-select-sm"
                  value={newAchievement.status}
                  onChange={e => setNewAchievement(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option>Target</option>
                  <option>Captured</option>
                  <option>Needs Retry</option>
                </select>
              </div>
              <div className="col-sm-4">
                <label className="form-label small text-secondary">Note</label>
                <input
                  className="form-control form-control-sm"
                  value={newAchievement.note}
                  onChange={e => setNewAchievement(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Clip at 01:20:10"
                />
              </div>
              <div className="col-12">
                <button className="btn btn-sm btn-primary" onClick={addAchievement}>Add Callout</button>
              </div>
            </div>

            <div className="studio-list mt-3">
              {studio.achievement_notes.length === 0 ? (
                <div className="text-secondary small">No achievement callouts yet.</div>
              ) : studio.achievement_notes.map(item => (
                <div key={item.id} className="studio-item">
                  <div className="row g-2 align-items-end">
                    <div className="col-sm-4">
                      <label className="form-label small text-secondary">Achievement</label>
                      <input
                        className="form-control form-control-sm"
                        value={item.title || ''}
                        onChange={e => updateAchievement(item.id, { title: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-3">
                      <label className="form-label small text-secondary">Status</label>
                      <select
                        className="form-select form-select-sm"
                        value={item.status || 'Target'}
                        onChange={e => updateAchievement(item.id, { status: e.target.value })}
                      >
                        <option>Target</option>
                        <option>Captured</option>
                        <option>Needs Retry</option>
                      </select>
                    </div>
                    <div className="col-sm-3">
                      <label className="form-label small text-secondary">Note</label>
                      <input
                        className="form-control form-control-sm"
                        value={item.note || ''}
                        onChange={e => updateAchievement(item.id, { note: e.target.value })}
                      />
                    </div>
                    <div className="col-sm-2 text-end">
                      <button className="btn btn-sm btn-outline-danger w-100" onClick={() => removeAchievement(item.id)}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
