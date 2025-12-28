import axios from 'axios'
import { buildOverlayUrl } from '../utils/overlayApi.js'

const RA_BASE = 'https://retroachievements.org/API'

function raImageUrl(pathStr) {
  if (!pathStr) return null
  const s = String(pathStr).trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  const cleaned = s.replace(/^\/+/, '')
  const p = cleaned.toLowerCase().startsWith('images/') ? cleaned : `Images/${cleaned}`
  return `https://media.retroachievements.org/${p}`
}

export async function getConsoleIds({ apiKey, activeOnly=true, gameSystemsOnly=true }={}) {
  if (!apiKey) return []
  const params = new URLSearchParams()
  params.set('y', apiKey)
  if (activeOnly) params.set('a', 1)
  if (gameSystemsOnly) params.set('g', 1)
  const url = `${RA_BASE}/API_GetConsoleIDs.php?${params.toString()}`
  const { data } = await axios.get(url)
  // Normalize to { id, name }
  if (!Array.isArray(data)) return []
  return data.map(x => ({
    id: x.ID ?? x.id,
    name: x.Name ?? x.name
  }))
}

export async function fetchGamesForConsoles({ username, apiKey, consoleIds = [], withHashes=false, onlyWithAchievements=true }) {
  // Uses official "All Games and Hashes" list per console (can be very large; cache results in app)
  if (!apiKey || !consoleIds.length) return []
  const results = []
  for (const id of consoleIds) {
    const params = new URLSearchParams()
    params.set('y', apiKey)
    params.set('i', String(id))
    if (withHashes) params.set('h', 1)
    if (onlyWithAchievements) params.set('f', 1)
    // Note: c/o (count/offset) left at defaults to fetch complete list
    const url = `${RA_BASE}/API_GetGameList.php?${params.toString()}`
    try {
      const { data } = await axios.get(url)
      if (Array.isArray(data)) {
        for (const g of data) {
          const title = g.Title || g.GameTitle || g.title
          const consoleName = g.ConsoleName || g.consoleName || String(id)
          results.push({
            id: `ra-${id}-${g.ID || g.GameID || g.id}`,
            title,
            console: consoleName,
            status: 'Not Started',
            image_url: raImageUrl(g.ImageBoxArt) || null,
            date_started: null,
            date_finished: null,
            completion_time: null,
            rating: null,
            notes: '',
            release_year: null,
            is_bonus: false
          })
        }
      }
    } catch (e) {
      console.warn('RA fetch failed for console', id, e?.message || e)
    }
  }
  return results
}

export const DEFAULT_PS_LABELS = ['PlayStation','PlayStation 2','PlayStation Portable']

export async function resolveDefaultPSConsoleIds({ apiKey }) {
  // Try live resolution, fallback to sensible defaults used historically on RA
  const fallback = {
    'PlayStation': 27,
    'PlayStation 2': 107,
    'PlayStation Portable': 46
  }
  try {
    const list = await getConsoleIds({ apiKey, activeOnly: true, gameSystemsOnly: true })
    const map = {}
    for (const label of DEFAULT_PS_LABELS) {
      const found = list.find(x => String(x.name).toLowerCase() === label.toLowerCase())
      if (found) map[label] = found.id
    }
    return { ...fallback, ...map }
  } catch {
    return fallback
  }
}

// Achievement-specific API functions

export async function getGameInfoAndUserProgress({ apiKey, username, gameId, includeAwards = false }) {
  if (!apiKey || !username || !gameId) {
    throw new Error('apiKey, username, and gameId are required')
  }
  
  // Use local server proxy to avoid CORS issues and manage rate limiting
  const proxyBase = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
  const url = buildOverlayUrl(`/api/retroachievements/game/${gameId}`, proxyBase)
  const params = new URLSearchParams()
  params.set('username', username)
  params.set('apiKey', apiKey)
  
  try {
    // Add timeout and retry logic
    const config = {
      timeout: 15000, // 15 second timeout
      headers: {
        'User-Agent': 'RetroAchievements-Tracker/1.0'
      },
      withCredentials: true
    }
    
    const requestUrl = new URL(url)
    for (const [key, value] of params.entries()) {
      requestUrl.searchParams.set(key, value)
    }
    const { data } = await axios.get(requestUrl.toString(), config)
    
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format from RetroAchievements API')
    }
    
    return {
      gameInfo: {
        id: data.ID,
        title: data.Title,
        console: data.ConsoleName,
        imageIcon: data.ImageIcon,
        imageTitle: data.ImageTitle,
        imageInGame: data.ImageInGame,
        imageBoxArt: data.ImageBoxArt,
        publisher: data.Publisher,
        developer: data.Developer,
        genre: data.Genre,
        released: data.Released
      },
      achievements: Object.values(data.Achievements || {}).map(achievement => ({
        id: achievement.ID,
        title: achievement.Title,
        description: achievement.Description,
        points: achievement.Points,
        badgeName: achievement.BadgeName,
        displayOrder: achievement.DisplayOrder,
        dateEarned: achievement.DateEarned,
        dateEarnedHardcore: achievement.DateEarnedHardcore,
        isEarned: !!achievement.DateEarned,
        isEarnedHardcore: !!achievement.DateEarnedHardcore
      })),
      userProgress: {
        numPossibleAchievements: data.NumPossibleAchievements,
        possibleScore: data.PossibleScore,
        numAchieved: data.NumAchieved,
        numAchievedHardcore: data.NumAchievedHardcore,
        scoreAchieved: data.ScoreAchieved,
        scoreAchievedHardcore: data.ScoreAchievedHardcore,
        completionPercentage: data.NumPossibleAchievements > 0 
          ? Math.round((data.NumAchieved / data.NumPossibleAchievements) * 100) 
          : 0,
        completionPercentageHardcore: data.NumPossibleAchievements > 0 
          ? Math.round((data.NumAchievedHardcore / data.NumPossibleAchievements) * 100) 
          : 0
      }
    }
  } catch (error) {
    console.error('Failed to fetch game info and user progress:', error)
    throw error
  }
}

