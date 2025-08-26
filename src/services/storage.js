import mock from '../mock/games.ps.json'

const LS_GAMES = 'psfest.games'
const LS_SETTINGS = 'psfest.settings'
const LS_CURRENT = 'psfest.currentGameId'

async function postOverlayState(partial) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return
    await fetch(`${base}/overlay/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    })
  } catch { /* ignore overlay sync failures */ }
}
async function postOverlayStats({ total, completed }) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return
    await fetch(`${base}/overlay/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total, completed })
    })
  } catch { /* ignore */ }
}
async function postOverlayCurrent(current) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return
    await fetch(`${base}/overlay/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current })
    })
  } catch { /* ignore */ }
}

export function bootstrap() {
  const settings = getSettings()
  const seedMock = (import.meta.env.VITE_SEED_MOCK === 'true') && !settings.raEnabled
  let games = getGames()
  if (!games.length && seedMock) {
    // seed with mock data so UI works out of the box
    games = mock
    saveGames(games)
  }
  // Publish lightweight stats for overlays
  try {
    const total = games.length
    if (total > 0) {
      const completed = games.filter(g => g.status === 'Completed').length
      postOverlayStats({ total, completed })
    }
  } catch {}
  // Publish current game (if any) so OBS overlay sees it even on fresh loads
  try {
    const curId = getCurrentGameId()
    if (curId) {
      const g = games.find(x => x.id === curId)
      if (g) {
        postOverlayCurrent({
          id: g.id, title: g.title, console: g.console, image_url: g.image_url,
          release_year: g.release_year, publisher: g.publisher, status: g.status
        })
        // Also ensure timers know which game is current
        syncTimersToServer()
      }
    }
  } catch {}
  return { games, settings }
}

export function getGames() {
  try {
    const raw = localStorage.getItem(LS_GAMES)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
export function saveGames(games) {
  localStorage.setItem(LS_GAMES, JSON.stringify(games))
  
  // Dispatch custom event for same-window updates (overlay)
  window.dispatchEvent(new CustomEvent('gameDataUpdated', { detail: { type: 'games', games } }))
  // Do NOT post full games to overlay to avoid large payloads
  try {
    const total = games.length
    if (total > 0) {
      const completed = games.filter(g => g.status === 'Completed').length
      postOverlayStats({ total, completed })
    }
  } catch {}
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    return raw ? JSON.parse(raw) : {
      raEnabled: import.meta.env.VITE_RA_ENABLED === 'true',
      igdbEnabled: import.meta.env.VITE_IGDB_ENABLED === 'true',
      hideBonusGames: true,
      pollMs: 5000,
      psfestStartTime: null,
    }
  } catch { return {} }
}
export function saveSettings(settings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings))
}

export function getCurrentGameId() {
  return localStorage.getItem(LS_CURRENT) || null
}
export function setCurrentGameId(id) {
  if (id) localStorage.setItem(LS_CURRENT, id)
  else localStorage.removeItem(LS_CURRENT)
  
  // Dispatch custom event for same-window updates (overlay)
  window.dispatchEvent(new CustomEvent('gameDataUpdated', { detail: { type: 'currentGame', id } }))
  // Best-effort: sync minimal current game to server for OBS overlay
  try {
    const games = getGames()
    const g = games.find(x => x.id === id) || null
    if (g) {
      postOverlayCurrent({
        id: g.id,
        title: g.title,
        console: g.console,
        image_url: g.image_url,
        release_year: g.release_year,
        publisher: g.publisher,
        status: g.status
      })
    } else {
      postOverlayCurrent(null)
    }
    // Sync timers when current game changes
    syncTimersToServer()
  } catch {}
}

async function syncTimersToServer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const currentId = getCurrentGameId()
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentGameId: currentId })
    })
  } catch { /* ignore sync failures */ }
}

// Timer controls
export async function startCurrentTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ running: true })
    })
  } catch {}
}

export async function pauseCurrentTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ running: false })
    })
  } catch {}
}

export async function resetCurrentTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetCurrent: true })
    })
  } catch {}
}

export async function resetPSFestTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPSFest: true })
    })
  } catch {}
}

export async function getTimerStatus() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const r = await fetch(`${base}/overlay/timers`)
    if (!r.ok) return { running: false }
    const j = await r.json()
    return { running: !!j.running }
  } catch { return { running: false } }
}

export async function getTimerData() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const r = await fetch(`${base}/overlay/timers`)
    if (!r.ok) return { running: false, currentTime: 0, totalTime: 0 }
    const j = await r.json()
    return {
      running: !!j.running,
      currentTime: j.currentTime || 0,
      totalTime: j.totalTime || 0,
      currentFormatted: j.currentFormatted || '0:00:00',
      totalFormatted: j.totalFormatted || '0:00:00'
    }
  } catch { return { running: false, currentTime: 0, totalTime: 0, currentFormatted: '0:00:00', totalFormatted: '0:00:00' } }
}
