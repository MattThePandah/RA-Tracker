import './env.js'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { exec, execSync } from 'child_process'
import helmet from 'helmet'
import session from 'express-session'
import rateLimit from 'express-rate-limit'
import pgSession from 'connect-pg-simple'
import { FLAGS, LIMITS, loadPlatformMapping, getRAAuth } from './config.js'
import * as RA from './adapters/ra.js'
import { extractRaGameId } from './adapters/ra.js'
import * as IGDB from './adapters/igdb.js'
import { COVERS_DIR, coverPathFor, coverPublicPathFor, cacheCoverFromUrl } from './util/covers.js'
import { startBuild, startCoverPrefetch, getJob, getIndex } from './library.js'
import { createUserMetadataEndpoints, mergeWithGameLibrary, getUserSettings, getUserMetadata, appendHistoryEntry, backfillHistoryFromTotals } from './userMetadata.js'
import { raLimiter } from './util/raLimiter.js'
import { detectGenres } from './util/genreDetection.js'
import {
  ensurePublicSchema,
  getPublicMetadata,
  updatePublicMetadata,
  deletePublicMetadata,
  listPublicGames,
  getPublicSettings,
  updatePublicSettings,
  getSuggestionStats,
  listSuggestions,
  addSuggestion,
  updateSuggestion
} from './publicData.js'
import { notifier } from './services/notifier.js'
import { ensureCoverSchema } from './coverData.js'
import {
  ensureOverlaySchema,
  getOverlaySettings,
  updateOverlaySettings
} from './overlayData.js'
import {
  ensureEventSchema,
  listEvents,
  getActiveEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  setActiveEvent
} from './eventData.js'
import {
  ensureTimerSchema,
  loadTimerStateFromDb,
  saveTimerStateToDb,
  loadTimerStateFromFile,
  saveTimerStateToFile,
  loadLegacyTimerStateFromDb
} from './timerData.js'
import { getPool, isPgEnabled } from './db.js'

const app = express()
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1)
}
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (corsOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
// Keep default body limit small to discourage huge payloads
app.use(express.json({ limit: '200kb' }))

const PgSession = pgSession(session)
if (isPgEnabled()) {
  const store = new PgSession({
    pool: getPool(),
    tableName: 'user_sessions',
    createTableIfMissing: true
  })
  app.use(session({
    name: 'ra.session',
    store,
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }))
} else {
  console.warn('Postgres not configured; sessions will not persist.')
  app.use(session({
    name: 'ra.session',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }))
}

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

const adminAllowlist = (process.env.ADMIN_TWITCH_ALLOWLIST || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

const adminAppUrl = process.env.ADMIN_APP_URL || 'http://localhost:5173/admin'
const twitchClientId = process.env.ADMIN_TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID
const twitchClientSecret = process.env.ADMIN_TWITCH_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET
const twitchRedirectUri = process.env.ADMIN_TWITCH_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:8787'}/auth/twitch/callback`

function isAdminUser(user) {
  if (!user) return false
  const login = String(user.login || '').toLowerCase()
  const id = String(user.id || '').toLowerCase()
  if (!adminAllowlist.length) return true
  return adminAllowlist.includes(login) || adminAllowlist.includes(id)
}

function requireAdmin(req, res, next) {
  if (req.session?.admin) return next()
  return res.status(401).json({ error: 'unauthorized' })
}

function requireCsrf(req, res, next) {
  const token = req.get('x-csrf-token')
  if (token && req.session?.csrfToken && token === req.session.csrfToken) return next()
  return res.status(403).json({ error: 'csrf_failed' })
}

function requireOrigin(req, res, next) {
  const origin = req.get('origin') || req.get('referer') || ''
  if (!origin) return next()
  if (corsOrigins.some(allowed => origin.startsWith(allowed))) return next()
  return res.status(403).json({ error: 'origin_not_allowed' })
}

const overlayToken = process.env.OVERLAY_ACCESS_TOKEN || ''
const streamerbotApiKey = process.env.STREAMERBOT_API_KEY || ''

const raProxyLimiter = raLimiter
const raProxyCacheMs = Number(process.env.RA_GAME_CACHE_MS || 30_000)
const raProxyCache = new Map()
const raProxyInflight = new Map()
const raRecentCacheMs = Number(process.env.RA_RECENT_CACHE_MS || 60_000)
const raRecentCache = new Map()
const raRecentInflight = new Map()

function requireOverlayAuth(req, res, next) {
  if (req.session?.admin) return next()
  if (overlayToken) {
    const token = String(req.get('x-overlay-token') || req.query.token || '')
    if (token && token === overlayToken) return next()
  }
  return res.status(401).json({ error: 'overlay_unauthorized' })
}

function requireStreamerbotAuth(req, res, next) {
  if (req.session?.admin) return next()
  if (!streamerbotApiKey) {
    return res.status(500).json({ error: 'streamerbot_key_not_configured' })
  }
  const token = String(req.get('x-streamerbot-key') || req.query.key || '')
  if (token && token === streamerbotApiKey) return next()
  return res.status(401).json({ error: 'streamerbot_unauthorized' })
}

function normalizeConsoleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveConsoleInput(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  const key = normalizeConsoleKey(raw)
  const mapping = {
    ps1: 'PlayStation',
    psx: 'PlayStation',
    playstation: 'PlayStation',
    ps2: 'PlayStation 2',
    playstation2: 'PlayStation 2',
    ps3: 'PlayStation 3',
    playstation3: 'PlayStation 3',
    ps4: 'PlayStation 4',
    playstation4: 'PlayStation 4',
    ps5: 'PlayStation 5',
    playstation5: 'PlayStation 5',
    psp: 'PlayStation Portable',
    playstationportable: 'PlayStation Portable',
    psv: 'PlayStation Vita',
    vita: 'PlayStation Vita',
    playstationvita: 'PlayStation Vita'
  }
  return {
    name: mapping[key] || raw,
    key: mapping[key] ? normalizeConsoleKey(mapping[key]) : key,
    raw
  }
}

function getConsoleName(game) {
  const value = game?.console
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return value.name || value.id || ''
  return String(value)
}

function shortConsoleName(value) {
  const name = String(value || '').trim()
  if (!name) return 'Unknown'
  if (name === 'PlayStation') return 'PS1'
  if (name === 'PlayStation 2') return 'PS2'
  if (name === 'PlayStation 3') return 'PS3'
  if (name === 'PlayStation 4') return 'PS4'
  if (name === 'PlayStation 5') return 'PS5'
  if (name === 'PlayStation Portable') return 'PSP'
  if (name === 'PlayStation Vita') return 'PS Vita'
  return name
}

function collectConsoleKeys(value) {
  const keys = new Set()
  const raw = String(value || '').trim()
  if (!raw) return keys
  const add = (val) => {
    const key = normalizeConsoleKey(val)
    if (key) keys.add(key)
  }
  add(raw)
  const short = shortConsoleName(raw)
  if (short && short !== raw) add(short)
  const resolved = resolveConsoleInput(raw)
  if (resolved?.name) {
    add(resolved.name)
    const resolvedShort = shortConsoleName(resolved.name)
    if (resolvedShort && resolvedShort !== resolved.name) add(resolvedShort)
  }
  if (resolved?.key) keys.add(resolved.key)
  return keys
}

function matchesEventConsoles(consoles, game) {
  if (!Array.isArray(consoles) || consoles.length === 0) return true
  const consoleKeys = new Set()
  consoles.forEach(value => {
    collectConsoleKeys(value).forEach(key => consoleKeys.add(key))
    const idKey = normalizeConsoleKey(String(value || ''))
    if (idKey) consoleKeys.add(idKey)
  })
  const nameKeys = collectConsoleKeys(getConsoleName(game))
  for (const key of nameKeys) {
    if (consoleKeys.has(key)) return true
  }
  const consoleId = game?.console?.id
  if (consoleId != null) {
    const idKey = normalizeConsoleKey(String(consoleId))
    if (idKey && consoleKeys.has(idKey)) return true
  }
  return false
}

function sanitizeText(value, maxLen) {
  if (value === null || value === undefined) return ''
  const s = String(value).trim()
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, num))
}

function formatCompletionHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0) return ''
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (!h && m) return `${m}m`
  if (h && !m) return `${h}h`
  return `${h}h ${m}m`
}

function buildEventMessage(event) {
  if (!event) return 'No active event right now.'
  const name = sanitizeText(event.name, 80)
  const title = sanitizeText(event.overlayTitle, 80)
  const subtitle = sanitizeText(event.overlaySubtitle, 120)
  const consoleName = sanitizeText(event.console, 80)
  const parts = []
  if (title) parts.push(title)
  else if (name) parts.push(name)
  if (subtitle) parts.push(subtitle)
  if (consoleName) parts.push(consoleName)
  if (!parts.length) return 'No active event right now.'
  return `Event: ${parts.join(' | ')}`
}

// Custom cover storage uses sanitized filenames for Windows compatibility.
const CUSTOM_COVERS_DIR = path.join(process.cwd(), 'custom-covers')
fs.mkdirSync(CUSTOM_COVERS_DIR, { recursive: true })

function normalizeCustomCoverExt(value) {
  const ext = String(value || '').toLowerCase()
  if (ext === '.jpeg' || ext === 'jpeg' || ext === '.jpg' || ext === 'jpg') return '.jpg'
  if (ext === '.png' || ext === 'png') return '.png'
  if (ext === '.webp' || ext === 'webp') return '.webp'
  return null
}

function customCoverExtFromType(contentType) {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('jpeg')) return '.jpg'
  if (type.includes('jpg')) return '.jpg'
  if (type.includes('png')) return '.png'
  if (type.includes('webp')) return '.webp'
  return null
}

function sanitizeCustomCoverName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.replace(/[^a-z0-9._-]/gi, '_')
}

function customCoverFilePathFromId(gameId, ext) {
  const safeName = sanitizeCustomCoverName(gameId) || 'cover'
  return path.join(CUSTOM_COVERS_DIR, `${safeName}${ext}`)
}

function customCoverFilePathFromRequest(fileParam) {
  const base = path.basename(String(fileParam || '').trim())
  const ext = normalizeCustomCoverExt(path.extname(base))
  if (!ext) return null
  const name = path.basename(base, path.extname(base))
  const safeName = sanitizeCustomCoverName(name)
  if (!safeName) return null
  return path.join(CUSTOM_COVERS_DIR, `${safeName}${ext}`)
}

const streamCache = { ts: 0, data: null }
const streamLiveState = { twitch: null, youtube: null }
const streamCacheMs = Number(process.env.STREAM_CACHE_MS || 60_000)

async function fetchTwitchStatus(channel) {
  if (!channel) return { enabled: false }
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    return { enabled: false, error: 'twitch_not_configured' }
  }
  const token = await getToken()
  const headers = {
    'Client-ID': process.env.TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${token}`
  }
  const login = String(channel).trim()
  const userResp = await axios.get('https://api.twitch.tv/helix/users', { headers, params: { login } })
  const user = userResp.data?.data?.[0]
  if (!user) return { enabled: true, isLive: false, channel: login, url: `https://twitch.tv/${login}` }
  const streamResp = await axios.get('https://api.twitch.tv/helix/streams', { headers, params: { user_id: user.id } })
  const stream = streamResp.data?.data?.[0]
  return {
    enabled: true,
    isLive: !!stream,
    channel: user.login,
    displayName: user.display_name,
    url: `https://twitch.tv/${user.login}`,
    profileImage: user.profile_image_url || null,
    title: stream?.title || '',
    gameName: stream?.game_name || '',
    viewerCount: stream?.viewer_count || 0,
    startedAt: stream?.started_at || null
  }
}

