import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isPgEnabled, query } from './db.js'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const PUBLIC_METADATA_FILE = path.join(DATA_DIR, 'public-metadata.json')
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'viewer-suggestions.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'public-settings.json')

const DEFAULT_PUBLIC = {
  version: 1,
  games: {},
  lastUpdated: null
}

const DEFAULT_SITE_THEME = {
  admin: {
    brand: '#5ecf86',
    accent: '#ffffff',
    bg: '#080a09',
    panel: '#111413',
    panel2: '#0c0e0d',
    text: '#f0fdf4',
    muted: 'rgba(240, 253, 244, 0.6)',
    border: 'rgba(94, 207, 134, 0.15)'
  },
  public: {
    bg: '#060807',
    bgDark: '#050605',
    bg2: '#0b120d',
    text: '#f0fdf4',
    muted: 'rgba(240, 253, 244, 0.65)',
    primary: '#5ecf86',
    accent: '#66b7ff',
    lime: '#9dff6d',
    card: 'rgba(12, 16, 14, 0.88)',
    border: 'rgba(94, 207, 134, 0.18)',
    nav: 'rgba(6, 8, 7, 0.85)',
    shadow: '0 24px 50px rgba(0, 0, 0, 0.55)',
    soft: 'rgba(255, 255, 255, 0.04)',
    font: 'Manrope, system-ui, sans-serif',
    radius: '12px'
  }
}

const DEFAULT_SITE = {
  title: 'Pannboo',
  tagline: 'Bamboo-themed RetroAchievements creator hub.',
  heroTitle: 'Live retro journeys, one achievement at a time.',
  heroSubtitle: 'Track the backlog, read the reviews, and influence what I play next.',
  ctaLabel: 'Watch Live',
  ctaUrl: '',
  aboutTitle: 'About Pannboo',
  aboutText: '',
  scheduleText: '',
  twitchChannel: '',
  twitchUrl: '',
  youtubeChannelId: '',
  youtubeUrl: '',
  youtubeUploadsLimit: 3,
  showTwitch: true,
  showYouTube: true,
  showSchedule: true,
  showSuggestions: true,
  showPlanned: true,
  showCompleted: true,
  showFeatured: true,
  showAbout: true,
  showLinks: true,
  featuredGameId: '',
  links: [],
  theme: { ...DEFAULT_SITE_THEME }
}

const DEFAULT_SETTINGS = {
  suggestions_open: true,
  max_open: 100,
  console_limits: {},
  site: { ...DEFAULT_SITE }
}

function mapPublicRow(row) {
  return {
    id: row.game_id,
    publicStatus: row.public_status,
    publicRating: row.public_rating,
    publicReviewTitle: row.public_review_title,
    publicReview: row.public_review,
    publicVideoUrl: row.public_video_url,
    game: row.game,
    updatedAt: row.updated_at
  }
}

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save public data:', error)
    return false
  }
}

export async function ensurePublicSchema() {
  if (!isPgEnabled()) return
  await query(`
    create table if not exists public_games (
      game_id text primary key,
      public_status text not null default 'Hidden',
      public_rating numeric,
      public_review_title text,
      public_review text,
      public_video_url text,
      game jsonb,
      updated_at timestamptz not null default now()
    )
  `)
  await query(`
    create table if not exists public_settings (
      id int primary key default 1,
      suggestions_open boolean not null default true,
      max_open int not null default 100,
      console_limits jsonb not null default '{}'::jsonb,
      site jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `)
  await query(`alter table public_settings add column if not exists site jsonb not null default '{}'::jsonb`)
  await query(`insert into public_settings (id) values (1) on conflict do nothing`)
  await query(`
    create table if not exists suggestions (
      id uuid primary key,
      title text not null,
      console text,
      console_key text,
      requester text,
      note text,
      source text,
      status text not null default 'open',
      created_at timestamptz not null default now(),
      updated_at timestamptz
    )
  `)
  await query(`create index if not exists suggestions_status_idx on suggestions(status)`)
  await query(`create index if not exists suggestions_console_idx on suggestions(console_key)`)
}

