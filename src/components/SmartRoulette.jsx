import React, { useMemo, useRef, useState, useCallback } from 'react'

const SLOT_COUNT = 16 // Fixed number of slots for performance
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
  '#F1948A', '#85C1E9', '#F4D03F', '#A569BD'
]

function SmartRoulette({ games, poolKey, onGameSelected, onSampleUpdate }) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const angleRef = useRef(0)
  const rafRef = useRef(null)
  const gamesRef = useRef(games)
  
  const [sample, setSample] = useState([])
  const [spinning, setSpinning] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [poolSize, setPoolSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const segmentAngle = (Math.PI * 2) / SLOT_COUNT

  // Keep latest games reference without retriggering effects
  React.useEffect(() => { gamesRef.current = games }, [games])

  // Sample games from filtered pool (client-side to avoid huge payloads)
  const sampleGames = useCallback(async () => {
    const src = gamesRef.current || []
    if (!src.length) {
      setSample(Array(SLOT_COUNT).fill(null))
      setPoolSize(0)
      setSelectedIdx(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const pool = [...src]
      const localSample = []
      const target = Math.min(SLOT_COUNT, pool.length)
      for (let i = 0; i < target; i++) {
        const idx = Math.floor(Math.random() * pool.length)
        localSample.push(pool.splice(idx, 1)[0])
      }
      while (localSample.length < SLOT_COUNT) localSample.push(null)
      setSample(localSample)
      setPoolSize(src.length)
      setSelectedIdx(null)
      onSampleUpdate?.({ sample: localSample, poolSize: src.length, totalGames: src.length })
      // Seed overlay idle state with minimal payload
      const baseOnly = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      if (baseOnly) {
        fetch(`${baseOnly}/overlay/wheel-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sample: localSample, poolSize: src.length })
        }).then(() => {
          console.log('Updated overlay wheel-state with', localSample.filter(g => g).length, 'games from pool of', src.length)
        }).catch((err) => {
          console.log('Failed to update overlay wheel-state:', err.message)
        })
      }
    } finally {
      setLoading(false)
    }
  }, [onSampleUpdate])

  // Auto-sample only when pool membership changes (stable key of IDs)
  React.useEffect(() => {
    sampleGames()
  }, [poolKey, sampleGames])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      ctxRef.current = canvas.getContext('2d')
      ctxRef.current.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const ctx = ctxRef.current || canvas.getContext('2d')
    ctxRef.current = ctx

    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const radius = Math.min(w, h) / 2 - 20
    const centerX = w / 2
    const centerY = h / 2
    const angle = angleRef.current

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(angle)

    // Draw segments
    for (let i = 0; i < SLOT_COUNT; i++) {
      const startAngle = i * segmentAngle
      const endAngle = (i + 1) * segmentAngle
      const game = sample[i]
      
      // Draw segment
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, radius, startAngle, endAngle)
      ctx.closePath()
      
      // Color based on whether slot has a game
      ctx.fillStyle = game ? COLORS[i] : '#444444'
      ctx.fill()
      
      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Game title (if exists and segment is visible enough)
      if (game) {
        const midAngle = (startAngle + endAngle) / 2
        const textRadius = radius * 0.75
        const textX = Math.cos(midAngle) * textRadius
        const textY = Math.sin(midAngle) * textRadius
        
        ctx.save()
        ctx.translate(textX, textY)
        
        // Rotate text to be readable
        let textRotation = midAngle
        if (midAngle > Math.PI/2 && midAngle < (3*Math.PI/2)) {
          textRotation += Math.PI
        }
        ctx.rotate(textRotation)
        
        // Draw text
        const fontSize = Math.min(14, Math.max(10, radius / 25))
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        const maxLength = Math.floor(radius / 8)
        const text = game.title.length > maxLength ? 
          game.title.slice(0, maxLength - 3) + '...' : 
          game.title
        
        // Text outline for visibility
        ctx.lineWidth = 3
        ctx.strokeStyle = '#000'
        ctx.fillStyle = '#fff'
        ctx.strokeText(text, 0, 0)
        ctx.fillText(text, 0, 0)
        
        ctx.restore()
      }
    }

    // Highlight selected segment
    if (selectedIdx !== null && !spinning) {
      const startAngle = selectedIdx * segmentAngle
      const endAngle = (selectedIdx + 1) * segmentAngle
      
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'
      ctx.fill()
      ctx.strokeStyle = '#FFD700'
      ctx.lineWidth = 4
      ctx.stroke()
    }

    // Center hub
    ctx.beginPath()
    ctx.fillStyle = '#2c3e50'
    ctx.arc(0, 0, Math.max(20, radius * 0.08), 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.restore()

    // Pointer (triangle at top)
    ctx.fillStyle = '#e74c3c'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(centerX, 10)
    ctx.lineTo(centerX + 15, 40)
    ctx.lineTo(centerX - 15, 40)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }, [sample, selectedIdx, spinning])

  React.useEffect(() => {
    draw()
  }, [draw])

  const spin = useCallback(async () => {
    if (spinning || !(gamesRef.current?.length)) return
    setSpinning(true)
    setSelectedIdx(null)

    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await fetch(`${base}/wheel/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample: sample.some(Boolean) ? sample : undefined,
          poolSize: gamesRef.current.length,
          slotCount: SLOT_COUNT,
          durationMs: 3800,
          turns: 10
        })
      })
      if (!res.ok) throw new Error(`Spin failed: ${res.status}`)
      const { sample: srvSample, targetIdx, durationMs, turns, ts } = await res.json()

      // Use authoritative sample from server
      setSample(srvSample)
      const targetAngle = (Math.PI * 1.5) - (targetIdx * segmentAngle + segmentAngle / 2)
      const extra = Math.PI * 2 * (Number(turns) || 6)
      const finalAngle = targetAngle + extra
      const duration = Number(durationMs) || 4500
      // Align start time with server ts to stay in sync with overlay
      const serverTs = Number(ts) || Date.now()
      const offset = Math.max(0, Date.now() - serverTs)
      const start = performance.now() - offset
      // Reset baseline so both views travel the same distance
      angleRef.current = 0
      const startAngle = 0

      const tick = (t) => {
        const progress = Math.min(1, (t - start) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        angleRef.current = startAngle + (finalAngle - startAngle) * eased
        draw()
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          setSpinning(false)
          setSelectedIdx(targetIdx)
          const selectedGame = srvSample[targetIdx]
          if (selectedGame) onGameSelected?.(selectedGame)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      console.error(e)
      setSpinning(false)
    }
  }, [spinning, games, draw, onGameSelected, segmentAngle])

  React.useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [spinning])

  const hasValidGames = sample.some(g => g)
  const eligibleCount = games?.length || 0

  return (
    <div className="smart-roulette">
      {/* Info Bar */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-muted">
          <strong>{poolSize.toLocaleString()}</strong> games in pool • 
          <strong> {sample.filter(g => g).length}</strong> loaded
        </div>
        <div className="btn-group">
          <button 
            className="btn btn-outline-primary" 
            onClick={sampleGames}
            disabled={loading || !games?.length}
          >
            {loading ? '🎲 Shuffling...' : '🎲 New Games'}
          </button>
          <button 
            className="btn btn-primary" 
            onClick={spin}
            disabled={spinning || !hasValidGames}
          >
            {spinning ? '🎡 Spinning...' : '🎯 SPIN'}
          </button>
        </div>
      </div>

      {/* Roulette Wheel */}
      <div className="d-flex justify-content-center">
        <canvas 
          ref={canvasRef}
          className="rounded-circle border border-secondary-subtle"
          style={{ 
            width: '500px', 
            height: '500px',
            background: 'radial-gradient(circle, #34495e, #2c3e50)',
            cursor: spinning ? 'wait' : 'pointer'
          }}
          onClick={!spinning ? spin : undefined}
        />
      </div>

      {/* Status */}
      <div className="text-center mt-3 text-muted">
        {loading && 'Loading games...'}
        {!loading && !eligibleCount && 'No games match your filters'}
        {!loading && eligibleCount > 0 && !hasValidGames && 'Ready to spin · tap to shuffle'}
        {!loading && error && (
          <div className="small mt-1">{error}</div>
        )}
      </div>
    </div>
  )
}

export default SmartRoulette