async function fetchYouTubeStatus({ channelId, uploadsLimit = 3 }) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey || !channelId) return { enabled: false }
  const safeLimit = Math.max(1, Math.min(8, Number(uploadsLimit) || 3))
  const base = 'https://www.googleapis.com/youtube/v3/search'
  const liveResp = await axios.get(base, {
    params: {
      part: 'snippet',
      channelId,
      eventType: 'live',
      type: 'video',
      maxResults: 1,
      key: apiKey
    }
  })
  const liveItem = liveResp.data?.items?.[0]
  const latestResp = await axios.get(base, {
    params: {
      part: 'snippet',
      channelId,
      order: 'date',
      type: 'video',
      maxResults: safeLimit,
      key: apiKey
    }
  })
  const latest = (latestResp.data?.items || []).map(item => ({
    videoId: item.id?.videoId,
    title: item.snippet?.title || '',
    publishedAt: item.snippet?.publishedAt || null,
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
    channelTitle: item.snippet?.channelTitle || ''
  })).filter(v => v.videoId)
  return {
    enabled: true,
    isLive: !!liveItem?.id?.videoId,
    live: liveItem?.id?.videoId ? {
      videoId: liveItem.id.videoId,
      title: liveItem.snippet?.title || '',
      thumbnail: liveItem.snippet?.thumbnails?.high?.url || '',
      channelTitle: liveItem.snippet?.channelTitle || ''
    } : null,
    latest
  }
}

app.post('/igdb/search', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
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
    const body = `fields name,cover.image_id,first_release_date,platforms.name,involved_companies.company.name,involved_companies.publisher; search "${q.replace('"', '')}"; ${where} limit 5;`
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
      } catch { }
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
const overlayState = {
  current: null,
  startingSoon: false,
  startingSoonEndTime: null,
  updatedAt: Date.now()
}

const TRAILERS_DIR = path.join(process.cwd(), 'trailers')
fs.mkdirSync(TRAILERS_DIR, { recursive: true })
const FFMPEG_PATH = (process.env.FFMPEG_PATH || '').trim()
const FFMPEG_LOCATION = (() => {
  if (!FFMPEG_PATH) return ''
  if (fs.existsSync(FFMPEG_PATH)) return FFMPEG_PATH
  const candidate = path.join(FFMPEG_PATH, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (fs.existsSync(candidate)) return FFMPEG_PATH
  console.warn(`[Startup] FFMPEG_PATH set but not found: ${FFMPEG_PATH}`)
  return ''
})()
const FFMPEG_AVAILABLE = (() => {
  if (FFMPEG_LOCATION) return true
  const command = process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg'
  try {
    execSync(command, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const FFMPEG_LOCATION_ARG = FFMPEG_LOCATION ? ` --ffmpeg-location "${FFMPEG_LOCATION}"` : ''
if (!FFMPEG_AVAILABLE) {
  console.warn('[Startup] ffmpeg not found; trailer downloads will use combined formats only.')
}
const TRAILER_EXTENSIONS = /\.(mp4|webm|mov|mkv)$/i
const TRAILERS_ROOT = path.resolve(TRAILERS_DIR)
function getTrailerUrlPath(relativePath) {
  return relativePath
    .split(path.sep)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}
function listTrailerFiles(dir, relativeBase = '') {
  let results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absolutePath = path.join(dir, entry.name)
    const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name
    if (entry.isDirectory()) {
      results = results.concat(listTrailerFiles(absolutePath, relativePath))
    } else if (entry.isFile() && TRAILER_EXTENSIONS.test(entry.name)) {
      results.push({ name: relativePath, path: absolutePath })
    }
  }
  return results
}
function resolveTrailerPath(name) {
  const normalized = String(name || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return null
  const filePath = path.join(TRAILERS_DIR, normalized)
  const resolved = path.resolve(filePath)
  if (resolved !== TRAILERS_ROOT && !resolved.startsWith(`${TRAILERS_ROOT}${path.sep}`)) return null
  return filePath
}

// Simple JSON persistence for resilience across server restarts
const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const TIMERS_FILE = path.join(DATA_DIR, 'timers.json')
const CURRENT_FILE = path.join(DATA_DIR, 'overlay-current.json')
const STATS_FILE = path.join(DATA_DIR, 'overlay-stats.json')
const CONNECTOR_FILE = path.join(DATA_DIR, 'overlay-connector.json')

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
  } catch { }
}

const CONNECTOR_MAX_QUEUE = clampNumber(process.env.OVERLAY_CONNECTOR_MAX_QUEUE, 1, 100, 25)
const CONNECTOR_DEFAULT_DURATION_MS = clampNumber(process.env.OVERLAY_CONNECTOR_DURATION_MS, 2000, 60000, 12000)
const CONNECTOR_FOCUS_DURATION_MS = clampNumber(process.env.OVERLAY_CONNECTOR_FOCUS_MS, 2000, 60000, 10000)
const CONNECTOR_MIN_DURATION_MS = 2000
const CONNECTOR_MAX_DURATION_MS = 60000
const CONNECTOR_TYPE_ALIASES = {
  subscription: 'sub',
  sub: 'sub',
  resub: 'resub',
  resubscription: 'resub',
  giftsub: 'gift',
  gift: 'gift',
  gifted: 'gift',
  raid: 'raid',
  follow: 'follow',
  cheer: 'cheer',
  bits: 'cheer',
  superchat: 'superchat',
  supersticker: 'superchat',
  member: 'member',
  membership: 'member',
  tip: 'tip',
  donation: 'tip',
  donate: 'tip'
}

let connectorState = loadJSON(CONNECTOR_FILE, { queue: [], updatedAt: Date.now() })
if (!connectorState || typeof connectorState !== 'object') {
  connectorState = { queue: [], updatedAt: Date.now() }
}
if (!Array.isArray(connectorState.queue)) connectorState.queue = []

function saveConnectorState() {
  connectorState.updatedAt = Date.now()
  saveJSON(CONNECTOR_FILE, connectorState)
}

function normalizeConnectorType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'event'
  const key = raw.replace(/[^a-z0-9]/g, '')
  return CONNECTOR_TYPE_ALIASES[key] || raw
}

function normalizeConnectorSource(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'stream'
  if (raw.includes('twitch')) return 'twitch'
  if (raw.includes('youtube') || raw === 'yt') return 'youtube'
  return raw
}

function normalizeConnectorFocus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'game' || raw === 'event') return raw
  return ''
}

function pruneConnectorQueue(now) {
  const before = connectorState.queue.length
  connectorState.queue = connectorState.queue.filter(item => {
    if (!item || !item.id) return false
    const expiresAt = Number(item.expiresAt || 0)
    if (expiresAt && expiresAt <= now) return false
    return true
  })
  if (connectorState.queue.length !== before) {
    saveConnectorState()
  }
}

function buildConnectorEvent(input) {
  if (!input || typeof input !== 'object') return null
  const source = normalizeConnectorSource(input.source || input.platform || input.service)
  const type = normalizeConnectorType(input.type || input.eventType || input.event || input.kind)
  const user = sanitizeText(input.user || input.username || input.displayName || input.name, 64)
  const title = sanitizeText(input.title || input.eventTitle, 64)
  const message = sanitizeText(input.message || input.text || input.comment, 160)
  const tier = sanitizeText(input.tier || input.tierName || input.level, 32)
  const color = sanitizeText(input.color, 32)
  const borderColor = sanitizeText(input.borderColor || input.border, 32)
  const glowColor = sanitizeText(input.glowColor || input.glow, 32)
  const focus = normalizeConnectorFocus(input.focus || input.center || input.centerMode || input.mode)
  const months = clampNumber(input.months ?? input.cumulativeMonths ?? input.totalMonths, 0, 1200, 0)
  const count = clampNumber(input.count ?? input.giftCount ?? input.viewers ?? input.viewerCount, 0, 500000, 0)
  const amount = sanitizeText(input.amount || input.amountDisplay || input.amountText, 32)
  const currency = sanitizeText(input.currency || input.currencyCode, 8)
  const durationMs = clampNumber(
    input.durationMs ?? input.duration,
    CONNECTOR_MIN_DURATION_MS,
    CONNECTOR_MAX_DURATION_MS,
    CONNECTOR_DEFAULT_DURATION_MS
  )
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex')
  const createdAt = Date.now()
  return {
    id,
    source,
    type,
    user,
    title,
    message,
    tier,
    color,
    borderColor,
    glowColor,
    focus,
    months,
    count,
    amount,
    currency,
    durationMs,
    createdAt,
    startedAt: null,
    expiresAt: null
  }
}

function enqueueConnectorEvent(event) {
  if (!event) return null
  pruneConnectorQueue(Date.now())
  connectorState.queue.push(event)
  if (connectorState.queue.length > CONNECTOR_MAX_QUEUE) {
    connectorState.queue = connectorState.queue.slice(-CONNECTOR_MAX_QUEUE)
  }
  saveConnectorState()
  return event
}

function getActiveConnectorEvent(now) {
  pruneConnectorQueue(now)
  const active = connectorState.queue[0]
  if (!active) return null
  if (!active.startedAt) {
    const duration = clampNumber(active.durationMs, CONNECTOR_MIN_DURATION_MS, CONNECTOR_MAX_DURATION_MS, CONNECTOR_DEFAULT_DURATION_MS)
    active.startedAt = now
    active.durationMs = duration
    active.expiresAt = now + duration
    saveConnectorState()
  }
  return active
}

const GENRE_CACHE_FILE = path.join(DATA_DIR, 'igdb-genre-cache.json')
const GENRE_CACHE_TTL_MS = (Number(process.env.IGDB_GENRE_CACHE_DAYS || 30) || 30) * 24 * 60 * 60 * 1000
const IGDB_ENABLED = !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET
let igdbGenreCache = loadJSON(GENRE_CACHE_FILE, { version: 1, games: {} })
if (!igdbGenreCache || typeof igdbGenreCache !== 'object') igdbGenreCache = { version: 1, games: {} }
if (!igdbGenreCache.games || typeof igdbGenreCache.games !== 'object') igdbGenreCache.games = {}
let igdbGenreCacheTimer = null

function scheduleGenreCacheSave() {
  if (igdbGenreCacheTimer) return
  igdbGenreCacheTimer = setTimeout(() => {
    igdbGenreCacheTimer = null
    saveJSON(GENRE_CACHE_FILE, igdbGenreCache)
  }, 500)
}

function getCachedGenreEntry(gameId) {
  const id = String(gameId || '')
  if (!id) return null
  const entry = igdbGenreCache.games[id]
  if (!entry) return null
  if (entry.ts && Date.now() - entry.ts > GENRE_CACHE_TTL_MS) return null
  return entry
}

function getCachedGenres(gameId) {
  const entry = getCachedGenreEntry(gameId)
  if (!entry) return null
  return Array.isArray(entry.genres) ? entry.genres : []
}

function setCachedGenres(gameId, genres, source = 'igdb') {
  const id = String(gameId || '')
  if (!id) return
  igdbGenreCache.games[id] = {
    genres: Array.isArray(genres) ? genres.filter(Boolean) : [],
    source,
    ts: Date.now()
  }
  scheduleGenreCacheSave()
}

// Load persisted states if present
try {
  const persistedCurrent = loadJSON(CURRENT_FILE, null)
  if (persistedCurrent && typeof persistedCurrent === 'object') {
    overlayState.current = persistedCurrent.current || null
    overlayState.updatedAt = persistedCurrent.updatedAt || Date.now()
  }
} catch { }

