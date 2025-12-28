import mock from '../mock/games.ps.json'

const LS_GAMES = 'tracker.games'
const LS_SETTINGS = 'tracker.settings'
const LS_CURRENT = 'tracker.currentGameId'

function getCsrfToken() {
  try { return localStorage.getItem('ra.csrf') || '' } catch { return '' }
}

function withAdminHeaders(headers = {}) {
  const csrf = getCsrfToken()
  if (csrf) return { ...headers, 'x-csrf-token': csrf }
  return headers
}

async function postOverlayState(partial) {
  let retries = 3
  let delay = 1000
  
  while (retries > 0) {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      if (!base) return
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(`${base}/overlay/state`, {
        method: 'POST',
        headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(partial),
        signal: controller.signal,
        credentials: 'include'
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        return // Success
      } else if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`)
      } else {
        console.warn('Storage: Overlay state sync failed with status:', response.status)
        return // Don't retry for client errors
      }
    } catch (error) {
      retries--
      if (retries === 0) {
        console.warn('Storage: Overlay state sync failed after retries:', error.message)
        return
      }
      
      if (error.name === 'AbortError') {
        console.warn('Storage: Overlay state sync timeout, retrying...')
      } else {
        console.warn('Storage: Overlay state sync error, retrying...', error.message)
      }
      
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 2 // Exponential backoff
    }
  }
}
async function postOverlayStats({ total, completed }) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const response = await fetch(`${base}/overlay/stats`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ total, completed }),
      signal: controller.signal,
      credentials: 'include'
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.warn('Storage: Overlay stats sync failed with status:', response.status)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Storage: Overlay stats sync timeout')
    } else {
      console.warn('Storage: Overlay stats sync error:', error.message)
    }
  }
}
async function postOverlayCurrent(current) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const response = await fetch(`${base}/overlay/current`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ current }),
      signal: controller.signal,
      credentials: 'include'
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.warn('Storage: Overlay current sync failed with status:', response.status)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Storage: Overlay current sync timeout')
    } else {
      console.warn('Storage: Overlay current sync error:', error.message)
    }
  }
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
    let raw = localStorage.getItem(LS_GAMES)
    if (!raw) {
      // Migrate legacy key if present
      const legacy = localStorage.getItem('psfest.games')
      if (legacy) {
        localStorage.setItem(LS_GAMES, legacy)
        localStorage.removeItem('psfest.games')
        raw = legacy
      }
    }
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
export function saveGames(games) {
  function thinGame(g) {
    return {
      id: g.id,
      title: g.title,
      console: g.console,
      status: g.status,
      image_url: g.image_url || null,
      date_started: g.date_started || null,
      date_finished: g.date_finished || null,
      completion_time: g.completion_time || null,
      rating: g.rating ?? null,
      notes: g.notes ?? '',
      release_year: g.release_year || null,
      publisher: g.publisher || null,
      custom_tags: g.custom_tags ?? [],
      studio: g.studio ?? null,
    }
  }

  try {
    localStorage.setItem(LS_GAMES, JSON.stringify(games))
  } catch (e) {
    try {
      const slim = games.map(thinGame)
      localStorage.setItem(LS_GAMES, JSON.stringify(slim))
      console.warn('Storage: saved slimmed games to avoid quota limits')
    } catch (e2) {
      console.warn('Storage: failed to persist games due to quota; skipping save')
      try { localStorage.setItem('tracker.tooLarge', '1') } catch {}
    }
  }
  
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
    let raw = localStorage.getItem(LS_SETTINGS)
    if (!raw) {
      const legacy = localStorage.getItem('psfest.settings')
      if (legacy) {
        localStorage.setItem(LS_SETTINGS, legacy)
        localStorage.removeItem('psfest.settings')
        raw = legacy
      }
    }
    return raw ? JSON.parse(raw) : {
      raEnabled: import.meta.env.VITE_RA_ENABLED === 'true',
      igdbEnabled: import.meta.env.VITE_IGDB_ENABLED === 'true',
      hideBonusGames: true,
      pollMs: 5000,
      totalStartTime: null,
    }
  } catch { return {} }
}
export function saveSettings(settings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings))
}

export function getCurrentGameId() {
  const cur = localStorage.getItem(LS_CURRENT)
  if (cur) return cur
  const legacy = localStorage.getItem('psfest.currentGameId')
  if (legacy) {
    localStorage.setItem(LS_CURRENT, legacy)
    localStorage.removeItem('psfest.currentGameId')
    return legacy
  }
  return null
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
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ currentGameId: currentId }),
      credentials: 'include'
    })
  } catch { /* ignore sync failures */ }
}

// Timer controls
export async function startCurrentTimer() {
  let retries = 3
  let delay = 1000
  
  while (retries > 0) {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      if (!base) {
        console.warn('Timer: No server URL configured for timer control')
        throw new Error('No server URL configured')
      }
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(`${base}/overlay/timers`, {
        method: 'POST',
        headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ running: true }),
        signal: controller.signal,
        credentials: 'include'
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        console.log('Timer: Successfully started current timer')
        return true
      } else if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`)
      } else {
        console.error('Timer: Failed to start timer with status:', response.status)
        return false
      }
    } catch (error) {
      retries--
      if (retries === 0) {
        console.error('Timer: Failed to start current timer after retries:', error.message)
        throw error
      }
      
      if (error.name === 'AbortError') {
        console.warn('Timer: Start request timeout, retrying...')
      } else {
        console.warn('Timer: Start request error, retrying...', error.message)
      }
      
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 2
    }
  }
  return false
}

