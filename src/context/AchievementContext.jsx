import React, { createContext, useContext, useReducer, useEffect } from 'react'
import * as RA from '../services/retroachievements.js'
import * as Storage from '../services/storage.js'

const AchievementContext = createContext()

const LS_ACHIEVEMENT_SETTINGS = 'psfest.achievementSettings'

const initialState = {
  currentGameAchievements: [],
  currentGameProgress: null,
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
    enableStreakSounds: true
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
  milestoneData: {
    lastMilestone: 0,
    milestonesReached: [],
    streakData: {
      currentStreak: 0,
      longestStreak: 0,
      lastAchievementTime: null
    }
  }
}

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
    
    case 'SET_CURRENT_GAME_ACHIEVEMENTS':
      return {
        ...state,
        currentGameAchievements: action.achievements,
        currentGameProgress: action.progress
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
    
    case 'UPDATE_MILESTONE_DATA':
      return {
        ...state,
        milestoneData: {
          ...state.milestoneData,
          ...action.milestoneData
        }
      }
    
    case 'ADD_MILESTONE_CELEBRATION':
      return {
        ...state,
        milestoneData: {
          ...state.milestoneData,
          lastMilestone: action.milestone,
          milestonesReached: [...state.milestoneData.milestonesReached, {
            milestone: action.milestone,
            gameId: action.gameId,
            timestamp: Date.now(),
            earnedCount: action.earnedCount,
            totalCount: action.totalCount
          }]
        }
      }
    
    case 'UPDATE_STREAK_DATA':
      return {
        ...state,
        milestoneData: {
          ...state.milestoneData,
          streakData: {
            ...state.milestoneData.streakData,
            ...action.streakData
          }
        }
      }
    
    default:
      return state
  }
}

export function AchievementProvider({ children }) {
  const [state, dispatch] = useReducer(achievementReducer, initialState)

  // Load settings on mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(LS_ACHIEVEMENT_SETTINGS)
      let settings = savedRaw ? JSON.parse(savedRaw) : {}
      
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

  // API functions
  const loadGameAchievements = async (gameId, force = false) => {
    const apiKey = state.settings.raApiKey || import.meta.env.VITE_RA_API_KEY
    const username = state.settings.raUsername || import.meta.env.VITE_RA_USERNAME
    
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

    // Don't reload if already loading (but allow forced refreshes even with existing data)
    if (state.loading.gameAchievements && !force) {
      console.log('AchievementContext: Skipping load, already loading')
      return
    }
    
    // Skip if we already have data and this isn't a forced refresh
    if (!force && state.currentGameAchievements.length > 0) {
      return
    }

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

        const earnedCount = result.achievements.filter(a => a.isEarned).length
        const totalCount = result.achievements.length
        const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0
        
        console.log('AchievementContext: Updated achievements for game', gameId, {
          achievementCount: totalCount,
          earnedCount,
          completionPercentage,
          progress: result.userProgress
        })
        
        // Check for milestone celebrations
        const currentMilestone = Math.floor(completionPercentage / 25) * 25
        if (currentMilestone > 0 && currentMilestone > state.milestoneData.lastMilestone && currentMilestone !== state.milestoneData.lastMilestone) {
          console.log('AchievementContext: Milestone reached:', currentMilestone + '%')
          dispatch({
            type: 'ADD_MILESTONE_CELEBRATION',
            milestone: currentMilestone,
            gameId,
            earnedCount,
            totalCount
          })
        }
        
        dispatch({
          type: 'SET_CURRENT_GAME_ACHIEVEMENTS',
          achievements: result.achievements,
          progress: result.userProgress
        })
        
        // Clear retry attempts on successful load
        dispatch({ type: 'CLEAR_RETRY_ATTEMPTS', gameId })
        // Reset circuit breaker on successful load
        dispatch({ type: 'CIRCUIT_BREAKER_SUCCESS' })
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

    } catch (error) {
      let errorMessage = error.message || 'Failed to load recent achievements'
      
      if (error.name === 'AbortError') {
        errorMessage = 'Recent achievements request timed out'
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limited - recent achievements will retry later'
      }
      
      console.error('Failed to load recent achievements:', error)
      dispatch({ type: 'SET_ERROR', key: 'recentAchievements', error: errorMessage })
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
    const timeSinceLastAchievement = state.milestoneData.streakData.lastAchievementTime 
      ? achievementTime - state.milestoneData.streakData.lastAchievementTime 
      : Infinity
    
    // Consider achievements within 1 hour as part of a streak
    const streakWindow = 60 * 60 * 1000 // 1 hour in milliseconds
    const newStreak = timeSinceLastAchievement <= streakWindow 
      ? state.milestoneData.streakData.currentStreak + 1 
      : 1
    
    const longestStreak = Math.max(newStreak, state.milestoneData.streakData.longestStreak)
    
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
    dispatch({ type: 'SET_CURRENT_GAME_ACHIEVEMENTS', achievements: [], progress: null })
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