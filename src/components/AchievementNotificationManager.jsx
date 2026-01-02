import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAchievements } from '../context/AchievementContext.jsx'
import Achievement3DPopup from './Achievement3DPopup.jsx'
import ErrorBoundary, { ComponentErrorFallback } from './ErrorBoundary.jsx'
import soundManager from '../services/soundManager.js'

const AchievementNotificationManagerInner = ({ forceEnable = false } = {}) => {
  const { state } = useAchievements()
  const [activePopups, setActivePopups] = useState([])
  const [lastCheckedTimestamp, setLastCheckedTimestamp] = useState(Date.now())

  // Configuration from achievement settings
  const popupDuration = state.settings.popupDuration || 5000
  const enablePopups = forceEnable || state.settings.enablePopups !== false

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
    const basePosition = 'top-center'
    // Reduce spacing when many popups are shown simultaneously
    const spacing = total > 4 ? 100 : 120 // Tighter spacing for many popups

    if (basePosition.includes('top')) {
      return {
        position: basePosition,
        offsetY: index * spacing,
        zIndex: 1000 - index
      }
    }

    return {
      position: basePosition,
      offsetY: -index * spacing,
      zIndex: 1000 - index
    }
  }

  // Show nothing if no popups
  if (!enablePopups || activePopups.length === 0) {
    return null
  }

  const content = (
    <div className="achievement-notification-manager">
      {/* Achievement popups */}
      {enablePopups && activePopups.map((popup, index) => {
        const positionConfig = getPopupPosition(index, activePopups.length)
        
        return (
          <Achievement3DPopup
            key={popup.id}
            achievement={popup.achievement}
            onClose={() => removePopup(popup.id)}
            duration={popupDuration}
            position={positionConfig.position}
            offsetY={positionConfig.offsetY}
            zIndex={positionConfig.zIndex}
            showGameInfo={true}
            gameProgress={state.currentGameProgress}
            variant="card"
            theme="auto"
          />
        )
      })}
    </div>
  )

  if (typeof document === 'undefined') {
    return content
  }

  return createPortal(content, document.body)
}

// Wrap with error boundary for better reliability
const AchievementNotificationManager = ({ forceEnable = false } = {}) => (
  <ErrorBoundary fallback={props => <ComponentErrorFallback {...props} componentName="Achievement Notifications" />}>
    <AchievementNotificationManagerInner forceEnable={forceEnable} />
  </ErrorBoundary>
)

export default AchievementNotificationManager
