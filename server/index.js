import { config } from 'dotenv'
config({ path: './server/.env' })
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const app = express()
app.use(cors())
// Keep default body limit small to discourage huge payloads
app.use(express.json())

let cachedToken = null
let tokenExp = 0
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

app.post('/igdb/search', async (req, res) => {
  try {
    const q = String(req.body.q || '').trim()
    const platformId = req.body.platformId || null
    if (!q) return res.json([])
    const token = await getToken()
    const headers = {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    }
    // Prefer platform match; request cover image_id, first_release_date, and publisher via involved_companies
    const where = platformId ? `where platforms = (${platformId});` : ''
    const body = `fields name,cover.image_id,first_release_date,platforms.name,involved_companies.company.name,involved_companies.publisher; search "${q.replace('"','')}"; ${where} limit 5;`
    const { data } = await axios.post('https://api.igdb.com/v4/games', body, { headers })
    const mapped = data.map(g => {
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
    res.json(mapped)
  } catch (e) {
    console.error(e.response?.data || e.message)
    res.status(500).json({ error: 'IGDB search failed' })
  }
})

app.get('/image', async (req, res) => {
  try {
    const src = req.query.src
    if (!src) return res.status(400).send('src required')
    const response = await axios.get(src, { responseType: 'arraybuffer' })
    const contentType = response.headers['content-type'] || 'image/jpeg'
    res.set('Content-Type', contentType)
    res.send(Buffer.from(response.data, 'binary'))
  } catch (e) {
    res.status(500).send('image fetch failed')
  }
})

// Minimal in-memory overlay state for OBS Browser Source
const overlayState = { current: null, updatedAt: Date.now() }

// Simple JSON persistence for resilience across server restarts
const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const TIMERS_FILE = path.join(DATA_DIR, 'timers.json')
const CURRENT_FILE = path.join(DATA_DIR, 'overlay-current.json')
const STATS_FILE = path.join(DATA_DIR, 'overlay-stats.json')

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw)
  } catch { return fallback }
}
function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch {}
}

// Load persisted states if present
try {
  const persistedCurrent = loadJSON(CURRENT_FILE, null)
  if (persistedCurrent && typeof persistedCurrent === 'object') {
    overlayState.current = persistedCurrent.current || null
    overlayState.updatedAt = persistedCurrent.updatedAt || Date.now()
  }
} catch {}

// Deprecated: kept for backward compat, but returns minimal data
app.get('/overlay/state', (req, res) => {
  res.json({ games: [], currentGameId: overlayState.current?.id || null, updatedAt: overlayState.updatedAt })
})
// Deprecated: accept but ignore large game arrays to avoid bloating overlay memory
app.post('/overlay/state', (req, res) => {
  const { currentGameId } = req.body || {}
  if (typeof currentGameId === 'string' || currentGameId === null) {
    if (overlayState.current && overlayState.current.id !== currentGameId) {
      overlayState.current = { id: currentGameId }
    }
    overlayState.updatedAt = Date.now()
  }
  res.json({ ok: true, updatedAt: overlayState.updatedAt })
})

// New minimal current endpoint (preferred)
app.get('/overlay/current', (req, res) => {
  res.json({ current: overlayState.current, updatedAt: overlayState.updatedAt })
})
app.post('/overlay/current', (req, res) => {
  const g = req.body?.current
  if (g === null) {
    overlayState.current = null
    overlayState.updatedAt = Date.now()
    saveJSON(CURRENT_FILE, { current: overlayState.current, updatedAt: overlayState.updatedAt })
    return res.json({ ok: true, updatedAt: overlayState.updatedAt })
  }
  if (!g || typeof g !== 'object') return res.status(400).json({ error: 'current game object required' })
  // Keep only the fields the overlay needs
  const current = {
    id: String(g.id || ''),
    title: g.title || '',
    console: g.console || '',
    image_url: g.image_url || null,
    release_year: g.release_year || null,
    publisher: g.publisher || null,
    status: g.status || null
  }
  overlayState.current = current
  overlayState.updatedAt = Date.now()
  saveJSON(CURRENT_FILE, { current: overlayState.current, updatedAt: overlayState.updatedAt })
  res.json({ ok: true, updatedAt: overlayState.updatedAt })
})

