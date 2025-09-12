import { config } from 'dotenv'
config({ path: './server/.env' })
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { FLAGS, loadPlatformMapping } from './config.js'
import * as RA from './adapters/ra.js'
import * as IGDB from './adapters/igdb.js'
import { COVERS_DIR, coverPathFor, coverPublicPathFor, cacheCoverFromUrl } from './util/covers.js'
import { startBuild, startCoverPrefetch, getJob, getIndex } from './library.js'
import { createUserMetadataEndpoints, mergeWithGameLibrary } from './userMetadata.js'

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

// Serve cached covers statically
app.use('/covers', express.static(COVERS_DIR))

// Local-first cover endpoint. If cached file exists, serve it. Otherwise fetch, cache, and serve.
app.get('/cover', async (req, res) => {
  try {
    const src = req.query.src
    if (!src) return res.status(400).send('src required')
    const file = coverPathFor(src)
    if (fs.existsSync(file)) return res.sendFile(file)
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

// Load persisted timer state if available with backup recovery
let timerStateLoaded = false
try {
  const persistedTimers = loadJSON(TIMERS_FILE, null)
  if (persistedTimers && typeof persistedTimers === 'object') {
    timerState = { ...timerState, ...persistedTimers }
    timerStateLoaded = true
    console.log('Timer state loaded from primary file')
  }
} catch (primaryError) {
  console.warn('Failed to load primary timer state:', primaryError.message)
  
  // Try to load from backup
  try {
    const backupFile = TIMERS_FILE.replace('.json', '.backup.json')
    const backupTimers = loadJSON(backupFile, null)
    if (backupTimers && typeof backupTimers === 'object' && backupTimers.isBackup) {
      timerState = { ...timerState, ...backupTimers }
      timerStateLoaded = true
      console.log('Timer state recovered from backup file')
      
      // Save backup as primary to fix corruption
      try {
        delete backupTimers.isBackup
        delete backupTimers.backupTimestamp
        saveJSON(TIMERS_FILE, backupTimers)
        console.log('Primary timer state restored from backup')
      } catch (restoreError) {
        console.warn('Failed to restore primary timer state:', restoreError.message)
      }
    }
  } catch (backupError) {
    console.warn('Failed to load backup timer state:', backupError.message)
  }
}

// If we loaded timer state, migrate and validate it
if (timerStateLoaded) {
  // Migrate legacy single current accumulator to perGame map
  if (!timerState.perGame) timerState.perGame = {}
  if (typeof timerState.currentAccumulatedSec === 'number' && timerState.currentGameId) {
    timerState.perGame[timerState.currentGameId] = (timerState.perGame[timerState.currentGameId] || 0) + timerState.currentAccumulatedSec
    delete timerState.currentAccumulatedSec
  }
  
  // Detect potential crash recovery scenario
  const now = Date.now()
  const timeSinceLastUpdate = now - (timerState.updatedAt || 0)
  
  if (timerState.running && timeSinceLastUpdate > 300_000) { // More than 5 minutes
    console.log('Detected potential crash recovery scenario - timer was running for', Math.floor(timeSinceLastUpdate / 60000), 'minutes')
    
    // Don't count the downtime - resume from now
    timerState.currentStartedAt = now
    
    // Log crash recovery stats
    const gameProgress = timerState.currentGameId ? (timerState.perGame[timerState.currentGameId] || 0) : 0
    console.log('Crash recovery - resuming timer for game:', timerState.currentGameId, 'with', gameProgress, 'seconds accumulated')
  } else if (timerState.running) {
    // Normal restart - resume from now
    timerState.currentStartedAt = now
  }
  
  // Validate state integrity
  if (timerState.psfestAccumulatedSec < 0) {
    console.warn('Fixing negative PSFest time')
    timerState.psfestAccumulatedSec = 0
  }
  
  if (timerState.perGame) {
    Object.keys(timerState.perGame).forEach(gameId => {
      if (timerState.perGame[gameId] < 0) {
        console.warn('Fixing negative game time for', gameId)
        timerState.perGame[gameId] = 0
      }
    })
  }
}

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

// Per-game fixed time (seconds accumulated) with formatted string
app.get('/overlay/timers/game/:id', (req, res) => {
  try {
    const id = req.params.id
    const now = Date.now()
    let seconds = 0

    if (timerState && timerState.perGame) {
      seconds = Math.max(0, Number(timerState.perGame[id] || 0))
    }

    // If this game is currently running, include live delta
    if (timerState && timerState.running && timerState.currentGameId === id && timerState.currentStartedAt) {
      const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
      if (deltaSec > 0) seconds += deltaSec
    }

    const formatted = formatTime(seconds)
    res.json({ id, seconds, formatted, updatedAt: now })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_compute_fixed_time' })
  }
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

// Register user metadata endpoints
createUserMetadataEndpoints(app)

const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`IGDB proxy on :${port}`)
  try {
    console.log('[Overlay] Data dir:', DATA_DIR)
    console.log('[Overlay] Timers file:', TIMERS_FILE)
    console.log('[Overlay] Current file:', CURRENT_FILE)
  } catch {}
  try {
    if (FLAGS.LIBRARY_BUILD_ON_START) {
      console.log('[Startup] Library build on start enabled; starting job...')
      const jobId = startBuild({ apiKey: process.env.RA_API_KEY || process.env.VITE_RA_API_KEY })
      console.log('[Startup] Library build job:', jobId)
    }
    if (FLAGS.COVER_PREFETCH_ENABLED) {
      console.log('[Startup] Cover prefetch enabled; starting job with RA fallback...')
      const jobId = startCoverPrefetch({ limitConcurrency: 3, saveEvery: 50 })
      console.log('[Startup] Cover prefetch job:', jobId)
    }
  } catch (e) { console.warn('[Startup] background jobs failed to start:', e?.message || e) }
})

// Periodic persistence while running to reduce write frequency (every 15s)
// Also create backup saves for crash recovery
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
      
      // Save primary state
      try {
        saveJSON(TIMERS_FILE, timerState)
      } catch (error) {
        console.error('Timer persistence failed:', error)
      }
      
      // Create backup with timestamp for crash recovery
      try {
        const backupState = {
          ...timerState,
          backupTimestamp: now,
          isBackup: true
        }
        saveJSON(TIMERS_FILE.replace('.json', '.backup.json'), backupState)
      } catch (error) {
        console.warn('Timer backup failed:', error)
      }
    }
  }
}, 15_000)

