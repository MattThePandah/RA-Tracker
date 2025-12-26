import fs from 'fs'
import path from 'path'

export const FLAGS = {
  ALL_CONSOLES_ENABLED: process.env.ALL_CONSOLES_ENABLED === 'true',
  CONSOLES_ALLOWLIST: (process.env.CONSOLES_ALLOWLIST || 'ra:27,ra:107,ra:46')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  COVER_PREFETCH_ENABLED: process.env.COVER_PREFETCH_ENABLED === 'true',
  LIBRARY_BUILD_ON_START: process.env.LIBRARY_BUILD_ON_START === 'true',
  COVERS_VERBOSE: process.env.COVERS_VERBOSE === 'true',
  COVERS_LOG_EVERY: Number(process.env.COVERS_LOG_EVERY || 100),
}

export const LIMITS = {
  IGDB_RPS: Number(process.env.IGDB_RPS || 3),
  IGDB_MAX_CONCURRENCY: Number(process.env.IGDB_MAX_CONCURRENCY || 2),
  IGDB_MAX_RETRIES: Number(process.env.IGDB_MAX_RETRIES || 4),
  RA_RPS: Number(process.env.RA_RPS || 1),
  RA_MAX_CONCURRENCY: Number(process.env.RA_MAX_CONCURRENCY || 1),
  RA_MAX_RETRIES: Number(process.env.RA_MAX_RETRIES || 3),
}

const MAP_FILE = path.join(process.cwd(), 'server', 'platform-mapping.json')

export function loadPlatformMapping() {
  try {
    if (fs.existsSync(MAP_FILE)) {
      const raw = fs.readFileSync(MAP_FILE, 'utf-8')
      const json = JSON.parse(raw)
      if (json && typeof json === 'object') return json
    }
  } catch {}
  // Sensible partial defaults (can be expanded via platform-mapping.json)
  return {
    // RA console id → IGDB platform ids
    'ra:27': [7],     // PlayStation → IGDB 7
    'ra:107': [8],    // PlayStation 2 → IGDB 8
    'ra:46': [38],    // PSP → IGDB 38
  }
}

export function savePlatformMapping(obj) {
  try {
    fs.writeFileSync(MAP_FILE, JSON.stringify(obj, null, 2))
    return true
  } catch { return false }
}

export function getRAAuth() {
  const apiKey = (process.env.RA_API_KEY || process.env.VITE_RA_API_KEY || '').trim()
  const username = (process.env.RA_USERNAME || process.env.VITE_RA_USERNAME || '').trim()
  return { apiKey, username }
}
