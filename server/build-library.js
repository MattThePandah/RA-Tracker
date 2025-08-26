#!/usr/bin/env node
import { config } from 'dotenv'
config({ path: './server/.env' })
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import crypto from 'crypto'

// Config and helpers
const PROXY = process.env.IGDB_PROXY || process.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
const RA_BASE = 'https://retroachievements.org/API'
const COVERS_DIR = process.env.COVERS_DIR || path.join(process.cwd(), 'covers')
fs.mkdirSync(COVERS_DIR, { recursive: true })

function hash(str) { return crypto.createHash('sha1').update(String(str)).digest('hex') }
function coverPathFor(url) {
  const ext = url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'
  return path.join(COVERS_DIR, `${hash(url)}${ext}`)
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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
function extractRAGameId(gameId) {
  if (!gameId || typeof gameId !== 'string') return null
  const parts = gameId.split('-')
  if (parts.length >= 3 && parts[0] === 'ra') return parseInt(parts[2])
  return null
}
async function raCoverForGameId(raGameId) {
  try {
    const apiKey = process.env.RA_API_KEY || process.env.VITE_RA_API_KEY
    if (!apiKey) return null
    const params = new URLSearchParams()
    params.set('y', apiKey)
    params.set('i', String(raGameId))
    const url = `${RA_BASE}/API_GetGame.php?${params.toString()}`
    const { data } = await axios.get(url)
    if (data?.ImageBoxArt) return `https://retroachievements.org${data.ImageBoxArt}`
    return null
  } catch { return null }
}

// Resolve cover + metadata in one IGDB call when possible
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
    if (needCover && best.image_id) {
      game.image_url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${best.image_id}.jpg`
      changed = true
    }
    if (needYear && best.first_release_date) {
      const y = new Date(best.first_release_date * 1000).getUTCFullYear().toString()
      game.release_year = y
      changed = true
    }
    if (needPublisher && best.publisher_name) {
      game.publisher = best.publisher_name
      changed = true
    }
  }

  // RA fallback for cover only
  if (!game.image_url) {
    const raId = extractRAGameId(game.id)
    if (raId) {
      const raUrl = await raCoverForGameId(raId)
      if (raUrl) { game.image_url = raUrl; changed = true }
    }
  }

  // pace between items
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
  const workers = Array.from({ length: Math.min(concurrency, q.length || 1) }).map(async () => {
    while (q.length) { await fetchOne(q.shift()) }
  })
  await Promise.all(workers)
  return { ok, skipped, failed }
}

function parseArgs(argv){
  const a = { input: argv[2], output: argv[3], igdbConcurrency: Number(argv[4]||'1'), igdbDelayMs: Number(argv[5]||process.env.IGDB_DELAY_MS||'750'), prefetchConcurrency: Number(argv[6]||'8') }
  return a
}

async function main(){
  const args = parseArgs(process.argv)
  if (!args.input) {
    console.error('Usage: node server/build-library.js <input.json> [output.json] [igdbConcurrency=1] [igdbDelayMs=750] [prefetchConcurrency=8]')
    process.exit(1)
  }
  const inputPath = path.resolve(args.input)
  const outputPath = path.resolve(args.output || args.input)
  const games = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
  if (!Array.isArray(games)) throw new Error('Input must be an array of games')

  console.log(`📖 Loaded ${games.length} games from ${inputPath}`)
  const q = games.map((g,i)=>({ g, i }))
  let done=0, changed=0
  const workers = Array.from({ length: Math.min(args.igdbConcurrency || 1, q.length || 1) }).map(async (w) => {
    while (q.length) {
      const item = q.shift()
      const res = await resolveOne({ game: item.g, delayMs: args.igdbDelayMs })
      done++
      if (res.changed) changed++
      if (done % 20 === 0) console.log(`📈 Progress: ${done}/${games.length} (changed ${changed})`)
    }
  })
  await Promise.all(workers)

  fs.writeFileSync(outputPath, JSON.stringify(games, null, 2))
  console.log(`💾 Wrote updated games to ${outputPath} (changed ${changed})`)

  // Prefetch covers
  const urls = games.map(g => g.image_url).filter(Boolean)
  console.log(`🖼️ Prefetching ${urls.length} cover URLs to ${COVERS_DIR} with concurrency ${args.prefetchConcurrency}`)
  const pre = await prefetchCovers(urls, args.prefetchConcurrency)
  console.log(`✅ Prefetch complete: ${pre.ok} new, ${pre.skipped} cached, ${pre.failed} failed`)
}

main().catch(e => { console.error(e); process.exit(1) })

