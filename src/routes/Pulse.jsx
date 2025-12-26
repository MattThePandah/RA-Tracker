import React from 'react'
import { useGame } from '../context/GameContext.jsx'

const palette = ['#5eead4', '#60a5fa', '#fbbf24', '#f87171', '#c084fc', '#34d399', '#f472b6', '#38bdf8']

const normalizeStatus = (value) => String(value || '').trim().toLowerCase()

const isInProgress = (game) => {
  const status = normalizeStatus(game?.status)
  if (!status) return false
  if (status === 'in progress' || status === 'in-progress') return true
  return status.includes('progress')
}

const formatHours = (hours) => {
  const safe = Number(hours || 0)
  if (!Number.isFinite(safe) || safe <= 0) return '0h'
  return `${safe.toFixed(1)}h`
}

const formatCount = (value) => {
  const safe = Number(value || 0)
  if (!Number.isFinite(safe)) return '0'
  return safe.toLocaleString()
}

const summarizeRows = (rows, key, label, limit) => {
  if (!Array.isArray(rows)) return []
  if (rows.length <= limit) return rows
  const head = rows.slice(0, limit)
  const tail = rows.slice(limit)
  const seconds = tail.reduce((sum, row) => sum + (row.seconds || 0), 0)
  const hours = tail.reduce((sum, row) => sum + (row.hours || 0), 0)
  const percent = tail.reduce((sum, row) => sum + (row.percent || 0), 0)
  return [
    ...head,
    {
      [key]: label,
      seconds: Math.round(seconds),
      hours: Number(hours.toFixed(2)),
      percent: Number(percent.toFixed(1))
    }
  ]
}

const buildConic = (rows) => {
  if (!rows.length) return 'conic-gradient(#2a2f3a 0deg, #2a2f3a 360deg)'
  let current = 0
  const segments = rows.map((row, idx) => {
    const pct = Math.max(0, Math.min(100, Number(row.percent) || 0))
    const start = current
    const end = Math.min(100, start + pct)
    current = end
    const color = palette[idx % palette.length]
    return `${color} ${start}% ${end}%`
  })
  if (current < 100) {
    segments.push(`#2a2f3a ${current}% 100%`)
  }
  return `conic-gradient(${segments.join(', ')})`
}

