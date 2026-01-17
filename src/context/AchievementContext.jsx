import React, { createContext, useContext, useReducer, useEffect } from 'react'
import * as RA from '../services/retroachievements.js'
import * as Storage from '../services/storage.js'
import { findSubsetsForGame } from '../utils/subsetDetection.js'

const AchievementContext = createContext()

const LS_ACHIEVEMENT_SETTINGS = 'tracker.achievementSettings'

const initialState = {
  currentGameAchievements: [],
  currentGameAchievementsRaw: [],
  currentGameProgress: null,
  currentGameProgressRaw: null,
  currentGameId: null,
  gameSubsets: {},
  recentAchievements: [],
  userProgress: {},
  settings: {
    raUsername: '',
    raApiKey: '',
    showHardcoreMode: true,
    enablePopups: true,
    enableTicker: true,
    popupDuration: 5000,
    tickerSpeed: 30,
    enableSounds: true,
    soundVolume: 0.7,
    enableMilestoneSounds: true,
    enableStreakSounds: true,
    // Smart polling / automation
    smartPollingEnabled: false,
    smartPollMs: 30000,
    autoDetectNowPlaying: false,
    autoNowPlayingPollMs: 30000,
    // Admin-only: requires Twitch OAuth session + CSRF token present
    autoTimerFromNowPlaying: false,
    // Safety: periodic full refresh even if no point delta
    smartFullRefreshMs: 600000
  },
  loading: {
    gameAchievements: false,
    recentAchievements: false,
    userProgress: false
  },
  errors: {},
  retryAttempts: {},
  circuitBreaker: {
    failureCount: 0,
    lastFailureTime: null,
    isOpen: false
  },
  streakData: {
    currentStreak: 0,
    longestStreak: 0,
    lastAchievementTime: null
  }
}

const RECENT_MIN_INTERVAL_MS = 15000
const RECENT_BACKOFF_BASE_MS = 15000
const RECENT_BACKOFF_MAX_MS = 120000
const GAME_MIN_INTERVAL_MS = 15000
const GAME_BACKOFF_BASE_MS = 15000
const GAME_BACKOFF_MAX_MS = 120000

const normalizeSubsetKey = (value) => {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s || s === '0') return null
  return s
}

const computeProgressFromAchievements = (achievements = []) => {
  const list = Array.isArray(achievements) ? achievements : []
  const total = list.length
  let achieved = 0
  let achievedHardcore = 0
  let possibleScore = 0
  let scoreAchieved = 0
  let scoreAchievedHardcore = 0

  for (const ach of list) {
    const points = Number(ach?.points) || 0
    possibleScore += points
    if (ach?.isEarned) {
      achieved += 1
      scoreAchieved += points
    }
    if (ach?.isEarnedHardcore) {
      achievedHardcore += 1
      scoreAchievedHardcore += points
    }
  }

  return {
    numPossibleAchievements: total,
    possibleScore,
    numAchieved: achieved,
    numAchievedHardcore: achievedHardcore,
    scoreAchieved,
    scoreAchievedHardcore,
    completionPercentage: total > 0 ? Math.round((achieved / total) * 100) : 0,
    completionPercentageHardcore: total > 0 ? Math.round((achievedHardcore / total) * 100) : 0
  }
}

const filterAchievementsBySubsets = (achievements = [], enabledSet = null) => {
  const list = Array.isArray(achievements) ? achievements : []
  const hasSubsetInfo = list.some(ach => normalizeSubsetKey(ach?.subsetId))
  if (!hasSubsetInfo) {
    return list
  }
  const allowAnySubset = enabledSet && enabledSet.size > 0
  return list.filter(ach => {
    const subsetId = normalizeSubsetKey(ach?.subsetId)
    if (!subsetId) return true
    if (!allowAnySubset) return false
    return enabledSet.has(String(subsetId))
  })
}

const resolveSubsetMode = (game) => {
  if (game?.subsetMode) return game.subsetMode === 'custom' ? 'custom' : 'auto'
  if (Array.isArray(game?.subsetEnabledIds) && game.subsetEnabledIds.length > 0) return 'custom'
  return 'auto'
}