export async function pauseCurrentTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) {
      console.warn('Timer: No server URL configured for timer control')
      return false
    }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ running: false }),
      signal: controller.signal,
      credentials: 'include'
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      console.log('Timer: Successfully paused current timer')
      return true
    } else {
      console.error('Timer: Failed to pause timer with status:', response.status)
      return false
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Timer: Pause request timeout')
    } else {
      console.error('Timer: Pause request error:', error.message)
    }
    return false
  }
}

export async function resetCurrentTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ resetCurrent: true }),
      credentials: 'include'
    })
  } catch {}
}

export async function resetTotalTimer() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ resetTotal: true }),
      credentials: 'include'
    })
  } catch {}
}

export async function setTimerTimes({ currentSeconds, totalSeconds }) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return false
    const payload = {}
    if (Number.isFinite(currentSeconds)) {
      payload.setCurrentSeconds = Math.max(0, Math.floor(currentSeconds))
    }
    if (Number.isFinite(totalSeconds)) {
      payload.setTotalSeconds = Math.max(0, Math.floor(totalSeconds))
    }
    if (!Object.keys(payload).length) return false
    const res = await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include'
    })
    return res.ok
  } catch {
    return false
  }
}

function parseDuration(value) {
  if (Number.isFinite(value)) return value
  if (value === null || value === undefined) return 0
  const raw = String(value).trim()
  if (!raw) return 0
  const parts = raw.split(':').map(seg => Number.parseInt(seg, 10))
  if (parts.some(n => !Number.isFinite(n))) return 0
  while (parts.length < 3) parts.unshift(0)
  const slice = parts.slice(-3)
  return (slice[0] * 3600) + (slice[1] * 60) + slice[2]
}

export async function getTimerStatus() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const r = await fetch(`${base}/overlay/timers`, { credentials: 'include' })
    if (!r.ok) return { running: false }
    const j = await r.json()
    return { running: !!j.running }
  } catch { return { running: false } }
}

