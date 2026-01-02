import React from 'react'
import { DEFAULT_OVERLAY_SETTINGS, mergeOverlaySettings, clampNumber } from '../utils/overlaySettings.js'
import { fetchOverlaySettings, updateOverlaySettings } from '../services/overlaySettings.js'
import { useGame } from '../context/GameContext.jsx'

const OVERLAY_ROUTES = [
  { label: 'Full Studio Overlay', path: '/overlay/full', note: 'One URL with modules and camera/game framing.' },
  { label: 'Main Overlay', path: '/overlay/main', note: 'Full layout with achievements and timers.' },
  { label: 'Modern Overlay', path: '/overlay/modern', note: 'Glass style layout with badges and stats.' },
  { label: 'Stats Overlay', path: '/overlay/stats', note: 'Compact progress card.' },
  { label: 'Footer Overlay', path: '/overlay/footer', note: 'Lower-third bar with timers and badges.' },
  { label: 'Achievements Overlay', path: '/overlay/achievements', note: 'Progress, grid, or ticker views.' },
  { label: 'Wheel Overlay', path: '/overlay/wheel', note: 'Roulette wheel for random picks.' },
  { label: 'Badge Carousel', path: '/overlay/badge-carousel', note: 'Rotating locked badges.' }
]

const FULL_MODULE_OPTIONS = [
  { key: 'current', label: 'Current Game' },
  { key: 'stats', label: 'Stats' },
  { key: 'timers', label: 'Timers' },
  { key: 'achievements', label: 'Achievements', hasCount: true }
]

function useLocalToken() {
  const [token, setToken] = React.useState(() => {
    try { return localStorage.getItem('ra.overlayToken') || '' } catch { return '' }
  })
  React.useEffect(() => {
    try { localStorage.setItem('ra.overlayToken', token) } catch {}
  }, [token])
  return [token, setToken]
}

