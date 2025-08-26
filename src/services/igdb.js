import axios from 'axios'
import * as Cache from './cache.js'

const PROXY = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

// IGDB platform ids (public knowledge from IGDB): PS1=7, PS2=8, PSP=38
const IGDB_PS_PLATFORMS = {
  'PlayStation': 7,
  'PlayStation 2': 8,
  'PlayStation Portable': 38
}

export async function fetchIGDBCover({ name, console }) {
  try {
    const platformId = IGDB_PS_PLATFORMS[console] || null
    const { data } = await axios.post(`${PROXY}/igdb/search`, { q: name, platformId })
    if (!data || !data.length) return null
    const first = data[0]
    if (!first.image_id) return null
    const size = 't_cover_big_2x' // crisp for overlays
    const url = `https://images.igdb.com/igdb/image/upload/${size}/${first.image_id}.jpg`
    const consoleName = console || (first.platform_name || 'PlayStation')
    const safeName = first.name.replace(/[\/:"*?<>|]+/g, '')
    const path = `cache/covers/${consoleName} - ${safeName}.jpg`
    const img = await axios.get(`${PROXY}/image?src=${encodeURIComponent(url)}`, { responseType: 'blob' })
    await Cache.saveCover(path, img.data)
    const release_year = first.first_release_date ? new Date(first.first_release_date * 1000).getUTCFullYear().toString() : null
    const publisher = first.publisher_name || null
    return { path, blob: img.data, release_year, publisher, matched_name: first.name }
  } catch (e) {
    console.warn('IGDB cover fetch failed', e?.message || e)
    return null
  }
}

export async function precacheCovers({ games, onProgress }) {
  // Concurrency-limited queue to fetch covers and save path+year back to each game
  const toFetch = games.filter(g => !g.image_url)
  let done = 0
  const limit = 3
  async function worker() {
    while (toFetch.length) {
      const g = toFetch.shift()
      const res = await fetchIGDBCover({ name: g.title, console: g.console })
      done++
      onProgress && onProgress({ done, total: toFetch.length + done, game: g, ok: !!res })
      if (res) {
        g.image_url = res.path
        if (!g.release_year && res.release_year) g.release_year = res.release_year
        if (!g.publisher && res.publisher) g.publisher = res.publisher
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return games
}
