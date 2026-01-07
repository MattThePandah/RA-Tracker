import fs from 'fs'
import path from 'path'
import { listSuggestions } from './publicData.js'
import { getActiveEvent } from './eventData.js'
import { getIndex } from './library.js'

console.log('[WheelData] Module loaded v3-snapshot')

export const WHEEL_VERSION = 'v3-snapshot'

const SLOT_COUNT = 16
const BONUS_TAGS = ['(subset)', '(hack)', '(prototype)', '(demo)', '(homebrew)', '(unlicensed)']

const DEFAULT_SETTINGS = {
  eventRestriction: true,
  includeSuggestions: false,
  consoleFilter: 'All', // 'All' or console label
  bonusMode: 'exclude', // 'include', 'exclude', 'only'
  spinDuration: 4500,
  spinTurns: 8
}

const wheelState = {
  mode: 'game', // 'console' | 'game'
  settings: { ...DEFAULT_SETTINGS },
  spin: null, // { ts, mode, targetIdx, durationMs, turns, sample, winner }
  event: { name: '', consoles: [] }
}

const STATE_FILE = path.join(process.cwd(), 'server', 'data', 'wheel-state.json')

function isBonus(title) {
  const t = (title || '').toLowerCase()
  return BONUS_TAGS.some(tag => t.includes(tag))
}

function normalizeConsoleKey(value) {
  let base = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (base.startsWith('sony playstation')) base = base.replace(/^sony\s+/, '')
  const aliases = {
    ps1: 'playstation',
    psx: 'playstation',
    'playstation 1': 'playstation',
    psone: 'playstation',
    ps2: 'playstation 2',
    ps3: 'playstation 3',
    ps4: 'playstation 4',
    ps5: 'playstation 5',
    psp: 'playstation portable',
    vita: 'playstation vita',
    psn: 'playstation network'
  }
  return aliases[base] || base
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function saveState() {
  try {
    const payload = {
      mode: wheelState.mode,
      settings: wheelState.settings
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2))
  } catch (e) {
    console.error('Failed to save wheel state:', e)
  }
}

const saved = loadState()
if (saved) {
  if (saved.mode === 'console' || saved.mode === 'game') wheelState.mode = saved.mode
  if (saved.settings && typeof saved.settings === 'object') Object.assign(wheelState.settings, saved.settings)
}

function normalizeLibraryGames(allGames) {
  return (Array.isArray(allGames) ? allGames : []).map(g => {
    let consoleName = ''
    let consoleId = ''
    if (g.console) {
      if (typeof g.console === 'object') {
        consoleName = String(g.console.name || '').trim()
        consoleId = String(g.console.id || '').trim()
        if (!consoleName && consoleId) consoleName = consoleId
      } else {
        consoleName = String(g.console).trim()
      }
    }
    return { ...g, console: consoleName, consoleId }
  })
}

function buildSample(pool, slotCount = SLOT_COUNT) {
  if (!Array.isArray(pool) || pool.length === 0) return Array(slotCount).fill(null)
  const sample = []
  const poolCopy = [...pool]
  for (let i = 0; i < slotCount; i++) {
    if (poolCopy.length === 0) poolCopy.push(...pool)
    const idx = Math.floor(Math.random() * poolCopy.length)
    sample.push(poolCopy.splice(idx, 1)[0] || null)
  }
  return sample
}

async function readActiveEvent(settings) {
  if (!settings?.eventRestriction) return null
  try {
    const ev = await getActiveEvent()
    if (!ev) return null
    const consoles = Array.isArray(ev.consoles) ? ev.consoles : []
    return { id: ev.id || '', name: ev.name || '', consoles }
  } catch {
    return null
  }
}

function buildEventConsoleList(eventConsoles) {
  const cleaned = (Array.isArray(eventConsoles) ? eventConsoles : [])
    .map(c => String(c ?? '').trim())
    .filter(Boolean)

  const keys = cleaned.map(normalizeConsoleKey).filter(Boolean)
  const hasAll = keys.includes('all')

  const unique = []
  const seen = new Set()
  for (let i = 0; i < cleaned.length; i++) {
    const key = keys[i]
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(cleaned[i])
  }

  return { cleaned: unique, keys: new Set(keys), hasAll }
}

function snapshotKey({ mode, settings, idxUpdatedAt, eventId, eventConsoles }) {
  const s = settings || {}
  const keySettings = {
    eventRestriction: !!s.eventRestriction,
    includeSuggestions: !!s.includeSuggestions,
    consoleFilter: s.consoleFilter || 'All',
    bonusMode: s.bonusMode || 'exclude'
  }
  const consolesKey = (Array.isArray(eventConsoles) ? eventConsoles : [])
    .map(normalizeConsoleKey)
    .filter(Boolean)
    .sort()
    .join('|')
  return JSON.stringify({
    mode,
    keySettings,
    idxUpdatedAt: Number(idxUpdatedAt) || 0,
    eventId: String(eventId || ''),
    consolesKey
  })
}

let snapshotCache = {
  key: '',
  mode: 'game',
  poolSize: 0,
  sample: Array(SLOT_COUNT).fill(null),
  event: { name: '', consoles: [] }
}

