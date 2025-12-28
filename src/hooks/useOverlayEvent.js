import React from 'react'
import { buildOverlayUrl } from '../utils/overlayApi.js'

export default function useOverlayEvent(pollMs = 15000) {
  const [event, setEvent] = React.useState(null)

  React.useEffect(() => {
    let mounted = true
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

    const load = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/event', base))
        if (!res.ok) return
        const data = await res.json()
        if (mounted) setEvent(data?.event || null)
      } catch {}
    }

    load()
    const id = setInterval(load, pollMs)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [pollMs])

  return event
}
