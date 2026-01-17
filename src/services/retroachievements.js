import axios from 'axios'
import { buildOverlayUrl } from '../utils/overlayApi.js'
import { isSubsetTitle } from '../utils/subsetDetection.js'

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

function normalizeSubsetId(value) {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s || s === '0') return null
  return s
}

function normalizeSubsetTitle(value) {
  const s = String(value ?? '').trim()
  return s || ''
}

function extractSubsetEntries(raw) {
  if (!raw || typeof raw !== 'object') return []
  const arr = Array.isArray(raw) ? raw : Object.values(raw)
  const subsets = []
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue
    const id = normalizeSubsetId(
      entry.ID ?? entry.Id ?? entry.id ??
      entry.SubsetID ?? entry.SubsetId ?? entry.subsetId ??
      entry.GameID ?? entry.GameId ?? entry.gameId ??
      entry.AchievementSetID ?? entry.AchievementSetId ?? entry.achievementSetId ??
      null
    )
    const title = normalizeSubsetTitle(
      entry.Title ?? entry.title ??
      entry.Name ?? entry.name ??
      entry.SubsetTitle ?? entry.subsetTitle ??
      entry.AchievementSetTitle ?? entry.achievementSetTitle ??
      ''
    )
    if (!id && !title) continue
    subsets.push({
      id: id || title,
      title: title || (id ? `Subset ${id}` : 'Subset'),
      raw: entry
    })
  }
  return subsets
}

function extractAchievementSets(data) {
  if (!data || typeof data !== 'object') return []
  const raw = data.AchievementSets ?? data.achievementSets ?? data.AchievementSet ?? data.achievementSet
  if (!raw || typeof raw !== 'object') return []
  const arr = Array.isArray(raw) ? raw : Object.values(raw)
  return arr.filter(set => set && typeof set === 'object' && (set.Achievements || set.achievements))
}

function isCoreAchievementSet(set, gameTitle) {
  if (!set || typeof set !== 'object') return false
  if (set.IsCore === true || set.isCore === true) return true
  const type = String(set.Type ?? set.type ?? '').toLowerCase()
  if (type === 'core') return true
  const title = normalizeSubsetTitle(set.Title ?? set.title ?? set.Name ?? set.name ?? '')
  if (title && gameTitle && title.toLowerCase() === String(gameTitle).toLowerCase()) return true
  return false
}

function extractSubsetsFromGameData(data) {
  const subsets = []
  const seen = new Set()

  const direct = data?.Subsets ?? data?.subsets ?? data?.AchievementSubsets ?? data?.achievementSubsets
  for (const entry of extractSubsetEntries(direct)) {
    const key = String(entry.id)
    if (seen.has(key)) continue
    seen.add(key)
    subsets.push(entry)
  }

  const sets = extractAchievementSets(data)
  for (const set of sets) {
    if (isCoreAchievementSet(set, data?.Title ?? data?.title ?? '')) continue
    const id = normalizeSubsetId(set.SubsetID ?? set.SubsetId ?? set.subsetId ?? set.ID ?? set.id ?? set.AchievementSetID ?? set.achievementSetId ?? null)
    const title = normalizeSubsetTitle(set.Title ?? set.title ?? set.Name ?? set.name ?? set.SubsetTitle ?? set.subsetTitle ?? '')
    if (!id && !title) continue
    const key = String(id || title)
    if (seen.has(key)) continue
    seen.add(key)
    subsets.push({
      id: id || title,
      title: title || (id ? `Subset ${id}` : 'Subset'),
      raw: set
    })
  }

  return subsets
}

function inferSubsetsFromAchievements(achievements = []) {
  const map = new Map()
  for (const ach of achievements) {
    const subsetId = normalizeSubsetId(ach?.subsetId)
    if (!subsetId) continue
    const title = normalizeSubsetTitle(ach?.subsetTitle ?? '')
    if (!map.has(subsetId)) {
      map.set(subsetId, {
        id: subsetId,
        title: title || `Subset ${subsetId}`
      })
    } else if (title && !map.get(subsetId).title) {
      map.get(subsetId).title = title
    }
  }
  return Array.from(map.values())
}