// Deprecated: kept for backward compat, but returns minimal data
app.get('/overlay/state', requireOverlayAuth, (req, res) => {
  res.json({ games: [], currentGameId: overlayState.current?.id || null, updatedAt: overlayState.updatedAt })
})
app.get('/overlay/config', requireOverlayAuth, async (req, res) => {
  try {
    const settings = await getOverlaySettings()
    res.json(settings)
  } catch (error) {
    res.status(500).json({ error: 'overlay_config_failed' })
  }
})
// Deprecated: accept but ignore large game arrays to avoid bloating overlay memory
app.post('/overlay/state', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
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
app.get('/overlay/current', requireOverlayAuth, (req, res) => {
  res.json({
    current: overlayState.current,
    startingSoon: overlayState.startingSoon,
    startingSoonEndTime: overlayState.startingSoonEndTime,
    updatedAt: overlayState.updatedAt
  })
})

app.get('/overlay/trailers', requireOverlayAuth, (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const files = listTrailerFiles(TRAILERS_DIR)
      .map(file => ({
        name: file.name.split(path.sep).join('/'),
        url: `${baseUrl}/trailers/${getTrailerUrlPath(file.name)}`
      }))

    // Shuffle trailers
    for (let i = files.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [files[i], files[j]] = [files[j], files[i]];
    }

    res.json(files)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_list_trailers' })
  }
})

app.get('/api/admin/trailers', requireAdmin, (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const files = listTrailerFiles(TRAILERS_DIR)
      .map(file => ({
        name: file.name.split(path.sep).join('/'),
        size: fs.statSync(file.path).size,
        url: `${baseUrl}/trailers/${getTrailerUrlPath(file.name)}`
      }))
    res.json(files)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_list_trailers' })
  }
})

app.delete('/api/admin/trailers/:name', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
  try {
    const name = req.params.name || ''
    const filePath = resolveTrailerPath(name)
    if (!filePath) return res.status(400).json({ error: 'invalid_trailer_path' })
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return res.json({ ok: true })
    }
    res.status(404).json({ error: 'trailer_not_found' })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_delete_trailer' })
  }
})

app.post('/api/admin/trailers/download', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
  const { url } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })

  // Basic validation to prevent command injection
  if (!url.startsWith('http')) return res.status(400).json({ error: 'invalid url' })

  // Run yt-dlp. Note: requires yt-dlp to be installed on the system path
  const format = FFMPEG_AVAILABLE
    ? 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/bestvideo+bestaudio/best'
    : 'best[ext=mp4][vcodec^=avc1][acodec^=mp4a]/best[ext=mp4]/best'
  const transcodeArgs = FFMPEG_AVAILABLE
    ? ' --merge-output-format mp4 --recode-video mp4 --postprocessor-args "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart"'
    : ''

  // Use forward slashes for yt-dlp output path even on Windows to avoid escape issues
  const outPath = path.join(TRAILERS_DIR, '%(title)s.%(ext)s').replace(/\\/g, '/')
  const command = `yt-dlp --no-playlist --restrict-filenames -f "${format}"${FFMPEG_LOCATION_ARG}${transcodeArgs} -o "${outPath}" "${url.replace(/"/g, '')}"`

  console.log(`[Trailers] Starting download: ${url}`)

  // Execute in background
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('[Trailers] Download failed:', error)
      console.error('[Trailers] stderr:', stderr)
      return
    }
    console.log(`[Trailers] Download finished: ${url}`)
  })

  // Return immediately so the UI doesn't hang
  res.json({ ok: true, message: 'download_started' })
})

app.post('/api/admin/trailers/search', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
  const { q } = req.body || {}
  if (!q) return res.json([])

  const command = `yt-dlp --print-json --flat-playlist --no-playlist "ytsearch5:${q.replace(/"/g, '')}"`

  exec(command, (error, stdout, stderr) => {
    if (error && !stdout) {
      console.error('yt-dlp search error:', error)
      return res.status(500).json({ error: 'search_failed', details: stderr })
    }

    try {
      const results = stdout.trim().split('\n').filter(Boolean).map(line => {
        try {
          const item = JSON.parse(line)
          return {
            id: item.id,
            title: item.title,
            url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
            thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || null,
            duration: item.duration_string || null,
            uploader: item.uploader || null
          }
        } catch { return null }
      }).filter(Boolean)

      res.json(results)
    } catch (e) {
      res.status(500).json({ error: 'parse_failed' })
    }
  })
})


app.use('/trailers', express.static(TRAILERS_DIR, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.mp4') {
      res.setHeader('Content-Type', 'video/mp4')
    } else if (ext === '.webm') {
      res.setHeader('Content-Type', 'video/webm')
    } else if (ext === '.mov') {
      res.setHeader('Content-Type', 'video/quicktime')
    } else if (ext === '.mkv') {
      res.setHeader('Content-Type', 'video/x-matroska')
    }
  }
}))

app.post('/overlay/starting-soon', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
  const { enabled, endTime } = req.body || {}
  overlayState.startingSoon = !!enabled
  overlayState.startingSoonEndTime = endTime ? Number(endTime) : null
  overlayState.updatedAt = Date.now()
  res.json({
    ok: true,
    startingSoon: overlayState.startingSoon,
    startingSoonEndTime: overlayState.startingSoonEndTime,
    updatedAt: overlayState.updatedAt
  })
})

app.get('/overlay/event', requireOverlayAuth, async (req, res) => {
  try {
    if (!activeEvent) {
      await refreshActiveEventFromStore()
    }
    res.json({ event: activeEvent })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_load_event' })
  }
})
app.get('/overlay/connector', requireOverlayAuth, (req, res) => {
  try {
    const event = getActiveConnectorEvent(Date.now())
    res.json({ event, queueDepth: connectorState.queue.length, updatedAt: connectorState.updatedAt })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_load_connector' })
  }
})
app.post('/overlay/current', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
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

app.post('/api/streamerbot/overlay-connector', requireStreamerbotAuth, (req, res) => {
  try {
    const event = buildConnectorEvent(req.body || {})
    if (!event) {
      return res.status(400).json({ error: 'invalid_connector_event' })
    }
    enqueueConnectorEvent(event)
    res.json({ ok: true, event })
  } catch (error) {
    res.status(500).json({ error: 'connector_enqueue_failed' })
  }
})

// Serve cached covers statically
app.use('/covers', express.static(COVERS_DIR))

app.get('/custom-covers/:file', (req, res) => {
  const filePath = customCoverFilePathFromRequest(req.params.file)
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('custom cover not found')
  return res.sendFile(filePath)
})

// Serve local assets from user's custom directory
const USER_ASSETS_DIR = 'C:\\Users\\Matt\\Documents\\ComfyUI\\output\\Using'
if (fs.existsSync(USER_ASSETS_DIR)) {
  console.log(`[Startup] Serving local assets from ${USER_ASSETS_DIR}`)
  app.use('/local-assets', express.static(USER_ASSETS_DIR))
}

// Local-first cover endpoint. If cached file exists, serve it. Otherwise fetch, cache, and serve.
app.get('/cover', async (req, res) => {
  try {
    const src = req.query.src
    if (!src) return res.status(400).send('src required')
    await cacheCoverFromUrl(src)
    const file = coverPathFor(src)
    if (fs.existsSync(file)) return res.sendFile(file)
    res.status(404).send('cover not found')
  } catch (e) {
    res.status(500).send('cover fetch failed')
  }
})

// Bulk prefetch: POST { urls: string[] }
app.post('/covers/prefetch', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : []
  const limit = Number(req.body?.concurrency) || 8
  let ok = 0, skipped = 0, failed = 0
  async function fetchOne(url) {
    const file = coverPathFor(url)
    if (fs.existsSync(file)) { skipped++; return }
    try {
      await cacheCoverFromUrl(url, { origin: 'bulk' })
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

app.post('/api/covers/custom', requireAdmin, requireCsrf, requireOrigin, express.raw({
  type: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  limit: '6mb'
}), (req, res) => {
  try {
    const gameId = String(req.query.gameId || '').trim()
    if (!gameId) return res.status(400).json({ error: 'gameId_required' })
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'image_required' })
    }
    const ext = customCoverExtFromType(req.headers['content-type']) || normalizeCustomCoverExt(req.query.ext)
    if (!ext) return res.status(400).json({ error: 'unsupported_image_type' })
    const filePath = customCoverFilePathFromId(gameId, ext)
    fs.writeFileSync(filePath, req.body)
    res.json({ ok: true, path: `custom-covers/${gameId}${ext}` })
  } catch (error) {
    console.error('Custom cover upload failed:', error.message)
    res.status(500).json({ error: 'custom_cover_upload_failed' })
  }
})

// Smart game sampling for roulette wheel (max 16 slots for performance)
app.post('/api/sample-games', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
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
app.get('/overlay/spin', requireOverlayAuth, (req, res) => {
  res.json(overlaySpin)
})
app.post('/overlay/spin', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
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
app.get('/overlay/wheel-state', requireOverlayAuth, (req, res) => {
  res.json({ sample: overlaySpin.sample || [], poolSize: overlaySpin.poolSize || 0 })
})
app.post('/overlay/wheel-state', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
  const { sample, poolSize } = req.body || {}
  if (!Array.isArray(sample)) return res.status(400).json({ error: 'sample[] required' })
  overlaySpin.sample = sample
  overlaySpin.poolSize = Number(poolSize) || 0
  // Do not update ts here; avoids unintended spins in overlay
  res.json({ ok: true })
})

// Lightweight overlay stats (counts only) to avoid big payloads
let overlayStats = loadJSON(STATS_FILE, { total: 0, completed: 0, percent: 0, updatedAt: 0 })
app.get('/overlay/stats', requireOverlayAuth, async (req, res) => {
  try {
    if (!activeEvent) {
      await refreshActiveEventFromStore()
    }
    const settings = await getOverlaySettings()
    const eventConsoles = Array.isArray(activeEvent?.consoles) ? activeEvent.consoles : []
    const consoles = eventConsoles.length > 0 ? eventConsoles : (settings.global?.eventConsoles || [])

    if (consoles.length > 0) {
      const idx = getIndex()
      const allGames = mergeWithGameLibrary(idx.games || [])
      const filtered = allGames.filter(g => matchesEventConsoles(consoles, g))

      const total = filtered.length
      const completed = filtered.filter(g => g.status === 'Completed').length
      const percent = total ? Math.round((completed / total) * 100) : 0

      return res.json({
        total,
        completed,
        percent,
        updatedAt: Date.now(),
        isFiltered: true
      })
    }
  } catch (e) {
    console.error('[Stats] Dynamic calculation failed:', e.message)
  }

  res.json(overlayStats)
})
app.post('/overlay/stats', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
  const total = Number(req.body?.total) || 0
  const completed = Number(req.body?.completed) || 0
  const percent = total ? Math.round((completed / total) * 100) : 0
  overlayStats = { total, completed, percent, updatedAt: Date.now() }
  saveJSON(STATS_FILE, overlayStats)
  res.json({ ok: true, updatedAt: overlayStats.updatedAt })
})

// Notifications (Stream Alerts)
const NOTIFY_TYPES = new Set(['gameStarted', 'gameCompleted'])
app.post('/api/notify', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const { type, payload } = req.body || {}
    if (!NOTIFY_TYPES.has(type)) {
      return res.status(400).json({ error: 'invalid_notify_type' })
    }
    const settings = getUserSettings()
    const notifySettings = settings?.notifications || {}
    const data = payload && typeof payload === 'object' ? payload : {}
    if (type === 'gameStarted') await notifier.gameStarted(data, notifySettings)
    if (type === 'gameCompleted') await notifier.gameCompleted(data, notifySettings)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: 'notify_failed' })
  }
})

// StreamerBot command endpoints (token protected)
app.get('/api/streamerbot/game', requireStreamerbotAuth, (req, res) => {
  const current = overlayState.current
  if (!current || !current.title) {
    return res.json({ ok: true, message: 'No game is currently being played! The journey continues...' })
  }
  const title = sanitizeText(current.title || 'Unknown Game', 120)
  const consoleName = shortConsoleName(current.console || 'Unknown Console')
  const raId = extractRaGameId(current.id)
  const raUrl = raId ? `https://retroachievements.org/game/${raId}` : ''
  let message = `Currently playing: ${title} (${consoleName})`
  if (raUrl) message += ` | RetroAchievements: ${raUrl}`
  try {
    enqueueConnectorEvent(buildConnectorEvent({
      focus: 'game',
      durationMs: CONNECTOR_FOCUS_DURATION_MS
    }))
  } catch { }
  res.json({
    ok: true,
    message,
    current: {
      id: current.id,
      title,
      console: consoleName,
      raUrl
    }
  })
})

