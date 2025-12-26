import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const USER_METADATA_FILE = path.join(DATA_DIR, 'user-metadata.json')

function loadUserMetadata() {
  try {
    if (!fs.existsSync(USER_METADATA_FILE)) {
      return { games: {}, settings: {}, history: [], version: 1 }
    }
    const raw = fs.readFileSync(USER_METADATA_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return {
      games: data.games || {},
      settings: data.settings || {},
      history: Array.isArray(data.history) ? data.history : [],
      version: data.version || 1,
      lastUpdated: data.lastUpdated || Date.now()
    }
  } catch (error) {
    console.error('Failed to load user metadata:', error)
    return { games: {}, settings: {}, history: [], version: 1 }
  }
}

function saveUserMetadata(metadata) {
  try {
    const dataToSave = {
      ...metadata,
      lastUpdated: Date.now()
    }
    fs.writeFileSync(USER_METADATA_FILE, JSON.stringify(dataToSave, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save user metadata:', error)
    return false
  }
}

export function getUserMetadata(gameId = null) {
  const metadata = loadUserMetadata()
  if (gameId) {
    return metadata.games[gameId] || {}
  }
  return metadata
}

export function updateGameMetadata(gameId, updates) {
  if (!gameId) {
    throw new Error('Game ID is required')
  }

  const metadata = loadUserMetadata()
  const currentGame = metadata.games[gameId] || {}
  
  const updatedGame = {
    ...currentGame,
    ...updates,
    lastModified: Date.now()
  }

  metadata.games[gameId] = updatedGame
  
  const success = saveUserMetadata(metadata)
  if (!success) {
    throw new Error('Failed to save user metadata')
  }

  return updatedGame
}

export function bulkUpdateMetadata(updates) {
  const metadata = loadUserMetadata()
  
  for (const [gameId, gameUpdates] of Object.entries(updates)) {
    const currentGame = metadata.games[gameId] || {}
    metadata.games[gameId] = {
      ...currentGame,
      ...gameUpdates,
      lastModified: Date.now()
    }
  }
  
  const success = saveUserMetadata(metadata)
  if (!success) {
    throw new Error('Failed to bulk save user metadata')
  }

  return metadata
}

export function deleteGameMetadata(gameId) {
  if (!gameId) {
    throw new Error('Game ID is required')
  }

  const metadata = loadUserMetadata()
  delete metadata.games[gameId]
  
  const success = saveUserMetadata(metadata)
  if (!success) {
    throw new Error('Failed to save user metadata')
  }

  return true
}

export function getUserSettings() {
  const metadata = loadUserMetadata()
  return metadata.settings
}

export function updateUserSettings(settingsUpdates) {
  const metadata = loadUserMetadata()
  metadata.settings = {
    ...metadata.settings,
    ...settingsUpdates,
    lastModified: Date.now()
  }
  
  const success = saveUserMetadata(metadata)
  if (!success) {
    throw new Error('Failed to save user settings')
  }

  return metadata.settings
}

export function appendHistoryEntry({ timestamp, gameId, duration, eventType }) {
  return appendHistoryEntries([{
    timestamp,
    gameId,
    duration,
    eventType
  }])[0]
}

export function appendHistoryEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('History entries are required')
  }
  const metadata = loadUserMetadata()
  const history = Array.isArray(metadata.history) ? metadata.history : []
  const nextHistory = history.slice()
  const nextEntries = []
  const resultEntries = []

  for (const entry of entries) {
    const id = String(entry?.gameId || '').trim()
    if (!id) throw new Error('Game ID is required')
    const ts = Number(entry?.timestamp || Date.now())
    const dur = Math.max(0, Math.floor(Number(entry?.duration) || 0))
    const type = String(entry?.eventType || 'session_end')
    const normalized = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      gameId: id,
      duration: dur,
      eventType: type
    }
    if (type === 'legacy_fields') {
      const idx = nextHistory.findIndex(item => (
        item?.eventType === 'legacy_fields' &&
        String(item?.gameId) === id
      ))
      if (idx >= 0) {
        nextHistory[idx] = { ...nextHistory[idx], duration: normalized.duration, timestamp: normalized.timestamp }
        resultEntries.push(nextHistory[idx])
        continue
      }
    }
    nextEntries.push(normalized)
    resultEntries.push(normalized)
  }

  metadata.history = [...nextEntries, ...nextHistory].slice(0, 1000)
  const success = saveUserMetadata(metadata)
  if (!success) {
    throw new Error('Failed to append history entries')
  }
  return resultEntries
}

