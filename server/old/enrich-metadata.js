#!/usr/bin/env node
import { config } from 'dotenv'
config({ path: './server/.env' })
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const PROXY = process.env.IGDB_PROXY || process.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

// IGDB platform ids
const IGDB_PS_PLATFORMS = {
  'PlayStation': 7,
  'PlayStation 2': 8,
  'PlayStation Portable': 38
}

function getPlatformId(consoleName) {
  return IGDB_PS_PLATFORMS[consoleName] || null
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }

async function igdbSearch({ title, platformId, delayMs }) {
  const maxAttempts = 6
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await axios.post(`${PROXY}/igdb/search`, { q: title, platformId })
      return Array.isArray(data) ? data : []
    } catch (e) {
      const status = e.response?.status
      if (status === 429 || (status >= 500 && status <= 599)) {
        const backoff = Math.min(8000, (delayMs || 650) * Math.pow(2, attempt - 1))
        const jitter = Math.floor(Math.random() * 200)
        const wait = backoff + jitter
        console.log(`⏳ IGDB backoff ${wait}ms on attempt ${attempt} (${status || 'error'})`)
        await sleep(wait)
        continue
      }
      throw e
    }
  }
  return []
}

async function enrichGame(game, { delayMs }) {
  if (game.release_year && game.publisher) return { updated: false, game }
  try {
    const platformId = getPlatformId(game.console)
    const results = await igdbSearch({ title: game.title, platformId, delayMs })
    if (!results.length) return { updated: false, game }
    const best = results[0]
    const release_year = best.first_release_date ? new Date(best.first_release_date * 1000).getUTCFullYear().toString() : null
    const publisher = best.publisher_name || null
    let updated = false
    if (!game.release_year && release_year) { game.release_year = release_year; updated = true }
    if (!game.publisher && publisher) { game.publisher = publisher; updated = true }
    return { updated, game }
  } catch (e) {
    console.error(`❌ IGDB lookup failed for "${game.title}":`, e.response?.data || e.message)
    return { updated: false, game }
  }
}

async function main() {
  const input = process.argv[2]
  const output = process.argv[3] || null
  const conc = Number(process.argv[4] || '1')
  const delayMs = Number(process.argv[5] || process.env.IGDB_DELAY_MS || '650')
  if (!input) {
    console.error('Usage: node server/enrich-metadata.js <input.json> [output.json] [concurrency=4]')
    process.exit(1)
  }

  const inPath = path.resolve(input)
  const outPath = output ? path.resolve(output) : inPath
  console.log(`📖 Reading games from: ${inPath}`)
  const games = JSON.parse(fs.readFileSync(inPath,'utf-8'))
  console.log(`🎮 Loaded ${games.length} games`)

  const targets = games
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => !g.release_year || !g.publisher)

  console.log(`🛠️  ${targets.length} games missing year and/or publisher`)
  if (!targets.length) {
    console.log('✅ Nothing to do')
    return
  }

  let done = 0, updated = 0
  const q = targets.slice()
  const start = Date.now()

  async function worker(idx) {
    while (q.length) {
      const item = q.shift()
      const res = await enrichGame(item.g, { delayMs })
      done++
      if (res.updated) updated++
      if (done % 10 === 0) {
        const elapsed = (Date.now() - start) / 1000
        console.log(`📈 Progress: ${done}/${targets.length} (${((done/targets.length)*100).toFixed(1)}%) • updated: ${updated} • ${(done/elapsed).toFixed(2)}/s`)
      }
      // Gentle pacing
      await sleep(delayMs)
    }
  }

  console.log(`🚀 Enriching with ${Math.min(conc, q.length || 1)} workers (delay ~${delayMs}ms) using proxy ${PROXY}`)
  await Promise.all(Array.from({ length: Math.min(conc, q.length || 1) }).map((_, i) => worker(i)))

  console.log(`\n💾 Writing results to: ${outPath}`)
  fs.writeFileSync(outPath, JSON.stringify(games, null, 2))
  console.log(`✅ Done. Updated ${updated}/${targets.length} games.`)
}

main().catch(e => { console.error(e); process.exit(1) })

