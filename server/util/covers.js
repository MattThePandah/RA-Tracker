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

export function coverPathFor(url, gameId = null) {
  const normalized = normalizeCoverUrl(url) || url
  const ext = normalized.includes('.jpg') ? '.jpg' : normalized.includes('.png') ? '.png' : '.jpg'
  if (gameId) {
    const safeId = String(gameId).replace(/[^a-zA-Z0-9_\-]/g, '_')
    return path.join(COVERS_DIR, `${safeId}${ext}`)
  }
  return path.join(COVERS_DIR, `${hash(normalized)}${ext}`)
}

export function coverPublicPathFor(url, gameId = null) {
  const file = coverPathFor(url, gameId)
  return `/covers/${path.basename(file)}`
}

function extFromUrl(url) {
  return url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'
}

export function deleteCoverForGame(gameId) {
  if (!gameId) return
  const safeId = String(gameId).replace(/[^a-zA-Z0-9_\-]/g, '_')
  const base = path.join(COVERS_DIR, `${safeId}`)
  const extensions = ['.jpg', '.png', '.jpeg', '.webp']
  for (const ext of extensions) {
    const p = `${base}${ext}`
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p) } catch (e) {
        console.warn(`[Covers] Failed to delete ${p}:`, e.message)
      }
    }
  }
}

export async function cacheCoverFromUrl(src, meta = {}) {
  if (!src) return null
  const normalized = normalizeCoverUrl(src)
  if (!normalized) return null

  const expectedLocalPath = coverPublicPathFor(normalized, meta.gameId)

  if (isPgEnabled()) {
    const cached = await getCoverMetaByUrl(normalized)
    // Only return cached path if it matches what we expect (handling rename from hash -> gameId)
    // OR if we didn't request a specific gameId (generic proxy)
    if (cached?.local_path) {
      if (!meta.gameId || cached.local_path === expectedLocalPath) {
        const file = coverPathFor(normalized, meta.gameId)
        if (fs.existsSync(file)) return cached.local_path
      }
    }
  }

  const file = coverPathFor(normalized, meta.gameId)
  const ext = extFromUrl(normalized)
  const sha = hash(normalized)

  if (!fs.existsSync(file)) {
    const response = await axios.get(normalized, { responseType: 'arraybuffer' })
    fs.writeFileSync(file, Buffer.from(response.data, 'binary'))
  }

  // Reuse the calculated path
  const localPath = expectedLocalPath

  if (isPgEnabled()) {
    const cached = await getCoverMetaByUrl(normalized)
    const dbSha = cached?.sha1
    const dbPath = cached?.local_path

    // Update DB if: not cached, path changed (hash->gameId), or content changed (sha)
    if (!cached || dbPath !== localPath || dbSha !== sha) {
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

