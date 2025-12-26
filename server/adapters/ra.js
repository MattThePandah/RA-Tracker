import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { LIMITS } from '../config.js'
import { raLimiter } from '../util/raLimiter.js'
import { isPgEnabled, query } from '../db.js'

const RA_BASE = 'https://retroachievements.org/API'
const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const CONSOLE_CACHE_FILE = path.join(DATA_DIR, 'ra-console-cache.json')
const GAME_LIST_CACHE_DIR = path.join(DATA_DIR, 'ra-game-lists')
fs.mkdirSync(GAME_LIST_CACHE_DIR, { recursive: true })
const consoleCacheMs = Number(process.env.RA_CONSOLE_CACHE_MS || 6 * 60 * 60 * 1000)
const gameListCacheMs = Number(process.env.RA_GAME_LIST_CACHE_MS || 24 * 60 * 60 * 1000)
let raCacheReady = null

function raImageUrl(pathStr) {
  if (!pathStr) return null
  const s = String(pathStr).trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  const cleaned = s.replace(/^\/+/, '')
  const p = cleaned.toLowerCase().startsWith('images/') ? cleaned : `Images/${cleaned}`
  return `https://media.retroachievements.org/${p}`
}

function cacheFilePath(consoleId) {
  const safe = String(consoleId || '').replace(/[^a-z0-9_-]/gi, '_')
  return path.join(GAME_LIST_CACHE_DIR, `ra-${safe}.json`)
}

function readConsoleGameList(consoleId) {
  try {
    const file = cacheFilePath(consoleId)
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

function writeConsoleGameList(consoleId, data) {
  try {
    const file = cacheFilePath(consoleId)
    fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), data }, null, 2))
  } catch {}
}

async function ensureRaCacheTable() {
  if (!isPgEnabled()) return
  if (raCacheReady) return raCacheReady
  raCacheReady = query(`
    create table if not exists ra_game_list_cache (
      console_id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `)
  return raCacheReady
}

async function getDbCachedGameList(consoleId) {
  await ensureRaCacheTable()
  const result = await query(
    'select data, updated_at from ra_game_list_cache where console_id = $1',
    [consoleId]
  )
  const row = result.rows[0]
  if (!row) return null
  return { data: row.data, updatedAt: row.updated_at }
}

async function setDbCachedGameList(consoleId, data) {
  await ensureRaCacheTable()
  const payload = JSON.stringify(data ?? [])
  await query(
    `insert into ra_game_list_cache (console_id, data, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (console_id)
     do update set data = excluded.data, updated_at = now()`,
    [consoleId, payload]
  )
}

async function getCachedGameList(consoleId, allowStale = false) {
  if (isPgEnabled()) {
    const row = await getDbCachedGameList(consoleId)
    if (!row) return null
    const updatedAt = row.updatedAt ? new Date(row.updatedAt).getTime() : 0
    if (!allowStale && Date.now() - updatedAt > gameListCacheMs) return null
    return row.data || null
  }
  const entry = readConsoleGameList(consoleId)
  if (!entry) return null
  if (!allowStale && entry.ts && Date.now() - entry.ts > gameListCacheMs) return null
  return entry.data || null
}

async function setCachedGameList(consoleId, data) {
  if (isPgEnabled()) {
    await setDbCachedGameList(consoleId, data)
    return
  }
  writeConsoleGameList(consoleId, data)
}

async function raGet(url, { timeout = 60000 } = {}) {
  let attempt = 0
  let delay = 1000
  while (true) {
    try {
      const response = await raLimiter.schedule(() => axios.get(url, { timeout }))
      return response
    } catch (error) {
      const status = error?.response?.status
      if (status === 429 && attempt < LIMITS.RA_MAX_RETRIES) {
        const retry = Number(error?.response?.headers?.['retry-after'])
        const wait = retry ? retry * 1000 : delay
        await new Promise(r => setTimeout(r, wait))
        attempt++
        delay = Math.min(delay * 2, 10000)
        continue
      }
      throw error
    }
  }
}

function readConsoleCache() {
  try {
    if (!fs.existsSync(CONSOLE_CACHE_FILE)) return null
    const raw = fs.readFileSync(CONSOLE_CACHE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeConsoleCache(data) {
  try {
    fs.writeFileSync(CONSOLE_CACHE_FILE, JSON.stringify({ ts: Date.now(), data }, null, 2))
  } catch {}
}

export async function listConsoles({ apiKey, activeOnly = true, gameSystemsOnly = false }) {
  if (!apiKey) return []
  const params = new URLSearchParams()
  params.set('y', apiKey)
  if (activeOnly) params.set('a', 1)
  if (gameSystemsOnly) params.set('g', 1)
  const url = `${RA_BASE}/API_GetConsoleIDs.php?${params.toString()}`
  try {
    const cached = readConsoleCache()
    if (cached && cached.ts && Date.now() - cached.ts < consoleCacheMs) {
      return cached.data || []
    }
    const { data } = await raGet(url, { timeout: 15000 })
    if (!Array.isArray(data)) return []
    const mapped = data.map(x => ({
      id: `ra:${x.ID ?? x.id}`,
      name: x.Name ?? x.name,
      active: true,
    }))
    writeConsoleCache(mapped)
    return mapped
  } catch (e) {
    const cached = readConsoleCache()
    if (cached?.data?.length) {
      console.warn('RA listConsoles failed; using cached list:', e?.message || e)
      return cached.data
    }
    console.warn('RA listConsoles failed:', e?.message || e)
    return []
  }
}

export async function listGamesForConsole({ apiKey, consoleId, onlyWithAchievements = true, excludeNonGames = true, forceRefresh = false }) {
  if (!apiKey || !consoleId) return []
  const id = String(consoleId).startsWith('ra:') ? String(consoleId).slice(3) : String(consoleId)
  const params = new URLSearchParams()
  params.set('y', apiKey)
  params.set('i', id)
  if (onlyWithAchievements) params.set('f', 1)
  const url = `${RA_BASE}/API_GetGameList.php?${params.toString()}`
  try {
    if (!forceRefresh) {
      const cached = await getCachedGameList(id)
      if (cached) return cached
    }

    const { data } = await raGet(url, { timeout: 60000 })
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

    const mapped = arr.map(g => {
      const image_url = raImageUrl(g.ImageBoxArt) || null
      return {
        id: `game:ra:${g.ID || g.GameID || g.id}`,
        title: g.Title || g.GameTitle || g.title,
        console: { id: `ra:${id}`, name: g.ConsoleName || g.consoleName || '' },
        image_url,
        flags: { hasAchievements: true, hasCover: !!image_url, isBonus: false },
        sources: { ra: { gameId: Number(g.ID || g.GameID || g.id), consoleId: Number(id) } }
      }
    })
    await setCachedGameList(id, mapped)
    return mapped
  } catch (e) {
    const cached = await getCachedGameList(id, true)
    if (cached) {
      console.warn('RA listGamesForConsole failed; using cached list:', consoleId, e?.message || e)
      return cached
    }
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
