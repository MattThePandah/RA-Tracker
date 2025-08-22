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
          setStats({ total: j.total || 0, completed: j.completed || 0, percent: j.percent || 0 })
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
  
  return (
    <div className={`overlay-chrome p-4 d-flex align-items-center justify-content-center ${isClean ? 'overlay-clean' : ''}`} style={{width:'100vw', height:'100vh'}}>
      <div className="stats-info p-4 d-flex align-items-center gap-4" style={{maxWidth: '500px'}}>
        <div className="stats-radial" style={ring}>
          <div className="inner">
            <div className="percent">{stats.percent}%</div>
            <div className="label">Complete</div>
          </div>
        </div>
        <div className="flex-grow-1">
          <div className="stats-title">PSFest Progress</div>
          <div className="stats-subtitle mb-2">
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
