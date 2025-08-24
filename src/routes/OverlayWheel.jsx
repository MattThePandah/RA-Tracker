import React from 'react'

function useInterval(cb, ms) {
  React.useEffect(() => {
    const id = setInterval(cb, ms)
    return () => clearInterval(id)
  }, [cb, ms])
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
  '#F1948A', '#85C1E9', '#F4D03F', '#A569BD'
]

function colorFor(i) {
  return COLORS[i % COLORS.length]
}

export default function OverlayWheel() {
  const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
  const canvasRef = React.useRef(null)
  const ctxRef = React.useRef(null)
  const angleRef = React.useRef(0)
  const rafRef = React.useRef(null)
  const [sample, setSample] = React.useState([])
  const [spinning, setSpinning] = React.useState(false)
  const [poolSize, setPoolSize] = React.useState(0)
  const selectedIdxRef = React.useRef(null)
  const lastSpinTs = React.useRef(0)
  const lastIdleHash = React.useRef('')
  const SLOT_COUNT = 16
  const [winner, setWinner] = React.useState(null)
  const [showStrip, setShowStrip] = React.useState(true)
  const [title, setTitle] = React.useState('Game Roulette')
  const spinHashRef = React.useRef('')
  const winnerTimeoutRef = React.useRef(null)

  // Read overlay options from query (?strip=0&title=...)
  React.useEffect(() => {
    const p = new URLSearchParams(location.search)
    if (p.get('strip') === '0') setShowStrip(false)
    if (p.get('title')) setTitle(p.get('title'))
    if (p.get('clean') === '1') {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [])

  const draw = React.useCallback(() => {
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
    const r = Math.min(w, h) / 2 - 12
    const angle = angleRef.current
    const segAngle = (Math.PI * 2) / SLOT_COUNT

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(w/2, h/2)
    ctx.rotate(angle)
    
    for (let i = 0; i < SLOT_COUNT; i++) {
      const start = i * segAngle
      const end = (i + 1) * segAngle
      const game = sample[i]
      
      ctx.beginPath()
      ctx.moveTo(0,0)
      ctx.arc(0,0,r,start,end)
      ctx.closePath()
      
      // Color based on whether slot has a game
      ctx.fillStyle = game ? colorFor(i) : '#333333'
      ctx.fill()
      
      // border
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Labels: only if game exists
      if (game) {
        const mid = (start + end) / 2
        const tx = Math.cos(mid) * (r * 0.78)
        const ty = Math.sin(mid) * (r * 0.78)
        ctx.save()
        ctx.translate(tx, ty)
        let rot = mid
        if (mid > Math.PI/2 && mid < (3*Math.PI/2)) rot += Math.PI
        ctx.rotate(rot)
        const fontSize = Math.max(12, Math.min(18, r / 18))
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 3
        ctx.strokeStyle = '#000'
        ctx.fillStyle = '#fff'
        const label = (game.title || '').slice(0, 24)
        ctx.strokeText(label, 0, 0)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
    // Selected highlight when idle
    if (!spinning && selectedIdxRef.current != null) {
      const segAngle = (Math.PI * 2) / SLOT_COUNT
      const s = selectedIdxRef.current * segAngle
      const e = (selectedIdxRef.current + 1) * segAngle
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, r, s, e)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 0, 0.35)'
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#FFD700'
      ctx.stroke()
    }
    // center hub
    ctx.beginPath()
    ctx.fillStyle = '#111'
    ctx.arc(0,0, Math.max(24, r*0.12), 0, Math.PI*2)
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.restore()

    // Canvas pointer removed - using CSS pointer instead
  }, [sample])

  React.useEffect(() => { draw() }, [sample, draw])

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (winnerTimeoutRef.current) clearTimeout(winnerTimeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const startSpin = React.useCallback((spin) => {
    const newSample = Array.isArray(spin.sample) ? spin.sample : []
    if (!newSample.some(g => g)) return // Need at least one valid game
    
    setSample(newSample)
    spinHashRef.current = spin.sampleHash || newSample.map(g => (g ? String(g.id) : '-')).join('|')
    setPoolSize(spin.poolSize || 0)
    setSpinning(true)
    selectedIdxRef.current = null
    setWinner(null)
    
    const segAngle = (Math.PI * 2) / SLOT_COUNT
    const targetIdx = Math.max(0, Math.min(SLOT_COUNT - 1, spin.targetIdx))
    const targetAngle = (Math.PI * 1.5) - (targetIdx * segAngle + segAngle / 2)
    const turns = Number(spin.turns) || 6
    const extra = Math.PI * 2 * turns
    const finalAngle = targetAngle + extra
    const duration = Number(spin.durationMs) || 4500
    // Align with server ts so Select and Overlay stay in sync
    const serverTs = Number(spin.ts) || Date.now()
    const offset = Math.max(0, Date.now() - serverTs)
    const start = performance.now() - offset
    // Reset baseline for deterministic travel distance
    angleRef.current = 0
    const startAngle = 0
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      angleRef.current = startAngle + (finalAngle - startAngle) * eased
      draw()
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else {
        setSpinning(false)
        selectedIdxRef.current = targetIdx
        const g = newSample[targetIdx]
        if (g) {
          setWinner(g)
          console.log('Overlay wheel winner selected:', g.title, 'at index:', targetIdx)
          // Clear winner after 10 seconds to allow updates
          if (winnerTimeoutRef.current) clearTimeout(winnerTimeoutRef.current)
          winnerTimeoutRef.current = setTimeout(() => {
            console.log('Clearing winner to allow new updates')
            setWinner(null)
            spinHashRef.current = '' // Clear spin hash to allow idle updates
          }, 10000)
        } else {
          console.log('No winner found at target index:', targetIdx, 'sample:', newSample)
        }
        draw()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [draw])

  // Poll server for spins and initial state for idle rendering
  const fetchSpin = React.useCallback(async () => {
    try {
      if (!base) return
      const res = await fetch(`${base}/overlay/spin`)
      if (res.ok) {
        const json = await res.json()
        if (json.ts && json.ts !== lastSpinTs.current) {
          console.log('New spin detected, ts:', json.ts, 'targetIdx:', json.targetIdx, 'sample size:', json.sample?.length)
          lastSpinTs.current = json.ts
          startSpin(json)
        }
        // Always check idle wheel-state for updates when not spinning
        const r2 = await fetch(`${base}/overlay/wheel-state`)
        if (r2.ok) {
          const j2 = await r2.json()
          console.log('Fetched wheel-state:', { sampleSize: j2.sample?.length, poolSize: j2.poolSize, spinning, winner: !!winner })
          // Do not update idle sample while showing winner; keep result on screen
          if (!spinning && !winner && Array.isArray(j2.sample)) {
            const hash = (arr) => arr.map(g => (g ? String(g.id) : '-') ).join('|')
            const newHash = hash(j2.sample)
            console.log('Hash comparison - current:', lastIdleHash.current, 'new:', newHash, 'spin hash:', spinHashRef.current)
            // If a spin hash is present (just spun), ignore idle updates until hash changes again
            if (spinHashRef.current && newHash === spinHashRef.current) {
              console.log('Ignoring idle update - matches recent spin hash')
              return
            }
            if (newHash && newHash !== lastIdleHash.current) {
              console.log('Updating overlay wheel with new sample:', j2.sample.filter(g => g).length, 'games')
              lastIdleHash.current = newHash
              setSample(j2.sample)
              setPoolSize(j2.poolSize || 0)
              selectedIdxRef.current = null
              // Clear winner if we get a new sample (user refreshed games)
              if (winner) {
                console.log('Clearing winner due to new sample')
                setWinner(null)
                if (winnerTimeoutRef.current) {
                  clearTimeout(winnerTimeoutRef.current)
                  winnerTimeoutRef.current = null
                }
              }
              draw()
            } else if (newHash && newHash === lastIdleHash.current) {
              console.log('Sample unchanged, hash:', newHash)
            }
          }
        } else {
          console.log('Failed to fetch wheel-state:', r2.status, r2.statusText)
        }
      }
    } catch {}
  }, [base, spinning, winner, startSpin, draw])

  useInterval(fetchSpin, 250)

  return (
    <div className="overlay-chrome d-flex align-items-center justify-content-center position-relative" style={{width:'100vw', height:'100vh'}}>
      {/* Modern Header */}
      <div className="modern-wheel-header text-center">
        <div className="wheel-title">{title}</div>
        <div className="wheel-stats">
          <span className="stat-chip">
            <i className="bi bi-collection"></i>
            {poolSize.toLocaleString()} games
          </span>
          {spinning && (
            <span className="stat-chip spinning-indicator">
              <i className="bi bi-arrow-repeat"></i>
              Spinning...
            </span>
          )}
        </div>
      </div>

      {/* Modern Wheel Container */}
      <div className={`modern-wheel-container ${spinning ? 'spinning' : ''}`}>
        <div className="wheel-backdrop"></div>
        <canvas 
          ref={canvasRef} 
          className="wheel-canvas" 
          style={{
            background:'transparent', 
            width:'min(80vmin, 600px)', 
            height:'min(80vmin, 600px)'
          }} 
        />
        <div className="wheel-pointer">
          <div className="pointer-triangle"></div>
        </div>
      </div>

      {/* Modern Winner Display */}
      {winner && !spinning && (
        <div className="modern-winner-card">
          <div className="winner-glow"></div>
          <div className="winner-content">
            <div className="winner-cover">
              {winner.image_url ? (
                <img src={base ? `${base}/cover?src=${encodeURIComponent(winner.image_url)}` : winner.image_url} alt="" />
              ) : (
                <div className="cover-placeholder">
                  <i className="bi bi-controller"></i>
                </div>
              )}
            </div>
            <div className="winner-info">
              <div className="winner-badge">🎉 WINNER</div>
              <div className="winner-title">{winner.title}</div>
              <div className="winner-meta">
                {winner.console}{winner.release_year ? ` • ${winner.release_year}` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Sample Strip */}
      {!spinning && !winner && showStrip && sample && sample.length > 0 && (
        <div className="modern-sample-strip">
          <div className="strip-label">Available Games</div>
          <div className="strip-covers">
            {sample.slice(0, 12).map((g, i) => (
              <div key={i} className={`strip-cover ${g ? '' : 'empty'}`}>
                {g && g.image_url && (
                  <img src={base ? `${base}/cover?src=${encodeURIComponent(g.image_url)}` : g.image_url} alt="" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
