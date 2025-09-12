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
    a.download = 'games.json'
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

  // Tip: To import a file, prepare a JSON array like:
  // [ { "id": "game:ra:1234", "title": "Game Title", "console": "PlayStation", "status": "Not Started" } ]

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
              <small className="text-muted">
                Tip: Use the “Export JSON” button to see the expected shape. You can also build your own <code>games.json</code> and import it here.
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
