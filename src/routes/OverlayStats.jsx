import React from 'react'
import * as Storage from '../services/storage.js'

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

export default function OverlayStats() {
  const params = new URLSearchParams(location.search)
  const poll = parseInt(params.get('poll') || '5000', 10)
  const tick = usePoll(poll)
  const isClean = params.get('clean') === '1'
  const styleParam = (params.get('style') || '').toLowerCase()
  const isCompact = params.get('compact') === '1' || styleParam === 'compact' || styleParam === 'bar'
  const title = params.get('title') || (import.meta.env.VITE_APP_NAME || 'Event')
  const widthParam = params.get('width') ? Math.max(180, Math.min(600, parseInt(params.get('width'), 10) || 0)) : null

  // Apply clean overlay styling to document body
  React.useEffect(() => {
    if (isClean) {
      document.body.classList.add('overlay-clean')
      return () => document.body.classList.remove('overlay-clean')
    }
  }, [isClean])

  const [stats, setStats] = React.useState({ total: 0, completed: 0, percent: 0 })

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const load = async () => {
      // Always try server first for OBS compatibility
      try {
        const r = await fetch(`${base}/overlay/stats`)
        if (r.ok) {
          const j = await r.json()
          const total = Number(j.total || 0)
          const completed = Number(j.completed || 0)
          const percent = typeof j.percent === 'number' ? j.percent : (total ? Math.round((completed / total) * 100) : 0)
          setStats({ total, completed, percent })
          return
        }
      } catch (err) {
        console.log('Server stats failed, falling back to localStorage:', err.message)
      }
      
      // Fallback to same-browser storage (dev/testing)
      try {
        const games = Storage.getGames()
        const total = games.length
        const completed = games.filter(g => g.status === 'Completed').length
        const percent = total ? Math.round((completed / total) * 100) : 0
        setStats({ total, completed, percent })
      } catch (storageErr) {
        console.log('localStorage fallback failed:', storageErr.message)
        setStats({ total: 0, completed: 0, percent: 0 })
      }
    }
    load()
  }, [tick, poll])

  const angle = Math.max(0, Math.min(100, stats.percent)) * 3.6
  const ring = {
    background: `conic-gradient(var(--brand) ${angle}deg, rgba(255,255,255,0.08) ${angle}deg 360deg)`
  }
  
  if (isCompact) {
    return (
      <div className={`overlay-chrome p-2 d-flex align-items-center justify-content-center ${isClean ? 'overlay-clean' : ''}`} style={{ width: '100vw', height: '100vh' }}>
        <div className="overlay-card stats-compact-card" style={{ padding: '10px 12px', borderRadius: 12, minWidth: 220, maxWidth: 460, ...(widthParam ? { width: widthParam } : {}) }}>
          <div className="d-flex align-items-center justify-content-between" style={{ gap: 8, marginBottom: 6 }}>
            <div className="stats-compact-title">{title}</div>
            <div className="percent-badge">{stats.percent}%</div>
          </div>
          <div className="progress-bar-bg stats-compact-bar">
            <div className="progress-bar-fill" style={{ width: `${stats.percent}%` }} />
          </div>
          <div className="d-flex justify-content-end stats-compact-counts">
            <span>{stats.completed.toLocaleString()}/{stats.total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`overlay-chrome p-4 d-flex align-items-center justify-content-center ${isClean ? 'overlay-clean' : ''}`} style={{width:'100vw', height:'100vh'}}>
      <div className="stats-info p-4 d-flex align-items-center gap-4" style={{maxWidth: '500px'}}>
        <div className="stats-radial" style={{
          ...ring,
          width: 140,
          height: 140,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          boxShadow: 'inset 0 0 0 8px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.35)'
        }}>
          <div className="inner" style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center'
          }}>
            <div className="percent" style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{stats.percent}%</div>
            <div className="label" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Complete</div>
          </div>
        </div>
        <div className="flex-grow-1">
          <div className="stats-title" style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Event Progress</div>
          <div className="stats-subtitle mb-2" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {stats.completed.toLocaleString()} of {stats.total.toLocaleString()} games completed
          </div>
          <div className="progress-details">
            <div className="d-flex justify-content-between text-sm mb-1">
              <span style={{color: 'rgba(255,255,255,0.6)'}}>Progress</span>
              <span style={{color: 'var(--brand)'}}>{stats.completed}/{stats.total}</span>
            </div>
            <div className="progress-bar-bg" style={{
              height: '8px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden'
            }}>
              <div className="progress-bar-fill" style={{
                height: '100%',
                width: `${stats.percent}%`,
                background: 'linear-gradient(90deg, var(--brand), var(--accent))',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
