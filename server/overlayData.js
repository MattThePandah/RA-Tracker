import fs from 'fs'
import path from 'path'
import { isPgEnabled, query } from './db.js'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const SETTINGS_FILE = path.join(DATA_DIR, 'overlay-settings.json')

const DEFAULT_OVERLAY_SETTINGS = {
  version: 1,
  global: {
    theme: 'bamboo',
    clean: true,
    pollMs: 5000,
    achievementPollMs: 60000,
    showCover: true,
    showYear: true,
    showPublisher: true,
    showAchievements: true,
    showTimer: true,
    brandColor: '#5ecf86',
    accentColor: '#66b7ff',
    textColor: '#eefcf6'
  },
  main: {
    style: 'reference',
    maxWidth: 1400,
    coverWidth: 220,
    titleLines: 1,
    showTotal: true,
    raMode: 'default',
    raSize: 58,
    raMax: 10,
    raScroll: false,
    raSpeed: '30s',
    raShow: 'earned',
    raAuto: true,
    raAutoDuration: 30,
    raAutoSize: 72,
    raAutoMax: 12,
    raAnnounce: true,
    raAnnounceDuration: 30,
    raAnnounceSize: 116,
    showInlineBadges: true,
    raRows: 0,
    timerPx: 0
  },
  modern: {
    style: 'glass',
    theme: 'bamboo',
    timerSize: 'normal',
    coverSize: 'normal',
    showTimer: true,
    animationLevel: 'normal',
    enableParticles: false,
    glassTint: 'dark'
  },
  stats: {
    style: 'compact',
    title: 'Event Progress',
    width: 320
  },
  footer: {
    barHeight: 70,
    title: 'Event',
    width: 320,
    timeMode: 'datetime',
    timeFmt: '24',
    showSeconds: true,
    dateFmt: 'short',
    timeStyle: 'glow',
    showTimers: true,
    showCurrent: true,
    currentCover: true,
    containerWidth: 1600,
    showBadges: false,
    badgeCount: 4,
    rotateMs: 8000
  },
  achievements: {
    style: 'progress',
    showHardcore: true,
    compact: false,
    maxAchievements: 24,
    speed: 30,
    direction: 'left'
  },
  wheel: {
    title: 'Game Roulette',
    showStrip: true,
    pollMs: 250
  },
  badgeCarousel: {
    showCount: 3,
    rotateMs: 8000,
    position: 'top-left',
    horizontal: false
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
    console.error('Failed to save overlay settings:', error)
    return false
  }
}

