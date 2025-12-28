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

function useClock() {
  const [now, setNow] = React.useState(new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
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

  const tick = usePoll(poll)
  const clock = useClock()
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

  const moduleDefs = [
    {
      id: 'current',
      order: moduleConfig.current?.order || 1,
      position: moduleConfig.current?.position || 'left',
      enabled: currentEnabled,
      content: (
        <div className="overlay-card full-overlay-card">
          <div className="full-card-title">Now Playing</div>
          {current ? (
            <div className="full-game-card">
              {globalConfig.showCover !== false && (
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
              </div>
            </div>
          ) : (
            <div className="text-secondary small">No current game selected.</div>
          )}
        </div>
      )
    },
    {
      id: 'stats',
      order: moduleConfig.stats?.order || 1,
      position: moduleConfig.stats?.position || 'left',
      enabled: statsEnabled,
      content: (
        <div className="overlay-card full-overlay-card">
          <div className="full-card-title">{settings.stats?.title || 'Event Progress'}</div>
          <div className="full-stats-row">
            <div className="full-stats-percent">{stats.percent}%</div>
            <div className="full-stats-label">complete</div>
          </div>
          <div className="progress-bar-bg full-stats-bar">
            <div className="progress-bar-fill" style={{ width: `${stats.percent}%` }} />
          </div>
          <div className="full-stats-counts">{stats.completed.toLocaleString()}/{stats.total.toLocaleString()}</div>
        </div>
      )
    },
    {
      id: 'timers',
      order: moduleConfig.timers?.order || 1,
      position: moduleConfig.timers?.position || 'right',
      enabled: timersEnabled && globalConfig.showTimer !== false,
      content: (
        <div className="overlay-card full-overlay-card">
          <div className="full-card-title">Timers</div>
          {eventTitle && (
            <div className="full-event-pill">
              <span className="full-event-title">{eventTitle}</span>
              {eventSubtitle && <span className="full-event-sub"> - {eventSubtitle}</span>}
            </div>
          )}
          <div className="full-timer-row">
            <span className="full-timer-label">Current</span>
            <span className="full-timer-value">{timers.currentGameTime}</span>
          </div>
          <div className="full-timer-row">
            <span className="full-timer-label">Event</span>
            <span className="full-timer-value">{timers.totalTime}</span>
          </div>
          <div className="full-timer-updated">Updated {clock.toLocaleTimeString()}</div>
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
  const leftWidth = isFocus ? scaleValue(fullConfig.leftWidth ?? 360, 0.78, 240) : (fullConfig.leftWidth ?? 360)
  const rightWidth = isFocus ? scaleValue(fullConfig.rightWidth ?? 360, 0.78, 240) : (fullConfig.rightWidth ?? 360)
  const padding = isFocus ? scaleValue(fullConfig.padding ?? 32, 0.8, 16) : (fullConfig.padding ?? 32)
  const columnGap = isFocus ? scaleValue(fullConfig.columnGap ?? 24, 0.75, 12) : (fullConfig.columnGap ?? 24)
  const moduleGap = isFocus ? scaleValue(fullConfig.moduleGap ?? 16, 0.75, 10) : (fullConfig.moduleGap ?? 16)
  const gameInsetX = Number(fullConfig.gameInsetX ?? 28)
  const gameInsetY = Number(fullConfig.gameInsetY ?? 20)
  let gameInsetLeft = gameInsetX
  let gameInsetRight = gameInsetX
  let gameInsetTop = gameInsetY
  let gameInsetBottom = gameInsetY
  const cameraDock = fullConfig.cameraDock ?? false
  const cameraWidth = Number(fullConfig.cameraWidth ?? 360)
  const cameraHeight = Number(fullConfig.cameraHeight ?? 200)
  const cameraOffsetX = Number(fullConfig.cameraOffsetX ?? 32)
  const cameraOffsetY = Number(fullConfig.cameraOffsetY ?? 32)
  const cameraPosition = String(fullConfig.cameraPosition || 'bottom-right')
  const columnGapPad = Math.max(8, Math.round(padding * 0.5))
  const reserveTop = Math.max(0, cameraHeight + cameraOffsetY - padding + columnGapPad)
  const reserveBottom = Math.max(0, cameraHeight + cameraOffsetY - padding + columnGapPad)
  const leftColumnStyle = {}
  const rightColumnStyle = {}
  if (cameraDock && showCameraFrame) {
    if (cameraPosition.includes('left') && cameraPosition.includes('top')) {
      leftColumnStyle.paddingTop = `${reserveTop}px`
    } else if (cameraPosition.includes('left') && cameraPosition.includes('bottom')) {
      leftColumnStyle.paddingBottom = `${reserveBottom}px`
    } else if (cameraPosition.includes('right') && cameraPosition.includes('top')) {
      rightColumnStyle.paddingTop = `${reserveTop}px`
    } else if (cameraPosition.includes('right') && cameraPosition.includes('bottom')) {
      rightColumnStyle.paddingBottom = `${reserveBottom}px`
    }
  }
  const hasLeftColumn = leftModules.length > 0
  const hasRightColumn = rightModules.length > 0
  const gridColumns = hasLeftColumn && hasRightColumn
    ? 'var(--full-left-width) minmax(0, 1fr) var(--full-right-width)'
    : hasLeftColumn
      ? 'var(--full-left-width) minmax(0, 1fr)'
      : hasRightColumn
        ? 'minmax(0, 1fr) var(--full-right-width)'
        : 'minmax(0, 1fr)'
  const layoutStyle = {
    '--full-left-width': `${leftWidth}px`,
    '--full-right-width': `${rightWidth}px`,
    '--full-padding': `${padding}px`,
    '--full-grid-columns': gridColumns,
    '--full-column-gap': `${(hasLeftColumn || hasRightColumn) ? columnGap : 0}px`,
    '--full-module-gap': `${moduleGap}px`,
    '--full-bottom-height': `${bottomHeight}px`,
    '--full-game-inset-x': `${gameInsetX}px`,
    '--full-game-inset-y': `${gameInsetY}px`,
    '--full-game-inset-left': `${gameInsetLeft}px`,
    '--full-game-inset-right': `${gameInsetRight}px`,
    '--full-game-inset-top': `${gameInsetTop}px`,
    '--full-game-inset-bottom': `${gameInsetBottom}px`,
    '--full-camera-width': `${fullConfig.cameraWidth ?? 360}px`,
    '--full-camera-height': `${fullConfig.cameraHeight ?? 200}px`,
    '--full-camera-offset-x': `${fullConfig.cameraOffsetX ?? 32}px`,
    '--full-camera-offset-y': `${fullConfig.cameraOffsetY ?? 32}px`
  }

  const cameraStyle = {
    width: 'var(--full-camera-width)',
    height: 'var(--full-camera-height)'
  }
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
      {showGuides && showCameraFrame && cameraDock && (
        <div className="full-overlay-frame full-overlay-camera full-overlay-camera-outside" style={cameraStyle}>
          <div className="full-overlay-frame-label">Camera</div>
        </div>
      )}
      <div className="full-overlay-grid">
        {hasLeftColumn && (
          <div className="full-overlay-column" style={leftColumnStyle}>
            {leftModules.map(module => (
              <div key={module.id} className="full-overlay-module">{module.content}</div>
            ))}
          </div>
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
          <div className="full-overlay-column" style={rightColumnStyle}>
            {rightModules.map(module => (
              <div key={module.id} className="full-overlay-module">{module.content}</div>
            ))}
          </div>
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
