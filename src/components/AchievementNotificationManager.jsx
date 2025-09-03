import React, { useState, useCallback, useEffect } from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import AchievementPopup from './AchievementPopup.jsx'
import ErrorBoundary, { ComponentErrorFallback } from './ErrorBoundary.jsx'
import soundManager from '../services/soundManager.js'

const AchievementNotificationManagerInner = () => {
  const { state } = useAchievements()
  const [activePopups, setActivePopups] = useState([])
  const [lastCheckedTimestamp, setLastCheckedTimestamp] = useState(Date.now())

  // Configuration from achievement settings
  const popupDuration = state.settings.popupDuration || 5000
  const enablePopups = state.settings.enablePopups !== false

  // Initialize sound manager once at mount
  useEffect(() => {
    if (!soundManager.initialized) {
      soundManager.initialize()
    }
    if (!soundManager.soundsLoaded) {
      soundManager.loadSounds()
    }
  }, [])

  // Check for new achievements from recent achievements list
  useEffect(() => {
    if (!enablePopups || state.recentAchievements.length === 0) {
      return
    }

    // Find achievements that are newer than our last check
    const newAchievements = state.recentAchievements.filter(achievement => {
      const achievementDate = new Date(achievement.date).getTime()
      return achievementDate > lastCheckedTimestamp
    })

    if (newAchievements.length > 0) {
      // For multiple achievements unlocked at once, show them with better spacing
      const staggerDelay = newAchievements.length > 3 ? 300 : 500 // Faster stagger for many achievements
      
      newAchievements.forEach((achievement, index) => {
        // Stagger popup appearances
        setTimeout(() => {
          addPopup(achievement)
        }, index * staggerDelay)
      })

      // Update last checked timestamp
      setLastCheckedTimestamp(Date.now())
      
      // Log multiple achievement unlock for debugging
      if (newAchievements.length > 1) {
        console.log(`AchievementNotificationManager: Multiple achievements unlocked (${newAchievements.length})`, 
          newAchievements.map(a => a.title))
      }
    }
  }, [state.recentAchievements, enablePopups, lastCheckedTimestamp])

  const addPopup = useCallback((achievement) => {
    const popupId = `${achievement.achievementId}-${achievement.date}`
    
    // Don't add duplicate popups
    if (activePopups.some(popup => popup.id === popupId)) {
      return
    }

    const newPopup = {
      id: popupId,
      achievement,
      timestamp: Date.now()
    }

    setActivePopups(current => [...current, newPopup])
  }, [activePopups])

  const removePopup = useCallback((popupId) => {
    setActivePopups(current => current.filter(popup => popup.id !== popupId))
  }, [])

  // Auto-cleanup old popups (backup in case onClose fails)
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now()
      setActivePopups(current => 
        current.filter(popup => now - popup.timestamp < popupDuration + 10000)
      )
    }, 10000)

    return () => clearInterval(cleanup)
  }, [popupDuration])


  // Calculate positions to stack multiple popups
  const getPopupPosition = (index, total) => {
    const basePosition = 'top-right'
    // Reduce spacing when many popups are shown simultaneously
    const spacing = total > 4 ? 100 : 120 // Tighter spacing for many popups
    
    // For top positions, stack downward
    if (basePosition.includes('top')) {
      return {
        position: basePosition,
        style: {
          transform: `translateY(${index * spacing}px)`,
          zIndex: 1000 - index,
          // Add slight offset for visual variety with many popups
          ...(total > 2 ? { marginRight: `${(index % 3) * 5}px` } : {})
        }
      }
    }
    
    // For bottom positions, stack upward
    return {
      position: basePosition,
      style: {
        transform: `translateY(-${index * spacing}px)`,
        zIndex: 1000 - index,
        ...(total > 2 ? { marginRight: `${(index % 3) * 5}px` } : {})
      }
    }
  }

  // Show nothing if no popups
  if (!enablePopups || activePopups.length === 0) {
    return null
  }

  return (
    <div className="achievement-notification-manager">
      {/* Achievement popups */}
      {enablePopups && activePopups.map((popup, index) => {
        const positionConfig = getPopupPosition(index, activePopups.length)
        
        return (
          <div
            key={popup.id}
            style={positionConfig.style}
            className="popup-container"
          >
            <AchievementPopup
              achievement={popup.achievement}
              onClose={() => removePopup(popup.id)}
              duration={popupDuration}
              position={positionConfig.position}
              showGameInfo={true}
              gameProgress={state.currentGameProgress}
            />
          </div>
        )
      })}
    </div>
  )
}

// Wrap with error boundary for better reliability
const AchievementNotificationManager = () => (
  <ErrorBoundary fallback={props => <ComponentErrorFallback {...props} componentName="Achievement Notifications" />}>
    <AchievementNotificationManagerInner />
  </ErrorBoundary>
)

export default AchievementNotificationManager