export function backfillHistoryFromTotals(perGameTotals, timestamp = Date.now(), eventType = 'backfill') {
  const metadata = loadUserMetadata()
  const history = Array.isArray(metadata.history) ? metadata.history : []
  if (history.length) return { skipped: true, added: 0 }
  const totals = perGameTotals && typeof perGameTotals === 'object' ? perGameTotals : {}
  const entries = []
  for (const [gameId, seconds] of Object.entries(totals)) {
    const dur = Math.max(0, Math.floor(Number(seconds) || 0))
    if (!dur) continue
    entries.push({
      gameId,
      duration: dur,
      timestamp,
      eventType
    })
  }
  if (!entries.length) return { skipped: true, added: 0 }
  appendHistoryEntries(entries)
  return { skipped: false, added: entries.length }
}

export function mergeWithGameLibrary(games) {
  const metadata = loadUserMetadata()
  
  return games.map(game => {
    const userMeta = metadata.games[game.id] || {}
    
    return {
      ...game,
      // Override server data with user preferences
      status: userMeta.status || game.status || 'Not Started',
      rating: userMeta.rating ?? game.rating ?? null,
      notes: userMeta.notes ?? game.notes ?? '',
      completion_time: userMeta.completion_time ?? game.completion_time ?? null,
      date_started: userMeta.date_started ?? game.date_started ?? null,
      date_finished: userMeta.date_finished ?? game.date_finished ?? null,
      image_url: userMeta.image_url ?? game.image_url ?? game.cover?.localPath ?? null,
      release_year: userMeta.release_year ?? game.release_year ?? game.releaseYear ?? null,
      publisher: userMeta.publisher ?? game.publisher ?? null,
      is_favorite: userMeta.is_favorite ?? false,
      play_count: userMeta.play_count ?? 0,
      total_playtime: userMeta.total_playtime ?? 0,
      last_played: userMeta.last_played ?? null,
      custom_tags: userMeta.custom_tags ?? [],
      studio: userMeta.studio ?? game.studio ?? null,
      // Preserve user metadata timestamp
      userMetaUpdated: userMeta.lastModified
    }
  })
}

// Export for server endpoint registration
export function createUserMetadataEndpoints(app) {
  // Get all user metadata
  app.get('/api/user/metadata', (req, res) => {
    try {
      const metadata = getUserMetadata()
      res.json(metadata)
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user metadata' })
    }
  })

  // Get metadata for specific game
  app.get('/api/user/metadata/:gameId', (req, res) => {
    try {
      const gameMeta = getUserMetadata(req.params.gameId)
      res.json(gameMeta)
    } catch (error) {
      res.status(500).json({ error: 'Failed to get game metadata' })
    }
  })

  // Update metadata for specific game
  app.post('/api/user/metadata/:gameId', (req, res) => {
    try {
      const updatedGame = updateGameMetadata(req.params.gameId, req.body)
      res.json(updatedGame)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Bulk update metadata
  app.post('/api/user/metadata', (req, res) => {
    try {
      const updated = bulkUpdateMetadata(req.body)
      res.json({ success: true, updated: Object.keys(req.body).length })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Delete game metadata
  app.delete('/api/user/metadata/:gameId', (req, res) => {
    try {
      deleteGameMetadata(req.params.gameId)
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // User settings endpoints
  app.get('/api/user/settings', (req, res) => {
    try {
      const settings = getUserSettings()
      res.json(settings)
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user settings' })
    }
  })

  app.post('/api/user/settings', (req, res) => {
    try {
      const updatedSettings = updateUserSettings(req.body)
      res.json(updatedSettings)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  app.get('/api/user/history', (req, res) => {
    try {
      const metadata = getUserMetadata()
      res.json({ history: Array.isArray(metadata.history) ? metadata.history : [] })
    } catch (error) {
      res.status(500).json({ error: 'Failed to get history' })
    }
  })

  app.post('/api/user/history', (req, res) => {
    try {
      const { gameId, duration, timestamp, eventType } = req.body || {}
      const entry = appendHistoryEntry({ gameId, duration, timestamp, eventType })
      res.json(entry)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
}
