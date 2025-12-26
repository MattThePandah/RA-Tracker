const DEFAULT_BASE = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
let cachedToken

export function getOverlayToken() {
  if (cachedToken !== undefined) return cachedToken
  let token = import.meta.env.VITE_OVERLAY_TOKEN || ''
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search)
      token = params.get('token') || params.get('overlayToken') || token
    } catch {}
  }
  cachedToken = token
  return token
}

export function buildOverlayUrl(path, base = DEFAULT_BASE) {
  if (!path) return base || ''
  const normalizedBase = base ? base.replace(/\/+$/, '') : ''
  const raw = path.startsWith('http') ? path : `${normalizedBase}${path.startsWith('/') ? '' : '/'}${path}`
  const token = getOverlayToken()
  if (!token) return raw
  const sep = raw.includes('?') ? '&' : '?'
  return `${raw}${sep}token=${encodeURIComponent(token)}`
}