// Local disk cover caching so OBS doesn't depend on browser caches
const COVERS_DIR = process.env.COVERS_DIR || path.join(process.cwd(), 'covers')
fs.mkdirSync(COVERS_DIR, { recursive: true })
function hash(str) { return crypto.createHash('sha1').update(String(str)).digest('hex') }
function coverPathFor(url) { 
  const ext = url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'
  return path.join(COVERS_DIR, `${hash(url)}${ext}`) 
}

// Serve cached covers statically
app.use('/covers', express.static(COVERS_DIR))

// Local-first cover endpoint. If cached file exists, serve it. Otherwise fetch, cache, and serve.
app.get('/cover', async (req, res) => {
  try {
    const src = req.query.src
    if (!src) return res.status(400).send('src required')
    const file = coverPathFor(src)
    if (fs.existsSync(file)) {
      return res.sendFile(file)
    }
    const response = await axios.get(src, { responseType: 'arraybuffer' })
    const buf = Buffer.from(response.data, 'binary')
    try { fs.writeFileSync(file, buf) } catch {}
    const contentType = response.headers['content-type'] || 'image/jpeg'
    res.set('Content-Type', contentType)
    res.send(buf)
  } catch (e) {
    res.status(500).send('cover fetch failed')
  }
})

// Bulk prefetch: POST { urls: string[] }
app.post('/covers/prefetch', async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : []
  const limit = Number(req.body?.concurrency) || 8
  let ok = 0, skipped = 0, failed = 0
  async function fetchOne(url) {
    const file = coverPathFor(url)
    if (fs.existsSync(file)) { skipped++; return }
    try {
      const r = await axios.get(url, { responseType: 'arraybuffer' })
      fs.writeFileSync(file, Buffer.from(r.data, 'binary'))
      ok++
    } catch { failed++ }
  }
  const q = urls.slice()
  const workers = Array.from({ length: Math.min(limit, q.length || 1) }).map(async () => {
    while (q.length) { await fetchOne(q.shift()) }
  })
  await Promise.all(workers)
  res.json({ ok, skipped, failed, total: urls.length, dir: COVERS_DIR })
})

// Smart game sampling for roulette wheel (max 16 slots for performance)
app.post('/api/sample-games', (req, res) => {
  try {
    const { games, filters = {}, sampleSize = 16 } = req.body
    if (!Array.isArray(games)) {
      return res.status(400).json({ error: 'games array required' })
    }
    
    let filtered = games
    
    // Apply filters
    if (filters.console && filters.console !== 'All') {
      filtered = filtered.filter(g => g.console === filters.console)
    }
    if (filters.status && filters.status !== 'All') {
      filtered = filtered.filter(g => g.status === filters.status)
    }
    if (filters.search) {
      const search = filters.search.toLowerCase()
      filtered = filtered.filter(g => g.title.toLowerCase().includes(search))
    }
    if (filters.hasCovers) {
      filtered = filtered.filter(g => g.image_url)
    }
    
    // Random sample from filtered pool
    const sample = []
    const pool = [...filtered] // Copy so we don't mutate original
    const targetSize = Math.min(sampleSize, pool.length)
    
    for (let i = 0; i < targetSize; i++) {
      const randomIdx = Math.floor(Math.random() * pool.length)
      sample.push(pool.splice(randomIdx, 1)[0])
    }
    
    // Pad with nulls if we don't have enough games (for consistent 16 slots)
    while (sample.length < sampleSize) {
      sample.push(null)
    }
    
    res.json({
      sample,
      poolSize: filtered.length,
      totalGames: games.length,
      appliedFilters: filters
    })
  } catch (e) {
    console.error('Sample games error:', e)
    res.status(500).json({ error: 'Failed to sample games' })
  }
})

