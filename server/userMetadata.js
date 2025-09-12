import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const USER_METADATA_FILE = path.join(DATA_DIR, 'user-metadata.json')

function loadUserMetadata() {
  try {
    if (!fs.existsSync(USER_METADATA_FILE)) {
      return { games: {}, settings: {}, version: 1 }
    }
    const raw = fs.readFileSync(USER_METADATA_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return {
      games: data.games || {},
      settings: data.settings || {},
      version: data.version || 1,
      lastUpdated: data.lastUpdated || Date.now()
    }
  } catch (error) {
    console.error('Failed to load user metadata:', error)
    return { games: {}, settings: {}, version: 1 }
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
      is_favorite: userMeta.is_favorite ?? false,
      play_count: userMeta.play_count ?? 0,
      total_playtime: userMeta.total_playtime ?? 0,
      last_played: userMeta.last_played ?? null,
      custom_tags: userMeta.custom_tags ?? [],
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
}