function normalizeBoolean(value, fallback) {
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

function normalizeOverlaySettings(input = {}, current = DEFAULT_OVERLAY_SETTINGS) {
  const base = { ...DEFAULT_OVERLAY_SETTINGS, ...(current || {}) }
  const incoming = input || {}

  return {
    version: 1,
    global: {
      theme: cleanText(incoming.global?.theme || base.global.theme, 20),
      clean: normalizeBoolean(incoming.global?.clean, base.global.clean),
      pollMs: clampNumber(incoming.global?.pollMs, 500, 60000, base.global.pollMs),
      achievementPollMs: clampNumber(incoming.global?.achievementPollMs, 5000, 300000, base.global.achievementPollMs),
      showCover: normalizeBoolean(incoming.global?.showCover, base.global.showCover),
      showYear: normalizeBoolean(incoming.global?.showYear, base.global.showYear),
      showPublisher: normalizeBoolean(incoming.global?.showPublisher, base.global.showPublisher),
      showAchievements: normalizeBoolean(incoming.global?.showAchievements, base.global.showAchievements),
      showTimer: normalizeBoolean(incoming.global?.showTimer, base.global.showTimer),
      brandColor: cleanText(incoming.global?.brandColor || base.global.brandColor, 32),
      accentColor: cleanText(incoming.global?.accentColor || base.global.accentColor, 32),
      textColor: cleanText(incoming.global?.textColor || base.global.textColor, 32)
    },
    main: {
      style: cleanText(incoming.main?.style || base.main.style, 20),
      maxWidth: clampNumber(incoming.main?.maxWidth, 600, 4000, base.main.maxWidth),
      coverWidth: clampNumber(incoming.main?.coverWidth, 120, 420, base.main.coverWidth),
      titleLines: clampNumber(incoming.main?.titleLines, 1, 3, base.main.titleLines),
      showTotal: normalizeBoolean(incoming.main?.showTotal, base.main.showTotal),
      raMode: cleanText(incoming.main?.raMode || base.main.raMode, 20),
      raSize: clampNumber(incoming.main?.raSize, 30, 140, base.main.raSize),
      raMax: clampNumber(incoming.main?.raMax, 0, 50, base.main.raMax),
      raScroll: normalizeBoolean(incoming.main?.raScroll, base.main.raScroll),
      raSpeed: cleanText(incoming.main?.raSpeed || base.main.raSpeed, 12),
      raShow: cleanText(incoming.main?.raShow || base.main.raShow, 12),
      raAuto: normalizeBoolean(incoming.main?.raAuto, base.main.raAuto),
      raAutoDuration: clampNumber(incoming.main?.raAutoDuration, 5, 120, base.main.raAutoDuration),
      raAutoSize: clampNumber(incoming.main?.raAutoSize, 40, 160, base.main.raAutoSize),
      raAutoMax: clampNumber(incoming.main?.raAutoMax, 0, 50, base.main.raAutoMax),
      raAnnounce: normalizeBoolean(incoming.main?.raAnnounce, base.main.raAnnounce),
      raAnnounceDuration: clampNumber(incoming.main?.raAnnounceDuration, 5, 120, base.main.raAnnounceDuration),
      raAnnounceSize: clampNumber(incoming.main?.raAnnounceSize, 60, 200, base.main.raAnnounceSize),
      showInlineBadges: normalizeBoolean(incoming.main?.showInlineBadges, base.main.showInlineBadges),
      raRows: clampNumber(incoming.main?.raRows, 0, 6, base.main.raRows),
      timerPx: clampNumber(incoming.main?.timerPx, 0, 140, base.main.timerPx)
    },
    modern: {
      style: cleanText(incoming.modern?.style || base.modern.style, 20),
      theme: cleanText(incoming.modern?.theme || base.modern.theme, 20),
      timerSize: cleanText(incoming.modern?.timerSize || base.modern.timerSize, 20),
      coverSize: cleanText(incoming.modern?.coverSize || base.modern.coverSize, 20),
      showTimer: normalizeBoolean(incoming.modern?.showTimer, base.modern.showTimer),
      animationLevel: cleanText(incoming.modern?.animationLevel || base.modern.animationLevel, 20),
      enableParticles: normalizeBoolean(incoming.modern?.enableParticles, base.modern.enableParticles),
      glassTint: cleanText(incoming.modern?.glassTint || base.modern.glassTint, 20)
    },
    stats: {
      style: cleanText(incoming.stats?.style || base.stats.style, 20),
      title: cleanText(incoming.stats?.title || base.stats.title, 40),
      width: clampNumber(incoming.stats?.width, 180, 600, base.stats.width)
    },
    footer: {
      barHeight: clampNumber(incoming.footer?.barHeight, 40, 200, base.footer.barHeight),
      title: cleanText(incoming.footer?.title || base.footer.title, 40),
      width: clampNumber(incoming.footer?.width, 180, 600, base.footer.width),
      timeMode: cleanText(incoming.footer?.timeMode || base.footer.timeMode, 12),
      timeFmt: cleanText(incoming.footer?.timeFmt || base.footer.timeFmt, 12),
      showSeconds: normalizeBoolean(incoming.footer?.showSeconds, base.footer.showSeconds),
      dateFmt: cleanText(incoming.footer?.dateFmt || base.footer.dateFmt, 12),
      timeStyle: cleanText(incoming.footer?.timeStyle || base.footer.timeStyle, 12),
      showTimers: normalizeBoolean(incoming.footer?.showTimers, base.footer.showTimers),
      showCurrent: normalizeBoolean(incoming.footer?.showCurrent, base.footer.showCurrent),
      currentCover: normalizeBoolean(incoming.footer?.currentCover, base.footer.currentCover),
      containerWidth: clampNumber(incoming.footer?.containerWidth, 600, 4000, base.footer.containerWidth),
      showBadges: normalizeBoolean(incoming.footer?.showBadges, base.footer.showBadges),
      badgeCount: clampNumber(incoming.footer?.badgeCount, 1, 8, base.footer.badgeCount),
      rotateMs: clampNumber(incoming.footer?.rotateMs, 2000, 60000, base.footer.rotateMs)
    },
    achievements: {
      style: cleanText(incoming.achievements?.style || base.achievements.style, 20),
      showHardcore: normalizeBoolean(incoming.achievements?.showHardcore, base.achievements.showHardcore),
      compact: normalizeBoolean(incoming.achievements?.compact, base.achievements.compact),
      maxAchievements: clampNumber(incoming.achievements?.maxAchievements, 1, 100, base.achievements.maxAchievements),
      speed: clampNumber(incoming.achievements?.speed, 10, 120, base.achievements.speed),
      direction: cleanText(incoming.achievements?.direction || base.achievements.direction, 10)
    },
    wheel: {
      title: cleanText(incoming.wheel?.title || base.wheel.title, 40),
      showStrip: normalizeBoolean(incoming.wheel?.showStrip, base.wheel.showStrip),
      pollMs: clampNumber(incoming.wheel?.pollMs, 100, 2000, base.wheel.pollMs)
    },
    badgeCarousel: {
      showCount: clampNumber(incoming.badgeCarousel?.showCount, 1, 8, base.badgeCarousel.showCount),
      rotateMs: clampNumber(incoming.badgeCarousel?.rotateMs, 2000, 60000, base.badgeCarousel.rotateMs),
      position: cleanText(incoming.badgeCarousel?.position || base.badgeCarousel.position, 20),
      horizontal: normalizeBoolean(incoming.badgeCarousel?.horizontal, base.badgeCarousel.horizontal)
    }
  }
}

export async function ensureOverlaySchema() {
  if (!isPgEnabled()) return
  await query(`
    create table if not exists overlay_settings (
      id int primary key default 1,
      settings jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `)
  await query(`insert into overlay_settings (id) values (1) on conflict do nothing`)
}

export async function getOverlaySettings() {
  if (!isPgEnabled()) {
    const data = loadJson(SETTINGS_FILE, DEFAULT_OVERLAY_SETTINGS)
    return normalizeOverlaySettings(data, DEFAULT_OVERLAY_SETTINGS)
  }
  const result = await query('select settings from overlay_settings where id = 1')
  const row = result.rows[0]
  const data = row?.settings || DEFAULT_OVERLAY_SETTINGS
  return normalizeOverlaySettings(data, DEFAULT_OVERLAY_SETTINGS)
}

export async function updateOverlaySettings(updates = {}) {
  const current = await getOverlaySettings()
  const next = normalizeOverlaySettings({
    ...current,
    ...updates,
    global: { ...current.global, ...updates.global },
    main: { ...current.main, ...updates.main },
    modern: { ...current.modern, ...updates.modern },
    stats: { ...current.stats, ...updates.stats },
    footer: { ...current.footer, ...updates.footer },
    achievements: { ...current.achievements, ...updates.achievements },
    wheel: { ...current.wheel, ...updates.wheel },
    badgeCarousel: { ...current.badgeCarousel, ...updates.badgeCarousel }
  }, current)

  if (!isPgEnabled()) {
    if (!saveJson(SETTINGS_FILE, next)) throw new Error('Failed to save overlay settings')
    return next
  }

  await query(
    `update overlay_settings set settings = $1, updated_at = now() where id = 1`,
    [next]
  )
  return next
}

export { DEFAULT_OVERLAY_SETTINGS }
