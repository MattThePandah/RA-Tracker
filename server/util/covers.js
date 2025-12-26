import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import { isPgEnabled } from '../db.js'
import { getCoverMetaByUrl, upsertCoverMeta } from '../coverData.js'

const COVERS_DIR = process.env.COVERS_DIR || path.join(process.cwd(), 'covers')
fs.mkdirSync(COVERS_DIR, { recursive: true })

export function hash(str) { return crypto.createHash('sha1').update(String(str)).digest('hex') }

function normalizeCoverUrl(src) {
  if (!src) return null
  const s = String(src).trim()
  if (!s) return null
  if (s.startsWith('/covers/') || s.startsWith('covers/') || s.startsWith('custom-covers/')) {
    return s
  }
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const url = new URL(s)
      if (!url.hostname.includes('retroachievements.org')) return s
      const segments = url.pathname.split('/').filter(Boolean)
      const normalized = []
      for (const seg of segments) {
        if (normalized.length && seg.toLowerCase() === 'images' && normalized[normalized.length - 1].toLowerCase() === 'images') {
          continue
        }
        normalized.push(seg)
      }
      if (normalized.length && normalized[0].toLowerCase() !== 'images') {
        normalized.unshift('Images')
      }
      url.pathname = `/${normalized.join('/')}`
      return url.toString()
    } catch {
      return s
    }
  }
  const cleaned = s.replace(/^\/+/, '')
  if (cleaned.toLowerCase().startsWith('images/')) {
    return `https://media.retroachievements.org/${cleaned}`
  }
  return s
}

export function coverPathFor(url) {
  const normalized = normalizeCoverUrl(url) || url
  const ext = normalized.includes('.jpg') ? '.jpg' : normalized.includes('.png') ? '.png' : '.jpg'
  return path.join(COVERS_DIR, `${hash(normalized)}${ext}`)
}

export function coverPublicPathFor(url) {
  const file = coverPathFor(url)
  return `/covers/${path.basename(file)}`
}

function extFromUrl(url) {
  return url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'
}

export async function cacheCoverFromUrl(src, meta = {}) {
  if (!src) return null
  const normalized = normalizeCoverUrl(src)
  if (!normalized) return null
  if (isPgEnabled()) {
    const cached = await getCoverMetaByUrl(normalized)
    if (cached?.local_path) {
      const file = coverPathFor(normalized)
      if (fs.existsSync(file)) return cached.local_path
    }
  }
  const file = coverPathFor(normalized)
  const ext = extFromUrl(normalized)
  const sha = hash(normalized)
  if (!fs.existsSync(file)) {
    const response = await axios.get(normalized, { responseType: 'arraybuffer' })
    fs.writeFileSync(file, Buffer.from(response.data, 'binary'))
  }
  const localPath = coverPublicPathFor(normalized)

  if (isPgEnabled()) {
    const cached = await getCoverMetaByUrl(normalized)
    if (!cached || cached.local_path !== localPath || cached.sha1 !== sha) {
      await upsertCoverMeta({
        sourceUrl: normalized,
        sha1: sha,
        ext,
        localPath,
        origin: meta.origin || null,
        gameId: meta.gameId || null,
        consoleId: meta.consoleId || null
      })
    }
  }

  return localPath
}

export { COVERS_DIR }

