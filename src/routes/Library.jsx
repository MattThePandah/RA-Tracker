import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGame } from '../context/GameContext.jsx'
import * as Cache from '../services/cache.js'
import * as Bonus from '../utils/bonusDetection.js'
import GameDetailModal from '../components/GameDetailModal.jsx'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { adminFetch } from '../utils/adminFetch.js'

function parseTagInput(value) {
  if (!value) return []
  return value
    .split(/[,;\n]+/)
    .map(tag => tag.trim())
    .filter(Boolean)
}

function dedupeTags(tags) {
  const seen = new Set()
  const result = []
  for (const tag of tags || []) {
    const key = String(tag || '').trim()
    if (!key) continue
    const token = key.toLowerCase()
    if (seen.has(token)) continue
    seen.add(token)
    result.push(key)
  }
  return result
}

function mergeTags(existing, incoming) {
  const base = dedupeTags(existing)
  if (!incoming?.length) return base
  const seen = new Set(base.map(tag => tag.toLowerCase()))
  const next = [...base]
  for (const tag of incoming) {
    const token = String(tag || '').trim()
    if (!token) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(token)
  }
  return next
}

function formatCompletionTime(hoursValue) {
  const hoursNum = Number(hoursValue || 0)
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) return ''
  const totalSeconds = Math.max(0, Math.round(hoursNum * 3600))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  return `${seconds}s`
}

function GameCard({ game, onQuick, onOpenDetail, onFetchCover, fetchingCover, selectionMode, selected, onSelectToggle }) {
  const [url, setUrl] = React.useState(null)
  const completionLabel = formatCompletionTime(game.completion_time)
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      if (game.cover?.localPath) {
        const localCover = buildCoverUrl(game.cover.localPath)
        setUrl(localCover)
        return
      }
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
            
            // Try to load from local covers directory (both .jpg and .png)
            // RetroAchievements URLs are always .png, so try .png first for those
            const extensions = game.image_url.includes('retroachievements.org') 
              ? ['.png', '.jpg'] 
              : ['.jpg', '.png']
            
            const base = import.meta.env.VITE_IGDB_PROXY_URL || ''
            const safeBase = base ? base.replace(/\/+$/, '') : ''
            for (const ext of extensions) {
              const localPath = `/covers/${hashHex}${ext}`
              const localUrl = safeBase ? `${safeBase}${localPath}` : localPath
              const response = await fetch(localUrl)
              if (response.ok) {
                setUrl(localUrl)
                return
              }
            }
          } catch (error) {
            console.log('Local cover lookup failed:', error)
          }
          
          // Final fallback: use proxy or direct URL
          setUrl(buildCoverUrl(game.image_url))
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
    <div className={`card bg-panel h-100 library-card${selected ? ' selected' : ''}`} onDoubleClick={() => onOpenDetail(game)}>
      {selectionMode && (
        <button
          className="library-select"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelectToggle(game.id)
          }}
        >
          <input type="checkbox" checked={selected} readOnly />
        </button>
      )}
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
        {completionLabel && (
          <div className="small text-secondary mt-1">Completion: {completionLabel}</div>
        )}
      </div>
      <div className="card-footer d-flex gap-1 p-2">
        <button className="btn btn-sm btn-outline-light" onClick={() => {
          const updatedGame = { ...game, status: 'In Progress', date_started: game.date_started ?? new Date().toISOString() }
          onQuick(updatedGame)
        }}>Set Current</button>
        <button className="btn btn-sm btn-outline-success" onClick={() => onQuick({ ...game, status: 'Completed', date_finished: new Date().toISOString() })}>Complete</button>
        <button className="btn btn-sm btn-outline-info" onClick={() => onOpenDetail(game)}>Details</button>
        <button
          className="btn btn-sm btn-outline-warning"
          onClick={() => onFetchCover(game)}
          disabled={fetchingCover}
        >
          {fetchingCover ? 'Fetching...' : 'Fetch Cover'}
        </button>
      </div>
    </div>
  )
}

