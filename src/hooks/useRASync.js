import { useCallback } from 'react'
import * as RA from '../services/retroachievements.js'
import * as IGDB from '../services/igdb.js'

// Reads RA credentials and merges remote games into local state
export default function useRASync({ state, dispatch }) {
  const sync = useCallback(async () => {
    try {
      const settings = state.settings || {}
      let credRaw = typeof window !== 'undefined' ? localStorage.getItem('tracker.achievementSettings') : null
      if (!credRaw && typeof window !== 'undefined') {
        const legacy = localStorage.getItem('psfest.achievementSettings')
        if (legacy) {
          localStorage.setItem('tracker.achievementSettings', legacy)
          localStorage.removeItem('psfest.achievementSettings')
          credRaw = legacy
        }
      }
      const creds = credRaw ? JSON.parse(credRaw) : {}
      const username = creds.raUsername || import.meta.env.VITE_RA_USERNAME
      const apiKey = creds.raApiKey || import.meta.env.VITE_RA_API_KEY
      if (!apiKey || !username) return

      const ids = await RA.resolveDefaultPSConsoleIds({ apiKey })
      const games = await RA.fetchGamesForConsoles({
        username,
        apiKey,
        consoleIds: Object.values(ids),
        withHashes: false,
        onlyWithAchievements: true,
      })

      // Merge by title+console
      const key = g => `${g.title}|${g.console}`
      const map = new Map(state.games.map(g => [key(g), g]))
      const newGames = []
      for (const g of games) {
        const k = key(g)
        if (!map.has(k)) {
          map.set(k, g)
          newGames.push(g)
        }
      }
      if (!newGames.length) return

      if (settings.igdbEnabled) {
        try {
          const { urls } = await IGDB.precacheCovers({ games: newGames })
          const base = import.meta.env.VITE_IGDB_PROXY_URL || ''
          if (base && urls && urls.length) {
            fetch(`${base}/covers/prefetch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls }),
            }).catch(() => {})
          }
        } catch (e) {
          console.warn('IGDB precache failed', e?.message || e)
        }
      }

      dispatch({ type: 'SET_GAMES', games: Array.from(map.values()) })
    } catch (e) {
      console.warn('RA sync failed', e?.message || e)
    }
  }, [state.games, state.settings, dispatch])

  return sync
}
