import React from 'react'
import { buildOverlayUrl } from '../utils/overlayApi.js'

export default function useOverlayConnector(pollMs = 1500) {
  const [event, setEvent] = React.useState(null)

  React.useEffect(() => {
    let mounted = true
    if (!pollMs || pollMs <= 0) {
      setEvent(null)
      return () => { mounted = false }
    }
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'

    const load = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/connector', base))
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