function mapAchievement(achievement, { subsetId: subsetIdOverride = null, subsetTitle: subsetTitleOverride = null, subsetTitleById = null } = {}) {
  const subsetIdFromAch = normalizeSubsetId(
    achievement.SubsetID ?? achievement.SubsetId ?? achievement.subsetId ??
    achievement.Subset ?? achievement.subset ??
    achievement.AchievementSetID ?? achievement.achievementSetId ??
    null
  )
  let subsetId = subsetIdOverride ?? subsetIdFromAch ?? null
  let subsetTitle = subsetTitleOverride ?? normalizeSubsetTitle(
    achievement.SubsetTitle ?? achievement.SubsetName ??
    achievement.subsetTitle ?? achievement.subsetName ??
    achievement.Subset ?? achievement.subset ??
    ''
  )
  if (!subsetTitle && subsetId && subsetTitleById) {
    subsetTitle = subsetTitleById.get(String(subsetId)) || ''
  }
  if (!subsetId && subsetTitle) {
    subsetId = subsetTitle
  }

  return {
    id: achievement.ID ?? achievement.AchievementID ?? achievement.id,
    title: achievement.Title ?? achievement.title,
    description: achievement.Description ?? achievement.description,
    points: achievement.Points ?? achievement.points,
    badgeName: achievement.BadgeName ?? achievement.badgeName,
    displayOrder: achievement.DisplayOrder ?? achievement.displayOrder,
    dateEarned: achievement.DateEarned ?? achievement.dateEarned,
    dateEarnedHardcore: achievement.DateEarnedHardcore ?? achievement.dateEarnedHardcore,
    isEarned: !!(achievement.DateEarned ?? achievement.dateEarned),
    isEarnedHardcore: !!(achievement.DateEarnedHardcore ?? achievement.dateEarnedHardcore),
    subsetId: subsetId ? String(subsetId) : null,
    subsetTitle: subsetTitle || null
  }
}

async function fetchGameInfoRaw({ apiKey, username, gameId }) {
  if (!apiKey || !username || !gameId) {
    throw new Error('apiKey, username, and gameId are required')
  }

  const proxyBase = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
  const url = buildOverlayUrl(`/api/retroachievements/game/${gameId}`, proxyBase)
  const params = new URLSearchParams()
  params.set('username', username)
  params.set('apiKey', apiKey)

  const config = {
    timeout: 15000,
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
  return data
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
          if (isSubsetTitle(title)) continue
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
  
  try {
    const data = await fetchGameInfoRaw({ apiKey, username, gameId })
    const subsets = extractSubsetsFromGameData(data)
    const subsetTitleById = new Map(subsets.map(s => [String(s.id), s.title]))
    const setEntries = extractAchievementSets(data)

    const achievements = []
    if (setEntries.length) {
      for (const set of setEntries) {
        const setTitle = normalizeSubsetTitle(set.Title ?? set.title ?? set.Name ?? set.name ?? '')
        const core = isCoreAchievementSet(set, data?.Title ?? data?.title ?? '')
        const subsetId = core ? null : normalizeSubsetId(
          set.SubsetID ?? set.SubsetId ?? set.subsetId ??
          set.ID ?? set.Id ?? set.id ??
          set.AchievementSetID ?? set.AchievementSetId ?? set.achievementSetId ??
          null
        )
        const subsetTitle = core ? null : (setTitle || (subsetId ? subsetTitleById.get(String(subsetId)) : '') || null)
        const achList = Object.values(set.Achievements || set.achievements || {})
        for (const ach of achList) {
          achievements.push(mapAchievement(ach, { subsetId, subsetTitle, subsetTitleById }))
        }
      }
    }

    if (!achievements.length) {
      const achList = Object.values(data.Achievements || {})
      for (const ach of achList) {
        achievements.push(mapAchievement(ach, { subsetTitleById }))
      }
    }

    const inferredSubsets = inferSubsetsFromAchievements(achievements)
    const mergedSubsets = (() => {
      if (!inferredSubsets.length) return subsets
      const merged = [...subsets]
      const seen = new Set(subsets.map(s => String(s.id)))
      for (const entry of inferredSubsets) {
        const key = String(entry.id)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(entry)
      }
      return merged
    })()

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
      achievements,
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
      },
      subsets: mergedSubsets
    }
  } catch (error) {
    console.error('Failed to fetch game info and user progress:', error)
    throw error
  }
}

