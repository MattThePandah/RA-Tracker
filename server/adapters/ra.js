import axios from 'axios'

const RA_BASE = 'https://retroachievements.org/API'

export async function listConsoles({ apiKey, activeOnly = true, gameSystemsOnly = false }) {
  if (!apiKey) return []
  const params = new URLSearchParams()
  params.set('y', apiKey)
  if (activeOnly) params.set('a', 1)
  if (gameSystemsOnly) params.set('g', 1)
  const url = `${RA_BASE}/API_GetConsoleIDs.php?${params.toString()}`
  try {
    const { data } = await axios.get(url)
    if (!Array.isArray(data)) return []
    return data.map(x => ({
      id: `ra:${x.ID ?? x.id}`,
      name: x.Name ?? x.name,
      active: true,
    }))
  } catch (e) {
    console.warn('RA listConsoles failed:', e?.message || e)
    return []
  }
}

export async function listGamesForConsole({ apiKey, consoleId, onlyWithAchievements = true, excludeNonGames = true }) {
  if (!apiKey || !consoleId) return []
  const id = String(consoleId).startsWith('ra:') ? String(consoleId).slice(3) : String(consoleId)
  const params = new URLSearchParams()
  params.set('y', apiKey)
  params.set('i', id)
  if (onlyWithAchievements) params.set('f', 1)
  const url = `${RA_BASE}/API_GetGameList.php?${params.toString()}`
  try {
    const { data } = await axios.get(url, { timeout: 60000 })
    let arr = Array.isArray(data) ? data : []

    // Heuristic filter to drop RA event hubs or non-game entries
    if (excludeNonGames) {
      const looksLikeEvent = (g) => {
        const name = String(g.ConsoleName || g.consoleName || '').toLowerCase()
        const title = String(g.Title || g.GameTitle || g.title || '').toLowerCase()
        if (name.includes('event')) return true
        if (title.includes('achievement of the week')) return true
        if (title.includes('aotw')) return true
        if (title.includes('[event]')) return true
        if (title.includes('(event)')) return true
        if (title.includes('devquest')) return true
        return false
      }
      arr = arr.filter(g => !looksLikeEvent(g))
    }

    return arr.map(g => ({
      id: `game:ra:${g.ID || g.GameID || g.id}`,
      title: g.Title || g.GameTitle || g.title,
      console: { id: `ra:${id}`, name: g.ConsoleName || g.consoleName || '' },
      flags: { hasAchievements: true, hasCover: false, isBonus: false },
      sources: { ra: { gameId: Number(g.ID || g.GameID || g.id), consoleId: Number(id) } },
    }))
  } catch (e) {
    console.warn('RA listGamesForConsole failed:', consoleId, e?.message || e)
    return []
  }
}

export function extractRaGameId(gameId) {
  if (!gameId) return null
  const s = String(gameId)
  if (s.startsWith('game:ra:')) return Number(s.slice(8))
  if (s.startsWith('ra-')) return Number(s.split('-')[2])
  return Number(s)
}
