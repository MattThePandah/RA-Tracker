import React, { useState, useCallback, useEffect } from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import AchievementPopup from './AchievementPopup.jsx'
import MilestoneCelebration from './MilestoneCelebration.jsx'
import ErrorBoundary, { ComponentErrorFallback } from './ErrorBoundary.jsx'
import soundManager from '../services/soundManager.js'

const AchievementNotificationManagerInner = () => {
  const { state } = useAchievements()
  const [activePopups, setActivePopups] = useState([])
  const [lastCheckedTimestamp, setLastCheckedTimestamp] = useState(Date.now())
  const [activeMilestone, setActiveMilestone] = useState(null)

  // Configuration from achievement settings
  const popupDuration = state.settings.popupDuration || 5000
  const enablePopups = state.settings.enablePopups !== false
  const enableMilestones = state.settings.enableMilestoneSounds !== false

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
      // Add new popups for each achievement
      newAchievements.forEach((achievement, index) => {
        // Stagger popup appearances slightly
        setTimeout(() => {
          addPopup(achievement)
        }, index * 500)
      })

      // Update last checked timestamp
      setLastCheckedTimestamp(Date.now())
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

  // Check for milestone celebrations
  useEffect(() => {
    if (!enableMilestones || state.milestoneData.milestonesReached.length === 0) {
      return
    }

    const latestMilestone = state.milestoneData.milestonesReached[state.milestoneData.milestonesReached.length - 1]
    
    // Show milestone celebration if it's new
    if (latestMilestone && (!activeMilestone || latestMilestone.timestamp > activeMilestone.timestamp)) {
      // Get current game info for the milestone
      const currentGame = state.currentGameAchievements.length > 0 ? {
        title: latestMilestone.gameTitle || 'Current Game'
      } : null

      setActiveMilestone({
        ...latestMilestone,
        gameTitle: currentGame?.title
      })
    }
  }, [state.milestoneData.milestonesReached, enableMilestones, activeMilestone])

  // Calculate positions to stack multiple popups
  const getPopupPosition = (index, total) => {
    const basePosition = 'top-right'
    const spacing = 120 // pixels between popups
    
    // For top positions, stack downward
    if (basePosition.includes('top')) {
      return {
        position: basePosition,
        style: {
          transform: `translateY(${index * spacing}px)`,
          zIndex: 1000 - index
        }
      }
    }
    
    // For bottom positions, stack upward
    return {
      position: basePosition,
      style: {
        transform: `translateY(-${index * spacing}px)`,
        zIndex: 1000 - index
      }
    }
  }

  // Show nothing if no popups and no milestone
  if ((!enablePopups || activePopups.length === 0) && (!activeMilestone || !enableMilestones)) {
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
      
      {/* Milestone celebration */}
      {activeMilestone && enableMilestones && (
        <MilestoneCelebration
          milestone={activeMilestone.milestone}
          gameTitle={activeMilestone.gameTitle}
          earnedCount={activeMilestone.earnedCount}
          totalCount={activeMilestone.totalCount}
          onClose={() => setActiveMilestone(null)}
          duration={6000}
        />
      )}
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
