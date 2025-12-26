export function buildCoverUrl(url, base = import.meta.env.VITE_IGDB_PROXY_URL || '') {
  if (!url) return null
  const value = String(url)
  if (value.startsWith('blob:') || value.startsWith('data:')) return value
  const safeBase = base ? base.replace(/\/+$/, '') : ''
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return safeBase ? `${safeBase}/cover?src=${encodeURIComponent(value)}` : value
  }
  if (value.startsWith('/')) {
    return safeBase ? `${safeBase}${value}` : value
  }
  const normalized = value.replace(/^\/+/, '')
  return safeBase ? `${safeBase}/${normalized}` : value
}
