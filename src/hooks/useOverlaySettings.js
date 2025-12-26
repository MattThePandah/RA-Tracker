import React from 'react'
import { DEFAULT_OVERLAY_SETTINGS, mergeOverlaySettings } from '../utils/overlaySettings.js'
import { buildOverlayUrl } from '../utils/overlayApi.js'

export function useOverlaySettings() {
  const [settings, setSettings] = React.useState(DEFAULT_OVERLAY_SETTINGS)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

    const load = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/config', base), { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load overlay config')
        const data = await res.json()
        if (active) setSettings(mergeOverlaySettings(data))
      } catch {
        if (active) setSettings(DEFAULT_OVERLAY_SETTINGS)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [])

  return { settings, loading }
}
