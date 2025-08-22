import React, { useState } from 'react'
import { useGame } from '../context/GameContext.jsx'
import * as RA from '../services/retroachievements.js'
import * as IGDB from '../services/igdb.js'
import * as Storage from '../services/storage.js'

export default function Settings() {
  const { state, dispatch } = useGame()
  const [username, setUsername] = useState(import.meta.env.VITE_RA_USERNAME || '')
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_RA_API_KEY || '')
  const [raEnabled, setRaEnabled] = useState(state.settings.raEnabled)
  const [igdbEnabled, setIgdbEnabled] = useState(state.settings.igdbEnabled)
  const [hideBonusGames, setHideBonusGames] = useState(state.settings.hideBonusGames)
  const [pollMs, setPollMs] = useState(state.settings.pollMs || 5000)
  const [loading, setLoading] = useState(false)
  const [precacheState, setPrecacheState] = useState({ running: false, done: 0, total: 0, last: '' })

  // Seed overlay idle wheel with a small 16-slot sample based on current settings
  const seedOverlayWheel = React.useCallback(async (opts = {}) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL
      if (!base) return
      const hide = opts.hideBonusGames ?? hideBonusGames
      // Filter games based on RA bonus toggle only (leave deeper filters to Select page)
      let pool = state.games || []
      if (hide) {
        const { isBonus } = await import('../utils/bonusDetection.js')
        pool = pool.filter(g => !isBonus(g.title))
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample, poolSize: pool.length })
      })
    } catch {/* ignore */}
  }, [state.games, hideBonusGames])

  const save = async () => {
    dispatch({ type: 'SET_SETTINGS', settings: { ...state.settings, raEnabled, igdbEnabled, hideBonusGames, pollMs } })
    await seedOverlayWheel({ hideBonusGames })
    alert('Saved settings. Overlay wheel updated.')
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

  const syncRA = async () => {
    if (!raEnabled) return alert('Enable RA first')
    if (!apiKey) return alert('Enter your RA API key')
    setLoading(true)
    try {
      const ids = await RA.resolveDefaultPSConsoleIds({ apiKey })
      const games = await RA.fetchGamesForConsoles({
        username, apiKey, consoleIds: [ids['PlayStation'], ids['PlayStation 2'], ids['PlayStation Portable']],
        withHashes: false, onlyWithAchievements: true
      })
      // Merge with existing by title+console (basic, preserves your status/notes)
      const byKey = (g) => `${g.title}|${g.console}`
      const map = new Map(state.games.map(g => [byKey(g), g]))
      for (const g of games) {
        const key = byKey(g)
        if (!map.has(key)) map.set(key, g)
      }
      const merged = Array.from(map.values())
      dispatch({ type: 'SET_GAMES', games: merged })
      alert(`Synced ${games.length} games from RetroAchievements.`)
    } catch (e) {
      alert('RA sync failed: ' + (e?.message || e))
    } finally {
      setLoading(false)
    }
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

  const resetPSFestTimer = async () => {
    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Reset PSFest timer? This will clear all accumulated time.') : true
    if (!ok) return
    try {
      await Storage.resetPSFestTimer()
      alert('PSFest total reset.')
    } catch { alert('Failed to reset PSFest timer (server).') }
  }

  return (
    <div className="p-3">
      <h2 className="h4">Settings</h2>
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h3 className="h6">RetroAchievements</h3>
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
            <button disabled={!raEnabled || loading} className="btn btn-primary mt-3" onClick={syncRA}>
              {loading ? 'Syncing...' : 'Sync PS1 / PS2 / PSP'}
            </button>
            <div className="text-secondary small mt-2">
              Console IDs are resolved live via RA <code>API_GetConsoleIDs.php</code> and default to common IDs if resolution fails.
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h3 className="h6">General</h3>
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
            <button className="btn btn-success mt-3" onClick={save}>Save Settings</button>
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <h3 className="h6">Covers & Metadata (IGDB)</h3>
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

        <div className="col-12">
          <div className="card bg-panel p-3">
            <h3 className="h6">🎯 PSFest Timer</h3>
            <div className="text-secondary small mb-3">
              PSFest now follows the Current Game timer. Use Current tab to Start/Pause. Reset the total here.
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-danger" onClick={resetPSFestTimer}>Reset PSFest Total</button>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <h3 className="h6 text-danger">Maintenance</h3>
            <div className="text-secondary small mb-2">Bulk actions to quickly clean up your library.</div>
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-outline-warning" onClick={clearAllInProgress}>Clear All In-Progress</button>
              <button className="btn btn-outline-info" onClick={() => {
                try {
                  const total = state.games.length
                  const completed = state.games.filter(g => g.status === 'Completed').length
                  const base = import.meta.env.VITE_IGDB_PROXY_URL
                  if (!base) return alert('Proxy not configured (VITE_IGDB_PROXY_URL).')
                  fetch(`${base}/overlay/stats`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ total, completed })
                  }).then(() => alert('Published stats to overlay.'))
                } catch (e) { alert('Failed to publish stats: ' + (e?.message||e)) }
              }}>Publish Stats to Overlay</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
