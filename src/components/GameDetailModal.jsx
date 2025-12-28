import React, { useEffect, useMemo, useRef, useState } from 'react'
import TurndownService from 'turndown'
import { useGame } from '../context/GameContext.jsx'
import * as Cache from '../services/cache.js'
import { fetchPublicGame, savePublicGame } from '../services/publicApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { adminFetch } from '../utils/adminFetch.js'
import { renderMarkdown } from '../utils/markdown.js'
import { extractGameIdFromInternalId } from '../services/retroachievements.js'
import { useAchievements } from '../context/AchievementContext.jsx'

const toTimeParts = (hoursValue) => {
  const hoursNum = Number(hoursValue || 0)
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
    return { hours: '', minutes: '', seconds: '' }
  }
  const totalSeconds = Math.max(0, Math.round(hoursNum * 3600))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return {
    hours: String(hours),
    minutes: String(minutes),
    seconds: String(seconds)
  }
}

const normalizeDuration = (hoursValue, minutesValue, secondsValue) => {
  const hours = Math.max(0, Math.floor(Number(hoursValue) || 0))
  const minutes = Math.max(0, Math.floor(Number(minutesValue) || 0))
  const seconds = Math.max(0, Math.floor(Number(secondsValue) || 0))
  return {
    totalSeconds: (hours * 3600) + (minutes * 60) + seconds,
    hours,
    minutes,
    seconds
  }
}