app.get('/api/streamerbot/completed', requireStreamerbotAuth, (req, res) => {
  const limit = Math.max(1, Math.min(10, Number(req.query.limit) || 5))
  const idx = getIndex()
  const games = mergeWithGameLibrary(idx.games || [])
  const completed = games.filter(g => g.status === 'Completed')
  const recent = completed
    .slice()
    .sort((a, b) => {
      const aDate = a.date_finished ? new Date(a.date_finished).getTime() : 0
      const bDate = b.date_finished ? new Date(b.date_finished).getTime() : 0
      if (aDate !== bDate) return bDate - aDate
      return String(a.title || '').localeCompare(String(b.title || ''))
    })
    .slice(0, limit)

  if (!completed.length) {
    return res.json({ ok: true, message: 'No games completed yet! The adventure begins...' })
  }

  const formatted = recent.map(game => {
    const title = sanitizeText(game.title || 'Unknown Game', 120)
    const consoleName = shortConsoleName(getConsoleName(game))
    return consoleName ? `${title} (${consoleName})` : title
  })

  const message = `Recently completed games (${formatted.length}): ${formatted.join(', ')} | Total: ${completed.length}/${games.length} completed`

  res.json({
    ok: true,
    message,
    totals: { completed: completed.length, total: games.length },
    recent: recent.map(game => ({
      id: game.id,
      title: game.title,
      console: getConsoleName(game)
    }))
  })
})

app.get('/api/streamerbot/stats', requireStreamerbotAuth, (req, res) => {
  const idx = getIndex()
  const games = mergeWithGameLibrary(idx.games || [])
  const total = games.length
  const completed = games.filter(g => g.status === 'Completed')
  const inProgress = games.filter(g => g.status === 'In Progress' || g.status === 'Started')
  const percent = total ? ((completed.length / total) * 100) : 0

  const topConsoleGroup = completed.reduce((acc, game) => {
    const consoleName = getConsoleName(game) || 'Unknown'
    acc[consoleName] = (acc[consoleName] || 0) + 1
    return acc
  }, {})
  const topConsole = Object.entries(topConsoleGroup)
    .sort((a, b) => b[1] - a[1])[0]

  const consoleLabel = topConsole ? shortConsoleName(topConsole[0]) : 'None yet'
  const consoleCount = topConsole ? topConsole[1] : 0

  let message = `Progress: ${completed.length}/${total} completed (${percent.toFixed(1)}%)`
  if (inProgress.length) {
    message += ` | ${inProgress.length} in progress`
  }
  if (completed.length) {
    message += ` | Top console: ${consoleLabel} (${consoleCount} completed)`
  } else {
    message += ' | The adventure begins!'
  }

  res.json({
    ok: true,
    message,
    totals: {
      total,
      completed: completed.length,
      inProgress: inProgress.length
    },
    topConsole: topConsole ? { name: topConsole[0], count: consoleCount } : null
  })
})

app.get('/api/streamerbot/event', requireStreamerbotAuth, async (req, res) => {
  try {
    if (!activeEvent) {
      await refreshActiveEventFromStore()
    }
    const message = buildEventMessage(activeEvent)
    try {
      enqueueConnectorEvent(buildConnectorEvent({
        focus: 'event',
        durationMs: CONNECTOR_FOCUS_DURATION_MS
      }))
    } catch { }
    res.json({ ok: true, message, event: activeEvent || null })
  } catch (error) {
    res.status(500).json({ error: 'event_failed' })
  }
})

// Deprecated: keep for backwards compatibility with older Streamer.bot actions.
app.get('/api/streamerbot/psfest', requireStreamerbotAuth, async (req, res) => {
  try {
    if (!activeEvent) {
      await refreshActiveEventFromStore()
    }
    const message = buildEventMessage(activeEvent)
    res.json({ ok: true, message, event: activeEvent || null, deprecated: true })
  } catch (error) {
    res.status(500).json({ error: 'event_failed' })
  }
})

app.get('/api/streamerbot/leaderboard', requireStreamerbotAuth, (req, res) => {
  const idx = getIndex()
  const games = mergeWithGameLibrary(idx.games || [])
  const completed = games.filter(g => g.status === 'Completed')

  if (!completed.length) {
    return res.json({
      ok: true,
      message: 'No completed games yet! The leaderboard awaits your first conquest.'
    })
  }

  const consoleCounts = completed.reduce((acc, game) => {
    const name = getConsoleName(game) || 'Unknown'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})

  const topConsoles = Object.entries(consoleCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return String(a[0]).localeCompare(String(b[0]))
    })
    .slice(0, 3)

  const fastest = completed
    .filter(g => Number(g.completion_time) > 0)
    .sort((a, b) => Number(a.completion_time || 0) - Number(b.completion_time || 0))[0]

  const topRated = completed
    .filter(g => Number(g.rating) > 0)
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))[0]

  let message = 'PSFest Leaderboard:'
  if (topConsoles.length) {
    const consoleStats = topConsoles.map(([name, count]) => `${shortConsoleName(name)} (${count})`)
    message += ` Top consoles: ${consoleStats.join(', ')}`
  }
  if (fastest?.title) {
    const timeLabel = formatCompletionHours(fastest.completion_time) || `${Number(fastest.completion_time || 0).toFixed(1)}h`
    message += ` | Fastest: ${sanitizeText(fastest.title, 120)} (${timeLabel})`
  }
  if (topRated?.title) {
    const ratingValue = Number(topRated.rating || 0)
    const ratingLabel = Number.isFinite(ratingValue) ? ratingValue.toFixed(1) : String(topRated.rating || '0')
    message += ` | Top rated: ${sanitizeText(topRated.title, 120)} (${ratingLabel}/10)`
  }

  res.json({
    ok: true,
    message,
    topConsoles: topConsoles.map(([name, count]) => ({ name, count })),
    fastest: fastest ? { id: fastest.id, title: fastest.title, completion_time: fastest.completion_time } : null,
    topRated: topRated ? { id: topRated.id, title: topRated.title, rating: topRated.rating } : null
  })
})

app.get('/api/streamerbot/console', requireStreamerbotAuth, (req, res) => {
  const rawInput = String(req.query.console || req.query.q || '').trim()
  if (!rawInput) {
    return res.status(400).json({ ok: false, message: 'Usage: !console <console name>' })
  }
  const target = resolveConsoleInput(rawInput)
  if (!target) {
    return res.status(400).json({ ok: false, message: 'Usage: !console <console name>' })
  }
  const idx = getIndex()
  const games = mergeWithGameLibrary(idx.games || [])
  const consoleGames = games.filter(game => {
    const name = getConsoleName(game)
    if (!name) return false
    const key = normalizeConsoleKey(name)
    if (key === target.key) return true
    return key.includes(target.key) || target.key.includes(key)
  })

  if (!consoleGames.length) {
    return res.json({ ok: true, message: `No games found for ${target.name}.` })
  }

  const total = consoleGames.length
  const completed = consoleGames.filter(g => g.status === 'Completed')
  const inProgress = consoleGames.filter(g => g.status === 'In Progress' || g.status === 'Started')
  const percent = total ? ((completed.length / total) * 100) : 0
  const recentCompleted = completed
    .slice()
    .sort((a, b) => {
      const aDate = a.date_finished ? new Date(a.date_finished).getTime() : 0
      const bDate = b.date_finished ? new Date(b.date_finished).getTime() : 0
      if (aDate !== bDate) return bDate - aDate
      return String(a.title || '').localeCompare(String(b.title || ''))
    })[0]

  const consoleLabel = shortConsoleName(target.name)
  let message = `${consoleLabel} Progress: ${completed.length}/${total} completed (${percent.toFixed(1)}%)`
  if (inProgress.length) {
    message += ` | ${inProgress.length} in progress`
  }
  if (recentCompleted?.title) {
    message += ` | Recent: ${sanitizeText(recentCompleted.title, 120)}`
  } else if (!completed.length) {
    message += ` | Ready to start the ${consoleLabel} journey!`
  }

  res.json({
    ok: true,
    message,
    totals: { total, completed: completed.length, inProgress: inProgress.length },
    recent: recentCompleted ? { id: recentCompleted.id, title: recentCompleted.title } : null
  })
})

app.post('/api/streamerbot/suggest', requireStreamerbotAuth, async (req, res) => {
  try {
    const title = sanitizeText(req.body?.title, 120)
    const consoleName = sanitizeText(req.body?.console, 80)
    const note = sanitizeText(req.body?.note, 240)
    const requester = sanitizeText(req.body?.requester, 80) || 'viewer'
    if (!title) {
      return res.status(400).json({ ok: false, message: 'Usage: !suggest <game title> | <console> | <note>' })
    }
    await addSuggestion({
      title,
      console: consoleName,
      requester,
      note,
      source: 'streamerbot'
    })
    return res.json({ ok: true, message: `Suggestion received: ${title}` })
  } catch (error) {
    const code = error?.message || ''
    const message = code === 'suggestions_closed'
      ? 'Suggestions are currently closed.'
      : code === 'suggestions_full'
        ? 'Suggestion box is full right now.'
        : code === 'suggestions_console_full'
          ? 'Suggestions for that console are full right now.'
          : 'Suggestion service is unavailable right now.'
    res.status(400).json({ ok: false, message })
  }
})

app.get('/api/stats/pulse', requireAdmin, async (req, res) => {
  try {
    const range = req.query.range ? String(req.query.range) : 'all'
    const stats = buildPulseStats(range)
    const perGame = getPerGameTimesForRange(range).perGame
    const idx = getIndex()
    const games = Array.isArray(idx.games) ? idx.games : []
    const byId = new Map(games.map(game => [String(game.id), game]))
    const candidates = collectGenreCandidates(perGame, byId)
    const wantsRefresh = req.query.refreshGenres === '1'
    if (wantsRefresh) {
      await refreshGenresForGames(candidates, 8)
      return res.json(buildPulseStats(range))
    }
    refreshGenresForGames(candidates, 2).catch(() => { })
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: 'pulse_stats_failed' })
  }
})

// Timer state for overlays (server-calculated to avoid OBS Browser Source freezing)
// New model: accumulate only while current timer is running.
let activeEvent = null
let activeEventId = null
const BASE_TIMER_STATE = {
  // Control
  running: false,
  currentGameId: null,

  // Current game tracking
  currentStartedAt: null, // ms
  perGame: {}, // id -> accumulatedSec

  // Total tracking (accumulates while current timer is running)
  totalAccumulatedSec: 0,

  // Legacy compatibility fields (nullable)
  // Legacy compatibility (migrated on read)
  totalStartTime: null,
  currentGameStartTime: null,

  updatedAt: Date.now(),
}
let timerState = { ...BASE_TIMER_STATE }

const dirtyTimerGameIds = new Set()

function markTimerGameDirty(gameId) {
  const id = String(gameId || '').trim()
  if (id) dirtyTimerGameIds.add(id)
}

async function persistTimerState({ wait = false, gameIds = null } = {}) {
  if (!activeEventId) return
  saveJSON(TIMERS_FILE, timerState)
  if (!isPgEnabled()) {
    saveTimerStateToFile(activeEventId, timerState)
    return
  }
  const ids = Array.isArray(gameIds) ? gameIds : Array.from(dirtyTimerGameIds)
  const promise = saveTimerStateToDb(activeEventId, timerState, { gameIds: ids })
    .then(() => {
      if (ids && ids.length) {
        ids.forEach(id => dirtyTimerGameIds.delete(id))
      }
    })
    .catch(error => {
      console.warn('Timer DB persistence failed:', error.message || error)
    })
  if (wait) await promise
}

