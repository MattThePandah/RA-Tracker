export function getCsrfToken() {
  try { return localStorage.getItem('ra.csrf') || '' } catch { return '' }
}

export function adminFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) }
  const csrf = getCsrfToken()
  if (csrf) headers['x-csrf-token'] = csrf
  return fetch(url, { ...options, headers, credentials: 'include' })
}
