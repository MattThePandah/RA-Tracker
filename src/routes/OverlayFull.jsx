import React from 'react'
import * as Storage from '../services/storage.js'
import { useAchievements } from '../context/AchievementContext.jsx'
import * as RA from '../services/retroachievements.js'
import { buildOverlayUrl } from '../utils/overlayApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { useOverlaySettings } from '../hooks/useOverlaySettings.js'
import { useOverlayTheme } from '../hooks/useOverlayTheme.js'
import useOverlayEvent from '../hooks/useOverlayEvent.js'
import useOverlayConnector from '../hooks/useOverlayConnector.js'
import { getBoolParam, getNumberParam, getStringParam } from '../utils/overlaySettings.js'
import FullOverlayAchievementPopups from '../components/FullOverlayAchievementPopups.jsx'
import DotMatrixText from '../components/DotMatrixText.jsx'

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

function useViewportSize() {
  const [size, setSize] = React.useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight
  }))
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return size
}

function orderModules(list) {
  return list.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
}

function safeText(value) {
  return value ? String(value) : ''
}

const LOGO_SWAP_INTERVAL_MS = 60000
const GAME_LOCK_MS = 10000
const CONNECTOR_DEFAULT_POLL_MS = 1500
const DOT_TEXT_MAX = 20
const DOT_GAME_SCROLL_MAX = 64
const DOT_GAME_SCROLL_VISIBLE = 14
const DOT_SCROLL_MAX = 48
const DOT_SCROLL_VISIBLE = 16
const DOT_LABEL_MAX = 14
const DOT_META_MAX = 18
const DOT_ALLOWED = /[A-Z0-9:%\-\.\/ ]/
const CONNECTOR_COLOR_ALLOWED = /^[#(),.%0-9a-zA-Z\s\-\/]+$/

const TIMER_TOKENS = [
  '{current}',
  '{currentTime}',
  '{session}',
  '{total}',
  '{totalTime}',
  '{event}'
]

const GAME_TOKENS = [
  '{title}',
  '{game}',
  '{gameTitle}',
  '{console}',
  '{platform}',
  '{year}',
  '{publisher}',
  '{status}'
]

const CONSOLE_ACRONYMS = new Map([
  ['PLAYSTATION', 'PS1'],
  ['PLAYSTATION 2', 'PS2'],
  ['PLAYSTATION 3', 'PS3'],
  ['PLAYSTATION 4', 'PS4'],
  ['PLAYSTATION 5', 'PS5'],
  ['PSX', 'PS1'],
  ['PS1', 'PS1'],
  ['PS2', 'PS2'],
  ['PS3', 'PS3'],
  ['PS4', 'PS4'],
  ['PS5', 'PS5'],
  ['PSP', 'PSP'],
  ['PLAYSTATION PORTABLE', 'PSP'],
  ['PS VITA', 'VITA'],
  ['PLAYSTATION VITA', 'VITA'],
  ['SUPER NINTENDO', 'SNES'],
  ['SUPER NINTENDO ENTERTAINMENT SYSTEM', 'SNES'],
  ['SNES', 'SNES'],
  ['NINTENDO ENTERTAINMENT SYSTEM', 'NES'],
  ['NES', 'NES'],
  ['NINTENDO 64', 'N64'],
  ['N64', 'N64'],
  ['GAMECUBE', 'GC'],
  ['GC', 'GC'],
  ['WII', 'WII'],
  ['WII U', 'WIIU'],
  ['SWITCH', 'SWITCH'],
  ['NINTENDO SWITCH', 'SWITCH'],
  ['DREAMCAST', 'DC'],
  ['DC', 'DC'],
  ['SEGA GENESIS', 'GEN'],
  ['GENESIS', 'GEN'],
  ['MEGA DRIVE', 'MD'],
  ['SATURN', 'SAT'],
  ['MASTER SYSTEM', 'SMS'],
  ['GAME GEAR', 'GG'],
  ['NEO GEO', 'NG'],
  ['PC ENGINE', 'PCE'],
  ['TURBOGRAFX-16', 'TG16'],
  ['TURBO GRAFX 16', 'TG16'],
  ['GAME BOY', 'GB'],
  ['GAME BOY COLOR', 'GBC'],
  ['GBC', 'GBC'],
  ['GAME BOY ADVANCE', 'GBA'],
  ['GBA', 'GBA'],
  ['NINTENDO DS', 'DS'],
  ['DS', 'DS'],
  ['NINTENDO 3DS', '3DS'],
  ['3DS', '3DS']
])

function getConsoleAcronym(consoleName) {
  if (!consoleName) return ''
  const normalized = String(consoleName).trim().toUpperCase()
  if (!normalized) return ''
  if (CONSOLE_ACRONYMS.has(normalized)) return CONSOLE_ACRONYMS.get(normalized)
  const compact = normalized.replace(/[^A-Z0-9]/g, '')
  if (CONSOLE_ACRONYMS.has(compact)) return CONSOLE_ACRONYMS.get(compact)
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const initials = words.map(word => word[0]).join('')
    if (initials.length >= 2 && initials.length <= 4) return initials
  }
  if (normalized.length <= 6) return normalized
  return ''
}

function hasToken(value, tokens) {
  const text = String(value || '')
  return tokens.some(token => text.includes(token))
}

function sanitizeDotText(text) {
  if (!text) return ''
  const upper = String(text).toUpperCase()
  let cleaned = ''
  for (let i = 0; i < upper.length; i += 1) {
    const char = upper[i]
    cleaned += DOT_ALLOWED.test(char) ? char : ' '
  }
  return cleaned.replace(/\s+/g, ' ').trim()
}

function clampDotText(text, maxLen) {
  const value = String(text || '')
  if (value.length <= maxLen) return value
  const sliceLen = Math.max(0, maxLen - 3)
  return `${value.slice(0, sliceLen).trimEnd()}...`
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, num))
}