export default function Library() {
  const { state, dispatch } = useGame()
  const [view, setView] = useState('grid')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkTags, setBulkTags] = useState('')
  const [bulkTagMode, setBulkTagMode] = useState('add')
  const [bulkActionMessage, setBulkActionMessage] = useState('')
  const [bulkCoverProgress, setBulkCoverProgress] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [consoleFilter, setConsoleFilter] = useState('All')
  const [hideBonus, setHideBonus] = useState(state.settings.hideBonusGames)
  const [selectedGame, setSelectedGame] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(50) // Show 50 items per page
  const [params] = useSearchParams()
  const [coverConsoles, setCoverConsoles] = useState([])
  const [coverConsoleId, setCoverConsoleId] = useState('All')
  const [coverConcurrency, setCoverConcurrency] = useState(3)
  const [coverJobId, setCoverJobId] = useState('')
  const [coverStatus, setCoverStatus] = useState(null)
  const [coverMessage, setCoverMessage] = useState('')
  const [coverFetchState, setCoverFetchState] = useState({})
  const [coverFetchMessage, setCoverFetchMessage] = useState('')

  const consoles = useMemo(() => Array.from(new Set(state.games.map(g => g.console))), [state.games])

  const filtered = useMemo(() => {
    let arr = state.games
    if (q) arr = arr.filter(g => g.title.toLowerCase().includes(q.toLowerCase()))
    if (status !== 'All') arr = arr.filter(g => g.status === status)
    if (consoleFilter !== 'All') arr = arr.filter(g => g.console === consoleFilter)
    if (hideBonus) arr = arr.filter(g => !Bonus.isBonus(g.title))
    return arr
  }, [state.games, q, status, consoleFilter, hideBonus])

  // Pagination calculations
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedGames = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filtered.slice(startIndex, startIndex + itemsPerPage)
  }, [filtered, currentPage, itemsPerPage])

  const filteredIdSet = useMemo(() => new Set(filtered.map(g => String(g.id))), [filtered])
  const pageIdSet = useMemo(() => new Set(paginatedGames.map(g => String(g.id))), [paginatedGames])
  const selectedCount = selectedIds.size
  const selectedFilteredCount = useMemo(() => {
    let count = 0
    for (const id of selectedIds) {
      if (filteredIdSet.has(id)) count += 1
    }
    return count
  }, [selectedIds, filteredIdSet])
  const selectedPageCount = useMemo(() => {
    let count = 0
    for (const id of selectedIds) {
      if (pageIdSet.has(id)) count += 1
    }
    return count
  }, [selectedIds, pageIdSet])
  const allPageSelected = paginatedGames.length > 0 && selectedPageCount === paginatedGames.length
  const allFilteredSelected = filtered.length > 0 && selectedFilteredCount === filtered.length
  const selectedGames = useMemo(() => {
    if (!selectedIds.size) return []
    return state.games.filter(g => selectedIds.has(String(g.id)))
  }, [state.games, selectedIds])

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [q, status, consoleFilter, hideBonus])

  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
        const res = await adminFetch(`${base}/api/consoles`)
        if (!res.ok) return
        const data = await res.json()
        if (active) setCoverConsoles(data.consoles || [])
      } catch {}
    }
    load()
    return () => { active = false }
  }, [])

  React.useEffect(() => {
    if (!coverJobId) return
    let active = true
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const poll = async () => {
      try {
        const res = await adminFetch(`${base}/api/library/status/${coverJobId}`)
        if (!res.ok) return
        const data = await res.json()
        if (active) setCoverStatus(data)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { active = false; clearInterval(id) }
  }, [coverJobId])

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

  React.useEffect(() => {
    if (!selectedGame) return
    const updated = state.games.find(g => g.id === selectedGame.id)
    if (updated && updated !== selectedGame) {
      setSelectedGame(updated)
    }
  }, [state.games, selectedGame])

  React.useEffect(() => {
    if (!selectionMode) {
      if (selectedIds.size) setSelectedIds(new Set())
      return
    }
    if (!selectedIds.size) return
    setSelectedIds(prev => {
      const validIds = new Set(state.games.map(g => String(g.id)))
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectionMode, selectedIds, state.games])

  const toggleSelectionMode = () => {
    setSelectionMode(prev => {
      const next = !prev
      if (!next) {
        setSelectedIds(new Set())
        setBulkActionMessage('')
        setBulkCoverProgress(null)
      }
      return next
    })
  }

  const toggleSelectedId = (id) => {
    const key = String(id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleSelectPage = () => {
    if (!paginatedGames.length) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      const shouldSelect = !paginatedGames.every(g => next.has(String(g.id)))
      for (const g of paginatedGames) {
        const id = String(g.id)
        if (shouldSelect) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const toggleSelectFiltered = () => {
    if (!filtered.length) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      const shouldSelect = !filtered.every(g => next.has(String(g.id)))
      for (const g of filtered) {
        const id = String(g.id)
        if (shouldSelect) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const startCoverPrefetch = async () => {
    setCoverMessage('')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const payload = {
        concurrency: Number(coverConcurrency) || 3
      }
      if (coverConsoleId && coverConsoleId !== 'All') {
        payload.consoleIds = [coverConsoleId]
      }
      const res = await adminFetch(`${base}/api/library/covers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCoverMessage(data.error || 'Failed to start cover prefetch.')
        return
      }
      setCoverJobId(data.jobId || '')
      setCoverStatus(data)
    } catch (error) {
      setCoverMessage('Failed to start cover prefetch.')
    }
  }

  const fetchCoverForGame = async (game, options = {}) => {
    const { silent } = options
    if (!game?.title) return false
    if (!silent) setCoverFetchMessage('')
    setCoverFetchState(prev => ({ ...prev, [game.id]: true }))
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const raGameId = (() => {
        const rawId = String(game?.id || '')
        if (rawId.startsWith('game:ra:')) return rawId.slice(8)
        if (rawId.startsWith('ra-')) {
          const parts = rawId.split('-')
          return parts.length >= 3 ? parts[2] : null
        }
        return null
      })()
      const payload = {
        title: game.title,
        gameId: game.id || null,
        raGameId,
        imageUrl: game.image_url || null
      }
      const consoleId = game.consoleId || game.console_id || null
      if (consoleId) payload.consoleId = consoleId
      const res = await adminFetch(`${base}/api/covers/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'cover_resolve_failed')
      }
      const coverPath = data.cover?.localPath || data.cover?.originalUrl || ''
      if (!coverPath) {
        throw new Error('cover_missing')
      }
      const updatedGame = {
        ...game,
        image_url: coverPath,
        release_year: data.release_year || game.release_year || null,
        publisher: data.publisher || game.publisher || null
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      try {
        await adminFetch(`${base}/api/user/metadata/${encodeURIComponent(String(game.id))}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: updatedGame.image_url,
            release_year: updatedGame.release_year,
            publisher: updatedGame.publisher
          })
        })
      } catch {}
      return true
    } catch (error) {
      if (!silent) setCoverFetchMessage('Failed to fetch cover for the selected game.')
      return false
    } finally {
      setCoverFetchState(prev => {
        const next = { ...prev }
        delete next[game.id]
        return next
      })
    }
  }

  const applyBulkStatus = async () => {
    const nextStatus = bulkStatus.trim()
    if (!selectionMode || !selectedCount) {
      setBulkActionMessage('Select at least one game to update.')
      return
    }
    if (!nextStatus) {
      setBulkActionMessage('Choose a status to apply.')
      return
    }
    const now = new Date().toISOString()
    const updates = {}
    const updatedGames = state.games.map(game => {
      const id = String(game.id)
      if (!selectedIds.has(id)) return game
      const patch = { status: nextStatus }
      if (nextStatus === 'In Progress' && !game.date_started) {
        patch.date_started = now
      }
      if (nextStatus === 'Completed' && !game.date_finished) {
        patch.date_finished = now
      }
      updates[id] = patch
      return { ...game, ...patch }
    })
    dispatch({ type: 'SET_GAMES', games: updatedGames })
    let synced = true
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/user/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (!res.ok) synced = false
    } catch {
      synced = false
    }
    setBulkActionMessage(synced
      ? `Updated status for ${Object.keys(updates).length} games.`
      : 'Updated status locally, but failed to sync to the server.'
    )
  }

  const applyBulkTags = async () => {
    if (!selectionMode || !selectedCount) {
      setBulkActionMessage('Select at least one game to update.')
      return
    }
    const mode = bulkTagMode
    const incomingTags = mode === 'clear' ? [] : parseTagInput(bulkTags)
    if (mode !== 'clear' && !incomingTags.length) {
      setBulkActionMessage('Enter at least one tag.')
      return
    }
    const updates = {}
    const updatedGames = state.games.map(game => {
      const id = String(game.id)
      if (!selectedIds.has(id)) return game
      const currentTags = Array.isArray(game.custom_tags) ? game.custom_tags : []
      let nextTags = []
      if (mode === 'add') {
        nextTags = mergeTags(currentTags, incomingTags)
      } else if (mode === 'replace') {
        nextTags = dedupeTags(incomingTags)
      } else {
        nextTags = []
      }
      updates[id] = { custom_tags: nextTags }
      return { ...game, custom_tags: nextTags }
    })
    dispatch({ type: 'SET_GAMES', games: updatedGames })
    let synced = true
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/user/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (!res.ok) synced = false
    } catch {
      synced = false
    }
    setBulkActionMessage(synced
      ? `Updated tags for ${Object.keys(updates).length} games.`
      : 'Updated tags locally, but failed to sync to the server.'
    )
  }

  const runBulkCoverRefresh = async () => {
    if (!selectionMode || !selectedCount) {
      setBulkActionMessage('Select at least one game to refresh.')
      return
    }
    if (bulkCoverProgress?.running) return
    const queue = [...selectedGames]
    if (!queue.length) {
      setBulkActionMessage('No selected games found in the library.')
      return
    }
    const total = queue.length
    const limit = Math.max(1, Math.min(6, Number(coverConcurrency) || 3))
    let done = 0
    let failed = 0
    setBulkCoverProgress({ total, done: 0, failed: 0, running: true })
    setBulkActionMessage('')
    const workers = Array.from({ length: limit }, () => (async () => {
      while (queue.length) {
        const game = queue.shift()
        if (!game) break
        const ok = await fetchCoverForGame(game, { silent: true })
        if (!ok) failed += 1
        done += 1
        setBulkCoverProgress({ total, done, failed, running: true })
      }
    })())
    await Promise.all(workers)
    setBulkCoverProgress(prev => prev ? { ...prev, running: false, done, failed } : null)
    setBulkActionMessage(`Cover refresh finished. ${done - failed} updated, ${failed} failed.`)
  }

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-0">Game Library</h2>
          <div className="text-secondary small">
            Showing {paginatedGames.length} of {filtered.length} games
            {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
          </div>
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
        <button
          className={`btn btn-sm ${selectionMode ? 'btn-success' : 'btn-outline-success'}`}
          onClick={toggleSelectionMode}
        >
          {selectionMode ? 'Selection On' : 'Selection Mode'}
        </button>
      </div>
      {coverFetchMessage && <div className="text-warning small mb-2">{coverFetchMessage}</div>}

      {selectionMode && (
        <div className="card bg-panel p-3 mb-3 library-bulk">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <div>
              <div className="fw-semibold">Bulk Tools</div>
              <div className="text-secondary small">
                {selectedCount === selectedFilteredCount
                  ? `${selectedCount} selected`
                  : `${selectedCount} selected (${selectedFilteredCount} in filters)`}
              </div>
            </div>
            <div className="ms-auto d-flex flex-wrap gap-2">
              <button className="btn btn-sm btn-outline-light" onClick={toggleSelectPage}>
                {allPageSelected ? 'Unselect Page' : 'Select Page'}
              </button>
              <button className="btn btn-sm btn-outline-light" onClick={toggleSelectFiltered}>
                {allFilteredSelected ? 'Unselect Filtered' : 'Select Filtered'}
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={clearSelection}>
                Clear
              </button>
            </div>
          </div>
          <div className="row g-2 align-items-end mt-2">
            <div className="col-md-4">
              <label className="form-label small">Status</label>
              <div className="input-group input-group-sm">
                <select
                  className="form-select"
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                >
                  <option value="">Choose status</option>
                  <option>Not Started</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                </select>
                <button className="btn btn-outline-primary" onClick={applyBulkStatus} disabled={!selectedCount}>
                  Apply
                </button>
              </div>
            </div>
            <div className="col-md-5">
              <label className="form-label small">Tags</label>
              <div className="input-group input-group-sm">
                <input
                  className="form-control"
                  placeholder="speedrun, horror, co-op"
                  value={bulkTags}
                  onChange={e => setBulkTags(e.target.value)}
                  disabled={bulkTagMode === 'clear'}
                />
                <select
                  className="form-select"
                  value={bulkTagMode}
                  onChange={e => setBulkTagMode(e.target.value)}
                >
                  <option value="add">Add</option>
                  <option value="replace">Replace</option>
                  <option value="clear">Clear</option>
                </select>
                <button className="btn btn-outline-primary" onClick={applyBulkTags} disabled={!selectedCount}>
                  Apply
                </button>
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label small">Cover Refresh</label>
              <div className="input-group input-group-sm">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  max="6"
                  value={coverConcurrency}
                  onChange={e => setCoverConcurrency(e.target.value)}
                />
                <button
                  className="btn btn-outline-warning"
                  onClick={runBulkCoverRefresh}
                  disabled={!selectedCount || bulkCoverProgress?.running}
                >
                  {bulkCoverProgress?.running ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
          </div>
          {bulkCoverProgress && (
            <div className="text-secondary small mt-2">
              Covers: {bulkCoverProgress.done}/{bulkCoverProgress.total} (failed {bulkCoverProgress.failed})
            </div>
          )}
          {bulkActionMessage && <div className="text-warning small mt-2">{bulkActionMessage}</div>}
        </div>
      )}

      <div className="card bg-panel p-3 mb-3">
        <h3 className="h6">Cover Prefetch</h3>
        <div className="row g-2 align-items-end">
          <div className="col-sm-5">
            <label className="form-label">Console</label>
            <select className="form-select" value={coverConsoleId} onChange={e => setCoverConsoleId(e.target.value)}>
              <option value="All">All Consoles</option>
              {coverConsoles.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="col-sm-3">
            <label className="form-label">Concurrency</label>
            <input className="form-control" type="number" min="1" max="8" value={coverConcurrency} onChange={e => setCoverConcurrency(e.target.value)} />
          </div>
          <div className="col-sm-4">
            <button className="btn btn-outline-info w-100" onClick={startCoverPrefetch}>Start Prefetch</button>
          </div>
        </div>
        <div className="small text-secondary mt-2">
          On-demand caching happens when a cover is viewed. Prefetch is optional for faster first-loads.
        </div>
        {coverMessage && <div className="text-warning small mt-2">{coverMessage}</div>}
        {coverJobId && (
          <div className="small text-secondary mt-2">
            Job: <code>{coverJobId}</code>
            {coverStatus?.progress && (
              <span>  {coverStatus.progress.done}/{coverStatus.progress.total} (resolved {coverStatus.stats?.resolved || 0}, failed {coverStatus.stats?.failed || 0})</span>
            )}
            {coverStatus?.state && <span>  {coverStatus.state}</span>}
          </div>
        )}
      </div>

      {view==='grid' ? (
        <div className="row g-2">
          {paginatedGames.map(g => (
            <div key={g.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
              <GameCard
                game={g}
                onQuick={onQuick}
                onOpenDetail={onOpenDetail}
                onFetchCover={fetchCoverForGame}
                fetchingCover={!!coverFetchState[g.id]}
                selectionMode={selectionMode}
                selected={selectedIds.has(String(g.id))}
                onSelectToggle={toggleSelectedId}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-dark align-middle">
            <thead>
              <tr>
                {selectionMode && (
                  <th className="library-select-col">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                    />
                  </th>
                )}
                <th>Title</th>
                <th>Console</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedGames.map(g => (
                <tr key={g.id} className={selectionMode && selectedIds.has(String(g.id)) ? 'library-row-selected' : ''}>
                  {selectionMode && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(g.id))}
                        onChange={() => toggleSelectedId(g.id)}
                      />
                    </td>
                  )}
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
                      <button
                        className="btn btn-outline-warning"
                        onClick={() => fetchCoverForGame(g)}
                        disabled={!!coverFetchState[g.id]}
                      >
                        {coverFetchState[g.id] ? 'Fetching...' : 'Fetch Cover'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="d-flex justify-content-center mt-4">
          <nav>
            <ul className="pagination pagination-sm">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </button>
              </li>
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
              </li>
              
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
                if (pageNum <= totalPages) {
                  return (
                    <li key={pageNum} className={`page-item ${currentPage === pageNum ? 'active' : ''}`}>
                      <button 
                        className="page-link" 
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    </li>
                  )
                }
                return null
              })}

              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </li>
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </button>
              </li>
            </ul>
          </nav>
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


