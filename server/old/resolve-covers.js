#!/usr/bin/env node
import { config } from 'dotenv'
config({ path: './server/.env' })
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const PROXY = process.env.IGDB_PROXY || process.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
const RA_BASE = 'https://retroachievements.org/API'

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

async function searchIGDBCover(title, platformId=null, delayMs=650) {
  try {
    console.log(`🔍 Searching IGDB for: "${title}"${platformId ? ` (platform: ${platformId})` : ''}`)
    const results = await igdbSearch({ title, platformId, delayMs })
    console.log(`📊 Found ${results.length} IGDB results`)
    const best = results.find(x => x.image_id) || results[0]
    if (!best?.image_id) {
      console.log(`❌ No IGDB cover found for "${title}"`)
      return null
    }
    const url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${best.image_id}.jpg`
    console.log(`✅ Found IGDB cover: ${best.name} -> ${url}`)
    return url
  } catch (e) {
    console.error(`💥 Error searching IGDB for "${title}":`, e.response?.data || e.message)
    return null
  }
}

async function searchRetroAchievementsCover(gameId) {
  try {
    console.log(`🎮 Searching RetroAchievements for game ID: ${gameId}`)
    const apiKey = process.env.RA_API_KEY || process.env.VITE_RA_API_KEY
    if (!apiKey) {
      console.log(`⚠️  No RetroAchievements API key found, skipping RA search`)
      return null
    }
    
    const params = new URLSearchParams()
    params.set('y', apiKey)
    params.set('i', String(gameId))
    
    const url = `${RA_BASE}/API_GetGame.php?${params.toString()}`
    const { data } = await axios.get(url)
    
    if (data?.ImageBoxArt) {
      const raUrl = `https://retroachievements.org${data.ImageBoxArt}`
      console.log(`✅ Found RetroAchievements cover: ${data.Title} -> ${raUrl}`)
      return raUrl
    }
    
    console.log(`❌ No RetroAchievements cover found for game ID: ${gameId}`)
    return null
  } catch (e) {
    console.error(`💥 Error searching RetroAchievements for game ID ${gameId}:`, e.response?.data || e.message)
    return null
  }
}

function extractRAGameId(gameId) {
  if (!gameId || typeof gameId !== 'string') return null
  const parts = gameId.split('-')
  if (parts.length >= 3 && parts[0] === 'ra') {
    return parseInt(parts[2])
  }
  return null
}

async function searchCover(game) {
  // First try IGDB
  const igdbUrl = await searchIGDBCover(game.title)
  if (igdbUrl) {
    return igdbUrl
  }
  
  // Fallback to RetroAchievements if the game has an RA ID
  const raGameId = extractRAGameId(game.id)
  if (raGameId) {
    const raUrl = await searchRetroAchievementsCover(raGameId)
    if (raUrl) {
      return raUrl
    }
  }
  
  console.log(`❌ No cover found for "${game.title}" from either IGDB or RetroAchievements`)
  return null
}

async function main() {
  const input = process.argv[2]
  const output = process.argv[3] || 'games.with-covers.json'
  const delayMs = Number(process.argv[4] || process.env.IGDB_DELAY_MS || '650')
  if (!input) {
    console.error('Usage: node server/resolve-covers.js <games.json> [output.json] [delayMs=650]')
    process.exit(1)
  }
  
  console.log(`📖 Reading games from: ${input}`)
  const games = JSON.parse(fs.readFileSync(input,'utf-8'))
  console.log(`🎮 Loaded ${games.length} games`)
  
  const withoutCovers = games.filter(g => !g.image_url)
  console.log(`🖼️  ${withoutCovers.length} games need covers, ${games.length - withoutCovers.length} already have covers`)
  
  let resolved = 0, skipped = 0
  const startTime = Date.now()
  
  for (let i=0;i<games.length;i++) {
    const g = games[i]
    console.log(`\n[${i+1}/${games.length}] Processing: "${g.title}"`)
    
    if (g.image_url) { 
      console.log(`⏩ Already has cover, skipping`)
      skipped++
      continue 
    }
    
    const url = await searchCover(g)
    if (url) { 
      g.image_url = url
      resolved++
      console.log(`💾 Updated game with cover URL`)
    }
    // Gentle per-request pacing
    await sleep(delayMs)
    
    // Progress update
    if (i % 50 === 0 && i > 0) {
      const elapsed = (Date.now() - startTime) / 1000
      const rate = i / elapsed
      const remaining = games.length - i
      const eta = remaining / rate
      console.log(`📈 Progress: ${i}/${games.length} (${(i/games.length*100).toFixed(1)}%) - ETA: ${eta.toFixed(0)}s`)
    }
  }
  
  console.log(`\n💾 Writing results to: ${output}`)
  fs.writeFileSync(output, JSON.stringify(games,null,2))
  
  const elapsed = (Date.now() - startTime) / 1000
  console.log(`\n🎉 Complete! Resolved ${resolved} covers, skipped ${skipped}`)
  console.log(`⏱️  Total time: ${elapsed.toFixed(1)}s (${(games.length/elapsed).toFixed(1)} games/sec)`)
  console.log(`📄 Wrote ${output}`)
}

main().catch(e => { console.error(e); process.exit(1) })
