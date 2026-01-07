import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import * as Storage from '../services/storage.js'
import * as Bonus from '../utils/bonusDetection.js'
import useRASync from '../hooks/useRASync.js'
import { listGames as listServerGames } from '../services/library.js'
import { adminFetch } from '../utils/adminFetch.js'

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
      const prev = state.games.find(g => g.id === action.game.id) || null
      const games = state.games.map(g => g.id === action.game.id ? action.game : g)
      Storage.saveGames(games)
      if (state.currentGameId && action.game.id === state.currentGameId) {
        const changed = !prev || [
          'title',
          'console',
          'image_url',
          'release_year',
          'publisher',
          'status'
        ].some(key => (prev?.[key] ?? null) !== (action.game?.[key] ?? null))
        if (changed) {
          Storage.setCurrentGameId(state.currentGameId)
        }
      }
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
      try { console.log('[CLEAR_ALL_IN_PROGRESS] reset', changed, 'games') } catch { }
      return { ...state, games, filtered: games, currentGameId: null, stats: computeStats(games) }
    }
    default:
      return state
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  const rasync = useRASync({ state, dispatch })
  const notifyReadyRef = React.useRef(false)
  const notifyStatusRef = React.useRef(new Map())
  const historyReadyRef = React.useRef(false)
  const historyStateRef = React.useRef(new Map())

  const sendNotification = React.useCallback(async (type, game) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      if (!base) return
      const payload = {
        id: game.id,
        title: game.title,
        console: game.console,
        image_url: game.image_url || null,
        rating: game.rating ?? null,
        completion_time: game.completion_time ?? null,
        status: game.status || null
      }
      await adminFetch(`${base}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload })
      })
    } catch { }
  }, [])

  const sendLegacyHistory = React.useCallback(async (game, entry) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      if (!base) return
      await adminFetch(`${base}/api/user/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          duration: entry.duration,
          timestamp: entry.timestamp,
          eventType: 'legacy_fields'
        })
      })
    } catch { }
  }, [])

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
    const prevMap = notifyStatusRef.current
    const nextMap = new Map()

    if (!notifyReadyRef.current) {
      for (const g of state.games) {
        nextMap.set(g.id, g.status || '')
      }
      notifyStatusRef.current = nextMap
      notifyReadyRef.current = true
      return
    }

    for (const g of state.games) {
      const nextStatus = g.status || ''
      const prevStatus = prevMap.get(g.id) || ''
      nextMap.set(g.id, nextStatus)
      if (prevStatus && prevStatus !== nextStatus) {
        if (nextStatus === 'In Progress') {
          sendNotification('gameStarted', g)
        }
        if (nextStatus === 'Completed') {
          sendNotification('gameCompleted', g)
        }
      }
    }

    notifyStatusRef.current = nextMap
  }, [state.games, sendNotification])

  useEffect(() => {
    const prevMap = historyStateRef.current
    const nextMap = new Map()
    const pending = []

    if (!historyReadyRef.current) {
      for (const g of state.games) {
        const completion = Number(g?.completion_time) || 0
        const finishedTs = g?.date_finished ? Date.parse(g.date_finished) : null
        const startedTs = g?.date_started ? Date.parse(g.date_started) : null
        nextMap.set(g.id, `${completion}|${finishedTs || ''}|${startedTs || ''}`)
      }
      historyStateRef.current = nextMap
      historyReadyRef.current = true
      return
    }

    for (const g of state.games) {
      const completion = Number(g?.completion_time) || 0
      const finishedTs = g?.date_finished ? Date.parse(g.date_finished) : null
      const startedTs = g?.date_started ? Date.parse(g.date_started) : null
      const signature = `${completion}|${finishedTs || ''}|${startedTs || ''}`
      const prevSignature = prevMap.get(g.id) || ''
      nextMap.set(g.id, signature)

      if (!signature || signature === prevSignature) continue
      if (!completion || !Number.isFinite(completion)) continue
      const baseTs = Number.isFinite(finishedTs) ? finishedTs : (Number.isFinite(startedTs) ? startedTs : null)
      if (!baseTs) continue
      pending.push({
        game: g,
        entry: {
          duration: Math.max(0, Math.round(completion * 3600)),
          timestamp: baseTs
        }
      })
    }

    historyStateRef.current = nextMap
    if (pending.length) {
      for (const item of pending) {
        sendLegacyHistory(item.game, item.entry)
      }
    }
  }, [state.games, sendLegacyHistory])

  useEffect(() => {
    (async () => {
      try {
        const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
        // Try new server-backed library first
        const res = await fetch(`${base}/api/games?limit=1`, { credentials: 'include' }).catch(() => null)
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
              const normalizedConsole = typeof g.console === 'object' ? (g.console.name || g.console.id || '') : String(g.console || '')
              const base = { ...g, console: normalizedConsole }
              return lg ? {
                ...base,
                status: lg.status || g.status,
                date_started: lg.date_started || g.date_started || null,
                date_finished: lg.date_finished || g.date_finished || null,
                completion_time: lg.completion_time || g.completion_time || null,
                rating: lg.rating ?? g.rating ?? null,
                notes: lg.notes ?? g.notes ?? '',
                custom_tags: lg.custom_tags ?? g.custom_tags ?? [],
                studio: lg.studio ?? g.studio ?? null,
              } : base
            })
            dispatch({ type: 'SET_GAMES', games: merged })
            return
          }
        }
      } catch { }
      // Fallback to legacy RA client sync
      if (state.settings.raEnabled || !state.games.length) {
        rasync()
      }
    })()
  }, [])

  // Expose for debugging
  useEffect(() => {
    try { window.__PSFEST_STATE__ = state } catch { }
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}
