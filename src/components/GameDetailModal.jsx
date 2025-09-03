import React, { useState, useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext.jsx'
import * as Cache from '../services/cache.js'

export default function GameDetailModal({ game, onClose }) {
  const { dispatch } = useGame()
  const fileInputRef = useRef(null)
  const [currentCover, setCurrentCover] = useState(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [fixedTime, setFixedTime] = useState('-')
  const [formData, setFormData] = useState({
    status: '',
    rating: '',
    completion_time: '',
    date_started: '',
    date_finished: '',
    notes: ''
  })

  // Load current cover
  useEffect(() => {
    const loadCover = async () => {
      if (!game?.image_url) {
        setCurrentCover(null)
        return
      }

      try {
        // Try IndexedDB cache first
        const cachedBlob = await Cache.getCover(game.image_url)
        if (cachedBlob) {
          setCurrentCover(URL.createObjectURL(cachedBlob))
          return
        }

        // Try local hashed file
        if (game.image_url.startsWith('https://')) {
          const urlBuffer = new TextEncoder().encode(game.image_url)
          const hashBuffer = await crypto.subtle.digest('SHA-1', urlBuffer)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
          
          // Try both .jpg and .png extensions
          // RetroAchievements URLs are always .png, so try .png first for those
          const extensions = game.image_url.includes('retroachievements.org') 
            ? ['.png', '.jpg'] 
            : ['.jpg', '.png']
          
          for (const ext of extensions) {
            const response = await fetch(`/covers/${hashHex}${ext}`)
            if (response.ok) {
              setCurrentCover(`/covers/${hashHex}${ext}`)
              return
            }
          }
        }

        // Fallback to direct URL
        setCurrentCover(game.image_url)
      } catch (error) {
        console.warn('Failed to load cover:', error)
        setCurrentCover(null)
      }
    }

    loadCover()
  }, [game?.image_url])

  useEffect(() => {
    if (game) {
      setFormData({
        status: game.status || 'Not Started',
        rating: game.rating || '',
        completion_time: game.completion_time || '',
        date_started: game.date_started ? game.date_started.split('T')[0] : '',
        date_finished: game.date_finished ? game.date_finished.split('T')[0] : '',
        notes: game.notes || ''
      })
    }
  }, [game])

  // Load fixed time from server timers per-game seconds
  useEffect(() => {
    let cancelled = false
    const loadFixedTime = async () => {
      try {
        if (!game?.id) { setFixedTime('-'); return }
        const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
        const r = await fetch(`${base}/overlay/timers/game/${encodeURIComponent(game.id)}`)
        if (!r.ok) { setFixedTime('-'); return }
        const j = await r.json()
        if (!cancelled) setFixedTime(j.formatted || '-')
      } catch {
        if (!cancelled) setFixedTime('-')
      }
    }
    loadFixedTime()
    return () => { cancelled = true }
  }, [game?.id])

  const handleFieldChange = (field, value) => {
    // Normalize date fields: keep date-only in form, store ISO at midnight in data
    let displayValue = value
    let storedValue = value === '' ? null : value
    if (field === 'date_started' || field === 'date_finished') {
      displayValue = value
      storedValue = value ? value + 'T00:00:00.000Z' : null
    }

    setFormData(prev => ({ ...prev, [field]: displayValue }))
    
    // Auto-save on change
    const updatedGame = {
      ...game,
      [field]: storedValue
    }
    
    // Auto-set dates based on status
    if (field === 'status') {
      const now = new Date().toISOString()
      if (value === 'In Progress' && !updatedGame.date_started) {
        updatedGame.date_started = now
        setFormData(prev => ({ ...prev, date_started: now.split('T')[0] }))
      } else if (value === 'Completed' && !updatedGame.date_finished) {
        updatedGame.date_finished = now
        setFormData(prev => ({ ...prev, date_finished: now.split('T')[0] }))
      }
    }
    
    dispatch({ type: 'UPDATE_GAME', game: updatedGame })
  }

  const handleSetCurrent = () => {
    if (game.status === 'Not Started') {
      const updatedGame = {
        ...game,
        status: 'In Progress',
        date_started: game.date_started || new Date().toISOString()
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
    }
    dispatch({ type: 'SET_CURRENT', id: game.id })
    onClose()
  }

  const handleMarkCompleted = () => {
    const updatedGame = {
      ...game,
      status: 'Completed',
      date_finished: game.date_finished || new Date().toISOString()
    }
    dispatch({ type: 'UPDATE_GAME', game: updatedGame })
  }

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB.')
      return
    }

    setIsUploadingCover(true)

    try {
      // Create a unique path for this custom cover
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const customPath = `custom-covers/${game.id}.${fileExt}`
      
      // Save to IndexedDB cache
      await Cache.saveCover(customPath, file)
      
      // Update game with new image_url
      const updatedGame = {
        ...game,
        image_url: customPath
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      
      // Update current cover display
      setCurrentCover(URL.createObjectURL(file))
      
    } catch (error) {
      console.error('Failed to upload cover:', error)
      alert('Failed to upload cover. Please try again.')
    } finally {
      setIsUploadingCover(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveCover = async () => {
    if (!confirm('Remove the current cover?')) return

    try {
      // Remove from cache if it's a custom cover
      if (game.image_url?.startsWith('custom-covers/')) {
        await Cache.deleteCover(game.image_url)
      }
      
      // Update game to remove cover
      const updatedGame = {
        ...game,
        image_url: null
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      
      setCurrentCover(null)
    } catch (error) {
      console.error('Failed to remove cover:', error)
      alert('Failed to remove cover. Please try again.')
    }
  }

  const handleResetProgress = () => {
    if (confirm('Reset all progress for this game?')) {
      const updatedGame = {
        ...game,
        status: 'Not Started',
        date_started: null,
        date_finished: null,
        completion_time: null,
        rating: null,
        notes: ''
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      setFormData({
        status: 'Not Started',
        rating: '',
        completion_time: '',
        date_started: '',
        date_finished: '',
        notes: ''
      })
    }
  }

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentCover && currentCover.startsWith('blob:')) {
        URL.revokeObjectURL(currentCover)
      }
    }
  }, [currentCover])

  if (!game) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title text-truncate me-3">{game.title}</h5>
            <button type="button" className="btn-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="modal-body">
            <div className="row">
              <div className="col-lg-4 mb-4">
                {/* Cover Section */}
                <div className="cover-upload-section">
                  <h6 className="text-secondary mb-3">Game Cover</h6>
                  <div className="cover-preview-container mb-3">
                    {currentCover ? (
                      <img 
                        src={currentCover} 
                        alt="Game cover" 
                        className="cover-preview img-fluid rounded"
                        style={{ maxHeight: '300px', width: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="cover-placeholder d-flex align-items-center justify-content-center bg-secondary rounded" 
                           style={{ height: '200px' }}>
                        <i className="bi bi-controller text-muted" style={{ fontSize: '3rem' }}></i>
                      </div>
                    )}
                  </div>
                  
                  <div className="d-flex gap-2 flex-wrap">
                    <button 
                      type="button" 
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingCover}
                    >
                      {isUploadingCover ? (
                        <><span className="spinner-border spinner-border-sm me-2"></span>Uploading...</>
                      ) : (
                        <><i className="bi bi-upload me-2"></i>{currentCover ? 'Replace' : 'Upload'} Cover</>
                      )}
                    </button>
                    
                    {currentCover && (
                      <button 
                        type="button" 
                        className="btn btn-outline-danger btn-sm"
                        onClick={handleRemoveCover}
                        disabled={isUploadingCover}
                      >
                        <i className="bi bi-trash me-2"></i>Remove
                      </button>
                    )}
                  </div>
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCoverUpload}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />
                  
                  <small className="text-muted d-block mt-2">
                    Supports JPG, PNG, WebP. Max 5MB.
                  </small>
                </div>
              </div>
              
              <div className="col-lg-8">
                <div className="row">
                  <div className="col-md-6">
                <div className="mb-3">
                  <label className="form-label">Console</label>
                  <input type="text" className="form-control" value={game.console} readOnly />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Status</label>
                  <select 
                    className="form-select" 
                    value={formData.status}
                    onChange={e => handleFieldChange('status', e.target.value)}
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Rating (1-10)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    min="1" 
                    max="10" 
                    value={formData.rating}
                    onChange={e => handleFieldChange('rating', e.target.value)}
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Fixed Time</label>
                  <input
                    type="text"
                    className="form-control"
                    value={fixedTime}
                    readOnly
                  />
                </div>
                  </div>
                  
                  <div className="col-md-6">
                <div className="mb-3">
                  <label className="form-label">Date Started</label>
                  <input 
                    type="date" 
                    className="form-control"
                    value={formData.date_started}
                    onChange={e => handleFieldChange('date_started', e.target.value)}
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Date Finished</label>
                  <input 
                    type="date" 
                    className="form-control"
                    value={formData.date_finished}
                    onChange={e => handleFieldChange('date_finished', e.target.value)}
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Notes</label>
                  <textarea 
                    className="form-control" 
                    rows="4"
                    value={formData.notes}
                    onChange={e => handleFieldChange('notes', e.target.value)}
                  />
                </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <div className="d-flex gap-2 flex-wrap">
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={handleSetCurrent}
              >
                <i className="bi bi-play-circle me-2"></i>Set as Current
              </button>
              <button 
                type="button" 
                className="btn btn-success"
                onClick={handleMarkCompleted}
              >
                <i className="bi bi-check-circle me-2"></i>Mark Completed
              </button>
              <button 
                type="button" 
                className="btn btn-outline-danger"
                onClick={handleResetProgress}
              >
                <i className="bi bi-arrow-counterclockwise me-2"></i>Reset Progress
              </button>
              <button 
                type="button" 
                className="btn btn-secondary ms-auto"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
