import React from 'react'

const COLORS = [
  '#5B8CFF', '#7BD389', '#FFB86B', '#FF6B6B', '#B197FC', '#63E6BE',
  '#74C0FC', '#FFD43B', '#69DB7C', '#FF8787', '#91A7FF', '#66D9E8'
]
function colorFor(i) { return COLORS[i % COLORS.length] }

export default function RedesignedWheel({ sample = [], spinSeed = null, selectedIndex = null, onStop }) {
  const canvasRef = React.useRef(null)
  const ctxRef = React.useRef(null)
  const angleRef = React.useRef(0)
  const rafRef = React.useRef(null)
  const SLOT_COUNT = sample?.length || 16

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
      ctx.fillStyle = game ? colorFor(i) : '#2a2a2a'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.stroke()

      if (game) {
        const mid = (start + end) / 2
        const tx = Math.cos(mid) * (r * 0.75)
        const ty = Math.sin(mid) * (r * 0.75)
        ctx.save()
        ctx.translate(tx, ty)
        let rot = mid
        if (mid > Math.PI/2 && mid < 3*Math.PI/2) rot += Math.PI
        ctx.rotate(rot)
        const fontSize = Math.max(12, Math.min(18, r / 18))
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.fillStyle = 'white'
        const label = (game.title || '').slice(0, 24)
        ctx.strokeText(label, 0, 0)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }

    // Selected highlight
    if (selectedIndex != null) {
      const s = selectedIndex * segAngle
      const e = (selectedIndex + 1) * segAngle
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, r, s, e)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = '#FFD700'
      ctx.stroke()
    }

    // Center hub
    ctx.beginPath()
    ctx.fillStyle = '#0e0e0e'
    ctx.arc(0,0, Math.max(22, r*0.12), 0, Math.PI*2)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.stroke()

    ctx.restore()
  }, [sample, SLOT_COUNT, selectedIndex])

  React.useEffect(() => { draw() }, [draw])

  // Animate spin using server spinSeed
  React.useEffect(() => {
    if (!spinSeed || typeof spinSeed.ts !== 'number') return
    if (!Array.isArray(sample) || !sample.length) return

    const segAngle = (Math.PI * 2) / SLOT_COUNT
    let targetIdx = spinSeed.targetIdx
    if (typeof targetIdx !== 'number') {
      // Fallback: compute from targetGameId if available
      if (spinSeed.targetGameId != null) {
        targetIdx = sample.findIndex(g => g && g.id === spinSeed.targetGameId)
      } else {
        targetIdx = 0
      }
    }
    targetIdx = Math.max(0, Math.min(SLOT_COUNT - 1, targetIdx))

    const turns = Math.max(3, Number(spinSeed.turns) || 8)
    const duration = Math.max(800, Number(spinSeed.durationMs) || 4500)
    const targetAngle = (Math.PI * 1.5) - (targetIdx * segAngle + segAngle / 2)
    const extra = Math.PI * 2 * turns
    const finalAngle = targetAngle + extra

    // Align to server ts
    const serverTs = Number(spinSeed.ts)
    const offset = Math.max(0, Date.now() - serverTs)
    const start = performance.now() - offset
    const startAngle = 0
    angleRef.current = 0

    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      angleRef.current = startAngle + (finalAngle - startAngle) * eased
      draw()
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else {
        rafRef.current = null
        onStop?.(targetIdx)
      }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [spinSeed, sample, SLOT_COUNT, draw, onStop])

  return (
    <div className="redesigned-wheel" style={{
      position: 'relative',
      width: 'min(80vmin, 640px)',
      height: 'min(80vmin, 640px)',
      margin: '0 auto',
      borderRadius: 24,
      background: 'linear-gradient(180deg, rgba(20,20,24,0.95) 0%, rgba(12,12,16,0.95) 100%)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.06)'
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }}
      />
      {/* Pointer */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: 8,
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '14px solid transparent',
        borderRight: '14px solid transparent',
        borderTop: 'none',
        borderBottom: '22px solid #FFD43B',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))'
      }} />
    </div>
  )
}