// Wheel spin sync so OBS overlay can mirror app spins  
let overlaySpin = { ts: 0, sample: [], targetIdx: 0, durationMs: 9000, poolSize: 0 }
app.get('/overlay/spin', (req, res) => {
  res.json(overlaySpin)
})
app.post('/overlay/spin', (req, res) => {
  const { sample, targetIdx, durationMs, poolSize } = req.body || {}
  if (!Array.isArray(sample) || typeof targetIdx !== 'number') {
    return res.status(400).json({ error: 'sample[] and targetIdx required' })
  }
  overlaySpin = { 
    ts: Date.now(), 
    sample, 
    targetIdx, 
    durationMs: Number(durationMs) || 9000,
    poolSize: poolSize || 0
  }
  res.json({ ok: true, ts: overlaySpin.ts })
})

// Allow setting wheel sample without triggering a spin (for idle overlay view)
app.get('/overlay/wheel-state', (req, res) => {
  res.json({ sample: overlaySpin.sample || [], poolSize: overlaySpin.poolSize || 0 })
})
app.post('/overlay/wheel-state', (req, res) => {
  const { sample, poolSize } = req.body || {}
  if (!Array.isArray(sample)) return res.status(400).json({ error: 'sample[] required' })
  overlaySpin.sample = sample
  overlaySpin.poolSize = Number(poolSize) || 0
  // Do not update ts here; avoids unintended spins in overlay
  res.json({ ok: true })
})

// Lightweight overlay stats (counts only) to avoid big payloads
let overlayStats = loadJSON(STATS_FILE, { total: 0, completed: 0, percent: 0, updatedAt: 0 })
app.get('/overlay/stats', (req, res) => {
  res.json(overlayStats)
})
app.post('/overlay/stats', (req, res) => {
  const total = Number(req.body?.total) || 0
  const completed = Number(req.body?.completed) || 0
  const percent = total ? Math.round((completed / total) * 100) : 0
  overlayStats = { total, completed, percent, updatedAt: Date.now() }
  saveJSON(STATS_FILE, overlayStats)
  res.json({ ok: true, updatedAt: overlayStats.updatedAt })
})

// Timer state for overlays (server-calculated to avoid OBS Browser Source freezing)
// New model: accumulate only while current timer is running.
let timerState = {
  // Control
  running: false,
  currentGameId: null,

  // Current game tracking
  currentStartedAt: null, // ms
  perGame: {}, // id -> accumulatedSec

  // PSFest tracking (total time while current timer was running)
  psfestAccumulatedSec: 0,

  // Legacy compatibility fields (nullable)
  psfestStartTime: null,
  currentGameStartTime: null,

  updatedAt: Date.now(),
}

// Load persisted timer state if available
try {
  const persistedTimers = loadJSON(TIMERS_FILE, null)
  if (persistedTimers && typeof persistedTimers === 'object') {
    timerState = { ...timerState, ...persistedTimers }
    // Migrate legacy single current accumulator to perGame map
    if (!timerState.perGame) timerState.perGame = {}
    if (typeof persistedTimers.currentAccumulatedSec === 'number' && persistedTimers.currentGameId) {
      timerState.perGame[persistedTimers.currentGameId] = (timerState.perGame[persistedTimers.currentGameId] || 0) + persistedTimers.currentAccumulatedSec
      delete timerState.currentAccumulatedSec
    }
    // If we were running before restart, resume from now to avoid counting downtime twice
    if (timerState.running) {
      timerState.currentStartedAt = Date.now()
    }
  }
} catch {}

app.get('/overlay/timers', (req, res) => {
  const now = Date.now()

  // Migrate from legacy fields once if present
  if ((timerState.psfestStartTime || timerState.currentGameStartTime) && !timerState._migrated) {
    // If legacy start times were provided, assume running since those times.
    if (timerState.currentGameStartTime) {
      timerState.running = true
      timerState.currentStartedAt = new Date(timerState.currentGameStartTime).getTime()
    }
    if (timerState.psfestStartTime) {
      // We cannot know the pause intervals; approximate by setting accumulated as time since start if running,
      // otherwise store zero. Future controls will manage accumulation precisely.
      const since = Math.max(0, Math.floor((now - new Date(timerState.psfestStartTime).getTime()) / 1000))
      timerState.psfestAccumulatedSec = since
    }
    timerState._migrated = true
  }

  // Compute current timers with accumulation model
  const running = !!timerState.running
  const baseAccum = (timerState.currentGameId && timerState.perGame[timerState.currentGameId]) || 0
  let currentElapsed = baseAccum
  let psfestElapsed = timerState.psfestAccumulatedSec
  if (running && timerState.currentStartedAt) {
    const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
    currentElapsed += Math.max(0, deltaSec)
    psfestElapsed += Math.max(0, deltaSec)
  }

  const currentGameTime = formatTime(Math.max(0, currentElapsed))
  const psfestTime = formatTime(Math.max(0, psfestElapsed), true)

  res.json({
    currentGameTime,
    psfestTime,
    currentGameId: timerState.currentGameId,
    running,
    updatedAt: now,
  })
})

app.post('/overlay/timers', (req, res) => {
  const now = Date.now()
  const body = req.body || {}

  function settleCurrent() {
    if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
      const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
      if (deltaSec > 0) {
        const gid = timerState.currentGameId
        timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
        timerState.psfestAccumulatedSec += deltaSec
      }
    }
  }

  // Back-compat support (legacy fields)
  if ('psfestStartTime' in body || 'currentGameStartTime' in body || 'currentGameId' in body) {
    if (body.currentGameId !== undefined && body.currentGameId !== timerState.currentGameId) {
      // On game change, settle previous game's elapsed and switch focus
      settleCurrent()
      timerState.currentGameId = body.currentGameId
      if (timerState.running && timerState.currentGameId) timerState.currentStartedAt = now
      else {
        timerState.currentStartedAt = null
        if (!timerState.currentGameId) timerState.running = false
      }
    }
    if (body.currentGameStartTime !== undefined) {
      timerState.running = !!body.currentGameStartTime
      timerState.currentStartedAt = body.currentGameStartTime ? new Date(body.currentGameStartTime).getTime() : null
    }
    if (body.psfestStartTime !== undefined) {
      // Approximate psfest accumulated; if start provided, set baseline to elapsed since then
      timerState.psfestAccumulatedSec = body.psfestStartTime ? Math.max(0, Math.floor((now - new Date(body.psfestStartTime).getTime()) / 1000)) : 0
    }
  }

  // New controls
  if (body.running === true && !timerState.running) {
    // Start/resume
    timerState.running = true
    timerState.currentStartedAt = now
  }
  if (body.running === false && timerState.running) {
    // Pause
    settleCurrent()
    timerState.running = false
    timerState.currentStartedAt = null
  }
  if (body.resetCurrent) {
    const gid = timerState.currentGameId
    if (gid) timerState.perGame[gid] = 0
    if (timerState.running) timerState.currentStartedAt = now
  }
  if (body.resetPSFest) {
    timerState.psfestAccumulatedSec = 0
  }
  if (body.currentGameId !== undefined && body.currentGameId !== timerState.currentGameId) {
    // Explicit game change
    settleCurrent()
    timerState.currentGameId = body.currentGameId
    if (timerState.running && timerState.currentGameId) timerState.currentStartedAt = now
    else {
      timerState.currentStartedAt = null
      if (!timerState.currentGameId) timerState.running = false
    }
  }

  timerState.updatedAt = now
  // Persist
  saveJSON(TIMERS_FILE, timerState)
  res.json({ ok: true, updatedAt: timerState.updatedAt, running: timerState.running })
})