function getLivePerGameTimes() {
  const perGame = { ...(timerState.perGame || {}) }
  if (timerState.running && timerState.currentGameId && timerState.currentStartedAt) {
    const deltaSec = Math.max(0, Math.floor((Date.now() - timerState.currentStartedAt) / 1000))
    if (deltaSec > 0) {
      const id = String(timerState.currentGameId)
      perGame[id] = (perGame[id] || 0) + deltaSec
    }
  }
  return perGame
}

function getGenresForGame(game) {
  if (!game) return []
  const cached = getCachedGenres(game.id)
  if (cached && cached.length) return cached
  return detectGenres(game.title || '')
}

function parseRange(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === '7d') return { label: '7d', days: 7 }
  if (key === '30d') return { label: '30d', days: 30 }
  if (key === '90d') return { label: '90d', days: 90 }
  return { label: 'all', days: null }
}

function normalizeTimerStateAfterLoad() {
  if (!timerState.perGame) timerState.perGame = {}
  if (typeof timerState.currentAccumulatedSec === 'number' && timerState.currentGameId) {
    timerState.perGame[timerState.currentGameId] = (timerState.perGame[timerState.currentGameId] || 0) + timerState.currentAccumulatedSec
    delete timerState.currentAccumulatedSec
  }

  const now = Date.now()
  const timeSinceLastUpdate = now - (timerState.updatedAt || 0)

  if (timerState.running && timeSinceLastUpdate > 300_000) {
    console.log('Detected potential crash recovery scenario - timer was running for', Math.floor(timeSinceLastUpdate / 60000), 'minutes')
    timerState.currentStartedAt = now
    const gameProgress = timerState.currentGameId ? (timerState.perGame[timerState.currentGameId] || 0) : 0
    console.log('Crash recovery - resuming timer for game:', timerState.currentGameId, 'with', gameProgress, 'seconds accumulated')
  } else if (timerState.running) {
    timerState.currentStartedAt = now
  }

  if (timerState.totalAccumulatedSec < 0) {
    console.warn('Fixing negative total time')
    timerState.totalAccumulatedSec = 0
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

async function loadEventTimerState(eventId) {
  if (!eventId) return null
  if (isPgEnabled()) {
    const dbState = await loadTimerStateFromDb(eventId)
    if (dbState) return dbState
    const legacy = await loadLegacyTimerStateFromDb()
    if (legacy) {
      await saveTimerStateToDb(eventId, legacy, { gameIds: Object.keys(legacy.perGame || {}) })
      return legacy
    }
    return null
  }
  const fileState = loadTimerStateFromFile(eventId)
  if (fileState) return fileState
  return null
}

function getPerGameTimesForRange(range) {
  const now = Date.now()
  const parsed = parseRange(range)
  const rangeStart = parsed.days ? (now - parsed.days * 24 * 60 * 60 * 1000) : 0
  const metadata = getUserMetadata()
  const history = Array.isArray(metadata.history) ? metadata.history : []
  const perGame = {}
  for (const entry of history) {
    const ts = Number(entry?.timestamp || 0)
    if (!ts || ts < rangeStart) continue
    const duration = Math.max(0, Math.floor(Number(entry?.duration) || 0))
    if (!duration) continue
    const gameId = String(entry?.gameId || '').trim()
    if (!gameId) continue
    perGame[gameId] = (perGame[gameId] || 0) + duration
  }
  if (timerState.running && timerState.currentGameId && timerState.currentStartedAt) {
    const sessionStart = Math.max(rangeStart, Number(timerState.currentStartedAt) || now)
    const deltaSec = Math.max(0, Math.floor((now - sessionStart) / 1000))
    if (deltaSec > 0) {
      const id = String(timerState.currentGameId)
      perGame[id] = (perGame[id] || 0) + deltaSec
    }
  }
  return { perGame, range: parsed.label, rangeStart: parsed.days ? rangeStart : null }
}

function collectGenreCandidates(perGame, byId) {
  const out = []
  for (const id of Object.keys(perGame || {})) {
    const entry = getCachedGenreEntry(id)
    if (entry) continue
    const game = byId.get(String(id))
    if (!game || !game.title) continue
    out.push(game)
  }
  return out
}

async function refreshGenresForGames(candidates, limit = 3) {
  if (!IGDB_ENABLED) return
  if (!Array.isArray(candidates) || !candidates.length) return
  const mapping = loadPlatformMapping()
  const list = candidates.slice(0, Math.max(1, limit))
  for (const game of list) {
    if (!game?.title) continue
    const platformIds = mapping[game?.console?.id] || []
    try {
      const results = await IGDB.searchGamesWithGenres({ q: game.title, platformIds })
      const match = results.find(r => Array.isArray(r.genre_names) && r.genre_names.length) || results[0]
      const genres = Array.isArray(match?.genre_names) ? match.genre_names : []
      setCachedGenres(game.id, genres)
    } catch { }
  }
}

function buildPulseStats(range) {
  const idx = getIndex()
  const games = Array.isArray(idx.games) ? idx.games : []
  const byId = new Map(games.map(game => [String(game.id), game]))
  const rangeInfo = getPerGameTimesForRange(range)
  const perGame = rangeInfo.perGame
  const consoleMap = new Map()
  const genreMap = new Map()
  let totalSeconds = 0
  let trackedGames = 0

  for (const [id, raw] of Object.entries(perGame)) {
    const seconds = Math.max(0, Number(raw) || 0)
    if (!seconds) continue
    totalSeconds += seconds
    trackedGames += 1
    const game = byId.get(String(id))
    const consoleName = game?.console?.name || game?.console || 'Unknown'
    consoleMap.set(consoleName, (consoleMap.get(consoleName) || 0) + seconds)
    const genres = getGenresForGame(game)
    if (!genres.length) {
      genreMap.set('Other', (genreMap.get('Other') || 0) + seconds)
    } else {
      const split = seconds / genres.length
      for (const genre of genres) {
        genreMap.set(genre, (genreMap.get(genre) || 0) + split)
      }
    }
  }

  const toRows = (map, key) => {
    const rows = Array.from(map.entries()).map(([label, seconds]) => {
      const safeSeconds = Math.max(0, Number(seconds) || 0)
      return {
        [key]: label,
        seconds: Math.round(safeSeconds),
        hours: Number((safeSeconds / 3600).toFixed(2)),
        percent: totalSeconds ? Number(((safeSeconds / totalSeconds) * 100).toFixed(1)) : 0
      }
    })
    rows.sort((a, b) => b.seconds - a.seconds)
    return rows
  }

  return {
    generatedAt: Date.now(),
    updatedAt: timerState.updatedAt || null,
    range: rangeInfo.range,
    rangeSupported: true,
    rangeStart: rangeInfo.rangeStart,
    totalSeconds: Math.round(totalSeconds),
    totalHours: Number((totalSeconds / 3600).toFixed(2)),
    trackedGames,
    currentGameId: timerState.currentGameId || null,
    isRunning: !!timerState.running,
    perConsole: toRows(consoleMap, 'console'),
    perGenre: toRows(genreMap, 'genre')
  }
}

// Load persisted timer state if available with backup recovery
let timerStateLoaded = false
let timerStateLoadedFromDb = false

try {
  await ensureEventSchema()
  await ensureTimerSchema()
  activeEvent = await getActiveEvent()
  activeEventId = activeEvent?.id || null
} catch (eventError) {
  console.warn('Failed to load active event:', eventError.message)
}

try {
  if (activeEventId) {
    if (isPgEnabled()) {
      const dbState = await loadEventTimerState(activeEventId)
      if (dbState && typeof dbState === 'object') {
        timerState = { ...timerState, ...dbState, perGame: dbState.perGame || {} }
        timerStateLoaded = true
        timerStateLoadedFromDb = true
        console.log('Timer state loaded for active event')
      }
    } else {
      const fileState = await loadEventTimerState(activeEventId)
      if (fileState) {
        timerState = { ...timerState, ...fileState, perGame: fileState.perGame || {} }
        timerStateLoaded = true
        console.log('Timer state loaded from event file')
      }
    }
  }
} catch (dbError) {
  console.warn('Failed to load timer state:', dbError.message)
}

if (!timerStateLoaded) {
  try {
    const persistedTimers = loadJSON(TIMERS_FILE, null)
    if (persistedTimers && typeof persistedTimers === 'object') {
      timerState = { ...timerState, ...persistedTimers }
      timerStateLoaded = true
      console.log('Timer state loaded from primary file')
      if (!isPgEnabled() && activeEventId) {
        saveTimerStateToFile(activeEventId, timerState)
      }
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
}

if (isPgEnabled() && activeEventId && !timerStateLoadedFromDb) {
  try {
    const hasTotals = Object.values(timerState.perGame || {}).some(value => Number(value) > 0)
    const hasState = hasTotals ||
      Number(timerState.totalAccumulatedSec) > 0 ||
      !!timerState.currentGameId ||
      !!timerState.running
    if (hasState) {
      await saveTimerStateToDb(activeEventId, timerState, { gameIds: Object.keys(timerState.perGame || {}) })
      console.log('[Timer] Seeded database from file state.')
    }
  } catch (seedError) {
    console.warn('Failed to seed timer state to DB:', seedError.message)
  }
}

if (timerStateLoaded) {
  normalizeTimerStateAfterLoad()
}

async function switchActiveEvent(eventId) {
  const id = eventId ? String(eventId).trim() : null
  if (activeEventId && id === activeEventId) return activeEvent

  await persistTimerState({ wait: true })

  const nextEvent = await setActiveEvent(id)
  activeEvent = nextEvent
  activeEventId = nextEvent?.id || null
  dirtyTimerGameIds.clear()

  const nextState = activeEventId ? await loadEventTimerState(activeEventId) : null
  timerState = { ...BASE_TIMER_STATE, ...(nextState || {}) }
  normalizeTimerStateAfterLoad()
  return activeEvent
}

async function refreshActiveEventFromStore() {
  activeEvent = await getActiveEvent()
  activeEventId = activeEvent?.id || null
  dirtyTimerGameIds.clear()
  const nextState = activeEventId ? await loadEventTimerState(activeEventId) : null
  timerState = { ...BASE_TIMER_STATE, ...(nextState || {}) }
  normalizeTimerStateAfterLoad()
  return activeEvent
}

try {
  const totals = timerState.perGame || {}
  const hasTotals = Object.values(totals).some(value => Number(value) > 0)
  if (hasTotals) {
    const result = backfillHistoryFromTotals(totals, timerState.updatedAt || Date.now(), 'legacy_total')
    if (!result.skipped && result.added) {
      console.log(`[History] Backfilled ${result.added} entries from legacy timer totals.`)
    }
  }
} catch { }

app.get('/overlay/timers', requireOverlayAuth, (req, res) => {
  const now = Date.now()

  // Migrate from legacy fields once if present
  if ((timerState.totalStartTime || timerState.psfestStartTime || timerState.currentGameStartTime) && !timerState._migrated) {
    // If legacy start times were provided, assume running since those times.
    if (timerState.currentGameStartTime) {
      timerState.running = true
      timerState.currentStartedAt = new Date(timerState.currentGameStartTime).getTime()
    }
    const legacyStart = timerState.totalStartTime || timerState.psfestStartTime
    if (legacyStart) {
      // We cannot know the pause intervals; approximate by setting accumulated as time since start if running,
      // otherwise store zero. Future controls will manage accumulation precisely.
      const since = Math.max(0, Math.floor((now - new Date(legacyStart).getTime()) / 1000))
      timerState.totalAccumulatedSec = since
    }
    timerState._migrated = true
  }

  // Compute current timers with accumulation model
  const running = !!timerState.running
  const baseAccum = (timerState.currentGameId && timerState.perGame[timerState.currentGameId]) || 0
  let currentElapsed = baseAccum
  let totalElapsed = timerState.totalAccumulatedSec
  if (running && timerState.currentStartedAt) {
    const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
    currentElapsed += Math.max(0, deltaSec)
    totalElapsed += Math.max(0, deltaSec)
  }

  const currentGameTime = formatTime(Math.max(0, currentElapsed))
  const totalTime = formatTime(Math.max(0, totalElapsed), true)

  res.json({
    currentGameTime,
    totalTime,
    currentSeconds: Math.max(0, currentElapsed),
    totalSeconds: Math.max(0, totalElapsed),
    currentGameId: timerState.currentGameId,
    running,
    updatedAt: now,
  })
})

// Per-game fixed time (seconds accumulated) with formatted string
app.get('/overlay/timers/game/:id', requireOverlayAuth, (req, res) => {
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

app.post('/overlay/timers', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  const now = Date.now()
  const body = req.body || {}
  let settled = false

  function settleCurrent() {
    if (settled) return null
    if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
      const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
      if (deltaSec > 0) {
        const gid = timerState.currentGameId
        timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
        timerState.totalAccumulatedSec += deltaSec
        markTimerGameDirty(gid)
        settled = true
        return { gameId: gid, durationSec: deltaSec }
      }
    }
    return null
  }

  function logSession(eventType, entry) {
    if (!entry || !entry.gameId || !entry.durationSec) return
    try {
      appendHistoryEntry({
        timestamp: now,
        gameId: entry.gameId,
        duration: entry.durationSec,
        eventType
      })
    } catch { }
  }

  // Back-compat support (legacy fields)
  if ('totalStartTime' in body || 'psfestStartTime' in body || 'currentGameStartTime' in body || 'currentGameId' in body) {
    if (body.currentGameId !== undefined && body.currentGameId !== timerState.currentGameId) {
      // On game change, settle previous game's elapsed and switch focus
      const entry = settleCurrent()
      logSession('session_switch', entry)
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
    const start = body.totalStartTime ?? body.psfestStartTime
    if (start !== undefined) {
      // Approximate total accumulated; if start provided, set baseline to elapsed since then
      timerState.totalAccumulatedSec = start ? Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000)) : 0
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
    const entry = settleCurrent()
    logSession('session_end', entry)
    timerState.running = false
    timerState.currentStartedAt = null
  }
  if (body.resetCurrent) {
    const gid = timerState.currentGameId
    if (gid) {
      timerState.perGame[gid] = 0
      markTimerGameDirty(gid)
    }
    if (timerState.running) timerState.currentStartedAt = now
  }
  if (body.resetTotal) {
    timerState.totalAccumulatedSec = 0
  }
  if (body.currentGameId !== undefined && body.currentGameId !== timerState.currentGameId) {
    // Explicit game change
    const entry = settleCurrent()
    logSession('session_switch', entry)
    timerState.currentGameId = body.currentGameId
    if (timerState.running && timerState.currentGameId) timerState.currentStartedAt = now
    else {
      timerState.currentStartedAt = null
      if (!timerState.currentGameId) timerState.running = false
    }
  }

  if ('setCurrentSeconds' in body || 'setTotalSeconds' in body) {
    const hasCurrent = timerState.currentGameId
    if (timerState.running) settleCurrent()

    if ('setCurrentSeconds' in body && hasCurrent) {
      const rawSeconds = Number(body.setCurrentSeconds)
      if (Number.isFinite(rawSeconds)) {
        const nextSeconds = Math.max(0, Math.floor(rawSeconds))
        const gid = timerState.currentGameId
        const prevSeconds = Number(timerState.perGame[gid] || 0)
        timerState.perGame[gid] = nextSeconds
        markTimerGameDirty(gid)
        if (!('setTotalSeconds' in body)) {
          const delta = nextSeconds - prevSeconds
          timerState.totalAccumulatedSec = Math.max(0, Number(timerState.totalAccumulatedSec || 0) + delta)
        }
        if (timerState.running) timerState.currentStartedAt = now
      }
    }

    if ('setTotalSeconds' in body) {
      const rawTotal = Number(body.setTotalSeconds)
      if (Number.isFinite(rawTotal)) {
        timerState.totalAccumulatedSec = Math.max(0, Math.floor(rawTotal))
      }
    }
  }

  timerState.updatedAt = now
  // Persist
  await persistTimerState({ wait: true })
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
app.post('/wheel/spin', requireAdmin, requireCsrf, requireOrigin, (req, res) => {
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
app.get('/api/retroachievements/game/:gameId', requireOverlayAuth, async (req, res) => {
  try {
    const gameId = req.params.gameId
    const username = req.query.username || process.env.RA_USERNAME
    const apiKey = req.query.apiKey || process.env.RA_API_KEY

    if (!gameId || !username || !apiKey) {
      return res.status(400).json({ error: 'gameId, username, and apiKey required' })
    }

    const key = `${username}:${gameId}`
    const now = Date.now()
    const cached = raProxyCache.get(key)
    if (cached && now - cached.ts < raProxyCacheMs) {
      return res.json(cached.data)
    }
    if (raProxyInflight.has(key)) {
      const data = await raProxyInflight.get(key)
      return res.json(data)
    }

    const params = new URLSearchParams()
    params.set('y', apiKey)
    params.set('u', username)
    params.set('g', gameId)
    params.set('a', '1') // Include awards

    const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params.toString()}`

    const fetchPromise = (async () => {
      let attempt = 0
      let delay = 800
      while (true) {
        try {
          const response = await raProxyLimiter.schedule(() => axios.get(url, { timeout: 15000 }))
          return response.data
        } catch (error) {
          const status = error?.response?.status
          if (status === 429 && attempt < LIMITS.RA_MAX_RETRIES) {
            const retry = Number(error?.response?.headers?.['retry-after'])
            const wait = retry ? retry * 1000 : delay
            await new Promise(r => setTimeout(r, wait))
            attempt++
            delay = Math.min(delay * 2, 8000)
            continue
          }
          throw error
        }
      }
    })()

    raProxyInflight.set(key, fetchPromise)
    const data = await fetchPromise
    raProxyInflight.delete(key)
    raProxyCache.set(key, { ts: Date.now(), data })

    if (data && data.Achievements) {
      const achCount = Object.keys(data.Achievements).length
      console.log(`[RA Proxy] Fetched ${achCount} achievements for game ${gameId}`)
    } else {
      console.warn(`[RA Proxy] No achievements found in response for game ${gameId}`)
    }

    res.json(data)
  } catch (error) {
    console.error('RetroAchievements API error:', error.message)
    const key = `${req.query.username || process.env.RA_USERNAME}:${req.params.gameId}`
    raProxyInflight.delete(key)
    if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limited by RetroAchievements API' })
    } else {
      res.status(500).json({ error: 'RetroAchievements API request failed' })
    }
  }
})

app.get('/api/retroachievements/recent', requireOverlayAuth, async (req, res) => {
  try {
    const username = req.query.username || process.env.RA_USERNAME
    const apiKey = req.query.apiKey || process.env.RA_API_KEY
    const countRaw = Number(req.query.count)
    const count = Number.isFinite(countRaw) ? Math.min(Math.max(Math.floor(countRaw), 1), 200) : 50

    if (!username || !apiKey) {
      return res.status(400).json({ error: 'username and apiKey required' })
    }

    const key = `${username}:${count}`
    const now = Date.now()
    const cached = raRecentCache.get(key)
    if (cached && now - cached.ts < raRecentCacheMs) {
      return res.json(cached.data)
    }
    if (raRecentInflight.has(key)) {
      const data = await raRecentInflight.get(key)
      return res.json(data)
    }

    const params = new URLSearchParams()
    params.set('y', apiKey)
    params.set('u', username)
    params.set('c', String(count))
    const url = `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params.toString()}`

    const fetchPromise = (async () => {
      let attempt = 0
      let delay = 800
      while (true) {
        try {
          const response = await raProxyLimiter.schedule(() => axios.get(url, { timeout: 15000 }))
          return response.data
        } catch (error) {
          const status = error?.response?.status
          if (status === 429 && attempt < LIMITS.RA_MAX_RETRIES) {
            const retry = Number(error?.response?.headers?.['retry-after'])
            const wait = retry ? retry * 1000 : delay
            await new Promise(r => setTimeout(r, wait))
            attempt++
            delay = Math.min(delay * 2, 8000)
            continue
          }
          throw error
        }
      }
    })()

    raRecentInflight.set(key, fetchPromise)
    const data = await fetchPromise
    raRecentInflight.delete(key)
    raRecentCache.set(key, { ts: Date.now(), data })

    res.json(data)
  } catch (error) {
    console.error('RetroAchievements recent API error:', error.message)
    const username = req.query.username || process.env.RA_USERNAME || ''
    const countRaw = Number(req.query.count)
    const count = Number.isFinite(countRaw) ? Math.min(Math.max(Math.floor(countRaw), 1), 200) : 50
    const key = `${username}:${count}`
    raRecentInflight.delete(key)
    if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limited by RetroAchievements API' })
    } else {
      res.status(500).json({ error: 'RetroAchievements API request failed' })
    }
  }
})

// ---- Admin OAuth (Twitch) ----
app.get('/auth/twitch', (req, res) => {
  if (!twitchClientId || !twitchRedirectUri) {
    return res.status(500).send('OAuth not configured')
  }
  const state = crypto.randomBytes(16).toString('hex')
  req.session.oauthState = state
  const params = new URLSearchParams({
    client_id: twitchClientId,
    redirect_uri: twitchRedirectUri,
    response_type: 'code',
    scope: 'user:read:email',
    state
  })
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`)
})

app.get('/auth/twitch/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(403).send('Invalid OAuth state')
    }
    if (!twitchClientId || !twitchClientSecret) {
      return res.status(500).send('OAuth not configured')
    }

    const tokenParams = new URLSearchParams({
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: twitchRedirectUri
    })
    const tokenRes = await axios.post(`https://id.twitch.tv/oauth2/token?${tokenParams.toString()}`)
    const accessToken = tokenRes.data.access_token

    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': twitchClientId,
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const user = userRes.data?.data?.[0]
    if (!isAdminUser(user)) {
      return res.status(403).send('Not authorized')
    }

    req.session.admin = {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      profileImage: user.profile_image_url || null
    }
    req.session.csrfToken = crypto.randomBytes(16).toString('hex')
    req.session.oauthState = null
    res.redirect(adminAppUrl)
  } catch (error) {
    console.error('OAuth callback error:', error.message)
    res.status(500).send('OAuth login failed')
  }
})

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true })
  })
})

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.admin) {
    return res.status(401).json({ user: null })
  }
  res.json({ user: req.session.admin, csrfToken: req.session.csrfToken })
})

