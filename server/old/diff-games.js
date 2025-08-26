#!/usr/bin/env node
import fs from 'fs'

function usage() {
  console.log('Usage: node server/diff-games.js <old.json> <new.json> [--by=auto|id|title] [--output out.json]')
}

function keyOf(g, mode='auto') {
  if (mode === 'id') return String(g.id || '')
  if (mode === 'title') return `${g.title || ''}|${g.console || ''}`
  // auto
  return g.id ? String(g.id) : `${g.title || ''}|${g.console || ''}`
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) { usage(); process.exit(1) }
  const oldPath = args[0]
  const newPath = args[1]
  let by = 'auto'
  let outPath = null
  for (let i=2;i<args.length;i++) {
    const a = args[i]
    if (a.startsWith('--by=')) by = a.split('=')[1]
    else if (a === '--by' && args[i+1]) { by = args[++i] }
    else if (a.startsWith('--output=')) outPath = a.split('=')[1]
    else if (a === '--output' && args[i+1]) { outPath = args[++i] }
  }

  const oldArr = JSON.parse(fs.readFileSync(oldPath, 'utf-8'))
  const newArr = JSON.parse(fs.readFileSync(newPath, 'utf-8'))
  if (!Array.isArray(oldArr) || !Array.isArray(newArr)) {
    console.error('Both inputs must be arrays of games')
    process.exit(1)
  }

  const oldKeys = new Set(oldArr.map(g => keyOf(g, by)))
  const added = newArr.filter(g => !oldKeys.has(keyOf(g, by)))
  const json = JSON.stringify(added, null, 2)
  if (outPath) {
    fs.writeFileSync(outPath, json)
    console.log(`Wrote ${added.length} new games to ${outPath}`)
  } else {
    process.stdout.write(json)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