// Graceful shutdown: checkpoint timers with enhanced error handling
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}, performing graceful shutdown...`)
  
  try {
    const now = Date.now()
    
    // Checkpoint any running timer state
    if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
      const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
      if (deltaSec > 0) {
        const gid = timerState.currentGameId
        timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
        timerState.psfestAccumulatedSec += deltaSec
        console.log(`Checkpointing ${deltaSec} seconds for game ${gid}`)
      }
      timerState.currentStartedAt = now
      timerState.updatedAt = now
    }
    
    // Save state with retry logic
    let saveAttempts = 3
    while (saveAttempts > 0) {
      try {
        saveJSON(TIMERS_FILE, timerState)
        console.log('Timer state saved successfully on shutdown')
        break
      } catch (error) {
        saveAttempts--
        console.error(`Timer save failed (${saveAttempts} attempts left):`, error.message)
        if (saveAttempts === 0) {
          // Try backup save as last resort
          try {
            const backupFile = TIMERS_FILE.replace('.json', '.emergency.json')
            saveJSON(backupFile, { ...timerState, isEmergencyBackup: true, shutdownTime: now })
            console.log('Emergency backup saved')
          } catch (backupError) {
            console.error('Emergency backup failed:', backupError.message)
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Graceful shutdown error:', error.message)
  } finally {
    console.log('Graceful shutdown complete')
    process.exit(0)
  }
}

// Handle multiple shutdown signals
for (const sig of ['SIGINT', 'SIGTERM', 'SIGQUIT']) {
  try {
    process.on(sig, () => gracefulShutdown(sig))
  } catch (error) {
    console.warn(`Failed to register ${sig} handler:`, error.message)
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  try {
    // Emergency save before crash
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
    
    const crashFile = TIMERS_FILE.replace('.json', '.crash.json')
    saveJSON(crashFile, { ...timerState, isCrashBackup: true, crashTime: now, crashError: error.message })
    console.log('Crash backup saved')
  } catch (crashError) {
    console.error('Crash backup failed:', crashError.message)
  }
  process.exit(1)
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason)
  console.error('Promise:', promise)
})

// -------- v2 APIs (feature-flagged) --------

// Helper: optional gating (kept for admin endpoints). For public v2, always allow.
function gated(handler) {
  return (req, res, next) => handler(req, res, next)
}

// GET /api/consoles (always on for v2 UI)
app.get('/api/consoles', async (req, res) => {
  try {
    const apiKey = req.query.apiKey || process.env.RA_API_KEY
    const list = await RA.listConsoles({ apiKey, activeOnly: true, gameSystemsOnly: true })
    const mapping = loadPlatformMapping()
    const consoles = list.map(c => ({ ...c, igdbPlatformIds: mapping[c.id] || [] }))
    res.json({ consoles })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_list_consoles' })
  }
})

// GET /api/games (paged) — always on for v2 UI
app.get('/api/games', async (req, res) => {
  try {
    const { consoleId, hasAchievements, hasCover, q, offset = 0, limit = 100 } = req.query
    const idx = getIndex()
    let games = idx.games || []
    
    // Merge with user metadata before filtering
    games = mergeWithGameLibrary(games)
    
    if (consoleId && consoleId !== 'All') games = games.filter(g => g.console?.id === consoleId)
    if (hasAchievements) games = games.filter(g => g.flags?.hasAchievements)
    if (hasCover) games = games.filter(g => g.flags?.hasCover)
    if (q) {
      const s = String(q).toLowerCase()
      games = games.filter(g => g.title?.toLowerCase().includes(s))
    }
    const off = Math.max(0, Number(offset) || 0)
    const lim = Math.max(1, Math.min(500, Number(limit) || 100))
    const page = games.slice(off, off + lim)
    res.json({ total: games.length, offset: off, limit: lim, games: page })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_list_games' })
  }
})

// POST /api/covers/resolve — always on for v2 UI
app.post('/api/covers/resolve', async (req, res) => {
  try {
    const { title, consoleId } = req.body || {}
    if (!title) return res.status(400).json({ error: 'title_required' })
    const mapping = loadPlatformMapping()
    const platforms = consoleId ? (mapping[consoleId] || []) : []
    const results = await IGDB.searchGames({ q: title, platformIds: platforms })
    if (!results.length || !results[0].image_id) return res.status(404).json({ error: 'not_found' })
    const url = IGDB.coverUrlFromImageId(results[0].image_id)
    const localPath = await cacheCoverFromUrl(url)
    const release_year = results[0].first_release_date ? new Date(results[0].first_release_date * 1000).getUTCFullYear().toString() : null
    const publisher = results[0].publisher_name || null
    res.json({ cover: { localPath, originalUrl: url }, matchedTitle: results[0].name, release_year, publisher })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_resolve_cover' })
  }
})

// Jobs: build library and status
app.post('/api/library/build', gated(async (req, res) => {
  try {
    const apiKey = req.body?.apiKey || process.env.RA_API_KEY
    const consoles = Array.isArray(req.body?.consoles) ? req.body.consoles : undefined
    const jobId = startBuild({ apiKey, consoles })
    res.json({ started: true, jobId })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_start_build' })
  }
}))

app.get('/api/library/status/:jobId', async (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'job_not_found' })
  res.json(job)
})

// Start cover prefetch for all games missing covers
app.post('/api/library/covers', gated(async (req, res) => {
  try {
    const jobId = startCoverPrefetch({ limitConcurrency: Number(req.body?.concurrency) || 3, saveEvery: Number(req.body?.saveEvery) || 50 })
    res.json({ started: true, jobId })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_start_cover_prefetch' })
  }
}))
