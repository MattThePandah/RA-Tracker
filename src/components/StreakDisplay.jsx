import React, { useEffect, useState } from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'

const StreakDisplay = ({ position = 'top-left', compact = false }) => {
  const { state } = useAchievements()
  const [isVisible, setIsVisible] = useState(false)
  const [lastStreak, setLastStreak] = useState(0)

  const currentStreak = state.milestoneData.streakData.currentStreak
  const longestStreak = state.milestoneData.streakData.longestStreak

  useEffect(() => {
    // Show streak display when streak is active (3 or more)
    if (currentStreak >= 3) {
      setIsVisible(true)
      
      // Flash effect when streak increases
      if (currentStreak > lastStreak) {
        const element = document.querySelector('.streak-display')
        if (element) {
          element.classList.add('streak-flash')
          setTimeout(() => {
            element.classList.remove('streak-flash')
          }, 500)
        }
      }
    } else {
      // Hide after a delay to show the streak ended
      if (lastStreak >= 3) {
        setTimeout(() => setIsVisible(false), 3000)
      } else {
        setIsVisible(false)
      }
    }

    setLastStreak(currentStreak)
  }, [currentStreak, lastStreak])

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4'
      case 'top-right':
        return 'top-4 right-4'
      case 'bottom-left':
        return 'bottom-4 left-4'
      case 'bottom-right':
        return 'bottom-4 right-4'
      default:
        return 'top-4 left-4'
    }
  }

  const getStreakEmoji = (streak) => {
    if (streak >= 10) return '💎'
    if (streak >= 7) return '🔥'
    if (streak >= 5) return '⚡'
    if (streak >= 3) return '🌟'
    return '✨'
  }

  const getStreakColor = (streak) => {
    if (streak >= 10) return '#E91E63' // Pink
    if (streak >= 7) return '#FF5722'  // Deep Orange
    if (streak >= 5) return '#FF9800'  // Orange
    if (streak >= 3) return '#FFC107'  // Amber
    return '#4CAF50' // Green
  }

  const getStreakTitle = (streak) => {
    if (streak >= 10) return 'LEGENDARY STREAK!'
    if (streak >= 7) return 'EPIC STREAK!'
    if (streak >= 5) return 'GREAT STREAK!'
    if (streak >= 3) return 'Achievement Streak!'
    return 'Streak Active!'
  }

  if (!isVisible) {
    return null
  }

  const streakColor = getStreakColor(currentStreak)

  return (
    <div 
      className={`streak-display ${getPositionClasses()} ${compact ? 'compact' : ''}`}
      style={{ '--streak-color': streakColor }}
    >
      <div className="streak-glow"></div>
      
      {!compact && (
        <div className="streak-header">
          <span className="streak-emoji">{getStreakEmoji(currentStreak)}</span>
          <span className="streak-title">{getStreakTitle(currentStreak)}</span>
        </div>
      )}
      
      <div className="streak-counter">
        <div className="streak-number">{currentStreak}</div>
        <div className="streak-label">
          {compact ? 'Streak' : 'Achievement Streak'}
        </div>
      </div>
      
      {!compact && longestStreak > currentStreak && (
        <div className="streak-best">
          Best: {longestStreak}
        </div>
      )}
      
      {currentStreak < 3 && lastStreak >= 3 && (
        <div className="streak-ended">
          Streak Ended at {lastStreak}
        </div>
      )}
    </div>
  )
}

export default StreakDisplay