// ---- Public data endpoints ----
const PUBLIC_STATUSES = new Set(['Hidden', 'Planned', 'Queued', 'Completed'])
const SUGGESTION_STATUSES = new Set(['open', 'accepted', 'declined'])

const suggestionLimiter = rateLimit({
  windowMs: Number(process.env.SUGGESTIONS_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.SUGGESTIONS_RATE_MAX || 6),
  standardHeaders: true,
  legacyHeaders: false
})

const searchLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { results: [] } // Return empty results on limit to avoid breaking UI
})

function hasSuggestionApiKey(req) {
  const key = req.get('x-suggestions-key')
  return !!(process.env.SUGGESTIONS_API_KEY && key === process.env.SUGGESTIONS_API_KEY)
}

async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET) return { ok: true, skipped: true }
  if (!token) return { ok: false, error: 'captcha_required' }
  const payload = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET,
    response: token,
    remoteip: ip || ''
  })
  const resp = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', payload)
  if (!resp.data?.success) {
    return { ok: false, error: 'captcha_failed' }
  }
  return { ok: true }
}

app.get('/api/public/search-games', searchLimiter, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase()
    if (!q) return res.json({ results: [] })

    const idx = getIndex()
    const games = idx.games || []

    const matches = games
      .filter(g => g.title.toLowerCase().includes(q))
      .slice(0, 10)
      .map(g => ({
        id: g.id,
        title: g.title,
        console: (g.console && typeof g.console === 'object') ? g.console.name : g.console
      }))

    res.json({ results: matches })
  } catch (error) {
    res.status(500).json({ error: 'search_failed' })
  }
})

