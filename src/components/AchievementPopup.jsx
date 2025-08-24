import React, { useEffect, useState } from 'react'

const AchievementPopup = ({ 
  achievement, 
  onClose, 
  duration = 5000,
  position = 'top-right',
  showGameInfo = true 
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setIsVisible(true), 100)
    
    // Auto-close after duration
    const closeTimer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(() => {
        onClose()
      }, 500) // Animation duration
    }, duration)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(closeTimer)
    }
  }, [duration, onClose])

  const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.badgeName}.png`
  
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
      case 'top-center':
        return 'top-4 left-1/2 transform -translate-x-1/2'
      case 'bottom-center':
        return 'bottom-4 left-1/2 transform -translate-x-1/2'
      default:
        return 'top-4 right-4'
    }
  }

  return (
    <div 
      className={`
        achievement-popup 
        ${getPositionClasses()} 
        ${isVisible && !isLeaving ? 'visible' : ''} 
        ${isLeaving ? 'leaving' : ''}
        ${achievement.hardcoreMode ? 'hardcore' : ''}
      `}
      onClick={() => {
        setIsLeaving(true)
        setTimeout(onClose, 300)
      }}
    >
      <div className="popup-glow"></div>
      
      <div className="popup-header">
        <div className="popup-title">Achievement Unlocked!</div>
        {achievement.hardcoreMode && (
          <div className="hardcore-badge">HARDCORE</div>
        )}
      </div>
      
      <div className="popup-content">
        <div className="achievement-badge-image">
          <img src={badgeUrl} alt={achievement.title} />
        </div>
        
        <div className="achievement-info">
          <div className="achievement-name">{achievement.title}</div>
          <div className="achievement-desc">{achievement.description}</div>
          <div className="achievement-points">{achievement.points} points</div>
          
          {showGameInfo && achievement.gameTitle && (
            <div className="game-info">
              <span className="game-title">{achievement.gameTitle}</span>
              {achievement.consoleName && (
                <span className="game-console"> • {achievement.consoleName}</span>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="popup-footer">
        <div className="cumulative-score">Total: {achievement.cumulScore} points</div>
      </div>
      
      <div className="close-hint">Click to dismiss</div>
    </div>
  )
}

export default AchievementPopup