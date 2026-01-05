import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isPgEnabled, query } from './db.js'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const EVENTS_FILE = path.join(DATA_DIR, 'events.json')

const DEFAULT_EVENT = {
  name: 'Default Event',
  console: '',
  consoles: [],
  overlayTitle: '',
  overlaySubtitle: ''
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
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
    console.error('Failed to save events data:', error)
    return false
  }
}

function cleanText(value, maxLen) {
  if (value === null || value === undefined) return ''
  const s = String(value).trim()
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function normalizeConsoles(value) {
  if (!Array.isArray(value)) return []
  const set = new Set()
  value.forEach(item => {
    const trimmed = cleanText(item, 80)
    if (trimmed) set.add(trimmed)
  })
  return Array.from(set).slice(0, 40)
}

function normalizeEventInput(input = {}) {
  const name = cleanText(input.name, 80)
  if (!name) throw new Error('Event name is required')
  return {
    name,
    console: cleanText(input.console, 80),
    consoles: normalizeConsoles(input.consoles),
    overlayTitle: cleanText(input.overlayTitle, 80),
    overlaySubtitle: cleanText(input.overlaySubtitle, 120)
  }
}

function mapEventRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    console: row.console || '',
    consoles: Array.isArray(row.consoles) ? row.consoles : [],
    overlayTitle: row.overlay_title || '',
    overlaySubtitle: row.overlay_subtitle || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function getEventById(eventId) {
  if (!eventId) return null
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    const events = Array.isArray(data.events) ? data.events : []
    return events.find(event => event.id === eventId) || null
  }
  const result = await query('select * from events where id = $1', [eventId])
  return result.rows[0] ? mapEventRow(result.rows[0]) : null
}

export async function ensureEventSchema() {
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    if (!Array.isArray(data.events)) data.events = []
    if (!data.events.length) {
      const now = Date.now()
      const id = makeId()
      data.events.push({ id, ...DEFAULT_EVENT, createdAt: now, updatedAt: now })
      data.activeEventId = id
      saveJson(EVENTS_FILE, data)
    }
    return
  }

  await query(`
    create table if not exists events (
      id uuid primary key,
      name text not null,
      console text,
      consoles jsonb not null default '[]'::jsonb,
      overlay_title text,
      overlay_subtitle text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)
  await query(`
    create table if not exists event_state (
      id int primary key default 1,
      active_event_id uuid
    )
  `)
  await query(`insert into event_state (id) values (1) on conflict do nothing`)

  const count = await query('select count(*)::int as count from events')
  if ((count.rows[0]?.count || 0) === 0) {
    const id = makeId()
    await query(
      `insert into events (id, name, console, consoles, overlay_title, overlay_subtitle)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, DEFAULT_EVENT.name, DEFAULT_EVENT.console, JSON.stringify(DEFAULT_EVENT.consoles), DEFAULT_EVENT.overlayTitle, DEFAULT_EVENT.overlaySubtitle]
    )
    await query(`update event_state set active_event_id = $1 where id = 1`, [id])
  }
}

export async function listEvents() {
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    const events = Array.isArray(data.events) ? data.events : []
    return events.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }
  const result = await query('select * from events order by created_at desc')
  return result.rows.map(mapEventRow)
}

export async function getActiveEvent() {
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    if (data.activeEventId) {
      const found = (data.events || []).find(e => e.id === data.activeEventId)
      if (found) return found
    }
    return null
  }
  const state = await query('select active_event_id from event_state where id = 1')
  const activeId = state.rows[0]?.active_event_id
  if (activeId) {
    const found = await query('select * from events where id = $1', [activeId])
    if (found.rows[0]) return mapEventRow(found.rows[0])
  }
  return null
}

