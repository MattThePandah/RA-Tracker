import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import { useAchievements } from '../context/AchievementContext.jsx'
import * as IGDB from '../services/igdb.js'
import * as Storage from '../services/storage.js'
import { computeMainStats, filterMainGames } from '../utils/gameStats.js'

const getCsrfToken = () => {
  try { return localStorage.getItem('ra.csrf') || '' } catch { return '' }
}
const withAdminHeaders = (headers = {}) => {
  const csrf = getCsrfToken()
  return csrf ? { ...headers, 'x-csrf-token': csrf } : headers
}

const defaultNotificationSettings = {
  enabled: false,
  channels: {
    discord: true,
    streamerbot: false
  },
  events: {
    gameStarted: true,
    gameCompleted: true,
    suggestionReceived: true,
    streamStarted: false
  }
}

const mergeNotificationSettings = (incoming = {}) => ({
  ...defaultNotificationSettings,
  ...incoming,
  channels: { ...defaultNotificationSettings.channels, ...(incoming.channels || {}) },
  events: { ...defaultNotificationSettings.events, ...(incoming.events || {}) }
})

export default function Settings() {
  const { state, dispatch } = useGame()
  const { state: achievementState, updateSettings } = useAchievements()
  const [username, setUsername] = useState(() => {
    // Try to get from various sources in priority order
    return import.meta.env.VITE_RA_USERNAME || 
           achievementState.settings.raUsername || 
           state.settings.raUsername || 
           ''
  })
  const [apiKey, setApiKey] = useState(() => {
    return import.meta.env.VITE_RA_API_KEY || 
           achievementState.settings.raApiKey || 
           state.settings.raApiKey || 
           ''
  })
  const [raEnabled, setRaEnabled] = useState(state.settings.raEnabled)
  const [igdbEnabled, setIgdbEnabled] = useState(state.settings.igdbEnabled)
  const [hideBonusGames, setHideBonusGames] = useState(state.settings.hideBonusGames)
  const [pollMs, setPollMs] = useState(state.settings.pollMs || 5000)
  const [precacheState, setPrecacheState] = useState({ running: false, done: 0, total: 0, last: '' })
  const [notificationSettings, setNotificationSettings] = useState(defaultNotificationSettings)
  const [notificationStatus, setNotificationStatus] = useState({ loading: false, message: '', error: '' })
  const [coreStatus, setCoreStatus] = useState('')
  const achievementSettings = achievementState.settings || {}

  React.useEffect(() => {
    let active = true
    const loadNotificationSettings = async () => {
      try {
        const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
        const res = await fetch(`${base}/api/user/settings`, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (active && data?.notifications) {
          setNotificationSettings(mergeNotificationSettings(data.notifications))
        }
      } catch {}
    }
    loadNotificationSettings()
    return () => { active = false }
  }, [])

  // Seed overlay idle wheel with a small 16-slot sample based on current settings
  const seedOverlayWheel = React.useCallback(async (opts = {}) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL
      if (!base) return
      const hide = opts.hideBonusGames ?? hideBonusGames
      // Filter games based on subset toggle only (leave deeper filters to Select page)
      let pool = state.games || []
      if (hide) {
        pool = filterMainGames(pool)
      }
      // Sample up to 16 without replacement
      const sample = []
      const copy = pool.slice()
      const target = Math.min(16, copy.length)
      for (let i = 0; i < target; i++) {
        const idx = Math.floor(Math.random() * copy.length)
        sample.push(copy.splice(idx, 1)[0])
      }
      while (sample.length < 16) sample.push(null)
      await fetch(`${base}/overlay/wheel-state`, {
        method: 'POST',
        headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sample, poolSize: pool.length }),
        credentials: 'include'
      })
    } catch {/* ignore */}
  }, [state.games, hideBonusGames])

  const save = async () => {
    setCoreStatus('Saving...')
    try {
      dispatch({ type: 'SET_SETTINGS', settings: { ...state.settings, raEnabled, igdbEnabled, hideBonusGames, pollMs } })

      // Only sync RA credentials into achievement settings here.
      // Other achievement settings (smart polling, auto-detect, popups, etc.) auto-save on change and
      // should not be overwritten by potentially stale form state.
      updateSettings({ ...achievementSettings, raUsername: username, raApiKey: apiKey })

      await seedOverlayWheel({ hideBonusGames })
      setCoreStatus('Saved')
      setTimeout(() => setCoreStatus(''), 2000)
    } catch (error) {
      console.error('Failed to save core settings:', error)
      setCoreStatus('Save failed')
    }
  }

  const saveNotifications = async () => {
    setNotificationStatus({ loading: true, message: '', error: '' })
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await fetch(`${base}/api/user/settings`, {
        method: 'POST',
        headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ notifications: notificationSettings }),
        credentials: 'include'
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save notification settings')
      }
      setNotificationStatus({ loading: false, message: 'Notification settings saved.', error: '' })
    } catch (error) {
      setNotificationStatus({ loading: false, message: '', error: error.message || 'Failed to save notification settings.' })
    }
  }

  const updateAchievementSetting = (key, value) => {
    const next = {
      ...achievementSettings,
      [key]: value,
      // Keep credentials in sync with the RA section
      raUsername: username,
      raApiKey: apiKey
    }
    updateSettings(next)
  }

  const clearAllInProgress = () => {
    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Reset all "In Progress" games back to "Not Started" and clear current selection?') : true
    if (!ok) return
    const before = state.games.filter(g => (g.status || '').toLowerCase().includes('progress')).length
    console.log('[Settings] Clear All In-Progress clicked. Before count =', before)
    dispatch({ type: 'CLEAR_ALL_IN_PROGRESS' })
    setTimeout(() => {
      const after = (typeof window !== 'undefined' && window.__PSFEST_STATE__?.games ? window.__PSFEST_STATE__.games : null) || null
      console.log('[Settings] Clear All In-Progress dispatched. After state visible?', !!after)
    }, 0)
    alert(`Requested reset. Found ${before} game(s) In Progress before reset.`)
  }

  const precache = async () => {
    if (!igdbEnabled) return alert('Enable IGDB in Settings and configure the proxy in server/.env')
    setPrecacheState(s => ({ ...s, running: true, done: 0, total: state.games.length }))
    // Copy games to mutate locally then push back once done
    const clone = state.games.map(g => ({ ...g }))
    await IGDB.precacheCovers({
      games: clone,
      onProgress: ({ done, total, game }) => {
        setPrecacheState({ running: true, done, total, last: game?.title || '' })
      }
    })
    dispatch({ type: 'SET_GAMES', games: clone })
    setPrecacheState({ running: false, done: clone.length, total: clone.length, last: 'Complete' })
  }

  const resetTotalTimer = async () => {
    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Reset total event timer? This will clear all accumulated time.') : true
    if (!ok) return
    try {
      await Storage.resetTotalTimer()
      alert('Event total reset.')
    } catch { alert('Failed to reset total timer (server).') }
  }

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h2 className="h4 mb-1">Settings</h2>
          <div className="text-secondary small">Configure sync, overlays, achievements, and alerts.</div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12">
          <div className="card bg-panel p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <h3 className="h6 mb-1">Core Settings</h3>
                <div className="text-secondary small">RetroAchievements, IGDB, and overlay behavior.</div>
              </div>
              <div className="d-flex align-items-center gap-2">
                {coreStatus && (
                  <div className={`small ${coreStatus === 'Save failed' ? 'text-danger' : 'text-secondary'}`}>
                    {coreStatus}
                  </div>
                )}
                <button
                  className="btn btn-success"
                  onClick={save}
                  disabled={coreStatus === 'Saving...'}
                >
                  {coreStatus === 'Saving...' ? 'Saving...' : 'Save Core Settings'}
                </button>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-lg-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">RetroAchievements</div>
                  <div className="form-check form-switch mb-2">
                    <input className="form-check-input" type="checkbox" checked={raEnabled} onChange={e=>setRaEnabled(e.target.checked)} id="raEnabled" />
                    <label className="form-check-label" htmlFor="raEnabled">Enable RA Sync</label>
                  </div>
                  <div className="row g-2">
                    <div className="col">
                      <label className="form-label">Username</label>
                      <input className="form-control" value={username} onChange={e=>setUsername(e.target.value)} />
                    </div>
                    <div className="col">
                      <label className="form-label">API Key</label>
                      <input className="form-control" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
                    </div>
                  </div>
                  <div className="text-secondary small mt-2">
                    The catalog is refreshed automatically on server boot and nightly. Toggle <code>LIBRARY_BUILD_ON_START</code> and <code>LIBRARY_REFRESH_NIGHTLY</code> in <code>server/.env</code> to control timing.
                  </div>
                </div>
              </div>

              <div className="col-lg-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">General</div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label">Overlay Poll (ms)</label>
                      <input type="number" className="form-control" value={pollMs} onChange={e=>setPollMs(parseInt(e.target.value||'0',10))} />
                    </div>
                    <div className="col-6 d-flex align-items-end">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" checked={hideBonusGames} onChange={e=>setHideBonusGames(e.target.checked)} id="hideBonusGames" />
                        <label className="form-check-label" htmlFor="hideBonusGames">Hide Bonus games</label>
                      </div>
                    </div>
                  </div>
                  <div className="text-secondary small mt-2">
                    Overlay poll controls how often the client refreshes overlay data.
                  </div>
                </div>
              </div>

              <div className="col-12">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10">
                  <div className="small text-uppercase opacity-75 mb-2">Covers & Metadata (IGDB)</div>
                  <div className="form-check form-switch mb-2">
                    <input className="form-check-input" type="checkbox" checked={igdbEnabled} onChange={e=>setIgdbEnabled(e.target.checked)} id="igdbEnabled" />
                    <label className="form-check-label" htmlFor="igdbEnabled">Enable IGDB for covers/years (via local proxy)</label>
                  </div>
                  <button disabled={!igdbEnabled || precacheState.running} className="btn btn-outline-info" onClick={precache}>
                    {precacheState.running ? `Precaching... (${precacheState.done}/${precacheState.total})` : 'Precache All Covers'}
                  </button>
                  {precacheState.running && (
                    <div className="progress mt-2" role="progressbar" aria-valuenow={(precacheState.done/precacheState.total*100)|0} aria-valuemin="0" aria-valuemax="100">
                      <div className="progress-bar" style={{width: `${Math.round(precacheState.done/precacheState.total*100)}%`}}></div>
                    </div>
                  )}
                  <div className="text-secondary small mt-2">Uses size <code>t_cover_big_2x</code> and caches to IndexedDB as <code>/cache/covers/Console - Game.jpg</code>.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <h3 className="h6 mb-1">Achievements</h3>
                <div className="text-secondary small">Automation and overlay behavior.</div>
              </div>
              <div className="text-secondary small">Auto-saves on change.</div>
            </div>

            <div className="row g-3">
              <div className="col-lg-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">Automation</div>
                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={!!achievementSettings.smartPollingEnabled}
                      onChange={e=>updateAchievementSetting('smartPollingEnabled', e.target.checked)}
                      id="smartPollingEnabled"
                    />
                    <label className="form-check-label" htmlFor="smartPollingEnabled">Enable smart RA polling (profile delta)</label>
                  </div>
                  <div className="form-text mb-3">
                    Polls user profile and only fetches recent achievements / refreshes game progress when points change.
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <label className="form-label">Smart poll (ms)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={achievementSettings.smartPollMs ?? 30000}
                        onChange={e=>updateAchievementSetting('smartPollMs', parseInt(e.target.value||'0',10))}
                        min="5000"
                        step="1000"
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">Now playing poll (ms)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={achievementSettings.autoNowPlayingPollMs ?? 30000}
                        onChange={e=>updateAchievementSetting('autoNowPlayingPollMs', parseInt(e.target.value||'0',10))}
                        min="5000"
                        step="1000"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Full refresh (ms)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={achievementSettings.smartFullRefreshMs ?? 600000}
                        onChange={e=>updateAchievementSetting('smartFullRefreshMs', parseInt(e.target.value||'0',10))}
                        min="60000"
                        step="60000"
                      />
                      <div className="form-text">Periodic full refresh for long sessions (default 10 min)</div>
                    </div>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={!!achievementSettings.autoDetectNowPlaying}
                      onChange={e=>updateAchievementSetting('autoDetectNowPlaying', e.target.checked)}
                      id="autoDetectNowPlaying"
                    />
                    <label className="form-check-label" htmlFor="autoDetectNowPlaying">Auto-detect current game (RA recently played)</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={!!achievementSettings.autoTimerFromNowPlaying}
                      onChange={e=>updateAchievementSetting('autoTimerFromNowPlaying', e.target.checked)}
                      id="autoTimerFromNowPlaying"
                    />
                    <label className="form-check-label" htmlFor="autoTimerFromNowPlaying">Auto-start timer from now playing (admin only)</label>
                  </div>
                </div>
              </div>

              <div className="col-lg-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">Overlay behavior</div>
                  <div className="form-check form-switch mb-2">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      checked={achievementSettings.enablePopups !== false} 
                      onChange={e=>updateAchievementSetting('enablePopups', e.target.checked)} 
                      id="enablePopups" 
                    />
                    <label className="form-check-label" htmlFor="enablePopups">Enable Achievement Popups</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      checked={achievementSettings.enableTicker !== false} 
                      onChange={e=>updateAchievementSetting('enableTicker', e.target.checked)} 
                      id="enableTicker" 
                    />
                    <label className="form-check-label" htmlFor="enableTicker">Enable Achievement Ticker</label>
                  </div>

                  <div className="form-check form-switch mb-3">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      checked={achievementSettings.showHardcoreMode !== false} 
                      onChange={e=>updateAchievementSetting('showHardcoreMode', e.target.checked)} 
                      id="showHardcoreMode" 
                    />
                    <label className="form-check-label" htmlFor="showHardcoreMode">Show Hardcore Mode Indicators</label>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label">Popup Duration (ms)</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={achievementSettings.popupDuration} 
                        onChange={e=>updateAchievementSetting('popupDuration', parseInt(e.target.value||'5000',10))}
                        min="2000"
                        max="30000"
                        step="1000"
                      />
                      <div className="form-text">2-30 seconds</div>
                    </div>
                    <div className="col-6">
                      <label className="form-label">Ticker Speed (px/s)</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={achievementSettings.tickerSpeed} 
                        onChange={e=>updateAchievementSetting('tickerSpeed', parseInt(e.target.value||'30',10))}
                        min="10"
                        max="100"
                        step="5"
                      />
                      <div className="form-text">10-100 px/s</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-3 p-3 bg-dark rounded">
              <h6 className="small mb-2">Overlay URLs</h6>
              <div className="mb-2">
                <Link className="btn btn-sm btn-outline-light" to="/admin/overlays">Open Overlay Studio</Link>
              </div>
              <div className="small text-secondary">
                <div><strong>Achievement Progress:</strong> <code>http://localhost:5173/overlay/achievements?style=progress&poll=5000&token=YOUR_TOKEN</code></div>
                <div><strong>Achievement Grid:</strong> <code>http://localhost:5173/overlay/achievements?style=grid&compact=1&token=YOUR_TOKEN</code></div>
                <div><strong>Recent Achievements:</strong> <code>http://localhost:5173/overlay/achievements?style=recent&max=10&token=YOUR_TOKEN</code></div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <h3 className="h6 mb-1">Stream Alerts</h3>
                <div className="text-secondary small">
                  Toggle Discord/StreamerBot alerts. Requires <code>DISCORD_WEBHOOK_URL</code> and/or <code>STREAMERBOT_ENABLED=true</code>.
                </div>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">Channels</div>
                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.enabled}
                      onChange={e => setNotificationSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                      id="notifyEnabled"
                    />
                    <label className="form-check-label" htmlFor="notifyEnabled">Enable Stream Alerts</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.channels.discord}
                      onChange={e => setNotificationSettings(prev => ({
                        ...prev,
                        channels: { ...prev.channels, discord: e.target.checked }
                      }))}
                      id="notifyDiscord"
                    />
                    <label className="form-check-label" htmlFor="notifyDiscord">Discord webhooks</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.channels.streamerbot}
                      onChange={e => setNotificationSettings(prev => ({
                        ...prev,
                        channels: { ...prev.channels, streamerbot: e.target.checked }
                      }))}
                      id="notifyStreamerbot"
                    />
                    <label className="form-check-label" htmlFor="notifyStreamerbot">StreamerBot actions</label>
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">Events</div>
                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.events.gameStarted}
                      onChange={e => setNotificationSettings(prev => ({
                        ...prev,
                        events: { ...prev.events, gameStarted: e.target.checked }
                      }))}
                      id="notifyGameStarted"
                    />
                    <label className="form-check-label" htmlFor="notifyGameStarted">Notify when a game starts</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.events.gameCompleted}
                      onChange={e => setNotificationSettings(prev => ({
                        ...prev,
                        events: { ...prev.events, gameCompleted: e.target.checked }
                      }))}
                      id="notifyGameCompleted"
                    />
                    <label className="form-check-label" htmlFor="notifyGameCompleted">Notify when a game completes</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.events.suggestionReceived}
                      onChange={e => setNotificationSettings(prev => ({
                        ...prev,
                        events: { ...prev.events, suggestionReceived: e.target.checked }
                      }))}
                      id="notifySuggestion"
                    />
                    <label className="form-check-label" htmlFor="notifySuggestion">Notify on new suggestions</label>
                  </div>

                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationSettings.events.streamStarted}
                      onChange={e => setNotificationSettings(prev => ({
                        ...prev,
                        events: { ...prev.events, streamStarted: e.target.checked }
                      }))}
                      id="notifyStreamStarted"
                    />
                    <label className="form-check-label" htmlFor="notifyStreamStarted">Notify when a stream goes live</label>
                  </div>
                </div>
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mt-3 align-items-center">
              <button
                className="btn btn-outline-info"
                onClick={saveNotifications}
                disabled={notificationStatus.loading}
              >
                {notificationStatus.loading ? 'Saving...' : 'Save Notification Settings'}
              </button>
              {notificationStatus.message && <div className="text-success small">{notificationStatus.message}</div>}
              {notificationStatus.error && <div className="text-danger small">{notificationStatus.error}</div>}
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <h3 className="h6 mb-1">Timers & Maintenance</h3>
                <div className="text-secondary small">Event timer controls and bulk actions.</div>
              </div>
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2">Event Timer</div>
                  <div className="text-secondary small mb-3">
                    The event total follows the Current Game timer. Use Current tab to Start/Pause. Reset the total here.
                  </div>
                  <button className="btn btn-outline-danger" onClick={resetTotalTimer}>Reset Event Total</button>
                </div>
              </div>

              <div className="col-md-6">
                <div className="border rounded-3 p-3 border-secondary border-opacity-10 h-100">
                  <div className="small text-uppercase opacity-75 mb-2 text-danger">Maintenance</div>
                  <div className="text-secondary small mb-2">Bulk actions to quickly clean up your library.</div>
                  <div className="d-flex flex-wrap gap-2">
                    <button className="btn btn-outline-warning" onClick={clearAllInProgress}>Clear All In-Progress</button>
                    <button className="btn btn-outline-info" onClick={() => {
                      try {
                        const { total, completed } = computeMainStats(state.games)
                        const base = import.meta.env.VITE_IGDB_PROXY_URL
                        if (!base) return alert('Proxy not configured (VITE_IGDB_PROXY_URL).')
                        fetch(`${base}/overlay/stats`, {
                          method: 'POST', headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
                          body: JSON.stringify({ total, completed }),
                          credentials: 'include'
                        }).then(() => alert('Published stats to overlay.'))
                      } catch (e) { alert('Failed to publish stats: ' + (e?.message||e)) }
                    }}>Publish Stats to Overlay</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
