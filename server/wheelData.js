import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { listSuggestions } from './publicData.js'
import { getActiveEvent } from './eventData.js'
import { getIndex } from './library.js'
import { mergeWithGameLibrary } from './userMetadata.js'
import { getPool as getSavedPool } from './wheelPools.js'

console.log('[WheelData] Module loaded v3-snapshot')

export const WHEEL_VERSION = 'v3-snapshot'

const SLOT_COUNT = 16
// RetroAchievements-style bonus tags appear in titles, e.g. "~Hack~", "~Homebrew~", "[Subset - ...]"
const BONUS_CATEGORIES = {
  subset: /\[\s*subset[^\]]*\]/i,
  hack: /~\s*hack\s*~/i,
  prototype: /~\s*prototype\s*~/i,
  demo: /~\s*demo\s*~/i,
  homebrew: /~\s*homebrew\s*~/i,
  unlicensed: /~\s*unlicensed\s*~/i
}

const DEFAULT_SETTINGS = {
  eventRestriction: true,
  includeSuggestions: false,
  consoleFilter: 'All', // 'All' or console label
  poolMode: 'all', // 'all' | 'custom' | 'saved'
  savedPoolId: null, // ID of saved pool when poolMode === 'saved'
  customGameIds: [],
  customIncludeSuggestions: false,
  consoleCustomItems: [],
  // 'pool' = pick winner from full eligible pool (recommended for true randomness)
  // 'sample' = pick winner only from the 16 visible slices
  spinSource: 'pool', // 'pool' | 'sample'
  bonusMode: 'exclude', // 'include', 'exclude', 'only'
  bonusExclusions: {
    subset: true,
    hack: false,
    prototype: false,
    demo: false,
    homebrew: false,
    unlicensed: false
  },
  spinDuration: 4500,
  spinTurns: 8
}

const wheelState = {
  mode: 'game', // 'console' | 'game'
  settings: { ...DEFAULT_SETTINGS },
  spin: null, // { spinId, ts, mode, targetIdx, durationMs, turns, sample, sampleHash, poolSize, winner }
  event: { name: '', consoles: [] }
}

const STATE_FILE = path.join(process.cwd(), 'server', 'data', 'wheel-state.json')

function isBonus(title) {
  return detectBonusCategories(title).length > 0
}

function detectBonusCategories(title) {
  const t = String(title || '')
  const categories = []
  for (const [key, rx] of Object.entries(BONUS_CATEGORIES)) {
    if (rx.test(t)) categories.push(key)
  }
  return categories
}

