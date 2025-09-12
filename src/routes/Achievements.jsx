import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useGame } from '../context/GameContext.jsx'
import { useAchievements } from '../context/AchievementContext.jsx'
import { useLocation, useSearchParams } from 'react-router-dom'
import * as RA from '../services/retroachievements.js'

const AchievementCard = ({ achievement, gameTitle, gameIcon, consoleName, onClick }) => {
  const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.badgeName}.png`
  
  return (
    <div 
      className={`achievement-card ${achievement.isEarned ? 'earned' : 'locked'} ${achievement.isEarnedHardcore ? 'hardcore' : ''}`}
      onClick={() => onClick(achievement)}
    >
      <div className="achievement-image">
        <img src={badgeUrl} alt={achievement.title} />
        {achievement.isEarnedHardcore && (
          <div className="hardcore-overlay">
            <span>H</span>
          </div>
        )}
      </div>
      
      <div className="achievement-details">
        <div className="achievement-header">
          <h4 className="achievement-name">{achievement.title}</h4>
          <div className="achievement-points">{achievement.points}pts</div>
        </div>
        
        <p className="achievement-description">{achievement.description}</p>
        
        {gameTitle && (
          <div className="game-info">
            {gameIcon && <img src={gameIcon} alt={gameTitle} className="game-icon" />}
            <span className="game-title">{gameTitle}</span>
            {consoleName && <span className="console-name">• {consoleName}</span>}
          </div>
        )}
        
        {achievement.isEarned && (
          <div className="earned-info">
            <div className="earned-date">
              Earned: {new Date(achievement.dateEarned).toLocaleDateString()}
            </div>
            {achievement.isEarnedHardcore && achievement.dateEarnedHardcore && (
              <div className="hardcore-date">
                Hardcore: {new Date(achievement.dateEarnedHardcore).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const AchievementModal = ({ achievement, onClose }) => {
  const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.badgeName}.png`
  
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])
  
  return (
    <div className="achievement-modal-overlay" onClick={onClose}>
      <div className="achievement-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        
        <div className="modal-header">
          <div className="large-badge">
            <img src={badgeUrl} alt={achievement.title} />
            {achievement.isEarnedHardcore && (
              <div className="hardcore-crown">👑</div>
            )}
          </div>
          
          <div className="header-info">
            <h2 className="modal-achievement-name">{achievement.title}</h2>
            <div className="modal-points">{achievement.points} Points</div>
            <div className={`achievement-status ${achievement.isEarned ? 'earned' : 'locked'}`}>
              {achievement.isEarned ? '🏆 Unlocked' : '🔒 Locked'}
            </div>
          </div>
        </div>
        
        <div className="modal-body">
          <div className="description-section">
            <h3>Description</h3>
            <p>{achievement.description}</p>
          </div>
          
          {achievement.isEarned && (
            <div className="unlock-info">
              <h3>Unlock Information</h3>
              <div className="unlock-dates">
                <div className="unlock-date">
                  <span className="label">First Unlock:</span>
                  <span className="date">{new Date(achievement.dateEarned).toLocaleString()}</span>
                </div>
                {achievement.isEarnedHardcore && achievement.dateEarnedHardcore && (
                  <div className="unlock-date hardcore">
                    <span className="label">Hardcore Unlock:</span>
                    <span className="date">{new Date(achievement.dateEarnedHardcore).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="achievement-meta">
            <div className="meta-item">
              <span className="label">Display Order:</span>
              <span className="value">{achievement.displayOrder}</span>
            </div>
            <div className="meta-item">
              <span className="label">Achievement ID:</span>
              <span className="value">{achievement.id}</span>
            </div>
            <div className="meta-item">
              <span className="label">Badge:</span>
              <span className="value">{achievement.badgeName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Achievements() {
  const { state } = useGame()
  const { 
    state: achievementState, 
    loadGameAchievements, 
    loadRecentAchievements,
    clearCurrentGameData,
    isConfigured 
  } = useAchievements()
  const location = useLocation()

  const [selectedGame, setSelectedGame] = useState(null)
  const [selectedAchievement, setSelectedAchievement] = useState(null)
  const [viewMode, setViewMode] = useState('current') // 'current' | 'recent' | 'all'
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'earned' | 'locked'
  const [sortBy, setSortBy] = useState('order') // 'order' | 'points' | 'earned' | 'name'
  const [loading, setLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [gameQuery, setGameQuery] = useState(() => searchParams.get('g') || '')

  // Get RetroAchievements games
  const raGames = useMemo(() => {
    return state.games.filter(game => RA.hasRetroAchievementsSupport(game))
  }, [state.games])

  // Track if we're in the middle of a URL-forced selection to prevent interference
  const forcingSelectionRef = useRef(false)

  // Single effect to handle all game selection logic
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search)
    const forceCurrentGame = urlParams.get('current') === 'true'
    
    console.log('Achievements Page Init:', {
      viewMode,
      selectedGame: selectedGame?.title,
      currentGameId: state.currentGameId,
      forceCurrentGame,
      raGamesCount: raGames.length,
      isConfigured,
      forcingSelection: forcingSelectionRef.current
    })

    // Handle recent achievements mode
    if (viewMode === 'recent' && isConfigured) {
      loadRecentAchievements(100)
      return
    }

    // Handle current game mode
    if (viewMode === 'current' && state.currentGameId && isConfigured) {
      const currentGame = raGames.find(g => g.id === state.currentGameId)
      
      if (currentGame) {
        // Only auto-select current game if no game is selected yet
        // URL force should only happen once, then allow manual selections
        const shouldSelectCurrentGame = !selectedGame && !forcingSelectionRef.current
        const shouldForceCurrentGame = forceCurrentGame && (!selectedGame || selectedGame.id === state.currentGameId)
        
        if (shouldSelectCurrentGame || shouldForceCurrentGame) {
          console.log('useEffect wants to select current game:', currentGame.title, shouldForceCurrentGame ? '(forced by URL)' : '(auto-select)')
          console.log('Current selectedGame before override:', selectedGame?.title)
          
          if (forceCurrentGame) {
            forcingSelectionRef.current = true
            clearCurrentGameData()
          }
          
          setSelectedGame(currentGame)
          
          // Only make API call if we don't already have data for this game or if forced
          const needsApiCall = forceCurrentGame || achievementState.currentGameAchievements.length === 0
          
          if (needsApiCall) {
            console.log('Loading achievements for:', currentGame.title, 'with ID:', currentGame.id)
            loadGameAchievements(currentGame.id, forceCurrentGame).finally(() => {
              if (forceCurrentGame) {
                forcingSelectionRef.current = false
              }
            })
          } else {
            console.log('Using existing achievement data for:', currentGame.title)
            if (forceCurrentGame) {
              forcingSelectionRef.current = false
            }
          }
        }
      }
    }
  }, [location.search, viewMode, state.currentGameId, selectedGame, raGames.length, isConfigured])

  // Keep URL 'g' param in sync with gameQuery (shallow replace)
  useEffect(() => {
    const q = (gameQuery || '').trim()
    const current = searchParams.get('g') || ''
    if (q !== current) {
      const next = new URLSearchParams(searchParams)
      if (q) next.set('g', q); else next.delete('g')
      setSearchParams(next, { replace: true })
    }
  }, [gameQuery])

  // Handle game selection for current game achievements
  const handleGameSelect = async (game) => {
    // Don't allow manual selection while forcing URL selection
    if (forcingSelectionRef.current) {
      console.log('Ignoring manual selection during URL force:', game.title)
      return
    }
    
    console.log('Manual game selection - BEFORE setState:', {
      newGame: game.title,
      newGameId: game.id,
      currentSelectedGame: selectedGame?.title,
      currentSelectedGameId: selectedGame?.id
    })
    
    setSelectedGame(game)
    
    // Log after setState to verify it was called
    console.log('Manual game selection - AFTER setState called for:', game.title)
    
    setLoading(true)
    try {
      await loadGameAchievements(game.id, true) // Force reload
      console.log('Successfully loaded achievements for manual selection:', game.title)
    } catch (error) {
      console.error('Failed to load achievements:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort achievements
  const getDisplayAchievements = () => {
    let achievements = []
    
    if (viewMode === 'current') {
      achievements = achievementState.currentGameAchievements
    } else if (viewMode === 'recent') {
      achievements = achievementState.recentAchievements.map(ra => ({
        id: ra.achievementId,
        title: ra.title,
        description: ra.description,
        points: ra.points,
        badgeName: ra.badgeName,
        dateEarned: ra.date,
        isEarned: true,
        isEarnedHardcore: ra.hardcoreMode === 1,
        gameTitle: ra.gameTitle,
        gameIcon: ra.gameIcon,
        consoleName: ra.consoleName
      }))
    }
    
    // Filter by status
    if (filterStatus === 'earned') {
      achievements = achievements.filter(a => a.isEarned)
    } else if (filterStatus === 'locked') {
      achievements = achievements.filter(a => !a.isEarned)
    }

    // Sort achievements
    achievements = [...achievements].sort((a, b) => {
      switch (sortBy) {
        case 'points':
          return b.points - a.points
        case 'earned':
          if (a.isEarned !== b.isEarned) return b.isEarned - a.isEarned
          return new Date(b.dateEarned || 0) - new Date(a.dateEarned || 0)
        case 'name':
          return a.title.localeCompare(b.title)
        case 'order':
        default:
          return (a.displayOrder || 0) - (b.displayOrder || 0)
      }
    })
    
    return achievements
  }

  const displayAchievements = getDisplayAchievements()
  
  // Debug logging for the results summary
  console.log('Results Summary Debug:', {
    displayCount: displayAchievements.length,
    viewMode,
    selectedGameTitle: selectedGame?.title,
    selectedGameId: selectedGame?.id,
    showGameName: viewMode === 'current' && selectedGame
  })

  if (!isConfigured) {
    return (
      <div className="p-3">
        <h2 className="h4">Achievement Gallery</h2>
        <div className="alert alert-warning">
          <h5>RetroAchievements Not Configured</h5>
          <p>To view achievements, please configure your RetroAchievements username and API key in Settings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 achievements-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="h4 mb-1">Achievement Gallery</h2>
          <div className="text-secondary small">
            Browse and track your RetroAchievements progress
          </div>
        </div>
        
        <div className="d-flex gap-2 align-items-center">
          {/* View Mode Selector */}
          <div className="btn-group btn-group-sm">
            <button 
              className={`btn ${viewMode === 'current' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setViewMode('current')}
            >
              Current Game
            </button>
            <button 
              className={`btn ${viewMode === 'recent' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setViewMode('recent')}
            >
              Recent
            </button>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-lg-3 mb-3">
          {/* Sidebar Controls */}
          <div className="card bg-panel p-3 mb-3">
            <h5 className="h6 mb-3">Filters</h5>
            
            <div className="mb-3">
              <label className="form-label small">Status</label>
              <select 
                className="form-select form-select-sm" 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">All Achievements</option>
                <option value="earned">Earned Only</option>
                <option value="locked">Locked Only</option>
              </select>
            </div>
            
            <div className="mb-3">
              <label className="form-label small">Sort By</label>
              <select 
                className="form-select form-select-sm" 
                value={sortBy} 
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="order">Display Order</option>
                <option value="points">Point Value</option>
                <option value="earned">Recently Earned</option>
                <option value="name">Alphabetical</option>
              </select>
            </div>
          </div>

          {/* Game Selector for Current Mode */}
          {viewMode === 'current' && (
            <div className="card bg-panel p-3">
              <h5 className="h6 mb-3">Select Game</h5>
              <div className="mb-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search games..."
                  value={gameQuery}
                  onChange={e => setGameQuery(e.target.value)}
                />
              </div>
              <div className="game-list">
                {raGames.length === 0 ? (
                  <div className="text-secondary small">
                    No RetroAchievements games found. Sync games from Settings.
                  </div>
                ) : (
                  raGames
                    .filter(g => {
                      const q = (gameQuery || '').trim().toLowerCase()
                      if (!q) return true
                      return (
                        String(g.title || '').toLowerCase().includes(q) ||
                        String(g.console || '').toLowerCase().includes(q)
                      )
                    })
                    .map(game => (
                    <div 
                      key={game.id} 
                      className={`game-selector-item ${selectedGame?.id === game.id ? 'active' : ''}`}
                      onClick={() => handleGameSelect(game)}
                    >
                      <div className="game-name">{game.title}</div>
                      <div className="game-console">{game.console}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="col-lg-9">
          {/* Achievement Grid */}
          <div className="achievement-results">
            {loading ? (
              <div className="text-center p-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <div className="mt-2">Loading achievements...</div>
              </div>
            ) : displayAchievements.length === 0 ? (
              <div className="text-center p-5 text-secondary">
                {viewMode === 'current' && !selectedGame ? (
                  "Select a game to view its achievements"
                ) : (
                  "No achievements match your current filters"
                )}
              </div>
            ) : (
              <div className="achievements-grid">
                {displayAchievements.map(achievement => (
                  <AchievementCard
                    key={`${achievement.id}-${achievement.gameTitle || 'current'}`}
                    achievement={achievement}
                    gameTitle={viewMode === 'recent' ? achievement.gameTitle : null}
                    gameIcon={viewMode === 'recent' ? achievement.gameIcon : null}
                    consoleName={viewMode === 'recent' ? achievement.consoleName : null}
                    onClick={setSelectedAchievement}
                  />
                ))}
              </div>
            )}

            {displayAchievements.length > 0 && (
              <div className="results-summary text-center mt-4 text-secondary small">
                Showing {displayAchievements.length} achievement{displayAchievements.length !== 1 ? 's' : ''}
                {viewMode === 'current' && selectedGame && (
                  <span> for {selectedGame.title}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <AchievementModal 
          achievement={selectedAchievement} 
          onClose={() => setSelectedAchievement(null)} 
        />
      )}
    </div>
  )
}