export default function Overlays() {
  const { state: gameState } = useGame()
  const [settings, setSettings] = React.useState(DEFAULT_OVERLAY_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [token, setToken] = useLocalToken()
  const [baseUrl, setBaseUrl] = React.useState(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin
  })

  const availableConsoles = React.useMemo(() => {
    const set = new Set()
    gameState.games.forEach(g => {
      const name = typeof g.console === 'string' ? g.console : g.console?.name
      if (name) set.add(name)
    })
    return Array.from(set).sort()
  }, [gameState.games])

  const toggleEventConsole = (consoleName) => {
    const current = settings.global.eventConsoles || []
    const next = current.includes(consoleName)
      ? current.filter(c => c !== consoleName)
      : [...current, consoleName]
    updateSection('global', 'eventConsoles', next)
  }

  React.useEffect(() => {
    let active = true
    const load = async () => {
      setError('')
      try {
        const data = await fetchOverlaySettings()
        if (active) setSettings(mergeOverlaySettings(data))
      } catch (err) {
        if (active) setError('Failed to load overlay settings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])


  const updateSection = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }))
  }

  const updateFullModule = (moduleKey, key, value) => {
    setSettings(prev => ({
      ...prev,
      full: {
        ...prev.full,
        modules: {
          ...prev.full?.modules,
          [moduleKey]: {
            ...prev.full?.modules?.[moduleKey],
            [key]: value
          }
        }
      }
    }))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await updateOverlaySettings(settings)
      setSettings(mergeOverlaySettings(updated))
    } catch (err) {
      setError('Failed to save overlay settings.')
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = () => {
    setSettings(DEFAULT_OVERLAY_SETTINGS)
  }

  const makeUrl = (path) => {
    const base = baseUrl || ''
    const trimmed = base.replace(/\/+$/, '')
    const url = `${trimmed}${path}`
    if (!token) return url
    return `${url}?token=${encodeURIComponent(token)}`
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }

  if (loading) {
    return <div className="p-3">Loading overlay settings.</div>
  }

  return (
    <div className="p-4">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-4">
        <div className="me-auto">
          <h2 className="h4 mb-1 text-uppercase fw-bold" style={{ letterSpacing: '1px', color: 'var(--brand)' }}>Overlay Studio</h2>
          <div className="text-secondary small">Configure OBS browser sources and event parameters.</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary px-3" onClick={resetDefaults} disabled={saving}>Reset Defaults</button>
          <button className="btn btn-sm btn-success px-4 fw-bold" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger shadow-sm border-0">{error}</div>}

      <div className="row g-4">
        {/* Overlay Access Section */}
        <div className="col-12">
          <div className="card bg-panel p-4 border-0 shadow-sm">
            <h3 className="h6 fw-bold mb-3 text-uppercase opacity-75" style={{ letterSpacing: '1px' }}>Overlay Access</h3>
            <div className="row g-3">
              <div className="col-lg-6">
                <label className="form-label small fw-bold opacity-50">Base URL</label>
                <div className="input-group shadow-sm">
                  <span className="input-group-text bg-panel-2 border-0 opacity-50"><i className="bi bi-link-45deg"></i></span>
                  <input className="form-control border-0 bg-panel-2" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-site.com" />
                </div>
              </div>
              <div className="col-lg-6">
                <label className="form-label small fw-bold opacity-50">Access Token</label>
                <div className="input-group shadow-sm">
                  <span className="input-group-text bg-panel-2 border-0 opacity-50"><i className="bi bi-key"></i></span>
                  <input className="form-control border-0 bg-panel-2" value={token} onChange={e => setToken(e.target.value)} placeholder="TOKEN" />
                  <button className="btn btn-primary px-3" onClick={() => copyText(token)}>Copy</button>
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <div className="table-responsive rounded border border-secondary border-opacity-10">
                <table className="table table-sm align-middle mb-0">
                  <thead className="bg-panel-2">
                    <tr>
                      <th className="px-3 py-2 border-0 opacity-75 small text-uppercase">Overlay Name</th>
                      <th className="py-2 border-0 opacity-75 small text-uppercase">Browser Source URL</th>
                      <th className="px-3 py-2 border-0 text-end opacity-75 small text-uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OVERLAY_ROUTES.map(route => {
                      const url = makeUrl(route.path)
                      return (
                        <tr key={route.path}>
                          <td className="px-3 py-3 border-secondary border-opacity-10">
                            <div className="fw-bold">{route.label}</div>
                            <div className="small opacity-50">{route.note}</div>
                          </td>
                          <td className="py-3 border-secondary border-opacity-10">
                            <code className="small text-primary opacity-75">{url}</code>
                          </td>
                          <td className="px-3 py-3 text-end border-secondary border-opacity-10">
                            <button className="btn btn-sm btn-link text-decoration-none py-0 fw-bold" onClick={() => copyText(url)}>Copy</button>
                            <a className="btn btn-sm btn-outline-light ms-2 px-3" href={url} target="_blank" rel="noreferrer">Open</a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Global Settings & Event Scope */}
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-4 h-100 border-0 shadow-sm">
            <div className="d-flex align-items-center gap-3 mb-4">
              <div className="p-2 rounded-3 bg-primary bg-opacity-10 text-primary" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="bi bi-gear-fill fs-5"></i>
              </div>
              <h3 className="h6 fw-bold m-0 text-uppercase opacity-75" style={{ letterSpacing: '1px' }}>Global Settings</h3>
            </div>
            
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Default Theme</label>
                <select className="form-select border-0 bg-panel-2 shadow-sm" value={settings.global.theme} onChange={e => updateSection('global', 'theme', e.target.value)}>
                  <option value="bamboo">Bamboo</option>
                  <option value="bamboo-light">Bamboo Light</option>
                  <option value="midnight">Midnight</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Poll Interval (ms)</label>
                <input
                  type="number"
                  className="form-control border-0 bg-panel-2 shadow-sm"
                  value={settings.global.pollMs}
                  onChange={e => updateSection('global', 'pollMs', clampNumber(e.target.value, 500, 60000, settings.global.pollMs))}
                />
              </div>
            </div>

            <hr className="my-4 opacity-5" />

            <h4 className="h6 fw-bold mb-3 d-flex align-items-center gap-2">
              <i className="bi bi-funnel-fill text-primary"></i>
              Active Event Scope
            </h4>
            <p className="text-secondary small mb-3">Limit the "Event Progress" module to specific consoles.</p>
            <div className="d-flex flex-wrap gap-2 p-3 bg-panel-2 rounded border border-secondary border-opacity-10 shadow-inner">
              {availableConsoles.map(c => {
                const isActive = (settings.global.eventConsoles || []).includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    className={`btn btn-sm rounded-pill px-3 transition-all fw-medium ${isActive ? 'btn-primary shadow-sm' : 'btn-outline-secondary opacity-75'}`}
                    onClick={() => toggleEventConsole(c)}
                  >
                    {isActive && <i className="bi bi-check-lg me-1"></i>}
                    {c}
                  </button>
                )
              })}
              {availableConsoles.length === 0 && <div className="text-muted italic small py-2 w-100 text-center">No consoles found in library.</div>}
            </div>
          </div>
        </div>

        {/* Full Overlay Config */}
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-4 h-100 border-0 shadow-sm">
            <div className="d-flex align-items-center gap-3 mb-4">
              <div className="p-2 rounded-3 bg-info bg-opacity-10 text-info" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="bi bi-window-fullscreen fs-5"></i>
              </div>
              <h3 className="h6 fw-bold m-0 text-uppercase opacity-75" style={{ letterSpacing: '1px' }}>Full Overlay Layout</h3>
            </div>
            
            <div className="row g-3">
              <div className="col-6">
                <div className="form-check form-switch p-3 bg-panel-2 rounded-3 border border-secondary border-opacity-10 d-flex justify-content-between align-items-center gap-3">
                  <label className="form-check-label small fw-bold opacity-75" htmlFor="fullGuides">Show Guides</label>
                  <input className="form-check-input ms-0" type="checkbox" checked={settings.full.showGuides} onChange={e => updateSection('full', 'showGuides', e.target.checked)} id="fullGuides" />
                </div>
              </div>
              <div className="col-6">
                <div className="form-check form-switch p-3 bg-panel-2 rounded-3 border border-secondary border-opacity-10 d-flex justify-content-between align-items-center gap-3">
                  <label className="form-check-label small fw-bold opacity-75" htmlFor="fullGameFrame">Game Framing</label>
                  <input className="form-check-input ms-0" type="checkbox" checked={settings.full.showGameFrame} onChange={e => updateSection('full', 'showGameFrame', e.target.checked)} id="fullGameFrame" />
                </div>
              </div>
              <div className="col-6">
                <div className="form-check form-switch p-3 bg-panel-2 rounded-3 border border-secondary border-opacity-10 d-flex justify-content-between align-items-center gap-3">
                  <label className="form-check-label small fw-bold opacity-75" htmlFor="fullCameraFrame">Camera Framing</label>
                  <input className="form-check-input ms-0" type="checkbox" checked={settings.full.showCameraFrame} onChange={e => updateSection('full', 'showCameraFrame', e.target.checked)} id="fullCameraFrame" />
                </div>
              </div>
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Camera Position</label>
                <select
                  className="form-select border-0 bg-panel-2 shadow-sm"
                  value={settings.full.cameraPosition || 'bottom-right'}
                  onChange={e => updateSection('full', 'cameraPosition', e.target.value)}
                >
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
              </div>
              <div className="col-6">
                <div className="form-check form-switch p-3 bg-panel-2 rounded-3 border border-secondary border-opacity-10 d-flex justify-content-between align-items-center gap-3">
                  <label className="form-check-label small fw-bold opacity-75" htmlFor="fullCameraDock">Camera Outside Stage</label>
                  <input className="form-check-input ms-0" type="checkbox" checked={!!settings.full.cameraDock} onChange={e => updateSection('full', 'cameraDock', e.target.checked)} id="fullCameraDock" />
                </div>
              </div>
              <div className="col-12">
                <label className="form-label small fw-bold opacity-50">Layout Style</label>
                <select
                  className="form-select border-0 bg-panel-2 shadow-sm"
                  value={settings.full.layout || 'balanced'}
                  onChange={e => updateSection('full', 'layout', e.target.value)}
                >
                  <option value="balanced">Balanced (columns + stage)</option>
                  <option value="focus">Focus (slimmer columns, bigger stage)</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="small fw-bold opacity-50 mb-3 text-uppercase" style={{ fontSize: '10px', letterSpacing: '1px' }}>Camera Module</div>
              <div className="row g-2">
                <div className="col-6">
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Width</span>
                    <input
                      className="form-control border-0 bg-panel text-center fw-bold"
                      type="number"
                      value={settings.full.cameraWidth ?? 360}
                      onChange={e => updateSection('full', 'cameraWidth', clampNumber(e.target.value, 0, 4000, settings.full.cameraWidth ?? 360))}
                    />
                  </div>
                </div>
                <div className="col-6">
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Height</span>
                    <input
                      className="form-control border-0 bg-panel text-center fw-bold"
                      type="number"
                      value={settings.full.cameraHeight ?? 200}
                      onChange={e => updateSection('full', 'cameraHeight', clampNumber(e.target.value, 0, 4000, settings.full.cameraHeight ?? 200))}
                    />
                  </div>
                </div>
                <div className="col-6">
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Offset X</span>
                    <input
                      className="form-control border-0 bg-panel text-center fw-bold"
                      type="number"
                      value={settings.full.cameraOffsetX ?? 32}
                      onChange={e => updateSection('full', 'cameraOffsetX', clampNumber(e.target.value, 0, 4000, settings.full.cameraOffsetX ?? 32))}
                    />
                  </div>
                </div>
                <div className="col-6">
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Offset Y</span>
                    <input
                      className="form-control border-0 bg-panel text-center fw-bold"
                      type="number"
                      value={settings.full.cameraOffsetY ?? 32}
                      onChange={e => updateSection('full', 'cameraOffsetY', clampNumber(e.target.value, 0, 4000, settings.full.cameraOffsetY ?? 32))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="small fw-bold opacity-50 mb-3 text-uppercase" style={{ fontSize: '10px', letterSpacing: '1px' }}>Active Modules</div>
              <div className="d-grid gap-2">
                {FULL_MODULE_OPTIONS.map(module => {
                  const mod = settings.full?.modules?.[module.key] || {}
                  return (
                    <div className="p-3 bg-panel-2 rounded-3 border border-secondary border-opacity-10" key={module.key}>
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <div className="fw-bold small d-flex align-items-center gap-2">
                          <span className={`p-1 rounded bg-opacity-10 ${mod.enabled ? 'bg-success text-success' : 'bg-secondary text-secondary'}`} style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className={`bi ${module.key === 'stats' ? 'bi-graph-up' : module.key === 'current' ? 'bi-play-fill' : module.key === 'timers' ? 'bi-clock' : 'bi-trophy'}`}></i>
                          </span>
                          {module.label}
                        </div>
                        <div className="form-check form-switch m-0">
                          <input className="form-check-input" type="checkbox" checked={!!mod.enabled} onChange={e => updateFullModule(module.key, 'enabled', e.target.checked)} />
                        </div>
                      </div>
                      <div className="row g-2">
                        <div className="col-8">
                          <select className="form-select form-select-sm border-0 bg-panel shadow-sm" value={mod.position || 'left'} onChange={e => updateFullModule(module.key, 'position', e.target.value)} disabled={!mod.enabled}>
                            <option value="left">Left Column</option>
                            <option value="right">Right Column</option>
                            <option value="bottom">Bottom Bar</option>
                          </select>
                        </div>
                        <div className="col-4">
                          <div className="input-group input-group-sm shadow-sm">
                            <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Order</span>
                            <input className="form-control border-0 bg-panel text-center fw-bold" type="number" value={mod.order || 1} onChange={e => updateFullModule(module.key, 'order', clampNumber(e.target.value, 1, 12, mod.order || 1))} disabled={!mod.enabled} />
                          </div>
                        </div>
                      </div>
                      {module.hasCount && (
                        <div className="row g-2 mt-2">
                          <div className="col-6">
                            <div className="input-group input-group-sm shadow-sm">
                              <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Count</span>
                              <input
                                className="form-control border-0 bg-panel text-center fw-bold"
                                type="number"
                                value={mod.count || 4}
                                onChange={e => updateFullModule(module.key, 'count', clampNumber(e.target.value, 1, 12, mod.count || 4))}
                                disabled={!mod.enabled}
                              />
                            </div>
                          </div>
                          <div className="col-6">
                            <div className="input-group input-group-sm shadow-sm">
                              <span className="input-group-text border-0 bg-panel opacity-50 small" style={{ fontSize: '10px' }}>Cycle</span>
                              <input
                                className="form-control border-0 bg-panel text-center fw-bold"
                                type="number"
                                value={settings.full.achievementCycleMs ?? 8000}
                                onChange={e => updateSection('full', 'achievementCycleMs', clampNumber(e.target.value, 0, 60000, settings.full.achievementCycleMs ?? 8000))}
                                disabled={!mod.enabled}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Specific Overlay Settings */}
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-4 border-0 shadow-sm h-100">
            <h3 className="h6 fw-bold mb-3 text-uppercase opacity-75">Main & Modern Specifics</h3>
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Main Style</label>
                <select className="form-select border-0 bg-panel-2 shadow-sm" value={settings.main.style} onChange={e => updateSection('main', 'style', e.target.value)}>
                  <option value="reference">Reference</option>
                  <option value="classic">Classic</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Modern Theme</label>
                <select className="form-select border-0 bg-panel-2 shadow-sm" value={settings.modern.theme} onChange={e => updateSection('modern', 'theme', e.target.value)}>
                  <option value="bamboo">Bamboo</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="neon">Neon</option>
                  <option value="quantum">Quantum</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Modern Style</label>
                <select className="form-select border-0 bg-panel-2 shadow-sm" value={settings.modern.style} onChange={e => updateSection('modern', 'style', e.target.value)}>
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Glass Tint</label>
                <select className="form-select border-0 bg-panel-2 shadow-sm" value={settings.modern.glassTint} onChange={e => updateSection('modern', 'glassTint', e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-4 border-0 shadow-sm h-100">
            <h3 className="h6 fw-bold mb-3 text-uppercase opacity-75">Footer & Carousel</h3>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-bold opacity-50">Footer Event Title</label>
                <input className="form-control border-0 bg-panel-2 shadow-sm" value={settings.footer.title} onChange={e => updateSection('footer', 'title', e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label small fw-bold opacity-50">Carousel Rotate (ms)</label>
                <input className="form-control border-0 bg-panel-2 shadow-sm" type="number" value={settings.badgeCarousel.rotateMs} onChange={e => updateSection('badgeCarousel', 'rotateMs', clampNumber(e.target.value, 2000, 60000, settings.badgeCarousel.rotateMs))} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
