import { adminFetch } from '../utils/adminFetch.js'
import { DEFAULT_OVERLAY_SETTINGS, mergeOverlaySettings } from '../utils/overlaySettings.js'

const getBaseUrl = () => import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

async function requestJson(url, options) {
  const res = await adminFetch(url, options)
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchOverlaySettings() {
  const base = getBaseUrl()
  try {
    const data = await requestJson(`${base}/api/admin/overlay-settings`)
    return mergeOverlaySettings(data)
  } catch {
    return DEFAULT_OVERLAY_SETTINGS
  }
}

export async function updateOverlaySettings(payload) {
  const base = getBaseUrl()
  const data = await requestJson(`${base}/api/admin/overlay-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return mergeOverlaySettings(data)
}
