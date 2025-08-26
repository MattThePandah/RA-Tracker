#!/usr/bin/env node
import fs from 'fs'

function usage(){
  console.log('Usage: node server/merge-games.js <base.json> <add.json> <output.json> [--by=auto|id|title]')
}

function keyOf(g, mode='auto'){
  if (mode === 'id') return String(g.id || '')
  if (mode === 'title') return `${g.title || ''}|${g.console || ''}`
  return g.id ? String(g.id) : `${g.title || ''}|${g.console || ''}`
}

async function main(){
  const args = process.argv.slice(2)
  if (args.length < 3) { usage(); process.exit(1) }
  const basePath = args[0]
  const addPath = args[1]
  const outPath = args[2]
  let by = 'auto'
  for (let i=3;i<args.length;i++){
    if (args[i].startsWith('--by=')) by = args[i].split('=')[1]
    else if (args[i] === '--by' && args[i+1]) { by = args[++i] }
  }
  const base = JSON.parse(fs.readFileSync(basePath,'utf-8'))
  const add = JSON.parse(fs.readFileSync(addPath,'utf-8'))
  if (!Array.isArray(base) || !Array.isArray(add)) {
    console.error('Inputs must be arrays of games')
    process.exit(1)
  }
  const map = new Map(base.map(g => [keyOf(g, by), g]))
  for (const g of add){
    const k = keyOf(g, by)
    if (!map.has(k)) map.set(k, g)
  }
  const merged = Array.from(map.values())
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2))
  console.log(`Merged: base ${base.length} + add ${add.length} -> out ${merged.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })

