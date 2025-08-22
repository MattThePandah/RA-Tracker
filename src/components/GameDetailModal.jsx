import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext.jsx'

export default function GameDetailModal({ game, onClose }) {
  const { dispatch } = useGame()
  const [formData, setFormData] = useState({
    status: '',
    rating: '',
    completion_time: '',
    date_started: '',
    date_finished: '',
    notes: ''
  })

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

  const handleFieldChange = (field, value) => {
    const newFormData = { ...formData, [field]: value }
    setFormData(newFormData)
    
    // Auto-save on change
    const updatedGame = {
      ...game,
      [field]: value === '' ? null : value
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

  if (!game) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{game.title}</h5>
            <button type="button" className="btn-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="modal-body">
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
                  <label className="form-label">Completion Time (hours)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    step="0.5" 
                    min="0"
                    value={formData.completion_time}
                    onChange={e => handleFieldChange('completion_time', e.target.value)}
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
                    onChange={e => handleFieldChange('date_started', e.target.value + 'T00:00:00.000Z')}
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Date Finished</label>
                  <input 
                    type="date" 
                    className="form-control"
                    value={formData.date_finished}
                    onChange={e => handleFieldChange('date_finished', e.target.value + 'T00:00:00.000Z')}
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
          
          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={handleSetCurrent}
            >
              Set as Current
            </button>
            <button 
              type="button" 
              className="btn btn-success"
              onClick={handleMarkCompleted}
            >
              Mark Completed
            </button>
            <button 
              type="button" 
              className="btn btn-danger"
              onClick={handleResetProgress}
            >
              Reset Progress
            </button>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}