function formatTime(seconds, longHours = false) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  const hourStr = longHours && hours >= 100 ? 
    hours.toString().padStart(3, '0') : 
    hours.toString().padStart(2, '0')
  
  return `${hourStr}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Authoritative wheel spin orchestration
// Body: { pool: Game[], slotCount?: number, durationMs?: number, turns?: number }
app.post('/wheel/spin', (req, res) => {
  try {
    const slotCount = Math.min(Number(req.body?.slotCount) || 16, 32)
    const durationMs = Math.max(1500, Math.min(Number(req.body?.durationMs) || 3800, 20000))
    const turns = Math.max(3, Math.min(Number(req.body?.turns) || 10, 30))
    let sample = []
    let poolSize = 0
    
    if (Array.isArray(req.body?.sample) && req.body.sample.length) {
      // Client provided sample of games (preferred: minimal payload)
      sample = req.body.sample.slice(0, slotCount)
      while (sample.length < slotCount) sample.push(null)
      poolSize = Number(req.body?.poolSize) || req.body.sample.filter(Boolean).length
    } else {
      const pool = Array.isArray(req.body?.pool) ? req.body.pool : []
      if (!pool.length) return res.status(400).json({ error: 'pool[] or sample[] required' })
      poolSize = pool.length
      // Sample without replacement
      const poolCopy = pool.slice()
      const targetSize = Math.min(slotCount, poolCopy.length)
      for (let i = 0; i < targetSize; i++) {
        const idx = Math.floor(Math.random() * poolCopy.length)
        sample.push(poolCopy.splice(idx, 1)[0])
      }
      while (sample.length < slotCount) sample.push(null)
    }

    const validSlots = sample.map((g, i) => (g ? i : null)).filter(i => i != null)
    if (!validSlots.length) return res.status(400).json({ error: 'no valid games in sample' })
    const targetIdx = validSlots[Math.floor(Math.random() * validSlots.length)]

    // Publish to overlay state for OBS
    const sampleHash = sample.map(g => (g ? String(g.id) : '-')).join('|')
    overlaySpin = {
      ts: Date.now(),
      sample,
      targetIdx,
      durationMs,
      poolSize,
      turns,
      sampleHash
    }

    res.json(overlaySpin)
  } catch (e) {
    console.error('wheel/spin error', e)
    res.status(500).json({ error: 'failed to start spin' })
  }
})

// RetroAchievements API proxy to avoid CORS and manage rate limiting
app.get('/api/retroachievements/game/:gameId', async (req, res) => {
  try {
    const gameId = req.params.gameId
    const username = req.query.username || process.env.RA_USERNAME
    const apiKey = req.query.apiKey || process.env.RA_API_KEY
    
    if (!gameId || !username || !apiKey) {
      return res.status(400).json({ error: 'gameId, username, and apiKey required' })
    }
    
    const params = new URLSearchParams()
    params.set('y', apiKey)
    params.set('u', username)
    params.set('g', gameId)
    params.set('a', '1') // Include awards
    
    const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params.toString()}`
    
    const response = await axios.get(url)
    res.json(response.data)
  } catch (error) {
    console.error('RetroAchievements API error:', error.message)
    if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limited by RetroAchievements API' })
    } else {
      res.status(500).json({ error: 'RetroAchievements API request failed' })
    }
  }
})

const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`IGDB proxy on :${port}`)
  try {
    console.log('[Overlay] Data dir:', DATA_DIR)
    console.log('[Overlay] Timers file:', TIMERS_FILE)
    console.log('[Overlay] Current file:', CURRENT_FILE)
  } catch {}
})

// Periodic persistence while running to reduce write frequency (every 15s)
setInterval(() => {
  const now = Date.now()
  if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
    const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
    if (deltaSec > 0) {
      const gid = timerState.currentGameId
      timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
      timerState.psfestAccumulatedSec += deltaSec
      timerState.currentStartedAt = now
      timerState.updatedAt = now
      saveJSON(TIMERS_FILE, timerState)
    }
  }
}, 15_000)

// Graceful shutdown: checkpoint timers
for (const sig of ['SIGINT', 'SIGTERM']) {
  try {
    process.on(sig, () => {
      try {
        const now = Date.now()
        if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
          const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
          if (deltaSec > 0) {
            const gid = timerState.currentGameId
            timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
            timerState.psfestAccumulatedSec += deltaSec
          }
          timerState.currentStartedAt = now
          timerState.updatedAt = now
        }
        saveJSON(TIMERS_FILE, timerState)
      } catch {}
      process.exit(0)
    })
  } catch {}
}
