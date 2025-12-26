const getBaseUrl = () => import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

async function requestJson(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    const err = new Error(message || `Request failed: ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function getCsrfToken() {
  try { return localStorage.getItem('ra.csrf') || '' } catch { return '' }
}

async function adminRequestJson(url, options = {}) {
  const headers = { ...(options.headers || {}) }
  const csrf = getCsrfToken()
  if (csrf) headers['x-csrf-token'] = csrf
  const next = {
    ...options,
    headers,
    credentials: 'include'
  }
  return requestJson(url, next)
}

export async function fetchPublicGame(gameId) {
  const base = getBaseUrl()
  return adminRequestJson(`${base}/api/public/games/${encodeURIComponent(gameId)}`)
}

export async function savePublicGame(gameId, payload) {
  const base = getBaseUrl()
  return adminRequestJson(`${base}/api/public/games/${encodeURIComponent(gameId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function fetchPublicGames(params = {}) {
  const base = getBaseUrl()
  const query = new URLSearchParams(params)
  const suffix = query.toString() ? `?${query}` : ''
  return requestJson(`${base}/api/public/games${suffix}`)
}

export async function fetchCompletedDrafts() {
  const base = getBaseUrl()
  return requestJson(`${base}/api/public/completed-unreviewed`)
}

export async function searchPublicLibrary(q) {
  const base = getBaseUrl()
  const params = new URLSearchParams({ q })
  return requestJson(`${base}/api/public/search-games?${params}`)
}

export async function fetchSuggestions(params = {}) {
  const base = getBaseUrl()
  const query = new URLSearchParams(params)
  const suffix = query.toString() ? `?${query}` : ''
  return adminRequestJson(`${base}/api/admin/suggestions${suffix}`)
}

export async function createSuggestion(payload) {
  const base = getBaseUrl()
  return requestJson(`${base}/api/public/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function updateSuggestion(id, payload) {
  const base = getBaseUrl()
  return adminRequestJson(`${base}/api/admin/suggestions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function fetchSuggestionSettings() {
  const base = getBaseUrl()
  return requestJson(`${base}/api/public/suggestions/settings`)
}

export async function fetchPublicSite() {
  const base = getBaseUrl()
  return requestJson(`${base}/api/public/site`)
}

export async function fetchStreamStatus() {
  const base = getBaseUrl()
  return requestJson(`${base}/api/public/stream-status`)
}

export async function fetchPublicGamePublic(gameId) {
  const base = getBaseUrl()
  return requestJson(`${base}/api/public/games/${encodeURIComponent(gameId)}/view`)
}

export async function fetchAdminSettings() {
  const base = getBaseUrl()
  return adminRequestJson(`${base}/api/admin/public-settings`)
}

export async function updateAdminSettings(payload) {
  const base = getBaseUrl()
  return adminRequestJson(`${base}/api/admin/public-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}
