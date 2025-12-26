import React, { useMemo, useRef, useState } from 'react'
import { adminFetch } from '../utils/adminFetch.js'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import * as Bonus from '../utils/bonusDetection.js'
import { collectGenres, detectGenres } from '../utils/genreDetection.js'
import SmartRoulette from '../components/SmartRoulette.jsx'
import * as Cache from '../services/cache.js'
import { buildCoverUrl } from '../utils/coverUrl.js'

function WheelPicker({ games, onPick }) {
  // Simple wrapper for the new SmartRoulette system
  const filters = {
    console: 'All',
    status: 'Not Started', 
    search: '',
    hasCovers: false
  }

  return <SmartRoulette games={games} filters={filters} onGameSelected={onPick} />
}
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
    const r = Math.min(w, h) / 2
    const angle = angleRef.current
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(w/2, h/2)
    ctx.rotate(angle)
    segments.forEach((seg, i) => {
      ctx.beginPath()
      ctx.moveTo(0,0)
      ctx.arc(0,0,r,i*segAngle,(i+1)*segAngle)
      ctx.closePath()
      ctx.fillStyle = seg.color
      ctx.fill()
      ctx.save()
      ctx.rotate(i*segAngle + segAngle/2)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'right'
      const label = seg.text.slice(0, 28)
      ctx.strokeText(label, r-10, 5)
      ctx.fillText(label, r-10, 5)
      ctx.restore()
    })
    // highlight selected segment (post-spin)
    if (selectedIdx != null && !spinning && segments.length) {
      ctx.beginPath()
      ctx.moveTo(0,0)
      ctx.arc(0,0,r,selectedIdx*segAngle,(selectedIdx+1)*segAngle)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#ffff00'
      ctx.stroke()
    }
    ctx.restore()

    // pointer (more visible)
    ctx.fillStyle = '#ff4444'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(w/2, 8)
    ctx.lineTo(w/2+16, 36)
    ctx.lineTo(w/2-16, 36)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }, [segments, segAngle, selectedIdx, spinning])

  React.useEffect(() => {
    draw()
  }, [draw])

  const spin = () => {
    if (spinning || segments.length === 0) return
    setSpinning(true)
    setSelectedIdx(null)
    // Shuffle the visual order so options are randomized for viewers
    const shuffled = shuffle(ordered)
    setOrdered(shuffled)

    const localLen = Math.max(1, shuffled.length)
    const localSegAngle = (Math.PI * 2) / localLen
    const targetIdx = chooseTargetIndex(localLen)
    // Align the chosen segment's center with the top pointer (1.5π)
    const targetAngle = (Math.PI * 1.5) - (targetIdx * localSegAngle + localSegAngle/2)
    const extra = Math.PI * 10 // full turns
    const finalAngle = targetAngle + extra
    const duration = 9000 // 9s
    const start = performance.now()
    const startAngle = angleRef.current

    const tick = (t) => {
      const p = Math.min(1, (t-start)/duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      angleRef.current = startAngle + (finalAngle - startAngle) * eased
      draw()
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setSpinning(false)
        // Compute the visible winner from the final rotation to guarantee match
        const TWO_PI = Math.PI * 2
        const normalized = ((angleRef.current % TWO_PI) + TWO_PI) % TWO_PI
        const pointerAngle = Math.PI * 1.5
        const idx = Math.floor(((pointerAngle - normalized + TWO_PI) % TWO_PI) / localSegAngle)
        setSelectedIdx(idx)
        onPick(shuffled[idx])
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    // Notify overlay to mirror this spin in OBS (best-effort)
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL
      if (base) {
        const order = shuffled.map(g => ({ id: g.id, title: g.title, console: g.console }))
        adminFetch(`${base}/overlay/spin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order, targetIdx, durationMs: duration })
        }).catch(()=>{})
      }
    } catch {}
  }

  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <canvas ref={canvasRef} className="wheel-canvas rounded-4 border border-secondary"></canvas>
      <button disabled={spinning} className="btn btn-lg btn-primary px-5" onClick={spin}>
        {spinning ? 'Spinning...' : 'Spin the Wheel'}
      </button>
      {selectedIdx != null && ordered[selectedIdx] && (
        <div className="text-center small text-secondary">
          Selected: <span className="text-white fw-semibold">{ordered[selectedIdx].title}</span>
        </div>
      )}
    </div>
  )
}

function CSGOPicker({ games, onPick }) {
  const trackRef = useRef(null)
  const containerRef = useRef(null)
  const [spinning, setSpinning] = useState(false)
  const [order, setOrder] = useState(games)
  const [selectedIdx, setSelectedIdx] = useState(null)

  const shuffle = (arr) => {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  React.useEffect(() => {
    setOrder(shuffle(games))
    setSelectedIdx(null)
  }, [games])

  const repeat = 5 // render multiple cycles for long spins
  const itemWidth = 160
  const gap = 16
  const stride = itemWidth + gap
  const cycleWidth = Math.max(1, order.length) * stride

  const spin = () => {
    if (spinning || order.length === 0) return
    setSpinning(true)
    setSelectedIdx(null)
    const track = trackRef.current
    const container = containerRef.current
    if (!track || !container) return

    // choose a target in the middle cycle so we can add extra full cycles
    const baseIdx = Math.floor(Math.random() * order.length)
    const globalTargetIdx = baseIdx + Math.floor(repeat / 2) * order.length

    // measure positions to align chosen item center with pointer at container center
    const children = Array.from(track.children)
    const targetEl = children[globalTargetIdx]
    const containerRect = container.getBoundingClientRect()
    const pointerX = containerRect.left + containerRect.width / 2
    const itemRect = targetEl.getBoundingClientRect()
    const itemCenter = itemRect.left + itemRect.width / 2

    const baseDelta = itemCenter - pointerX // positive => item is right of pointer
    const minK = Math.ceil((-baseDelta) / cycleWidth) // ensure positive distance
    const k = Math.max(2, minK + 2) // at least two extra cycles
    const total = baseDelta + k * cycleWidth

    track.style.transition = 'transform 15s cubic-bezier(0.15, 0.85, 0, 1)'
    track.style.transform = `translate3d(-${total}px, 0, 0)`

    const end = () => {
      track.removeEventListener('transitionend', end)
      setSpinning(false)
      track.style.transition = 'none'
      track.style.transform = 'translate3d(0,0,0)'
      setSelectedIdx(baseIdx)
      onPick(order[baseIdx])
    }
    track.addEventListener('transitionend', end)
  }

  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <div ref={containerRef} className="position-relative w-100">
        <div className="position-absolute top-0 bottom-0 start-50 translate-middle-x" style={{width:2, background:'white', opacity:.5}} />
        <div className="roulette-track bg-black border border-secondary rounded-4 overflow-hidden scroll-x px-3 d-flex align-items-center">
          <div ref={trackRef} className="d-flex align-items-center gap-2 py-2">
            {Array.from({ length: repeat }).flatMap((_, k) => order.map((g, i) => (
              <div key={`${k}-${i}`} className="roulette-item card bg-panel border-secondary rounded-4 p-2 d-flex align-items-center justify-content-center text-center">
                <div className="small fw-semibold truncate-2">{g.title}</div>
                <div className="text-secondary small">{g.console}</div>
              </div>
            )))}
          </div>
        </div>
      </div>
      <button disabled={spinning} className="btn btn-lg btn-primary px-5" onClick={spin}>
        {spinning ? 'Rolling...' : 'Start Roll'}
      </button>
      {selectedIdx != null && order[selectedIdx] && (
        <div className="text-center small text-secondary">
          Selected: <span className="text-white fw-semibold">{order[selectedIdx].title}</span>
        </div>
      )}
    </div>
  )
}

export default function Select() {
  const { state, dispatch } = useGame()
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [consoleFilter, setConsoleFilter] = useState('All')
  const [bonusMode, setBonusMode] = useState(state.settings.hideBonusGames ? 'exclude' : 'include') // include | exclude | only
  const [bonusCats, setBonusCats] = useState(() => Object.keys(Bonus.bonusCategories).reduce((m,k)=>(m[k]=true,m),{}))
  const allGenres = useMemo(() => collectGenres(state.games), [state.games])
  const [selectedGenres, setSelectedGenres] = useState([])
  const consoles = useMemo(() => Array.from(new Set(state.games.map(g => g.console))), [state.games])

  const eligible = useMemo(() => {
    let arr = state.games.filter(g => g.status !== 'Completed')
    // Search
    if (q) arr = arr.filter(g => g.title.toLowerCase().includes(q.toLowerCase()))
    // Console filter
    if (consoleFilter !== 'All') arr = arr.filter(g => g.console === consoleFilter)
    // Bonus mode
    if (bonusMode === 'exclude') {
      arr = arr.filter(g => !Bonus.isBonus(g.title))
    } else if (bonusMode === 'only') {
      arr = arr.filter(g => {
        const tags = Bonus.detectBonusTags(g.title)
        if (!tags.length) return false
        // limit to selected categories
        return tags.some(t => bonusCats[t])
      })
    }
    // Genres
    if (selectedGenres.length) {
      arr = arr.filter(g => {
        const gs = detectGenres(g.title)
        return gs.some(x => selectedGenres.includes(x))
      })
    }
    return arr
  }, [state.games, q, consoleFilter, bonusMode, bonusCats, selectedGenres])

  const onPick = (game) => {
    setSelected(game)
    // Auto-flag as In Progress if not started, and set start date
    if (game.status === 'Not Started') {
      const updated = { ...game, status: 'In Progress', date_started: game.date_started || new Date().toISOString() }
      dispatch({ type: 'UPDATE_GAME', game: updated })
    }
    dispatch({ type: 'SET_CURRENT', id: game.id })
    // Stay on the selection page; user can edit later in Current page
  }

  const useWheel = eligible.length < 50

  return (
    <div className="p-3">
      <h2 className="h4">Smart Selection</h2>
      <div className="text-secondary mb-3">Filter the pool; wheel auto-switches to CS:GO style when large.</div>
      <div className="card bg-panel border border-secondary rounded-4 p-3 mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label small">Search</label>
            <input className="form-control form-control-sm" value={q} onChange={e=>setQ(e.target.value)} placeholder="Find title..." />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small">Console</label>
            <select className="form-select form-select-sm" value={consoleFilter} onChange={e=>setConsoleFilter(e.target.value)}>
              <option>All</option>
              {consoles.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small">Bonus</label>
            <select className="form-select form-select-sm" value={bonusMode} onChange={e=>setBonusMode(e.target.value)}>
              <option value="include">Include</option>
              <option value="exclude">Exclude</option>
              <option value="only">Only Bonus</option>
            </select>
          </div>
          <div className="col-12">
            <div className="d-flex flex-wrap gap-2 small">
              {Object.keys(Bonus.bonusCategories).map(cat => (
                <label key={cat} className={`badge ${bonusCats[cat]?'bg-primary':'badge-soft'}`} style={{cursor:'pointer'}}>
                  <input type="checkbox" className="form-check-input me-1" checked={!!bonusCats[cat]} onChange={e=>setBonusCats(prev=>({...prev,[cat]:e.target.checked}))} />{cat}
                </label>
              ))}
            </div>
          </div>
          <div className="col-12">
            <label className="form-label small">Genres</label>
            <div className="d-flex flex-wrap gap-2">
              {allGenres.map(g => (
                <button key={g} className={`btn btn-sm ${selectedGenres.includes(g)?'btn-info':'btn-outline-info'}`} onClick={()=>setSelectedGenres(s=>s.includes(g)?s.filter(x=>x!==g):[...s,g])}>{g}</button>
              ))}
              {allGenres.length===0 && <div className="text-secondary small">No genres detected from titles.</div>}
            </div>
          </div>
        </div>
      </div>
      <WheelPicker games={eligible} onPick={onPick} />
      {selected && (<SelectedPanel game={selected} />)}
    </div>
  )
}

function SelectedPanel({ game }) {
  const [cover, setCover] = useState(null)

  React.useEffect(() => {
    setCover(game?.image_url ? buildCoverUrl(game.image_url) : null)
  }, [game?.image_url])

  return (
    <div className="mt-4">
      <div className="card bg-panel border border-secondary rounded-4 p-3 d-flex gap-3 align-items-center">
        <div className="ratio ratio-4x3" style={{width: 240}}>
          {cover ? <img className="rounded-3 w-100 h-100 object-fit-cover" src={cover} alt="" /> :
            <div className="rounded-3 w-100 h-100 d-flex align-items-center justify-content-center text-secondary">No cover</div>}
        </div>
        <div className="flex-grow-1">
          <div className="fs-4 fw-bold">Selected: {game.title}</div>
          <div className="text-secondary">{game.console}{game.release_year ? ` • ${game.release_year}` : ''}</div>
          <div className="mt-2">
            <span className="badge bg-primary me-2">{game.status || 'Not Started'}</span>
            {game.rating && <span className="badge bg-info">Rating: {game.rating}/10</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
