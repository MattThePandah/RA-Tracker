export const DEFAULT_OVERLAY_SETTINGS = {
  version: 1,
  global: {
    theme: 'bamboo-light',
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
    textColor: '#eefcf6',
    eventConsoles: [] // List of console names or IDs to filter for "Event" stats
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
  },
  full: {
    layout: 'balanced',
    leftWidth: 360,
    rightWidth: 360,
    padding: 32,
    columnGap: 24,
    moduleGap: 16,
    bottomHeight: 0,
    showGuides: true,
    showGameFrame: true,
    showCameraFrame: false,
    gameInsetX: 28,
    gameInsetY: 20,
    cameraPosition: 'bottom-right',
    cameraDock: false,
    cameraWidth: 360,
    cameraHeight: 200,
    cameraOffsetX: 32,
    cameraOffsetY: 32,
    achievementCycleMs: 8000,
    modules: {
      current: { enabled: true, position: 'left', order: 1 },
      stats: { enabled: true, position: 'left', order: 2 },
      timers: { enabled: true, position: 'right', order: 1 },
      achievements: { enabled: true, position: 'right', order: 2, count: 4 }
    }
  }
}

function mergeSection(base, incoming) {
  return { ...(base || {}), ...(incoming || {}) }
}

export function mergeOverlaySettings(incoming) {
  const data = incoming || {}
  const fullBase = DEFAULT_OVERLAY_SETTINGS.full || {}
  const fullIncoming = data.full || {}
  const moduleBase = fullBase.modules || {}
  const moduleIncoming = fullIncoming.modules || {}
  const mergedModules = {
    current: mergeSection(moduleBase.current, moduleIncoming.current),
    stats: mergeSection(moduleBase.stats, moduleIncoming.stats),
    timers: mergeSection(moduleBase.timers, moduleIncoming.timers),
    achievements: mergeSection(moduleBase.achievements, moduleIncoming.achievements)
  }
  return {
    version: 1,
    global: mergeSection(DEFAULT_OVERLAY_SETTINGS.global, data.global),
    main: mergeSection(DEFAULT_OVERLAY_SETTINGS.main, data.main),
    modern: mergeSection(DEFAULT_OVERLAY_SETTINGS.modern, data.modern),
    stats: mergeSection(DEFAULT_OVERLAY_SETTINGS.stats, data.stats),
    footer: mergeSection(DEFAULT_OVERLAY_SETTINGS.footer, data.footer),
    achievements: mergeSection(DEFAULT_OVERLAY_SETTINGS.achievements, data.achievements),
    wheel: mergeSection(DEFAULT_OVERLAY_SETTINGS.wheel, data.wheel),
    badgeCarousel: mergeSection(DEFAULT_OVERLAY_SETTINGS.badgeCarousel, data.badgeCarousel),
    full: {
      ...mergeSection(fullBase, fullIncoming),
      modules: mergedModules
    }
  }
}

export function getStringParam(params, key, fallback) {
  if (params && params.has(key)) return params.get(key) || ''
  return fallback
}

export function getBoolParam(params, key, fallback) {
  if (params && params.has(key)) {
    const value = String(params.get(key)).toLowerCase()
    if (value === '0' || value === 'false' || value === 'off' || value === 'no') return false
    return true
  }
  return fallback
}

export function getNumberParam(params, key, fallback, { min = null, max = null } = {}) {
  let raw = fallback
  if (params && params.has(key)) raw = params.get(key)
  const num = Number(raw)
  if (!Number.isFinite(num)) return fallback
  if (min != null && num < min) return min
  if (max != null && num > max) return max
  return num
}

export function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, num))
}
