import React, { useEffect, useRef, useState, useCallback } from 'react'
import { buildCoverUrl } from '../utils/coverUrl.js'

const RETRO_COLORS = [
    '#FF5555', '#55FF55', '#5555FF', '#FFFF55', '#FF55FF', '#55FFFF',
    '#FF9955', '#99FF55', '#5599FF', '#FF5599', '#9955FF', '#55FF99'
]

function colorFor(i) {
    return RETRO_COLORS[i % RETRO_COLORS.length]
}

export default function UnifiedWheel({
    mode = 'game', // 'console' | 'game'
    sample = [], // Array of items (objects for games, strings/objects for consoles)
    spinSeed = null, // { ts, targetIdx, durationMs, turns }
    onSpinComplete,
    isOverlay = false,
    winnerHoldMs = 2500,
    winnerFadeMs = 450,
    showWinnerOverlay = true
}) {
    const canvasRef = useRef(null)
    const ctxRef = useRef(null)
    const angleRef = useRef(0)
    const rafRef = useRef(null)
    const lastSpinTsRef = useRef(null)
    const onSpinCompleteRef = useRef(onSpinComplete)
    const sampleRef = useRef(sample)
    const [winner, setWinner] = useState(null)
    const [winnerIndex, setWinnerIndex] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [winnerFading, setWinnerFading] = useState(false)
    const winnerTimerRef = useRef(null)
    const winnerFadeTimerRef = useRef(null)
    const prevModeRef = useRef(mode)
    const prevSampleKeyRef = useRef('')

    const SLOT_COUNT = 16

    const normalizeSample = useCallback((s) => {
        const arr = Array.isArray(s) && s.length ? s.slice(0, SLOT_COUNT) : []
        if (arr.length < SLOT_COUNT) arr.push(...Array(SLOT_COUNT - arr.length).fill(null))
        return arr
    }, [SLOT_COUNT])

    const [displaySample, setDisplaySample] = useState(() => normalizeSample(sample))

    useEffect(() => {
        onSpinCompleteRef.current = onSpinComplete
    }, [onSpinComplete])

    useEffect(() => {
        sampleRef.current = sample
    }, [sample])

    const sampleKey = useCallback((s) => {
        const arr = Array.isArray(s) ? s.slice(0, SLOT_COUNT) : []
        return arr.map(item => {
            if (!item) return '-'
            if (typeof item === 'string') return item
            if (typeof item !== 'object') return String(item)
            return String(item.id || item.title || item.name || 'item')
        }).join('|')
    }, [SLOT_COUNT])

    useEffect(() => {
        const key = sampleKey(sample)
        const modeChanged = prevModeRef.current !== mode
        const sampleChanged = prevSampleKeyRef.current !== key

        // Track baselines so we can distinguish "spin ended" from "content changed".
        if (!prevSampleKeyRef.current) prevSampleKeyRef.current = key
        prevModeRef.current = mode

        // During an active spin, don't let external sample updates clear the winner/animation.
        if (spinning) return

        if (!modeChanged && !sampleChanged) return
        prevSampleKeyRef.current = key

        setDisplaySample(normalizeSample(sample))
        setWinner(null)
        setWinnerIndex(null)
        setWinnerFading(false)
        if (winnerTimerRef.current) {
            clearTimeout(winnerTimerRef.current)
            winnerTimerRef.current = null
        }
        if (winnerFadeTimerRef.current) {
            clearTimeout(winnerFadeTimerRef.current)
            winnerFadeTimerRef.current = null
        }
    }, [sample, mode, spinning, normalizeSample, sampleKey])

    // Sync spin state
    useEffect(() => {
        const ts = Number(spinSeed?.ts)
        if (!Number.isFinite(ts) || ts <= 0) return
        if (ts === lastSpinTsRef.current) return

        const seedSample = Array.isArray(spinSeed?.sample) && spinSeed.sample.length
            ? spinSeed.sample
            : sampleRef.current
        const nextSample = normalizeSample(seedSample)

        const targetIdx = Math.max(0, Math.min(SLOT_COUNT - 1, Number(spinSeed?.targetIdx) || 0))
        const duration = Number(spinSeed?.durationMs) || 4500
        const turns = Number(spinSeed?.turns) || 8

        const ageMs = Date.now() - ts
        // Avoid replaying old spins (e.g. mode toggles / reloads) in the admin UI.
        // Overlay can still render "late", but we shouldn't trigger admin side-effects for stale spins.
        if (!isOverlay && ageMs > (duration + 1000)) {
            lastSpinTsRef.current = ts
            setWinner(null)
            setWinnerIndex(null)
            setSpinning(false)
            return
        }

        lastSpinTsRef.current = ts

        setDisplaySample(nextSample)
        setSpinning(true)
        setWinner(null)
        setWinnerIndex(null)

        const segAngle = (Math.PI * 2) / SLOT_COUNT
        const targetAngle = (Math.PI * 1.5) - (targetIdx * segAngle + segAngle / 2)
        const extra = Math.PI * 2 * turns
        const finalAngle = targetAngle + extra

        // Sync with server time
        const nowMs = Date.now()
        let offset = nowMs - ts

        // If not isOverlay, we usually want to see the whole spin even if we are late
        // If it's the overlay, we MUST be synced to prevent double-results if user refreshes
        let start = performance.now() - offset

        if (!isOverlay) {
            // Admin panel: If just arrived or small delay, play normally
            // If huge negative drift (client behind), or huge positive drift (client ahead)
            // just play from now to ensure visual feedback.
            if (offset < 0 || offset > 2000) {
                console.log('[Wheel] Large drift detected in Admin, starting from now', { offset })
                start = performance.now()
                offset = 0
            }
        } else {
            // Overlay: Be strict but handle negative drift
            if (offset < 0) offset = 0
            start = performance.now() - offset
        }

        const tick = (t) => {
            const elapsed = t - start
            const p = Math.min(1, Math.max(0, elapsed / duration))
            // Ease out cubic
            const eased = 1 - Math.pow(1 - p, 3)

            let currentAngle
            if (p >= 1) {
                currentAngle = finalAngle
            } else if (p < 0) {
                currentAngle = 0
            } else {
                currentAngle = (finalAngle * eased)
            }

            angleRef.current = currentAngle % (Math.PI * 2)
            // Actually we want cumulative rotation for visual effect, modulo only for final reading?
            // No, for the wheel spin we want cumulative.
            angleRef.current = currentAngle

            drawRef.current()

            if (p < 1) {
                rafRef.current = requestAnimationFrame(tick)
            } else {
                setSpinning(false)
                const winItem = nextSample[targetIdx] || null
                setWinner(winItem)
                setWinnerIndex(targetIdx)
                if (onSpinCompleteRef.current) onSpinCompleteRef.current(winItem)

                if (isOverlay) {
                    const hold = Math.max(0, Number(winnerHoldMs) || 0)
                    const fade = Math.max(0, Number(winnerFadeMs) || 0)
                    if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current)
                    if (winnerFadeTimerRef.current) clearTimeout(winnerFadeTimerRef.current)
                    winnerTimerRef.current = setTimeout(() => {
                        setWinnerFading(true)
                        winnerFadeTimerRef.current = setTimeout(() => {
                            setWinner(null)
                            setWinnerIndex(null)
                            setWinnerFading(false)
                        }, fade)
                    }, hold)
                }
            }
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(tick)

        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }, [spinSeed?.ts, isOverlay, normalizeSample, winnerHoldMs, winnerFadeMs])

    const drawRef = useRef(() => { })

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
        const r = Math.min(w, h) / 2 - (isOverlay ? 10 : 20)

        const angle = angleRef.current
        const segAngle = (Math.PI * 2) / SLOT_COUNT

        ctx.clearRect(0, 0, w, h)

        // Paint Background (CRT Black)
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.rotate(angle)

        for (let i = 0; i < SLOT_COUNT; i++) {
            const start = i * segAngle
            const end = (i + 1) * segAngle
            const item = displaySample[i]

            ctx.beginPath()
            ctx.moveTo(0, 0)
            ctx.arc(0, 0, r, start, end)
            ctx.closePath()

            // Fill
            if (item) {
                ctx.fillStyle = isOverlay ? '#111' : '#1a1a1a'
                ctx.fill()

                ctx.strokeStyle = colorFor(i)
                ctx.lineWidth = 2
                ctx.stroke()

                // Inner glow for active
                ctx.fillStyle = colorFor(i)
                ctx.globalAlpha = 0.1
                ctx.fill()
                ctx.globalAlpha = 1.0
            } else {
                ctx.fillStyle = '#050505'
                ctx.fill()
                ctx.strokeStyle = '#222'
                ctx.lineWidth = 1
                ctx.stroke()
            }

            // Text
            if (item) {
                const mid = (start + end) / 2
                const tx = Math.cos(mid) * (r * 0.75)
                const ty = Math.sin(mid) * (r * 0.75)

                ctx.save()
                ctx.translate(tx, ty)
                let rot = mid
                if (mid > Math.PI / 2 && mid < (3 * Math.PI / 2)) rot += Math.PI
                ctx.rotate(rot)

                let label = ''
                if (item) {
                    if (typeof item === 'string') label = item
                    else if (item.title) label = typeof item.title === 'string' ? item.title : (item.title.name || item.title.id || 'Unknown')
                    else if (item.name) label = item.name
                }
                const cleaned = String(label || '').trim()
                const trimmed = cleaned.length > 18 ? `${cleaned.slice(0, 17)}…` : cleaned
                // Font size adaptation
                const baseSize = isOverlay ? 18 : 16
                const fontSize = trimmed.length > 16 ? Math.max(12, baseSize - 2) : baseSize
                ctx.font = `bold ${fontSize}px "Chakra Petch", monospace`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'

                if (isOverlay && trimmed) {
                    const metrics = ctx.measureText(trimmed)
                    const padX = 7
                    const padY = 5
                    const boxW = metrics.width + padX * 2
                    const boxH = fontSize + padY * 2
                    const x = -boxW / 2
                    const y = -boxH / 2
                    const radius = 8
                    ctx.save()
                    ctx.beginPath()
                    if (typeof ctx.roundRect === 'function') {
                        ctx.roundRect(x, y, boxW, boxH, radius)
                    } else {
                        ctx.moveTo(x + radius, y)
                        ctx.lineTo(x + boxW - radius, y)
                        ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + radius)
                        ctx.lineTo(x + boxW, y + boxH - radius)
                        ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - radius, y + boxH)
                        ctx.lineTo(x + radius, y + boxH)
                        ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - radius)
                        ctx.lineTo(x, y + radius)
                        ctx.quadraticCurveTo(x, y, x + radius, y)
                    }
                    ctx.closePath()
                    ctx.fillStyle = 'rgba(0,0,0,0.65)'
                    ctx.fill()
                    ctx.lineWidth = 1
                    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
                    ctx.stroke()
                    ctx.restore()
                }

                // Stroke text for readability
                ctx.shadowColor = 'rgba(0,0,0,0.8)'
                ctx.shadowBlur = 2
                ctx.lineWidth = isOverlay ? 5 : 3
                ctx.strokeStyle = 'rgba(0,0,0,0.95)'
                ctx.strokeText(trimmed || '', 0, 0)

                ctx.shadowColor = 'transparent'
                ctx.shadowBlur = 0
                ctx.fillStyle = isOverlay ? '#ffffff' : colorFor(i)
                ctx.fillText(trimmed || '', 0, 0)

                ctx.restore()
            }
        }

        // Center Hub
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2)
        ctx.fillStyle = '#000'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#fff'
        ctx.stroke()

        ctx.restore()

        // Pointer (Static)
        const pointerSize = isOverlay ? 16 : 24
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 4
        ctx.fillStyle = '#FFD700'
        ctx.beginPath()
        ctx.moveTo(w / 2 - pointerSize / 2, pointerSize)
        ctx.lineTo(w / 2 + pointerSize / 2, pointerSize)
        ctx.lineTo(w / 2, pointerSize * 2.5)
        ctx.closePath()
        ctx.fill()
        ctx.shadowBlur = 0

    }, [displaySample, isOverlay, SLOT_COUNT])

    useEffect(() => {
        drawRef.current = draw
    }, [draw])

    // Initial draw + redraw on sample changes
    useEffect(() => {
        draw()
    }, [draw])

    return (
        <div className={`unified-wheel-container ${mode} ${isOverlay ? 'overlay' : ''}`} style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />

            {showWinnerOverlay && winner && !spinning && (
                (() => {
                    const idx = Number.isInteger(winnerIndex) && winnerIndex >= 0 ? winnerIndex : 0
                    const color = RETRO_COLORS[idx % RETRO_COLORS.length]
                    return (
                <div className={`wheel-winner-overlay fade-in${winnerFading ? ' fade-out' : ''}`} style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0,0,0,0.9)',
                    border: `2px solid ${color}`,
                    padding: 20,
                    borderRadius: 12,
                    textAlign: 'center',
                    boxShadow: `0 0 30px ${color}`,
                    zIndex: 10,
                    minWidth: 200,
                    opacity: winnerFading ? 0 : 1,
                    transition: `opacity ${Math.max(0, Number(winnerFadeMs) || 0)}ms ease`,
                    pointerEvents: 'none'
                }}>
                    {mode === 'game' && winner.image_url && (
                        <img src={buildCoverUrl(winner.image_url)} alt="" style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 10 }} />
                    )}
                    {isOverlay && (
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: '0.25em', opacity: 0.85, marginBottom: 8 }}>
                            WINNER
                        </div>
                    )}
                    <div style={{ color: '#fff', fontSize: isOverlay ? 34 : 18, fontWeight: 'bold', fontFamily: '"Chakra Petch", monospace', lineHeight: 1.1 }}>
                        {winner.title || (typeof winner === 'string' ? winner : 'Unknown')}
                    </div>
                    {mode === 'game' && (
                        <div style={{ color: '#aaa', fontSize: 12 }}>
                            {winner.console && (typeof winner.console === 'object' ? (winner.console.name || winner.console.id) : winner.console)}
                        </div>
                    )}
                    {mode === 'console' && (
                        <div style={{ color: '#aaa', fontSize: 12 }}>SELECTED SYSTEM</div>
                    )}
                </div>
                    )
                })()
            )}
        </div>
    )
}
