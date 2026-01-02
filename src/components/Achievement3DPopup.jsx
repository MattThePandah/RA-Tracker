import React, { useEffect, useState, useRef, useMemo } from 'react'
import soundManager from '../services/soundManager.js'

const Achievement3DPopup = ({ 
  achievement, 
  onClose, 
  duration = 6000,
  position = 'top-right',
  showGameInfo = true,
  gameProgress = null,
  variant = 'card',
  theme = 'cyberpunk',
  offsetY = 0,
  zIndex
}) => {
  const [phase, setPhase] = useState('entering') // entering, displaying, celebrating, leaving
  const [particles, setParticles] = useState([])
  const popupRef = useRef(null)
  const celebrationRef = useRef(null)
  const animationFrameRef = useRef(null)

  const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.badgeName}.png`
  
  // Theme configurations
  const themes = {
    cyberpunk: {
      primary: '#00ff88',
      secondary: '#44aaff', 
      accent: '#ff3366',
      bg: 'rgba(0, 17, 34, 0.95)',
      particle: '#00ff88'
    },
    neon: {
      primary: '#ff0080',
      secondary: '#00ffff',
      accent: '#ff8800', 
      bg: 'rgba(42, 8, 69, 0.95)',
      particle: '#ff44cc'
    },
    quantum: {
      primary: '#4a90ff',
      secondary: '#7c3aed',
      accent: '#06b6d4',
      bg: 'rgba(15, 25, 53, 0.95)',
      particle: '#60a5fa'
    },
    golden: {
      primary: '#ffd700',
      secondary: '#ffaa00',
      accent: '#ff6600',
      bg: 'rgba(51, 34, 0, 0.95)',
      particle: '#ffd700'
    }
  }

  const currentTheme = themes[theme] || themes.cyberpunk
  
  // Determine rarity-based theme
  const rarityTheme = useMemo(() => {
    const points = achievement.points || 0
    if (points >= 50) return themes.golden
    if (points >= 25) return themes.quantum  
    if (points >= 10) return themes.neon
    return themes.cyberpunk
  }, [achievement.points])

  const finalTheme = theme === 'auto' ? rarityTheme : currentTheme

  // Generate particle system
  const generateParticles = (count = 30) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 400,
      y: Math.random() * 300,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      life: 1,
      decay: 0.008 + Math.random() * 0.005,
      size: 2 + Math.random() * 4,
      color: finalTheme.particle,
      type: Math.random() > 0.7 ? 'star' : 'circle'
    }))
  }

  // Initialize
  useEffect(() => {
    // Initialize sound manager
    if (!soundManager.initialized) {
      soundManager.initialize()
    }
    if (!soundManager.soundsLoaded) {
      soundManager.loadSounds()
    }

    // Play achievement sound with enhanced audio
    soundManager.playAchievementSound(achievement, gameProgress)

    // Generate particles for celebration
    if (achievement.points >= 25) { // Bigger celebration for higher point achievements
      setParticles(generateParticles(50))
    } else if (achievement.points >= 10) {
      setParticles(generateParticles(35))
    } else {
      setParticles(generateParticles(25))
    }

    // Phase transitions
    const enteringTimer = setTimeout(() => setPhase('displaying'), 800)
    const celebratingTimer = setTimeout(() => {
      setPhase('celebrating')
      setParticles(prev => [...prev, ...generateParticles(20)])
    }, 1500)
    const leavingTimer = setTimeout(() => setPhase('leaving'), duration - 1000)
    const closeTimer = setTimeout(onClose, duration)

    return () => {
      clearTimeout(enteringTimer)
      clearTimeout(celebratingTimer)
      clearTimeout(leavingTimer)
      clearTimeout(closeTimer)
    }
  }, [duration, onClose, achievement, gameProgress])

  // Particle animation loop
  useEffect(() => {
    if (particles.length === 0) return

    const animate = () => {
      setParticles(prevParticles => {
        return prevParticles
          .map(particle => ({
            ...particle,
            x: particle.x + particle.vx,
            y: particle.y + particle.vy,
            vy: particle.vy + 0.1, // gravity
            life: particle.life - particle.decay,
            vx: particle.vx * 0.99 // air resistance
          }))
          .filter(particle => particle.life > 0 && particle.y < 400)
      })

      if (phase === 'displaying' || phase === 'celebrating') {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [particles.length, phase])

  const getPositionClasses = () => {
    const positions = {
      'top-left': 'popup-top-left',
      'top-right': 'popup-top-right', 
      'top-center': 'popup-top-center',
      'bottom-left': 'popup-bottom-left',
      'bottom-right': 'popup-bottom-right',
      'bottom-center': 'popup-bottom-center',
      'center': 'popup-center'
    }
    return positions[position] || positions['top-right']
  }

  const rarityClass = useMemo(() => {
    const points = achievement.points || 0
    if (points >= 50) return 'legendary'
    if (points >= 25) return 'epic'  
    if (points >= 10) return 'rare'
    return 'common'
  }, [achievement.points])

  const inlineStyle = {
    '--theme-primary': finalTheme.primary,
    '--theme-secondary': finalTheme.secondary,
    '--theme-accent': finalTheme.accent,
    '--theme-bg': finalTheme.bg
  }

  if (offsetY !== 0) {
    inlineStyle.marginTop = `${offsetY}px`
  }

  if (typeof zIndex === 'number') {
    inlineStyle.zIndex = zIndex
  }

  if (variant === 'minimal') {
    return (
      <div 
        ref={popupRef}
        className={`achievement-3d-popup minimal ${getPositionClasses()} ${phase} ${rarityClass}`}
        onClick={onClose}
        style={inlineStyle}
      >
        <div className="popup-minimal-content">
          <img src={badgeUrl} alt={achievement.title} className="badge-mini" />
          <div className="achievement-text">
            <span className="achievement-title">{achievement.title}</span>
            <span className="achievement-points">{achievement.points} pts</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div 
        ref={popupRef}
        className={`achievement-3d-popup ${getPositionClasses()} ${phase} ${rarityClass} ${achievement.hardcoreMode ? 'hardcore' : ''}`}
        onClick={onClose}
        style={inlineStyle}
      >
        {/* Particle System */}
        <div className="particle-container">
          {particles.map(particle => (
            <div
              key={particle.id}
              className={`particle ${particle.type}`}
              style={{
                left: `${particle.x}px`,
                top: `${particle.y}px`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                opacity: particle.life,
                backgroundColor: particle.color,
                boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`
              }}
            />
          ))}
        </div>

        {/* 3D Card Container */}
        <div className="popup-3d-container">
          <div className="popup-3d-card">
            <div className="card-glow"></div>
            <div className="card-front">
              {/* Header */}
              <div className="popup-header">
                <div className="unlock-text">
                  {achievement.hardcoreMode ? '🏆 HARDCORE UNLOCK!' : '🎯 ACHIEVEMENT UNLOCKED!'}
                </div>
                {achievement.hardcoreMode && <div className="hardcore-badge">HARDCORE</div>}
                <div className="rarity-indicator">{rarityClass.toUpperCase()}</div>
              </div>

              {/* Main Content */}
              <div className="popup-content">
                <div className="badge-container">
                  <div className="badge-frame">
                    <img src={badgeUrl} alt={achievement.title} className="achievement-badge" />
                    <div className="badge-shine"></div>
                    {achievement.hardcoreMode && <div className="hardcore-overlay"></div>}
                  </div>
                </div>

                <div className="achievement-info">
                  <h3 className="achievement-name">{achievement.title}</h3>
                  <p className="achievement-desc">{achievement.description}</p>
                  
                  <div className="achievement-meta">
                    <div className="points-display">
                      <span className="points-value">{achievement.points}</span>
                      <span className="points-label">points</span>
                    </div>
                    
                    {showGameInfo && achievement.gameTitle && (
                      <div className="game-info">
                        <span className="game-title">{achievement.gameTitle}</span>
                        {achievement.consoleName && (
                          <span className="console-name">{achievement.consoleName}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer with progress */}
              <div className="popup-footer">
                <div className="progress-info">
                  {gameProgress && (
                    <div className="game-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${(gameProgress.numAchieved / gameProgress.numPossibleAchievements) * 100}%` }}
                        ></div>
                      </div>
                      <span className="progress-text">
                        {gameProgress.numAchieved} / {gameProgress.numPossibleAchievements}
                      </span>
                    </div>
                  )}
                  <div className="cumulative-score">
                    Total: {achievement.cumulScore?.toLocaleString()} pts
                  </div>
                </div>
              </div>
            </div>

            {/* Card back for flip animation */}
            <div className="card-back">
              <div className="stats-display">
                <h4>Achievement Stats</h4>
                <div className="stat-item">
                  <span className="stat-label">Earned:</span>
                  <span className="stat-value">{new Date(achievement.date).toLocaleDateString()}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Rarity:</span>
                  <span className="stat-value">{rarityClass}</span>
                </div>
                {achievement.hardcoreMode && (
                  <div className="stat-item hardcore">
                    <span className="stat-label">Mode:</span>
                    <span className="stat-value">Hardcore</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Celebration Effects */}
        {phase === 'celebrating' && (
          <div ref={celebrationRef} className="celebration-effects">
            <div className="explosion-ring"></div>
            <div className="sparkle-burst"></div>
          </div>
        )}

        <div className="close-hint">Click to dismiss • Auto-close in {Math.ceil((duration - Date.now()) / 1000)}s</div>
      </div>
    </>
  )
}

export default Achievement3DPopup
