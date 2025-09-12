import axios from 'axios'
import { LIMITS } from '../config.js'
import { RateLimiter } from '../util/rateLimiter.js'

let cachedToken = null
let tokenExp = 0
const searchCache = new Map()
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
const limiter = new RateLimiter({ rps: LIMITS.IGDB_RPS, maxConcurrent: LIMITS.IGDB_MAX_CONCURRENCY, name: 'igdb' })

async function getToken() {
  const now = Date.now()
  if (cachedToken && now < tokenExp - 60_000) return cachedToken
  const { data } = await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
    params: {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    }
  })
  cachedToken = data.access_token
  tokenExp = now + (data.expires_in * 1000)
  return cachedToken
}

export async function searchGames({ q, platformIds = [] }) {
  if (!q) return []
  const key = `${String(q).toLowerCase()}|${(platformIds||[]).join(',')}`
  const now = Date.now()
  const cached = searchCache.get(key)
  if (cached && (now - cached.ts) < CACHE_TTL_MS) return cached.data

  const token = await getToken()
  const headers = {
    'Client-ID': process.env.TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${token}`,
  }
  const where = Array.isArray(platformIds) && platformIds.length
    ? `where platforms = (${platformIds.join(',')});`
    : ''
  const safe = String(q).replace(/\"/g, '')
  const body = `fields name,cover.image_id,first_release_date,platforms.name,involved_companies.company.name,involved_companies.publisher; search \"${safe}\"; ${where} limit 5;`

  async function doRequest() {
    let attempt = 0
    let delay = 800
    while (true) {
      try {
        const { data } = await axios.post('https://api.igdb.com/v4/games', body, { headers })
        return data
      } catch (e) {
        const status = e?.response?.status
        if (status === 429 && attempt < LIMITS.IGDB_MAX_RETRIES) {
          const ra = Number(e?.response?.headers?.['retry-after'])
          const wait = ra ? (Number(ra) * 1000) : delay
          await new Promise(r => setTimeout(r, wait))
          attempt++
          delay = Math.min(delay * 2, 8000)
          continue
        }
        throw e
      }
    }
  }

  const data = await limiter.schedule(() => doRequest())
  const mapped = (data || []).map(g => {
    let publisher_name = null
    try {
      const ics = Array.isArray(g.involved_companies) ? g.involved_companies : []
      const pub = ics.find(ic => ic && ic.publisher && ic.company && ic.company.name)
      if (pub && pub.company && pub.company.name) publisher_name = pub.company.name
      if (!publisher_name && ics.length) {
        const firstCo = ics.find(ic => ic && ic.company && ic.company.name)
        if (firstCo && firstCo.company && firstCo.company.name) publisher_name = firstCo.company.name
      }
    } catch {}
    return ({
      id: g.id,
      name: g.name,
      image_id: g.cover?.image_id || null,
      platform_name: (g.platforms && g.platforms[0]?.name) || null,
      first_release_date: g.first_release_date || null,
      publisher_name
    })
  })
  searchCache.set(key, { ts: now, data: mapped })
  return mapped
}

export function coverUrlFromImageId(imageId, size = 't_cover_big_2x') {
  if (!imageId) return null
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`
}