export default function Pulse() {
  const { state } = useGame()
  const [pulse, setPulse] = React.useState(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [range, setRange] = React.useState('all')
  const [rangeNotice, setRangeNotice] = React.useState('')

  const refreshPulse = React.useCallback(async ({ refreshGenres = false } = {}) => {
    setLoading(true)
    setError('')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const url = new URL(`${base}/api/stats/pulse`)
      if (range && range !== 'all') url.searchParams.set('range', range)
      if (refreshGenres) url.searchParams.set('refreshGenres', '1')
      const res = await fetch(url.toString(), { credentials: 'include' })
      if (!res.ok) throw new Error('pulse_fetch_failed')
      const data = await res.json()
      setPulse(data)
    } catch (err) {
      setError('Failed to load Activity Pulse stats.')
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => {
    refreshPulse()
    const id = setInterval(() => refreshPulse(), 60000)
    return () => clearInterval(id)
  }, [refreshPulse])

  const totals = React.useMemo(() => {
    const total = state.games.length
    const completed = state.games.filter(g => g.status === 'Completed').length
    const inProgress = state.games.filter(g => isInProgress(g)).length
    const backlog = Math.max(0, total - completed)
    const completionRate = total ? Math.round((completed / total) * 100) : 0
    const backlogRate = total ? Math.max(0, 100 - completionRate) : 0
    return { total, completed, inProgress, backlog, completionRate, backlogRate }
  }, [state.games])

  const consoleRows = React.useMemo(() => (
    summarizeRows(pulse?.perConsole || [], 'console', 'Other consoles', 8)
  ), [pulse])

  const genreRows = React.useMemo(() => (
    summarizeRows(pulse?.perGenre || [], 'genre', 'Other genres', 6)
  ), [pulse])

  const pieGradient = React.useMemo(() => buildConic(genreRows), [genreRows])

  return (
    <div className="p-3 pulse-page">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-1">Activity Pulse</h2>
          <div className="text-secondary small">Analytics view of playtime, backlog, and genre mix.</div>
          <div className="text-secondary small">Auto-refresh every 60 seconds.</div>
          {rangeNotice && <div className="text-secondary small">{rangeNotice}</div>}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <select
            className="form-select form-select-sm"
            value={range}
            onChange={(e) => {
              const next = e.target.value
              if (!pulse?.rangeSupported && next !== 'all') {
                setRange('all')
                setRangeNotice('Time-range filters unlock after Activity Timeline ships.')
                return
              }
              setRangeNotice('')
              setRange(next)
            }}
          >
            <option value="all">All time</option>
            <option value="7d" disabled={!pulse?.rangeSupported}>Last 7 days</option>
            <option value="30d" disabled={!pulse?.rangeSupported}>Last 30 days</option>
            <option value="90d" disabled={!pulse?.rangeSupported}>Last 90 days</option>
          </select>
          <button
            className="btn btn-sm btn-outline-light"
            onClick={() => refreshPulse()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => refreshPulse({ refreshGenres: true })}
            disabled={loading}
          >
            Enrich Genres
          </button>
          {pulse?.generatedAt && (
            <div className="text-secondary small">
              Updated {new Date(pulse.generatedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="pulse-hero mb-3">
        <div className="pulse-card">
          <div className="pulse-label">Total Time Tracked</div>
          <div className="pulse-value">{formatHours(pulse?.totalHours)}</div>
          <div className="pulse-sub">Across {formatCount(pulse?.trackedGames || 0)} games</div>
        </div>
        <div className="pulse-card">
          <div className="pulse-label">Library Completion</div>
          <div className="pulse-value">{totals.completionRate}%</div>
          <div className="pulse-sub">{formatCount(totals.completed)} completed</div>
        </div>
        <div className="pulse-card">
          <div className="pulse-label">Backlog</div>
          <div className="pulse-value">{formatCount(totals.backlog)}</div>
          <div className="pulse-sub">{formatCount(totals.inProgress)} in progress</div>
        </div>
        <div className="pulse-card">
          <div className="pulse-label">Active Consoles</div>
          <div className="pulse-value">{formatCount(consoleRows.length)}</div>
          <div className="pulse-sub">{formatHours(pulse?.totalHours)} total</div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card bg-panel p-3 h-100">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <h3 className="h6 text-light mb-0">Time Played by Console</h3>
              <span className="text-secondary small">Top platforms by hours</span>
            </div>
            {loading && <div className="text-secondary small">Loading pulse data...</div>}
            {!loading && (!consoleRows.length) && (
              <div className="text-secondary small">No time data yet. Start a session to build your pulse.</div>
            )}
            <div className="pulse-bars">
              {consoleRows.map((row, idx) => (
                <div key={`${row.console}-${idx}`} className="pulse-bar-row">
                  <div className="pulse-bar-label">
                    <span>{row.console}</span>
                    <span className="text-secondary">{formatHours(row.hours)} ({row.percent}%)</span>
                  </div>
                  <div className="pulse-bar-track">
                    <div
                      className="pulse-bar-fill"
                      style={{ width: `${Math.min(100, row.percent || 0)}%`, background: palette[idx % palette.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card bg-panel p-3 h-100">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <h3 className="h6 text-light mb-0">Genre Mix</h3>
              <span className="text-secondary small">Heuristic tags from titles</span>
            </div>
            <div className="pulse-genre-grid">
              <div className="pulse-pie" style={{ background: pieGradient }} />
              <div className="pulse-legend">
                {genreRows.map((row, idx) => (
                  <div key={`${row.genre}-${idx}`} className="pulse-legend-row">
                    <span className="pulse-dot" style={{ background: palette[idx % palette.length] }} />
                    <div className="pulse-legend-text">
                      <div>{row.genre}</div>
                      <div className="text-secondary small">{formatHours(row.hours)} ({row.percent}%)</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-panel p-3 mt-3">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h3 className="h6 text-light mb-0">Completion Rate vs Backlog Growth</h3>
          <span className="text-secondary small">Snapshot of finished vs remaining titles</span>
        </div>
        <div className="pulse-split-bar">
          <div className="pulse-split completed" style={{ width: `${totals.completionRate}%` }}>
            <span>{totals.completionRate}% Complete</span>
          </div>
          <div className="pulse-split backlog" style={{ width: `${totals.backlogRate}%` }}>
            <span>{totals.backlogRate}% Backlog</span>
          </div>
        </div>
        <div className="pulse-split-meta text-secondary small">
          {formatCount(totals.completed)} completed, {formatCount(totals.backlog)} remaining in the library.
        </div>
      </div>
    </div>
  )
}
