import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { listConsoles, listGamesForConsole } from './adapters/ra.js'
import { loadPlatformMapping, getRAAuth, LIMITS, FLAGS } from './config.js'
import * as IGDB from './adapters/igdb.js'
import { cacheCoverFromUrl } from './util/covers.js'
import { RateLimiter } from './util/rateLimiter.js'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const INDEX_FILE = path.join(DATA_DIR, 'library.index.json')
const CHECKPOINT_FILE = path.join(DATA_DIR, 'library.checkpoint.json')

const jobs = new Map()

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8')) } catch { return { games: [], meta: { consoles: [], updatedAt: 0 } } }
}
function saveIndex(idx) { fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2)) }

export function getIndex() { return loadIndex() }

export function startBuild({ apiKey, consoles = FLAGS.CONSOLES_ALLOWLIST }) {
  const jobId = `job_${Date.now()}`
  const state = { id: jobId, state: 'running', progress: { done: 0, total: 0, lastConsole: null }, stats: { games: 0, coversFetched: 0, errors: 0 } }
  jobs.set(jobId, state)

  ;(async () => {
    try {
      let targetConsoles = consoles
      if (!Array.isArray(targetConsoles) || !targetConsoles.length) {
        // Only include actual game systems from RA, not meta/event hubs
        const lc = await listConsoles({ apiKey, activeOnly: true, gameSystemsOnly: true })
        targetConsoles = lc.map(c => c.id)
      }

      const idx = { games: [], meta: { consoles: targetConsoles, updatedAt: Date.now() } }

      for (const cid of targetConsoles) {
        state.progress.lastConsole = cid
        const games = await listGamesForConsole({ apiKey, consoleId: cid, onlyWithAchievements: true, excludeNonGames: true })
        idx.games.push(...games)
        state.progress.done += 1
        state.stats.games = idx.games.length
        saveIndex(idx)
        fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastConsole: cid, ts: Date.now() }, null, 2))
      }

      state.state = 'completed'
    } catch (e) {
      state.state = 'failed'
      state.error = e?.message || String(e)
    } finally {
      state.progress.total = state.progress.done
      state.completedAt = Date.now()
    }
  })()

  return jobId
}

export function getJob(jobId) { return jobs.get(jobId) || null }

