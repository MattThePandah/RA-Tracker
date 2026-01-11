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
  const [bonusExclusions, setBonusExclusions] = useState({ subset: false, demo: false, hack: false, homebrew: false })
  const [spinSource, setSpinSource] = useState('pool') // 'pool' | 'sample'
  const [poolMode, setPoolMode] = useState('all') // 'all' | 'custom'
  const [customGameIds, setCustomGameIds] = useState([])
  const [customIncludeSuggestions, setCustomIncludeSuggestions] = useState(false)
  const [customSearch, setCustomSearch] = useState('')
  const [consoleCustomItems, setConsoleCustomItems] = useState([])
  const [consoleItemInput, setConsoleItemInput] = useState('')
  const [overlayWheelPinned, setOverlayWheelPinned] = useState(false)
  const [overlayWheelStyle, setOverlayWheelStyle] = useState('wheel') // 'wheel' | 'capsule'
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
            if (json.settings.spinSource === 'sample' || json.settings.spinSource === 'pool') setSpinSource(json.settings.spinSource)
            if (json.settings.poolMode === 'all' || json.settings.poolMode === 'custom') setPoolMode(json.settings.poolMode)
            if (Array.isArray(json.settings.customGameIds)) setCustomGameIds(json.settings.customGameIds.map(id => String(id || '')).filter(Boolean))
            if (json.settings.customIncludeSuggestions !== undefined) setCustomIncludeSuggestions(json.settings.customIncludeSuggestions === true)
            if (Array.isArray(json.settings.consoleCustomItems)) setConsoleCustomItems(json.settings.consoleCustomItems.map(v => String(v || '')).filter(Boolean))
            if (json.settings.bonusExclusions && typeof json.settings.bonusExclusions === 'object') {
              setBonusExclusions(prev => ({
                ...prev,
                subset: json.settings.bonusExclusions.subset === true,
                demo: json.settings.bonusExclusions.demo === true,
              hack: json.settings.bonusExclusions.hack === true,
              homebrew: json.settings.bonusExclusions.homebrew === true
            }))
          }
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
      setOverlayWheelStyle(settings.full?.tv?.wheelStyle === 'capsule' ? 'capsule' : 'wheel')
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

  const setOverlayStyle = async (nextStyle) => {
    const style = nextStyle === 'capsule' ? 'capsule' : 'wheel'
    setOverlayWheelSaving(true)
    try {
      const updated = await updateOverlaySettingsAdmin({ full: { tv: { wheelStyle: style } } })
      setOverlayWheelStyle(updated.full?.tv?.wheelStyle === 'capsule' ? 'capsule' : 'wheel')
    } catch {
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
      const anyBonusExcluded = Object.values(bonusExclusions || {}).some(Boolean)
      const effectiveBonusMode = state.settings.hideBonusGames ? 'exclude' : (anyBonusExcluded ? 'exclude' : 'include')
      const effectiveBonusExclusions = state.settings.hideBonusGames ? null : bonusExclusions
      await updateSettings({
        includeSuggestions,
        consoleFilter,
        poolMode,
        customGameIds,
        customIncludeSuggestions,
        consoleCustomItems,
        spinSource,
        bonusMode: effectiveBonusMode,
        ...(effectiveBonusExclusions ? { bonusExclusions: effectiveBonusExclusions } : {})
      })
      // If the overlay picker is the capsule/claw machine, use a longer spin so the animation feels intentional.
      const durationOverrideMs = overlayWheelStyle === 'capsule' ? 9000 : undefined
      const res = await adminFetch(`${base}/wheel/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(durationOverrideMs ? { durationMs: durationOverrideMs } : {})
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
        // Clear current game when selecting a console via the console wheel.
        dispatch({ type: 'SET_CURRENT', id: null })
        try {
          const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
          adminFetch(`${base}/overlay/current`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current: null })
          })
        } catch { }
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

  const customGames = useMemo(() => {
    const byId = new Map(state.games.map(g => [String(g.id), g]))
    return customGameIds
      .map(id => byId.get(String(id)))
      .filter(Boolean)
  }, [state.games, customGameIds])

  const customSearchResults = useMemo(() => {
    const q = String(customSearch || '').trim().toLowerCase()
    if (!q) return []
    const already = new Set(customGameIds.map(id => String(id)))
    return state.games
      .filter(g => !already.has(String(g.id)))
      .filter(g => String(g.title || '').toLowerCase().includes(q))
      .slice(0, 12)
  }, [customSearch, state.games, customGameIds])

  const addCustomGame = async (id) => {
    const gameId = String(id || '')
    if (!gameId) return
    const next = Array.from(new Set([...customGameIds, gameId]))
    setCustomGameIds(next)
    setCustomSearch('')
    setPoolMode('custom')
    await updateSettings({ poolMode: 'custom', customGameIds: next })
  }

  const removeCustomGame = async (id) => {
    const gameId = String(id || '')
    const next = customGameIds.filter(x => String(x) !== gameId)
    setCustomGameIds(next)
    await updateSettings({ customGameIds: next })
  }

  const clearCustomGames = async () => {
    setCustomGameIds([])
    await updateSettings({ customGameIds: [] })
  }

  const addConsoleItem = async () => {
    const text = String(consoleItemInput || '').trim()
    if (!text) return
    const next = [...consoleCustomItems, text].slice(0, 64)
    setConsoleCustomItems(next)
    setConsoleItemInput('')
    await updateSettings({ consoleCustomItems: next })
  }

  const removeConsoleItem = async (index) => {
    const next = consoleCustomItems.filter((_, i) => i !== index)
    setConsoleCustomItems(next)
    await updateSettings({ consoleCustomItems: next })
  }

  const clearConsoleItems = async () => {
    setConsoleCustomItems([])
    await updateSettings({ consoleCustomItems: [] })
  }

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
                    <label className="form-label small text-muted text-uppercase fw-bold">Wheel Pool</label>
                    <select
                      className="form-select form-select-sm bg-dark border-secondary text-light"
                      value={poolMode}
                      onChange={(e) => {
                        const next = e.target.value
                        setPoolMode(next)
                        updateSettings({ poolMode: next })
                      }}
                    >
                      <option value="all">All eligible games</option>
                      <option value="custom">Custom list</option>
                    </select>
                  </div>

                  {poolMode === 'custom' && (
                    <div className="p-2 rounded border border-secondary border-opacity-25 bg-black bg-opacity-25">
                      <label className="form-label small text-secondary mb-1">Add game</label>
                      <input
                        className="form-control form-control-sm bg-dark border-secondary text-light"
                        value={customSearch}
                        onChange={e => setCustomSearch(e.target.value)}
                        placeholder="Search titles..."
                      />

                      {customSearchResults.length > 0 && (
                        <div className="list-group mt-2">
                          {customSearchResults.map(g => (
                            <button
                              key={g.id}
                              type="button"
                              className="list-group-item list-group-item-action bg-dark text-light border-secondary"
                              onClick={() => addCustomGame(g.id)}
                            >
                              <div className="d-flex justify-content-between gap-2">
                                <span className="text-truncate">{g.title}</span>
                                <span className="small text-secondary">{typeof g.console === 'object' ? g.console?.name : g.console}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="d-flex justify-content-between align-items-center mt-2">
                        <div className="small text-secondary">Selected: {customGames.length}</div>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearCustomGames} disabled={customGameIds.length === 0}>
                          Clear
                        </button>
                      </div>

                      <div className="d-grid gap-2 mt-2">
                        {customGames.map(g => (
                          <div key={g.id} className="d-flex align-items-center justify-content-between gap-2 p-2 rounded border border-secondary border-opacity-25">
                            <div className="d-flex align-items-center gap-2 min-w-0">
                              <img src={buildCoverUrl(g.image_url)} alt="" style={{ width: 28, height: 38, objectFit: 'cover', borderRadius: 4, opacity: 0.9 }} />
                              <div className="min-w-0">
                                <div className="small text-truncate text-light">{g.title}</div>
                                <div className="small text-secondary text-truncate">{typeof g.console === 'object' ? g.console?.name : g.console}</div>
                              </div>
                            </div>
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => removeCustomGame(g.id)}>
                              Remove
                            </button>
                          </div>
                        ))}
                        {customGames.length === 0 && (
                          <div className="small text-secondary">No games selected yet.</div>
                        )}
                      </div>

                      <div className="form-check form-switch mt-2">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="customIncludeSuggestions"
                          checked={customIncludeSuggestions}
                          onChange={(e) => {
                            const next = e.target.checked
                            setCustomIncludeSuggestions(next)
                            updateSettings({ customIncludeSuggestions: next })
                          }}
                        />
                        <label className="form-check-label text-light small" htmlFor="customIncludeSuggestions">
                          Include Suggestions
                        </label>
                      </div>
                    </div>
                  )}

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

                  {poolMode !== 'custom' && (
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
                  )}

                  <div>
                    <label className="form-label small text-muted text-uppercase fw-bold mb-2">Exclude (Wheel)</label>
                    <div className="vstack gap-2">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="excludeSubset"
                          checked={bonusExclusions.subset === true}
                          onChange={(e) => {
                            const next = { ...bonusExclusions, subset: e.target.checked }
                            setBonusExclusions(next)
                            updateSettings({ bonusMode: Object.values(next).some(Boolean) ? 'exclude' : 'include', bonusExclusions: next })
                          }}
                        />
                        <label className="form-check-label text-light small" htmlFor="excludeSubset">Subsets</label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="excludeDemo"
                          checked={bonusExclusions.demo === true}
                          onChange={(e) => {
                            const next = { ...bonusExclusions, demo: e.target.checked }
                            setBonusExclusions(next)
                            updateSettings({ bonusMode: Object.values(next).some(Boolean) ? 'exclude' : 'include', bonusExclusions: next })
                          }}
                        />
                        <label className="form-check-label text-light small" htmlFor="excludeDemo">Demos</label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="excludeHack"
                          checked={bonusExclusions.hack === true}
                          onChange={(e) => {
                            const next = { ...bonusExclusions, hack: e.target.checked }
                            setBonusExclusions(next)
                            updateSettings({ bonusMode: Object.values(next).some(Boolean) ? 'exclude' : 'include', bonusExclusions: next })
                          }}
                        />
                        <label className="form-check-label text-light small" htmlFor="excludeHack">Hacks</label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="excludeHomebrew"
                          checked={bonusExclusions.homebrew === true}
                          onChange={(e) => {
                            const next = { ...bonusExclusions, homebrew: e.target.checked }
                            setBonusExclusions(next)
                            updateSettings({ bonusMode: Object.values(next).some(Boolean) ? 'exclude' : 'include', bonusExclusions: next })
                          }}
                        />
                        <label className="form-check-label text-light small" htmlFor="excludeHomebrew">Homebrew</label>
                      </div>
                      {state.settings.hideBonusGames && (
                        <div className="small text-warning opacity-75">
                          Global “Hide Bonus Games” is enabled; wheel will exclude all bonus categories.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="form-label small text-muted text-uppercase fw-bold mb-2">Spin Source</label>
                    <div className="btn-group w-100">
                      <button
                        className={`btn btn-sm ${spinSource === 'pool' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => {
                          setSpinSource('pool')
                          updateSettings({ spinSource: 'pool' })
                        }}
                      >
                        Full Pool
                      </button>
                      <button
                        className={`btn btn-sm ${spinSource === 'sample' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => {
                          setSpinSource('sample')
                          updateSettings({ spinSource: 'sample' })
                        }}
                      >
                        Visible 16
                      </button>
                    </div>
                    <div className="small text-secondary mt-1">
                      Full Pool is true-random; Visible 16 matches what viewers saw pre-spin.
                    </div>
                  </div>
                </>
              )}

              {wheelState.mode === 'console' && (
                <div className="p-2 rounded border border-secondary border-opacity-25 bg-black bg-opacity-25">
                  <label className="form-label small text-muted text-uppercase fw-bold mb-2">Custom Console/Word List</label>
                  <div className="input-group input-group-sm">
                    <input
                      className="form-control bg-dark border-secondary text-light"
                      value={consoleItemInput}
                      onChange={e => setConsoleItemInput(e.target.value)}
                      placeholder="Add a word..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addConsoleItem()
                        }
                      }}
                    />
                    <button className="btn btn-outline-secondary" type="button" onClick={addConsoleItem}>
                      Add
                    </button>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mt-2">
                    <div className="small text-secondary">
                      {consoleCustomItems.length ? `Using ${consoleCustomItems.length} custom items.` : 'Empty = uses consoles from your event/library.'}
                    </div>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearConsoleItems} disabled={consoleCustomItems.length === 0}>
                      Clear
                    </button>
                  </div>
                  <div className="d-grid gap-2 mt-2">
                    {consoleCustomItems.map((item, index) => (
                      <div key={`${item}-${index}`} className="d-flex align-items-center justify-content-between gap-2 p-2 rounded border border-secondary border-opacity-25">
                        <div className="small text-light text-truncate">{item}</div>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => removeConsoleItem(index)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    {consoleCustomItems.length === 0 && (
                      <div className="small text-secondary">Add items to fully control the console/capsule wheel.</div>
                    )}
                  </div>
                </div>
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

              <div className="mt-1">
                <label className="form-label small text-muted text-uppercase fw-bold">Overlay Picker</label>
                <div className="btn-group w-100">
                  <button
                    className={`btn btn-sm ${overlayWheelStyle === 'wheel' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setOverlayStyle('wheel')}
                    disabled={overlayWheelSaving}
                    type="button"
                  >
                    Wheel
                  </button>
                  <button
                    className={`btn btn-sm ${overlayWheelStyle === 'capsule' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setOverlayStyle('capsule')}
                    disabled={overlayWheelSaving}
                    type="button"
                  >
                    Capsule
                  </button>
                </div>
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
