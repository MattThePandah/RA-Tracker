export async function listGames({ base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787', consoleId = 'All', q = '', hasAchievements = true, hasCover = false, limit = 500 } = {}) {
  const params = new URLSearchParams()
  if (consoleId) params.set('consoleId', consoleId)
  if (q) params.set('q', q)
  if (hasAchievements) params.set('hasAchievements', '1')
  if (hasCover) params.set('hasCover', '1')
  params.set('limit', String(limit))

  const first = await fetch(`${base}/api/games?${params.toString()}`)
  if (!first.ok) throw new Error(`games_list_failed: ${first.status}`)
  const head = await first.json()

  const total = head.total || 0
  const out = [...(head.games || [])]
  let offset = (head.offset || 0) + (head.games?.length || 0)
  while (offset < total) {
    params.set('offset', String(offset))
    const r = await fetch(`${base}/api/games?${params.toString()}`)
    if (!r.ok) break
    const page = await r.json()
    out.push(...(page.games || []))
    offset += (page.games?.length || 0)
    if (!(page.games?.length)) break
  }

  return out.map(g => normalizeGame(g))
}

export function normalizeGame(g) {
  // Map server DTO → UI shape for backward compatibility
  const consoleName = g.console?.name || g.console || ''
  const imageUrl = g.cover?.localPath || g.cover?.originalUrl || g.image_url || null
  return {
    id: g.id,
    title: g.title,
    console: consoleName,
    image_url: imageUrl,
    release_year: g.releaseYear || g.release_year || null,
    publisher: g.publisher || null,
    status: g.status || 'Not Started',
    date_started: g.date_started || null,
    date_finished: g.date_finished || null,
    completion_time: g.completion_time || null,
    rating: g.rating || null,
    notes: g.notes || '',
    is_bonus: g.flags?.isBonus || g.is_bonus || false,
  }
}