app.get('/api/public/games', async (req, res) => {
  try {
    const statusFilter = req.query.status ? String(req.query.status) : null
    const items = await listPublicGames()
    const filtered = items.filter(item => {
      const status = item.public_status || item.publicStatus || 'Hidden'
      if (statusFilter) return status === statusFilter
      return status !== 'Hidden'
    })
    res.json({ games: filtered })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_list_public_games' })
  }
})

app.get('/api/public/completed-unreviewed', async (req, res) => {
  try {
    const idx = getIndex()
    const allGames = mergeWithGameLibrary(idx.games || [])
    const publicItems = await listPublicGames()
    const publicById = new Map(publicItems.map(item => [String(item.id), item]))
    const results = allGames
      .filter(game => game.status === 'Completed')
      .filter(game => {
        const meta = publicById.get(String(game.id))
        if (!meta) return true
        const status = meta.public_status || meta.publicStatus || 'Hidden'
        if (status === 'Hidden') return false
        if (status !== 'Completed') return false
        const reviewTitle = String(meta.publicReviewTitle || meta.public_review_title || '').trim()
        const reviewText = String(meta.publicReview || meta.public_review || '').trim()
        return !reviewTitle && !reviewText
      })
      .map(game => ({
        id: game.id,
        title: game.title,
        console: game.console,
        image_url: game.image_url ?? null,
        release_year: game.release_year ?? game.releaseYear ?? null,
        publisher: game.publisher ?? null,
        date_finished: game.date_finished ?? null
      }))
      .sort((a, b) => {
        const aDate = a.date_finished ? new Date(a.date_finished).getTime() : 0
        const bDate = b.date_finished ? new Date(b.date_finished).getTime() : 0
        if (aDate !== bDate) return bDate - aDate
        return String(a.title || '').localeCompare(String(b.title || ''))
      })
    res.json({ games: results })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_list_unreviewed_completed' })
  }
})

app.get('/api/public/games/:gameId/view', async (req, res) => {
  try {
    const data = await getPublicMetadata(req.params.gameId)
    if (!data) return res.status(404).json({ error: 'not_found' })
    const status = data.publicStatus || data.public_status || 'Hidden'
    if (status === 'Hidden') return res.status(404).json({ error: 'not_found' })
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_public_game' })
  }
})

app.get('/api/public/site', async (req, res) => {
  try {
    const settings = await getPublicSettings()
    res.json({ site: settings.site || {} })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_public_site' })
  }
})

app.get('/api/public/current-game', (req, res) => {
  res.json({ current: overlayState.current || null, updatedAt: overlayState.updatedAt })
})

app.get('/api/public/stream-status', async (req, res) => {
  try {
    const now = Date.now()
    if (streamCache.data && now - streamCache.ts < streamCacheMs) {
      return res.json(streamCache.data)
    }
    const settings = await getPublicSettings()
    const site = settings.site || {}
    const twitchChannel = site.twitchChannel || process.env.TWITCH_CHANNEL || ''
    const youtubeChannelId = site.youtubeChannelId || process.env.YOUTUBE_CHANNEL_ID || ''

    let twitch = { enabled: false }
    let youtube = { enabled: false }
    try {
      twitch = await fetchTwitchStatus(twitchChannel)
    } catch (error) {
      twitch = { enabled: !!twitchChannel, error: 'twitch_failed' }
    }
    try {
      youtube = await fetchYouTubeStatus({ channelId: youtubeChannelId, uploadsLimit: site.youtubeUploadsLimit })
    } catch (error) {
      youtube = { enabled: !!youtubeChannelId, error: 'youtube_failed' }
    }

    try {
      const notifySettings = getUserSettings()?.notifications || {}
      if (typeof twitch.isLive === 'boolean') {
        if (twitch.isLive && streamLiveState.twitch !== true) {
          await notifier.streamStarted({
            platform: 'Twitch',
            title: twitch.title || '',
            url: twitch.url || ''
          }, notifySettings)
        }
        streamLiveState.twitch = twitch.isLive
      }
      if (typeof youtube.isLive === 'boolean') {
        if (youtube.isLive && streamLiveState.youtube !== true) {
          const videoId = youtube.live?.videoId || ''
          await notifier.streamStarted({
            platform: 'YouTube',
            title: youtube.live?.title || '',
            url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''
          }, notifySettings)
        }
        streamLiveState.youtube = youtube.isLive
      }
    } catch { }

    const payload = { twitch, youtube, updatedAt: now }
    streamCache.ts = now
    streamCache.data = payload
    res.json(payload)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_stream_status' })
  }
})

app.get('/api/public/games/:gameId', requireAdmin, async (req, res) => {
  try {
    const data = await getPublicMetadata(req.params.gameId)
    if (!data) return res.status(404).json({ error: 'not_found' })
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_public_game' })
  }
})

app.post('/api/public/games/:gameId', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const gameId = req.params.gameId
    const body = req.body || {}
    const updates = {}

    if (body.publicStatus) {
      const status = String(body.publicStatus)
      if (!PUBLIC_STATUSES.has(status)) {
        return res.status(400).json({ error: 'invalid_public_status' })
      }
      updates.publicStatus = status
    }

    if ('publicRating' in body) {
      if (body.publicRating === null || body.publicRating === '') {
        updates.publicRating = null
      } else {
        const rating = Number(body.publicRating)
        updates.publicRating = Number.isFinite(rating) ? Math.min(10, Math.max(0, rating)) : null
      }
    }

    if ('publicReview' in body) {
      updates.publicReview = sanitizeText(body.publicReview, 4000)
    }

    if ('publicReviewTitle' in body) {
      updates.publicReviewTitle = sanitizeText(body.publicReviewTitle, 200)
    }

    if ('publicVideoUrl' in body) {
      updates.publicVideoUrl = sanitizeText(body.publicVideoUrl, 500)
    }

    if ('achievements' in body && Array.isArray(body.achievements)) {
      updates.achievements = body.achievements
    }

    if (body.game && typeof body.game === 'object') {
      updates.game = {
        id: String(body.game.id || gameId),
        title: sanitizeText(body.game.title, 200),
        console: sanitizeText(body.game.console, 120),
        image_url: body.game.image_url || null,
        release_year: body.game.release_year || null,
        publisher: sanitizeText(body.game.publisher, 200)
      }
    }

    const updated = await updatePublicMetadata(gameId, updates)
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/public/games/:gameId', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    await deletePublicMetadata(req.params.gameId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/public/suggestions/settings', async (req, res) => {
  try {
    const stats = await getSuggestionStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_suggestion_settings' })
  }
})

app.post('/api/public/suggestions', async (req, res, next) => {
  if (!hasSuggestionApiKey(req)) return suggestionLimiter(req, res, next)
  return next()
}, async (req, res) => {
  try {
    const captchaToken = req.body?.captchaToken
    if (!hasSuggestionApiKey(req)) {
      const captcha = await verifyTurnstile(captchaToken, req.ip)
      if (!captcha.ok) return res.status(400).json({ error: captcha.error || 'captcha_failed' })
    }

    const title = sanitizeText(req.body?.title, 200)
    const consoleName = sanitizeText(req.body?.console, 120)
    const requester = sanitizeText(req.body?.requester, 120)
    const note = sanitizeText(req.body?.note, 500)
    const source = hasSuggestionApiKey(req) ? 'streamerbot' : 'public'

    const suggestion = await addSuggestion({ title, console: consoleName, requester, note, source })
    try {
      const settings = getUserSettings()
      await notifier.suggestionReceived(suggestion, settings?.notifications || {})
    } catch { }
    res.json(suggestion)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.get('/api/admin/suggestions', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null
    const items = await listSuggestions({ status })
    res.json({ suggestions: items })
  } catch (error) {
    res.status(500).json({ error: 'failed_to_list_suggestions' })
  }
})

app.patch('/api/admin/suggestions/:id', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const updates = {}
    if (req.body?.status) {
      const status = String(req.body.status)
      if (!SUGGESTION_STATUSES.has(status)) return res.status(400).json({ error: 'invalid_status' })
      updates.status = status
    }
    if ('note' in req.body) updates.note = sanitizeText(req.body.note, 500)
    const updated = await updateSuggestion(req.params.id, updates)
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/admin/public-settings', requireAdmin, async (req, res) => {
  try {
    const settings = await getPublicSettings()
    res.json(settings)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_public_settings' })
  }
})

app.post('/api/admin/public-settings', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const updates = {}
    if ('suggestions_open' in req.body) {
      updates.suggestions_open = !!req.body.suggestions_open
    }
    if ('max_open' in req.body) {
      const maxOpen = Number(req.body.max_open)
      updates.max_open = Number.isFinite(maxOpen) ? Math.max(0, Math.min(1000, maxOpen)) : 0
    }
    if ('console_limits' in req.body) {
      if (req.body.console_limits && typeof req.body.console_limits === 'object') {
        const normalized = {}
        for (const [key, value] of Object.entries(req.body.console_limits)) {
          const cleanKey = String(key || '').trim().toLowerCase()
          if (!cleanKey) continue
          const limit = Number(value)
          normalized[cleanKey] = Number.isFinite(limit) ? Math.max(0, Math.min(1000, limit)) : 0
        }
        updates.console_limits = normalized
      } else {
        updates.console_limits = {}
      }
    }
    if ('site' in req.body) {
      updates.site = req.body.site || {}
    }
    const updated = await updatePublicSettings(updates)
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/admin/overlay-settings', requireAdmin, async (req, res) => {
  try {
    const settings = await getOverlaySettings()
    res.json(settings)
  } catch (error) {
    res.status(500).json({ error: 'failed_to_get_overlay_settings' })
  }
})

