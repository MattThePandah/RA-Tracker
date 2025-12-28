import React from 'react'
import { createPortal } from 'react-dom'
import {
  getTimerData,
  startCurrentTimer,
  pauseCurrentTimer,
  resetCurrentTimer,
  resetTotalTimer,
  setTimerTimes
} from '../services/storage.js'

const toNumber = (value) => {
  const n = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

const clampPart = (value, max) => {
  const n = toNumber(value)
  return Math.min(max, Math.max(0, n))
}

const splitTime = (value) => {
  const raw = String(value || '0:00:00').trim()
  const parts = raw.split(':').map(p => p.trim())
  while (parts.length < 3) parts.unshift('0')
  const slice = parts.slice(-3)
  return {
    h: String(toNumber(slice[0])),
    m: String(toNumber(slice[1])),
    s: String(toNumber(slice[2]))
  }
}

const partsToSeconds = (parts) => {
  const hours = Math.max(0, toNumber(parts.h))
  const minutes = clampPart(parts.m, 59)
  const seconds = clampPart(parts.s, 59)
  return (hours * 3600) + (minutes * 60) + seconds
}

export default function TimerDock() {
  const toggleRef = React.useRef(null)
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [panelPos, setPanelPos] = React.useState({ top: 72, left: 12 })
  const [timer, setTimer] = React.useState({
    running: false,
    currentFormatted: '0:00:00',
    totalFormatted: '0:00:00',
    currentGameId: null
  })
  const [eventInfo, setEventInfo] = React.useState(null)
  const [currentParts, setCurrentParts] = React.useState({ h: '0', m: '0', s: '0' })
  const [totalParts, setTotalParts] = React.useState({ h: '0', m: '0', s: '0' })

  const refresh = React.useCallback(async () => {
    try {
      const data = await getTimerData()
      setTimer({
        running: !!data.running,
        currentFormatted: data.currentFormatted || '0:00:00',
        totalFormatted: data.totalFormatted || '0:00:00',
        currentGameId: data.currentGameId || null
      })
    } catch (err) {
      setError('Failed to load timer data.')
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 1000)
    return () => clearInterval(id)
  }, [refresh])

  React.useEffect(() => {
    let mounted = true
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    const loadEvent = async () => {
      try {
        const res = await fetch(`${base}/api/admin/events/active`, { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (mounted) setEventInfo(data?.event || null)
      } catch {}
    }
    loadEvent()
    const id = setInterval(loadEvent, 15000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setCurrentParts(splitTime(timer.currentFormatted))
    setTotalParts(splitTime(timer.totalFormatted))
    setError('')
  }, [open])

  const updatePosition = React.useCallback(() => {
    if (!toggleRef.current) return
    const rect = toggleRef.current.getBoundingClientRect()
    const panelWidth = 340
    const padding = 12
    const left = Math.min(
      window.innerWidth - panelWidth - padding,
      Math.max(padding, rect.right - panelWidth)
    )
    const top = Math.min(window.innerHeight - 20, rect.bottom + 8)
    setPanelPos({ top, left })
  }, [])

  React.useEffect(() => {
    if (!open) return
    updatePosition()
    const handle = () => updatePosition()
    window.addEventListener('resize', handle)
    window.addEventListener('scroll', handle, true)
    return () => {
      window.removeEventListener('resize', handle)
      window.removeEventListener('scroll', handle, true)
    }
  }, [open, updatePosition])

  React.useEffect(() => {
    if (!open) return
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open])

  const handleApply = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {}
      if (timer.currentGameId) payload.currentSeconds = partsToSeconds(currentParts)
      payload.totalSeconds = partsToSeconds(totalParts)
      const ok = await setTimerTimes(payload)
      if (!ok) throw new Error('Timer update failed')
      setOpen(false)
    } catch (err) {
      setError('Failed to update timers.')
    } finally {
      setSaving(false)
    }
  }

  const canStart = !!timer.currentGameId

  return (
    <div className="timer-dock">
      <button
        ref={toggleRef}
        type="button"
        className="stat-chip timer-dock-toggle"
        onClick={() => setOpen(prev => !prev)}
      >
        <span className={`timer-status-dot ${timer.running ? 'running' : ''}`} />
        <span className="ms-2">{timer.currentFormatted}</span>
      </button>

      {open && createPortal(
        <>
          <div className="timer-dock-backdrop" onClick={() => setOpen(false)} />
          <div
            className="timer-dock-panel"
            style={{ top: panelPos.top, left: panelPos.left, right: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="timer-dock-header">
            <div className="timer-dock-title">Event Timers</div>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(false)}>Close</button>
          </div>
          {eventInfo?.name && (
            <div className="timer-dock-event">
              <span className="timer-dock-event-name">{eventInfo.overlayTitle || eventInfo.name}</span>
              {(eventInfo.overlaySubtitle || eventInfo.console) && (
                <span className="timer-dock-event-sub">
                  {' - '}
                  {eventInfo.overlaySubtitle || eventInfo.console}
                </span>
              )}
            </div>
          )}

            <div className="timer-dock-times">
              <div>
                <div className="timer-dock-label">Current</div>
                <div className="timer-dock-value">{timer.currentFormatted}</div>
              </div>
              <div>
                <div className="timer-dock-label">Total</div>
                <div className="timer-dock-value">{timer.totalFormatted}</div>
              </div>
            </div>

            {!timer.currentGameId && (
              <div className="timer-dock-note">
                Select a current game to start or edit the current timer.
              </div>
            )}

            <div className="timer-dock-group">
              <div className="timer-dock-label">Current Game Time</div>
              <div className="timer-dock-inputs">
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={currentParts.h}
                  onChange={e => setCurrentParts(prev => ({ ...prev, h: e.target.value }))}
                  disabled={!timer.currentGameId}
                  aria-label="Current hours"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="form-control"
                  value={currentParts.m}
                  onChange={e => setCurrentParts(prev => ({ ...prev, m: e.target.value }))}
                  disabled={!timer.currentGameId}
                  aria-label="Current minutes"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="form-control"
                  value={currentParts.s}
                  onChange={e => setCurrentParts(prev => ({ ...prev, s: e.target.value }))}
                  disabled={!timer.currentGameId}
                  aria-label="Current seconds"
                />
              </div>
            </div>

            <div className="timer-dock-group">
              <div className="timer-dock-label">Event Total</div>
              <div className="timer-dock-inputs">
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={totalParts.h}
                  onChange={e => setTotalParts(prev => ({ ...prev, h: e.target.value }))}
                  aria-label="Total hours"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="form-control"
                  value={totalParts.m}
                  onChange={e => setTotalParts(prev => ({ ...prev, m: e.target.value }))}
                  aria-label="Total minutes"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="form-control"
                  value={totalParts.s}
                  onChange={e => setTotalParts(prev => ({ ...prev, s: e.target.value }))}
                  aria-label="Total seconds"
                />
              </div>
            </div>

            <div className="timer-dock-actions">
              {timer.running ? (
                <button className="btn btn-sm btn-outline-warning" onClick={pauseCurrentTimer} disabled={!canStart}>
                  Pause
                </button>
              ) : (
                <button className="btn btn-sm btn-outline-success" onClick={startCurrentTimer} disabled={!canStart}>
                  Start
                </button>
              )}
              <button className="btn btn-sm btn-outline-light" onClick={resetCurrentTimer} disabled={!canStart}>
                Reset Current
              </button>
              <button className="btn btn-sm btn-outline-danger" onClick={resetTotalTimer}>
                Reset Total
              </button>
            </div>

            <div className="timer-dock-footer">
              <button className="btn btn-sm btn-primary" onClick={handleApply} disabled={saving}>
                {saving ? 'Saving...' : 'Apply Changes'}
              </button>
              {error && <div className="text-danger small">{error}</div>}
            </div>
          </div>
        </>,
        (typeof document !== 'undefined' && document.querySelector('.admin-shell')) || document.body
      )}
    </div>
  )
}
