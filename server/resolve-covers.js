#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const PROXY = process.env.IGDB_PROXY || process.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }

async function searchCover(title, platformId=null) {
  try {
    console.log(`🔍 Searching for: "${title}"${platformId ? ` (platform: ${platformId})` : ''}`)
    const { data } = await axios.post(`${PROXY}/igdb/search`, { q: title, platformId })
    console.log(`📊 Found ${Array.isArray(data) ? data.length : 0} results`)
    const best = Array.isArray(data) ? data.find(x => x.image_id) || data[0] : null
    if (!best?.image_id) {
      console.log(`❌ No cover found for "${title}"`)
      return null
    }
    const url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${best.image_id}.jpg`
    console.log(`✅ Found cover: ${best.name} -> ${url}`)
    return url
  } catch (e) {
    console.error(`💥 Error searching for "${title}":`, e.response?.data || e.message)
    return null
  }
}

async function main() {
  const input = process.argv[2]
  const output = process.argv[3] || 'games.with-covers.json'
  if (!input) {
    console.error('Usage: node server/resolve-covers.js <games.json> [output.json]')
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
    
    const url = await searchCover(g.title, null)
    if (url) { 
      g.image_url = url
      resolved++
      console.log(`💾 Updated game with cover URL`)
    }
    
    // Rate limiting
    if (i % 25 === 0 && i > 0) {
      console.log(`⏸️  Rate limiting pause (250ms)...`)
      await sleep(250)
    }
    
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

