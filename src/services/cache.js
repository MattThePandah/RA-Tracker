import { set, get, keys, del } from 'idb-keyval'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

const COVER_STORE = 'covers' // logical namespace via key prefix

function keyFor(path) {
  return `${COVER_STORE}:${path}`
}

export async function saveCover(path, blob) {
  await set(keyFor(path), blob)
  return path
}

export async function getCover(path) {
  return await get(keyFor(path))
}

export async function hasCover(path) {
  const all = await keys()
  return all.some(k => String(k) === keyFor(path))
}

export async function deleteCover(path) {
  await del(keyFor(path))
}

export async function exportAll() {
  const zip = new JSZip()
  const all = await keys()
  const entries = all.filter(k => String(k).startsWith(`${COVER_STORE}:`))
  for (const k of entries) {
    const path = String(k).replace(`${COVER_STORE}:`, '')
    const blob = await get(k)
    zip.file(path, blob)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, 'covers.zip')
}