const buildEnabledSubsetIdSetForGame = ({ gameId, achievements = [], subsets = [] } = {}) => {
  const enabled = new Set()
  let mode = 'auto'
  const knownSubsetIds = new Set()

  if (Array.isArray(subsets)) {
    for (const entry of subsets) {
      const id = normalizeSubsetKey(entry?.id ?? entry?.subsetId)
      if (id) knownSubsetIds.add(String(id))
    }
  }
  if (Array.isArray(achievements)) {
    for (const ach of achievements) {
      const id = normalizeSubsetKey(ach?.subsetId)
      if (id) knownSubsetIds.add(String(id))
    }
  }

  const enableAllKnown = () => {
    for (const id of knownSubsetIds) enabled.add(String(id))
    return { mode: 'auto', enabled }
  }
  try {
    const games = Storage.getGames() || []
    const match = games.find(g => String(g?.id) === String(gameId))
    mode = resolveSubsetMode(match)
    if (mode === 'custom') {
      const ids = Array.isArray(match?.subsetEnabledIds) ? match.subsetEnabledIds : []
      const normalized = ids.map(id => String(id)).filter(Boolean)
      const matched = knownSubsetIds.size > 0
        ? normalized.filter(id => knownSubsetIds.has(String(id)))
        : normalized
      if (normalized.length > 0 && knownSubsetIds.size > 0 && matched.length === 0) {
        return enableAllKnown()
      }
      for (const id of matched) {
        enabled.add(String(id))
      }
      return { mode, enabled }
    }
  } catch {
    // ignore
  }

  return enableAllKnown()
}

const extractSubsetLabelFromTitle = (title = '') => {
  const raw = String(title || '').trim()
  if (!raw) return ''
  const match = raw.match(/\[\s*subset\s*-\s*([^\]]+)\]/i)
  if (match && match[1]) return match[1].trim()
  return raw
}

const normalizeIdList = (list) => (
  Array.isArray(list) ? list.map(id => String(id)).filter(Boolean) : []
)

function achievementReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.key]: action.loading
        }
      }
    
    case 'SET_ERROR':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.key]: action.error
        }
      }
    
    case 'CLEAR_ERROR':
      const { [action.key]: removed, ...remainingErrors } = state.errors
      return {
        ...state,
        errors: remainingErrors
      }
    
    case 'SET_SETTINGS':
      const newSettings = { ...state.settings, ...action.settings }
      // Persist settings to localStorage
      localStorage.setItem(LS_ACHIEVEMENT_SETTINGS, JSON.stringify(newSettings))
      return {
        ...state,
        settings: newSettings
      }
    
    case 'SET_CURRENT_GAME_ACHIEVEMENTS': {
      const gameId = action.gameId ?? state.currentGameId
      const rawAchievements = Array.isArray(action.rawAchievements)
        ? action.rawAchievements
        : (Array.isArray(action.achievements) ? action.achievements : [])
      const rawProgress = action.rawProgress ?? action.progress ?? null
      return {
        ...state,
        currentGameId: gameId,
        currentGameAchievements: Array.isArray(action.achievements) ? action.achievements : rawAchievements,
        currentGameAchievementsRaw: rawAchievements,
        currentGameProgress: action.progress ?? rawProgress,
        currentGameProgressRaw: rawProgress
      }
    }

    case 'SET_GAME_SUBSETS':
      return {
        ...state,
        gameSubsets: {
          ...state.gameSubsets,
          [action.gameId]: Array.isArray(action.subsets) ? action.subsets : []
        }
      }
    
    case 'SET_RECENT_ACHIEVEMENTS':
      return {
        ...state,
        recentAchievements: action.achievements
      }
    
    case 'ADD_RECENT_ACHIEVEMENT':
      // Add new achievement to the front, keep max 50
      const updatedRecent = [action.achievement, ...state.recentAchievements].slice(0, 50)
      return {
        ...state,
        recentAchievements: updatedRecent
      }
    
    case 'SET_USER_PROGRESS':
      return {
        ...state,
        userProgress: action.progress
      }
    
    case 'UPDATE_ACHIEVEMENT':
      return {
        ...state,
        currentGameAchievements: state.currentGameAchievements.map(achievement =>
          achievement.id === action.achievementId
            ? { ...achievement, ...action.updates }
            : achievement
        )
      }
    
    case 'SET_RETRY_ATTEMPT':
      return {
        ...state,
        retryAttempts: {
          ...state.retryAttempts,
          [action.gameId]: action.attempt
        }
      }
    
    case 'CLEAR_RETRY_ATTEMPTS':
      return {
        ...state,
        retryAttempts: action.gameId 
          ? { ...state.retryAttempts, [action.gameId]: 0 }
          : {}
      }
    
    case 'CIRCUIT_BREAKER_FAILURE':
      const newFailureCount = state.circuitBreaker.failureCount + 1
      return {
        ...state,
        circuitBreaker: {
          failureCount: newFailureCount,
          lastFailureTime: Date.now(),
          isOpen: newFailureCount >= 5 // Open circuit after 5 failures
        }
      }
    
    case 'CIRCUIT_BREAKER_SUCCESS':
      return {
        ...state,
        circuitBreaker: {
          failureCount: 0,
          lastFailureTime: null,
          isOpen: false
        }
      }
    
    case 'CIRCUIT_BREAKER_RESET':
      return {
        ...state,
        circuitBreaker: {
          ...state.circuitBreaker,
          isOpen: false,
          failureCount: Math.max(0, state.circuitBreaker.failureCount - 1)
        }
      }
    
    case 'UPDATE_STREAK_DATA':
      return {
        ...state,
        streakData: {
          ...state.streakData,
          ...action.streakData
        }
      }
    
    default:
      return state
  }
}

