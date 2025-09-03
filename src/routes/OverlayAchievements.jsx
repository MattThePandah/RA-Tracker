import React from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'
import AchievementNotificationManager from '../components/AchievementNotificationManager.jsx'
import * as Storage from '../services/storage.js'
import * as RA from '../services/retroachievements.js'

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

function useStorageListener() {
  const [lastUpdate, setLastUpdate] = React.useState(0)
  
  React.useEffect(() => {
    const handleStorageChange = () => {
      setLastUpdate(Date.now())
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('gameDataUpdated', handleStorageChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('gameDataUpdated', handleStorageChange)
    }
  }, [])
  
  return lastUpdate
}

const AchievementBadge = ({ achievement, compact = false }) => {
  const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.badgeName}.png`
  
  if (compact) {
    return (
      <div className={`achievement-badge compact ${achievement.isEarned ? 'earned' : 'locked'}`}>
        <img src={badgeUrl} alt={achievement.title} title={`${achievement.title} - ${achievement.description} (${achievement.points} pts)`} />
        {achievement.isEarnedHardcore && <div className="hardcore-indicator">H</div>}
      </div>
    )
  }

  return (
    <div className={`achievement-badge ${achievement.isEarned ? 'earned' : 'locked'}`}>
      <div className="badge-image">
        <img src={badgeUrl} alt={achievement.title} />
        {achievement.isEarnedHardcore && <div className="hardcore-indicator">HARDCORE</div>}
      </div>
      <div className="badge-info">
        <div className="achievement-title">{achievement.title}</div>
        <div className="achievement-description">{achievement.description}</div>
        <div className="achievement-points">{achievement.points} points</div>
        {achievement.isEarned && (
          <div className="earned-date">
            Earned: {new Date(achievement.dateEarned).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  )
}

const ProgressBar = ({ current, total, label, hardcore = false }) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0
  
  return (
    <div className={`progress-container ${hardcore ? 'hardcore' : ''}`}>
      <div className="progress-label">
        <span>{label}</span>
        <span>{current}/{total} ({percentage}%)</span>
      </div>
      <div className="progress-bar-bg">
        <div 
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export default function OverlayAchievements() {
  const { 
    state, 
    loadGameAchievements, 
    isConfigured,
    getUnlockRate,
    getHardcoreUnlockRate,
    isInHardcoreMode
  } = useAchievements()

  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const achievementPoll = parseInt(params.get('rapoll') || '60000', 10) // Default 60 seconds for achievements
  const style = (params.get('style') || 'progress').toLowerCase() // 'progress' | 'grid' | 'recent' | 'tracker'
  const showHardcore = params.get('hardcore') !== '0'
  const compact = params.get('compact') === '1'
  const isClean = params.get('clean') === '1'
  const maxAchievements = params.get('max') ? parseInt(params.get('max'), 10) : null

  const tick = usePoll(poll)
  const storageUpdate = useStorageListener()

  const [game, setGame] = React.useState(null)

  // Apply clean overlay styling to document body
  React.useEffect(() => {
    if (isClean) {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [isClean])

  // Load current game from storage or server
  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const tryFetch = async () => {
      let g = null
      
      // Prioritize server for OBS compatibility
      try {
        const res = await fetch(`${base}/overlay/current`)
        if (res.ok) {
          const json = await res.json()
          g = json?.current || null
          if (g) {
            setGame(g)
            return
          }
        }
      } catch (err) {
        console.log('Server current failed, falling back to localStorage:', err.message)
      }
      
      // Fallback to localStorage
      try {
        let games = Storage.getGames()
        let curId = Storage.getCurrentGameId()
        g = games.find(x => x.id === curId) || null
        setGame(g)
      } catch (storageErr) {
        console.log('localStorage fallback failed:', storageErr.message)
        setGame(null)
      }
    }
    tryFetch()
  }, [tick, storageUpdate])

  // Track game ID separately to avoid reloading achievements on every game object update
  const [currentGameId, setCurrentGameId] = React.useState(null)
  
  // Load achievements when game ID changes (not game object)
  React.useEffect(() => {
    const newGameId = game?.id || null
    console.log('OverlayAchievements Debug:', {
      game: game?.title,
      gameId: newGameId,
      currentGameId,
      hasRASupport: game ? RA.hasRetroAchievementsSupport(game) : false,
      isConfigured,
      achievementsCount: state.currentGameAchievements.length
    })
    
    if (newGameId !== currentGameId) {
      setCurrentGameId(newGameId)
      if (newGameId && game && RA.hasRetroAchievementsSupport(game) && isConfigured) {
        loadGameAchievements(newGameId, true) // Only reload when game ID actually changes
      }
    }
  }, [game?.id, currentGameId, isConfigured, loadGameAchievements])

  // Poll for achievement updates at regular intervals
  React.useEffect(() => {
    if (!currentGameId || !game || !RA.hasRetroAchievementsSupport(game) || !isConfigured) {
      console.log('Achievement overlay: Skipping achievement polling', { currentGameId, hasRA: !!game && RA.hasRetroAchievementsSupport(game), isConfigured, achievementPoll })
      return
    }
    
    console.log('Achievement overlay: Setting up achievement polling every', achievementPoll, 'ms')
    const achievementPollInterval = setInterval(() => {
      console.log('Achievement overlay: Polling achievements for game', currentGameId)
      // Only poll if not currently loading and we have a game
      if (currentGameId && !state.loading?.gameAchievements) {
        loadGameAchievements(currentGameId, true) // Force refresh to get latest achievement state
      }
    }, achievementPoll) // Use separate, longer poll interval for achievements
    
    return () => {
      console.log('Achievement overlay: Clearing achievement polling interval')
      clearInterval(achievementPollInterval)
    }
  }, [currentGameId, isConfigured, achievementPoll]) // Use currentGameId instead of game object

  // Don't show anything if not configured
  if (!isConfigured) {
    return (
      <>
        <div className={`overlay-chrome p-3 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="text-center">
            <div className="text-warning">RetroAchievements not configured</div>
            <div className="small text-secondary">Configure username and API key in Settings</div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  // Don't show anything if no current game
  if (!game) {
    return (
      <>
        <div className={`overlay-chrome p-3 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="text-center text-secondary">No current game</div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  // Don't show anything if game doesn't support RetroAchievements
  if (!RA.hasRetroAchievementsSupport(game)) {
    return (
      <>
        <div className={`overlay-chrome p-3 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="text-center text-secondary">
            <div>Current game doesn't support RetroAchievements</div>
            <div className="small mt-1">Game: {game?.title || 'None'} (ID: {game?.id || 'None'})</div>
            <div className="small">Sync RetroAchievements games from Settings first</div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  const { currentGameAchievements, currentGameProgress, loading } = state

  if (loading.gameAchievements) {
    return (
      <>
        <div className={`overlay-chrome p-3 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="text-center">Loading achievements...</div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  if (!currentGameAchievements.length) {
    return (
      <>
        <div className={`overlay-chrome p-3 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="text-center text-secondary">No achievements available</div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  if (style === 'progress') {
    return (
      <>
        <div className={`overlay-chrome achievement-progress p-4 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="achievement-overlay-container">
            <div className="game-header">
              <div className="game-title">{game.title}</div>
              <div className="game-console">{game.console}</div>
              {isInHardcoreMode() && (
                <div className="hardcore-mode-badge">HARDCORE MODE</div>
              )}
            </div>
            
            <div className="progress-section">
              <ProgressBar 
                current={currentGameProgress?.numAchieved || currentGameAchievements.filter(a => a.isEarned).length}
                total={currentGameProgress?.numPossibleAchievements || currentGameAchievements.length}
                label="Achievement Progress"
                hardcore={true}
              />
            </div>

            <div className="stats-section">
              <div className="stat">
                <div className="stat-value">{currentGameProgress?.scoreAchieved || currentGameAchievements.filter(a => a.isEarned).reduce((sum, a) => sum + a.points, 0)}</div>
                <div className="stat-label">Points Earned</div>
              </div>
              <div className="stat">
                <div className="stat-value">{currentGameProgress?.possibleScore || currentGameAchievements.reduce((sum, a) => sum + a.points, 0)}</div>
                <div className="stat-label">Total Points</div>
              </div>
              <div className="stat">
                <div className="stat-value">{currentGameProgress?.completionPercentage || Math.round((currentGameAchievements.filter(a => a.isEarned).length / Math.max(1, currentGameAchievements.length)) * 100)}%</div>
                <div className="stat-label">Completion</div>
              </div>
            </div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  if (style === 'grid') {
    // Show achievements in a grid format
    console.log('Grid Style Debug:', {
      currentGameAchievements: currentGameAchievements.length,
      currentGameProgress,
      progressNumAchieved: currentGameProgress?.numAchieved,
      progressNumPossible: currentGameProgress?.numPossibleAchievements,
      game: game?.title
    })
    
    const displayAchievements = currentGameAchievements
      .sort((a, b) => {
        // Sort by earned status, then by display order
        if (a.isEarned !== b.isEarned) return b.isEarned - a.isEarned
        return a.displayOrder - b.displayOrder
      })
    
    // Only apply max limit if specified
    const finalAchievements = maxAchievements ? displayAchievements.slice(0, maxAchievements) : displayAchievements

    return (
      <div className={`overlay-chrome achievement-grid p-4 ${isClean ? 'overlay-clean' : ''}`}>
        <div className="achievement-overlay-container">
          <div className="game-header">
            <div className="game-title">{game.title}</div>
            <div className="achievement-count">
              {currentGameProgress?.numAchieved || currentGameAchievements.filter(a => a.isEarned).length} / {currentGameProgress?.numPossibleAchievements || currentGameAchievements.length} achievements
            </div>
          </div>
          
          <div className={`achievements-grid ${compact ? 'compact' : ''}`}>
            {finalAchievements.map(achievement => (
              <AchievementBadge 
                key={achievement.id} 
                achievement={achievement} 
                compact={compact}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (style === 'recent') {
    // Show recently earned achievements
    const allRecentEarned = currentGameAchievements
      .filter(a => a.isEarned)
      .sort((a, b) => new Date(b.dateEarned) - new Date(a.dateEarned))
    
    // Only apply max limit if specified
    const recentEarned = maxAchievements ? allRecentEarned.slice(0, maxAchievements) : allRecentEarned

    return (
      <>
        <div className={`overlay-chrome achievement-recent p-4 ${isClean ? 'overlay-clean' : ''}`}>
          <div className="achievement-overlay-container">
            <div className="section-header">
              <div className="section-title">Recent Achievements</div>
              <div className="section-subtitle">{game.title}</div>
            </div>
            
            <div className="recent-achievements">
              {recentEarned.length === 0 ? (
                <div className="text-center text-secondary">No achievements earned yet</div>
              ) : (
                recentEarned.map(achievement => (
                  <AchievementBadge key={achievement.id} achievement={achievement} />
                ))
              )}
            </div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  if (style === 'tracker') {
    // Get the most recent achievement
    const lastAchievement = currentGameAchievements
      .filter(a => a.isEarned)
      .sort((a, b) => new Date(b.dateEarned) - new Date(a.dateEarned))[0]

    const earnedCount = currentGameAchievements.filter(a => a.isEarned).length
    const totalCount = currentGameAchievements.length
    const percentage = totalCount > 0 ? ((earnedCount / totalCount) * 100).toFixed(2) : '0.00'

    return (
      <>
        <div className={`overlay-chrome achievement-tracker ${isClean ? 'overlay-clean' : ''}`}>
          <div className="tracker-container" style={{
            backgroundImage: game?.image_url ? `url(${game.image_url})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}>
            <div className="tracker-overlay">
              <div className="tracker-header">
                <h3 className="tracker-title">Game Progress</h3>
                <div className="tracker-stats">
                  <span className="count-badge">{earnedCount}/{totalCount}</span>
                  <span className="percentage-badge">{percentage}%</span>
                </div>
              </div>

              <div className="tracker-progress">
                <div className="progress-bar-bg">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${(earnedCount / Math.max(totalCount, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {lastAchievement && (
                <div className="last-achievement-section">
                  <h4 className="last-achievement-title">Last achievement earned</h4>
                  <div className="achievement-item">
                    <div className="achievement-badge">
                      <img 
                        src={`https://media.retroachievements.org/Badge/${lastAchievement.badgeName}.png`}
                        alt={lastAchievement.title}
                        width="64"
                        height="64"
                      />
                    </div>
                    <div className="achievement-details">
                      <div className="achievement-name">{lastAchievement.title}</div>
                      <div className="achievement-description">{lastAchievement.description}</div>
                      <div className="achievement-earned-date">
                        Earned on {new Date(lastAchievement.dateEarned).toLocaleDateString('en-GB')} at {new Date(lastAchievement.dateEarned).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  if (style === 'ticker') {
    // Show recent achievements as a scrolling ticker
    const recentAchievements = currentGameAchievements
      .filter(a => a.isEarned)
      .sort((a, b) => new Date(b.dateEarned) - new Date(a.dateEarned))
      .slice(0, maxAchievements || 10)

    const speed = params.get('speed') || '30' // seconds for full scroll
    const direction = params.get('direction') || 'left' // 'left' | 'right'

    return (
      <>
        <div className={`overlay-chrome achievement-ticker ${isClean ? 'overlay-clean' : ''}`}>
          <div className="ticker-container">
            <div 
              className={`ticker-content ${direction}`}
              style={{
                '--ticker-speed': `${speed}s`,
                '--ticker-direction': direction === 'right' ? 'reverse' : 'normal'
              }}
            >
              {recentAchievements.map((achievement, index) => (
                <div key={`${achievement.id}-${index}`} className="ticker-item">
                  <img 
                    src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`}
                    alt={achievement.title}
                    className="ticker-badge"
                  />
                  <div className="ticker-info">
                    <span className="ticker-title">{achievement.title}</span>
                    <span className="ticker-game">{game.title}</span>
                    <span className="ticker-points">{achievement.points}pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <AchievementNotificationManager />
      </>
    )
  }

  return null
}