export async function getGameSubsets({ apiKey, username, gameId }) {
  const result = await getGameInfoAndUserProgress({ apiKey, username, gameId })
  return result.subsets || []
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

export async function getRecentAchievements({ apiKey, username, count = 50, signal }) {
  if (!apiKey || !username) {
    throw new Error('apiKey and username are required')
  }
  
  const proxyBase = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
  const url = buildOverlayUrl('/api/retroachievements/recent', proxyBase)
  const params = new URLSearchParams()
  params.set('username', username)
  params.set('apiKey', apiKey)
  params.set('count', String(count))
  
  try {
    const requestUrl = new URL(url)
    for (const [key, value] of params.entries()) {
      requestUrl.searchParams.set(key, value)
    }
    const config = {
      timeout: 15000,
      withCredentials: true
    }
    if (signal) config.signal = signal
    const { data } = await axios.get(requestUrl.toString(), config)
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

export async function getUserProfile({ apiKey, username, signal }) {
  if (!apiKey || !username) {
    throw new Error('apiKey and username are required')
  }

  const proxyBase = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
  const url = buildOverlayUrl('/api/retroachievements/profile', proxyBase)
  const params = new URLSearchParams()
  params.set('username', username)
  params.set('apiKey', apiKey)

  const requestUrl = new URL(url)
  for (const [key, value] of params.entries()) {
    requestUrl.searchParams.set(key, value)
  }

  const config = {
    timeout: 15000,
    withCredentials: true
  }
  if (signal) config.signal = signal

  const { data } = await axios.get(requestUrl.toString(), config)

  // Normalize key fields we care about while preserving raw response
  return {
    username: data?.User || data?.Username || username,
    totalPoints: Number(data?.TotalPoints ?? data?.Points ?? 0),
    softcorePoints: Number(data?.TotalSoftcorePoints ?? data?.SoftcorePoints ?? 0),
    raw: data || null
  }
}

export async function getRecentlyPlayedGames({ apiKey, username, count = 1, signal }) {
  if (!apiKey || !username) {
    throw new Error('apiKey and username are required')
  }

  const proxyBase = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
  const url = buildOverlayUrl('/api/retroachievements/recently-played', proxyBase)
  const params = new URLSearchParams()
  params.set('username', username)
  params.set('apiKey', apiKey)
  params.set('count', String(count))

  const requestUrl = new URL(url)
  for (const [key, value] of params.entries()) {
    requestUrl.searchParams.set(key, value)
  }

  const config = {
    timeout: 15000,
    withCredentials: true
  }
  if (signal) config.signal = signal

  const { data } = await axios.get(requestUrl.toString(), config)
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' ? Object.values(data) : [])
  return list.map(item => ({
    id: Number(item?.ID ?? item?.GameID ?? item?.GameId),
    title: item?.Title ?? item?.GameTitle ?? '',
    consoleId: Number(item?.ConsoleID ?? item?.ConsoleId),
    consoleName: item?.ConsoleName ?? '',
    lastPlayed: item?.LastPlayed ?? item?.DateLastPlayed ?? null
  })).filter(x => Number.isFinite(x.id) && x.id > 0)
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
