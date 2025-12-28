import fs from 'fs'
import path from 'path'
import { isPgEnabled, query } from './db.js'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const EVENT_TIMERS_FILE = path.join(DATA_DIR, 'event-timers.json')

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
    console.error('Failed to save timer data:', error)
    return false
  }
}

function normalizeTimerState(input) {
  const state = input && typeof input === 'object' ? input : {}
  return {
    running: !!state.running,
    currentGameId: state.currentGameId ? String(state.currentGameId) : null,
    currentStartedAt: Number.isFinite(state.currentStartedAt) ? state.currentStartedAt : null,
    perGame: state.perGame && typeof state.perGame === 'object' ? state.perGame : {},
    totalAccumulatedSec: Math.max(0, Number(state.totalAccumulatedSec) || 0),
    updatedAt: Number(state.updatedAt) || Date.now()
  }
}

export async function ensureTimerSchema() {
  if (!isPgEnabled()) return
  await query(`
    create table if not exists event_timers (
      event_id uuid primary key,
      running boolean not null default false,
      current_game_id text,
      current_started_at timestamptz,
      total_accumulated_sec int not null default 0,
      updated_at timestamptz not null default now()
    )
  `)
  await query(`
    create table if not exists event_timer_games (
      event_id uuid not null,
      game_id text not null,
      seconds int not null default 0,
      updated_at timestamptz not null default now(),
      primary key (event_id, game_id)
    )
  `)
}

export function loadTimerStateFromFile(eventId) {
  if (!eventId) return null
  const data = loadJson(EVENT_TIMERS_FILE, { events: {} })
  const raw = data.events?.[eventId]
  if (!raw) return null
  return normalizeTimerState(raw)
}

export function saveTimerStateToFile(eventId, timerState) {
  if (!eventId) return false
  const data = loadJson(EVENT_TIMERS_FILE, { events: {} })
  data.events = data.events || {}
  data.events[eventId] = {
    ...normalizeTimerState(timerState),
    updatedAt: Date.now()
  }
  return saveJson(EVENT_TIMERS_FILE, data)
}

export async function loadTimerStateFromDb(eventId) {
  if (!isPgEnabled() || !eventId) return null
  const result = await query(
    `select running, current_game_id, current_started_at, total_accumulated_sec, updated_at
     from event_timers where event_id = $1`,
    [eventId]
  )
  const row = result.rows?.[0]
  if (!row) return null
  const gameRows = await query(
    `select game_id, seconds from event_timer_games where event_id = $1`,
    [eventId]
  )
  const perGame = {}
  for (const game of gameRows.rows || []) {
    if (!game.game_id) continue
    perGame[String(game.game_id)] = Math.max(0, Number(game.seconds) || 0)
  }
  return normalizeTimerState({
    running: !!row.running,
    currentGameId: row.current_game_id ? String(row.current_game_id) : null,
    currentStartedAt: row.current_started_at ? new Date(row.current_started_at).getTime() : null,
    totalAccumulatedSec: Math.max(0, Number(row.total_accumulated_sec) || 0),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    perGame
  })
}

export async function saveTimerStateToDb(eventId, timerState, options = {}) {
  if (!isPgEnabled() || !eventId) return false
  await query(`insert into event_timers (event_id) values ($1) on conflict do nothing`, [eventId])
  const startedAt = timerState.currentStartedAt
    ? new Date(timerState.currentStartedAt).toISOString()
    : null
  await query(
    `update event_timers
     set running = $1,
         current_game_id = $2,
         current_started_at = $3,
         total_accumulated_sec = $4,
         updated_at = now()
     where event_id = $5`,
    [
      !!timerState.running,
      timerState.currentGameId || null,
      startedAt,
      Math.max(0, Math.floor(Number(timerState.totalAccumulatedSec) || 0)),
      eventId
    ]
  )

  const perGame = timerState.perGame || {}
  const ids = Array.isArray(options.gameIds) ? options.gameIds : Object.keys(perGame)
  const entries = ids
    .map(id => String(id || '').trim())
    .filter(Boolean)
    .map(id => [id, perGame[id]])
    .filter(([, seconds]) => Number.isFinite(Number(seconds)))

  if (!entries.length) return true

  const chunkSize = 200
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const values = []
    const params = []
    chunk.forEach(([gameId, seconds], idx) => {
      const base = idx * 3
      values.push(`($${base + 1}, $${base + 2}, $${base + 3})`)
      params.push(eventId, gameId, Math.max(0, Math.floor(Number(seconds) || 0)))
    })
    await query(
      `insert into event_timer_games (event_id, game_id, seconds)
       values ${values.join(', ')}
       on conflict (event_id, game_id)
       do update set seconds = excluded.seconds, updated_at = now()`,
      params
    )
  }
  return true
}

export async function loadLegacyTimerStateFromDb() {
  if (!isPgEnabled()) return null
  try {
    const legacy = await query(
      `select running, current_game_id, current_started_at, total_accumulated_sec, updated_at
       from overlay_timers where id = 1`
    )
    const row = legacy.rows?.[0]
    if (!row) return null
    const games = await query('select game_id, seconds from overlay_timer_games')
    const perGame = {}
    for (const game of games.rows || []) {
      if (!game.game_id) continue
      perGame[String(game.game_id)] = Math.max(0, Number(game.seconds) || 0)
    }
    return normalizeTimerState({
      running: !!row.running,
      currentGameId: row.current_game_id ? String(row.current_game_id) : null,
      currentStartedAt: row.current_started_at ? new Date(row.current_started_at).getTime() : null,
      totalAccumulatedSec: Math.max(0, Number(row.total_accumulated_sec) || 0),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
      perGame
    })
  } catch {
    return null
  }
}

