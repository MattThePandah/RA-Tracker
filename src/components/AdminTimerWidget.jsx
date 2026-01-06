import React from 'react'
import {
  getTimerData,
  startCurrentTimer,
  pauseCurrentTimer,
  resetCurrentTimer,
  resetTotalTimer
} from '../services/storage.js'

export default function AdminTimerWidget() {
  const [timer, setTimer] = React.useState({
    running: false,
    currentFormatted: '0:00:00',
    totalFormatted: '0:00:00',
    currentGameId: null
  })

  const refresh = React.useCallback(async () => {
    try {
      const data = await getTimerData()
      setTimer({
        running: !!data.running,
        currentFormatted: data.currentFormatted || '0:00:00',
        totalFormatted: data.totalFormatted || '0:00:00',
        currentGameId: data.currentGameId || null
      })
    } catch (err) {}
  }, [])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 1000)
    return () => clearInterval(id)
  }, [refresh])

  const canStart = !!timer.currentGameId

  return (
    <div className="admin-timer-widget bg-dark rounded p-3 border border-secondary border-opacity-10">
      <div className="row g-3">
        <div className="col-6 border-end border-secondary border-opacity-10">
          <div className="small text-secondary text-uppercase fw-bold mb-1" style={{ fontSize: '0.65rem' }}>Session</div>
          <div className={`h3 mb-0 fw-bold font-monospace ${timer.running ? 'text-success' : 'text-light opacity-50'}`}>
            {timer.currentFormatted}
          </div>
        </div>
        <div className="col-6 ps-3">
          <div className="small text-secondary text-uppercase fw-bold mb-1" style={{ fontSize: '0.65rem' }}>Event Total</div>
          <div className="h3 mb-0 fw-bold font-monospace text-brand">
            {timer.totalFormatted}
          </div>
        </div>
      </div>

      <div className="d-flex gap-2 mt-3 pt-3 border-top border-secondary border-opacity-10">
        {timer.running ? (
          <button className="btn btn-sm btn-warning flex-grow-1 fw-bold" onClick={pauseCurrentTimer}>
            <i className="bi bi-pause-fill me-1"></i> PAUSE
          </button>
        ) : (
          <button className="btn btn-sm btn-success flex-grow-1 fw-bold" onClick={startCurrentTimer} disabled={!canStart}>
            <i className="bi bi-play-fill me-1"></i> START
          </button>
        )}
        <button className="btn btn-sm btn-outline-light d-flex align-items-center gap-1" onClick={resetCurrentTimer} title="Reset Session">
          <i className="bi bi-arrow-counterclockwise"></i>
          <span>Reset Session</span>
        </button>
        <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={resetTotalTimer} title="Reset Event Total">
          <i className="bi bi-trash"></i>
          <span>Reset Total</span>
        </button>
      </div>
      
      {!canStart && (
        <div className="small text-warning mt-2" style={{ fontSize: '0.7rem' }}>
          <i className="bi bi-exclamation-triangle me-1"></i> Select a game to enable session timer
        </div>
      )}
    </div>
  )
}
