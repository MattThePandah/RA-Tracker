#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import crypto from 'crypto'

const COVERS_DIR = process.env.COVERS_DIR || path.join(process.cwd(), 'covers')
fs.mkdirSync(COVERS_DIR, { recursive: true })
function hash(str) { return crypto.createHash('sha1').update(String(str)).digest('hex') }
function coverPathFor(url) { 
  const ext = url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'
  return path.join(COVERS_DIR, `${hash(url)}${ext}`) 
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: node server/prefetch-covers.js <games.json> [concurrency=8]')
    process.exit(1)
  }
  
  const conc = Number(process.argv[3] || '8')
  console.log(`📖 Reading games from: ${input}`)
  
  const raw = fs.readFileSync(input, 'utf-8')
  let games
  try { 
    games = JSON.parse(raw) 
  } catch { 
    console.error('❌ Invalid JSON'); 
    process.exit(1) 
  }
  
  console.log(`🎮 Loaded ${games.length} games`)
  const urls = games.map(g => g.image_url).filter(Boolean)
  console.log(`🖼️  Found ${urls.length} games with cover URLs`)
  console.log(`📁 Cache directory: ${COVERS_DIR}`)
  console.log(`🔄 Concurrency: ${conc} workers`)
  
  if (urls.length === 0) {
    console.log('⚠️  No cover URLs found - nothing to prefetch!')
    return
  }
  
  let ok=0, skipped=0, failed=0
  const startTime = Date.now()
  
  async function fetchOne(url) {
    const file = coverPathFor(url)
    const fileName = path.basename(file)
    
    if (fs.existsSync(file)) { 
      console.log(`⏩ Already cached: ${fileName}`)
      skipped++
      return 
    }
    
    try {
      console.log(`⬇️  Downloading: ${fileName} from ${url}`)
      const r = await axios.get(url, { responseType: 'arraybuffer' })
      fs.writeFileSync(file, Buffer.from(r.data, 'binary'))
      console.log(`✅ Saved: ${fileName} (${Buffer.byteLength(r.data)} bytes)`)
      ok++
    } catch (e) { 
      console.error(`❌ Failed to download ${fileName}:`, e.message)
      failed++
    }
    
    // Progress update every 10 items
    if ((ok + skipped + failed) % 10 === 0) {
      const total = ok + skipped + failed
      const elapsed = (Date.now() - startTime) / 1000
      const rate = total / elapsed
      const remaining = urls.length - total
      const eta = remaining / rate
      console.log(`📈 Progress: ${total}/${urls.length} (${(total/urls.length*100).toFixed(1)}%) - ${ok} ok, ${skipped} skipped, ${failed} failed - ETA: ${eta.toFixed(0)}s`)
    }
  }
  
  const q = urls.slice()
  console.log(`\n🚀 Starting download with ${Math.min(conc, q.length || 1)} workers...`)
  
  const workers = Array.from({ length: Math.min(conc, q.length || 1) }).map(async (_, i) => {
    console.log(`👷 Worker ${i+1} started`)
    while (q.length) {
      await fetchOne(q.shift())
    }
    console.log(`👷 Worker ${i+1} finished`)
  })
  
  await Promise.all(workers)
  
  const elapsed = (Date.now() - startTime) / 1000
  console.log(`\n🎉 Complete! ${ok} downloaded, ${skipped} already cached, ${failed} failed`)
  console.log(`⏱️  Total time: ${elapsed.toFixed(1)}s (${(urls.length/elapsed).toFixed(1)} files/sec)`)
  console.log(`📁 Files saved to: ${COVERS_DIR}`)
}

main().catch(e => { console.error(e); process.exit(1) })

