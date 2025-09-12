import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'

const COVERS_DIR = process.env.COVERS_DIR || path.join(process.cwd(), 'covers')
fs.mkdirSync(COVERS_DIR, { recursive: true })

export function hash(str) { return crypto.createHash('sha1').update(String(str)).digest('hex') }

export function coverPathFor(url) {
  const ext = url.includes('.jpg') ? '.jpg' : url.includes('.png') ? '.png' : '.jpg'
  return path.join(COVERS_DIR, `${hash(url)}${ext}`)
}

export function coverPublicPathFor(url) {
  const file = coverPathFor(url)
  return `/covers/${path.basename(file)}`
}

export async function cacheCoverFromUrl(src) {
  const file = coverPathFor(src)
  if (!fs.existsSync(file)) {
    const response = await axios.get(src, { responseType: 'arraybuffer' })
    fs.writeFileSync(file, Buffer.from(response.data, 'binary'))
  }
  return coverPublicPathFor(src)
}

export { COVERS_DIR }

