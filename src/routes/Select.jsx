import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useGame } from '../context/GameContext.jsx'
import UnifiedWheel from '../components/UnifiedWheel.jsx'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { adminFetch } from '../utils/adminFetch.js'
import { fetchOverlaySettings, updateOverlaySettings as updateOverlaySettingsAdmin } from '../services/overlaySettings.js'

export default function Select() {
  const { state, dispatch } = useGame()
  const [wheelState, setWheelState] = useState({ mode: 'game', sample: [], pool: [] })
  const [spinning, setSpinning] = useState(false)
  const [includeSuggestions, setIncludeSuggestions] = useState(false)
  const [consoleFilter, setConsoleFilter] = useState('All')
  const [overlayWheelPinned, setOverlayWheelPinned] = useState(false)
  const [overlayWheelSaving, setOverlayWheelSaving] = useState(false)
  const debugWheel = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugWheel') === '1'

  const fetchState = useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/wheel/state${debugWheel ? '?debug=1' : ''}`)
      if (res.ok) {
        const json = await res.json()
        setWheelState(json)
        if (json.settings) {
          if (json.settings.includeSuggestions !== undefined) setIncludeSuggestions(json.settings.includeSuggestions)
          if (json.settings.consoleFilter) setConsoleFilter(json.settings.consoleFilter)
        }
      }
    } catch (e) { console.error(e) }
  }, [debugWheel])

  useEffect(() => {
    fetchState()
    const id = setInterval(fetchState, 1000)
    return () => clearInterval(id)
  }, [fetchState])

  const loadOverlayPinned = useCallback(async () => {
    try {
      const settings = await fetchOverlaySettings()
      setOverlayWheelPinned(settings.full?.tv?.wheelPinned === true)
    } catch { }
  }, [])

  useEffect(() => {
    loadOverlayPinned()
  }, [loadOverlayPinned])

  const setOverlayPinned = async (nextPinned) => {
    setOverlayWheelSaving(true)
    try {
      const updated = await updateOverlaySettingsAdmin({ full: { tv: { wheelPinned: nextPinned } } })
      setOverlayWheelPinned(updated.full?.tv?.wheelPinned === true)
    } catch {
      // Re-sync from server if save fails
      loadOverlayPinned()
    } finally {
      setOverlayWheelSaving(false)
    }
  }

  const setMode = async (mode) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      await adminFetch(`${base}/wheel/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      })
      fetchState()
    } catch (e) { }
  }

  const updateSettings = async (updates) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      await adminFetch(`${base}/wheel/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      fetchState()
    } catch (e) { }
  }

  const handleSpin = async () => {
    try {
      setSpinning(true)
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      await updateSettings({
        includeSuggestions,
        consoleFilter,
        bonusMode: state.settings.hideBonusGames ? 'exclude' : 'include'
      })
      const res = await adminFetch(`${base}/wheel/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (res.ok) fetchState()
    } catch (e) { setSpinning(false) }
  }

  const onSpinComplete = (winner) => {
    setSpinning(false)
    if (winner && winner.type !== 'console') {
      if (!String(winner.id).startsWith('suggestion-')) {
        dispatch({ type: 'SET_CURRENT', id: winner.id })
        if (winner.status === 'Not Started') {
          const updated = { ...winner, status: 'In Progress', date_started: winner.date_started || new Date().toISOString() }
          dispatch({ type: 'UPDATE_GAME', game: updated })
        }
      }
    } else if (winner && winner.type === 'console') {
      if (winner.title) {
        setConsoleFilter(winner.title)
        setMode('game')
        updateSettings({ consoleFilter: winner.title })
      }
    }
  }

  const consoles = useMemo(() => {
    const s = new Set()
    state.games.forEach(g => {
      let name = ''
      if (g.console) {
        name = typeof g.console === 'object' ? (g.console.name || g.console.id || '') : String(g.console)
      }
      if (name) s.add(name)
    })
    const list = ['All', ...Array.from(s).sort()]
    // Keep the currently selected value visible even if it isn't in the client-derived list
    if (consoleFilter && consoleFilter !== 'All' && !list.includes(consoleFilter)) {
      list.splice(1, 0, consoleFilter)
    }
    return list
  }, [state.games, consoleFilter])

  const sampleNonNull = useMemo(() => (
    Array.isArray(wheelState.sample) ? wheelState.sample.filter(Boolean).length : 0
  ), [wheelState.sample])

  const samplePreview = useMemo(() => {
    const arr = Array.isArray(wheelState.sample) ? wheelState.sample : []
    return arr.slice(0, 16).map(item => {
      if (!item) return null
      if (typeof item === 'string') return item
      const title = item.title || item.name || ''
      if (typeof title === 'string') return title
      if (title && typeof title === 'object') return title.name || title.id || String(title)
      return String(title || item.id || '')
    })
  }, [wheelState.sample])

  return (
    <div className="container-fluid p-4">
      <div className="row g-4">
        {/* Controls */}
        <div className="col-12 col-md-3">
          <div className="card bg-panel border-0 shadow-sm">
            <div className="card-header bg-transparent py-3">
              <h5 className="card-title h6 mb-0 text-white">Wheel Controls</h5>
            </div>
            <div className="card-body vstack gap-3">
              {Number(wheelState.poolSize) === 0 && sampleNonNull === 0 && (
                <div className="alert alert-warning bg-opacity-10 border-warning border-opacity-25 small mb-0">
                  <div className="fw-bold">Wheel pool is empty</div>
                  <div className="opacity-75">This usually means the server library index hasn’t been built yet.</div>
                </div>
              )}

              {/* Mode Switcher */}
              <div className="btn-group w-100">
                <button
                  className={`btn btn-sm ${wheelState.mode === 'console' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setMode('console')}
                >
                  <i className="bi bi-controller me-2"></i>Console
                </button>
                <button
                  className={`btn btn-sm ${wheelState.mode === 'game' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setMode('game')}
                >
                  <i className="bi bi-disc me-2"></i>Game
                </button>
              </div>

              <hr className="border-secondary opacity-25 my-1" />

              {wheelState.mode === 'game' && (
                <>
                  <div>
                    <label className="form-label small text-muted text-uppercase fw-bold">Console Filter</label>
                    <select
                      className="form-select form-select-sm bg-dark border-secondary text-light"
                      value={consoleFilter}
                      onChange={(e) => {
                        setConsoleFilter(e.target.value)
                        updateSettings({ consoleFilter: e.target.value })
                      }}
                    >
                      {consoles.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="useSuggestions"
                      checked={includeSuggestions}
                      onChange={(e) => {
                        setIncludeSuggestions(e.target.checked)
                        updateSettings({ includeSuggestions: e.target.checked })
                      }}
                    />
                    <label className="form-check-label text-light small" htmlFor="useSuggestions">
                      Include Suggestions
                    </label>
                  </div>
                </>
              )}

              {wheelState.mode === 'console' && (
                <div className="alert alert-info bg-opacity-10 border-info border-opacity-25 small mb-0">
                  <i className="bi bi-info-circle me-2"></i>
                  Consoles are automatically restricted if an event is active.
                </div>
              )}

              <div className="form-check form-switch mt-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="overlayWheelPinned"
                  checked={overlayWheelPinned}
                  disabled={overlayWheelSaving}
                  onChange={(e) => setOverlayPinned(e.target.checked)}
                />
                <label className="form-check-label text-light small" htmlFor="overlayWheelPinned">
                  Show Wheel on Full Overlay {overlayWheelSaving ? '(Saving...)' : ''}
                </label>
              </div>

              <button
                className="btn btn-warning w-100 py-2 fw-bold mt-2"
                onClick={handleSpin}
                disabled={spinning}
              >
                {spinning ? 'SPINNING...' : 'SPIN WHEEL'}
              </button>

              {debugWheel && (
                <div className="mt-2 small text-secondary">
                  <div className="fw-bold text-uppercase opacity-75">Debug</div>
                  <pre className="bg-black rounded p-2 border border-secondary border-opacity-25 mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify({
                      spinning,
                      baseUrl: import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787',
                      version: wheelState.version,
                      mode: wheelState.mode,
                      poolSize: wheelState.poolSize,
                      sampleNonNull,
                      samplePreview,
                      spin: wheelState.spin ? {
                        ts: wheelState.spin.ts,
                        targetIdx: wheelState.spin.targetIdx,
                        durationMs: wheelState.spin.durationMs,
                        turns: wheelState.spin.turns,
                        sampleNonNull: Array.isArray(wheelState.spin.sample) ? wheelState.spin.sample.filter(Boolean).length : undefined
                      } : null,
                      settings: wheelState.settings,
                      debug: wheelState.debug
                      ,
                      event: wheelState.event
                    }, null, 2)}
                  </pre>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Wheel Display */}
        <div className="col-12 col-md-9" style={{ minHeight: '600px' }}>
          <div className="card bg-panel border-0 shadow-sm h-100">
            <div className="card-body p-0 position-relative overflow-hidden d-flex align-items-center justify-content-center bg-black rounded">
              {/* Background Grid/Effect */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
                backgroundSize: '100% 2px, 3px 100%',
                pointerEvents: 'none'
              }} />

              <div style={{ width: '80%', height: '80%', maxWidth: '800px', maxHeight: '800px' }}>
                <UnifiedWheel
                  mode={wheelState.mode}
                  sample={wheelState.sample}
                  spinSeed={spinning ? wheelState.spin : null}
                  onSpinComplete={onSpinComplete}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