// Cover prefetch job: resolve IGDB cover per game and cache locally
export function startCoverPrefetch({ limitConcurrency = 3, saveEvery = 50 }) {
  const jobId = `covers_${Date.now()}`
  const state = { id: jobId, state: 'running', progress: { done: 0, total: 0, lastTitle: null }, stats: { resolved: 0, skipped: 0, failed: 0 } }
  jobs.set(jobId, state)

  ;(async () => {
    const verbose = FLAGS.COVERS_VERBOSE
    const logEvery = Math.max(1, Number(FLAGS.COVERS_LOG_EVERY || 100))
    const t0 = Date.now()
    console.log(`[Covers] Prefetch starting (concurrency=${limitConcurrency}) with IGDB primary and RA fallback...`)
    const mapping = loadPlatformMapping()
    const idx = loadIndex()
    const games = idx.games || []
    const queue = games.filter(g => !g.flags?.hasCover)
    state.progress.total = queue.length
    console.log(`[Covers] Queue size: ${state.progress.total}`)

    const { apiKey, username } = getRAAuth()
    const raBase = 'https://retroachievements.org/API'
    const raLimiter = new RateLimiter({ rps: LIMITS.RA_RPS, maxConcurrent: LIMITS.RA_MAX_CONCURRENCY, name: 'ra' })
    const raCache = new Map() // gameId -> data

    function normalizeTitle(title) {
      let s = String(title || '')
      // strip RA decorators like ~Hack~, ~Homebrew~, ~Prototype~, [Subset - ...]
      s = s.replace(/~[^~]+~/g, ' ').replace(/\[Subset[^\]]+\]/gi, ' ')
      // keep left side of pipes (alt titles)
      s = s.split('|')[0]
      return s.replace(/\s+/g, ' ').trim()
    }

    function raImageUrl(pathStr) {
      if (!pathStr) return null
      const s = String(pathStr)
      if (s.startsWith('http')) return s
      const p = s.startsWith('Images') ? s : `Images/${s}`
      return `https://media.retroachievements.org/${p}`
    }

    async function work(g) {
      try {
        state.progress.lastTitle = g.title
        const platforms = mapping[g.console?.id] || []
        const displayTitle = g.title
        const searchTitle = normalizeTitle(displayTitle)
        if (verbose) console.log(`[Covers] Resolving: '${displayTitle}' → '${searchTitle}' (${g.console?.name || g.console?.id || 'unknown'})`)
        const results = await IGDB.searchGames({ q: searchTitle, platformIds: platforms })
        const first = results.find(r => r.image_id) || null
        if (first) {
          const url = IGDB.coverUrlFromImageId(first.image_id)
          if (verbose) console.log(`[Covers] IGDB hit -> downloading ${url}`)
          const localPath = await cacheCoverFromUrl(url)
          g.flags = { ...(g.flags||{}), hasCover: true }
          g.cover = { localPath, originalUrl: url }
          if (!g.releaseYear && first.first_release_date) g.releaseYear = new Date(first.first_release_date * 1000).getUTCFullYear().toString()
          if (!g.publisher && first.publisher_name) g.publisher = first.publisher_name
          state.stats.resolved++
          if (verbose) console.log(`[Covers] Saved -> ${localPath}`)
        } else {
          // Fallback to RetroAchievements imagery
          try {
            const raId = g?.sources?.ra?.gameId
            if (apiKey && username && raId) {
              const params = new URLSearchParams()
              params.set('y', apiKey)
              params.set('u', username)
              params.set('g', String(raId))
              const url = `${raBase}/API_GetGameInfoAndUserProgress.php?${params.toString()}`
              async function raGet() {
                // cache per gameId to avoid repeat
                if (raCache.has(raId)) return raCache.get(raId)
                // limited + retry on 429
                let attempt = 0
                let delay = 800
                while (true) {
                  try {
                    const resp = await raLimiter.schedule(() => axios.get(url, { timeout: 15000 }))
                    raCache.set(raId, resp.data)
                    return resp.data
                  } catch (e) {
                    const status = e?.response?.status
                    if (status === 429 && attempt < LIMITS.RA_MAX_RETRIES) {
                      const raHdr = Number(e?.response?.headers?.['retry-after'])
                      const wait = raHdr ? (Number(raHdr) * 1000) : delay
                      if (verbose) console.log(`[Covers] RA 429 → backing off ${wait}ms`)
                      await new Promise(r => setTimeout(r, wait))
                      attempt++
                      delay = Math.min(delay * 2, 8000)
                      continue
                    }
                    throw e
                  }
                }
              }
              const data = await raGet()
              const raCover = raImageUrl(data.ImageBoxArt) || raImageUrl(data.ImageTitle) || raImageUrl(data.ImageIcon) || raImageUrl(data.ImageInGame)
              if (raCover) {
                if (verbose) console.log(`[Covers] RA fallback -> downloading ${raCover}`)
                const localPath = await cacheCoverFromUrl(raCover)
                g.flags = { ...(g.flags||{}), hasCover: true }
                g.cover = { localPath, originalUrl: raCover }
                if (!g.releaseYear && data.Released) g.releaseYear = String(data.Released)
                if (!g.publisher && data.Publisher) g.publisher = String(data.Publisher)
                state.stats.resolved++
                if (verbose) console.log(`[Covers] Saved (RA) -> ${localPath}`)
              } else {
                state.stats.skipped++
                if (verbose) console.log(`[Covers] Skip: no IGDB/RA art for '${g.title}'`)
              }
            } else {
              state.stats.skipped++
              if (verbose) console.log(`[Covers] Skip: missing RA creds or game id for '${g.title}'`)
            }
          } catch (e) {
            state.stats.failed++
            if (verbose) console.log(`[Covers] Fail (RA fallback): ${e?.message || e}`)
          }
        }
      } catch (e) { state.stats.failed++; if (verbose) console.log(`[Covers] Fail: ${e?.message || e}`) }
      finally {
        state.progress.done++
        if (state.progress.done % logEvery === 0) {
          const dt = (Date.now() - t0) / 1000
          const rate = dt > 0 ? (state.progress.done / dt).toFixed(1) : '0.0'
          console.log(`[Covers] Progress ${state.progress.done}/${state.progress.total} (resolved=${state.stats.resolved} skipped=${state.stats.skipped} failed=${state.stats.failed}) ~${rate}/s`)
        }
      }
    }

    const workers = Array.from({ length: Math.max(1, Math.min(limitConcurrency, 8)) }).map(async () => {
      while (queue.length) {
        const g = queue.shift()
        await work(g)
        if (state.progress.done % saveEvery === 0) saveIndex(idx)
      }
    })
    await Promise.all(workers)
    saveIndex(idx)
    state.state = 'completed'
    state.completedAt = Date.now()
    const dt = ((Date.now() - t0)/1000).toFixed(1)
    console.log(`[Covers] Prefetch completed in ${dt}s: resolved=${state.stats.resolved} skipped=${state.stats.skipped} failed=${state.stats.failed}`)
  })()

  return jobId
}
