import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildOverlayUrl } from '../utils/overlayApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'

function useInterval(cb, ms) {
  useEffect(() => {
    const id = setInterval(cb, ms)
    return () => clearInterval(id)
  }, [cb, ms])
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeInCubic(t) {
  return t * t * t
}

function mulberry32(seed) {
  let a = (Number(seed) || 0) >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cleanLabel(value) {
  let s = String(value || '').trim()
  s = s.replace(/~[^~]+~/g, ' ')
  s = s.replace(/\[\s*Subset[^\]]*\]/gi, ' ')
  s = s.split('|')[0]
  return s.replace(/\s+/g, ' ').trim()
}

function getItemTitle(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  if (typeof item !== 'object') return String(item)
  return String(item.title || item.name || '')
}

function ellipsizeToWidth(ctx, text, maxWidth) {
  const s = String(text || '')
  if (!s) return ''
  if (ctx.measureText(s).width <= maxWidth) return s
  const ellipsis = '…'
  if (ctx.measureText(ellipsis).width > maxWidth) return ''
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = s.slice(0, mid) + ellipsis
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return s.slice(0, lo) + ellipsis
}

function hashHue(key) {
  let h = 0
  const s = String(key || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

const SPIN_PHASES = [
  { key: 'search', weight: 0.26, minMs: 900 },
  { key: 'move', weight: 0.14, minMs: 650 },
  { key: 'down', weight: 0.14, minMs: 750 },
  { key: 'close', weight: 0.08, minMs: 350 },
  { key: 'lift', weight: 0.14, minMs: 800 },
  { key: 'toChute', weight: 0.14, minMs: 800 },
  { key: 'drop', weight: 0.10, minMs: 800 }
]

function computeSpinTimings(durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0)
  if (!duration) {
    return {
      tSearch: 0,
      tMove: 0,
      tDown: 0,
      tClose: 0,
      tLift: 0,
      tToChute: 0,
      tDrop: 0,
      t1: 0,
      t2: 0,
      t3: 0,
      t4: 0,
      t5: 0,
      t6: 0,
      t7: 0
    }
  }

  const times = {}
  for (const phase of SPIN_PHASES) {
    const ideal = duration * phase.weight
    times[phase.key] = Math.max(ideal, phase.minMs)
  }

  let total = Object.values(times).reduce((a, b) => a + b, 0)
  if (total > duration) {
    const scale = duration / total
    for (const key of Object.keys(times)) times[key] *= scale
    total = duration
  }

  const tSearch = times.search
  const tMove = times.move
  const tDown = times.down
  const tClose = times.close
  const tLift = times.lift
  const tToChute = times.toChute
  const tDrop = times.drop

  const t1 = tSearch
  const t2 = t1 + tMove
  const t3 = t2 + tDown
  const t4 = t3 + tClose
  const t5 = t4 + tLift
  const t6 = t5 + tToChute
  const t7 = Math.min(duration, t6 + tDrop)

  // Ensure we always finish within duration; any leftover is treated as an implicit hold.
  return { tSearch, tMove, tDown, tClose, tLift, tToChute, tDrop, t1, t2, t3, t4, t5, t6, t7 }
}

function makeCapsules(sample, bounds, radius) {
  const items = Array.isArray(sample) ? sample.slice(0, 16) : []
  const capsules = []
  const pad = radius + 8
  for (let i = 0; i < 16; i++) {
    const item = items[i] || null
    const key = item ? (item.id || item.title || item.name || `slot-${i}`) : `empty-${i}`
    const hue = hashHue(key)
    const x = bounds.x + pad + Math.random() * Math.max(1, bounds.w - pad * 2)
    const y = bounds.y + pad + Math.random() * Math.max(1, bounds.h - pad * 2)
    const speed = 0.035 + Math.random() * 0.045
    const angle = Math.random() * Math.PI * 2
    capsules.push({
      slot: i,
      item,
      key,
      hue,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      wander: Math.random() * 1000,
      r: radius
    })
  }
  return capsules
}

export default function CrtCapsuleMachine({
  base = 'http://localhost:8787',
  onStateChange,
  pinned = false
}) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const rafRef = useRef(null)

  const [wheelState, setWheelState] = useState({
    mode: 'game',
    sample: [],
    spin: null,
    selectedConsole: 'All',
    event: { name: '', consoles: [] }
  })

  const lastSpinTs = useRef(0)
  const spinInProgressRef = useRef(false)
  const activeUntilRef = useRef(0)
  const holdUntilRef = useRef(0)
  const [visible, setVisible] = useState(false)

  const onStateChangeRef = useRef(onStateChange)
  useEffect(() => { onStateChangeRef.current = onStateChange }, [onStateChange])

  const lastReportRef = useRef({})
  const report = useCallback((payload) => {
    const prev = lastReportRef.current || {}
    const next = payload || {}
    const same =
      prev.active === next.active &&
      prev.mode === next.mode &&
      prev.selectedConsole === next.selectedConsole &&
      prev.spinTs === next.spinTs &&
      prev.spinning === next.spinning
    if (same) return
    lastReportRef.current = next
    onStateChangeRef.current?.(payload)
  }, [])

  const capsulesRef = useRef([])
  const targetSlotRef = useRef(null)
  const carriedSlotRef = useRef(null)
  const spinStartRef = useRef(0)
  const spinSeedRef = useRef(null)
  const spinSearchRef = useRef({ phase: 0, lanes: [0.5, 0.2, 0.8] })
  const spinReportedRef = useRef(false)
  const spinCompleteTimerRef = useRef(null)

  const imageCacheRef = useRef(new Map())

  const getOrLoadImage = useCallback((url) => {
    if (!url) return null
    const cache = imageCacheRef.current
    if (cache.has(url)) return cache.get(url)
    const img = new Image()
    img.decoding = 'async'
    img.loading = 'eager'
    img.src = buildCoverUrl(url)
    cache.set(url, img)
    return img
  }, [])

  const computeLayout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      const ctx = canvas.getContext('2d')
      ctxRef.current = ctx
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    const cabinetPad = Math.max(10, Math.min(w, h) * 0.04)
    const cabinet = { x: cabinetPad, y: cabinetPad, w: w - cabinetPad * 2, h: h - cabinetPad * 2 }
    const marqueeH = Math.max(34, Math.min(62, cabinet.h * 0.12))
    const baseH = Math.max(46, Math.min(92, cabinet.h * 0.18))

    const glass = {
      x: cabinet.x + cabinet.w * 0.06,
      y: cabinet.y + marqueeH + cabinet.h * 0.02,
      w: cabinet.w * 0.88,
      h: cabinet.h - marqueeH - baseH - cabinet.h * 0.05
    }

    const chute = {
      x: cabinet.x + cabinet.w * 0.70,
      y: cabinet.y + cabinet.h - baseH + baseH * 0.18,
      w: cabinet.w * 0.22,
      h: baseH * 0.55
    }

    const knob = {
      x: cabinet.x + cabinet.w * 0.22,
      y: cabinet.y + cabinet.h - baseH + baseH * 0.52,
      r: Math.max(14, Math.min(28, baseH * 0.22))
    }

    const radius = clamp(Math.min(glass.w, glass.h) * 0.09, 18, 34)
    return { w, h, cabinet, marqueeH, baseH, jar: glass, chute, knob, radius }
  }, [])

  const ensureCapsules = useCallback((sample) => {
    const layout = computeLayout()
    if (!layout) return
    capsulesRef.current = makeCapsules(sample, layout.jar, layout.radius)
    for (const c of capsulesRef.current) {
      const url = c.item?.image_url
      if (url) getOrLoadImage(url)
    }
  }, [computeLayout, getOrLoadImage])

  // Keep capsules in sync when idle sample changes and we're not spinning/holding a result.
  useEffect(() => {
    const now = Date.now()
    const isHolding = now < holdUntilRef.current
    if (spinInProgressRef.current || isHolding) return
    ensureCapsules(wheelState.sample)
  }, [wheelState.sample, ensureCapsules])

  const drawCapsule = useCallback((ctx, capsule) => {
    const item = capsule?.item
    const hue = capsule?.hue ?? 0
    const x = Number(capsule?.x) || 0
    const y = Number(capsule?.y) || 0
    const rr = Number(capsule?.r) || 20
    const topColor = `hsla(${hue}, 85%, 62%, 0.92)`
    const botColor = `hsla(${(hue + 22) % 360}, 85%, 42%, 0.92)`

    // Capsule shadow
    ctx.beginPath()
    ctx.ellipse(x, y + rr * 0.35, rr * 0.9, rr * 0.35, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fill()

    // Capsule body
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, Math.PI * 2)
    ctx.closePath()
    const g = ctx.createLinearGradient(x, y - rr, x, y + rr)
    g.addColorStop(0, topColor)
    g.addColorStop(0.5, topColor)
    g.addColorStop(0.5, botColor)
    g.addColorStop(1, botColor)
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.stroke()

    // Glass highlight
    ctx.beginPath()
    ctx.ellipse(x - rr * 0.25, y - rr * 0.2, rr * 0.35, rr * 0.55, -0.35, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fill()
    ctx.restore()

    // Cover thumbnail
    const coverUrl = item?.image_url || null
    const img = coverUrl ? imageCacheRef.current.get(coverUrl) : null
    if (img && img.complete && img.naturalWidth > 0) {
      const size = rr * 1.05
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, size * 0.42, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, x - size * 0.42, y - size * 0.42, size * 0.84, size * 0.84)
      ctx.restore()
      ctx.beginPath()
      ctx.arc(x, y, size * 0.42, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const title = cleanLabel(getItemTitle(item))
    if (title) {
      ctx.save()
      ctx.font = `700 ${Math.max(10, Math.floor(rr * 0.34))}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const maxW = rr * 1.6
      const text = ellipsizeToWidth(ctx, title, maxW)
      const boxW = ctx.measureText(text).width + 10
      const boxH = Math.max(14, rr * 0.45)
      const bx = x - boxW / 2
      const by = y + rr * 0.65
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, boxW, boxH, 8)
      else ctx.rect(bx, by, boxW, boxH)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.fillText(text, x, by + 3)
      ctx.restore()
    }
  }, [])

  const draw = useCallback((t) => {
    const layout = computeLayout()
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!layout || !canvas || !ctx) return

    const { w, h, cabinet, marqueeH, baseH, jar, chute, knob, radius } = layout
    ctx.clearRect(0, 0, w, h)

    // Cabinet body
    ctx.save()
    const bodyGrad = ctx.createLinearGradient(0, cabinet.y, 0, cabinet.y + cabinet.h)
    bodyGrad.addColorStop(0, 'rgba(18,18,22,0.85)')
    bodyGrad.addColorStop(0.65, 'rgba(8,8,10,0.92)')
    bodyGrad.addColorStop(1, 'rgba(0,0,0,0.95)')
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(cabinet.x, cabinet.y, cabinet.w, cabinet.h, 26)
    else ctx.rect(cabinet.x, cabinet.y, cabinet.w, cabinet.h)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.stroke()
    ctx.restore()

    // Marquee
    ctx.save()
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(cabinet.x + 6, cabinet.y + 6, cabinet.w - 12, marqueeH, 18)
    else ctx.rect(cabinet.x + 6, cabinet.y + 6, cabinet.w - 12, marqueeH)
    const marqueeGrad = ctx.createLinearGradient(0, cabinet.y + 6, 0, cabinet.y + 6 + marqueeH)
    marqueeGrad.addColorStop(0, 'rgba(255,215,0,0.16)')
    marqueeGrad.addColorStop(1, 'rgba(0,255,180,0.08)')
    ctx.fillStyle = marqueeGrad
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = `800 ${Math.max(14, Math.floor(marqueeH * 0.42))}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('CAPSULE PICK', cabinet.x + cabinet.w / 2, cabinet.y + 6 + marqueeH / 2)
    const lightCount = 10
    const ltY = cabinet.y + 6 + marqueeH - 8
    for (let i = 0; i < lightCount; i++) {
      const p = (i + 0.5) / lightCount
      const lx = cabinet.x + 18 + p * (cabinet.w - 36)
      const phase = ((performance.now() / 900) + i * 0.16) % 1
      const on = phase < 0.55
      ctx.beginPath()
      ctx.arc(lx, ltY, 4, 0, Math.PI * 2)
      ctx.fillStyle = on ? 'rgba(255,215,0,0.8)' : 'rgba(255,255,255,0.12)'
      ctx.fill()
    }
    ctx.restore()

    // Glass window
    ctx.save()
    ctx.beginPath()
    const r = Math.max(18, Math.min(jar.w, jar.h) * 0.06)
    if (typeof ctx.roundRect === 'function') ctx.roundRect(jar.x, jar.y, jar.w, jar.h, r)
    else ctx.rect(jar.x, jar.y, jar.w, jar.h)
    ctx.closePath()
    const glassFill = ctx.createLinearGradient(jar.x, jar.y, jar.x, jar.y + jar.h)
    glassFill.addColorStop(0, 'rgba(255,255,255,0.07)')
    glassFill.addColorStop(0.35, 'rgba(255,255,255,0.03)')
    glassFill.addColorStop(1, 'rgba(0,0,0,0.18)')
    ctx.fillStyle = glassFill
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.stroke()
    // reflection
    ctx.beginPath()
    ctx.ellipse(jar.x + jar.w * 0.20, jar.y + jar.h * 0.42, jar.w * 0.08, jar.h * 0.32, 0.15, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.restore()

    const capsules = capsulesRef.current || []

    // Physics step (idle only)
    const nowMs = performance.now()
    const seed = spinSeedRef.current
    const spinning = spinInProgressRef.current
    const holding = Date.now() < holdUntilRef.current
    const dt = 16
    if (!spinning && !holding) {
      // Simple separation so capsules don't collapse into a clump.
      for (let i = 0; i < capsules.length; i++) {
        for (let j = i + 1; j < capsules.length; j++) {
          const a = capsules[i]
          const b = capsules[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 1
          const minDist = (a.r + b.r) * 0.9
          if (dist >= minDist) continue
          const push = (minDist - dist) / minDist
          const nx = dx / dist
          const ny = dy / dist
          const s = 0.18 * push
          a.x -= nx * s
          a.y -= ny * s
          b.x += nx * s
          b.y += ny * s
          // Add a tiny velocity bias so separation persists.
          a.vx -= nx * 0.003 * push
          a.vy -= ny * 0.003 * push
          b.vx += nx * 0.003 * push
          b.vy += ny * 0.003 * push
        }
      }

      for (const c of capsules) {
        c.x += c.vx * dt
        c.y += c.vy * dt
        // Slow wandering so capsules stay distributed without "collapsing" to center.
        c.wander = (Number(c.wander) || 0) + 0.015
        c.vx += Math.cos(c.wander) * 0.00022
        c.vy += Math.sin(c.wander * 0.9) * 0.00022
        // Damping keeps it calm.
        c.vx *= 0.996
        c.vy *= 0.996

        // Keep a minimum drift so they don't "settle".
        const speedNow = Math.hypot(c.vx, c.vy)
        if (speedNow < 0.01) {
          const a = c.wander * 1.7
          c.vx += Math.cos(a) * 0.004
          c.vy += Math.sin(a) * 0.004
        }

        const minX = jar.x + c.r + 10
        const maxX = jar.x + jar.w - c.r - 10
        const minY = jar.y + c.r + 12
        const maxY = jar.y + jar.h - c.r - 12
        if (c.x < minX) { c.x = minX; c.vx = Math.abs(c.vx) }
        if (c.x > maxX) { c.x = maxX; c.vx = -Math.abs(c.vx) }
        if (c.y < minY) { c.y = minY; c.vy = Math.abs(c.vy) }
        if (c.y > maxY) { c.y = maxY; c.vy = -Math.abs(c.vy) }
      }
    }

    // Determine claw + carry positions during spin
    let clawX = jar.x + jar.w / 2
    let clawY = jar.y - radius * 1.6
    let clawOpen = 1
    let carried = null

    const chuteX = chute.x + chute.w * 0.5
    const chuteTopY = jar.y - radius * 1.6
    const chuteDropY = chute.y + chute.h - radius * 0.25

    if (spinning && seed) {
      const duration = Number(seed.durationMs) || 4500
      const ts = Number(seed.ts) || Date.now()
      const offset = clamp(Date.now() - ts, 0, duration)
      const start = spinStartRef.current || (nowMs - offset)
      const elapsed = clamp(nowMs - start, 0, duration)

      // Phase timing: search -> move to target -> grab -> lift -> to chute -> drop -> hold.
      const timings = computeSpinTimings(duration)
      const tSearch = timings.tSearch
      const tMove = timings.tMove
      const tDown = timings.tDown
      const tClose = timings.tClose
      const tLift = timings.tLift
      const tToChute = timings.tToChute
      const tDrop = timings.tDrop
      const t1 = timings.t1
      const t2 = timings.t2
      const t3 = timings.t3
      const t4 = timings.t4
      const t5 = timings.t5
      const t6 = timings.t6
      const t7 = timings.t7

      const targetSlot = targetSlotRef.current
      const target = capsules.find(c => c.slot === targetSlot) || capsules[0] || null
      const tx = target ? target.x : (jar.x + jar.w / 2)
      const ty = target ? target.y : (jar.y + jar.h / 2)
      const topY = jar.y - radius * 1.6
      const grabY = clamp(ty - radius * 0.15, jar.y + radius, jar.y + jar.h - radius)

      if (elapsed <= t1) {
        // Search sweep: side-to-side like it's "looking" before committing.
        const p = clamp(elapsed / tSearch, 0, 1)
        const sweep = Math.sin((p * Math.PI * 2 * 0.85) + spinSearchRef.current.phase)
        const laneIdx = Math.floor(p * spinSearchRef.current.lanes.length) % spinSearchRef.current.lanes.length
        const lane = spinSearchRef.current.lanes[laneIdx] ?? 0.5
        const centerX = jar.x + jar.w * lane
        const amp = jar.w * 0.28
        clawX = clamp(centerX + sweep * amp, jar.x + radius * 1.2, jar.x + jar.w - radius * 1.2)
        clawY = topY + Math.sin((nowMs / 1000) * 3.3) * 1.2
        clawOpen = 1
      } else if (elapsed <= t2) {
        const p = easeInOutCubic((elapsed - t1) / tMove)
        const homeX = jar.x + jar.w / 2
        clawX = homeX + (tx - homeX) * p
        clawY = topY
        clawOpen = 1
      } else if (elapsed <= t3) {
        const p = easeInOutCubic((elapsed - t2) / tDown)
        clawX = tx
        clawY = topY + (grabY - topY) * p
        clawOpen = 1
      } else if (elapsed <= t4) {
        const p = easeInOutCubic((elapsed - t3) / tClose)
        clawX = tx
        clawY = grabY
        clawOpen = 1 - p
      } else if (elapsed <= t5) {
        const p = easeInOutCubic((elapsed - t4) / tLift)
        clawX = tx
        clawY = grabY + (topY - grabY) * p
        clawOpen = 0
        carried = target
        carriedSlotRef.current = carried?.slot ?? null
        if (carried) {
          carried.x = clawX
          carried.y = clawY + radius * 0.9
          carried.vx = 0
          carried.vy = 0
        }
      } else if (elapsed <= t6) {
        const p = easeInOutCubic((elapsed - t5) / tToChute)
        clawX = tx + (chuteX - tx) * p
        clawY = topY
        clawOpen = 0
        carried = target
        if (carried) {
          carried.x = clawX
          carried.y = clawY + radius * 0.9
          carried.vx = 0
          carried.vy = 0
        }
      } else if (elapsed <= t7) {
        const p = easeInCubic(clamp((elapsed - t6) / Math.max(1, tDrop), 0, 1))
        clawX = chuteX
        clawY = chuteTopY
        clawOpen = p
        carried = target
        if (carried) {
          carried.x = chuteX
          carried.y = (chuteTopY + radius * 0.9) + (chuteDropY - (chuteTopY + radius * 0.9)) * p
          carried.vx = 0
          carried.vy = 0
        }
      }

      if (elapsed >= t7 && !holding) {
        // Winner is now clearly "shown" (dropped into the chute)
        if (spinReportedRef.current) {
          // keep drawing; don't early-return from the frame
        } else {
        spinReportedRef.current = true
        holdUntilRef.current = Date.now() + 5000 + 450
        spinInProgressRef.current = false
        const winner = seed.winner || null
        const spinTs = Number(seed.ts) || lastSpinTs.current || 0
        report({
          active: true,
          spinning: false,
          spin: seed,
          winner,
          mode: wheelState.mode,
          selectedConsole: wheelState.selectedConsole,
          event: wheelState.event,
          spinTs
        })
        }
      }
    }

    // Capsules (draw under claw)
    const carriedSlot = carriedSlotRef.current
    for (const c of capsules) {
      if ((spinning || holding) && carriedSlot != null && c.slot === carriedSlot) continue
      drawCapsule(ctx, c)
    }

    // Base panel (controls + prize chute)
    ctx.save()
    const baseY = cabinet.y + cabinet.h - baseH - 8
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(cabinet.x + 10, baseY, cabinet.w - 20, baseH + 2, 18)
    else ctx.rect(cabinet.x + 10, baseY, cabinet.w - 20, baseH + 2)
    const panelGrad = ctx.createLinearGradient(0, baseY, 0, baseY + baseH)
    panelGrad.addColorStop(0, 'rgba(255,255,255,0.06)')
    panelGrad.addColorStop(1, 'rgba(0,0,0,0.25)')
    ctx.fillStyle = panelGrad
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.stroke()

    // knob
    ctx.beginPath()
    ctx.arc(knob.x, knob.y, knob.r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.stroke()
    const knobAngle = (spinning ? (performance.now() / 180) : (performance.now() / 2200)) % (Math.PI * 2)
    ctx.beginPath()
    ctx.moveTo(knob.x, knob.y)
    ctx.lineTo(knob.x + Math.cos(knobAngle) * knob.r * 0.9, knob.y + Math.sin(knobAngle) * knob.r * 0.9)
    ctx.strokeStyle = 'rgba(255,215,0,0.85)'
    ctx.lineWidth = 3
    ctx.stroke()

    // chute slot
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(chute.x, chute.y, chute.w, chute.h, 14)
    else ctx.rect(chute.x, chute.y, chute.w, chute.h)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = `700 ${Math.max(10, Math.floor(baseH * 0.18))}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('PRIZE', chute.x + chute.w / 2, chute.y - 4)
    ctx.restore()

    // Draw carried capsule above the panel/chute so the drop is visible.
    if ((spinning || holding) && carriedSlot != null) {
      const carriedCapsule = capsules.find(c => c.slot === carriedSlot) || null
      if (carriedCapsule) {
        ctx.save()
        // Slightly dim while inside chute.
        const inChute = carriedCapsule.x >= chute.x && carriedCapsule.x <= (chute.x + chute.w) && carriedCapsule.y >= chute.y
        if (inChute) {
          // Clip to the chute so the capsule looks like it "sits inside" the slot.
          ctx.beginPath()
          const pad = Math.max(6, Math.min(12, chute.w * 0.08))
          if (typeof ctx.roundRect === 'function') ctx.roundRect(chute.x + pad, chute.y + pad, chute.w - pad * 2, chute.h - pad * 2, 10)
          else ctx.rect(chute.x + pad, chute.y + pad, chute.w - pad * 2, chute.h - pad * 2)
          ctx.clip()
        }
        if (inChute) ctx.globalAlpha = 0.95
        drawCapsule(ctx, carriedCapsule)
        ctx.restore()
      }
    }

    // No on-canvas winner card: OverlayFull already handles winner announcements
    // (including console winners via TV logo/input text).

    // Claw (draw above)
    ctx.save()
    // cable
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(clawX, jar.y - 8)
    ctx.lineTo(clawX, clawY - radius * 0.95)
    ctx.stroke()

    // head
    ctx.fillStyle = 'rgba(16,16,18,0.92)'
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect?.(clawX - radius * 0.62, clawY - radius * 0.98, radius * 1.24, radius * 0.78, 10)
    if (typeof ctx.roundRect !== 'function') {
      ctx.rect(clawX - radius * 0.62, clawY - radius * 0.98, radius * 1.24, radius * 0.78)
    }
    ctx.fill()
    ctx.stroke()

    // prongs (3)
    const armLen = radius * 1.15
    const spread = (0.95 * clawOpen + 0.08) * 0.95
    const angles = [Math.PI / 2 - spread, Math.PI / 2, Math.PI / 2 + spread]
    ctx.strokeStyle = 'rgba(255,215,0,0.92)'
    ctx.lineWidth = 3
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]
      const ox = clawX + (i - 1) * radius * 0.18
      const oy = clawY - radius * 0.2
      const ex = ox + Math.cos(a) * armLen
      const ey = oy + Math.sin(a) * armLen
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(ex, ey, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,215,0,0.85)'
      ctx.fill()
    }
    ctx.restore()

    rafRef.current = requestAnimationFrame(draw)
  }, [computeLayout, drawCapsule, report, wheelState.event, wheelState.mode, wheelState.selectedConsole])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [draw])

  const startSpin = useCallback((spin) => {
    const durationMs = Number(spin?.durationMs) || 4500
    const visualDurationMs = durationMs
    const ageMs = Date.now() - Number(spin?.ts || 0)
    // Ignore stale spins on load/refresh.
    if (Number.isFinite(ageMs) && ageMs > (visualDurationMs + 1500)) {
      lastSpinTs.current = spin?.ts || 0
      return
    }

    const seed = {
      ...spin,
      durationMs,
      winner: spin?.winner || (Array.isArray(spin?.sample) ? spin.sample[spin?.targetIdx] : null)
    }

    // Deterministic-ish search pattern derived from spin id/time so multiple overlays look similar.
    const seedKey = (Number(seed.spinId) || Number(seed.ts) || Date.now()) >>> 0
    const rnd = mulberry32(seedKey)
    spinSearchRef.current = {
      phase: rnd() * Math.PI * 2,
      lanes: [0.22 + rnd() * 0.08, 0.5, 0.78 - rnd() * 0.08]
    }

    spinSeedRef.current = seed
    spinStartRef.current = performance.now() - clamp(ageMs, 0, visualDurationMs)
    targetSlotRef.current = clamp(Number(seed.targetIdx) || 0, 0, 15)
    carriedSlotRef.current = null

    spinInProgressRef.current = true
    holdUntilRef.current = 0
    spinReportedRef.current = false
    if (spinCompleteTimerRef.current) clearTimeout(spinCompleteTimerRef.current)

    setWheelState(prev => ({ ...prev, spin: seed, sample: Array.isArray(seed.sample) ? seed.sample : prev.sample }))
    ensureCapsules(Array.isArray(seed.sample) ? seed.sample : wheelState.sample)

    activeUntilRef.current = Date.now() + visualDurationMs + 2500 + 450 + 1000
    setVisible(prev => (prev ? prev : true))
    report({ active: true, spinning: true, spin: seed, spinTs: seed.ts })

    // Backup completion report in case the draw loop misses the exact end-of-drop window.
    const elapsedAtStart = clamp(ageMs, 0, visualDurationMs)
    const remainingToEnd = Math.max(0, Math.round(visualDurationMs - elapsedAtStart))
    spinCompleteTimerRef.current = setTimeout(() => {
      if (spinReportedRef.current) return
      spinReportedRef.current = true
      holdUntilRef.current = Date.now() + 5000 + 450
      spinInProgressRef.current = false
      const winner = seed.winner || null
      const spinTs = Number(seed.ts) || lastSpinTs.current || 0
      report({
        active: true,
        spinning: false,
        spin: seed,
        winner,
        mode: wheelState.mode,
        selectedConsole: wheelState.selectedConsole,
        event: wheelState.event,
          spinTs
        })
    }, remainingToEnd + 25)
  }, [ensureCapsules, report, wheelState.sample])

  const fetchSync = useCallback(async () => {
    try {
      if (!base) return
      let spin = null
      let state = null
      const syncRes = await fetch(buildOverlayUrl('/overlay/wheel-sync', base))
      if (syncRes.ok) {
        const payload = await syncRes.json()
        spin = payload?.spin || null
        state = payload?.state || null
      } else {
        const res = await fetch(buildOverlayUrl('/overlay/spin', base))
        if (res.ok) spin = await res.json()
        const r2 = await fetch(buildOverlayUrl('/overlay/wheel-state', base))
        if (r2.ok) state = await r2.json()
      }

      if (spin?.ts && spin.ts !== lastSpinTs.current) {
        lastSpinTs.current = spin.ts
        startSpin(spin)
      }

      if (state) {
        const now = Date.now()
        const isHolding = now < holdUntilRef.current
        const isSpinning = spinInProgressRef.current
        if (!(isSpinning || isHolding)) {
          setWheelState(prev => {
            const nextMode = state.mode || 'game'
            const nextSample = Array.isArray(state.sample) ? state.sample : []
            const nextSelectedConsole = state.selectedConsole || 'All'
            const nextEvent = state.event || { name: '', consoles: [] }
            const changed =
              prev.mode !== nextMode ||
              prev.selectedConsole !== nextSelectedConsole ||
              JSON.stringify(prev.sample) !== JSON.stringify(nextSample)
            if (changed) {
              return { ...prev, sample: nextSample, mode: nextMode, selectedConsole: nextSelectedConsole, event: nextEvent }
            }
            return prev
          })
        }

        const shouldBeVisible = pinned || now < activeUntilRef.current || (state.mode === 'console')
        setVisible(prev => (prev === shouldBeVisible ? prev : shouldBeVisible))
        report({
          active: shouldBeVisible,
          spinning: spinInProgressRef.current,
          mode: state.mode,
          selectedConsole: state.selectedConsole,
          event: state.event,
          spinTs: lastSpinTs.current || 0
        })
      }
    } catch {
      // silent polling
    }
  }, [base, pinned, report, startSpin])

  useInterval(fetchSync, 1000)
  useEffect(() => { fetchSync() }, [fetchSync])

  if (!(pinned || visible)) return null

  return (
    <div className="crt-wheel-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
