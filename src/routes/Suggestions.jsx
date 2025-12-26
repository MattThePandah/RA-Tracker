import React from 'react'
import { fetchSuggestions, updateSuggestion, fetchAdminSettings, updateAdminSettings } from '../services/publicApi.js'

const STATUS_OPTIONS = ['open', 'accepted', 'declined']

export default function Suggestions() {
  const [items, setItems] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [consoleOptions, setConsoleOptions] = React.useState([])
  const [settings, setSettings] = React.useState({ suggestions_open: true, max_open: 100, console_limits: {} })
  const [settingsDraft, setSettingsDraft] = React.useState({ suggestions_open: true, max_open: 100, console_limits: [] })
  const [settingsError, setSettingsError] = React.useState('')
  const [settingsSaved, setSettingsSaved] = React.useState(false)

  const makeLimitRow = (key = '', limit = '') => ({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    key,
    limit
  })

  const limitsToRows = (limits = {}) => {
    return Object.entries(limits).map(([key, value]) => makeLimitRow(key, value))
  }

  const updateLimitRow = (id, field, value) => {
    setSettingsDraft(prev => ({
      ...prev,
      console_limits: prev.console_limits.map(row => (
        row.id === id ? { ...row, [field]: value } : row
      ))
    }))
  }

  const addLimitRow = () => {
    setSettingsDraft(prev => ({
      ...prev,
      console_limits: [...prev.console_limits, makeLimitRow()]
    }))
  }

  const removeLimitRow = (id) => {
    setSettingsDraft(prev => ({
      ...prev,
      console_limits: prev.console_limits.filter(row => row.id !== id)
    }))
  }

  const consoleKeySet = React.useMemo(() => {
    return new Set(consoleOptions.map(option => option.key))
  }, [consoleOptions])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const [suggestionsData, settingsData, consolesData] = await Promise.all([
        fetchSuggestions(),
        fetchAdminSettings(),
        fetch(`${base}/api/consoles`, { credentials: 'include' }).then(res => res.ok ? res.json() : null).catch(() => null)
      ])
      setItems(suggestionsData.suggestions || [])
      const nextSettings = {
        suggestions_open: !!settingsData.suggestions_open,
        max_open: settingsData.max_open ?? 0,
        console_limits: settingsData.console_limits || {}
      }
      setSettings(nextSettings)
      setSettingsDraft({
        suggestions_open: nextSettings.suggestions_open,
        max_open: nextSettings.max_open,
        console_limits: limitsToRows(nextSettings.console_limits || {})
      })
      if (consolesData?.consoles) {
        const options = consolesData.consoles
          .map(c => ({ key: String(c.name || '').trim(), label: String(c.name || '').trim() }))
          .filter(option => option.key)
          .sort((a, b) => a.label.localeCompare(b.label))
        setConsoleOptions(options)
      }
    } catch (err) {
      setError('Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    load()
  }, [])

  const onStatusChange = async (id, status) => {
    try {
      const updated = await updateSuggestion(id, { status })
      setItems(prev => prev.map(item => item.id === id ? updated : item))
    } catch (err) {
      setError('Failed to update suggestion')
    }
  }

  const onSaveSettings = async () => {
    setSettingsError('')
    setSettingsSaved(false)
    let consoleLimits = {}
    settingsDraft.console_limits.forEach(row => {
      const key = String(row.key || '').trim().toLowerCase()
      if (!key) return
      const limit = Number(row.limit)
      if (!Number.isFinite(limit) || limit < 0) return
      consoleLimits[key] = Math.floor(limit)
    })
    try {
      const updated = await updateAdminSettings({
        suggestions_open: settingsDraft.suggestions_open,
        max_open: Number(settingsDraft.max_open) || 0,
        console_limits: consoleLimits
      })
      setSettings(updated)
      setSettingsDraft({
        suggestions_open: !!updated.suggestions_open,
        max_open: updated.max_open ?? 0,
        console_limits: limitsToRows(updated.console_limits || {})
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (err) {
      setSettingsError('Failed to update settings.')
    }
  }

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-0">Viewer Suggestions</h2>
          <div className="text-secondary small">Manage game recommendations from the public page and StreamerBot.</div>
        </div>
        <button className="btn btn-sm btn-outline-light" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <div className="card bg-panel p-3 mb-3">
        <h5 className="h6 mb-3">Suggestion Intake Controls</h5>
        {settingsError && <div className="alert alert-danger">{settingsError}</div>}
        {settingsSaved && <div className="alert alert-success">Settings saved.</div>}
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Suggestions Open</label>
            <select
              className="form-select"
              value={settingsDraft.suggestions_open ? 'open' : 'closed'}
              onChange={e => setSettingsDraft(prev => ({ ...prev, suggestions_open: e.target.value === 'open' }))}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Max Open Suggestions</label>
            <input
              type="number"
              min="0"
              className="form-control"
              value={settingsDraft.max_open}
              onChange={e => setSettingsDraft(prev => ({ ...prev, max_open: e.target.value }))}
            />
          </div>
          <div className="col-md-4 d-flex align-items-end">
            <button className="btn btn-outline-primary w-100" onClick={onSaveSettings}>Save Settings</button>
          </div>
          <div className="col-12">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <label className="form-label mb-0">Console Limits</label>
              <button className="btn btn-sm btn-outline-secondary" type="button" onClick={addLimitRow}>
                Add Console
              </button>
            </div>
            {settingsDraft.console_limits.length === 0 ? (
              <div className="text-secondary small">No console limits yet.</div>
            ) : (
              <div className="vstack gap-2">
                {settingsDraft.console_limits.map(row => (
                  <div className="row g-2 align-items-center" key={row.id}>
                    <div className="col-sm-6">
                      <select
                        className="form-select"
                        value={row.key}
                        onChange={e => updateLimitRow(row.id, 'key', e.target.value)}
                      >
                        <option value="">Select console...</option>
                        {row.key && !consoleKeySet.has(row.key) && (
                          <option value={row.key}>{row.key} (custom)</option>
                        )}
                        {consoleOptions.map(option => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-sm-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="form-control"
                        placeholder="Limit"
                        value={row.limit}
                        onChange={e => updateLimitRow(row.id, 'limit', e.target.value)}
                      />
                    </div>
                    <div className="col-sm-3 d-flex justify-content-sm-end">
                      <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => removeLimitRow(row.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <small className="text-secondary">Keys are lowercased on save to match incoming console names.</small>
          </div>
        </div>
      </div>

      <div className="card bg-panel p-3">
        {items.length === 0 ? (
          <div className="text-secondary">No suggestions yet.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-dark align-middle">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Console</th>
                  <th>Requested By</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.console || '-'}</td>
                    <td>{item.requester || 'Viewer'}</td>
                    <td>{item.note || '-'}</td>
                    <td style={{ minWidth: 140 }}>
                      <select
                        className="form-select form-select-sm"
                        value={item.status || 'open'}
                        onChange={e => onStatusChange(item.id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small text-secondary">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
