import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const AdminContext = createContext(null)

const getBaseUrl = () => import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

export function AdminProvider({ children }) {
  const [user, setUser] = useState(null)
  const [csrfToken, setCsrfToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${getBaseUrl()}/api/auth/me`, { credentials: 'include' })
      if (!res.ok) {
        setUser(null)
        setCsrfToken('')
        try { localStorage.removeItem('ra.csrf') } catch {}
        setLoading(false)
        return
      }
      const data = await res.json()
      setUser(data.user || null)
      setCsrfToken(data.csrfToken || '')
      try { localStorage.setItem('ra.csrf', data.csrfToken || '') } catch {}
    } catch (err) {
      setError('Failed to verify admin session.')
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch(`${getBaseUrl()}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {}
    setUser(null)
    setCsrfToken('')
    try { localStorage.removeItem('ra.csrf') } catch {}
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loginUrl = `${getBaseUrl()}/auth/twitch`

  const value = useMemo(() => ({
    user,
    csrfToken,
    loading,
    error,
    loginUrl,
    refresh,
    logout
  }), [user, csrfToken, loading, error, loginUrl, refresh, logout])

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
