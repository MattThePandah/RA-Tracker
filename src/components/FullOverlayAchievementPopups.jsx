import React from 'react'
import { useAchievements } from '../context/AchievementContext.jsx'

const buildPopupId = (achievement) => (
  `${achievement.achievementId}-${achievement.date}`
)

const getAchievementTime = (achievement) => {
  const time = new Date(achievement.date).getTime()
  return Number.isFinite(time) ? time : 0
}

export default function FullOverlayAchievementPopups({
  enabled = true,
  forceEnable = false,
  duration = 5000,
  onActiveChange
}) {
  const { state } = useAchievements()
  const [queue, setQueue] = React.useState([])
  const [activePopup, setActivePopup] = React.useState(null)
  const lastSeenRef = React.useRef(0)
  const seenRef = React.useRef(new Set())
  const timeoutsRef = React.useRef([])

  const allowPopups = (forceEnable || enabled) && (forceEnable || state.settings.enablePopups !== false)

  React.useEffect(() => {
    if (typeof onActiveChange === 'function') {
      onActiveChange(Boolean(activePopup))
    }
  }, [activePopup, onActiveChange])

  React.useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId))
      timeoutsRef.current = []
    }
  }, [])

  React.useEffect(() => {
    if (!allowPopups) {
      setQueue([])
      setActivePopup(null)
      seenRef.current = new Set()
      return
    }

    if (!state.recentAchievements.length) {
      return
    }

    const newAchievements = state.recentAchievements.filter(achievement => (
      getAchievementTime(achievement) > lastSeenRef.current
    ))

    if (!newAchievements.length) {
      return
    }

    const newestTimestamp = Math.max(
      lastSeenRef.current,
      ...newAchievements.map(getAchievementTime)
    )
    lastSeenRef.current = newestTimestamp

    const freshItems = []
    newAchievements.forEach(achievement => {
      const popupId = buildPopupId(achievement)
      if (seenRef.current.has(popupId)) return
      seenRef.current.add(popupId)
      freshItems.push({ id: popupId, achievement })
    })

    if (freshItems.length) {
      setQueue(current => [...current, ...freshItems])
    }
  }, [allowPopups, duration, state.recentAchievements])

  React.useEffect(() => {
    if (!allowPopups || activePopup || queue.length === 0) return
    const next = queue[0]
    setQueue(current => current.slice(1))
    setActivePopup({ ...next, phase: 'entering' })

    const enterTimer = setTimeout(() => {
      setActivePopup(current => current ? { ...current, phase: 'displaying' } : null)
    }, 300)

    const leaveTimer = setTimeout(() => {
      setActivePopup(current => current ? { ...current, phase: 'leaving' } : null)
    }, Math.max(0, duration - 350))

    const removeTimer = setTimeout(() => {
      setActivePopup(null)
    }, duration)

    timeoutsRef.current.push(enterTimer, leaveTimer, removeTimer)
  }, [allowPopups, activePopup, duration, queue])

  if (!allowPopups || !activePopup) {
    return null
  }

  const badgeUrl = `https://media.retroachievements.org/Badge/${activePopup.achievement.badgeName}.png`

  return (
    <div className="full-achievement-popups">
      <div className={`full-achievement-popup ${activePopup.phase}`}>
        <div className="full-achievement-badge">
          <img src={badgeUrl} alt="" />
        </div>
        <div className="full-achievement-body">
          <div className="full-achievement-label">
            Achievement Unlocked
            {activePopup.achievement.hardcoreMode ? (
              <span className="full-achievement-hardcore">Hardcore</span>
            ) : null}
          </div>
          <div className="full-achievement-title">{activePopup.achievement.title}</div>
          <div className="full-achievement-desc">{activePopup.achievement.description}</div>
          {(activePopup.achievement.gameTitle || activePopup.achievement.consoleName) && (
            <div className="full-achievement-game">
              {activePopup.achievement.gameTitle || 'Game'}
              {activePopup.achievement.consoleName ? ` - ${activePopup.achievement.consoleName}` : ''}
            </div>
          )}
        </div>
        <div className="full-achievement-points">
          <div className="full-achievement-points-value">{activePopup.achievement.points || 0}</div>
          <div className="full-achievement-points-label">pts</div>
        </div>
      </div>
    </div>
  )
}
