import React from 'react'
import * as Storage from '../services/storage.js'
import { useAchievements } from '../context/AchievementContext.jsx'
import * as RA from '../services/retroachievements.js'
import { buildOverlayUrl } from '../utils/overlayApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import { useOverlaySettings } from '../hooks/useOverlaySettings.js'
import { useOverlayTheme } from '../hooks/useOverlayTheme.js'
import useOverlayEvent from '../hooks/useOverlayEvent.js'
import { getBoolParam, getNumberParam, getStringParam } from '../utils/overlaySettings.js'

function usePoll(ms) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

function useViewportSize() {
  const [size, setSize] = React.useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight
  }))
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return size
}

function orderModules(list) {
  return list.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
}

function safeText(value) {
  return value ? String(value) : ''
}

export default function OverlayFull() {
  const { settings } = useOverlaySettings()
  const params = new URLSearchParams(location.search)
  const globalConfig = settings.global || {}
  const fullConfig = settings.full || {}
  const moduleConfig = fullConfig.modules || {}
  const poll = getNumberParam(params, 'poll', globalConfig.pollMs ?? 5000, { min: 500, max: 60000 })
  const achievementPoll = getNumberParam(params, 'rapoll', globalConfig.achievementPollMs ?? 60000, { min: 5000, max: 300000 })
  const layoutMode = getStringParam(params, 'layout', fullConfig.layout || 'balanced')
  const isClean = getBoolParam(params, 'clean', globalConfig.clean ?? false)
  const showGuides = getBoolParam(params, 'guides', fullConfig.showGuides ?? true)
  const showGameFrame = getBoolParam(params, 'gameframe', fullConfig.showGameFrame ?? true)
  const showCameraFrame = getBoolParam(params, 'camframe', fullConfig.showCameraFrame ?? true)
  const achievementCycleMsRaw = getNumberParam(params, 'racycle', fullConfig.achievementCycleMs ?? 8000, { min: 0, max: 60000 })
  const achievementCycleMs = achievementCycleMsRaw <= 0 ? 0 : Math.max(2000, achievementCycleMsRaw)

  useOverlayTheme(globalConfig.theme || 'bamboo', isClean, globalConfig)

  const { width: viewportWidth, height: viewportHeight } = useViewportSize()
  const tick = usePoll(poll)
  const [current, setCurrent] = React.useState(null)
  const [stats, setStats] = React.useState({ total: 0, completed: 0, percent: 0 })
  const [timers, setTimers] = React.useState({ currentGameTime: '00:00:00', totalTime: '000:00:00' })
  const overlayEvent = useOverlayEvent(15000)
  const eventTitle = overlayEvent?.overlayTitle || overlayEvent?.name || ''
  const eventSubtitle = overlayEvent?.overlaySubtitle || overlayEvent?.console || ''

  const currentEnabled = moduleConfig.current?.enabled ?? false
  const statsEnabled = moduleConfig.stats?.enabled ?? false
  const timersEnabled = moduleConfig.timers?.enabled ?? false
  const achievementsEnabled = moduleConfig.achievements?.enabled ?? false
  const showEventTimer = timersEnabled && globalConfig.showTimer !== false

  const needsCurrent = currentEnabled || achievementsEnabled
  const needsStats = statsEnabled

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!needsCurrent) return
    const loadCurrent = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/current', base), { credentials: 'include' })
        if (res.ok) {
          const json = await res.json()
          setCurrent(json?.current || null)
          return
        }
      } catch {}
      try {
        const games = Storage.getGames()
        const curId = Storage.getCurrentGameId()
        const found = games.find(x => x.id === curId) || null
        setCurrent(found)
      } catch {
        setCurrent(null)
      }
    }
    loadCurrent()
  }, [tick, needsCurrent])

  React.useEffect(() => {
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    if (!needsStats) return
    const loadStats = async () => {
      try {
        const r = await fetch(buildOverlayUrl('/overlay/stats', base), { credentials: 'include' })
        if (r.ok) {
          const j = await r.json()
          const total = Number(j.total || 0)
          const completed = Number(j.completed || 0)
          const percent = typeof j.percent === 'number' ? j.percent : (total ? Math.round((completed / total) * 100) : 0)
          setStats({ total, completed, percent })
          return
        }
      } catch {}
      try {
        const games = Storage.getGames()
        const total = games.length
        const completed = games.filter(g => g.status === 'Completed').length
        const percent = total ? Math.round((completed / total) * 100) : 0
        setStats({ total, completed, percent })
      } catch {
        setStats({ total: 0, completed: 0, percent: 0 })
      }
    }
    loadStats()
  }, [tick, needsStats])

  React.useEffect(() => {
    if (!timersEnabled) return
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let id
    const fetchTimers = async () => {
      try {
        const res = await fetch(buildOverlayUrl('/overlay/timers', base), { credentials: 'include' })
        if (res.ok) {
          const t = await res.json()
          if (t?.currentGameTime && (t?.totalTime || t?.psfestTime)) {
            setTimers({ currentGameTime: t.currentGameTime, totalTime: t.totalTime || t.psfestTime })
          }
        }
      } catch {}
    }
    fetchTimers()
    id = setInterval(fetchTimers, 1000)
    return () => clearInterval(id)
  }, [timersEnabled])

  const { state, loadGameAchievements, clearCurrentGameData, isConfigured } = useAchievements()
  const [currentGameId, setCurrentGameId] = React.useState(null)

  React.useEffect(() => {
    if (!achievementsEnabled) return
    const newGameId = current?.id || null
    if (!newGameId) {
      clearCurrentGameData()
      setCurrentGameId(null)
      return
    }
    if (newGameId !== currentGameId) {
      clearCurrentGameData()
      setCurrentGameId(newGameId)
      if (isConfigured && RA.hasRetroAchievementsSupport(current)) {
        loadGameAchievements(newGameId, true)
      }
    }
  }, [achievementsEnabled, current?.id, currentGameId, isConfigured, loadGameAchievements, clearCurrentGameData])

  React.useEffect(() => {
    if (!achievementsEnabled || !currentGameId || !isConfigured) return
    if (!current || !RA.hasRetroAchievementsSupport(current)) return
    const id = setInterval(() => {
      if (!state.loading?.gameAchievements) {
        loadGameAchievements(currentGameId, true)
      }
    }, achievementPoll)
    return () => clearInterval(id)
  }, [achievementsEnabled, currentGameId, isConfigured, achievementPoll, loadGameAchievements, state.loading?.gameAchievements, current])

  const achievementsCount = Math.max(1, Number(moduleConfig.achievements?.count || 4))
  const earnedCount = state.currentGameAchievements.filter(a => a.isEarned).length
  const totalAchievements = state.currentGameAchievements.length
  const achievementPercent = totalAchievements ? Math.round((earnedCount / totalAchievements) * 100) : 0
  const upcomingAll = state.currentGameAchievements
    .filter(a => !a.isEarned)
    .sort((a, b) => b.points - a.points)
  const achievementPages = Math.max(1, Math.ceil(upcomingAll.length / achievementsCount))
  const [achievementPage, setAchievementPage] = React.useState(0)
  const [nowPlayingTone, setNowPlayingTone] = React.useState('dark')

  React.useEffect(() => {
    setAchievementPage(0)
  }, [upcomingAll.length, achievementsCount, currentGameId])

  React.useEffect(() => {
    if (!achievementsEnabled) return
    if (!achievementCycleMs) return
    if (upcomingAll.length <= achievementsCount) return
    const id = setInterval(() => {
      setAchievementPage(prev => (prev + 1) % achievementPages)
    }, achievementCycleMs)
    return () => clearInterval(id)
  }, [achievementsEnabled, achievementCycleMs, upcomingAll.length, achievementsCount, achievementPages])

  const achievementStart = achievementPage * achievementsCount
  const upcoming = upcomingAll.slice(achievementStart, achievementStart + achievementsCount)
  const achievementListStyle = { '--full-achievement-rows': achievementsCount }
  const eventModuleEnabled = statsEnabled || showEventTimer
  const eventModuleConfig = statsEnabled ? moduleConfig.stats : moduleConfig.timers
  const eventModuleId = statsEnabled ? 'stats' : 'timers'
  const eventModuleTitle = statsEnabled ? (settings.stats?.title || 'Event Progress') : 'Event Timer'
  const nowPlayingCover = current?.image_url && globalConfig.showCover !== false
    ? buildCoverUrl(current.image_url)
    : ''
  const showNowPlayingThumb = globalConfig.showCover !== false && !nowPlayingCover
  const nowPlayingToneClass = nowPlayingCover && nowPlayingTone === 'light' ? ' now-playing-light' : ''

  React.useEffect(() => {
    let cancelled = false
    if (!nowPlayingCover) {
      setNowPlayingTone('dark')
      return () => { cancelled = true }
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = nowPlayingCover
    img.onload = () => {
      try {
        const sampleSize = 24
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          if (!cancelled) setNowPlayingTone('dark')
          return
        }
        canvas.width = sampleSize
        canvas.height = sampleSize
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
        const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data
        let total = 0
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] / 255
          if (alpha === 0) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          total += luminance
          count += 1
        }
        const avg = count ? (total / count) : 1
        const tone = avg >= 0.58 ? 'dark' : 'light'
        if (!cancelled) setNowPlayingTone(tone)
      } catch {
        if (!cancelled) setNowPlayingTone('dark')
      }
    }
    img.onerror = () => {
      if (!cancelled) setNowPlayingTone('dark')
    }
    return () => { cancelled = true }
  }, [nowPlayingCover])

  const moduleDefs = [
    {
      id: 'current',
      order: moduleConfig.current?.order || 1,
      position: moduleConfig.current?.position || 'left',
      enabled: currentEnabled,
      content: (
        <div
          className={`overlay-card full-overlay-card${nowPlayingCover ? ` full-overlay-now-playing${nowPlayingToneClass}` : ''}`}
          style={nowPlayingCover ? { '--now-playing-cover': `url(${nowPlayingCover})` } : undefined}
        >
          <div className="full-card-title">Now Playing</div>
          {current ? (
            <div className="full-game-card">
              {showNowPlayingThumb && (
                current.image_url ? (
                  <img className="full-game-cover" src={buildCoverUrl(current.image_url)} alt="" />
                ) : (
                  <div className="full-game-cover placeholder"><i className="bi bi-controller"></i></div>
                )
              )}
              <div className="full-game-info">
                <div className="full-game-title">{safeText(current.title)}</div>
                <div className="full-game-meta">
                  {safeText(current.console)}
                  {globalConfig.showYear !== false && current.release_year ? ` • ${current.release_year}` : ''}
                  {globalConfig.showPublisher !== false && current.publisher ? ` • ${current.publisher}` : ''}
                </div>
                {current.status && <div className="full-game-status">{current.status}</div>}
                {showEventTimer && (
                  <div className="full-game-timer">
                    <span className="full-game-timer-label">Current</span>
                    <span className="full-game-timer-value">{timers.currentGameTime}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-secondary small">No current game selected.</div>
          )}
        </div>
      )
    },
    {
      id: eventModuleId,
      order: eventModuleConfig?.order || 1,
      position: eventModuleConfig?.position || 'left',
      enabled: eventModuleEnabled,
      content: (
        <div className="overlay-card full-overlay-card full-overlay-event">
          <div className="full-card-title">{eventModuleTitle}</div>
          {statsEnabled && (
            <>
              <div className="full-event-summary">
                <span className="full-event-summary-percent">{stats.percent}%</span>
                <span className="full-event-summary-label">Complete</span>
                <span className="full-event-summary-divider">-</span>
                <span className="full-event-summary-counts">{stats.completed.toLocaleString()}/{stats.total.toLocaleString()}</span>
              </div>
            </>
          )}
          {showEventTimer && eventTitle && (
            <div className="full-event-inline">
              <span className="full-event-title">{eventTitle}</span>
              {eventSubtitle && <span className="full-event-sub"> - {eventSubtitle}</span>}
            </div>
          )}
          {showEventTimer && (
            <div className="full-event-timer">
              <span className="full-event-timer-label">Event</span>
              <span className="full-event-timer-value">{timers.totalTime}</span>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'achievements',
      order: moduleConfig.achievements?.order || 1,
      position: moduleConfig.achievements?.position || 'right',
      enabled: achievementsEnabled && globalConfig.showAchievements !== false,
      content: (
        <div className="overlay-card full-overlay-card">
          <div className="full-card-title">Achievements</div>
          {!isConfigured && (
            <div className="text-secondary small">RetroAchievements not configured.</div>
          )}
          {isConfigured && (!current || !RA.hasRetroAchievementsSupport(current)) && (
            <div className="text-secondary small">Current game has no RetroAchievements.</div>
          )}
          {isConfigured && current && RA.hasRetroAchievementsSupport(current) && (
            <>
              <div className="full-achievement-progress">
                <div className="full-achievement-percent">{achievementPercent}%</div>
                <div className="full-achievement-count">{earnedCount}/{totalAchievements} earned</div>
              </div>
              <div className="progress-bar-bg full-stats-bar">
                <div className="progress-bar-fill" style={{ width: `${achievementPercent}%` }} />
              </div>
              {state.loading?.gameAchievements && (
                <div className="text-secondary small">Loading achievements...</div>
              )}
              {!state.loading?.gameAchievements && upcoming.length === 0 && (
                <div className="text-secondary small">All achievements earned.</div>
              )}
              {!state.loading?.gameAchievements && upcoming.length > 0 && (
                <div className="full-achievement-list" style={achievementListStyle} key={`ach-page-${achievementPage}`}>
                  {upcoming.map(achievement => (
                    <div className="full-achievement-item" key={achievement.id}>
                      <img
                        className="full-achievement-badge"
                        src={`https://media.retroachievements.org/Badge/${achievement.badgeName}.png`}
                        alt=""
                      />
                      <div className="full-achievement-info">
                        <div className="full-achievement-title">{achievement.title}</div>
                        <div className="full-achievement-desc">{achievement.description}</div>
                      </div>
                      <div className="full-achievement-points">{achievement.points}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )
    }
  ]

  const leftModules = orderModules(moduleDefs.filter(m => m.enabled && m.position === 'left'))
  const rightModules = orderModules(moduleDefs.filter(m => m.enabled && m.position === 'right'))
  const bottomModules = orderModules(moduleDefs.filter(m => m.enabled && m.position === 'bottom'))

  const bottomHeight = bottomModules.length ? Math.max(80, Number(fullConfig.bottomHeight || 140)) : 0
  const scaleValue = (value, factor, min) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return min
    return Math.max(min, Math.round(num * factor))
  }
  const isFocus = layoutMode === 'focus'
  const leftWidthBase = isFocus ? scaleValue(fullConfig.leftWidth ?? 360, 0.78, 240) : (fullConfig.leftWidth ?? 360)
  const rightWidthBase = isFocus ? scaleValue(fullConfig.rightWidth ?? 360, 0.78, 240) : (fullConfig.rightWidth ?? 360)
  const padding = isFocus ? scaleValue(fullConfig.padding ?? 32, 0.8, 16) : (fullConfig.padding ?? 32)
  const columnGap = isFocus ? scaleValue(fullConfig.columnGap ?? 24, 0.75, 12) : (fullConfig.columnGap ?? 24)
  const moduleGap = isFocus ? scaleValue(fullConfig.moduleGap ?? 16, 0.75, 10) : (fullConfig.moduleGap ?? 16)
  const gameInsetX = Number(fullConfig.gameInsetX ?? 28)
  const gameInsetY = Number(fullConfig.gameInsetY ?? 20)
  const cameraDock = fullConfig.cameraDock ?? false
  const cameraWidth = Number(fullConfig.cameraWidth ?? 360)
  const cameraHeight = Number(fullConfig.cameraHeight ?? 200)
  const cameraOffsetX = Number(fullConfig.cameraOffsetX ?? 32)
  const cameraOffsetY = Number(fullConfig.cameraOffsetY ?? 32)
  const cameraPosition = String(fullConfig.cameraPosition || 'bottom-right')
  const cameraEnabled = showCameraFrame
  const stageInsetBoost = 10
  const gameInsetXValue = Number.isFinite(gameInsetX) ? Math.max(0, gameInsetX - stageInsetBoost) : 0
  const gameInsetYValue = Number.isFinite(gameInsetY) ? Math.max(0, gameInsetY - stageInsetBoost) : 0
  const cameraWidthValue = Number.isFinite(cameraWidth) ? cameraWidth : 360
  const cameraHeightValue = Number.isFinite(cameraHeight) ? cameraHeight : 200
  const cameraOffsetXValue = Number.isFinite(cameraOffsetX) ? cameraOffsetX : 32
  const cameraOffsetYValue = Number.isFinite(cameraOffsetY) ? cameraOffsetY : 32
  const dockCamera = cameraDock && cameraEnabled
  const dockCameraLeft = dockCamera && cameraPosition.includes('left')
  const dockCameraRight = dockCamera && cameraPosition.includes('right')
  const dockCameraTop = dockCamera && cameraPosition.includes('top')
  const dockCameraBottom = dockCamera && cameraPosition.includes('bottom')
  const dockOffsetX = dockCamera ? Math.max(0, cameraOffsetXValue - padding) : 0
  const dockOffsetYTop = dockCamera ? Math.max(0, cameraOffsetYValue - padding) : 0
  const dockOffsetYBottom = dockCamera ? Math.max(0, cameraOffsetYValue - padding - bottomHeight) : 0
  const cameraDockRequiredWidth = dockCamera ? cameraWidthValue + dockOffsetX : 0
  const leftWidth = dockCameraLeft ? Math.max(leftWidthBase, cameraDockRequiredWidth) : leftWidthBase
  const rightWidth = dockCameraRight ? Math.max(rightWidthBase, cameraDockRequiredWidth) : rightWidthBase
  const hasLeftColumn = leftModules.length > 0 || dockCameraLeft
  const hasRightColumn = rightModules.length > 0 || dockCameraRight
  const columnCount = (hasLeftColumn ? 1 : 0) + 1 + (hasRightColumn ? 1 : 0)
  const gapCount = Math.max(0, columnCount - 1)
  const gridWidth = Math.max(0, viewportWidth - padding * 2)
  const gridHeight = Math.max(0, viewportHeight - bottomHeight - padding * 2)
  const stageWidth = Math.max(0, gridWidth - (hasLeftColumn ? leftWidth : 0) - (hasRightColumn ? rightWidth : 0) - columnGap * gapCount)
  const stageHeight = Math.max(0, gridHeight)
  const availableStageWidth = stageWidth > 0 ? Math.max(0, stageWidth - cameraOffsetXValue) : cameraWidthValue
  const availableStageHeight = stageHeight > 0 ? Math.max(0, stageHeight - cameraOffsetYValue) : cameraHeightValue
  const cameraWidthFinal = dockCamera ? cameraWidthValue : Math.min(cameraWidthValue, availableStageWidth)
  const cameraHeightFinal = dockCamera ? cameraHeightValue : Math.min(cameraHeightValue, availableStageHeight)
  let gameInsetLeft = gameInsetXValue
  let gameInsetRight = gameInsetXValue
  let gameInsetTop = gameInsetYValue
  let gameInsetBottom = gameInsetYValue
  if (cameraEnabled && !dockCamera) {
    const reserveX = cameraWidthFinal + cameraOffsetXValue + gameInsetXValue
    const reserveY = cameraHeightFinal + cameraOffsetYValue + gameInsetYValue
    if (cameraPosition.includes('left')) gameInsetLeft = Math.max(gameInsetLeft, reserveX)
    if (cameraPosition.includes('right')) gameInsetRight = Math.max(gameInsetRight, reserveX)
    if (cameraPosition.includes('top')) gameInsetTop = Math.max(gameInsetTop, reserveY)
    if (cameraPosition.includes('bottom')) gameInsetBottom = Math.max(gameInsetBottom, reserveY)
  }
  const gridColumns = hasLeftColumn && hasRightColumn
    ? 'minmax(0, var(--full-left-width)) minmax(0, 1fr) minmax(0, var(--full-right-width))'
    : hasLeftColumn
      ? 'minmax(0, var(--full-left-width)) minmax(0, 1fr)'
      : hasRightColumn
        ? 'minmax(0, 1fr) minmax(0, var(--full-right-width))'
        : 'minmax(0, 1fr)'
  const layoutStyle = {
    '--full-left-width': `${leftWidth}px`,
    '--full-right-width': `${rightWidth}px`,
    '--full-padding': `${padding}px`,
    '--full-grid-columns': gridColumns,
    '--full-column-gap': `${(hasLeftColumn || hasRightColumn) ? columnGap : 0}px`,
    '--full-module-gap': `${moduleGap}px`,
    '--full-bottom-height': `${bottomHeight}px`,
    '--full-game-inset-x': `${gameInsetXValue}px`,
    '--full-game-inset-y': `${gameInsetYValue}px`,
    '--full-game-inset-left': `${gameInsetLeft}px`,
    '--full-game-inset-right': `${gameInsetRight}px`,
    '--full-game-inset-top': `${gameInsetTop}px`,
    '--full-game-inset-bottom': `${gameInsetBottom}px`,
    '--full-camera-width': `${cameraWidthFinal}px`,
    '--full-camera-height': `${cameraHeightFinal}px`,
    '--full-camera-offset-x': `${cameraOffsetXValue}px`,
    '--full-camera-offset-y': `${cameraOffsetYValue}px`
  }

  const cameraStyle = {
    width: 'var(--full-camera-width)',
    height: 'var(--full-camera-height)',
    maxWidth: 'calc(100% - var(--full-camera-offset-x))',
    maxHeight: 'calc(100% - var(--full-camera-offset-y))'
  }
  const cameraGuideVisible = showGuides && showCameraFrame
  const renderDockedCamera = (side, isTop) => {
    const cameraSlotStyle = {
      justifyContent: side === 'right' ? 'flex-end' : 'flex-start'
    }
    const cameraFrameStyle = {
      width: 'var(--full-camera-width)',
      height: 'var(--full-camera-height)',
      maxWidth: '100%',
      maxHeight: '100%',
      marginLeft: side === 'left' ? `${dockOffsetX}px` : undefined,
      marginRight: side === 'right' ? `${dockOffsetX}px` : undefined,
      marginTop: isTop ? `${dockOffsetYTop}px` : undefined,
      marginBottom: !isTop ? `${dockOffsetYBottom}px` : undefined
    }
    return (
      <div className="full-overlay-column-slot" style={cameraSlotStyle}>
        <div className={`full-overlay-camera-docked${cameraGuideVisible ? ' full-overlay-camera-guide' : ''}`} style={cameraFrameStyle}>
          {cameraGuideVisible && <div className="full-overlay-frame-label">Camera</div>}
        </div>
      </div>
    )
  }
  const renderModules = (modules) => (
    modules.map(module => (
      <div key={module.id} className="full-overlay-module">{module.content}</div>
    ))
  )
  const offsetX = 'var(--full-camera-offset-x)'
  const offsetY = 'var(--full-camera-offset-y)'
  switch (cameraPosition) {
    case 'top-left':
      cameraStyle.top = offsetY
      cameraStyle.left = offsetX
      break
    case 'top-right':
      cameraStyle.top = offsetY
      cameraStyle.right = offsetX
      break
    case 'bottom-left':
      cameraStyle.bottom = offsetY
      cameraStyle.left = offsetX
      break
    default:
      cameraStyle.bottom = offsetY
      cameraStyle.right = offsetX
      break
  }


  return (
    <div className={`overlay-chrome full-overlay-shell full-layout-${layoutMode} ${showGuides ? 'full-overlay-guides' : ''} ${isClean ? 'overlay-clean' : ''}`} style={layoutStyle}>
      <div className="full-overlay-grid">
        {hasLeftColumn && (
          dockCameraLeft ? (
            <div className="full-overlay-column full-overlay-column-docked">
              {dockCameraTop && renderDockedCamera('left', true)}
              <div className="full-overlay-column-stack">
                {renderModules(leftModules)}
              </div>
              {dockCameraBottom && renderDockedCamera('left', false)}
            </div>
          ) : (
            <div className="full-overlay-column">
              {renderModules(leftModules)}
            </div>
          )
        )}
        <div className="full-overlay-stage">
          {showGuides && showGameFrame && (
            <div className="full-overlay-frame full-overlay-game">
              <div className="full-overlay-frame-label">Game Capture</div>
            </div>
          )}
          {showGuides && showCameraFrame && !cameraDock && (
            <div className="full-overlay-frame full-overlay-camera" style={cameraStyle}>
              <div className="full-overlay-frame-label">Camera</div>
            </div>
          )}
        </div>
        {hasRightColumn && (
          dockCameraRight ? (
            <div className="full-overlay-column full-overlay-column-docked">
              {dockCameraTop && renderDockedCamera('right', true)}
              <div className="full-overlay-column-stack">
                {renderModules(rightModules)}
              </div>
              {dockCameraBottom && renderDockedCamera('right', false)}
            </div>
          ) : (
            <div className="full-overlay-column">
              {renderModules(rightModules)}
            </div>
          )
        )}
      </div>

      {bottomModules.length > 0 && (
        <div className="full-overlay-bottom">
          {bottomModules.map(module => (
            <div key={module.id} className="full-overlay-module">{module.content}</div>
          ))}
        </div>
      )}
    </div>
  )
}
