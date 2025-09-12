import React, { useState, useEffect, useMemo } from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import AchievementNotificationManager from '../components/AchievementNotificationManager.jsx'
import * as Storage from '../services/storage.js'
import * as RA from '../services/retroachievements.js'

function usePolling(callback, interval) {
  useEffect(() => {
    const id = setInterval(callback, interval)
    return () => clearInterval(id)
  }, [callback, interval])
}

function useStorageSync() {
  const [lastUpdate, setLastUpdate] = useState(0)
  
  useEffect(() => {
    const handleUpdate = () => setLastUpdate(Date.now())
    window.addEventListener('storage', handleUpdate)
    window.addEventListener('gameDataUpdated', handleUpdate)
    return () => {
      window.removeEventListener('storage', handleUpdate)
      window.removeEventListener('gameDataUpdated', handleUpdate)
    }
  }, [])
  
  return lastUpdate
}

function formatTime(seconds, longFormat = false) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  const hourStr = longFormat && hours >= 100 ? 
    hours.toString().padStart(3, '0') : 
    hours.toString().padStart(2, '0')
  
  return `${hourStr}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const ModernCoverLoader = ({ imageUrl, className = '', onLoad, fallback }) => {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(false)

    const loadCover = async () => {
      if (!imageUrl) {
        setUrl(null)
        setLoading(false)
        return
      }

      try {
        // Try local hashed covers first
        const urlBuffer = new TextEncoder().encode(imageUrl)
        const hashBuffer = await crypto.subtle.digest('SHA-1', urlBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        
        const base = import.meta.env.VITE_IGDB_PROXY_URL || ''
        const extensions = imageUrl.includes('retroachievements.org') ? ['.png', '.jpg'] : ['.jpg', '.png']
        
        for (const ext of extensions) {
          try {
            const localPath = base ? `${base}/covers/${hashHex}${ext}` : `/covers/${hashHex}${ext}`
            const response = await fetch(localPath, { method: 'HEAD' })
            if (response.ok && mounted) {
              setUrl(localPath)
              setLoading(false)
              onLoad?.()
              return
            }
          } catch {}
        }
        
        // Fallback to proxy or direct URL
        const finalUrl = base ? `${base}/cover?src=${encodeURIComponent(imageUrl)}` : imageUrl
        if (mounted) {
          setUrl(finalUrl)
          setLoading(false)
          onLoad?.()
        }
      } catch (err) {
        if (mounted) {
          setError(true)
          setLoading(false)
        }
      }
    }

    loadCover()
    
    return () => { mounted = false }
  }, [imageUrl, onLoad])

  if (loading) {
    return (
      <div className={`modern-cover-loader ${className}`}>
        <div className="cover-shimmer"></div>
      </div>
    )
  }

  if (error || !url) {
    return fallback || (
      <div className={`modern-cover-placeholder ${className}`}>
        <i className="bi bi-controller"></i>
        <span>No Cover</span>
      </div>
    )
  }

  return (
    <img 
      src={url} 
      alt="" 
      className={`modern-cover ${className}`}
      loading="lazy"
    />
  )
}

export default function ModernOverlayMain() {
  const { 
    state: achievementState, 
    loadGameAchievements, 
    isConfigured: raConfigured,
    clearCurrentGameData
  } = useAchievements()

  const params = useMemo(() => new URLSearchParams(location.search), [])
  const config = useMemo(() => ({
    poll: parseInt(params.get('poll') || '3000', 10),
    achievementPoll: parseInt(params.get('rapoll') || '30000', 10),
    style: params.get('style') || 'glass',
    theme: params.get('theme') || 'cyberpunk',
    showCover: params.get('showcover') !== '0',
    showYear: params.get('showyear') !== '0',
    showPublisher: params.get('showpublisher') !== '0',
    showAchievements: params.get('achievements') !== '0',
    showTimer: params.get('timer') !== '0',
    isClean: params.get('clean') === '1',
    timerSize: params.get('timersize') || 'normal',
    coverSize: params.get('coversize') || 'normal',
    animationLevel: params.get('animations') || 'normal', // 'minimal', 'normal', 'enhanced'
    enableParticles: params.get('particles') !== '0',
    glassTint: params.get('glasstint') || 'dark'
  }), [params])

  const [game, setGame] = useState(null)
  const [timers, setTimers] = useState({
    currentGame: '00:00:00',
    totalTime: '000:00:00'
  })
  const [stats, setStats] = useState({ total: 0, completed: 0, percent: 0 })
  const storageUpdate = useStorageSync()

  // Apply overlay styling
  useEffect(() => {
    if (config.isClean) {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [config.isClean])

  // Fetch current game
  const fetchCurrentGame = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      
      // Try server first
      const response = await fetch(`${base}/overlay/current`)
      if (response.ok) {
        const data = await response.json()
        setGame(data.current)
        return
      }
    } catch (error) {
      console.warn('Failed to fetch from server, using localStorage:', error.message)
    }

    // Fallback to localStorage
    try {
      const games = Storage.getGames()
      const currentId = Storage.getCurrentGameId()
      const currentGame = games.find(g => g.id === currentId) || null
      setGame(currentGame)
    } catch (error) {
      console.error('Failed to load current game:', error)
      setGame(null)
    }
  }, [])

  // Fetch timer data
  const fetchTimers = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const response = await fetch(`${base}/overlay/timers`)
      
      if (response.ok) {
        const data = await response.json()
        setTimers({
          currentGame: data.currentGameTime || '00:00:00',
          totalTime: (data.totalTime || data.psfestTime) || '000:00:00'
        })
      }
    } catch (error) {
      console.warn('Failed to fetch timers:', error)
      
      // Fallback calculation
      if (game?.date_started) {
        const elapsed = Math.floor((Date.now() - new Date(game.date_started).getTime()) / 1000)
        setTimers(prev => ({
          ...prev,
          currentGame: formatTime(Math.max(0, elapsed))
        }))
      }
    }
  }, [game])

  // Fetch stats
  const fetchStats = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const response = await fetch(`${base}/overlay/stats`)
      
      if (response.ok) {
        const data = await response.json()
        setStats({
          total: data.total || 0,
          completed: data.completed || 0,
          percent: data.percent || 0
        })
      }
    } catch (error) {
      console.warn('Failed to fetch stats:', error)
    }
  }, [])

  // Polling setup
  usePolling(fetchCurrentGame, config.poll)
  usePolling(fetchTimers, 1000) // Update timers every second
  usePolling(fetchStats, 5000)

  // Achievement handling
  useEffect(() => {
    if (!game?.id || !config.showAchievements) return
    
    clearCurrentGameData()
    
    if (RA.hasRetroAchievementsSupport(game) && raConfigured) {
      loadGameAchievements(game.id, true)
    }
  }, [game?.id, config.showAchievements, raConfigured])

  // Achievement polling
  usePolling(() => {
    if (game?.id && RA.hasRetroAchievementsSupport(game) && raConfigured && config.showAchievements) {
      if (!achievementState.loading?.gameAchievements) {
        loadGameAchievements(game.id, true)
      }
    }
  }, config.achievementPoll)

  // Theme classes
  const themeClasses = {
    cyberpunk: 'theme-cyberpunk',
    neon: 'theme-neon',
    quantum: 'theme-quantum',
    minimal: 'theme-minimal',
    gaming: 'theme-gaming'
  }

  const themeClass = themeClasses[config.theme] || themeClasses.cyberpunk

  if (!game) {
    return (
      <div className={`modern-overlay-container ${themeClass} ${config.glassTint}`}>
        <div className="no-game-state">
          <div className="no-game-icon">
            <i className="bi bi-controller"></i>
          </div>
          <h3>No Game Selected</h3>
          <p>Select a game to start tracking</p>
        </div>
        {config.enableParticles && <div className="particle-background"></div>}
      </div>
    )
  }

  const achievements = achievementState.currentGameAchievements || []
  const earnedCount = achievements.filter(a => a.isEarned).length
  const totalAchievements = achievements.length
  const achievementPercent = totalAchievements > 0 ? Math.round((earnedCount / totalAchievements) * 100) : 0

  return (
    <>
      <div className={`modern-overlay-container ${config.style} ${themeClass} ${config.glassTint}`}>
        {config.enableParticles && <div className="particle-background"></div>}
        
        <div className="modern-overlay-content">
          {/* Main Game Card */}
          <div className="modern-game-card">
            <div className="game-card-glow"></div>
            
            {config.showCover && (
              <div className={`game-cover-container ${config.coverSize}`}>
                <ModernCoverLoader
                  imageUrl={game.image_url}
                  className="game-cover"
                />
              </div>
            )}
            
            <div className="game-info">
              <h1 className="game-title">{game.title}</h1>
              <div className="game-meta">
                <span className="console">{game.console}</span>
                {config.showYear && game.release_year && (
                  <span className="year">• {game.release_year}</span>
                )}
                {config.showPublisher && game.publisher && (
                  <span className="publisher">• {game.publisher}</span>
                )}
              </div>
              
              {game.status && (
                <div className="game-status">
                  <span className={`status-badge ${game.status.toLowerCase().replace(' ', '-')}`}>
                    {game.status}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Achievements Section */}
          {config.showAchievements && raConfigured && RA.hasRetroAchievementsSupport(game) && (
            <div className="achievements-section">
              {achievementState.loading?.gameAchievements ? (
                <div className="achievements-loading">
                  <div className="loading-pulse"></div>
                  <span>Loading achievements...</span>
                </div>
              ) : totalAchievements > 0 ? (
                <div className="achievements-display">
                  <div className="achievement-progress">
                    <div className="progress-ring">
                      <svg viewBox="0 0 36 36" className="circular-chart">
                        <path 
                          className="circle-bg"
                          d="M18 2.0845
                             a 15.9155 15.9155 0 0 1 0 31.831
                             a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path 
                          className="circle"
                          strokeDasharray={`${achievementPercent}, 100`}
                          d="M18 2.0845
                             a 15.9155 15.9155 0 0 1 0 31.831
                             a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <text x="18" y="20.35" className="percentage">{achievementPercent}%</text>
                      </svg>
                    </div>
                    <div className="progress-text">
                      <span className="earned">{earnedCount}</span>
                      <span className="separator">/</span>
                      <span className="total">{totalAchievements}</span>
                      <span className="label">Achievements</span>
                    </div>
                  </div>
                  
                  <div className="recent-badges">
                    {achievements
                      .filter(a => a.isEarned)
                      .sort((a, b) => new Date(b.dateEarned) - new Date(a.dateEarned))
                      .slice(0, 6)
                      .map(achievement => (
                        <div key={achievement.id} className="badge-mini">
                          <img 
                            src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`}
                            alt={achievement.title}
                            title={`${achievement.title} • ${achievement.points} pts`}
                          />
                          {achievement.isEarnedHardcore && <div className="hardcore-dot"></div>}
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="no-achievements">
                  <i className="bi bi-trophy"></i>
                  <span>No achievements available</span>
                </div>
              )}
            </div>
          )}

          {/* Timer Section */}
          {config.showTimer && (
            <div className={`timer-section ${config.timerSize}`}>
              <div className="timer-card current">
                <div className="timer-label">Current Session</div>
                <div className="timer-value">{timers.currentGame}</div>
              </div>
              <div className="timer-card total">
                <div className="timer-label">Total Time</div>
                <div className="timer-value">{timers.totalTime}</div>
              </div>
            </div>
          )}

          {/* Stats Overlay */}
          <div className="stats-overlay">
            <div className="stat-item">
              <span className="stat-label">Game</span>
              <span className="stat-value">{(stats.completed || 0) + 1}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Progress</span>
              <span className="stat-value">{stats.percent}%</span>
            </div>
          </div>
        </div>
      </div>
      
      <AchievementNotificationManager />
    </>
  )
}