function normalizeConsoleKey(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeConsoleLimits(limits) {
  if (!limits || typeof limits !== 'object') return {}
  const out = {}
  for (const [key, value] of Object.entries(limits)) {
    const normalized = normalizeConsoleKey(key)
    if (!normalized) continue
    const num = Number(value)
    if (Number.isFinite(num) && num >= 0) out[normalized] = num
  }
  return out
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, num))
}

function cleanText(value, maxLen) {
  if (value === null || value === undefined) return ''
  const s = String(value).trim()
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function normalizeLinks(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(item => ({
      label: cleanText(item?.label, 40),
      url: cleanText(item?.url, 240),
      kind: cleanText(item?.kind, 20)
    }))
    .filter(item => item.label && item.url)
    .slice(0, 12)
}

function normalizeSiteTheme(theme, current = DEFAULT_SITE_THEME) {
  const base = current || DEFAULT_SITE_THEME
  const input = theme || {}
  const adminBase = base.admin || DEFAULT_SITE_THEME.admin
  const publicBase = base.public || DEFAULT_SITE_THEME.public
  const adminInput = input.admin || {}
  const publicInput = input.public || {}

  const admin = {
    brand: cleanText(adminInput.brand || adminBase.brand, 32),
    accent: cleanText(adminInput.accent || adminBase.accent, 32),
    bg: cleanText(adminInput.bg || adminBase.bg, 32),
    panel: cleanText(adminInput.panel || adminBase.panel, 32),
    panel2: cleanText(adminInput.panel2 || adminBase.panel2, 32),
    text: cleanText(adminInput.text || adminBase.text, 32),
    muted: cleanText(adminInput.muted || adminBase.muted, 48),
    border: cleanText(adminInput.border || adminBase.border, 48)
  }

  const publicTheme = {
    bg: cleanText(publicInput.bg || publicBase.bg, 32),
    bgDark: cleanText(publicInput.bgDark || publicBase.bgDark, 32),
    bg2: cleanText(publicInput.bg2 || publicBase.bg2, 32),
    text: cleanText(publicInput.text || publicBase.text, 32),
    muted: cleanText(publicInput.muted || publicBase.muted, 48),
    primary: cleanText(publicInput.primary || publicBase.primary, 32),
    accent: cleanText(publicInput.accent || publicBase.accent, 32),
    lime: cleanText(publicInput.lime || publicBase.lime, 32),
    card: cleanText(publicInput.card || publicBase.card, 48),
    border: cleanText(publicInput.border || publicBase.border, 48),
    nav: cleanText(publicInput.nav || publicBase.nav, 48),
    shadow: cleanText(publicInput.shadow || publicBase.shadow, 120),
    soft: cleanText(publicInput.soft || publicBase.soft, 48),
    font: cleanText(publicInput.font || publicBase.font, 120),
    radius: cleanText(publicInput.radius || publicBase.radius, 16)
  }

  return { admin, public: publicTheme }
}

function normalizeSiteSettings(site, current = DEFAULT_SITE) {
  const base = { ...DEFAULT_SITE, ...(current || {}) }
  const next = { ...base, ...(site || {}) }
  const theme = normalizeSiteTheme(next.theme || base.theme, base.theme)
  return {
    ...base,
    ...next,
    title: cleanText(next.title, 80),
    tagline: cleanText(next.tagline, 160),
    heroTitle: cleanText(next.heroTitle, 160),
    heroSubtitle: cleanText(next.heroSubtitle, 240),
    ctaLabel: cleanText(next.ctaLabel, 40),
    ctaUrl: cleanText(next.ctaUrl, 240),
    aboutTitle: cleanText(next.aboutTitle, 80),
    aboutText: cleanText(next.aboutText, 1200),
    scheduleText: cleanText(next.scheduleText, 800),
    twitchChannel: cleanText(next.twitchChannel, 80),
    twitchUrl: cleanText(next.twitchUrl, 240),
    youtubeChannelId: cleanText(next.youtubeChannelId, 80),
    youtubeUrl: cleanText(next.youtubeUrl, 240),
    youtubeUploadsLimit: clampNumber(next.youtubeUploadsLimit, 1, 8, 3),
    showTwitch: normalizeBoolean(next.showTwitch, true),
    showYouTube: normalizeBoolean(next.showYouTube, true),
    showSchedule: normalizeBoolean(next.showSchedule, true),
    showSuggestions: normalizeBoolean(next.showSuggestions, true),
    showPlanned: normalizeBoolean(next.showPlanned, true),
    showCompleted: normalizeBoolean(next.showCompleted, true),
    showFeatured: normalizeBoolean(next.showFeatured, true),
    showAbout: normalizeBoolean(next.showAbout, true),
    showLinks: normalizeBoolean(next.showLinks, true),
    featuredGameId: cleanText(next.featuredGameId, 120),
    links: normalizeLinks(next.links),
    theme
  }
}

function applyEnvSiteFallback(site) {
  const twitchChannel = site.twitchChannel || cleanText(process.env.TWITCH_CHANNEL || '', 80)
  const youtubeChannelId = site.youtubeChannelId || cleanText(process.env.YOUTUBE_CHANNEL_ID || '', 80)
  const twitchUrl = site.twitchUrl || (twitchChannel ? `https://twitch.tv/${twitchChannel}` : '')
  const youtubeUrl = site.youtubeUrl || (youtubeChannelId ? `https://youtube.com/channel/${youtubeChannelId}` : '')
  return {
    ...site,
    twitchChannel,
    youtubeChannelId,
    twitchUrl,
    youtubeUrl
  }
}

function mapSuggestionRow(row) {
  return {
    id: row.id,
    title: row.title,
    console: row.console,
    requester: row.requester,
    note: row.note,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function getPublicMetadata(gameId = null) {
  if (!isPgEnabled()) {
    const data = loadJson(PUBLIC_METADATA_FILE, DEFAULT_PUBLIC)
    return gameId ? data.games?.[gameId] || null : data
  }
  if (gameId) {
    const result = await query('select * from public_games where game_id = $1', [gameId])
    return result.rows[0] ? mapPublicRow(result.rows[0]) : null
  }
  const result = await query('select * from public_games order by updated_at desc')
  const mapped = result.rows.map(row => mapPublicRow(row))
  return { version: 1, games: Object.fromEntries(mapped.map(row => [row.id, row])), lastUpdated: Date.now() }
}

export async function listPublicGames() {
  if (!isPgEnabled()) {
    const data = loadJson(PUBLIC_METADATA_FILE, DEFAULT_PUBLIC)
    return Object.entries(data.games || {}).map(([id, meta]) => ({ id, ...meta }))
  }
  const result = await query('select * from public_games order by updated_at desc')
  return result.rows.map(row => mapPublicRow(row))
}

export async function updatePublicMetadata(gameId, updates) {
  if (!gameId) throw new Error('Game ID is required')
  if (!isPgEnabled()) {
    const data = loadJson(PUBLIC_METADATA_FILE, DEFAULT_PUBLIC)
    const current = data.games?.[gameId] || {}
    const next = { ...current, ...updates, updatedAt: Date.now() }
    data.games = data.games || {}
    data.games[gameId] = next
    data.lastUpdated = Date.now()
    if (!saveJson(PUBLIC_METADATA_FILE, data)) {
      throw new Error('Failed to save public metadata')
    }
    return next
  }

  const current = await getPublicMetadata(gameId)
  const currentData = current || {}
  const next = {
    public_status: updates.publicStatus ?? currentData.publicStatus ?? currentData.public_status ?? 'Hidden',
    public_rating: updates.publicRating ?? currentData.publicRating ?? currentData.public_rating ?? null,
    public_review_title: updates.publicReviewTitle ?? currentData.publicReviewTitle ?? currentData.public_review_title ?? '',
    public_review: updates.publicReview ?? currentData.publicReview ?? currentData.public_review ?? '',
    public_video_url: updates.publicVideoUrl ?? currentData.publicVideoUrl ?? currentData.public_video_url ?? '',
    game: updates.game ?? currentData.game ?? null
  }

  await query(
    `insert into public_games (game_id, public_status, public_rating, public_review_title, public_review, public_video_url, game, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (game_id)
     do update set public_status = excluded.public_status,
                   public_rating = excluded.public_rating,
                   public_review_title = excluded.public_review_title,
                   public_review = excluded.public_review,
                   public_video_url = excluded.public_video_url,
                   game = excluded.game,
                   updated_at = now()`,
    [
      gameId,
      next.public_status,
      next.public_rating,
      next.public_review_title,
      next.public_review,
      next.public_video_url,
      next.game
    ]
  )
  return await getPublicMetadata(gameId)
}

export async function deletePublicMetadata(gameId) {
  if (!gameId) throw new Error('Game ID is required')
  if (!isPgEnabled()) {
    const data = loadJson(PUBLIC_METADATA_FILE, DEFAULT_PUBLIC)
    if (data.games && data.games[gameId]) {
      delete data.games[gameId]
      data.lastUpdated = Date.now()
      if (!saveJson(PUBLIC_METADATA_FILE, data)) {
        throw new Error('Failed to save public metadata')
      }
    }
    return true
  }
  await query('delete from public_games where game_id = $1', [gameId])
  return true
}

export async function getPublicSettings() {
  if (!isPgEnabled()) {
    const data = loadJson(SETTINGS_FILE, DEFAULT_SETTINGS)
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      site: applyEnvSiteFallback(normalizeSiteSettings(data.site || DEFAULT_SETTINGS.site))
    }
  }
  const result = await query('select * from public_settings where id = 1')
  const row = result.rows[0]
  return row ? {
    suggestions_open: row.suggestions_open,
    max_open: row.max_open,
    console_limits: row.console_limits || {},
    site: applyEnvSiteFallback(normalizeSiteSettings(row.site || DEFAULT_SETTINGS.site))
  } : { ...DEFAULT_SETTINGS }
}

export async function updatePublicSettings(updates) {
  if (!isPgEnabled()) {
    const data = loadJson(SETTINGS_FILE, DEFAULT_SETTINGS)
    const nextSite = normalizeSiteSettings(updates.site ?? data.site ?? DEFAULT_SETTINGS.site, data.site)
    const next = {
      ...data,
      ...updates,
      console_limits: normalizeConsoleLimits(updates.console_limits ?? data.console_limits),
      site: nextSite
    }
    if (!saveJson(SETTINGS_FILE, next)) throw new Error('Failed to save public settings')
    return next
  }
  const current = await getPublicSettings()
  const normalizedLimits = normalizeConsoleLimits(updates.console_limits ?? current.console_limits)
  const normalizedSite = normalizeSiteSettings(updates.site ?? current.site, current.site)
  const next = {
    suggestions_open: updates.suggestions_open ?? current.suggestions_open,
    max_open: updates.max_open ?? current.max_open,
    console_limits: normalizedLimits,
    site: normalizedSite
  }
  await query(
    `update public_settings
     set suggestions_open = $1, max_open = $2, console_limits = $3, site = $4, updated_at = now()
     where id = 1`,
    [next.suggestions_open, next.max_open, next.console_limits, next.site]
  )
  return next
}

export async function listSuggestions({ status = null } = {}) {
  if (!isPgEnabled()) {
    const data = loadJson(SUGGESTIONS_FILE, { version: 1, items: [] })
    const items = data.items || []
    return status ? items.filter(item => item.status === status) : items
  }
  const result = status
    ? await query('select * from suggestions where status = $1 order by created_at desc', [status])
    : await query('select * from suggestions order by created_at desc')
  return result.rows.map(row => mapSuggestionRow(row))
}

export async function addSuggestion({ title, console, requester, note, source }) {
  if (!title) throw new Error('Title is required')

  const trimmedTitle = String(title).trim()
  if (!trimmedTitle) throw new Error('Title is required')

  const settings = await getPublicSettings()
  if (!settings.suggestions_open) throw new Error('suggestions_closed')

  const maxOpen = Number(settings.max_open || 0)
  if (maxOpen > 0) {
    const openCount = await countOpenSuggestions()
    if (openCount >= maxOpen) throw new Error('suggestions_full')
  }

  const consoleKey = normalizeConsoleKey(console)
  if (consoleKey && settings.console_limits && settings.console_limits[consoleKey] != null) {
    const limit = Number(settings.console_limits[consoleKey])
    if (Number.isFinite(limit) && limit > 0) {
      const count = await countOpenSuggestions(consoleKey)
      if (count >= limit) throw new Error('suggestions_console_full')
    }
  }

  const safeConsole = console ? String(console).trim() : ''
  const safeRequester = requester ? String(requester).trim() : ''
  const safeNote = note ? String(note).trim() : ''
  const safeSource = source ? String(source).trim() : 'public'

  if (!isPgEnabled()) {
    const data = loadJson(SUGGESTIONS_FILE, { version: 1, items: [] })
    const item = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      console: safeConsole,
      requester: safeRequester,
      note: safeNote,
      source: safeSource,
      status: 'open',
      createdAt: Date.now()
    }
    data.items = data.items || []
    data.items.unshift(item)
    data.lastUpdated = Date.now()
    if (!saveJson(SUGGESTIONS_FILE, data)) {
      throw new Error('Failed to save suggestion')
    }
    return item
  }

  const id = crypto.randomUUID()
  await query(
    `insert into suggestions (id, title, console, console_key, requester, note, source, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'open', now())`,
    [id, trimmedTitle, safeConsole, consoleKey || null, safeRequester, safeNote, safeSource]
  )
  const result = await query('select * from suggestions where id = $1', [id])
  return result.rows[0] ? mapSuggestionRow(result.rows[0]) : null
}

export async function updateSuggestion(id, updates) {
  if (!id) throw new Error('Suggestion ID is required')
  if (!isPgEnabled()) {
    const data = loadJson(SUGGESTIONS_FILE, { version: 1, items: [] })
    const idx = (data.items || []).findIndex(item => item.id === id)
    if (idx < 0) throw new Error('Suggestion not found')
    data.items[idx] = { ...data.items[idx], ...updates, updatedAt: Date.now() }
    data.lastUpdated = Date.now()
    if (!saveJson(SUGGESTIONS_FILE, data)) {
      throw new Error('Failed to save suggestion update')
    }
    return data.items[idx]
  }
  const fields = []
  const values = []
  let i = 1
  if (updates.status) {
    fields.push(`status = $${i++}`)
    values.push(updates.status)
  }
  if ('note' in updates) {
    fields.push(`note = $${i++}`)
    values.push(updates.note)
  }
  if (!fields.length) return await getSuggestionById(id)
  fields.push(`updated_at = now()`)
  values.push(id)
  await query(`update suggestions set ${fields.join(', ')} where id = $${i}`, values)
  return await getSuggestionById(id)
}

async function getSuggestionById(id) {
  if (!isPgEnabled()) return null
  const result = await query('select * from suggestions where id = $1', [id])
  return result.rows[0] ? mapSuggestionRow(result.rows[0]) : null
}

async function countOpenSuggestions(consoleKey = null) {
  if (!isPgEnabled()) {
    const data = loadJson(SUGGESTIONS_FILE, { version: 1, items: [] })
    const items = data.items || []
    if (!consoleKey) return items.filter(item => item.status === 'open').length
    return items.filter(item => item.status === 'open' && normalizeConsoleKey(item.console) === consoleKey).length
  }
  if (!consoleKey) {
    const result = await query('select count(*)::int as count from suggestions where status = $1', ['open'])
    return result.rows[0]?.count || 0
  }
  const result = await query(
    'select count(*)::int as count from suggestions where status = $1 and console_key = $2',
    ['open', consoleKey]
  )
  return result.rows[0]?.count || 0
}

export async function getSuggestionStats() {
  const settings = await getPublicSettings()
  const openCount = await countOpenSuggestions()
  const consoleStats = {}
  if (isPgEnabled()) {
    const result = await query(
      'select console_key, count(*)::int as count from suggestions where status = $1 group by console_key',
      ['open']
    )
    for (const row of result.rows) {
      if (row.console_key) consoleStats[row.console_key] = row.count
    }
  } else {
    const data = loadJson(SUGGESTIONS_FILE, { version: 1, items: [] })
    for (const item of data.items || []) {
      if (item.status !== 'open') continue
      const key = normalizeConsoleKey(item.console)
      if (!key) continue
      consoleStats[key] = (consoleStats[key] || 0) + 1
    }
  }
  return { openCount, consoleStats, settings }
}
