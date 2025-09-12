import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import * as Storage from '../services/storage.js'
import * as Bonus from '../utils/bonusDetection.js'
import useRASync from '../hooks/useRASync.js'
import { listGames as listServerGames } from '../services/library.js'

const GameContext = createContext(null)

const initialState = () => {
  const { games, settings } = Storage.bootstrap()
  return {
    games,
    filtered: games,
    currentGameId: Storage.getCurrentGameId(),
    settings,
    stats: computeStats(games),
  }
}

function computeStats(games) {
  const total = games.length
  const completed = games.filter(g => g.status === 'Completed').length
  const percent = total ? Math.round((completed / total) * 100) : 0
  return { total, completed, percent }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_GAMES': {
      Storage.saveGames(action.games)
      return { ...state, games: action.games, filtered: action.games, stats: computeStats(action.games) }
    }
    case 'FILTER': {
      return { ...state, filtered: action.filtered }
    }
    case 'SET_CURRENT': {
      Storage.setCurrentGameId(action.id)
      return { ...state, currentGameId: action.id }
    }
    case 'UPDATE_GAME': {
      const games = state.games.map(g => g.id === action.game.id ? action.game : g)
      Storage.saveGames(games)
      return { ...state, games, filtered: games, stats: computeStats(games) }
    }
    case 'SET_SETTINGS': {
      Storage.saveSettings(action.settings)
      return { ...state, settings: action.settings }
    }
    case 'CLEAR_ALL_IN_PROGRESS': {
      let changed = 0
      const games = state.games.map(g => {
        const s = (g.status || '').toLowerCase()
        if (s === 'in progress' || s === 'in-progress' || s.includes('progress')) {
          changed++
          return { ...g, status: 'Not Started', date_started: null }
        }
        return g
      })
      Storage.saveGames(games)
      Storage.setCurrentGameId(null)
      try { console.log('[CLEAR_ALL_IN_PROGRESS] reset', changed, 'games') } catch {}
      return { ...state, games, filtered: games, currentGameId: null, stats: computeStats(games) }
    }
    default:
      return state
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  const rasync = useRASync({ state, dispatch })

  useEffect(() => {
    // initial bonus detection pass (idempotent)
    if (state.games.length) {
      const updated = state.games.map(g => ({
        ...g,
        is_bonus: Bonus.isBonus(g.title)
      }))
      if (JSON.stringify(updated) !== JSON.stringify(state.games)) {
        dispatch({ type: 'SET_GAMES', games: updated })
      }
    }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
        // Try new server-backed library first
        const res = await fetch(`${base}/api/games?limit=1`).catch(() => null)
        if (res && res.ok) {
          const all = await listServerGames({ base, limit: 1000 })
          if (all?.length) {
            // Merge with any existing local data to preserve status/progress
            const local = state.games || []
            const byKey = new Map()
            const makeKey = (g) => (g?.id ? String(g.id) : `${g?.title || ''}|${g?.console || ''}`)
            for (const g of local) byKey.set(makeKey(g), g)
            const merged = all.map(g => {
              const k = makeKey(g)
              const lg = byKey.get(k)
              return lg ? {
                ...g,
                status: lg.status || g.status,
                date_started: lg.date_started || g.date_started || null,
                date_finished: lg.date_finished || g.date_finished || null,
                completion_time: lg.completion_time || g.completion_time || null,
                rating: lg.rating ?? g.rating ?? null,
                notes: lg.notes ?? g.notes ?? '',
              } : g
            })
            dispatch({ type: 'SET_GAMES', games: merged })
            return
          }
        }
      } catch {}
      // Fallback to legacy RA client sync
      if (state.settings.raEnabled || !state.games.length) {
        rasync()
      }
    })()
  }, [])

  // Expose for debugging
  useEffect(() => {
    try { window.__PSFEST_STATE__ = state } catch {}
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}
