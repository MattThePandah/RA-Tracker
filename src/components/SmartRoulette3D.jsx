import React, { useState, useCallback, useEffect, useMemo } from 'react'
import RedesignedWheel from './RedesignedWheel.jsx'

const SmartRoulette3D = ({ games, poolKey, onGameSelected, onSampleUpdate }) => {
  const [sample, setSample] = useState([])
  const [spinning, setSpinning] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [spinSeed, setSpinSeed] = useState(null)
  const [targetGameId, setTargetGameId] = useState(null)
  const [poolSize, setPoolSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('cyberpunk')
  const [winner, setWinner] = useState(null)

  const SLOT_COUNT = 16

  // Sample games from filtered pool
  const sampleGames = useCallback(async () => {
    const src = games || []
    if (!src.length) {
      setSample(Array(SLOT_COUNT).fill(null))
      setPoolSize(0)
      setSelectedIdx(null)
      setWinner(null)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      // Create sample with random selection
      const pool = [...src]
      const newSample = []
      const target = Math.min(SLOT_COUNT, pool.length)
      
      for (let i = 0; i < target; i++) {
        const idx = Math.floor(Math.random() * pool.length)
        newSample.push(pool.splice(idx, 1)[0])
      }
      
      // Fill remaining slots with null
      while (newSample.length < SLOT_COUNT) {
        newSample.push(null)
      }

      setSample(newSample)
      setPoolSize(src.length)
      setSelectedIdx(null)
      setWinner(null)
      
      // Notify parent component
      onSampleUpdate?.({ 
        sample: newSample, 
        poolSize: src.length, 
        totalGames: src.length 
      })

      // Update server overlay state (optional)
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      if (base) {
        try {
          await fetch(`${base}/overlay/wheel-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sample: newSample, poolSize: src.length })
          })
          console.log('Updated overlay wheel-state with 3D wheel sample')
        } catch (err) {
          console.warn('Failed to update overlay wheel-state (server not available):', err)
        }
      }
    } catch (err) {
      console.error('Failed to sample games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [games, onSampleUpdate])

  // Auto-sample when pool changes
  useEffect(() => {
    sampleGames()
  }, [poolKey, sampleGames])

  // Spin the wheel
  const spin = useCallback(async () => {
    if (spinning || !sample.some(Boolean)) return

    setSpinning(true)
    setSelectedIdx(null)
    setWinner(null)

    try {
      // Try server endpoint first, fallback to local logic
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      let targetIdx, durationMs = 4500
      let turns = 8
      let serverTs = null
      
      try {
        const response = await fetch(`${base}/wheel/spin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sample: sample,
            poolSize: poolSize,
            slotCount: SLOT_COUNT,
            durationMs: 4500,
            turns: 8
          })
        })

        if (response.ok) {
          const spinResult = await response.json()
          // Use server-provided sample and spin timing so overlay and local stay in sync
          if (Array.isArray(spinResult.sample)) setSample(spinResult.sample)
          targetIdx = spinResult.targetIdx
          durationMs = spinResult.durationMs || 4500
          if (typeof spinResult.turns === 'number') turns = spinResult.turns
          if (typeof spinResult.ts === 'number') serverTs = spinResult.ts
          console.log('Using server spin result:', targetIdx)
        } else {
          throw new Error('Server endpoint not available')
        }
      } catch (serverErr) {
        console.warn('Server spin failed, using local logic:', serverErr.message)
        // Local fallback - pick random valid slot index from the full sample
        const validSlots = sample.map((g,i)=>g?i:null).filter(i=>i!=null)
        if (!validSlots.length) throw new Error('No valid games in sample')
        const pick = Math.floor(Math.random() * validSlots.length)
        targetIdx = validSlots[pick]
        console.log('Using local spin result:', targetIdx)
      }

      // Announce spin to 3D wheel for deterministic animation
      const target = (Array.isArray(sample) ? sample : [])[targetIdx]
      const ts = serverTs || Date.now()
      setTargetGameId(target?.id ?? null)
      setSpinSeed({ ts, targetIdx, targetGameId: target?.id ?? null, durationMs, turns })

      // Simulate spin duration with smooth animation
      setTimeout(() => {
        setSpinning(false)
        const selectedGame = (Array.isArray(sample) ? sample : [])[targetIdx]
        setSelectedIdx(targetIdx)

        if (selectedGame) {
          setWinner(selectedGame)
          onGameSelected?.(selectedGame)

          // Display winner for a few seconds before clearing
          setTimeout(() => {
            setWinner(null)
            setTargetGameId(null)
            setSpinSeed(null)
          }, 5000)
        }
      }, durationMs)

    } catch (err) {
      console.error('Wheel spin failed:', err)
      setError(err.message)
      setSpinning(false)
    }
  }, [spinning, sample, poolSize, onGameSelected])

  // Stats for display
  const stats = useMemo(() => ({
    totalGames: poolSize,
    loadedGames: sample.filter(g => g).length,
    hasValidSample: sample.some(Boolean)
  }), [sample, poolSize])

  return (
    <div className="smart-roulette-3d">
      {/* Header Controls */}
      <div className="roulette-header">
        <div className="roulette-info">
          <h3 className="roulette-title">🎮 Game Selector</h3>
          <div className="roulette-stats">
            <span className="stat-chip">
              <i className="bi bi-collection"></i>
              {stats.totalGames.toLocaleString()} games
            </span>
            <span className="stat-chip">
              <i className="bi bi-dice-3"></i>
              {stats.loadedGames} loaded
            </span>
            {spinning && (
              <span className="stat-chip spinning-indicator">
                <i className="bi bi-arrow-repeat"></i>
                Spinning...
              </span>
            )}
          </div>
        </div>

        <div className="roulette-controls">
          <button 
            className="btn btn-outline-light btn-sm"
            onClick={sampleGames}
            disabled={loading || spinning}
          >
            {loading ? (
              <>
                <i className="bi bi-arrow-clockwise spin"></i>
                Shuffling...
              </>
            ) : (
              <>
                <i className="bi bi-shuffle"></i>
                New Games
              </>
            )}
          </button>

          <button 
            className="btn btn-primary btn-lg spin-btn"
            onClick={spin}
            disabled={spinning || !stats.hasValidSample}
          >
            {spinning ? (
              <>
                <i className="bi bi-arrow-repeat spin"></i>
                Spinning...
              </>
            ) : (
              <>
                <i className="bi bi-play-circle"></i>
                SPIN WHEEL
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3D Wheel */}
      <div className="roulette-wheel-container d-flex justify-content-center">
        <RedesignedWheel
          sample={sample}
          spinSeed={spinSeed}
          selectedIndex={selectedIdx}
          onStop={(idx) => {
            // Optional: handle stop notification if needed
          }}
        />
      </div>

      {/* Winner Display */}
      {winner && !spinning && (
        <div className="winner-celebration">
          <div className="winner-backdrop"></div>
          <div className="winner-card">
            <div className="winner-glow"></div>
            <div className="winner-content">
              <div className="winner-badge">
                <i className="bi bi-trophy-fill"></i>
                WINNER!
              </div>
              <div className="winner-game">
                <div className="winner-cover">
                  {winner.image_url ? (
                    <img src={winner.image_url} alt={winner.title} />
                  ) : (
                    <div className="cover-placeholder">
                      <i className="bi bi-controller"></i>
                    </div>
                  )}
                </div>
                <div className="winner-info">
                  <h3 className="winner-title">{winner.title}</h3>
                  <p className="winner-meta">
                    {winner.console}
                    {winner.release_year && ` • ${winner.release_year}`}
                    {winner.publisher && ` • ${winner.publisher}`}
                  </p>
                  {winner.status && (
                    <span className={`winner-status ${winner.status.toLowerCase().replace(' ', '-')}`}>
                      {winner.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="roulette-error">
          <i className="bi bi-exclamation-triangle"></i>
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* No Games State */}
      {!loading && stats.totalGames === 0 && (
        <div className="roulette-empty">
          <i className="bi bi-collection"></i>
          <h4>No Games Available</h4>
          <p>Adjust your filters to see games in the wheel</p>
        </div>
      )}
    </div>
  )
}

export default SmartRoulette3D
