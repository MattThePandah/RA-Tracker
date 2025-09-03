import React from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import { useAchievements } from '../context/AchievementContext.jsx'
import { startCurrentTimer, pauseCurrentTimer, resetCurrentTimer, resetPSFestTimer, getTimerStatus, getTimerData, validateAndRecoverTimerState } from '../services/storage.js'
import * as RA from '../services/retroachievements.js'

// Proxy cover helper (uses disk cache via server if available)
const proxyImage = (url) => {
  const base = import.meta.env.VITE_IGDB_PROXY_URL
  if (!url) return null
  return base ? `${base}/cover?src=${encodeURIComponent(url)}` : url
}

export default function Current() {
  const { state, dispatch } = useGame()
  const { 
    state: achievementState, 
    loadGameAchievements, 
    isConfigured: isAchievementsConfigured 
  } = useAchievements()
  const game = state.games.find(g => g.id === state.currentGameId) || null
  const [running, setRunning] = React.useState(false)
  const [timerData, setTimerData] = React.useState({
    running: false,
    currentTime: 0,
    totalTime: 0,
    currentFormatted: '0:00:00',
    totalFormatted: '0:00:00'
  })
  const [form, setForm] = React.useState(() => ({
    status: game?.status || 'Not Started',
    rating: game?.rating || '',
    completion_time: game?.completion_time || '',
    date_started: game?.date_started ? game.date_started.split('T')[0] : '',
    date_finished: game?.date_finished ? game.date_finished.split('T')[0] : '',
    notes: game?.notes || ''
  }))

  React.useEffect(() => {
    if (!game) return
    setForm({
      status: game.status || 'Not Started',
      rating: game.rating || '',
      completion_time: game.completion_time || '',
      date_started: game.date_started ? game.date_started.split('T')[0] : '',
      date_finished: game.date_finished ? game.date_finished.split('T')[0] : '',
      notes: game.notes || ''
    })
  }, [game?.id])

  // Poll timer data for UI with validation
  React.useEffect(() => {
    let id
    let validationInterval
    let lastValidationTime = 0
    
    const tick = async () => {
      try {
        const data = await getTimerData()
        setRunning(!!data.running)
        setTimerData(data)
        
        // Validate timer state every 30 seconds
        const now = Date.now()
        if (now - lastValidationTime > 30000) {
          lastValidationTime = now
          validateAndRecoverTimerState().catch(error => {
            console.warn('Current: Timer validation failed:', error)
          })
        }
      } catch (error) {
        console.warn('Current: Failed to fetch timer data:', error)
        // Keep previous state on error
      }
    }
    
    tick()
    id = setInterval(tick, 1000) // Update every second for live timer
    
    // Initial validation when component mounts
    validateAndRecoverTimerState().catch(error => {
      console.warn('Current: Initial timer validation failed:', error)
    })
    
    return () => {
      clearInterval(id)
    }
  }, [])

  // Load achievements when current game changes
  React.useEffect(() => {
    if (game && RA.hasRetroAchievementsSupport(game) && isAchievementsConfigured) {
      loadGameAchievements(game.id)
    }
  }, [game, isAchievementsConfigured, loadGameAchievements])

  const update = (patch) => {
    if (!game) return
    const updated = {
      ...game,
      ...patch
    }
    dispatch({ type: 'UPDATE_GAME', game: updated })
  }

  const onField = async (k, v) => {
    // Normalize date fields: keep date-only in form state; store ISO midnight in data
    let formVal = v
    let storeVal = (v === '' ? null : v)
    if (k === 'date_started' || k === 'date_finished') {
      formVal = v
      storeVal = v ? v + 'T00:00:00.000Z' : null
    }
    setForm(prev => ({ ...prev, [k]: formVal }))
    const patch = { [k]: storeVal }
    
    if (k === 'status') {
      const now = new Date().toISOString()
      if (v === 'In Progress' && !game.date_started) patch.date_started = now
      if (v === 'Completed' && !game.date_finished) patch.date_finished = now
      
      // Auto-start timer when status changes to "In Progress"
      if (v === 'In Progress' && game.status !== 'In Progress') {
        console.log('Current: Auto-starting timer for In Progress game')
        let startSuccess = false
        try {
          startSuccess = await startCurrentTimer()
          if (startSuccess) {
            setRunning(true)
            console.log('Current: Timer auto-start successful')
            
            // Validate the timer started correctly after a brief delay
            setTimeout(async () => {
              try {
                const timerData = await getTimerData()
                if (!timerData.running) {
                  console.warn('Current: Timer failed to start properly, retrying...')
                  const retrySuccess = await startCurrentTimer()
                  if (retrySuccess) {
                    setRunning(true)
                  }
                }
              } catch (error) {
                console.warn('Current: Timer validation after start failed:', error)
              }
            }, 2000)
          } else {
            throw new Error('Timer start returned false')
          }
        } catch (error) {
          console.error('Current: Failed to auto-start timer:', error)
          
          // Try once more after a delay
          setTimeout(async () => {
            console.log('Current: Retrying timer auto-start...')
            try {
              const retrySuccess = await startCurrentTimer()
              if (retrySuccess) {
                setRunning(true)
                console.log('Current: Timer auto-start retry successful')
              } else {
                console.error('Current: Timer auto-start retry failed')
              }
            } catch (retryError) {
              console.error('Current: Timer auto-start retry error:', retryError)
            }
          }, 5000)
        }
      }
      
      // Auto-pause timer when status changes away from "In Progress"  
      if (game.status === 'In Progress' && v !== 'In Progress') {
        console.log('Current: Auto-pausing timer as game is no longer In Progress')
        try {
          const pauseSuccess = await pauseCurrentTimer()
          if (pauseSuccess) {
            setRunning(false)
            console.log('Current: Timer auto-pause successful')
          } else {
            throw new Error('Timer pause returned false')
          }
        } catch (error) {
          console.error('Current: Failed to auto-pause timer:', error)
          
          // Try once more
          setTimeout(async () => {
            try {
              const retrySuccess = await pauseCurrentTimer()
              if (retrySuccess) {
                setRunning(false)
                console.log('Current: Timer auto-pause retry successful')
              }
            } catch (retryError) {
              console.error('Current: Timer auto-pause retry error:', retryError)
            }
          }, 2000)
        }
      }
    }
    
    update(patch)
  }

  if (!game) {
    return (
      <div className="p-3">
        <h2 className="h4">Current Game</h2>
        <div className="text-secondary">No game selected. Use the Select tab to pick one.</div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <h2 className="h4 mb-3">Current Game</h2>

      {/* Summary Card */}
      <div className="overlay-card rebrand rounded-4 p-3 d-flex gap-3 align-items-center mb-3">
        <div className="ratio ratio-4x3" style={{width: 260}}>
          {game.image_url ? (
            <img className="rounded-3 w-100 h-100 object-fit-cover" src={proxyImage(game.image_url)} alt="" />
          ) : (
            <div className="rounded-3 w-100 h-100 d-flex align-items-center justify-content-center text-secondary bg-dark">No cover</div>
          )}
        </div>
        <div className="flex-grow-1">
          <div className="title-strong fs-3 mb-1">{game.title}</div>
          <div className="overlay-subtle mb-2">{game.console}{game.release_year ? ` • ${game.release_year}` : ''}</div>
          <div className="d-flex gap-2 flex-wrap mb-2">
            <span className="badge bg-primary">{game.status || 'Not Started'}</span>
            {game.rating && <span className="badge bg-info">⭐ {game.rating}/10</span>}
            {game.is_bonus && <span className="badge bg-warning text-dark">🎁 Bonus</span>}
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <button 
              className="btn btn-sm btn-warning" 
              onClick={() => onField('status', 'In Progress')}
            >
              Set In Progress
            </button>
            <button 
              className="btn btn-sm btn-success" 
              onClick={() => onField('status', 'Completed')}
            >
              Mark Completed
            </button>
            <button className="btn btn-sm btn-outline-light" onClick={()=>dispatch({ type: 'SET_CURRENT', id: null })}>Clear Current</button>
            <span className="text-secondary ms-2" style={{fontSize: '0.9rem'}}>Timer: {running ? 'Running' : 'Paused'}</span>
          </div>
          
          {/* Timer Display */}
          <div className="mt-3 p-3 bg-dark rounded">
            <div className="row text-center">
              <div className="col-6">
                <div className="h4 text-primary mb-1">{timerData.currentFormatted}</div>
                <div className="small text-secondary">Current Session</div>
              </div>
              <div className="col-6">
                <div className="h4 text-info mb-1">{timerData.totalFormatted}</div>
                <div className="small text-secondary">Total PSFest Time</div>
              </div>
            </div>
          </div>
          
          <div className="d-flex gap-2 flex-wrap mt-2">
            {running ? (
              <button className="btn btn-sm btn-outline-warning" onClick={pauseCurrentTimer}>Pause Timer</button>
            ) : (
              <button className="btn btn-sm btn-outline-success" onClick={startCurrentTimer}>Start Timer</button>
            )}
            <button className="btn btn-sm btn-outline-light" onClick={resetCurrentTimer}>Reset Current Timer</button>
            <button className="btn btn-sm btn-outline-danger" onClick={resetPSFestTimer}>Reset PSFest Total</button>
          </div>
        </div>
      </div>

      {/* Achievement Progress Section */}
      {game && RA.hasRetroAchievementsSupport(game) && isAchievementsConfigured && (
        <div className="card bg-panel border border-secondary rounded-4 p-3 mb-3">
          <h3 className="h6 text-light mb-3">🏆 RetroAchievements Progress</h3>
          {achievementState.loading.gameAchievements ? (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              Loading achievements...
            </div>
          ) : achievementState.currentGameAchievements.length > 0 ? (
            <>
              {/* Progress Stats */}
              <div className="row g-3 mb-4">
                <div className="col-sm-6 col-md-3">
                  <div className="text-center">
                    <div className="h4 text-brand mb-0">
                      {achievementState.currentGameAchievements.filter(a => a.isEarned).length}
                    </div>
                    <div className="small text-secondary">Earned</div>
                  </div>
                </div>
                <div className="col-sm-6 col-md-3">
                  <div className="text-center">
                    <div className="h4 text-light mb-0">
                      {achievementState.currentGameAchievements.length}
                    </div>
                    <div className="small text-secondary">Total</div>
                  </div>
                </div>
                <div className="col-sm-6 col-md-3">
                  <div className="text-center">
                    <div className="h4 text-accent mb-0">
                      {achievementState.currentGameAchievements.filter(a => a.isEarned).reduce((sum, a) => sum + a.points, 0)}
                    </div>
                    <div className="small text-secondary">Points</div>
                  </div>
                </div>
                <div className="col-sm-6 col-md-3">
                  <div className="text-center">
                    <div className="h4 text-success mb-0">
                      {Math.round((achievementState.currentGameAchievements.filter(a => a.isEarned).length / Math.max(1, achievementState.currentGameAchievements.length)) * 100)}%
                    </div>
                    <div className="small text-secondary">Complete</div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="progress mb-3" style={{ height: '12px' }}>
                <div 
                  className="progress-bar bg-gradient" 
                  style={{ 
                    width: `${Math.round((achievementState.currentGameAchievements.filter(a => a.isEarned).length / Math.max(1, achievementState.currentGameAchievements.length)) * 100)}%`,
                    background: 'linear-gradient(90deg, var(--brand), var(--accent))'
                  }}
                ></div>
              </div>

              {/* Recent Achievements */}
              {achievementState.currentGameAchievements.filter(a => a.isEarned).length > 0 && (
                <div>
                  <h6 className="small text-light mb-2">Recent Achievements</h6>
                  <div className="row g-2">
                    {achievementState.currentGameAchievements
                      .filter(a => a.isEarned)
                      .sort((a, b) => new Date(b.dateEarned) - new Date(a.dateEarned))
                      .slice(0, 4)
                      .map(achievement => (
                        <div key={achievement.id} className="col-sm-6 col-lg-3">
                          <div className="achievement-mini p-2 rounded bg-dark border border-secondary">
                            <div className="d-flex align-items-center gap-2">
                              <img 
                                src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`}
                                alt={achievement.title}
                                width="32"
                                height="32"
                                className="rounded"
                              />
                              <div className="min-w-0 flex-grow-1">
                                <div className="small fw-semibold text-light truncate-1" title={achievement.title}>
                                  {achievement.title}
                                </div>
                                <div className="text-accent" style={{ fontSize: '0.75rem' }}>
                                  {achievement.points} pts
                                  {achievement.isEarnedHardcore && (
                                    <span className="ms-1 text-warning">👑</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Link to full achievement gallery */}
              <div className="text-center mt-3">
                <Link 
                  to="/achievements?current=true" 
                  className="btn btn-outline-primary btn-sm"
                >
                  View All Achievements
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center text-secondary py-3">
              <div>No achievements loaded</div>
              <div className="small">Check your RetroAchievements configuration</div>
            </div>
          )}
        </div>
      )}

      {/* Editable Details */}
      <div className="card bg-panel border border-secondary rounded-4 p-3">
        <div className="row g-3">
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label text-light">Status</label>
              <select className="form-select" value={form.status} onChange={e=>onField('status', e.target.value)}>
                <option>Not Started</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Rating (1-10)</label>
              <input type="number" min="1" max="10" className="form-control" value={form.rating} onChange={e=>onField('rating', e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Completion Time (hours)</label>
              <input type="number" step="0.5" min="0" className="form-control" value={form.completion_time} onChange={e=>onField('completion_time', e.target.value)} />
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label text-light">Date Started</label>
              <input type="date" className="form-control" value={form.date_started} onChange={e=>onField('date_started', e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Date Finished</label>
              <input type="date" className="form-control" value={form.date_finished} onChange={e=>onField('date_finished', e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label text-light">Notes</label>
              <textarea className="form-control" rows="6" value={form.notes} onChange={e=>onField('notes', e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
