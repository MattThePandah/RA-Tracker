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
    tickerSpeed: 30
  },
  loading: {
    gameAchievements: false,
    recentAchievements: false,
    userProgress: false
  },
  errors: {}
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

    // Don't reload if already loading or already have data (unless forced)
    if (state.loading.gameAchievements || (!force && state.currentGameAchievements.length > 0)) {
      return
    }

    dispatch({ type: 'SET_LOADING', key: 'gameAchievements', loading: true })
    dispatch({ type: 'CLEAR_ERROR', key: 'gameAchievements' })

    try {
      const raGameId = RA.extractGameIdFromInternalId(gameId)
      if (!raGameId) {
        throw new Error('Invalid game ID format for RetroAchievements')
      }

      const result = await RA.getGameInfoAndUserProgress({
        apiKey,
        username,
        gameId: raGameId,
        includeAwards: true
      })

      dispatch({
        type: 'SET_CURRENT_GAME_ACHIEVEMENTS',
        achievements: result.achievements,
        progress: result.userProgress
      })

    } catch (error) {
      console.error('Failed to load game achievements:', error)
      dispatch({ type: 'SET_ERROR', key: 'gameAchievements', error: error.message })
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

    dispatch({ type: 'SET_LOADING', key: 'recentAchievements', loading: true })
    dispatch({ type: 'CLEAR_ERROR', key: 'recentAchievements' })

    try {
      const achievements = await RA.getRecentAchievements({
        apiKey,
        username,
        count
      })

      dispatch({ type: 'SET_RECENT_ACHIEVEMENTS', achievements })

    } catch (error) {
      console.error('Failed to load recent achievements:', error)
      dispatch({ type: 'SET_ERROR', key: 'recentAchievements', error: error.message })
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