function invalidateSnapshot() {
  snapshotCache.key = ''
}

export function getWheelState() {
  return wheelState
}

export function setWheelMode(mode) {
  if (mode !== 'console' && mode !== 'game') return
  wheelState.mode = mode
  invalidateSnapshot()
  saveState()
}

export function updateWheelSettings(updates = {}) {
  if (!updates || typeof updates !== 'object') return wheelState
  Object.assign(wheelState.settings, updates)
  invalidateSnapshot()
  saveState()
  return wheelState
}

export async function getWheelSnapshot({ force = false } = {}) {
  const { mode, settings } = wheelState
  const idx = getIndex()
  const allGames = idx ? (idx.games || []) : []
  const idxUpdatedAt = Number(idx?.meta?.updatedAt) || 0

  const activeEvent = await readActiveEvent(settings)
  const eventConsoles = activeEvent?.consoles || []
  wheelState.event = activeEvent ? { name: activeEvent.name || '', consoles: eventConsoles } : { name: '', consoles: [] }

  const key = snapshotKey({
    mode,
    settings,
    idxUpdatedAt,
    eventId: activeEvent?.id || '',
    eventConsoles
  })

  if (!force && snapshotCache.key === key) {
    return {
      version: WHEEL_VERSION,
      mode,
      settings,
      event: snapshotCache.event,
      poolSize: snapshotCache.poolSize,
      sample: snapshotCache.sample,
      spin: wheelState.spin
    }
  }

  const games = normalizeLibraryGames(allGames)
  const eventList = buildEventConsoleList(eventConsoles)

  let pool = []

  if (mode === 'console') {
    let consoles = []
    if (settings.eventRestriction && eventList.cleaned.length > 0 && !eventList.hasAll) {
      consoles = eventList.cleaned
    } else {
      const set = new Set()
      for (const g of games) if (g.console) set.add(g.console)
      consoles = Array.from(set).filter(Boolean).sort()
    }
    pool = consoles.map(c => ({ id: `console-${c}`, title: c, type: 'console', isConsole: true }))
  } else {
    let filtered = games

    if (settings.eventRestriction && eventList.cleaned.length > 0 && !eventList.hasAll) {
      filtered = filtered.filter(g => {
        const k = normalizeConsoleKey(g.console)
        if (eventList.keys.has(k)) return true
        if (g.consoleId && eventList.keys.has(normalizeConsoleKey(g.consoleId))) return true
        return false
      })
    }

    const cf = settings.consoleFilter || 'All'
    if (cf && cf !== 'All') {
      const cfKey = normalizeConsoleKey(cf)
      filtered = filtered.filter(g => {
        if (!g.console && !g.consoleId) return false
        if (normalizeConsoleKey(g.console) === cfKey) return true
        if (g.consoleId && normalizeConsoleKey(g.consoleId) === cfKey) return true
        return false
      })
    }

    if (settings.bonusMode === 'exclude') filtered = filtered.filter(g => !isBonus(g.title))
    if (settings.bonusMode === 'only') filtered = filtered.filter(g => isBonus(g.title))

    pool = filtered.map(g => ({ ...g, type: 'game' }))

    if (settings.includeSuggestions) {
      const suggestions = await listSuggestions({ status: 'open' })
      const compatible = suggestions.filter(s => {
        const cf2 = settings.consoleFilter || 'All'
        if (!cf2 || cf2 === 'All') return true
        if (!s.console) return true
        return normalizeConsoleKey(s.console) === normalizeConsoleKey(cf2)
      })
      pool = [
        ...pool,
        ...compatible.map(s => ({
          id: `suggestion-${s.id}`,
          title: s.title,
          console: s.console,
          type: 'suggestion',
          isSuggestion: true,
          requester: s.requester,
          note: s.note
        }))
      ]
    }
  }

  const sample = buildSample(pool, SLOT_COUNT)
  snapshotCache = { key, mode, poolSize: pool.length, sample, event: wheelState.event }

  return { version: WHEEL_VERSION, mode, settings, event: wheelState.event, poolSize: pool.length, sample, spin: wheelState.spin }
}

export async function refreshPool() {
  invalidateSnapshot()
  return getWheelSnapshot({ force: true })
}

export async function executeSpin(overrides = {}) {
  const snapshot = await getWheelSnapshot({ force: true })
  const sample = Array.isArray(snapshot.sample) ? snapshot.sample : Array(SLOT_COUNT).fill(null)
  const valid = sample.map((item, i) => (item ? i : -1)).filter(i => i !== -1)
  if (valid.length === 0) throw new Error('No items in wheel')

  const targetIdx = valid[Math.floor(Math.random() * valid.length)]
  const settings = wheelState.settings || DEFAULT_SETTINGS

  const spin = {
    ts: Date.now(),
    mode: wheelState.mode,
    sample,
    targetIdx,
    durationMs: Number(overrides.durationMs) || settings.spinDuration,
    turns: Number(overrides.turns) || settings.spinTurns,
    winner: sample[targetIdx] || null
  }

  wheelState.spin = spin
  // Keep the idle sample in sync with the last authoritative spin sample.
  snapshotCache.sample = sample

  return spin
}
