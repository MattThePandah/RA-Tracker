import React from 'react'
import { DEFAULT_OVERLAY_SETTINGS, mergeOverlaySettings } from '../utils/overlaySettings.js'
import { fetchOverlaySettings, updateOverlaySettings } from '../services/overlaySettings.js'

const OVERLAY_ROUTES = [
  { label: 'Main Overlay', path: '/overlay/main', note: 'Full layout with achievements and timers.' },
  { label: 'Modern Overlay', path: '/overlay/modern', note: 'Glass style layout with badges and stats.' },
  { label: 'Stats Overlay', path: '/overlay/stats', note: 'Compact progress card.' },
  { label: 'Footer Overlay', path: '/overlay/footer', note: 'Lower-third bar with timers and badges.' },
  { label: 'Achievements Overlay', path: '/overlay/achievements', note: 'Progress, grid, or ticker views.' },
  { label: 'Wheel Overlay', path: '/overlay/wheel', note: 'Roulette wheel for random picks.' },
  { label: 'Badge Carousel', path: '/overlay/badge-carousel', note: 'Rotating locked badges.' }
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

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, num))
}

export default function Overlays() {
  const [settings, setSettings] = React.useState(DEFAULT_OVERLAY_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [token, setToken] = useLocalToken()
  const [baseUrl, setBaseUrl] = React.useState(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin
  })

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
    <div className="p-3">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-1">Overlay Studio</h2>
          <div className="text-secondary small">Configure every OBS overlay from one place.</div>
        </div>
        <button className="btn btn-sm btn-outline-light" onClick={resetDefaults} disabled={saving}>Reset Defaults</button>
        <button className="btn btn-sm btn-success" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3">
        <div className="col-12">
          <div className="card bg-panel p-3">
            <h3 className="h6">Overlay Access</h3>
            <div className="row g-3">
              <div className="col-lg-5">
                <label className="form-label">Overlay Base URL</label>
                <input className="form-control" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-site.com" />
                <div className="form-text">Used to generate OBS browser source URLs.</div>
              </div>
              <div className="col-lg-4">
                <label className="form-label">Overlay Access Token</label>
                <input className="form-control" value={token} onChange={e => setToken(e.target.value)} placeholder="OVERLAY_ACCESS_TOKEN" />
                <div className="form-text">Stored locally in this browser only.</div>
              </div>
              <div className="col-lg-3 d-flex align-items-end gap-2">
                <button className="btn btn-outline-info w-100" onClick={() => copyText(token)}>Copy Token</button>
              </div>
            </div>
            <div className="mt-3">
              <div className="small text-secondary mb-2">Overlay URLs</div>
              <div className="table-responsive">
                <table className="table table-sm table-dark align-middle">
                  <thead>
                    <tr>
                      <th>Overlay</th>
                      <th>URL</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {OVERLAY_ROUTES.map(route => {
                      const url = makeUrl(route.path)
                      return (
                        <tr key={route.path}>
                          <td>
                            <div className="fw-semibold">{route.label}</div>
                            <div className="small text-secondary">{route.note}</div>
                          </td>
                          <td className="text-break"><code>{url}</code></td>
                          <td className="text-end">
                            <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => copyText(url)}>Copy</button>
                            <a className="btn btn-sm btn-outline-light" href={url} target="_blank" rel="noreferrer">Open</a>
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

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Global Defaults</h3>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Theme</label>
                <select className="form-select" value={settings.global.theme} onChange={e => updateSection('global', 'theme', e.target.value)}>
                  <option value="bamboo">Bamboo</option>
                  <option value="midnight">Midnight</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Overlay Clean Mode</label>
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.global.clean} onChange={e => updateSection('global', 'clean', e.target.checked)} id="overlayClean" />
                  <label className="form-check-label" htmlFor="overlayClean">Hide chrome for OBS</label>
                </div>
              </div>
              <div className="col-6">
                <label className="form-label">Poll Interval (ms)</label>
                <input
                  type="number"
                  className="form-control"
                  value={settings.global.pollMs}
                  onChange={e => updateSection('global', 'pollMs', clampNumber(e.target.value, 500, 60000, settings.global.pollMs))}
                />
              </div>
              <div className="col-6">
                <label className="form-label">Achievement Poll (ms)</label>
                <input
                  type="number"
                  className="form-control"
                  value={settings.global.achievementPollMs}
                  onChange={e => updateSection('global', 'achievementPollMs', clampNumber(e.target.value, 5000, 300000, settings.global.achievementPollMs))}
                />
              </div>
              <div className="col-6">
                <label className="form-label">Brand Color</label>
                <input className="form-control" value={settings.global.brandColor} onChange={e => updateSection('global', 'brandColor', e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label">Accent Color</label>
                <input className="form-control" value={settings.global.accentColor} onChange={e => updateSection('global', 'accentColor', e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label">Text Color</label>
                <input className="form-control" value={settings.global.textColor} onChange={e => updateSection('global', 'textColor', e.target.value)} />
              </div>
            </div>
            <div className="row g-2 mt-1">
              <div className="col-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.global.showCover} onChange={e => updateSection('global', 'showCover', e.target.checked)} id="overlayCover" />
                  <label className="form-check-label" htmlFor="overlayCover">Show Covers</label>
                </div>
              </div>
              <div className="col-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.global.showYear} onChange={e => updateSection('global', 'showYear', e.target.checked)} id="overlayYear" />
                  <label className="form-check-label" htmlFor="overlayYear">Show Year</label>
                </div>
              </div>
              <div className="col-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.global.showPublisher} onChange={e => updateSection('global', 'showPublisher', e.target.checked)} id="overlayPublisher" />
                  <label className="form-check-label" htmlFor="overlayPublisher">Show Publisher</label>
                </div>
              </div>
            </div>
            <div className="row g-2 mt-1">
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.global.showAchievements} onChange={e => updateSection('global', 'showAchievements', e.target.checked)} id="overlayAchievements" />
                  <label className="form-check-label" htmlFor="overlayAchievements">Show Achievements</label>
                </div>
              </div>
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.global.showTimer} onChange={e => updateSection('global', 'showTimer', e.target.checked)} id="overlayTimers" />
                  <label className="form-check-label" htmlFor="overlayTimers">Show Timers</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Main Overlay</h3>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Style</label>
                <select className="form-select" value={settings.main.style} onChange={e => updateSection('main', 'style', e.target.value)}>
                  <option value="reference">Reference</option>
                  <option value="classic">Classic</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Title Lines</label>
                <select className="form-select" value={settings.main.titleLines} onChange={e => updateSection('main', 'titleLines', Number(e.target.value))}>
                  <option value={1}>1 line</option>
                  <option value={2}>2 lines</option>
                  <option value={3}>3 lines</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Cover Width</label>
                <input className="form-control" type="number" value={settings.main.coverWidth} onChange={e => updateSection('main', 'coverWidth', clampNumber(e.target.value, 120, 420, settings.main.coverWidth))} />
              </div>
              <div className="col-6">
                <label className="form-label">Max Width</label>
                <input className="form-control" type="number" value={settings.main.maxWidth} onChange={e => updateSection('main', 'maxWidth', clampNumber(e.target.value, 600, 4000, settings.main.maxWidth))} />
              </div>
            </div>
            <div className="row g-2 mt-1">
              <div className="col-6">
                <label className="form-label">RA Badge Size</label>
                <input className="form-control" type="number" value={settings.main.raSize} onChange={e => updateSection('main', 'raSize', clampNumber(e.target.value, 30, 140, settings.main.raSize))} />
              </div>
              <div className="col-6">
                <label className="form-label">RA Max Badges</label>
                <input className="form-control" type="number" value={settings.main.raMax} onChange={e => updateSection('main', 'raMax', clampNumber(e.target.value, 0, 50, settings.main.raMax))} />
              </div>
              <div className="col-12">
                <label className="form-label">RA Mode</label>
                <select className="form-select" value={settings.main.raMode} onChange={e => updateSection('main', 'raMode', e.target.value)}>
                  <option value="default">Default</option>
                  <option value="compact">Compact</option>
                  <option value="ticker">Ticker</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">RA Auto Duration (s)</label>
                <input className="form-control" type="number" value={settings.main.raAutoDuration} onChange={e => updateSection('main', 'raAutoDuration', clampNumber(e.target.value, 5, 120, settings.main.raAutoDuration))} />
              </div>
              <div className="col-6">
                <label className="form-label">RA Announce Duration (s)</label>
                <input className="form-control" type="number" value={settings.main.raAnnounceDuration} onChange={e => updateSection('main', 'raAnnounceDuration', clampNumber(e.target.value, 5, 120, settings.main.raAnnounceDuration))} />
              </div>
              <div className="col-6">
                <label className="form-label">RA Ticker Speed</label>
                <input className="form-control" value={settings.main.raSpeed} onChange={e => updateSection('main', 'raSpeed', e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label">RA Show</label>
                <select className="form-select" value={settings.main.raShow} onChange={e => updateSection('main', 'raShow', e.target.value)}>
                  <option value="earned">Earned</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>
            <div className="form-check form-switch mt-2">
              <input className="form-check-input" type="checkbox" checked={settings.main.raAuto} onChange={e => updateSection('main', 'raAuto', e.target.checked)} id="raAuto" />
              <label className="form-check-label" htmlFor="raAuto">Auto Showcase on Unlock</label>
            </div>
            <div className="form-check form-switch mt-2">
              <input className="form-check-input" type="checkbox" checked={settings.main.raAnnounce} onChange={e => updateSection('main', 'raAnnounce', e.target.checked)} id="raAnnounce" />
              <label className="form-check-label" htmlFor="raAnnounce">Announcement Card</label>
            </div>
            <div className="form-check form-switch mt-2">
              <input className="form-check-input" type="checkbox" checked={settings.main.showInlineBadges} onChange={e => updateSection('main', 'showInlineBadges', e.target.checked)} id="raInlineBadges" />
              <label className="form-check-label" htmlFor="raInlineBadges">Inline Badge Strip</label>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Modern Overlay</h3>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Theme</label>
                <select className="form-select" value={settings.modern.theme} onChange={e => updateSection('modern', 'theme', e.target.value)}>
                  <option value="bamboo">Bamboo</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="neon">Neon</option>
                  <option value="quantum">Quantum</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Style</label>
                <select className="form-select" value={settings.modern.style} onChange={e => updateSection('modern', 'style', e.target.value)}>
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Cover Size</label>
                <select className="form-select" value={settings.modern.coverSize} onChange={e => updateSection('modern', 'coverSize', e.target.value)}>
                  <option value="small">Small</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Timer Size</label>
                <select className="form-select" value={settings.modern.timerSize} onChange={e => updateSection('modern', 'timerSize', e.target.value)}>
                  <option value="small">Small</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
            <div className="row g-2 mt-1">
              <div className="col-6">
                <label className="form-label">Animations</label>
                <select className="form-select" value={settings.modern.animationLevel} onChange={e => updateSection('modern', 'animationLevel', e.target.value)}>
                  <option value="minimal">Minimal</option>
                  <option value="normal">Normal</option>
                  <option value="enhanced">Enhanced</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Glass Tint</label>
                <select className="form-select" value={settings.modern.glassTint} onChange={e => updateSection('modern', 'glassTint', e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>
            <div className="row g-2 mt-2">
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.modern.showTimer} onChange={e => updateSection('modern', 'showTimer', e.target.checked)} id="modernTimer" />
                  <label className="form-check-label" htmlFor="modernTimer">Show Timers</label>
                </div>
              </div>
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.modern.enableParticles} onChange={e => updateSection('modern', 'enableParticles', e.target.checked)} id="modernParticles" />
                  <label className="form-check-label" htmlFor="modernParticles">Particle Background</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Stats Overlay</h3>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Style</label>
                <select className="form-select" value={settings.stats.style} onChange={e => updateSection('stats', 'style', e.target.value)}>
                  <option value="compact">Compact</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Width</label>
                <input className="form-control" type="number" value={settings.stats.width} onChange={e => updateSection('stats', 'width', clampNumber(e.target.value, 180, 600, settings.stats.width))} />
              </div>
              <div className="col-12">
                <label className="form-label">Title</label>
                <input className="form-control" value={settings.stats.title} onChange={e => updateSection('stats', 'title', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Footer Overlay</h3>
            <div className="row g-2">
              <div className="col-12">
                <label className="form-label">Event Title</label>
                <input className="form-control" value={settings.footer.title} onChange={e => updateSection('footer', 'title', e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label">Bar Height</label>
                <input className="form-control" type="number" value={settings.footer.barHeight} onChange={e => updateSection('footer', 'barHeight', clampNumber(e.target.value, 40, 200, settings.footer.barHeight))} />
              </div>
              <div className="col-6">
                <label className="form-label">Container Width</label>
                <input className="form-control" type="number" value={settings.footer.containerWidth} onChange={e => updateSection('footer', 'containerWidth', clampNumber(e.target.value, 600, 4000, settings.footer.containerWidth))} />
              </div>
              <div className="col-6">
                <label className="form-label">Event Card Width</label>
                <input className="form-control" type="number" value={settings.footer.width} onChange={e => updateSection('footer', 'width', clampNumber(e.target.value, 180, 600, settings.footer.width))} />
              </div>
              <div className="col-4">
                <label className="form-label">Time Format</label>
                <select className="form-select" value={settings.footer.timeFmt} onChange={e => updateSection('footer', 'timeFmt', e.target.value)}>
                  <option value="24">24h</option>
                  <option value="12">12h</option>
                </select>
              </div>
              <div className="col-4">
                <label className="form-label">Date</label>
                <select className="form-select" value={settings.footer.dateFmt} onChange={e => updateSection('footer', 'dateFmt', e.target.value)}>
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </select>
              </div>
              <div className="col-4">
                <label className="form-label">Time Style</label>
                <select className="form-select" value={settings.footer.timeStyle} onChange={e => updateSection('footer', 'timeStyle', e.target.value)}>
                  <option value="glow">Glow</option>
                  <option value="neon">Neon</option>
                  <option value="solid">Solid</option>
                </select>
              </div>
            </div>
            <div className="row g-2 mt-2">
              <div className="col-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.footer.showTimers} onChange={e => updateSection('footer', 'showTimers', e.target.checked)} id="footerTimers" />
                  <label className="form-check-label" htmlFor="footerTimers">Show Timers</label>
                </div>
              </div>
              <div className="col-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.footer.showCurrent} onChange={e => updateSection('footer', 'showCurrent', e.target.checked)} id="footerCurrent" />
                  <label className="form-check-label" htmlFor="footerCurrent">Show Current Game</label>
                </div>
              </div>
              <div className="col-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.footer.showBadges} onChange={e => updateSection('footer', 'showBadges', e.target.checked)} id="footerBadges" />
                  <label className="form-check-label" htmlFor="footerBadges">Show Badges</label>
                </div>
              </div>
            </div>
            <div className="row g-2 mt-2">
              <div className="col-6">
                <label className="form-label">Badge Count</label>
                <input className="form-control" type="number" value={settings.footer.badgeCount} onChange={e => updateSection('footer', 'badgeCount', clampNumber(e.target.value, 1, 8, settings.footer.badgeCount))} />
              </div>
              <div className="col-6">
                <label className="form-label">Badge Rotate (ms)</label>
                <input className="form-control" type="number" value={settings.footer.rotateMs} onChange={e => updateSection('footer', 'rotateMs', clampNumber(e.target.value, 2000, 60000, settings.footer.rotateMs))} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Achievements Overlay</h3>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Style</label>
                <select className="form-select" value={settings.achievements.style} onChange={e => updateSection('achievements', 'style', e.target.value)}>
                  <option value="progress">Progress</option>
                  <option value="grid">Grid</option>
                  <option value="recent">Recent</option>
                  <option value="tracker">Tracker</option>
                  <option value="ticker">Ticker</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Max Achievements</label>
                <input className="form-control" type="number" value={settings.achievements.maxAchievements} onChange={e => updateSection('achievements', 'maxAchievements', clampNumber(e.target.value, 1, 100, settings.achievements.maxAchievements))} />
              </div>
              <div className="col-6">
                <label className="form-label">Ticker Speed</label>
                <input className="form-control" type="number" value={settings.achievements.speed} onChange={e => updateSection('achievements', 'speed', clampNumber(e.target.value, 10, 120, settings.achievements.speed))} />
              </div>
              <div className="col-6">
                <label className="form-label">Ticker Direction</label>
                <select className="form-select" value={settings.achievements.direction} onChange={e => updateSection('achievements', 'direction', e.target.value)}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div className="row g-2 mt-2">
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.achievements.showHardcore} onChange={e => updateSection('achievements', 'showHardcore', e.target.checked)} id="achHardcore" />
                  <label className="form-check-label" htmlFor="achHardcore">Show Hardcore</label>
                </div>
              </div>
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={settings.achievements.compact} onChange={e => updateSection('achievements', 'compact', e.target.checked)} id="achCompact" />
                  <label className="form-check-label" htmlFor="achCompact">Compact Grid</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Wheel Overlay</h3>
            <div className="row g-2">
              <div className="col-8">
                <label className="form-label">Title</label>
                <input className="form-control" value={settings.wheel.title} onChange={e => updateSection('wheel', 'title', e.target.value)} />
              </div>
              <div className="col-4">
                <label className="form-label">Poll (ms)</label>
                <input className="form-control" type="number" value={settings.wheel.pollMs} onChange={e => updateSection('wheel', 'pollMs', clampNumber(e.target.value, 100, 2000, settings.wheel.pollMs))} />
              </div>
            </div>
            <div className="form-check form-switch mt-2">
              <input className="form-check-input" type="checkbox" checked={settings.wheel.showStrip} onChange={e => updateSection('wheel', 'showStrip', e.target.checked)} id="wheelStrip" />
              <label className="form-check-label" htmlFor="wheelStrip">Show Sample Strip</label>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3 h-100">
            <h3 className="h6">Badge Carousel</h3>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Show Count</label>
                <input className="form-control" type="number" value={settings.badgeCarousel.showCount} onChange={e => updateSection('badgeCarousel', 'showCount', clampNumber(e.target.value, 1, 8, settings.badgeCarousel.showCount))} />
              </div>
              <div className="col-6">
                <label className="form-label">Rotate (ms)</label>
                <input className="form-control" type="number" value={settings.badgeCarousel.rotateMs} onChange={e => updateSection('badgeCarousel', 'rotateMs', clampNumber(e.target.value, 2000, 60000, settings.badgeCarousel.rotateMs))} />
              </div>
              <div className="col-6">
                <label className="form-label">Position</label>
                <select className="form-select" value={settings.badgeCarousel.position} onChange={e => updateSection('badgeCarousel', 'position', e.target.value)}>
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="center">Center</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Orientation</label>
                <select className="form-select" value={settings.badgeCarousel.horizontal ? 'horizontal' : 'vertical'} onChange={e => updateSection('badgeCarousel', 'horizontal', e.target.value === 'horizontal')}>
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