export default function GameDetailModal({ game, onClose }) {
  const { dispatch } = useGame()
  const { state: achState, loadGameAchievements } = useAchievements()
  const fileInputRef = useRef(null)
  const editorRef = useRef(null)
  const lastEditorMarkdown = useRef('')
  const [currentCover, setCurrentCover] = useState(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [fixedTime, setFixedTime] = useState('-')
  const [activeTab, setActiveTab] = useState('private')
  const [publicReviewMode, setPublicReviewMode] = useState('markdown')
  const [coverFetchState, setCoverFetchState] = useState(false)
  const [coverFetchMessage, setCoverFetchMessage] = useState('')
  const [publicForm, setPublicForm] = useState({
    publicStatus: 'Hidden',
    publicRating: '',
    publicReviewTitle: '',
    publicReview: '',
    publicVideoUrl: ''
  })
  const [publicLoading, setPublicLoading] = useState(false)
  const [publicSaved, setPublicSaved] = useState(false)
  const [publicError, setPublicError] = useState('')
  const [showAchPicker, setShowAchPicker] = useState(false)
  const [privateSaved, setPrivateSaved] = useState(false)
  const [privateSaving, setPrivateSaving] = useState(false)
  const [privateDirty, setPrivateDirty] = useState(false)
  const [formData, setFormData] = useState({
    status: '',
    rating: '',
    completion_hours: '',
    completion_minutes: '',
    completion_seconds: '',
    date_started: '',
    date_finished: '',
    notes: ''
  })

  const turndownService = useMemo(() => {
    return new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    })
  }, [])

  useEffect(() => {
    lastEditorMarkdown.current = ''
    setActiveTab('private')
    setPublicReviewMode('markdown')
    setPublicSaved(false)
    setPublicError('')
    setCoverFetchMessage('')
    setPrivateSaved(false)
    setPrivateDirty(false)
  }, [game?.id])

  useEffect(() => {
    const loadCover = async () => {
      if (!game?.image_url) {
        setCurrentCover(null)
        return
      }

      try {
        const cachedBlob = await Cache.getCover(game.image_url)
        if (cachedBlob) {
          setCurrentCover(URL.createObjectURL(cachedBlob))
          return
        }

        const base = import.meta.env.VITE_IGDB_PROXY_URL || ''
        const safeBase = base ? base.replace(/\/+$/, '') : ''

        if (game.image_url.startsWith('https://')) {
          const urlBuffer = new TextEncoder().encode(game.image_url)
          const hashBuffer = await crypto.subtle.digest('SHA-1', urlBuffer)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

          const extensions = game.image_url.includes('retroachievements.org')
            ? ['.png', '.jpg']
            : ['.jpg', '.png']

          for (const ext of extensions) {
            const localPath = `/covers/${hashHex}${ext}`
            const localUrl = safeBase ? `${safeBase}${localPath}` : localPath
            const response = await fetch(localUrl)
            if (response.ok) {
              setCurrentCover(localUrl)
              return
            }
          }
        }

        setCurrentCover(buildCoverUrl(game.image_url))
      } catch (error) {
        console.warn('Failed to load cover:', error)
        setCurrentCover(null)
      }
    }

    loadCover()
  }, [game?.image_url])

  useEffect(() => {
    if (game) {
      const timeParts = toTimeParts(game.completion_time)
      setFormData({
        status: game.status || 'Not Started',
        rating: game.rating || '',
        completion_hours: timeParts.hours,
        completion_minutes: timeParts.minutes,
        completion_seconds: timeParts.seconds,
        date_started: game.date_started ? game.date_started.split('T')[0] : '',
        date_finished: game.date_finished ? game.date_finished.split('T')[0] : '',
        notes: game.notes || ''
      })
      setPrivateDirty(false)
    }
  }, [game])

  useEffect(() => {
    let mounted = true
    const loadPublic = async () => {
      if (!game?.id) return
      setPublicLoading(true)
      setPublicError('')
      try {
        const data = await fetchPublicGame(game.id)
        if (!mounted) return
        setPublicForm({
          publicStatus: data.publicStatus || 'Hidden',
          publicRating: data.publicRating ?? '',
          publicReviewTitle: data.publicReviewTitle || '',
          publicReview: data.publicReview || '',
          publicVideoUrl: data.publicVideoUrl || ''
        })
      } catch (error) {
        if (error.status !== 404) {
          setPublicError('Failed to load public info.')
        }
        setPublicForm({
          publicStatus: 'Hidden',
          publicRating: '',
          publicReviewTitle: '',
          publicReview: '',
          publicVideoUrl: ''
        })
      } finally {
        if (mounted) setPublicLoading(false)
      }
    }
    loadPublic()
    return () => { mounted = false }
  }, [game?.id])

  useEffect(() => {
    if (activeTab === 'public' && game?.id) {
      loadGameAchievements(game.id)
    }
  }, [activeTab, game?.id])

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

  useEffect(() => {
    if (publicReviewMode !== 'wysiwyg') return
    if (!editorRef.current) return
    if (publicForm.publicReview === lastEditorMarkdown.current) return
    const html = renderMarkdown(publicForm.publicReview || '')
    editorRef.current.innerHTML = html
  }, [publicForm.publicReview, publicReviewMode])

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setPrivateDirty(true)
  }

  const persistMetadata = async (payload) => {
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      await adminFetch(`${base}/api/user/metadata/${encodeURIComponent(game.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch {}
  }

  const handlePrivateSave = async () => {
    if (!game) return
    setPrivateSaving(true)
    setPrivateSaved(false)
    const duration = normalizeDuration(
      formData.completion_hours,
      formData.completion_minutes,
      formData.completion_seconds
    )
    const totalSeconds = duration.totalSeconds
    const completion_time = totalSeconds ? Number((totalSeconds / 3600).toFixed(6)) : null
    const rating = formData.rating === '' ? null : Number(formData.rating)
    let date_started = formData.date_started ? `${formData.date_started}T00:00:00.000Z` : null
    let date_finished = formData.date_finished ? `${formData.date_finished}T00:00:00.000Z` : null
    const status = formData.status || 'Not Started'
    const now = new Date().toISOString()
    if (status === 'In Progress' && !date_started) {
      date_started = now
    }
    if (status === 'Completed' && !date_finished) {
      date_finished = now
    }

    const updatedGame = {
      ...game,
      status,
      rating: Number.isFinite(rating) ? rating : null,
      completion_time,
      date_started,
      date_finished,
      notes: formData.notes || ''
    }
    dispatch({ type: 'UPDATE_GAME', game: updatedGame })
    await persistMetadata({
      status: updatedGame.status,
      rating: updatedGame.rating,
      completion_time: updatedGame.completion_time,
      date_started: updatedGame.date_started,
      date_finished: updatedGame.date_finished,
      notes: updatedGame.notes
    })
    const timeParts = toTimeParts(updatedGame.completion_time)
    setFormData(prev => ({
      ...prev,
      completion_hours: timeParts.hours,
      completion_minutes: timeParts.minutes,
      completion_seconds: timeParts.seconds,
      date_started: updatedGame.date_started ? updatedGame.date_started.split('T')[0] : '',
      date_finished: updatedGame.date_finished ? updatedGame.date_finished.split('T')[0] : ''
    }))
    setPrivateSaving(false)
    setPrivateSaved(true)
    setPrivateDirty(false)
    setTimeout(() => setPrivateSaved(false), 2000)
  }

  const handlePrivateReset = () => {
    if (!game) return
    const timeParts = toTimeParts(game.completion_time)
    setFormData({
      status: game.status || 'Not Started',
      rating: game.rating || '',
      completion_hours: timeParts.hours,
      completion_minutes: timeParts.minutes,
      completion_seconds: timeParts.seconds,
      date_started: game.date_started ? game.date_started.split('T')[0] : '',
      date_finished: game.date_finished ? game.date_finished.split('T')[0] : '',
      notes: game.notes || ''
    })
    setPrivateDirty(false)
  }

  const handleSetCurrent = () => {
    if (game.status === 'Not Started') {
      const updatedGame = {
        ...game,
        status: 'In Progress',
        date_started: game.date_started || new Date().toISOString()
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      persistMetadata({
        status: updatedGame.status,
        date_started: updatedGame.date_started
      })
      const timeParts = toTimeParts(updatedGame.completion_time)
      setFormData(prev => ({
        ...prev,
        status: updatedGame.status,
        date_started: updatedGame.date_started ? updatedGame.date_started.split('T')[0] : '',
        completion_hours: timeParts.hours,
        completion_minutes: timeParts.minutes,
        completion_seconds: timeParts.seconds
      }))
      setPrivateDirty(false)
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
    persistMetadata({
      status: updatedGame.status,
      date_finished: updatedGame.date_finished
    })
    setFormData(prev => ({
      ...prev,
      status: updatedGame.status,
      date_finished: updatedGame.date_finished ? updatedGame.date_finished.split('T')[0] : ''
    }))
    setPrivateDirty(false)
  }

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB.')
      return
    }

    setIsUploadingCover(true)

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const customPath = `custom-covers/${game.id}.${fileExt}`

      await Cache.saveCover(customPath, file)

      const updatedGame = {
        ...game,
        image_url: customPath
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      persistMetadata({
        status: updatedGame.status,
        date_started: updatedGame.date_started,
        date_finished: updatedGame.date_finished,
        completion_time: updatedGame.completion_time,
        rating: updatedGame.rating,
        notes: updatedGame.notes
      })
      setCurrentCover(URL.createObjectURL(file))
      await persistMetadata({ image_url: updatedGame.image_url })
    } catch (error) {
      console.error('Failed to upload cover:', error)
      alert('Failed to upload cover. Please try again.')
    } finally {
      setIsUploadingCover(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveCover = async () => {
    if (!confirm('Remove the current cover?')) return

    try {
      if (game.image_url?.startsWith('custom-covers/')) {
        await Cache.deleteCover(game.image_url)
      }

      const updatedGame = {
        ...game,
        image_url: null
      }
      dispatch({ type: 'UPDATE_GAME', game: updatedGame })
      setCurrentCover(null)
      await persistMetadata({ image_url: null })
    } catch (error) {
      console.error('Failed to remove cover:', error)
      alert('Failed to remove cover. Please try again.')
    }
  }

  const handleFetchCover = async () => {
    if (!game?.title) return
    setCoverFetchMessage('')
    setCoverFetchState(true)
    try {
      const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
      const raGameId = extractGameIdFromInternalId(game.id)
      const payload = {
        title: game.title,
        gameId: game.id || null,
        raGameId: raGameId ? String(raGameId) : null,
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
      await persistMetadata({
        image_url: updatedGame.image_url,
        release_year: updatedGame.release_year,
        publisher: updatedGame.publisher
      })
    } catch (error) {
      setCoverFetchMessage('Failed to fetch cover for this game.')
    } finally {
      setCoverFetchState(false)
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
      persistMetadata({
        status: updatedGame.status,
        date_started: updatedGame.date_started,
        date_finished: updatedGame.date_finished,
        completion_time: updatedGame.completion_time,
        rating: updatedGame.rating,
        notes: updatedGame.notes
      })
      setFormData({
        status: 'Not Started',
        rating: '',
        completion_hours: '',
        completion_minutes: '',
        completion_seconds: '',
        date_started: '',
        date_finished: '',
        notes: ''
      })
      setPrivateDirty(false)
    }
  }

  const syncEditorToMarkdown = () => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML || ''
    const markdown = turndownService.turndown(html)
    lastEditorMarkdown.current = markdown
    setPublicForm(prev => ({ ...prev, publicReview: markdown }))
  }

  const applyEditorCommand = (command, value) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
    setTimeout(syncEditorToMarkdown, 0)
  }

  const insertLink = () => {
    const url = prompt('Enter URL')
    if (!url) return
    applyEditorCommand('createLink', url)
  }

  const handleReviewModeChange = (nextMode) => {
    if (nextMode === publicReviewMode) return
    if (publicReviewMode === 'wysiwyg') {
      syncEditorToMarkdown()
    } else {
      lastEditorMarkdown.current = ''
    }
    setPublicReviewMode(nextMode)
  }

  const handlePublicSave = async () => {
    if (!game?.id) return
    setPublicSaved(false)
    setPublicError('')
    try {
      console.log('Saving public info. Achievements in state:', achState.currentGameAchievements?.length)
      const payload = {
        publicStatus: publicForm.publicStatus,
        publicRating: publicForm.publicRating === '' ? null : Number(publicForm.publicRating),
        publicReviewTitle: publicForm.publicReviewTitle,
        publicReview: publicForm.publicReview,
        publicVideoUrl: publicForm.publicVideoUrl,
        achievements: achState.currentGameAchievements || [],
        game: {
          id: game.id,
          title: game.title,
          console: game.console,
          image_url: game.image_url || null,
          release_year: game.release_year || null,
          publisher: game.publisher || null
        }
      }
      await savePublicGame(game.id, payload)
      setPublicSaved(true)
      setTimeout(() => setPublicSaved(false), 2000)
    } catch (error) {
      setPublicError('Failed to save public info.')
    }
  }

  useEffect(() => {
    return () => {
      if (currentCover && currentCover.startsWith('blob:')) {
        URL.revokeObjectURL(currentCover)
      }
    }
  }, [currentCover])

  if (!game) return null

  const statusLabel = formData.status || game.status || 'Not Started'
  const statusClass = `status-${statusLabel.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="modal-backdrop detail-modal" onClick={onClose}>
      <div className="modal-dialog modal-fullscreen" onClick={e => e.stopPropagation()}>
        <div className="modal-content detail-modal-card">
          <div className="detail-modal-header">
            <div>
              <div className="detail-title-row">
                <h2 className="detail-title">{game.title}</h2>
                <span className={`detail-status ${statusClass}`}>{statusLabel}</span>
              </div>
              <div className="detail-meta">
                {game.console || 'Unknown console'}
                {game.release_year ? ` - ${game.release_year}` : ''}
                {game.publisher ? ` - ${game.publisher}` : ''}
              </div>
            </div>
            <div className="detail-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSetCurrent}>
                Set as Current
              </button>
              <button type="button" className="btn btn-success btn-sm" onClick={handleMarkCompleted}>
                Mark Completed
              </button>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={handleResetProgress}>
                Reset Progress
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>

          <div className="detail-modal-body">
            <div className="detail-grid">
              <div className="detail-cover-card">
                <div className="detail-cover">
                  {currentCover ? (
                    <img src={currentCover} alt="Game cover" />
                  ) : (
                    <div className="public-cover-fallback">No cover</div>
                  )}
                </div>
                <div className="detail-cover-actions">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingCover}
                  >
                    {isUploadingCover ? 'Uploading...' : currentCover ? 'Replace Cover' : 'Upload Cover'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-warning btn-sm"
                    onClick={handleFetchCover}
                    disabled={coverFetchState}
                  >
                    {coverFetchState ? 'Fetching...' : 'Fetch Cover'}
                  </button>
                  {currentCover && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={handleRemoveCover}
                      disabled={isUploadingCover}
                    >
                      Remove Cover
                    </button>
                  )}
                </div>
                {coverFetchMessage && <div className="detail-alert error">{coverFetchMessage}</div>}
                <small className="text-secondary">Supports JPG, PNG, WebP. Max 5MB.</small>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleCoverUpload}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
              </div>

              <div className="detail-info-card">
                <div className="detail-tabs">
                  <button
                    type="button"
                    className={`detail-tab ${activeTab === 'private' ? 'active' : ''}`}
                    onClick={() => setActiveTab('private')}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    className={`detail-tab ${activeTab === 'public' ? 'active' : ''}`}
                    onClick={() => setActiveTab('public')}
                  >
                    Public
                  </button>
                </div>

                {activeTab === 'private' ? (
                  <div className="detail-panel">
                    <div className="detail-section-title">Private Tracking</div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Console</label>
                        <input type="text" className="form-control" value={game.console || ''} readOnly />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Fixed Time</label>
                        <input type="text" className="form-control" value={fixedTime} readOnly />
                      </div>
                      <div className="col-md-4">
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
                      <div className="col-md-4">
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
                      <div className="col-md-4">
                        <label className="form-label">Completion Time</label>
                        <div className="d-flex gap-2">
                          <input
                            type="number"
                            className="form-control"
                            min="0"
                            value={formData.completion_hours}
                            onChange={e => handleFieldChange('completion_hours', e.target.value)}
                            placeholder="H"
                          />
                          <input
                            type="number"
                            className="form-control"
                            min="0"
                            max="59"
                            value={formData.completion_minutes}
                            onChange={e => handleFieldChange('completion_minutes', e.target.value)}
                            placeholder="M"
                          />
                          <input
                            type="number"
                            className="form-control"
                            min="0"
                            max="59"
                            value={formData.completion_seconds}
                            onChange={e => handleFieldChange('completion_seconds', e.target.value)}
                            placeholder="S"
                          />
                        </div>
                        <div className="form-text text-secondary">Hours / minutes / seconds.</div>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Date Started</label>
                        <input
                          type="date"
                          className="form-control"
                          value={formData.date_started}
                          onChange={e => handleFieldChange('date_started', e.target.value)}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Date Finished</label>
                        <input
                          type="date"
                          className="form-control"
                          value={formData.date_finished}
                          onChange={e => handleFieldChange('date_finished', e.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label">Notes</label>
                        <textarea
                          className="form-control"
                          rows="5"
                          value={formData.notes}
                          onChange={e => handleFieldChange('notes', e.target.value)}
                        />
                      </div>
                      <div className="col-12 d-flex align-items-center justify-content-end gap-2">
                        {privateSaved && <div className="text-success small">Saved.</div>}
                        {privateDirty && !privateSaved && <div className="text-secondary small">Unsaved changes</div>}
                        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={handlePrivateReset} disabled={!privateDirty || privateSaving}>
                          Revert
                        </button>
                        <button className="btn btn-primary btn-sm" type="button" onClick={handlePrivateSave} disabled={privateSaving || !privateDirty}>
                          {privateSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="detail-panel">
                    <div className="detail-section-title">Public Publishing</div>
                    {publicLoading && <div className="detail-alert">Loading public info...</div>}
                    {publicSaved && <div className="detail-alert success">Saved.</div>}
                    {publicError && <div className="detail-alert error">{publicError}</div>}
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">Public Status</label>
                        <select
                          className="form-select"
                          value={publicForm.publicStatus}
                          onChange={e => setPublicForm(prev => ({ ...prev, publicStatus: e.target.value }))}
                        >
                          <option>Hidden</option>
                          <option>Planned</option>
                          <option>Queued</option>
                          <option>Completed</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Public Rating (0-10)</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.5"
                          className="form-control"
                          value={publicForm.publicRating}
                          onChange={e => setPublicForm(prev => ({ ...prev, publicRating: e.target.value }))}
                          placeholder="8.5"
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">YouTube URL</label>
                        <input
                          className="form-control"
                          value={publicForm.publicVideoUrl}
                          onChange={e => setPublicForm(prev => ({ ...prev, publicVideoUrl: e.target.value }))}
                          placeholder="https://youtu.be/..."
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label">Public Review Title</label>
                        <input
                          className="form-control"
                          value={publicForm.publicReviewTitle}
                          onChange={e => setPublicForm(prev => ({ ...prev, publicReviewTitle: e.target.value }))}
                          placeholder="Why this classic still hits"
                        />
                      </div>
                    </div>

                    <div className="detail-section-title mt-3">Review Editor</div>
                    <div className="detail-tabs">
                      <button
                        type="button"
                        className={`detail-tab ${publicReviewMode === 'markdown' ? 'active' : ''}`}
                        onClick={() => handleReviewModeChange('markdown')}
                      >
                        Markdown
                      </button>
                      <button
                        type="button"
                        className={`detail-tab ${publicReviewMode === 'wysiwyg' ? 'active' : ''}`}
                        onClick={() => handleReviewModeChange('wysiwyg')}
                      >
                        WYSIWYG
                      </button>
                    </div>

                    {publicReviewMode === 'markdown' ? (
                      <textarea
                        className="form-control"
                        rows="10"
                        value={publicForm.publicReview}
                        onChange={e => setPublicForm(prev => ({ ...prev, publicReview: e.target.value }))}
                        placeholder="Write the review that appears on the public page."
                      />
                    ) : (
                      <>
                        <div className="wysiwyg-toolbar">
                          <button type="button" onClick={() => applyEditorCommand('bold')}>Bold</button>
                          <button type="button" onClick={() => applyEditorCommand('italic')}>Italic</button>
                          <button type="button" onClick={() => applyEditorCommand('formatBlock', 'h2')}>H2</button>
                          <button type="button" onClick={() => applyEditorCommand('formatBlock', 'h3')}>H3</button>
                          <button type="button" onClick={() => applyEditorCommand('formatBlock', 'blockquote')}>Quote</button>
                          <button type="button" onClick={() => applyEditorCommand('insertUnorderedList')}>Bullets</button>
                          <button type="button" onClick={() => applyEditorCommand('insertOrderedList')}>Numbered</button>
                          <button type="button" onClick={insertLink}>Link</button>
                          <button type="button" onClick={() => setShowAchPicker(true)} style={{ background: 'var(--brand)', color: '#000', fontWeight: 'bold' }}>Import Achievement</button>
                          <button type="button" onClick={() => applyEditorCommand('removeFormat')}>Clear</button>
                        </div>
                        <div
                          ref={editorRef}
                          className="wysiwyg-editor"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={syncEditorToMarkdown}
                          onBlur={syncEditorToMarkdown}
                        />
                      </>
                    )}

                    <div className="d-flex justify-content-end mt-3">
                      <button className="btn btn-outline-primary" onClick={handlePublicSave}>
                        Save Public Info
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAchPicker && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setShowAchPicker(false)}>
          <div className="modal-dialog modal-dialog-centered modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content bg-panel border-secondary">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">Select Achievement to Import</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowAchPicker(false)}></button>
              </div>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="row g-3">
                  {(achState.currentGameAchievements || []).map(ach => (
                    <div key={ach.id} className="col-md-6">
                      <div 
                        className="d-flex align-items-center gap-3 p-3 rounded border border-secondary border-opacity-25 hover-bg-white-05 cursor-pointer"
                        onClick={() => {
                          const tag = `[[ach:${ach.id}]]`
                          if (publicReviewMode === 'markdown') {
                            setPublicForm(prev => ({ ...prev, publicReview: (prev.publicReview || '') + '\n' + tag + '\n' }))
                          } else {
                            applyEditorCommand('insertText', tag)
                          }
                          setShowAchPicker(false)
                        }}
                      >
                        <img src={ach.badge_url || `https://media.retroachievements.org/Badge/${ach.badgeName}.png`} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px' }} />
                        <div className="min-w-0">
                          <div className="fw-bold small truncate-1">{ach.title}</div>
                          <div className="text-muted small opacity-75">{ach.points} pts</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
