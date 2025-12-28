import React from 'react'
import { adminFetch } from '../utils/adminFetch.js'
import { useGame } from '../context/GameContext.jsx'

const blankForm = {
  id: null,
  name: '',
  console: '',
  consoles: [],
  overlayTitle: '',
  overlaySubtitle: ''
}

function getConsoleName(game) {
  if (!game) return ''
  if (typeof game.console === 'string') return game.console
  if (typeof game.console === 'object') return game.console.name || game.console.id || ''
  return String(game.console || '')
}

export default function Events() {
  const { state } = useGame()
  const [events, setEvents] = React.useState([])
  const [activeEventId, setActiveEventId] = React.useState(null)
  const [form, setForm] = React.useState(blankForm)
  const [status, setStatus] = React.useState('')

  const consoleOptions = React.useMemo(() => {
    const set = new Set()
    ;(state.games || []).forEach(game => {
      const name = getConsoleName(game).trim()
      if (name) set.add(name)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [state.games])

  const load = React.useCallback(async () => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/events`)
      if (!res.ok) throw new Error('Failed to load events')
      const data = await res.json()
      setEvents(Array.isArray(data.events) ? data.events : [])
      setActiveEventId(data.activeEventId || null)
    } catch (error) {
      setStatus('Failed to load events.')
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleConsolesChange = (event) => {
    const next = Array.from(event.target.selectedOptions).map(opt => opt.value)
    setForm(prev => ({ ...prev, consoles: next }))
  }

  const resetForm = () => {
    setForm(blankForm)
  }

  const submit = async () => {
    setStatus('')
    if (!form.name.trim()) {
      setStatus('Event name is required.')
      return
    }
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const payload = {
        name: form.name,
        console: form.console,
        consoles: form.consoles,
        overlayTitle: form.overlayTitle,
        overlaySubtitle: form.overlaySubtitle
      }
      const isEdit = !!form.id
      const res = await adminFetch(`${base}/api/admin/events${isEdit ? `/${form.id}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save event')
      }
      resetForm()
      await load()
      setStatus(isEdit ? 'Event updated.' : 'Event created.')
    } catch (error) {
      setStatus(error.message || 'Failed to save event.')
    }
  }

  const editEvent = (event) => {
    setForm({
      id: event.id,
      name: event.name || '',
      console: event.console || '',
      consoles: Array.isArray(event.consoles) ? event.consoles : [],
      overlayTitle: event.overlayTitle || '',
      overlaySubtitle: event.overlaySubtitle || ''
    })
  }

  const setActive = async (eventId) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/events/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId })
      })
      if (!res.ok) throw new Error('Failed to set active event')
      setActiveEventId(eventId)
      setStatus('Active event updated.')
    } catch (error) {
      setStatus(error.message || 'Failed to update active event.')
    }
  }

  const removeEvent = async (eventId) => {
    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Delete this event? Timers stay in the database, but this profile will be removed.') : true
    if (!ok) return
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const res = await adminFetch(`${base}/api/admin/events/${eventId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete event')
      }
      await load()
      setStatus('Event deleted.')
    } catch (error) {
      setStatus(error.message || 'Failed to delete event.')
    }
  }

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-1">Events</h2>
          <div className="text-secondary small">Create event profiles and switch the active overlay timer.</div>
        </div>
        <button className="btn btn-sm btn-outline-light" onClick={load}>Refresh</button>
      </div>

      {status && <div className="alert alert-secondary py-2">{status}</div>}

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <div className="card bg-panel p-3">
            <h3 className="h6">Event Profiles</h3>
            {events.length === 0 && (
              <div className="text-secondary small">No events yet.</div>
            )}
            {events.map(event => (
              <div key={event.id} className="d-flex align-items-center justify-content-between border-bottom py-2">
                <div>
                  <div className="fw-semibold">{event.name}</div>
                  <div className="text-secondary small">
                    {event.console || 'No console label'} {event.overlayTitle ? `| Overlay: ${event.overlayTitle}` : ''}
                  </div>
                  {Array.isArray(event.consoles) && event.consoles.length > 0 && (
                    <div className="small text-secondary">
                      Filters: {event.consoles.join(', ')}
                    </div>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <button
                    className={`btn btn-sm ${activeEventId === event.id ? 'btn-success' : 'btn-outline-light'}`}
                    onClick={() => setActive(event.id)}
                  >
                    {activeEventId === event.id ? 'Active' : 'Set Active'}
                  </button>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => editEvent(event)}>Edit</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => removeEvent(event.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="card bg-panel p-3">
            <h3 className="h6">{form.id ? 'Edit Event' : 'Create Event'}</h3>
            <div className="mb-2">
              <label className="form-label">Event Name</label>
              <input
                className="form-control"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="N64 Marathon"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Console Label (shown on overlay)</label>
              <input
                className="form-control"
                value={form.console}
                onChange={e => setForm(prev => ({ ...prev, console: e.target.value }))}
                placeholder="Nintendo 64"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Overlay Title (optional)</label>
              <input
                className="form-control"
                value={form.overlayTitle}
                onChange={e => setForm(prev => ({ ...prev, overlayTitle: e.target.value }))}
                placeholder="Event Title"
              />
            </div>
            <div className="mb-2">
              <label className="form-label">Overlay Subtitle (optional)</label>
              <input
                className="form-control"
                value={form.overlaySubtitle}
                onChange={e => setForm(prev => ({ ...prev, overlaySubtitle: e.target.value }))}
                placeholder="Subtitle or console name"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Event Console Filter</label>
              <select
                className="form-select"
                multiple
                value={form.consoles}
                onChange={handleConsolesChange}
                size={Math.min(8, Math.max(4, consoleOptions.length || 4))}
              >
                {consoleOptions.length === 0 && <option value="">No consoles found</option>}
                {consoleOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <div className="form-text">Use CTRL or CMD to select multiple consoles.</div>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={submit}>{form.id ? 'Save Event' : 'Create Event'}</button>
              {form.id && (
                <button className="btn btn-outline-secondary" onClick={resetForm}>Cancel</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