export async function setActiveEvent(eventId) {
  const id = eventId ? String(eventId).trim() : null
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    if (id) {
      const events = Array.isArray(data.events) ? data.events : []
      const found = events.find(event => event.id === id)
      if (!found) throw new Error('Event not found')
      data.activeEventId = id
    } else {
      data.activeEventId = null
    }
    saveJson(EVENTS_FILE, data)
    return id ? (data.events.find(e => e.id === id) || null) : null
  }
  
  if (id) {
    const result = await query('select * from events where id = $1', [id])
    if (!result.rows[0]) throw new Error('Event not found')
    await query('update event_state set active_event_id = $1 where id = 1', [id])
    return mapEventRow(result.rows[0])
  } else {
    await query('update event_state set active_event_id = NULL where id = 1')
    return null
  }
}

export async function createEvent(input) {
  const next = normalizeEventInput(input)
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    const now = Date.now()
    const event = { id: makeId(), ...next, createdAt: now, updatedAt: now }
    data.events = Array.isArray(data.events) ? data.events : []
    data.events.unshift(event)
    if (!data.activeEventId) data.activeEventId = event.id
    saveJson(EVENTS_FILE, data)
    return event
  }
  const id = makeId()
  await query(
    `insert into events (id, name, console, consoles, overlay_title, overlay_subtitle)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, next.name, next.console, JSON.stringify(next.consoles), next.overlayTitle, next.overlaySubtitle]
  )
  const result = await query('select * from events where id = $1', [id])
  return mapEventRow(result.rows[0])
}

export async function updateEvent(eventId, updates) {
  const id = String(eventId || '').trim()
  if (!id) throw new Error('Event ID is required')
  const current = await getEventById(id)
  if (!current) throw new Error('Event not found')
  const merged = {
    name: updates?.name ?? current.name,
    console: updates?.console ?? current.console,
    consoles: updates?.consoles ?? current.consoles,
    overlayTitle: updates?.overlayTitle ?? current.overlayTitle,
    overlaySubtitle: updates?.overlaySubtitle ?? current.overlaySubtitle
  }
  const next = normalizeEventInput(merged)

  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    const events = Array.isArray(data.events) ? data.events : []
    const idx = events.findIndex(event => event.id === id)
    if (idx < 0) throw new Error('Event not found')
    const updated = { ...events[idx], ...next, updatedAt: Date.now() }
    events[idx] = updated
    data.events = events
    saveJson(EVENTS_FILE, data)
    return updated
  }

  await query(
    `update events
     set name = $1,
         console = $2,
         consoles = $3,
         overlay_title = $4,
         overlay_subtitle = $5,
         updated_at = now()
     where id = $6`,
    [next.name, next.console, JSON.stringify(next.consoles), next.overlayTitle, next.overlaySubtitle, id]
  )
  const result = await query('select * from events where id = $1', [id])
  if (!result.rows[0]) throw new Error('Event not found')
  return mapEventRow(result.rows[0])
}

export async function deleteEvent(eventId) {
  const id = String(eventId || '').trim()
  if (!id) throw new Error('Event ID is required')
  if (!isPgEnabled()) {
    const data = loadJson(EVENTS_FILE, { events: [], activeEventId: null })
    const events = Array.isArray(data.events) ? data.events : []
    const remaining = events.filter(event => event.id !== id)
    if (remaining.length === events.length) throw new Error('Event not found')
    data.events = remaining
    if (data.activeEventId === id) {
      data.activeEventId = remaining[0]?.id || null
    }
    if (!data.events.length) {
      const now = Date.now()
      const nextId = makeId()
      data.events = [{ id: nextId, ...DEFAULT_EVENT, createdAt: now, updatedAt: now }]
      data.activeEventId = nextId
    }
    saveJson(EVENTS_FILE, data)
    return true
  }
  await query('delete from events where id = $1', [id])
  const state = await query('select active_event_id from event_state where id = 1')
  const activeId = state.rows[0]?.active_event_id
  if (activeId && String(activeId) === id) {
    const fallback = await query('select * from events order by created_at desc limit 1')
    const nextId = fallback.rows[0]?.id || null
    await query('update event_state set active_event_id = $1 where id = 1', [nextId])
  }
  return true
}
