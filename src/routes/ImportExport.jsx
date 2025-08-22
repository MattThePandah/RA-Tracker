import React, { useRef } from 'react'
import { useGame } from '../context/GameContext.jsx'
import * as Storage from '../services/storage.js'
import * as Cache from '../services/cache.js'

export default function ImportExport() {
  const { state, dispatch } = useGame()
  const fileRef = useRef(null)

  const onExport = () => {
    const blob = new Blob([JSON.stringify(state.games, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'psfest-games.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result)
        if (!Array.isArray(arr)) throw new Error('Invalid JSON')
        dispatch({ type: 'SET_GAMES', games: arr })
        alert(`Imported ${arr.length} games.`)
      } catch (err) {
        alert('Import failed: ' + err.message)
      }
    }
    reader.readAsText(f)
  }

  const loadGamesWithCovers = async () => {
    try {
      const response = await fetch('/games.with-covers.json')
      if (!response.ok) throw new Error('Failed to fetch games.with-covers.json')
      const games = await response.json()
      if (!Array.isArray(games)) throw new Error('Invalid games data')
      dispatch({ type: 'SET_GAMES', games })
      alert(`Loaded ${games.length} games with cover URLs.`)
    } catch (err) {
      alert('Failed to load games with covers: ' + err.message)
    }
  }

  return (
    <div className="p-3">
      <h2 className="h4">Import / Export</h2>
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h3 className="h6">Game Database</h3>
            <div className="d-flex flex-column gap-2">
              <div className="d-flex gap-2">
                <button className="btn btn-outline-primary" onClick={onExport}>Export JSON</button>
                <input type="file" accept="application/json" ref={fileRef} onChange={onImport} className="form-control w-auto" />
              </div>
              <button className="btn btn-success" onClick={loadGamesWithCovers}>
                Load Games with Covers
              </button>
              <small className="text-muted">
                This will load games.with-covers.json which includes cover image URLs.
              </small>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h3 className="h6">Cover Cache</h3>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-success" onClick={Cache.exportAll}>Export cover ZIP</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