export function AchievementProvider({ children }) {
  const [state, dispatch] = useReducer(achievementReducer, initialState)
  const recentFetchRef = React.useRef({ lastStart: 0, cooldownUntil: 0, failures: 0 })
  const gameFetchRef = React.useRef(new Map())
  const subsetFetchRef = React.useRef(new Map())
  const smartPollRef = React.useRef({
    running: false,
    lastProfile: null,
    lastFullRefreshAt: 0,
    lastNowPlayingRaGameId: null
  })

  // Load settings on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search || '')
        if (params.get('resetra') === '1') {
          localStorage.removeItem(LS_ACHIEVEMENT_SETTINGS)
          localStorage.removeItem('psfest.achievementSettings')
        }
      }
      let savedRaw = localStorage.getItem(LS_ACHIEVEMENT_SETTINGS)
      if (!savedRaw) {
        const legacy = localStorage.getItem('psfest.achievementSettings')
        if (legacy) {
          localStorage.setItem(LS_ACHIEVEMENT_SETTINGS, legacy)
          localStorage.removeItem('psfest.achievementSettings')
          savedRaw = legacy
        }
      }
      let settings = savedRaw ? JSON.parse(savedRaw) : {}
      settings = { ...initialState.settings, ...settings }
      
      // If no saved achievement settings, try to get RA credentials from env or existing game settings
      if (!settings.raUsername || !settings.raApiKey) {
        const gameSettings = Storage.getSettings() || {}
        settings = {
          ...settings,
          raUsername: import.meta.env.VITE_RA_USERNAME || settings.raUsername || '',
          raApiKey: import.meta.env.VITE_RA_API_KEY || settings.raApiKey || ''
        }
      }
      
      if (Object.keys(settings).length > 0) {
        dispatch({ type: 'SET_SETTINGS', settings })
      }
    } catch (error) {
      console.warn('Failed to load achievement settings:', error)
    }
  }, [])

  // Background smart polling:
  // - (Optional) Poll user profile for point deltas; only then fetch recent achievements and refresh current game progress.
  // - (Optional) Poll "recently played" to auto-select current game (and optionally start timer if admin).
  useEffect(() => {
    const apiKey = state.settings.raApiKey || import.meta.env.VITE_RA_API_KEY
    const username = state.settings.raUsername || import.meta.env.VITE_RA_USERNAME
    const smartEnabled = state.settings.smartPollingEnabled === true
    const nowPlayingEnabled = state.settings.autoDetectNowPlaying === true

    if (!apiKey || !username) return
    if (!smartEnabled && !nowPlayingEnabled) return

    let stopped = false
    const clampMs = (value, min, max, fallback) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return fallback
      return Math.min(Math.max(Math.floor(n), min), max)
    }
    const pollMs = clampMs(state.settings.smartPollMs, 5000, 300000, 30000)
    const nowPlayingPollMs = clampMs(state.settings.autoNowPlayingPollMs, 5000, 300000, 30000)
    const fullRefreshMs = clampMs(state.settings.smartFullRefreshMs, 60000, 3600000, 600000)

    const hasAdminCsrf = () => {
      try { return !!localStorage.getItem('ra.csrf') } catch { return false }
    }

    const findInternalGameIdForRa = (raGameId) => {
      try {
        const games = Storage.getGames() || []
        for (const g of games) {
          const internal = g?.id
          const extracted = RA.extractGameIdFromInternalId(internal)
          if (extracted && Number(extracted) === Number(raGameId)) return internal
        }
      } catch {}
      return null
    }

    const maybeRefreshCurrentGame = async (reason) => {
      try {
        const currentId = Storage.getCurrentGameId()
        if (!currentId) return
        const raGameId = RA.extractGameIdFromInternalId(currentId)
        if (!raGameId) return
        const now = Date.now()
        if (smartEnabled && now - smartPollRef.current.lastFullRefreshAt >= fullRefreshMs) {
          smartPollRef.current.lastFullRefreshAt = now
          await loadGameAchievements(currentId, true)
          return
        }
        if (reason === 'points_changed') {
          await loadGameAchievements(currentId, true)
        }
      } catch {}
    }

    const tickProfile = async () => {
      if (!smartEnabled) return
      if (smartPollRef.current.running) return
      smartPollRef.current.running = true
      try {
        const profile = await RA.getUserProfile({ apiKey, username })
        const last = smartPollRef.current.lastProfile
        smartPollRef.current.lastProfile = profile

        if (last && (
          Number(profile.totalPoints) !== Number(last.totalPoints) ||
          Number(profile.softcorePoints) !== Number(last.softcorePoints)
        )) {
          await loadRecentAchievements(50)
          await maybeRefreshCurrentGame('points_changed')
        } else {
          await maybeRefreshCurrentGame('periodic')
        }
      } catch (e) {
        // Intentionally quiet; existing per-call error state/backoff already handles user feedback.
        console.warn('Smart polling: profile check failed', e?.message || e)
      } finally {
        smartPollRef.current.running = false
      }
    }

    const tickNowPlaying = async () => {
      if (!nowPlayingEnabled) return
      try {
        const currentSource = Storage.getCurrentGameSource?.()
        if (currentSource === 'manual') {
          // Manual selection overrides auto-detect until cleared; allow auto to resume later.
          smartPollRef.current.lastNowPlayingRaGameId = null
          return
        }
        const list = await RA.getRecentlyPlayedGames({ apiKey, username, count: 1 })
        const raGameId = list?.[0]?.id || null
        if (!raGameId || !Number.isFinite(Number(raGameId))) return
        if (smartPollRef.current.lastNowPlayingRaGameId === raGameId) return
        smartPollRef.current.lastNowPlayingRaGameId = raGameId

        const internalId = findInternalGameIdForRa(raGameId)
        if (!internalId) return

        const current = Storage.getCurrentGameId()
        if (current !== internalId) {
          Storage.setCurrentGameId(internalId, { source: 'auto' })
          await loadGameAchievements(internalId, true)
        }

        if (state.settings.autoTimerFromNowPlaying && hasAdminCsrf()) {
          try {
            await Storage.startCurrentTimer()
          } catch {}
        }
      } catch (e) {
        console.warn('Smart polling: now playing check failed', e?.message || e)
      }
    }

    // Kick once immediately
    tickProfile()
    tickNowPlaying()

    const profileId = smartEnabled ? setInterval(() => { if (!stopped) tickProfile() }, pollMs) : null
    const nowPlayingId = nowPlayingEnabled ? setInterval(() => { if (!stopped) tickNowPlaying() }, nowPlayingPollMs) : null

    return () => {
      stopped = true
      if (profileId) clearInterval(profileId)
      if (nowPlayingId) clearInterval(nowPlayingId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.settings.raApiKey,
    state.settings.raUsername,
    state.settings.smartPollingEnabled,
    state.settings.smartPollMs,
    state.settings.smartFullRefreshMs,
    state.settings.autoDetectNowPlaying,
    state.settings.autoNowPlayingPollMs,
    state.settings.autoTimerFromNowPlaying
  ])

  // API functions
  const loadGameAchievements = async (gameId, force = false, options = {}) => {
    const apiKey = state.settings.raApiKey || import.meta.env.VITE_RA_API_KEY
    const username = state.settings.raUsername || import.meta.env.VITE_RA_USERNAME
    const bypassThrottle = options?.bypassThrottle === true
    
    if (!gameId || !apiKey || !username) {
      return
    }

    // Check circuit breaker - if open, only allow requests after cooldown period
    if (state.circuitBreaker.isOpen) {
      const cooldownPeriod = 60000 // 1 minute
      const timeSinceLastFailure = Date.now() - state.circuitBreaker.lastFailureTime
      
      if (timeSinceLastFailure < cooldownPeriod) {
        console.log('AchievementContext: Circuit breaker open, skipping request')
        return
      } else {
        // Try to reset circuit breaker after cooldown
        console.log('AchievementContext: Attempting to reset circuit breaker after cooldown')
        dispatch({ type: 'CIRCUIT_BREAKER_RESET' })
      }
    }

    // Don't reload if already loading
    if (state.loading.gameAchievements) {
      console.log('AchievementContext: Skipping load, already loading')
      return
    }
    
    // Skip if we already have data and this isn't a forced refresh
    if (!force && state.currentGameAchievements.length > 0) {
      return
    }

    const now = Date.now()
    const gameMeta = gameFetchRef.current.get(gameId) || { lastStart: 0, cooldownUntil: 0, failures: 0 }
    if (!bypassThrottle) {
      if (now < gameMeta.cooldownUntil) {
        return
      }
      if (now - gameMeta.lastStart < GAME_MIN_INTERVAL_MS) {
        return
      }
    }
    gameMeta.lastStart = now
    gameFetchRef.current.set(gameId, gameMeta)

    dispatch({ type: 'SET_LOADING', key: 'gameAchievements', loading: true })
    dispatch({ type: 'CLEAR_ERROR', key: 'gameAchievements' })

    try {
      const raGameId = RA.extractGameIdFromInternalId(gameId)
      if (!raGameId) {
        throw new Error('Invalid game ID format for RetroAchievements')
      }

      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        console.warn('AchievementContext: Achievement load timeout for game', gameId)
      }, 15000) // 15 second timeout

      try {
        const result = await RA.getGameInfoAndUserProgress({
          apiKey,
          username,
          gameId: raGameId,
          includeAwards: true
        })
        
        clearTimeout(timeoutId)

        const baseAchievements = Array.isArray(result.achievements) ? result.achievements : []
        const hasSubsetInfo = baseAchievements.some(ach => normalizeSubsetKey(ach?.subsetId))

        const games = Storage.getGames() || []
        const baseGame = games.find(g => String(g?.id) === String(gameId)) || null
        const subsetGames = baseGame ? findSubsetsForGame(baseGame, games) : []
        const derivedSubsets = subsetGames.map(g => ({
          id: g.id,
          title: extractSubsetLabelFromTitle(g.title),
          raw: { gameId: g.id }
        }))

        if (Array.isArray(result.subsets) && result.subsets.length) {
          dispatch({ type: 'SET_GAME_SUBSETS', gameId, subsets: result.subsets })
        } else if (derivedSubsets.length) {
          dispatch({ type: 'SET_GAME_SUBSETS', gameId, subsets: derivedSubsets })
        }

        let mergedAchievements = baseAchievements
        if (!hasSubsetInfo && subsetGames.length) {
          const subsetMode = resolveSubsetMode(baseGame)
          let enabledSubsetIds = []
          if (subsetMode === 'custom') {
            enabledSubsetIds = normalizeIdList(baseGame?.subsetEnabledIds)
            if (subsetGames.length) {
              const known = new Set(subsetGames.map(s => String(s.id)))
              enabledSubsetIds = enabledSubsetIds.filter(id => known.has(String(id)))
              if (!enabledSubsetIds.length && normalizeIdList(baseGame?.subsetEnabledIds).length) {
                enabledSubsetIds = subsetGames.map(s => String(s.id))
              }
            }
          } else {
            enabledSubsetIds = subsetGames.map(s => String(s.id))
          }

          if (enabledSubsetIds.length) {
            const subsetIdSet = new Set(enabledSubsetIds)
            const subsetTargets = subsetGames.filter(g => subsetIdSet.has(String(g.id)))
            const subsetResults = []
            for (const subsetGame of subsetTargets) {
              const subsetRaId = RA.extractGameIdFromInternalId(subsetGame.id)
              if (!subsetRaId) continue
              const subsetData = await RA.getGameInfoAndUserProgress({
                apiKey,
                username,
                gameId: subsetRaId,
                includeAwards: true
              })
              const subsetLabel = extractSubsetLabelFromTitle(subsetGame.title)
              const subsetAchievements = (subsetData?.achievements || []).map(ach => ({
                ...ach,
                subsetId: String(subsetGame.id),
                subsetTitle: subsetLabel || ach.subsetTitle || null
              }))
              subsetResults.push(...subsetAchievements)
            }
            if (subsetResults.length) {
              const seen = new Set(baseAchievements.map(a => String(a.id)))
              const deduped = subsetResults.filter(a => {
                const key = String(a.id)
                if (seen.has(key)) return false
                seen.add(key)
                return true
              })
              mergedAchievements = [...baseAchievements, ...deduped]
            }
          }
        }

        const enabledSubsetInfo = buildEnabledSubsetIdSetForGame({
          gameId,
          achievements: mergedAchievements,
          subsets: Array.isArray(result.subsets) && result.subsets.length ? result.subsets : derivedSubsets
        })
        const filtered = filterAchievementsBySubsets(mergedAchievements, enabledSubsetInfo.enabled)
        const progress = computeProgressFromAchievements(filtered)

        const earnedCount = filtered.filter(a => a.isEarned).length
        const totalCount = filtered.length
        const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0
        
        console.log('AchievementContext: Updated achievements for game', gameId, {
          achievementCount: totalCount,
          earnedCount,
          completionPercentage,
          progress
        })
        
        dispatch({
          type: 'SET_CURRENT_GAME_ACHIEVEMENTS',
          gameId,
          rawAchievements: mergedAchievements,
          achievements: filtered,
          rawProgress: result.userProgress,
          progress
        })
        
        // Clear retry attempts on successful load
        dispatch({ type: 'CLEAR_RETRY_ATTEMPTS', gameId })
        // Reset circuit breaker on successful load
        dispatch({ type: 'CIRCUIT_BREAKER_SUCCESS' })
        gameMeta.failures = 0
        gameMeta.cooldownUntil = 0
        gameFetchRef.current.set(gameId, gameMeta)
      } catch (apiError) {
        clearTimeout(timeoutId)
        throw apiError
      }

    } catch (error) {
      let errorMessage = error.message || 'Unknown error'
      
      // Handle specific error types
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out - RetroAchievements may be slow'
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limited by RetroAchievements - will retry later'
      } else if (error.response?.status >= 500) {
        errorMessage = 'RetroAchievements server error - will retry later'
      }
      
      console.error('Failed to load game achievements:', error)
      dispatch({ type: 'SET_ERROR', key: 'gameAchievements', error: errorMessage })
      
      // Track circuit breaker failures for persistent errors
      if (error.response?.status >= 400 || error.name === 'AbortError') {
        dispatch({ type: 'CIRCUIT_BREAKER_FAILURE' })
      }
      
      // For rate limiting or server errors, implement exponential backoff
      if (error.response?.status === 429 || error.response?.status >= 500) {
        console.log('AchievementContext: Will retry with exponential backoff')
        // Schedule retry with exponential backoff (2^attempt * 1000ms, max 30s)
        const retryAttempt = (state.retryAttempts?.[gameId] || 0) + 1
        const backoffDelay = Math.min(Math.pow(2, retryAttempt) * 1000, 30000)

        gameMeta.failures = retryAttempt
        gameMeta.cooldownUntil = Date.now() + Math.min(GAME_BACKOFF_BASE_MS * Math.pow(2, retryAttempt - 1), GAME_BACKOFF_MAX_MS)
        gameFetchRef.current.set(gameId, gameMeta)
        
        setTimeout(async () => {
          console.log(`AchievementContext: Retrying achievement load attempt ${retryAttempt} after ${backoffDelay}ms`)
          await loadGameAchievements(gameId, true)
        }, backoffDelay)
        
        // Track retry attempts
        dispatch({ 
          type: 'SET_RETRY_ATTEMPT', 
          key: 'gameAchievements', 
          gameId, 
          attempt: retryAttempt 
        })
      }
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'gameAchievements', loading: false })
    }
  }

  const loadGameSubsets = async (gameId, force = false) => {
    const apiKey = state.settings.raApiKey || import.meta.env.VITE_RA_API_KEY
    const username = state.settings.raUsername || import.meta.env.VITE_RA_USERNAME

    if (!gameId || !apiKey || !username) {
      return []
    }

    if (!force && state.gameSubsets?.[gameId]) {
      return state.gameSubsets[gameId]
    }

    const now = Date.now()
    const meta = subsetFetchRef.current.get(gameId) || { lastStart: 0, cooldownUntil: 0, failures: 0 }
    if (now < meta.cooldownUntil) {
      return state.gameSubsets?.[gameId] || []
    }
    if (now - meta.lastStart < GAME_MIN_INTERVAL_MS) {
      return state.gameSubsets?.[gameId] || []
    }
    meta.lastStart = now
    subsetFetchRef.current.set(gameId, meta)

    try {
      const raGameId = RA.extractGameIdFromInternalId(gameId)
      if (!raGameId) {
        throw new Error('Invalid game ID format for RetroAchievements')
      }
      const subsets = await RA.getGameSubsets({ apiKey, username, gameId: raGameId })
      const normalized = Array.isArray(subsets) ? subsets : []
      dispatch({ type: 'SET_GAME_SUBSETS', gameId, subsets: normalized })
      meta.failures = 0
      meta.cooldownUntil = 0
      subsetFetchRef.current.set(gameId, meta)
      return normalized
    } catch (error) {
      meta.failures += 1
      meta.cooldownUntil = Date.now() + Math.min(GAME_BACKOFF_BASE_MS * Math.pow(2, meta.failures - 1), GAME_BACKOFF_MAX_MS)
      subsetFetchRef.current.set(gameId, meta)
      return state.gameSubsets?.[gameId] || []
    }
  }

  const refreshSubsetFilter = (gameId) => {
    const raw = Array.isArray(state.currentGameAchievementsRaw) ? state.currentGameAchievementsRaw : []
    if (!raw.length) return
    const enabledSubsetInfo = buildEnabledSubsetIdSetForGame({
      gameId,
      achievements: raw,
      subsets: state.gameSubsets?.[gameId] || []
    })
    const filtered = filterAchievementsBySubsets(raw, enabledSubsetInfo.enabled)
    const progress = computeProgressFromAchievements(filtered)
    dispatch({
      type: 'SET_CURRENT_GAME_ACHIEVEMENTS',
      gameId,
      rawAchievements: raw,
      achievements: filtered,
      rawProgress: state.currentGameProgressRaw ?? state.currentGameProgress,
      progress
    })
  }

  const loadRecentAchievements = async (count = 50) => {
    const apiKey = state.settings.raApiKey || import.meta.env.VITE_RA_API_KEY
    const username = state.settings.raUsername || import.meta.env.VITE_RA_USERNAME
    
    if (!apiKey || !username) {
      return
    }

    // Check if already loading to prevent duplicate requests
    if (state.loading.recentAchievements) {
      console.log('AchievementContext: Recent achievements already loading, skipping')
      return
    }

    const now = Date.now()
    const recentMeta = recentFetchRef.current
    if (now < recentMeta.cooldownUntil) {
      return
    }
    if (now - recentMeta.lastStart < RECENT_MIN_INTERVAL_MS) {
      return
    }
    recentMeta.lastStart = now
    console.log('AchievementContext: Fetching recent achievements', { count })

    dispatch({ type: 'SET_LOADING', key: 'recentAchievements', loading: true })
    dispatch({ type: 'CLEAR_ERROR', key: 'recentAchievements' })

    try {
      // Add timeout for recent achievements request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        console.warn('AchievementContext: Recent achievements load timeout')
      }, 10000) // 10 second timeout for recent achievements
      
      const achievements = await RA.getRecentAchievements({
        apiKey,
        username,
        count,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      dispatch({ type: 'SET_RECENT_ACHIEVEMENTS', achievements })
      recentMeta.failures = 0
      recentMeta.cooldownUntil = 0

    } catch (error) {
      let errorMessage = error.message || 'Failed to load recent achievements'
      
      if (error.name === 'AbortError') {
        errorMessage = 'Recent achievements request timed out'
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limited - recent achievements will retry later'
      }
      
      console.error('Failed to load recent achievements:', error)
      dispatch({ type: 'SET_ERROR', key: 'recentAchievements', error: errorMessage })
      if (error.name === 'AbortError' || error.response?.status === 429 || error.response?.status >= 500) {
        recentMeta.failures += 1
        const backoff = Math.min(
          RECENT_BACKOFF_BASE_MS * Math.pow(2, recentMeta.failures - 1),
          RECENT_BACKOFF_MAX_MS
        )
        recentMeta.cooldownUntil = Date.now() + backoff
      }
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'recentAchievements', loading: false })
    }
  }

  const loadUserProgress = async (gameIds) => {
    const apiKey = state.settings.raApiKey || import.meta.env.VITE_RA_API_KEY
    const username = state.settings.raUsername || import.meta.env.VITE_RA_USERNAME
    
    if (!gameIds?.length || !apiKey || !username) {
      return
    }

    dispatch({ type: 'SET_LOADING', key: 'userProgress', loading: true })
    dispatch({ type: 'CLEAR_ERROR', key: 'userProgress' })

    try {
      // Convert internal game IDs to RA game IDs
      const raGameIds = gameIds
        .map(id => RA.extractGameIdFromInternalId(id))
        .filter(id => id !== null)

      if (raGameIds.length === 0) {
        throw new Error('No valid RetroAchievements game IDs found')
      }

      const progress = await RA.getUserProgress({
        apiKey,
        username,
        gameIds: raGameIds
      })

      // Convert back to internal ID format for mapping
      const progressMap = {}
      progress.forEach(p => {
        const internalId = gameIds.find(id => 
          RA.extractGameIdFromInternalId(id) === p.gameId
        )
        if (internalId) {
          progressMap[internalId] = p
        }
      })

      dispatch({ type: 'SET_USER_PROGRESS', progress: progressMap })

    } catch (error) {
      console.error('Failed to load user progress:', error)
      dispatch({ type: 'SET_ERROR', key: 'userProgress', error: error.message })
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'userProgress', loading: false })
    }
  }

  const updateSettings = (newSettings) => {
    dispatch({ type: 'SET_SETTINGS', settings: newSettings })
  }

  const addRecentAchievement = (achievement) => {
    // Update streak data when adding recent achievement
    const now = Date.now()
    const achievementTime = new Date(achievement.date).getTime()
    const timeSinceLastAchievement = state.streakData.lastAchievementTime 
      ? achievementTime - state.streakData.lastAchievementTime 
      : Infinity
    
    // Consider achievements within 1 hour as part of a streak
    const streakWindow = 60 * 60 * 1000 // 1 hour in milliseconds
    const newStreak = timeSinceLastAchievement <= streakWindow 
      ? state.streakData.currentStreak + 1 
      : 1
    
    const longestStreak = Math.max(newStreak, state.streakData.longestStreak)
    
    dispatch({
      type: 'UPDATE_STREAK_DATA',
      streakData: {
        currentStreak: newStreak,
        longestStreak,
        lastAchievementTime: achievementTime
      }
    })
    
    // Play streak sound if applicable
    if (newStreak >= 3 && state.settings.enableStreakSounds) {
      import('../services/soundManager.js').then(module => {
        module.default.playStreakSound(newStreak)
      })
    }
    
    dispatch({ type: 'ADD_RECENT_ACHIEVEMENT', achievement })
  }

  const updateAchievement = (achievementId, updates) => {
    dispatch({ type: 'UPDATE_ACHIEVEMENT', achievementId, updates })
  }

  const clearCurrentGameData = () => {
    dispatch({
      type: 'SET_CURRENT_GAME_ACHIEVEMENTS',
      achievements: [],
      rawAchievements: [],
      progress: null,
      rawProgress: null
    })
  }

  // Check if achievement features are configured
  const settingsConfig = !!(state.settings.raApiKey && state.settings.raUsername)
  const envConfig = !!(import.meta.env.VITE_RA_API_KEY && import.meta.env.VITE_RA_USERNAME)
  const isConfigured = settingsConfig || envConfig

  // Get achievement progress for a specific game
  const getGameProgress = (gameId) => {
    return state.userProgress[gameId] || null
  }

  // Get achievement unlock rate for current game
  const getUnlockRate = () => {
    if (!state.currentGameProgress) return 0
    return state.currentGameProgress.completionPercentage
  }

  // Get hardcore unlock rate for current game
  const getHardcoreUnlockRate = () => {
    if (!state.currentGameProgress) return 0
    return state.currentGameProgress.completionPercentageHardcore
  }

  // Check if in hardcore mode (based on recent achievements)
  const isInHardcoreMode = () => {
    if (state.recentAchievements.length === 0) return false
    // Check the most recent achievement to determine current mode
    return state.recentAchievements[0]?.hardcoreMode === 1
  }

  const value = {
    state,
    dispatch,
    loadGameAchievements,
    loadGameSubsets,
    refreshSubsetFilter,
    loadRecentAchievements,
    loadUserProgress,
    updateSettings,
    addRecentAchievement,
    updateAchievement,
    clearCurrentGameData,
    isConfigured,
    getGameProgress,
    getUnlockRate,
    getHardcoreUnlockRate,
    isInHardcoreMode
  }

  return (
    <AchievementContext.Provider value={value}>
      {children}
    </AchievementContext.Provider>
  )
}

export function useAchievements() {
  const context = useContext(AchievementContext)
  if (!context) {
    throw new Error('useAchievements must be used within an AchievementProvider')
  }
  return context
}

export default AchievementContext
