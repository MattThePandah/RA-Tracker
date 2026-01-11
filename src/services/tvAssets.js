import { adminFetch } from '../utils/adminFetch.js'

const getBaseUrl = () => import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

async function requestJson(url, options) {
  const res = await adminFetch(url, options)
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function listTvAssets() {
  const base = getBaseUrl()
  return requestJson(`${base}/api/admin/tv-assets`)
}

export async function uploadTvAsset({ file, name }) {
  if (!file) throw new Error('file required')
  const base = getBaseUrl()
  const buf = await file.arrayBuffer()
  const params = new URLSearchParams()
  if (name) params.set('name', name)

  return requestJson(`${base}/api/admin/tv-assets?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: buf
  })
}

export async function deleteTvAsset(name) {
  const base = getBaseUrl()
  const params = new URLSearchParams({ name: String(name || '') })
  return requestJson(`${base}/api/admin/tv-assets?${params.toString()}`, {
    method: 'DELETE'
  })
}