function sanitizeCssColor(value) {
  if (value == null) return ''
  const cleaned = String(value).trim()
  if (!cleaned || cleaned.length > 64) return ''
  if (/url\s*\(|expression\s*\(/i.test(cleaned)) return ''
  if (!CONNECTOR_COLOR_ALLOWED.test(cleaned)) return ''
  return cleaned
}

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

function formatConnectorLabel(source, type) {
  const sourceLabel = source === 'twitch' ? 'Twitch' : source === 'youtube' ? 'YouTube' : 'Stream'
  switch (type) {
    case 'sub':
      return `${sourceLabel} Sub`
    case 'resub':
      return `${sourceLabel} Resub`
    case 'gift':
      return `${sourceLabel} Gift`
    case 'raid':
      return `${sourceLabel} Raid`
    case 'follow':
      return `${sourceLabel} Follow`
    case 'cheer':
      return `${sourceLabel} Cheer`
    case 'superchat':
      return `${sourceLabel} Super`
    case 'member':
      return `${sourceLabel} Member`
    case 'tip':
      return `${sourceLabel} Tip`
    default:
      return `${sourceLabel} Event`
  }
}

function resolveConnectorTheme(event, source, type) {
  const donationTheme = { border: 'rgba(94, 207, 134, 0.7)', glow: 'rgba(94, 207, 134, 0.35)' }
  const defaultTheme = type === 'tip'
    ? donationTheme
    : source === 'twitch'
      ? { border: 'rgba(145, 70, 255, 0.7)', glow: 'rgba(145, 70, 255, 0.35)' }
      : source === 'youtube'
        ? { border: 'rgba(255, 70, 70, 0.7)', glow: 'rgba(255, 70, 70, 0.35)' }
        : { border: 'rgba(102, 183, 255, 0.7)', glow: 'rgba(102, 183, 255, 0.35)' }
  const borderOverride = sanitizeCssColor(event?.borderColor || event?.color)
  const glowOverride = sanitizeCssColor(event?.glowColor || event?.glow)
  const border = borderOverride || defaultTheme.border
  const glow = glowOverride || borderOverride || defaultTheme.glow
  return { border, glow }
}

function formatConnectorMeta(event, type) {
  if (!event) return ''
  const parts = []
  const tier = safeText(event.tier)
  if (tier) parts.push(tier)
  const months = Number(event.months || 0)
  if (Number.isFinite(months) && months > 0) parts.push(`${months}M`)
  const amount = safeText(event.amount)
  const currency = safeText(event.currency)
  if (amount) parts.push(currency ? `${amount} ${currency}` : amount)
  const count = Number(event.count || 0)
  if (Number.isFinite(count) && count > 0) {
    if (type === 'gift') parts.push(`${count} GIFTS`)
    else if (type === 'raid') parts.push(`${count} VIEWERS`)
    else parts.push(`${count}`)
  }
  return parts.join(' / ')
}

function getAchievementTime(achievement) {
  const time = new Date(achievement?.date || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function replaceTokens(value, replacements) {
  let output = value
  Object.entries(replacements).forEach(([token, replacement]) => {
    if (output.includes(token)) {
      output = output.split(token).join(replacement || '')
    }
  })
  return output
}

function applyDisplayTokens(value, timers, current) {
  const text = value == null ? '' : String(value)
  if (!text) return ''
  const replacements = {
    '{current}': timers.currentGameTime,
    '{currentTime}': timers.currentGameTime,
    '{session}': timers.currentGameTime,
    '{total}': timers.totalTime,
    '{totalTime}': timers.totalTime,
    '{event}': timers.totalTime,
    '{title}': current?.title,
    '{game}': current?.title,
    '{gameTitle}': current?.title,
    '{console}': current?.console,
    '{platform}': current?.console,
    '{year}': current?.release_year ? String(current.release_year) : '',
    '{publisher}': current?.publisher,
    '{status}': current?.status
  }
  return replaceTokens(text, replacements)
}

function applyDisplayFallback(value, label, timers) {
  const normalizedLabel = String(label || '').trim().toLowerCase()
  const normalizedValue = String(value || '').trim().toLowerCase()
  const isPlaceholder = (
    !normalizedValue ||
    normalizedValue === 'live' ||
    normalizedValue === 'current' ||
    normalizedValue === 'event' ||
    normalizedValue === 'session' ||
    normalizedValue === '0' ||
    normalizedValue === '00:00' ||
    normalizedValue === '00:00:00' ||
    normalizedValue === '000:00:00'
  )
  const wantsCurrent = normalizedLabel === 'current' || normalizedLabel === 'status'
  const wantsEvent = normalizedLabel === 'event' || normalizedLabel === 'session'
  if (wantsCurrent && isPlaceholder) {
    return timers.currentGameTime || value
  }
  if (wantsEvent && isPlaceholder) {
    return timers.totalTime || value
  }
  return value
}

function displayNeedsTimers(display) {
  const label = String(display?.label || '')
  const value = String(display?.value || '')
  if (hasToken(label, TIMER_TOKENS) || hasToken(value, TIMER_TOKENS)) return true
  const normalizedLabel = label.trim().toLowerCase()
  const normalizedValue = value.trim().toLowerCase()
  const isPlaceholder = (
    !normalizedValue ||
    normalizedValue === 'live' ||
    normalizedValue === 'current' ||
    normalizedValue === 'event' ||
    normalizedValue === 'session' ||
    normalizedValue === '0' ||
    normalizedValue === '00:00' ||
    normalizedValue === '00:00:00' ||
    normalizedValue === '000:00:00'
  )
  if (normalizedLabel === 'current' && isPlaceholder) return true
  if (normalizedLabel === 'status' && isPlaceholder) return true
  if (normalizedLabel === 'event' && isPlaceholder) return true
  if (normalizedLabel === 'session' && isPlaceholder) return true
  return false
}

function renameDisplayLabel(label) {
  const normalized = String(label || '').trim().toLowerCase()
  if (normalized === 'status') return 'Current'
  if (normalized === 'session') return 'Event'
  return label
}

export default function OverlayFull() {
  const { settings } = useOverlaySettings()
  const params = new URLSearchParams(location.search)
  const globalConfig = settings.global || {}
  const fullConfig = settings.full || {}
  const moduleConfig = fullConfig.modules || {}
  const poll = getNumberParam(params, 'poll', globalConfig.pollMs ?? 5000, { min: 500, max: 60000 })
  const achievementPoll = getNumberParam(params, 'rapoll', globalConfig.achievementPollMs ?? 60000, { min: 5000, max: 300000 })
  const layoutMode = getStringParam(params, 'layout', fullConfig.layout || 'balanced')
  const isClean = getBoolParam(params, 'clean', globalConfig.clean ?? false)
  const showGuides = getBoolParam(params, 'guides', fullConfig.showGuides ?? true)
  const showGameFrame = getBoolParam(params, 'gameframe', fullConfig.showGameFrame ?? true)
  const showCameraFrame = getBoolParam(params, 'camframe', fullConfig.showCameraFrame ?? true)
  const achievementCycleMsRaw = getNumberParam(params, 'racycle', fullConfig.achievementCycleMs ?? 8000, { min: 0, max: 60000 })
  const achievementCycleMs = achievementCycleMsRaw <= 0 ? 0 : Math.max(2000, achievementCycleMsRaw)
  const raTest = getBoolParam(params, 'ratest', false)
  const raTestCount = getNumberParam(params, 'racount', 1, { min: 1, max: 6 })
  const logoSwapMs = getNumberParam(params, 'logoswap', LOGO_SWAP_INTERVAL_MS, { min: 5000, max: 900000 })
  const connectorPollRaw = getNumberParam(params, 'connectorpoll', CONNECTOR_DEFAULT_POLL_MS, { min: 250, max: 10000 })
  const themeName = globalConfig.theme || 'bamboo'
  const isPandaTheme = themeName === 'panda'
  const tvConfig = fullConfig.tv || {}
  const connectorIconMap = tvConfig.connectorIcons || {}
  const tvEnabled = isPandaTheme && tvConfig.enabled !== false
  const connectorPollMs = tvEnabled ? connectorPollRaw : 0
  const connectorEvent = useOverlayConnector(connectorPollMs)
  const tvLogoUrl = typeof tvConfig.logoUrl === 'string' ? tvConfig.logoUrl.trim() : ''
  const tvLogoText = (typeof tvConfig.logoText === 'string' ? tvConfig.logoText.trim() : '') || 'PANDA'
  const defaultTvDisplays = [
    { label: 'Status', value: 'LIVE' },
    { label: 'Session', value: '00:00:00' }
  ]
  const tvDisplaySource = Array.isArray(tvConfig.displays) ? tvConfig.displays : defaultTvDisplays
  const tvStickerSource = Array.isArray(tvConfig.stickers) ? tvConfig.stickers : []
  const [dynamicStickers, setDynamicStickers] = React.useState([])

  // Handle dynamic stickers from StreamerBot
  React.useEffect(() => {
    if (!connectorEvent) return
    if (connectorEvent.type === 'sticker' && connectorEvent.url) {
      const newSticker = {
        url: connectorEvent.url,
        x: connectorEvent.x ?? (Math.random() * 90 + 5), // Random 5-95%
        y: connectorEvent.y ?? (Math.random() * 90 + 5), // Random 5-95%
        size: connectorEvent.size ?? (Math.random() * 15 + 10), // Random 10-25%
        rotate: connectorEvent.rotate ?? (Math.random() * 60 - 30), // Random -30 to 30deg
        opacity: connectorEvent.opacity ?? 1,
        id: `${connectorEvent.type}-${Date.now()}`
      }
      setDynamicStickers(prev => {
        const next = [...prev, newSticker]
        if (next.length > 20) return next.slice(next.length - 20)
        return next
      })
    }
  }, [connectorEvent])

  const allStickers = React.useMemo(() => {
    const staticStickers = tvEnabled
      ? tvStickerSource.filter(sticker => sticker && typeof sticker.url === 'string' && sticker.url.trim())
      : []
    return [...staticStickers, ...dynamicStickers]
  }, [tvEnabled, tvStickerSource, dynamicStickers])

  const tvNeedsTimers = tvEnabled && tvDisplaySource.some(display => displayNeedsTimers(display))

  useOverlayTheme(themeName, isClean, globalConfig)

  const { width: viewportWidth, height: viewportHeight } = useViewportSize()
  const tick = usePoll(poll)
  const [current, setCurrent] = React.useState(null)
  const [stats, setStats] = React.useState({ total: 0, completed: 0, percent: 0 })
  const [timers, setTimers] = React.useState({ currentGameTime: '00:00:00', totalTime: '000:00:00' })
  const overlayEvent = useOverlayEvent(15000)
  const eventTitle = overlayEvent?.overlayTitle || overlayEvent?.name || ''
  const eventSubtitle = overlayEvent?.overlaySubtitle || overlayEvent?.console || ''
  const [centerIndex, setCenterIndex] = React.useState(0)
  const [centerCycleSeed, setCenterCycleSeed] = React.useState(0)
  const lastGameIdRef = React.useRef(null)
  const centerLockRef = React.useRef(0)
  const tvShellRef = React.useRef(null)
  const tvScreenRef = React.useRef(null)

  const currentEnabled = moduleConfig.current?.enabled ?? false
  const statsEnabled = moduleConfig.stats?.enabled ?? false
  const timersEnabled = moduleConfig.timers?.enabled ?? false
  const achievementsEnabled = moduleConfig.achievements?.enabled ?? false
  const shouldLoadTimers = timersEnabled || tvNeedsTimers
  const showEventTimer = timersEnabled && globalConfig.showTimer !== false

  const needsCurrent = currentEnabled || achievementsEnabled || tvEnabled
  const tvNeedsStats = tvEnabled
  const needsStats = statsEnabled || tvNeedsStats

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!needsCurrent) return
    const loadCurrent = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/current', base), { credentials: 'include' })
        if (res.ok) {
          const json = await res.json()
          setCurrent(json?.current || null)
          return
        }
      } catch {}
      try {
        const games = Storage.getGames()
        const curId = Storage.getCurrentGameId()
        const found = games.find(x => x.id === curId) || null
        setCurrent(found)
      } catch {
        setCurrent(null)
      }
    }
    loadCurrent()
  }, [tick, needsCurrent])

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!needsStats) return
    const loadStats = async () => {
      try {
        const r = await fetch(buildOverlayUrl('/overlay/stats', base), { credentials: 'include' })
        if (r.ok) {
          const j = await r.json()
          const total = Number(j.total || 0)
          const completed = Number(j.completed || 0)
          const percent = typeof j.percent === 'number' ? j.percent : (total ? Math.round((completed / total) * 100) : 0)
          setStats({ total, completed, percent })
          return
        }
      } catch {}
      try {
        const games = Storage.getGames()
        const total = games.length
        const completed = games.filter(g => g.status === 'Completed').length
        const percent = total ? Math.round((completed / total) * 100) : 0
        setStats({ total, completed, percent })
      } catch {
        setStats({ total: 0, completed: 0, percent: 0 })
      }
    }
    loadStats()
  }, [tick, needsStats])

  React.useEffect(() => {
    if (!shouldLoadTimers) return
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let id
    const fetchTimers = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/timers', base), { credentials: 'include' })
        if (res.ok) {
          const t = await res.json()
          if (t?.currentGameTime && (t?.totalTime || t?.psfestTime)) {
            setTimers({ currentGameTime: t.currentGameTime, totalTime: t.totalTime || t.psfestTime })
          }
        }
      } catch {}
    }
    fetchTimers()
    id = setInterval(fetchTimers, 1000)
    return () => clearInterval(id)
  }, [shouldLoadTimers])

  const { state, loadGameAchievements, loadRecentAchievements, clearCurrentGameData, isConfigured, addRecentAchievement } = useAchievements()
  const popupDuration = state.settings.popupDuration || 5000
  const bezelDuration = Math.max(15000, popupDuration)
  const [currentGameId, setCurrentGameId] = React.useState(null)
  const injectedTestRef = React.useRef(false)
  const [bezelAchievement, setBezelAchievement] = React.useState(null)
  const bezelTimeoutRef = React.useRef(null)
  const lastBezelRef = React.useRef(0)
  const seenBezelRef = React.useRef(new Set())
  const [bezelBootstrapped, setBezelBootstrapped] = React.useState(false)

  React.useEffect(() => {
    if (!achievementsEnabled) return
    const newGameId = current?.id || null
    if (!newGameId) {
      clearCurrentGameData()
      setCurrentGameId(null)
      return
    }
    if (newGameId !== currentGameId) {
      clearCurrentGameData()
      setCurrentGameId(newGameId)
      if (isConfigured && RA.hasRetroAchievementsSupport(current)) {
        loadGameAchievements(newGameId, true)
      }
    }
  }, [achievementsEnabled, current?.id, currentGameId, isConfigured, loadGameAchievements, clearCurrentGameData])

  React.useEffect(() => {
    if (!raTest || injectedTestRef.current) return
    injectedTestRef.current = true
    const baseTime = Date.now() + 60000
    const fallback = {
      title: current?.title || 'Test Game',
      consoleName: current?.console || 'Retro Console'
    }
    const source = state.currentGameAchievements.length ? state.currentGameAchievements : null
    for (let i = 0; i < raTestCount; i += 1) {
      const template = source ? source[i % source.length] : null
      addRecentAchievement({
        achievementId: baseTime + i,
        title: template?.title || `Test Achievement ${i + 1}`,
        description: template?.description || 'Sample achievement description for overlay testing.',
        points: template?.points || (5 + (i * 5)),
        badgeName: template?.badgeName || '00000',
        gameTitle: fallback.title,
        consoleName: fallback.consoleName,
        date: new Date(baseTime + (i * 1000)).toISOString(),
        hardcoreMode: 0,
        cumulScore: 12345
      })
    }
  }, [raTest, raTestCount, addRecentAchievement, current, state.currentGameAchievements])

  const allowBezelAchievements = tvEnabled
    && (raTest || (isConfigured && current && RA.hasRetroAchievementsSupport(current)))

  React.useEffect(() => {
    if (!allowBezelAchievements) return
    loadRecentAchievements(20)
    const id = setInterval(() => {
      loadRecentAchievements(20)
    }, achievementPoll)
    return () => clearInterval(id)
  }, [allowBezelAchievements, achievementPoll, loadRecentAchievements])

  React.useEffect(() => {
    if (!allowBezelAchievements) {
      if (bezelTimeoutRef.current) {
        clearTimeout(bezelTimeoutRef.current)
        bezelTimeoutRef.current = null
      }
      setBezelAchievement(null)
      lastBezelRef.current = 0
      seenBezelRef.current = new Set()
      setBezelBootstrapped(false)
      return
    }

    if (!state.recentAchievements.length) {
      return
    }

    if (!bezelBootstrapped) {
      if (!raTest) {
        const latestTime = Math.max(0, ...state.recentAchievements.map(getAchievementTime))
        lastBezelRef.current = latestTime
        seenBezelRef.current = new Set(
          state.recentAchievements.map(achievement => `${achievement.achievementId}-${achievement.date}`)
        )
        setBezelBootstrapped(true)
        return
      }
      setBezelBootstrapped(true)
    }

    const newAchievements = state.recentAchievements.filter(achievement => (
      getAchievementTime(achievement) > lastBezelRef.current
    ))

    if (!newAchievements.length) return

    const newestTimestamp = Math.max(
      lastBezelRef.current,
      ...newAchievements.map(getAchievementTime)
    )
    lastBezelRef.current = newestTimestamp

    const sorted = newAchievements
      .slice()
      .sort((a, b) => getAchievementTime(b) - getAchievementTime(a))
    const candidate = sorted[0]
    const popupId = `${candidate.achievementId}-${candidate.date}`
    if (seenBezelRef.current.has(popupId)) return
    seenBezelRef.current.add(popupId)

    setBezelAchievement(candidate)
    if (currentGameId) {
      loadGameAchievements(currentGameId, true)
    }
    if (bezelTimeoutRef.current) clearTimeout(bezelTimeoutRef.current)
    bezelTimeoutRef.current = setTimeout(() => {
      setBezelAchievement(null)
    }, bezelDuration)
  }, [allowBezelAchievements, bezelDuration, state.recentAchievements, currentGameId, loadGameAchievements])

  React.useEffect(() => {
    if (!achievementsEnabled || !currentGameId || !isConfigured) return
    if (!current || !RA.hasRetroAchievementsSupport(current)) return
    const id = setInterval(() => {
      if (!state.loading?.gameAchievements) {
        loadGameAchievements(currentGameId, true)
      }
    }, achievementPoll)
    return () => clearInterval(id)
  }, [achievementsEnabled, currentGameId, isConfigured, achievementPoll, loadGameAchievements, state.loading?.gameAchievements, current])

  const achievementsCount = Math.max(1, Number(moduleConfig.achievements?.count || 4))
  const earnedCount = state.currentGameAchievements.filter(a => a.isEarned).length
  const totalAchievements = state.currentGameAchievements.length
  const lockedCount = Math.max(0, totalAchievements - earnedCount)
  const earnedPoints = React.useMemo(() => (
    state.currentGameAchievements.reduce((sum, achievement) => (
      sum + (achievement.isEarned ? (Number(achievement.points) || 0) : 0)
    ), 0)
  ), [state.currentGameAchievements])
  const totalPoints = React.useMemo(() => (
    state.currentGameAchievements.reduce((sum, achievement) => (
      sum + (Number(achievement.points) || 0)
    ), 0)
  ), [state.currentGameAchievements])
  const achievementPercent = totalAchievements ? Math.round((earnedCount / totalAchievements) * 100) : 0
  const achievementAll = React.useMemo(() => {
    return state.currentGameAchievements
      .slice()
      .sort((a, b) => {
        if (a.isEarned !== b.isEarned) return a.isEarned ? -1 : 1
        const orderA = Number.isFinite(Number(a.displayOrder)) ? Number(a.displayOrder) : null
        const orderB = Number.isFinite(Number(b.displayOrder)) ? Number(b.displayOrder) : null
        if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB
        if (orderA !== null && orderB === null) return -1
        if (orderA === null && orderB !== null) return 1
        const pointsA = Number(a.points || 0)
        const pointsB = Number(b.points || 0)
        return pointsB - pointsA
      })
  }, [state.currentGameAchievements])
  const achievementPages = Math.max(1, Math.ceil(achievementAll.length / achievementsCount))
  const [achievementPage, setAchievementPage] = React.useState(0)
  const [nowPlayingTone, setNowPlayingTone] = React.useState('dark')
  const [achievementGlow, setAchievementGlow] = React.useState(false)
  const showAchievementPopups = achievementsEnabled && !tvEnabled

  React.useEffect(() => {
    if (!showAchievementPopups) {
      setAchievementGlow(false)
    }
  }, [showAchievementPopups])

  React.useEffect(() => {
    setAchievementPage(0)
  }, [achievementAll.length, achievementsCount, currentGameId])

  React.useEffect(() => {
    if (!achievementsEnabled) return
    if (!achievementCycleMs) return
    if (achievementAll.length <= achievementsCount) return
    const id = setInterval(() => {
      setAchievementPage(prev => (prev + 1) % achievementPages)
    }, achievementCycleMs)
    return () => clearInterval(id)
  }, [achievementsEnabled, achievementCycleMs, achievementAll.length, achievementsCount, achievementPages])


  const achievementStart = achievementPage * achievementsCount
  const visibleAchievements = achievementAll.slice(achievementStart, achievementStart + achievementsCount)
  const achievementListStyle = { '--full-achievement-rows': achievementsCount }
  const eventModuleEnabled = statsEnabled || showEventTimer
  const eventModuleConfig = statsEnabled ? moduleConfig.stats : moduleConfig.timers
  const eventModuleId = statsEnabled ? 'stats' : 'timers'
  const eventModuleTitle = statsEnabled ? (settings.stats?.title || 'Event Progress') : 'Event Timer'
  const nowPlayingCover = current?.image_url && globalConfig.showCover !== false
    ? buildCoverUrl(current.image_url)
    : ''
  const showNowPlayingThumb = globalConfig.showCover !== false && !nowPlayingCover
  const nowPlayingToneClass = nowPlayingCover && nowPlayingTone === 'light' ? ' now-playing-light' : ''

  React.useEffect(() => {
    let cancelled = false
    if (!nowPlayingCover) {
      setNowPlayingTone('dark')
      return () => { cancelled = true }
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = nowPlayingCover
    img.onload = () => {
      try {
        const sampleSize = 24
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          if (!cancelled) setNowPlayingTone('dark')
          return
        }
        canvas.width = sampleSize
        canvas.height = sampleSize
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
        const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data
        let total = 0
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] / 255
          if (alpha === 0) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          total += luminance
          count += 1
        }
        const avg = count ? (total / count) : 1
        const tone = avg >= 0.58 ? 'dark' : 'light'
        if (!cancelled) setNowPlayingTone(tone)
      } catch {
        if (!cancelled) setNowPlayingTone('dark')
      }
    }
    img.onerror = () => {
      if (!cancelled) setNowPlayingTone('dark')
    }
    return () => { cancelled = true }
  }, [nowPlayingCover])

  const moduleDefs = [
    {
      id: 'current',
      order: moduleConfig.current?.order || 1,
      position: moduleConfig.current?.position || 'left',
      enabled: currentEnabled,
      content: (
        <div
          className={`overlay-card full-overlay-card${nowPlayingCover ? ` full-overlay-now-playing${nowPlayingToneClass}` : ''}`}
          style={nowPlayingCover ? { '--now-playing-cover': `url(${nowPlayingCover})` } : undefined}
        >
          <div className="full-card-title">Now Playing</div>
          {current ? (
            <div className="full-game-card">
              {showNowPlayingThumb && (
                current.image_url ? (
                  <img className="full-game-cover" src={buildCoverUrl(current.image_url)} alt="" />
                ) : (
                  <div className="full-game-cover placeholder"><i className="bi bi-controller"></i></div>
                )
              )}
              <div className="full-game-info">
                <div className="full-game-title">{safeText(current.title)}</div>
                <div className="full-game-meta">
                  {safeText(current.console)}
                  {globalConfig.showYear !== false && current.release_year ? ` • ${current.release_year}` : ''}
                  {globalConfig.showPublisher !== false && current.publisher ? ` • ${current.publisher}` : ''}
                </div>
                {current.status && <div className="full-game-status">{current.status}</div>}
                {showEventTimer && (
                  <div className="full-game-timer">
                    <span className="full-game-timer-label">Current</span>
                    <span className="full-game-timer-value">{timers.currentGameTime}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-secondary small">No current game selected.</div>
          )}
        </div>
      )
    },
    {
      id: eventModuleId,
      order: eventModuleConfig?.order || 1,
      position: eventModuleConfig?.position || 'left',
      enabled: eventModuleEnabled,
      content: (
        <div className="overlay-card full-overlay-card full-overlay-event">
          <div className="full-card-title">{eventModuleTitle}</div>
          {statsEnabled && (
            <>
              <div className="full-event-summary">
                <span className="full-event-summary-percent">{stats.percent}%</span>
                <span className="full-event-summary-label">Complete</span>
                <span className="full-event-summary-divider">-</span>
                <span className="full-event-summary-counts">
                  <span className="full-event-summary-counts-label">Games completed</span>
                  <span className="full-event-summary-counts-value">{stats.completed.toLocaleString()}/{stats.total.toLocaleString()}</span>
                </span>
              </div>
            </>
          )}
          {showEventTimer && eventTitle && (
            <div className="full-event-inline">
              <span className="full-event-title">{eventTitle}</span>
              {eventSubtitle && <span className="full-event-sub"> - {eventSubtitle}</span>}
            </div>
          )}
          {showEventTimer && (
            <div className="full-event-timer">
              <span className="full-event-timer-label">Event</span>
              <span className="full-event-timer-value">{timers.totalTime}</span>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'achievements',
      order: moduleConfig.achievements?.order || 1,
      position: moduleConfig.achievements?.position || 'right',
      enabled: achievementsEnabled && globalConfig.showAchievements !== false,
      content: (
        <div className="overlay-card full-overlay-card">
          <div className="full-card-title">Achievements</div>
          {!isConfigured && (
            <div className="text-secondary small">RetroAchievements not configured.</div>
          )}
          {isConfigured && (!current || !RA.hasRetroAchievementsSupport(current)) && (
            <div className="text-secondary small">Current game has no RetroAchievements.</div>
          )}
          {isConfigured && current && RA.hasRetroAchievementsSupport(current) && (
            <>
              <div className="full-achievement-progress">
                <div className="full-achievement-percent">{achievementPercent}%</div>
                <div className="full-achievement-stats">
                  <div className="full-achievement-count">{earnedCount}/{totalAchievements} earned</div>
                  <div className="full-achievement-points-total">{earnedPoints}/{totalPoints} pts</div>
                </div>
              </div>
              <div className="progress-bar-bg full-stats-bar">
                <div className="progress-bar-fill" style={{ width: `${achievementPercent}%` }} />
              </div>
              {state.loading?.gameAchievements && (
                <div className="text-secondary small">Loading achievements...</div>
              )}
              {!state.loading?.gameAchievements && totalAchievements === 0 && (
                <div className="text-secondary small">No achievements found.</div>
              )}
              {!state.loading?.gameAchievements && totalAchievements > 0 && lockedCount === 0 && (
                <div className="text-secondary small">All achievements earned.</div>
              )}
              {!state.loading?.gameAchievements && totalAchievements > 0 && (
                <div className="full-achievement-list" style={achievementListStyle} key={`ach-page-${achievementPage}`}>
                  {visibleAchievements.map(achievement => (
                    <div
                      className={`full-achievement-item ${achievement.isEarned ? 'earned' : 'locked'}`}
                      key={achievement.id}
                    >
                      <img
                        className="full-achievement-badge"
                        src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`}
                        alt=""
                      />
                      <div className="full-achievement-info">
                        <div className="full-achievement-title-row">
                          <div className="full-achievement-title">{achievement.title}</div>
                          <span
                            className={`full-achievement-status-icon ${achievement.isEarned ? 'earned' : 'locked'}`}
                            aria-label={achievement.isEarned ? 'Unlocked' : 'Locked'}
                          >
                            {achievement.isEarned ? '🏆' : '🔒'}
                          </span>
                        </div>
                        <div className="full-achievement-desc">{achievement.description}</div>
                      </div>
                      <div className="full-achievement-points">
                        <span className="full-achievement-points-value">{achievement.points}</span>
                        <span className="full-achievement-points-label">pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )
    }
  ]

  const leftModules = orderModules(moduleDefs.filter(m => m.enabled && m.position === 'left'))
  const rightModules = orderModules(moduleDefs.filter(m => m.enabled && m.position === 'right'))
  const bottomModules = orderModules(moduleDefs.filter(m => m.enabled && m.position === 'bottom'))

  const bottomHeight = bottomModules.length ? Math.max(80, Number(fullConfig.bottomHeight || 140)) : 0
  const scaleValue = (value, factor, min) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return min
    return Math.max(min, Math.round(num * factor))
  }
  const isFocus = layoutMode === 'focus'
  const leftWidthBase = isFocus ? scaleValue(fullConfig.leftWidth ?? 360, 0.78, 240) : (fullConfig.leftWidth ?? 360)
  const rightWidthBase = isFocus ? scaleValue(fullConfig.rightWidth ?? 360, 0.78, 240) : (fullConfig.rightWidth ?? 360)
  const padding = isFocus ? scaleValue(fullConfig.padding ?? 32, 0.8, 16) : (fullConfig.padding ?? 32)
  const columnGap = isFocus ? scaleValue(fullConfig.columnGap ?? 24, 0.75, 12) : (fullConfig.columnGap ?? 24)
  const moduleGap = isFocus ? scaleValue(fullConfig.moduleGap ?? 16, 0.75, 10) : (fullConfig.moduleGap ?? 16)
  const gameInsetX = Number(fullConfig.gameInsetX ?? 28)
  const gameInsetY = Number(fullConfig.gameInsetY ?? 20)
  const cameraDock = fullConfig.cameraDock ?? false
  const cameraWidth = Number(fullConfig.cameraWidth ?? 360)
  const cameraHeight = Number(fullConfig.cameraHeight ?? 200)
  const cameraOffsetX = Number(fullConfig.cameraOffsetX ?? 32)
  const cameraOffsetY = Number(fullConfig.cameraOffsetY ?? 32)
  const cameraPosition = String(fullConfig.cameraPosition || 'bottom-right')
  const cameraEnabled = showCameraFrame
  const stageInsetBoost = 10
  const gameInsetXValue = Number.isFinite(gameInsetX) ? Math.max(0, gameInsetX - stageInsetBoost) : 0
  const gameInsetYValue = Number.isFinite(gameInsetY) ? Math.max(0, gameInsetY - stageInsetBoost) : 0
  const cameraWidthValue = Number.isFinite(cameraWidth) ? cameraWidth : 360
  const cameraHeightValue = Number.isFinite(cameraHeight) ? cameraHeight : 200
  const cameraOffsetXValue = Number.isFinite(cameraOffsetX) ? cameraOffsetX : 32
  const cameraOffsetYValue = Number.isFinite(cameraOffsetY) ? cameraOffsetY : 32
  const dockCamera = cameraDock && cameraEnabled
  const dockCameraLeft = dockCamera && cameraPosition.includes('left')
  const dockCameraRight = dockCamera && cameraPosition.includes('right')
  const dockCameraTop = dockCamera && cameraPosition.includes('top')
  const dockCameraBottom = dockCamera && cameraPosition.includes('bottom')
  const dockOffsetX = dockCamera ? Math.max(0, cameraOffsetXValue - padding) : 0
  const dockOffsetYTop = dockCamera ? Math.max(0, cameraOffsetYValue - padding) : 0
  const dockOffsetYBottom = dockCamera ? Math.max(0, cameraOffsetYValue - padding - bottomHeight) : 0
  const cameraDockRequiredWidth = dockCamera ? cameraWidthValue + dockOffsetX : 0
  const leftWidth = dockCameraLeft ? Math.max(leftWidthBase, cameraDockRequiredWidth) : leftWidthBase
  const rightWidth = dockCameraRight ? Math.max(rightWidthBase, cameraDockRequiredWidth) : rightWidthBase
  const hasLeftColumn = leftModules.length > 0 || dockCameraLeft
  const hasRightColumn = rightModules.length > 0 || dockCameraRight
  const columnCount = (hasLeftColumn ? 1 : 0) + 1 + (hasRightColumn ? 1 : 0)
  const gapCount = Math.max(0, columnCount - 1)
  const gridWidth = Math.max(0, viewportWidth - padding * 2)
  const gridHeight = Math.max(0, viewportHeight - bottomHeight - padding * 2)
  const stageWidth = Math.max(0, gridWidth - (hasLeftColumn ? leftWidth : 0) - (hasRightColumn ? rightWidth : 0) - columnGap * gapCount)
  const stageHeight = Math.max(0, gridHeight)
  const availableStageWidth = stageWidth > 0 ? Math.max(0, stageWidth - cameraOffsetXValue) : cameraWidthValue
  const availableStageHeight = stageHeight > 0 ? Math.max(0, stageHeight - cameraOffsetYValue) : cameraHeightValue
  const cameraWidthFinal = dockCamera ? cameraWidthValue : Math.min(cameraWidthValue, availableStageWidth)
  const cameraHeightFinal = dockCamera ? cameraHeightValue : Math.min(cameraHeightValue, availableStageHeight)
  let gameInsetLeft = gameInsetXValue
  let gameInsetRight = gameInsetXValue
  let gameInsetTop = gameInsetYValue
  let gameInsetBottom = gameInsetYValue
  if (cameraEnabled && !dockCamera) {
    const reserveX = cameraWidthFinal + cameraOffsetXValue + gameInsetXValue
    const reserveY = cameraHeightFinal + cameraOffsetYValue + gameInsetYValue
    if (cameraPosition.includes('left')) gameInsetLeft = Math.max(gameInsetLeft, reserveX)
    if (cameraPosition.includes('right')) gameInsetRight = Math.max(gameInsetRight, reserveX)
    if (cameraPosition.includes('top')) gameInsetTop = Math.max(gameInsetTop, reserveY)
    if (cameraPosition.includes('bottom')) gameInsetBottom = Math.max(gameInsetBottom, reserveY)
  }
  const gridColumns = hasLeftColumn && hasRightColumn
    ? 'minmax(0, var(--full-left-width)) minmax(0, 1fr) minmax(0, var(--full-right-width))'
    : hasLeftColumn
      ? 'minmax(0, var(--full-left-width)) minmax(0, 1fr)'
      : hasRightColumn
        ? 'minmax(0, 1fr) minmax(0, var(--full-right-width))'
        : 'minmax(0, 1fr)'
  const layoutStyle = {
    '--full-left-width': `${leftWidth}px`,
    '--full-right-width': `${rightWidth}px`,
    '--full-padding': `${padding}px`,
    '--full-grid-columns': gridColumns,
    '--full-column-gap': `${(hasLeftColumn || hasRightColumn) ? columnGap : 0}px`,
    '--full-module-gap': `${moduleGap}px`,
    '--full-bottom-height': `${bottomHeight}px`,
    '--full-game-inset-x': `${gameInsetXValue}px`,
    '--full-game-inset-y': `${gameInsetYValue}px`,
    '--full-game-inset-left': `${gameInsetLeft}px`,
    '--full-game-inset-right': `${gameInsetRight}px`,
    '--full-game-inset-top': `${gameInsetTop}px`,
    '--full-game-inset-bottom': `${gameInsetBottom}px`,
    '--full-camera-width': `${cameraWidthFinal}px`,
    '--full-camera-height': `${cameraHeightFinal}px`,
    '--full-camera-offset-x': `${cameraOffsetXValue}px`,
    '--full-camera-offset-y': `${cameraOffsetYValue}px`,
    '--full-stage-x': `${padding + (hasLeftColumn ? (leftWidth + columnGap) : 0)}px`,
    '--full-stage-y': `${padding}px`,
    '--full-stage-w': `${Math.max(0, stageWidth)}px`,
    '--full-stage-h': `${Math.max(0, stageHeight)}px`
  }

  const cameraStyle = {
    width: 'var(--full-camera-width)',
    height: 'var(--full-camera-height)',
    maxWidth: 'calc(100% - var(--full-camera-offset-x))',
    maxHeight: 'calc(100% - var(--full-camera-offset-y))'
  }
  const cameraGuideVisible = showGuides && showCameraFrame
  const renderDockedCamera = (side, isTop) => {
    const cameraSlotStyle = {
      justifyContent: side === 'right' ? 'flex-end' : 'flex-start'
    }
    const cameraFrameStyle = {
      width: 'var(--full-camera-width)',
      height: 'var(--full-camera-height)',
      maxWidth: '100%',
      maxHeight: '100%',
      marginLeft: side === 'left' ? `${dockOffsetX}px` : undefined,
      marginRight: side === 'right' ? `${dockOffsetX}px` : undefined,
      marginTop: isTop ? `${dockOffsetYTop}px` : undefined,
      marginBottom: !isTop ? `${dockOffsetYBottom}px` : undefined
    }
    return (
      <div className="full-overlay-column-slot" style={cameraSlotStyle}>
        <div className={`full-overlay-camera-docked${cameraGuideVisible ? ' full-overlay-camera-guide' : ''}`} style={cameraFrameStyle}>
          {cameraGuideVisible && <div className="full-overlay-frame-label">Camera</div>}
        </div>
      </div>
    )
  }
  const renderModules = (modules) => (
    modules.map(module => (
      <div key={module.id} className="full-overlay-module">{module.content}</div>
    ))
  )
  const offsetX = 'var(--full-camera-offset-x)'
  const offsetY = 'var(--full-camera-offset-y)'
  switch (cameraPosition) {
    case 'top-left':
      cameraStyle.top = offsetY
      cameraStyle.left = offsetX
      break
    case 'top-right':
      cameraStyle.top = offsetY
      cameraStyle.right = offsetX
      break
    case 'bottom-left':
      cameraStyle.bottom = offsetY
      cameraStyle.left = offsetX
      break
    default:
      cameraStyle.bottom = offsetY
      cameraStyle.right = offsetX
      break
  }

  const consoleAcronym = tvEnabled ? getConsoleAcronym(current?.console) : ''
  const inputText = consoleAcronym ? clampDotText(sanitizeDotText(consoleAcronym), DOT_LABEL_MAX) : ' '
  const tvTitleText = tvEnabled ? clampDotText(sanitizeDotText(current?.title), DOT_GAME_SCROLL_MAX) : ''
  const gameLabelText = tvTitleText ? clampDotText(sanitizeDotText('Now Playing'), DOT_LABEL_MAX) : ''
  const gameMetaParts = []
  if (current?.release_year) gameMetaParts.push(String(current.release_year))
  if (current?.publisher) gameMetaParts.push(`Dev ${current.publisher}`)
  const gameMetaText = tvTitleText && gameMetaParts.length
    ? clampDotText(sanitizeDotText(gameMetaParts.join(' ')), DOT_META_MAX)
    : ''
  const hasEventStats = tvEnabled && Number.isFinite(stats.total) && stats.total > 0
  const eventLabelBase = eventTitle || 'Event'
  const eventLabelText = hasEventStats ? clampDotText(sanitizeDotText(eventLabelBase), DOT_LABEL_MAX) : ''
  const eventPercentText = hasEventStats
    ? clampDotText(sanitizeDotText(`${stats.percent}%`), DOT_LABEL_MAX)
    : ''
  const eventCountText = hasEventStats ? `${stats.completed}/${stats.total}` : ''
  const eventMetaText = hasEventStats
    ? clampDotText(sanitizeDotText(`Done ${eventCountText}`), DOT_META_MAX)
    : ''
  const achievementLabelText = bezelAchievement
    ? clampDotText(sanitizeDotText('Achievement'), DOT_LABEL_MAX)
    : ''
  const achievementTitleText = bezelAchievement
    ? clampDotText(sanitizeDotText(bezelAchievement.title), DOT_SCROLL_MAX)
    : ''
  const achievementPointsText = bezelAchievement
    ? clampDotText(sanitizeDotText(`${bezelAchievement.points || 0} PTS`), DOT_META_MAX)
    : ''
  const tvDisplays = tvDisplaySource
    .slice(0, 4)
    .map(display => {
      const labelText = display?.label == null ? '' : String(display.label)
      const label = applyDisplayTokens(renameDisplayLabel(labelText), timers, current)
      const rawValue = applyDisplayTokens(display?.value, timers, current)
      const value = applyDisplayFallback(rawValue, labelText, timers)
      return { label, value }
    })
    .filter(display => display.label || display.value)

  const connectorActive = tvEnabled && !!connectorEvent
  const connectorSource = normalizeConnectorSource(connectorEvent?.source)
  const connectorType = normalizeConnectorType(connectorEvent?.type)
  const connectorFocus = normalizeConnectorFocus(connectorEvent?.focus || connectorEvent?.center || connectorEvent?.mode)
  const connectorTheme = resolveConnectorTheme(connectorEvent, connectorSource, connectorType)
  const connectorStyle = connectorActive ? {
    '--connector-border': connectorTheme.border,
    '--connector-glow': connectorTheme.glow
  } : undefined
  const connectorLabelBase = connectorActive ? formatConnectorLabel(connectorSource, connectorType) : ''
  const connectorTitleBase = connectorActive ? (safeText(connectorEvent?.user || connectorEvent?.title) || connectorLabelBase) : ''
  const connectorMessageRaw = connectorActive ? safeText(connectorEvent?.message) : ''
  const connectorMetaBase = connectorActive ? formatConnectorMeta(connectorEvent, connectorType) : ''
  const connectorLabelText = connectorActive ? clampDotText(sanitizeDotText(connectorLabelBase), DOT_LABEL_MAX) : ''
  const connectorTitleText = connectorActive ? clampDotText(sanitizeDotText(connectorTitleBase), DOT_SCROLL_MAX) : ''
  const connectorMessageText = connectorActive ? clampDotText(sanitizeDotText(connectorMessageRaw), DOT_SCROLL_MAX) : ''
  const connectorMetaText = connectorActive
    ? (connectorMessageText || clampDotText(sanitizeDotText(connectorMetaBase), DOT_SCROLL_MAX))
    : ''
  const connectorMetaScroll = connectorActive && Boolean(connectorMessageText || connectorMetaBase)
  const connectorIconBase = connectorActive
    ? safeText(connectorEvent?.icon || connectorIconMap[connectorType] || connectorIconMap.default)
    : ''
  const connectorIconLeft = connectorActive
    ? safeText(connectorEvent?.iconLeft || connectorIconMap[`${connectorType}Left`] || connectorIconMap.left || connectorIconBase)
    : ''
  const connectorIconRight = connectorActive
    ? safeText(connectorEvent?.iconRight || connectorIconMap[`${connectorType}Right`] || connectorIconMap.right || connectorIconBase)
    : ''
  const showConnectorIconLeft = connectorActive && Boolean(connectorIconLeft)
  const showConnectorIconRight = connectorActive && Boolean(connectorIconRight)

  const centerItems = React.useMemo(() => {
    if (!tvEnabled) return []
    const items = []
    if (tvTitleText) {
      items.push({
        type: 'game',
        label: gameLabelText,
        title: tvTitleText,
        meta: gameMetaText
      })
    }
    if (hasEventStats) {
      items.push({
        type: 'event',
        label: eventLabelText,
        title: eventPercentText,
        meta: eventMetaText
      })
    }
    return items
  }, [
    tvEnabled,
    tvTitleText,
    gameLabelText,
    gameMetaText,
    hasEventStats,
    eventLabelText,
    eventPercentText,
    eventMetaText
  ])

  const centerRotationItems = React.useMemo(() => {
    if (!tvEnabled) return []
    const items = [{ type: 'logo' }]
    centerItems.forEach(item => {
      items.push(item)
      items.push({ type: 'logo' })
    })
    return items
  }, [tvEnabled, centerItems])

  const gameCenterIndex = React.useMemo(() => (
    centerRotationItems.findIndex(item => item.type === 'game')
  ), [centerRotationItems])

  React.useEffect(() => {
    if (!tvEnabled) {
      setCenterIndex(0)
      centerLockRef.current = 0
      return
    }
    if (bezelAchievement || connectorActive) return
    setCenterIndex(0)
    if (centerRotationItems.length <= 1) return
    const id = setInterval(() => {
      if (centerLockRef.current && Date.now() < centerLockRef.current) return
      setCenterIndex(prev => (prev + 1) % centerRotationItems.length)
    }, logoSwapMs)
    return () => clearInterval(id)
  }, [tvEnabled, bezelAchievement, connectorActive, centerRotationItems.length, logoSwapMs, centerCycleSeed])

  React.useEffect(() => {
    if (!tvEnabled) return
    const gameId = current?.id || null
    if (!gameId) return
    if (gameId === lastGameIdRef.current) return
    lastGameIdRef.current = gameId
    if (gameCenterIndex >= 0) {
      centerLockRef.current = Date.now() + GAME_LOCK_MS
      setCenterIndex(gameCenterIndex)
      setCenterCycleSeed(seed => seed + 1)
    }
  }, [tvEnabled, current?.id, gameCenterIndex])

  React.useEffect(() => {
    if (!tvEnabled) return
    const shell = tvShellRef.current
    const screen = tvScreenRef.current
    if (!shell || !screen || typeof ResizeObserver === 'undefined') return

    const updateCutout = () => {
      const shellRect = shell.getBoundingClientRect()
      const screenRect = screen.getBoundingClientRect()
      const x = Math.max(0, screenRect.left - shellRect.left)
      const y = Math.max(0, screenRect.top - shellRect.top)
      const w = Math.max(0, screenRect.width)
      const h = Math.max(0, screenRect.height)
      shell.style.setProperty('--tv-cutout-x', `${x}px`)
      shell.style.setProperty('--tv-cutout-y', `${y}px`)
      shell.style.setProperty('--tv-cutout-w', `${w}px`)
      shell.style.setProperty('--tv-cutout-h', `${h}px`)
    }

    updateCutout()
    const observer = new ResizeObserver(updateCutout)
    observer.observe(shell)
    observer.observe(screen)
    window.addEventListener('resize', updateCutout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateCutout)
    }
  }, [tvEnabled, viewportWidth, viewportHeight])

  const activeCenter = centerRotationItems[centerIndex] || centerRotationItems[0] || { type: 'logo' }
  const showGameLayer = centerItems.some(item => item.type === 'game')
  const showEventLayer = centerItems.some(item => item.type === 'event')
  const showAchievementLayer = Boolean(bezelAchievement)
  const centerOverride = connectorFocus === 'game'
    ? (showGameLayer ? 'game' : null)
    : connectorFocus === 'event'
      ? (showEventLayer ? 'event' : null)
      : null
  const centerMode = centerOverride ?? (connectorActive ? 'connector' : bezelAchievement ? 'achievement' : (activeCenter?.type || 'logo'))
  const showConnectorLayer = connectorActive && centerMode === 'connector'

  const stageFrames = (
    <>
      {showGuides && showGameFrame && (
        <div className="full-overlay-frame full-overlay-game">
          <div className="full-overlay-frame-label">Game Capture</div>
        </div>
      )}
      {showGuides && showCameraFrame && !cameraDock && (
        <div className="full-overlay-frame full-overlay-camera" style={cameraStyle}>
          <div className="full-overlay-frame-label">Camera</div>
        </div>
      )}
      <FullOverlayAchievementPopups
        enabled={showAchievementPopups}
        forceEnable={raTest && showAchievementPopups}
        duration={popupDuration}
        onActiveChange={setAchievementGlow}
      />
    </>
  )

  return (
    <div className={`overlay-chrome full-overlay-shell full-layout-${layoutMode} ${showGuides ? 'full-overlay-guides' : ''} ${isClean ? 'overlay-clean' : ''}`} style={layoutStyle}>
      <div className="full-overlay-backdrop" aria-hidden="true"></div>
      <div className="full-overlay-grid">
        {hasLeftColumn && (
          dockCameraLeft ? (
            <div className="full-overlay-column full-overlay-column-docked">
              {dockCameraTop && renderDockedCamera('left', true)}
              <div className="full-overlay-column-stack">
                {renderModules(leftModules)}
              </div>
              {dockCameraBottom && renderDockedCamera('left', false)}
            </div>
          ) : (
            <div className="full-overlay-column">
              {renderModules(leftModules)}
            </div>
          )
        )}
        <div className={`full-overlay-stage${achievementGlow ? ' achievement-glow' : ''}${tvEnabled ? ' full-overlay-stage-tv' : ''}`}>
          {tvEnabled ? (
            <div className="full-tv-shell" ref={tvShellRef}>
              {allStickers.length > 0 && (
                <div className="full-tv-stickers" aria-hidden="true">
                  {allStickers.map((sticker, index) => {
                    const x = clampNumber(sticker?.x, 0, 100, 0)
                    const y = clampNumber(sticker?.y, 0, 100, 0)
                    const size = clampNumber(sticker?.size, 2, 40, 12)
                    const rotate = clampNumber(sticker?.rotate, -180, 180, 0)
                    const opacity = clampNumber(sticker?.opacity, 0, 1, 1)
                    const url = String(sticker.url || '').trim()
                    if (!url) return null
                    return (
                      <div
                        className="full-tv-sticker"
                        key={`tv-sticker-${index}`}
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          width: `${size}%`,
                          opacity,
                          transform: `rotate(${rotate}deg)`,
                          zIndex: index + 2
                        }}
                      >
                        <img src={url} alt="" />
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="full-tv-screen" ref={tvScreenRef}>
                {stageFrames}
              </div>
              <div className="full-tv-footer">
                <div className="full-tv-displays">
                  {tvDisplays.map((display, index) => (
                    <div className="full-tv-display" key={`tv-display-${index}`}>
                      {display.label && (
                        <DotMatrixText
                          className="full-tv-display-label"
                          text={display.label}
                          dotSize={2}
                          dotGap={0}
                          charGap={1}
                        />
                      )}
                      {display.value && (
                        <DotMatrixText
                          className="full-tv-display-value"
                          text={display.value}
                          dotSize={3}
                          dotGap={0}
                          charGap={1}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className={`full-tv-logo show-${centerMode}`} style={connectorStyle}>
                  <div className="full-tv-logo-layer full-tv-logo-layer-logo">
                    {tvLogoUrl ? (
                      <div className="full-tv-logo-mark" style={{ '--logo-url': `url("${tvLogoUrl}")` }}>
                        <img src={tvLogoUrl} alt="Logo" />
                      </div>
                    ) : (
                      <span>{tvLogoText}</span>
                    )}
                  </div>
                  {showGameLayer && (
                    <div className="full-tv-logo-layer full-tv-logo-layer-game">
                      <div className="full-tv-logo-stack">
                        {activeCenter.type === 'game' && activeCenter.label ? (
                          <DotMatrixText text={activeCenter.label} dotSize={2} dotGap={0} charGap={1} />
                        ) : (
                          <DotMatrixText text={gameLabelText} dotSize={2} dotGap={0} charGap={1} />
                        )}
                        <DotMatrixText
                          text={tvTitleText}
                          dotSize={4}
                          dotGap={0}
                          charGap={1}
                          scroll
                          maxChars={DOT_GAME_SCROLL_VISIBLE}
                          scrollSpeed={14}
                          scrollGap={8}
                        />
                        {gameMetaText ? (
                          <DotMatrixText text={gameMetaText} dotSize={2} dotGap={0} charGap={1} />
                        ) : null}
                      </div>
                    </div>
                  )}
                  {showEventLayer && (
                    <div className="full-tv-logo-layer full-tv-logo-layer-event">
                      <div className="full-tv-logo-stack">
                        <DotMatrixText text={eventLabelText} dotSize={2} dotGap={0} charGap={1} />
                        <DotMatrixText text={eventPercentText} dotSize={4} dotGap={0} charGap={1} />
                        {eventMetaText ? (
                          <DotMatrixText text={eventMetaText} dotSize={2} dotGap={0} charGap={1} />
                        ) : null}
                      </div>
                    </div>
                  )}
                  {showConnectorLayer && (
                    <div className="full-tv-logo-layer full-tv-logo-layer-connector">
                      <div className="full-tv-logo-connector">
                        {showConnectorIconLeft ? (
                          <div className="full-tv-logo-side full-tv-logo-side-left">
                            <div className="full-tv-logo-icon" style={{ '--icon-url': `url("${connectorIconLeft}")` }} />
                          </div>
                        ) : null}
                        <div className="full-tv-logo-stack">
                          {connectorLabelText ? (
                            <DotMatrixText text={connectorLabelText} dotSize={2} dotGap={0} charGap={1} />
                          ) : null}
                          {connectorTitleText ? (
                            <DotMatrixText
                              text={connectorTitleText}
                              dotSize={4}
                              dotGap={0}
                              charGap={1}
                              scroll
                              maxChars={DOT_SCROLL_VISIBLE}
                              scrollSpeed={16}
                              scrollGap={8}
                            />
                          ) : null}
                          {connectorMetaText ? (
                            <DotMatrixText
                              text={connectorMetaText}
                              dotSize={2}
                              dotGap={0}
                              charGap={1}
                              scroll={connectorMetaScroll}
                              maxChars={DOT_SCROLL_VISIBLE}
                              scrollSpeed={20}
                              scrollGap={8}
                            />
                          ) : null}
                        </div>
                        {showConnectorIconRight ? (
                          <div className="full-tv-logo-side full-tv-logo-side-right">
                            <div className="full-tv-logo-icon" style={{ '--icon-url': `url("${connectorIconRight}")` }} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {showAchievementLayer && (
                    <div className="full-tv-logo-layer full-tv-logo-layer-achievement">
                      <div className="full-tv-logo-stack">
                        <DotMatrixText text={achievementLabelText} dotSize={2} dotGap={0} charGap={1} />
                        <DotMatrixText
                          text={achievementTitleText}
                          dotSize={3}
                          dotGap={0}
                          charGap={1}
                          scroll
                          maxChars={DOT_SCROLL_VISIBLE}
                          scrollSpeed={20}
                          scrollGap={8}
                        />
                        {achievementPointsText ? (
                          <DotMatrixText text={achievementPointsText} dotSize={2} dotGap={0} charGap={1} />
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                <div className="full-tv-right">
                  <div className="full-tv-display full-tv-input">
                    <DotMatrixText
                      className="full-tv-display-label"
                      text="Input"
                      dotSize={2}
                      dotGap={0}
                      charGap={1}
                    />
                    <DotMatrixText
                      className="full-tv-display-value"
                      text={inputText}
                      dotSize={4}
                      dotGap={0}
                      charGap={1}
                    />
                  </div>
                  <div className="full-tv-controls" aria-hidden="true">
                    <span className="full-tv-knob" />
                    <span className="full-tv-knob" />
                    <span className="full-tv-knob" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            stageFrames
          )}
        </div>
        {hasRightColumn && (
          dockCameraRight ? (
            <div className="full-overlay-column full-overlay-column-docked">
              {dockCameraTop && renderDockedCamera('right', true)}
              <div className="full-overlay-column-stack">
                {renderModules(rightModules)}
              </div>
              {dockCameraBottom && renderDockedCamera('right', false)}
            </div>
          ) : (
            <div className="full-overlay-column">
              {renderModules(rightModules)}
            </div>
          )
        )}
      </div>

      {bottomModules.length > 0 && (
        <div className="full-overlay-bottom">
          {bottomModules.map(module => (
            <div key={module.id} className="full-overlay-module">{module.content}</div>
          ))}
        </div>
      )}
    </div>
  )
}
