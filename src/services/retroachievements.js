import axios from 'axios'

const RA_BASE = 'https://retroachievements.org/API'

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
            image_url: null,
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
