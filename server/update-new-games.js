#!/usr/bin/env node
import { config } from 'dotenv'
config({ path: './server/.env' })
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import crypto from 'crypto'

// Env + paths
const PROXY = process.env.IGDB_PROXY || process.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
const RA_BASE = 'https://retroachievements.org/API'
const COVERS_DIR = process.env.COVERS_DIR || path.join(process.cwd(), 'covers')
try { fs.mkdirSync(COVERS_DIR, { recursive: true }) } catch {}

function hash(str) { return crypto.createHash('sha1').update(String(str)).digest('hex') }
function coverPathFor(url) { const ext = url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'; return path.join(COVERS_DIR, `${hash(url)}${ext}`) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Keys and diff helpers
function keyOf(g, mode='auto') { return g.id ? String(g.id) : `${g.title || ''}|${g.console || ''}` }

// IGDB platform ids (PS family)
const IGDB_PS_PLATFORMS = { 'PlayStation': 7, 'PlayStation 2': 8, 'PlayStation Portable': 38 }
function platformIdFor(consoleName){ return IGDB_PS_PLATFORMS[consoleName] || null }

// Robust IGDB search with backoff
async function igdbSearch({ title, platformId, delayMs }) {
  const maxAttempts = 6
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await axios.post(`${PROXY}/igdb/search`, { q: title, platformId })
      return Array.isArray(data) ? data : []
    } catch (e) {
      const status = e.response?.status
      if (status === 429 || (status >= 500 && status <= 599)) {
        const backoff = Math.min(8000, (delayMs || 750) * Math.pow(2, attempt - 1))
        const jitter = Math.floor(Math.random() * 200)
        const wait = backoff + jitter
        console.log(`⏳ IGDB backoff ${wait}ms on attempt ${attempt} (${status || 'error'}) for "${title}"`)
        await sleep(wait)
        continue
      }
      throw e
    }
  }
  return []
}

// RA cover fallback
function extractRAGameId(gameId) { if (!gameId || typeof gameId !== 'string') return null; const parts = gameId.split('-'); return (parts.length >= 3 && parts[0] === 'ra') ? parseInt(parts[2]) : null }
async function raCoverForGameId(raGameId) {
  try {
    const apiKey = process.env.RA_API_KEY || process.env.VITE_RA_API_KEY
    if (!apiKey) return null
    const params = new URLSearchParams(); params.set('y', apiKey); params.set('i', String(raGameId))
    const url = `${RA_BASE}/API_GetGame.php?${params.toString()}`
    const { data } = await axios.get(url)
    if (data?.ImageBoxArt) return `https://retroachievements.org${data.ImageBoxArt}`
    return null
  } catch { return null }
}

async function resolveOne({ game, delayMs }) {
  let changed = false
  const needCover = !game.image_url
  const needYear = !game.release_year
  const needPublisher = !game.publisher
  if (!needCover && !needYear && !needPublisher) return { game, changed }

  const platformId = platformIdFor(game.console)
  const results = await igdbSearch({ title: game.title, platformId, delayMs })
  const best = results.find(x => x.image_id) || results[0]
  if (best) {
    if (needCover && best.image_id) { game.image_url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${best.image_id}.jpg`; changed = true }
    if (needYear && best.first_release_date) { game.release_year = new Date(best.first_release_date * 1000).getUTCFullYear().toString(); changed = true }
    if (needPublisher && best.publisher_name) { game.publisher = best.publisher_name; changed = true }
  }
  if (!game.image_url) { const raId = extractRAGameId(game.id); if (raId) { const raUrl = await raCoverForGameId(raId); if (raUrl) { game.image_url = raUrl; changed = true } } }
  await sleep(delayMs)
  return { game, changed }
}

async function prefetchCovers(urls, concurrency=8) {
  let ok=0, skipped=0, failed=0
  const q = urls.slice()
  async function fetchOne(url){
    const file = coverPathFor(url)
    if (fs.existsSync(file)) { skipped++; return }
    try {
      const r = await axios.get(url, { responseType: 'arraybuffer' })
      fs.writeFileSync(file, Buffer.from(r.data, 'binary'))
      ok++
    } catch { failed++ }
  }
  const workers = Array.from({ length: Math.min(concurrency, q.length || 1) }).map(async () => { while (q.length) { await fetchOne(q.shift()) } })
  await Promise.all(workers)
  return { ok, skipped, failed }
}

function parseArgs(argv){
  const a = { old: argv[2], newer: argv[3], target: argv[4], igdbConcurrency: Number(argv[5]||'1'), igdbDelayMs: Number(argv[6]||process.env.IGDB_DELAY_MS||'750'), prefetchConcurrency: Number(argv[7]||'8') }
  return a
}

async function main(){
  const args = parseArgs(process.argv)
  if (!args.old || !args.newer) {
    console.error('Usage: node server/update-new-games.js <old-games.json> <new-games.json> [target-with-covers.json] [igdbConcurrency=1] [igdbDelayMs=750] [prefetchConcurrency=8]')
    process.exit(1)
  }
  const oldArr = JSON.parse(fs.readFileSync(path.resolve(args.old), 'utf-8'))
  const newArr = JSON.parse(fs.readFileSync(path.resolve(args.newer), 'utf-8'))
  if (!Array.isArray(oldArr) || !Array.isArray(newArr)) throw new Error('Inputs must be arrays')

  const oldKeys = new Set(oldArr.map(g => keyOf(g)))
  const added = newArr.filter(g => !oldKeys.has(keyOf(g)))
  console.log(`🆕 New games detected: ${added.length}`)
  if (!added.length) {
    console.log('Nothing to do. Exiting.')
    return
  }

  // Resolve/enrich new ones
  const queue = added.map(g => ({ g }))
  let done=0, changed=0
  const workers = Array.from({ length: Math.min(args.igdbConcurrency || 1, queue.length || 1) }).map(async () => {
    while (queue.length) {
      const item = queue.shift()
      const res = await resolveOne({ game: item.g, delayMs: args.igdbDelayMs })
      done++
      if (res.changed) changed++
      if (done % 10 === 0) console.log(`📈 Progress: ${done}/${added.length} (changed ${changed})`)
    }
  })
  await Promise.all(workers)

  // Prefetch covers for new ones only
  const urls = added.map(g => g.image_url).filter(Boolean)
  if (urls.length) {
    console.log(`🖼️ Prefetching ${urls.length} cover URLs to ${COVERS_DIR} (concurrency ${args.prefetchConcurrency})`)
    const pre = await prefetchCovers(urls, args.prefetchConcurrency)
    console.log(`✅ Prefetch complete: ${pre.ok} new, ${pre.skipped} cached, ${pre.failed} failed`)
  }

  // Merge into target (default to games.with-covers.json)
  const targetPath = path.resolve(args.target || 'games.with-covers.json')
  let base = []
  try {
    if (fs.existsSync(targetPath)) base = JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
  } catch {}
  const map = new Map(base.map(g => [keyOf(g), g]))
  for (const g of added) {
    const k = keyOf(g)
    if (!map.has(k)) map.set(k, g)
  }
  const merged = Array.from(map.values())
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2))
  console.log(`💾 Updated ${targetPath} -> ${merged.length} total (added ${added.length})`)
}

main().catch(e => { console.error(e); process.exit(1) })