app.post('/api/admin/overlay-settings', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const updates = req.body || {}
    const settings = await updateOverlaySettings(updates)
    res.json(settings)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/admin/events', requireAdmin, async (req, res) => {
  try {
    const events = await listEvents()
    res.json({ events, activeEventId: activeEventId || null })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/admin/events/active', requireAdmin, async (req, res) => {
  try {
    if (!activeEvent) {
      await refreshActiveEventFromStore()
    }
    res.json({ event: activeEvent || null })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/admin/events', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const created = await createEvent(req.body || {})
    res.json(created)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.patch('/api/admin/events/:id', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const updated = await updateEvent(req.params.id, req.body || {})
    if (activeEventId && updated.id === activeEventId) activeEvent = updated
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.delete('/api/admin/events/:id', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    await deleteEvent(req.params.id)
    await refreshActiveEventFromStore()
    res.json({ ok: true, activeEventId: activeEventId || null })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/api/admin/events/active', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const eventId = req.body?.eventId
    const next = await switchActiveEvent(eventId)
    res.json({ ok: true, event: next })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Register user metadata endpoints
app.use('/api/user', requireAdmin, (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return requireCsrf(req, res, () => requireOrigin(req, res, next))
  }
  return next()
})
createUserMetadataEndpoints(app)

try {
  await ensurePublicSchema()
  await ensureOverlaySchema()
  await ensureCoverSchema()
  if (isPgEnabled()) {
    console.log('[Startup] Postgres ready for public data.')
  }
} catch (error) {
  console.error('[Startup] Failed to initialize public schema:', error.message)
}

const port = process.env.PORT || 8787
app.listen(port, () => {
  console.log(`IGDB proxy on :${port}`)
  try {
    console.log('[Overlay] Data dir:', DATA_DIR)
    console.log('[Overlay] Timers file:', TIMERS_FILE)
    console.log('[Overlay] Current file:', CURRENT_FILE)
  } catch { }
  try {
    if (FLAGS.LIBRARY_BUILD_ON_START) {
      console.log('[Startup] Library build on start enabled; starting job...')
      const jobId = startBuild({
        apiKey: process.env.RA_API_KEY || process.env.VITE_RA_API_KEY,
        consoles: FLAGS.ALL_CONSOLES_ENABLED ? [] : FLAGS.CONSOLES_ALLOWLIST
      })
      console.log('[Startup] Library build job:', jobId)
    }
    if (FLAGS.COVER_PREFETCH_ENABLED) {
      console.log('[Startup] Cover prefetch enabled; starting job with RA fallback...')
      const jobId = startCoverPrefetch({ limitConcurrency: 3, saveEvery: 50 })
      console.log('[Startup] Cover prefetch job:', jobId)
    }
  } catch (e) { console.warn('[Startup] background jobs failed to start:', e?.message || e) }
})

function scheduleNightlyBuild() {
  const hour = Number(process.env.LIBRARY_REFRESH_HOUR || 3)
  const minute = Number(process.env.LIBRARY_REFRESH_MINUTE || 0)
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  const delay = next.getTime() - now.getTime()
  console.log(`[Scheduler] Next nightly library refresh in ${(delay / 1000 / 60).toFixed(1)} minutes`)
  setTimeout(() => {
    try {
      const apiKey = process.env.RA_API_KEY || process.env.VITE_RA_API_KEY
      const consoles = FLAGS.ALL_CONSOLES_ENABLED ? undefined : FLAGS.CONSOLES_ALLOWLIST
      const jobId = startBuild({ apiKey, consoles })
      console.log('[Scheduler] Nightly library build started:', jobId)
    } catch (error) {
      console.warn('[Scheduler] Nightly library build failed:', error.message)
    } finally {
      scheduleNightlyBuild()
    }
  }, delay)
}

if (process.env.LIBRARY_REFRESH_NIGHTLY === 'true') {
  scheduleNightlyBuild()
}

// Periodic persistence while running to reduce write frequency (every 15s)
// Also create backup saves for crash recovery
setInterval(() => {
  const now = Date.now()
  if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
    const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
    if (deltaSec > 0) {
      const gid = timerState.currentGameId
      timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
      timerState.totalAccumulatedSec += deltaSec
      markTimerGameDirty(gid)
      timerState.currentStartedAt = now
      timerState.updatedAt = now

      // Save primary state
      persistTimerState().catch(() => { })

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
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}, performing graceful shutdown...`)

  try {
    const now = Date.now()

    // Checkpoint any running timer state
    if (timerState.running && timerState.currentStartedAt && timerState.currentGameId) {
      const deltaSec = Math.floor((now - timerState.currentStartedAt) / 1000)
      if (deltaSec > 0) {
        const gid = timerState.currentGameId
        timerState.perGame[gid] = (timerState.perGame[gid] || 0) + deltaSec
        timerState.totalAccumulatedSec += deltaSec
        markTimerGameDirty(gid)
        console.log(`Checkpointing ${deltaSec} seconds for game ${gid}`)
      }
      timerState.currentStartedAt = now
      timerState.updatedAt = now
    }

    // Save state with retry logic
    let saveAttempts = 3
    while (saveAttempts > 0) {
      try {
        await persistTimerState({ wait: true })
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
    process.on(sig, () => {
      gracefulShutdown(sig).catch(error => {
        console.error('Graceful shutdown failed:', error.message || error)
        process.exit(1)
      })
    })
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
        timerState.totalAccumulatedSec += deltaSec
        markTimerGameDirty(gid)
      }
      timerState.currentStartedAt = now
      timerState.updatedAt = now
    }

    persistTimerState({ wait: false }).catch(() => { })

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
  return (req, res, next) => requireAdmin(req, res, () => handler(req, res, next))
}

// GET /api/consoles (always on for v2 UI)
app.get('/api/consoles', gated(async (req, res) => {
  try {
    const apiKey = req.query.apiKey || process.env.RA_API_KEY
    const list = await RA.listConsoles({ apiKey, activeOnly: true, gameSystemsOnly: true })
    const mapping = loadPlatformMapping()
    const consoles = list.map(c => ({ ...c, igdbPlatformIds: mapping[c.id] || [] }))
    res.json({ consoles })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_list_consoles' })
  }
}))

// GET /api/games (paged) — always on for v2 UI
app.get('/api/games', gated(async (req, res) => {
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
}))

// POST /api/covers/resolve — always on for v2 UI
app.post('/api/covers/resolve', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const { title, consoleId, raGameId, gameId, imageUrl } = req.body || {}
    if (!title) return res.status(400).json({ error: 'title_required' })
    const mapping = loadPlatformMapping()
    const platforms = consoleId ? (mapping[consoleId] || []) : []
    let igdbHit = null
    try {
      const results = await IGDB.searchGames({ q: title, platformIds: platforms })
      if (results.length && results[0].image_id) {
        igdbHit = results[0]
      }
    } catch (error) {
      console.warn('[Covers] IGDB resolve failed:', error?.message || error)
    }

    if (igdbHit) {
      const url = IGDB.coverUrlFromImageId(igdbHit.image_id)
      const localPath = await cacheCoverFromUrl(url, {
        origin: 'igdb',
        gameId: gameId || null,
        consoleId: consoleId || null
      })
      const release_year = igdbHit.first_release_date ? new Date(igdbHit.first_release_date * 1000).getUTCFullYear().toString() : null
      const publisher = igdbHit.publisher_name || null
      return res.json({ cover: { localPath, originalUrl: url }, matchedTitle: igdbHit.name, release_year, publisher, source: 'igdb' })
    }

    const normalizeRaMediaUrl = (input) => {
      try {
        const url = new URL(String(input))
        if (!url.hostname.includes('retroachievements.org')) return String(input)
        const segments = url.pathname.split('/').filter(Boolean)
        const normalized = []
        for (const seg of segments) {
          if (normalized.length && seg.toLowerCase() === 'images' && normalized[normalized.length - 1].toLowerCase() === 'images') {
            continue
          }
          normalized.push(seg)
        }
        url.pathname = `/${normalized.join('/')}`
        return url.toString()
      } catch {
        return String(input)
      }
    }

    const raImageUrl = (pathStr) => {
      if (!pathStr) return null
      const s = String(pathStr).trim()
      if (s.startsWith('http://') || s.startsWith('https://')) return normalizeRaMediaUrl(s)
      const cleaned = s.replace(/^\/+/, '')
      const p = cleaned.toLowerCase().startsWith('images/') ? cleaned : `Images/${cleaned}`
      return normalizeRaMediaUrl(`https://media.retroachievements.org/${p}`)
    }

    const resolvedRaId = raGameId || RA.extractRaGameId(gameId)
    const { apiKey } = getRAAuth()

    const tryRaApi = async () => {
      let attempt = 0
      let delay = 800
      let triedNoKey = false
      let useKey = !!apiKey
      while (true) {
        const params = new URLSearchParams()
        if (useKey) params.set('y', apiKey)
        params.set('i', String(resolvedRaId))
        const raUrl = `https://retroachievements.org/API/API_GetGame.php?${params.toString()}`
        try {
          const { data } = await raLimiter.schedule(() => axios.get(raUrl, { timeout: 15000 }))
          const raCover = raImageUrl(data.ImageBoxArt)
          if (!raCover) break
          const localPath = await cacheCoverFromUrl(raCover, {
            origin: 'ra',
            gameId: gameId || null,
            consoleId: consoleId || null
          })
          const release_year = data.Released ? String(data.Released) : null
          const publisher = data.Publisher ? String(data.Publisher) : null
          return { cover: { localPath, originalUrl: raCover }, matchedTitle: data.Title || title, release_year, publisher, source: 'ra' }
        } catch (error) {
          const status = error?.response?.status
          if ((status === 404 || status === 401 || status === 403) && useKey && !triedNoKey) {
            triedNoKey = true
            useKey = false
            attempt = 0
            delay = 800
            continue
          }
          if (status === 429 && attempt < LIMITS.RA_MAX_RETRIES) {
            const retry = Number(error?.response?.headers?.['retry-after'])
            const wait = retry ? retry * 1000 : delay
            await new Promise(r => setTimeout(r, wait))
            attempt++
            delay = Math.min(delay * 2, 8000)
            continue
          }
          console.warn('[Covers] RA resolve failed:', {
            status,
            raGameId: resolvedRaId,
            message: error?.message || error
          })
          break
        }
      }
      return null
    }

    if (resolvedRaId) {
      const raResult = await tryRaApi()
      if (raResult) return res.json(raResult)
    }

    if (imageUrl) {
      try {
        const normalizedUrl = raImageUrl(imageUrl) || imageUrl
        const localPath = await cacheCoverFromUrl(normalizedUrl, {
          origin: 'ra',
          gameId: gameId || null,
          consoleId: consoleId || null
        })
        return res.json({ cover: { localPath, originalUrl: normalizedUrl }, matchedTitle: title, source: 'ra' })
      } catch (error) {
        console.warn('[Covers] RA image url fetch failed:', error?.message || error)
      }
    }

    if (consoleId && apiKey) {
      const normalizedTitle = String(title || '').trim().toLowerCase()
      let list = await RA.listGamesForConsole({ apiKey, consoleId, onlyWithAchievements: true, excludeNonGames: true })
      let match = null
      if (resolvedRaId) {
        match = list.find(g => Number(g?.sources?.ra?.gameId) === Number(resolvedRaId)) || null
      }
      if (!match && normalizedTitle) {
        match = list.find(g => String(g.title || '').trim().toLowerCase() === normalizedTitle) || null
      }
      if (match && !match.image_url) {
        list = await RA.listGamesForConsole({
          apiKey,
          consoleId,
          onlyWithAchievements: true,
          excludeNonGames: true,
          forceRefresh: true
        })
        match = list.find(g => Number(g?.sources?.ra?.gameId) === Number(resolvedRaId)) ||
          list.find(g => String(g.title || '').trim().toLowerCase() === normalizedTitle) || null
      }
      if (match?.image_url) {
        const localPath = await cacheCoverFromUrl(match.image_url, {
          origin: 'ra',
          gameId: gameId || null,
          consoleId: consoleId || null
        })
        return res.json({ cover: { localPath, originalUrl: match.image_url }, matchedTitle: match.title || title, source: 'ra' })
      }
    }

    res.status(404).json({ error: 'not_found' })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_resolve_cover' })
  }
})

// Jobs: build library and status
app.post('/api/library/build', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const apiKey = req.body?.apiKey || process.env.RA_API_KEY
    const consoles = Array.isArray(req.body?.consoles)
      ? req.body.consoles
      : (FLAGS.ALL_CONSOLES_ENABLED ? [] : FLAGS.CONSOLES_ALLOWLIST)
    const jobId = startBuild({ apiKey, consoles })
    res.json({ started: true, jobId })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_start_build' })
  }
})

app.get('/api/library/status/:jobId', requireAdmin, (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'job_not_found' })
  res.json(job)
})

// Start cover prefetch for all games missing covers
app.post('/api/library/covers', requireAdmin, requireCsrf, requireOrigin, async (req, res) => {
  try {
    const consoleIds = Array.isArray(req.body?.consoleIds) ? req.body.consoleIds : []
    const jobId = startCoverPrefetch({
      limitConcurrency: Number(req.body?.concurrency) || 3,
      saveEvery: Number(req.body?.saveEvery) || 50,
      consoleIds
    })
    res.json({ started: true, jobId })
  } catch (e) {
    res.status(500).json({ error: 'failed_to_start_cover_prefetch' })
  }
})