export async function getUserProgress({ apiKey, username, gameIds }) {
  if (!apiKey || !username || !gameIds?.length) {
    throw new Error('apiKey, username, and gameIds are required')
  }
  
  const params = new URLSearchParams()
  params.set('y', apiKey)
  params.set('u', username)
  params.set('i', gameIds.join(','))
  
  const url = `${RA_BASE}/API_GetUserProgress.php?${params.toString()}`
  
  try {
    const { data } = await axios.get(url)
    return Object.entries(data).map(([gameId, progress]) => ({
      gameId: parseInt(gameId),
      numPossibleAchievements: progress.NumPossibleAchievements,
      possibleScore: progress.PossibleScore,
      numAchieved: progress.NumAchieved,
      scoreAchieved: progress.ScoreAchieved,
      numAchievedHardcore: progress.NumAchievedHardcore,
      scoreAchievedHardcore: progress.ScoreAchievedHardcore,
      completionPercentage: progress.NumPossibleAchievements > 0 
        ? Math.round((progress.NumAchieved / progress.NumPossibleAchievements) * 100) 
        : 0,
      completionPercentageHardcore: progress.NumPossibleAchievements > 0 
        ? Math.round((progress.NumAchievedHardcore / progress.NumPossibleAchievements) * 100) 
        : 0
    }))
  } catch (error) {
    console.error('Failed to fetch user progress:', error)
    throw error
  }
}

export async function getUserCompletionProgress({ apiKey, username, count = 100, offset = 0 }) {
  if (!apiKey || !username) {
    throw new Error('apiKey and username are required')
  }
  
  const params = new URLSearchParams()
  params.set('y', apiKey)
  params.set('u', username)
  params.set('c', String(count))
  params.set('o', String(offset))
  
  const url = `${RA_BASE}/API_GetUserCompletionProgress.php?${params.toString()}`
  
  try {
    const { data } = await axios.get(url)
    return {
      count: data.Count,
      total: data.Total,
      results: data.Results.map(result => ({
        gameId: result.GameID,
        title: result.Title,
        imageIcon: result.ImageIcon,
        consoleId: result.ConsoleID,
        consoleName: result.ConsoleName,
        maxPossible: result.MaxPossible,
        numAwarded: result.NumAwarded,
        numAwardedHardcore: result.NumAwardedHardcore,
        mostRecentAwardedDate: result.MostRecentAwardedDate,
        highestAwardKind: result.HighestAwardKind,
        highestAwardDate: result.HighestAwardDate,
        completionPercentage: result.MaxPossible > 0 
          ? Math.round((result.NumAwarded / result.MaxPossible) * 100) 
          : 0,
        completionPercentageHardcore: result.MaxPossible > 0 
          ? Math.round((result.NumAwardedHardcore / result.MaxPossible) * 100) 
          : 0
      }))
    }
  } catch (error) {
    console.error('Failed to fetch user completion progress:', error)
    throw error
  }
}

export async function getRecentAchievements({ apiKey, username, count = 50 }) {
  if (!apiKey || !username) {
    throw new Error('apiKey and username are required')
  }
  
  const params = new URLSearchParams()
  params.set('y', apiKey)
  params.set('u', username)
  params.set('c', String(count))
  
  const url = `${RA_BASE}/API_GetUserRecentAchievements.php?${params.toString()}`
  
  try {
    const { data } = await axios.get(url)
    return (data || []).map(achievement => ({
      date: achievement.Date,
      hardcoreMode: achievement.HardcoreMode,
      achievementId: achievement.AchievementID,
      title: achievement.Title,
      description: achievement.Description,
      badgeName: achievement.BadgeName,
      points: achievement.Points,
      author: achievement.Author,
      gameTitle: achievement.GameTitle,
      gameIcon: achievement.GameIcon,
      gameId: achievement.GameID,
      consoleName: achievement.ConsoleName,
      cumulScore: achievement.CumulScore
    }))
  } catch (error) {
    console.error('Failed to fetch recent achievements:', error)
    throw error
  }
}

// Helper function to extract game ID from internal game ID format (ra-consoleId-gameId)
export function extractGameIdFromInternalId(internalId) {
  if (!internalId || typeof internalId !== 'string') return null
  // Accept both legacy 'ra-<consoleId>-<gameId>' and new 'game:ra:<gameId>' formats
  if (internalId.startsWith('ra-')) {
    const parts = internalId.split('-')
    if (parts.length >= 3) return parseInt(parts[2])
    return null
  }
  if (internalId.startsWith('game:ra:')) {
    const n = parseInt(internalId.slice('game:ra:'.length), 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

// Helper function to check if a game has RetroAchievements support
export function hasRetroAchievementsSupport(game) {
  const id = game?.id || ''
  return typeof id === 'string' && (id.startsWith('ra-') || id.startsWith('game:ra:'))
}
