import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import * as Cache from '../services/cache.js'
import * as Bonus from '../utils/bonusDetection.js'
import GameDetailModal from '../components/GameDetailModal.jsx'

function GameCard({ game, onQuick, onOpenDetail }) {
  const [url, setUrl] = React.useState(null)
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      if (game.image_url) {
        // First try to get from IndexedDB cache
        const blob = await Cache.getCover(game.image_url)
        if (mounted && blob) {
          setUrl(URL.createObjectURL(blob))
          return
        }
        
        // Try to find local file by URL hash (for file system cached covers)
        if (mounted) {
          try {
            // Create a hash from the URL to match file system naming
            const urlBuffer = new TextEncoder().encode(game.image_url)
            const hashBuffer = await crypto.subtle.digest('SHA-1', urlBuffer)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
            
            // Try to load from local covers directory
            const localPath = `/covers/${hashHex}.jpg`
            const response = await fetch(localPath)
            if (response.ok) {
              setUrl(localPath)
              return
            }
          } catch (error) {
            console.log('Local cover lookup failed:', error)
          }
          
          // Final fallback: use proxy or direct URL
          const base = import.meta.env.VITE_IGDB_PROXY_URL
          setUrl(base ? `${base}/cover?src=${encodeURIComponent(game.image_url)}` : game.image_url)
        }
      }
    })()
    return () => { 
      mounted = false
      // Clean up object URL to prevent memory leaks
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    }
  }, [game.image_url])

  return (
    <div className="card bg-panel h-100" onDoubleClick={() => onOpenDetail(game)}>
      <div className="ratio ratio-4x3">
        {url ? <img alt="" className="cover rounded-top" src={url} /> : <div className="d-flex align-items-center justify-content-center text-muted">No cover</div>}
      </div>
      <div className="card-body p-2">
        <div className="small text-secondary">{game.console} {game.release_year ? `• ${game.release_year}` : ''}</div>
        <div className="fw-semibold truncate-2" title={game.title}>{game.title}</div>
        <div className="d-flex gap-2 align-items-center mt-2">
          <span className={`badge rounded-pill text-bg-${game.status==='Completed'?'success':game.status==='In Progress'?'warning':'secondary'}`}>{game.status}</span>
          {game.is_bonus && <span className="badge badge-soft">Bonus</span>}
          {game.rating && <span className="badge bg-info">★{game.rating}</span>}
        </div>
        {game.completion_time && (
          <div className="small text-secondary mt-1">{game.completion_time}h completion</div>
        )}
      </div>
      <div className="card-footer d-flex gap-1 p-2">
        <button className="btn btn-sm btn-outline-light" onClick={() => {
          const updatedGame = { ...game, status: 'In Progress', date_started: game.date_started ?? new Date().toISOString() }
          onQuick(updatedGame)
        }}>Set Current</button>
        <button className="btn btn-sm btn-outline-success" onClick={() => onQuick({ ...game, status: 'Completed', date_finished: new Date().toISOString() })}>Complete</button>
        <button className="btn btn-sm btn-outline-info" onClick={() => onOpenDetail(game)}>Details</button>
      </div>
    </div>
  )
}

export default function Library() {
  const { state, dispatch } = useGame()
  const [view, setView] = useState('grid')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [consoleFilter, setConsoleFilter] = useState('All')
  const [hideBonus, setHideBonus] = useState(state.settings.hideBonusGames)
  const [selectedGame, setSelectedGame] = useState(null)
  const [params] = useSearchParams()

  const consoles = useMemo(() => Array.from(new Set(state.games.map(g => g.console))), [state.games])

  const filtered = useMemo(() => {
    let arr = state.games
    if (q) arr = arr.filter(g => g.title.toLowerCase().includes(q.toLowerCase()))
    if (status !== 'All') arr = arr.filter(g => g.status === status)
    if (consoleFilter !== 'All') arr = arr.filter(g => g.console === consoleFilter)
    if (hideBonus) arr = arr.filter(g => !Bonus.isBonus(g.title))
    return arr
  }, [state.games, q, status, consoleFilter, hideBonus])

  const onQuick = (game) => {
    dispatch({ type: 'UPDATE_GAME', game })
    if (game.status === 'In Progress') {
      dispatch({ type: 'SET_CURRENT', id: game.id })
    }
  }
  const onOpenDetail = (game) => setSelectedGame(game)

  React.useEffect(() => {
    const editId = params.get('edit')
    if (!editId) return
    const g = state.games.find(x => x.id === editId)
    if (g) setSelectedGame(g)
  }, [params, state.games])

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-0">Game Library</h2>
          <div className="text-secondary small">Grid/List • Filters • Quick actions</div>
        </div>
        <input className="form-control form-control-sm w-auto" placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} />
        <select className="form-select form-select-sm w-auto" value={consoleFilter} onChange={e=>setConsoleFilter(e.target.value)}>
          <option>All</option>
          {consoles.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="form-select form-select-sm w-auto" value={status} onChange={e=>setStatus(e.target.value)}>
          <option>All</option>
          <option>Not Started</option>
          <option>In Progress</option>
          <option>Completed</option>
        </select>
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" checked={hideBonus} onChange={e=>setHideBonus(e.target.checked)} id="hideBonus" />
          <label className="form-check-label" htmlFor="hideBonus">Hide Bonus</label>
        </div>
        <div className="btn-group">
          <button className={`btn btn-sm ${view==='grid'?'btn-primary':'btn-outline-primary'}`} onClick={()=>setView('grid')}>Grid</button>
          <button className={`btn btn-sm ${view==='list'?'btn-primary':'btn-outline-primary'}`} onClick={()=>setView('list')}>List</button>
        </div>
      </div>

      {view==='grid' ? (
        <div className="row g-2">
          {filtered.map(g => (
            <div key={g.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
              <GameCard game={g} onQuick={onQuick} onOpenDetail={onOpenDetail} />
            </div>
          ))}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-dark align-middle">
            <thead><tr><th>Title</th><th>Console</th><th>Status</th><th>Started</th><th>Finished</th><th></th></tr></thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id}>
                  <td>{g.title}{g.is_bonus && <span className="ms-2 badge badge-soft">Bonus</span>}</td>
                  <td>{g.console}</td>
                  <td>{g.status}</td>
                  <td>{g.date_started ? new Date(g.date_started).toLocaleDateString() : '-'}</td>
                  <td>{g.date_finished ? new Date(g.date_finished).toLocaleDateString() : '-'}</td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm">
                      <button className="btn btn-outline-light" onClick={()=>{
                        const updatedGame = { ...g, status: 'In Progress', date_started: g.date_started ?? new Date().toISOString() }
                        onQuick(updatedGame)
                      }}>Set Current</button>
                      <button className="btn btn-outline-success" onClick={()=>onQuick({ ...g, status: 'Completed', date_finished: new Date().toISOString() })}>Complete</button>
                      <button className="btn btn-outline-info" onClick={()=>onOpenDetail(g)}>Details</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {selectedGame && (
        <GameDetailModal 
          game={selectedGame} 
          onClose={() => setSelectedGame(null)} 
        />
      )}
    </div>
  )
}