function shouldExcludeBonus(title, settings) {
  const categories = detectBonusCategories(title)
  if (categories.length === 0) return false

  const exclusions = settings?.bonusExclusions
  // Back-compat: if no explicit exclusions are configured, treat as legacy "exclude all bonuses".
  if (!exclusions || typeof exclusions !== 'object') return true

  return categories.some(category => exclusions?.[category] === true)
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

function sampleHash(sample) {
  const arr = Array.isArray(sample) ? sample : []
  return arr
    .slice(0, SLOT_COUNT)
    .map(item => {
      if (!item) return '-'
      if (typeof item !== 'object') return String(item)
      return String(item.id || item.title || item.name || 'item')
    })
    .join('|')
}

function buildDisplaySampleFromPool(pool, winner, targetIdx, slotCount = SLOT_COUNT) {
  const sample = Array(slotCount).fill(null)
  if (!winner) return sample

  const clampedTarget = Math.max(0, Math.min(slotCount - 1, Number(targetIdx) || 0))
  sample[clampedTarget] = winner

  const choices = Array.isArray(pool) ? pool.filter(Boolean) : []
  const rest = choices.length > 1 ? choices.filter(item => item !== winner) : choices
  const poolCopy = [...rest]

  for (let i = 0; i < slotCount; i++) {
    if (i === clampedTarget) continue
    if (poolCopy.length === 0) poolCopy.push(...rest)
    if (poolCopy.length === 0) {
      sample[i] = winner
      continue
    }
    const idx = Math.floor(Math.random() * poolCopy.length)
    sample[i] = poolCopy.splice(idx, 1)[0] || null
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
  const bonusExclusions = (s.bonusExclusions && typeof s.bonusExclusions === 'object') ? s.bonusExclusions : null
  const keySettings = {
    eventRestriction: !!s.eventRestriction,
    includeSuggestions: !!s.includeSuggestions,
    consoleFilter: s.consoleFilter || 'All',
    poolMode: s.poolMode || 'all',
    savedPoolId: s.savedPoolId || '',
    customGameIds: Array.isArray(s.customGameIds) ? s.customGameIds.map(id => String(id || '')).filter(Boolean).sort().join('|') : '',
    customIncludeSuggestions: !!s.customIncludeSuggestions,
    consoleCustomItems: Array.isArray(s.consoleCustomItems) ? s.consoleCustomItems.map(v => String(v || '')).filter(Boolean).sort().join('|') : '',
    spinSource: s.spinSource === 'sample' ? 'sample' : 'pool',
    bonusMode: s.bonusMode || 'exclude',
    bonusExclusions: bonusExclusions ? Object.keys(BONUS_CATEGORIES).map(k => (bonusExclusions[k] === true ? k : '')).filter(Boolean).sort().join('|') : ''
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

async function buildPool({ mode, settings, games, eventList }) {
  let pool = []

  if (mode === 'console') {
    const publicConsolesDir = path.join(process.cwd(), 'public', 'consoles')
    const customItems = Array.isArray(settings.consoleCustomItems) ? settings.consoleCustomItems : []
    const cleanedCustom = customItems.map(v => String(v || '').trim()).filter(Boolean).slice(0, 64)

    if (cleanedCustom.length > 0) {
      pool = cleanedCustom.map(text => {
        const safeName = text.replace(/[^a-zA-Z0-9\-_ ]/g, '')
        const pngPath = path.join(publicConsolesDir, `${safeName}.png`)
        const hasImg = fs.existsSync(pngPath)
        return {
          id: `console-${text}`,
          title: text,
          type: 'console',
          isConsole: true,
          image_url: hasImg ? `/consoles/${safeName}.png` : null
        }
      })
      return pool
    }

    let consoles = []
    if (settings.eventRestriction && eventList.cleaned.length > 0 && !eventList.hasAll) {
      consoles = eventList.cleaned
    } else {
      const set = new Set()
      for (const g of games) if (g.console) set.add(g.console)
      consoles = Array.from(set).filter(Boolean).sort()
    }
    pool = consoles.map(c => {
      const safeName = c.replace(/[^a-zA-Z0-9\-_ ]/g, '')
      const pngPath = path.join(publicConsolesDir, `${safeName}.png`)
      const hasImg = fs.existsSync(pngPath)
      return {
        id: `console-${c}`,
        title: c,
        type: 'console',
        isConsole: true,
        image_url: hasImg ? `/consoles/${safeName}.png` : null
      }
    })
    return pool
  }

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

  if (settings.bonusMode === 'exclude') filtered = filtered.filter(g => !shouldExcludeBonus(g.title, settings))
  if (settings.bonusMode === 'only') filtered = filtered.filter(g => isBonus(g.title))

  const poolMode = settings.poolMode === 'custom' ? 'custom' : (settings.poolMode === 'saved' ? 'saved' : 'all')
  if (poolMode === 'custom') {
    const ids = Array.isArray(settings.customGameIds) ? settings.customGameIds : []
    const idSet = new Set(ids.map(id => String(id || '')).filter(Boolean))
    filtered = filtered.filter(g => idSet.has(String(g.id)))
  } else if (poolMode === 'saved' && settings.savedPoolId) {
    const savedPool = getSavedPool(settings.savedPoolId)
    if (savedPool && Array.isArray(savedPool.gameIds)) {
      const idSet = new Set(savedPool.gameIds.map(id => String(id || '')).filter(Boolean))
      filtered = filtered.filter(g => idSet.has(String(g.id)))
    }
  }

  pool = filtered.map(g => ({ ...g, type: 'game' }))

  // For saved pools, use the includeSuggestions flag from the pool itself
  let includeSuggestions = settings.includeSuggestions
  if (poolMode === 'custom') {
    includeSuggestions = includeSuggestions || settings.customIncludeSuggestions
  } else if (poolMode === 'saved' && settings.savedPoolId) {
    const savedPool = getSavedPool(settings.savedPoolId)
    if (savedPool) {
      includeSuggestions = includeSuggestions || savedPool.includeSuggestions
    }
  }
  if (includeSuggestions) {
    const suggestions = await listSuggestions({ status: 'accepted' })
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

  return pool
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

  const games = normalizeLibraryGames(mergeWithGameLibrary(allGames))
  const eventList = buildEventConsoleList(eventConsoles)
  const pool = await buildPool({ mode, settings, games, eventList })
  const sample = buildSample(pool, SLOT_COUNT)
  snapshotCache = { key, mode, poolSize: pool.length, sample, event: wheelState.event }

  return { version: WHEEL_VERSION, mode, settings, event: wheelState.event, poolSize: pool.length, sample, spin: wheelState.spin }
}

export async function refreshPool() {
  invalidateSnapshot()
  return getWheelSnapshot({ force: true })
}

export async function executeSpin(overrides = {}) {
  const { mode, settings } = wheelState
  const effectiveSpinSource = settings?.spinSource === 'sample' ? 'sample' : 'pool'

  const durationMs = Number(overrides.durationMs) || settings.spinDuration
  const turns = Number(overrides.turns) || settings.spinTurns

  let sample = Array(SLOT_COUNT).fill(null)
  let targetIdx = 0
  let winner = null
  let poolSize = 0

  if (effectiveSpinSource === 'pool') {
    const idx = getIndex()
    const allGames = idx ? (idx.games || []) : []

    const activeEvent = await readActiveEvent(settings)
    const eventConsoles = activeEvent?.consoles || []
    wheelState.event = activeEvent ? { name: activeEvent.name || '', consoles: eventConsoles } : { name: '', consoles: [] }

    const games = normalizeLibraryGames(mergeWithGameLibrary(allGames))
    const eventList = buildEventConsoleList(eventConsoles)
    const pool = await buildPool({ mode, settings, games, eventList })
    poolSize = pool.length
    if (pool.length === 0) throw new Error('No items in wheel')

    winner = pool[Math.floor(Math.random() * pool.length)] || null
    targetIdx = Math.floor(Math.random() * SLOT_COUNT)
    sample = buildDisplaySampleFromPool(pool, winner, targetIdx, SLOT_COUNT)
  } else {
    // Legacy behavior: spin from the currently visible sample.
    const snapshot = await getWheelSnapshot({ force: false })
    const snapshotSample = Array.isArray(snapshot.sample) ? snapshot.sample : Array(SLOT_COUNT).fill(null)
    const valid = snapshotSample.map((item, i) => (item ? i : -1)).filter(i => i !== -1)
    if (valid.length === 0) throw new Error('No items in wheel')

    targetIdx = valid[Math.floor(Math.random() * valid.length)]
    sample = snapshotSample
    poolSize = Number(snapshot.poolSize) || 0
    winner = sample[targetIdx] || null
  }

  const spin = {
    spinId: Number(crypto.randomInt(1, 2 ** 31 - 1)),
    ts: Date.now(),
    mode,
    sample,
    sampleHash: sampleHash(sample),
    targetIdx,
    durationMs,
    turns,
    poolSize,
    winner
  }

  wheelState.spin = spin
  // Keep the idle sample in sync with the last authoritative spin sample.
  snapshotCache.sample = sample
  snapshotCache.poolSize = poolSize

  return spin
}
