import React, { useEffect, useState } from 'react'
import soundManager from '../services/soundManager.js'

const MilestoneCelebration = ({ 
  milestone, 
  gameTitle,
  earnedCount,
  totalCount,
  onClose, 
  duration = 6000
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [particles, setParticles] = useState([])

  useEffect(() => {
    // Play milestone sound
    if (milestone === 100) {
      soundManager.playSound('milestone100')
    } else if (milestone === 75) {
      soundManager.playSound('milestone75')
    } else if (milestone === 50) {
      soundManager.playSound('milestone50')
    } else if (milestone === 25) {
      soundManager.playSound('milestone25')
    }
    
    // Create celebration particles
    const particleCount = milestone === 100 ? 50 : Math.max(20, milestone / 2)
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      color: getMilestoneColor(milestone),
      size: 4 + Math.random() * 8
    }))
    setParticles(newParticles)
    
    // Animate in
    const showTimer = setTimeout(() => setIsVisible(true), 200)
    
    // Auto-close after duration
    const closeTimer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(() => {
        onClose()
      }, 800)
    }, duration)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(closeTimer)
    }
  }, [milestone, gameTitle, duration, onClose])

  const getMilestoneColor = (milestone) => {
    switch (milestone) {
      case 25: return '#4CAF50' // Green
      case 50: return '#FF9800' // Orange
      case 75: return '#9C27B0' // Purple
      case 100: return '#FFD700' // Gold
      default: return '#2196F3' // Blue
    }
  }

  const getMilestoneTitle = (milestone) => {
    switch (milestone) {
      case 25: return 'Quarter Complete!'
      case 50: return 'Halfway There!'
      case 75: return 'Almost Done!'
      case 100: return '🏆 100% COMPLETE! 🏆'
      default: return `${milestone}% Complete!`
    }
  }

  const getMilestoneEmoji = (milestone) => {
    switch (milestone) {
      case 25: return '🌱'
      case 50: return '⚡'
      case 75: return '🔥'
      case 100: return '👑'
      default: return '🎉'
    }
  }

  return (
    <div 
      className={`milestone-celebration ${isVisible && !isLeaving ? 'visible' : ''} ${isLeaving ? 'leaving' : ''}`}
      onClick={() => {
        setIsLeaving(true)
        setTimeout(onClose, 400)
      }}
    >
      {/* Celebration particles */}
      <div className="celebration-particles">
        {particles.map(particle => (
          <div
            key={particle.id}
            className="celebration-particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              backgroundColor: particle.color,
              width: `${particle.size}px`,
              height: `${particle.size}px`
            }}
          />
        ))}
      </div>
      
      {/* Main celebration content */}
      <div className="milestone-content">
        <div className="milestone-emoji">{getMilestoneEmoji(milestone)}</div>
        <div className="milestone-title">{getMilestoneTitle(milestone)}</div>
        
        {gameTitle && (
          <div className="milestone-game">{gameTitle}</div>
        )}
        
        <div className="milestone-stats">
          <div className="milestone-progress">
            <div 
              className="milestone-progress-bar" 
              style={{ 
                width: `${milestone}%`,
                backgroundColor: getMilestoneColor(milestone)
              }}
            />
          </div>
          <div className="milestone-numbers">
            {earnedCount} of {totalCount} achievements ({milestone}%)
          </div>
        </div>
        
        {milestone === 100 && (
          <div className="completion-bonus">
            <div className="bonus-text">🎊 GAME MASTERED! 🎊</div>
            <div className="bonus-subtext">All achievements unlocked!</div>
          </div>
        )}
      </div>
      
      <div className="milestone-close-hint">Click to dismiss</div>
    </div>
  )
}

export default MilestoneCelebration