export async function getTimerData() {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) {
      console.warn('Timer: No server URL configured for timer data')
      return { running: false, currentTime: 0, totalTime: 0, currentFormatted: '0:00:00', totalFormatted: '0:00:00' }
    }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    const r = await fetch(`${base}/overlay/timers`, {
      signal: controller.signal,
      credentials: 'include'
    })
    
    clearTimeout(timeoutId)
    
    if (!r.ok) {
      console.warn('Timer: Failed to fetch timer data, status:', r.status)
      return { running: false, currentTime: 0, totalTime: 0, currentFormatted: '0:00:00', totalFormatted: '0:00:00' }
    }
    
    const j = await r.json()
    
    // Validate the response data
    const currentSeconds = Number.isFinite(j.currentSeconds)
      ? j.currentSeconds
      : parseDuration(j.currentTime ?? j.currentGameTime ?? j.currentFormatted)
    const totalSeconds = Number.isFinite(j.totalSeconds)
      ? j.totalSeconds
      : parseDuration(j.totalTime ?? j.totalFormatted ?? j.psfestTime)
    const timerData = {
      running: !!j.running,
      currentTime: Math.max(0, currentSeconds || 0),
      totalTime: Math.max(0, totalSeconds || 0),
      currentFormatted: j.currentFormatted || j.currentGameTime || '0:00:00',
      totalFormatted: j.totalFormatted || j.totalTime || j.psfestTime || '0:00:00',
      currentGameId: j.currentGameId || null,
      lastUpdate: j.lastUpdate || Date.now()
    }
    
    // Detect potential timer state corruption
    if (timerData.running && timerData.currentTime === 0) {
      console.warn('Timer: Detected potential timer state corruption (running but no current time)')
    }
    
    if (timerData.currentTime > timerData.totalTime + 60) { // Allow small discrepancies
      console.warn('Timer: Current time exceeds total time, possible state corruption')
    }
    
    return timerData
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Timer: Timer data request timeout')
    } else {
      console.warn('Timer: Timer data request error:', error.message)
    }
    return { running: false, currentTime: 0, totalTime: 0, currentFormatted: '0:00:00', totalFormatted: '0:00:00' }
  }
}

// Validate and recover timer state if needed
export async function validateAndRecoverTimerState() {
  try {
    const timerData = await getTimerData()
    const currentGameId = getCurrentGameId()
    
    // Check for inconsistencies
    let needsRecovery = false
    const issues = []
    
    if (timerData.running && !currentGameId) {
      issues.push('Timer running but no current game selected')
      needsRecovery = true
    }
    
    if (currentGameId && timerData.currentGameId && currentGameId !== timerData.currentGameId) {
      issues.push('Timer game ID mismatch with current selection')
      needsRecovery = true
    }
    
    if (timerData.running && timerData.currentTime === 0) {
      issues.push('Timer running but no accumulated time')
      // This might be normal for just-started timers, so don't force recovery
    }
    
    if (needsRecovery) {
      console.warn('Timer: State validation issues detected:', issues)
      
      // Attempt recovery
      if (currentGameId) {
        console.log('Timer: Attempting to sync timer with current game:', currentGameId)
        await syncTimerWithCurrentGame(currentGameId)
      } else if (timerData.running) {
        console.log('Timer: Pausing orphaned timer (no current game)')
        await pauseCurrentTimer()
      }
      
      return { recovered: true, issues }
    }
    
    return { recovered: false, issues: [] }
  } catch (error) {
    console.error('Timer: Failed to validate timer state:', error)
    return { recovered: false, issues: ['Validation failed: ' + error.message] }
  }
}

// Helper function to sync timer with current game
async function syncTimerWithCurrentGame(gameId) {
  try {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!base) return false
    
    const response = await fetch(`${base}/overlay/timers`, {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ 
        syncCurrentGame: true,
        currentGameId: gameId
      }),
      credentials: 'include'
    })
    
    if (response.ok) {
      console.log('Timer: Successfully synced with current game')
      return true
    } else {
      console.error('Timer: Failed to sync with current game, status:', response.status)
      return false
    }
  } catch (error) {
    console.error('Timer: Error syncing with current game:', error)
    return false
  }
}
