import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useGame } from './context/GameContext.jsx'
import AchievementNotificationManager from './components/AchievementNotificationManager.jsx'
import TimerDock from './components/TimerDock.jsx'
import { useAdmin } from './context/AdminContext.jsx'
import { fetchPublicSite } from './services/publicApi.js'
import useSiteTheme from './hooks/useSiteTheme.js'
import { isLight } from './utils/siteTheme.js'

export default function App() {
  const { state } = useGame()
  const { user, logout } = useAdmin()
  const location = useLocation()
  const base = '/admin'
  const active = (path) => location.pathname.startsWith(`${base}/${path}`) ? 'active' : ''
  const [siteTheme, setSiteTheme] = React.useState(null)

  React.useEffect(() => {
    let activeRequest = true
    const loadTheme = async () => {
      try {
        const data = await fetchPublicSite()
        if (activeRequest) setSiteTheme(data.site?.theme || null)
      } catch { }
    }
    loadTheme()
    return () => { activeRequest = false }
  }, [])

  useSiteTheme(siteTheme)

  const isThemeLight = isLight(siteTheme?.admin?.bg || '#080a09')

  return (
    <div className={`admin-layout ${isThemeLight ? 'light-mode' : ''}`}>
      <aside className="admin-sidebar shadow">
        <div className="sidebar-brand">
          <i className="bi bi-controller"></i>
          <span>RA Studio</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-label">General</div>
            <Link className={`nav-link ${active('dashboard')}`} to={`${base}/dashboard`}>
              <i className="bi bi-grid-1x2-fill"></i> Command Center
            </Link>
            <Link className={`nav-link ${active('pulse')}`} to={`${base}/pulse`}>
              <i className="bi bi-activity"></i> Pulse
            </Link>
          </div>

          <div className="nav-group">
            <div className="nav-label">Management</div>
            <Link className={`nav-link ${active('current')}`} to={`${base}/current`}>
              <i className="bi bi-play-circle-fill"></i> Active Game
            </Link>
            <Link className={`nav-link ${active('library')}`} to={`${base}/library`}>
              <i className="bi bi-collection-fill"></i> Library
            </Link>
            <Link className={`nav-link ${active('select')}`} to={`${base}/select`}>
              <i className="bi bi-controller"></i> Game Selector
            </Link>
            <Link className={`nav-link ${active('achievements')}`} to={`${base}/achievements`}>
              <i className="bi bi-trophy-fill"></i> Achievements
            </Link>
            <Link className={`nav-link ${active('studio')}`} to={`${base}/studio`}>
              <i className="bi bi-film"></i> Video Studio
            </Link>
          </div>

          <div className="nav-group">
            <div className="nav-label">Broadcast</div>
            <Link className={`nav-link ${active('overlays')}`} to={`${base}/overlays`}>
              <i className="bi bi-broadcast-pin"></i> Overlays
            </Link>
            <Link className={`nav-link ${active('events')}`} to={`${base}/events`}>
              <i className="bi bi-calendar-event"></i> Event Profiles
            </Link>
          </div>

          <div className="nav-group">
            <div className="nav-label">Community</div>
            <Link className={`nav-link ${active('suggestions')}`} to={`${base}/suggestions`}>
              <i className="bi bi-chat-left-dots"></i> Suggestions
            </Link>
            <Link className={`nav-link ${active('public-site')}`} to={`${base}/public-site`}>
              <i className="bi bi-globe"></i> Public Portal
            </Link>
          </div>
        </nav>

        <div className="sidebar-footer">
          <Link className="nav-link" to={`${base}/settings`}>
            <i className="bi bi-gear-fill"></i> Settings
          </Link>
          <div className="d-grid mt-2">
            <Link className="btn btn-sm btn-outline-secondary" to="/">View Public Site</Link>
            {user && (
              <button className="btn btn-sm btn-outline-danger mt-2" onClick={logout}>
                Log out
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar d-flex align-items-center px-4 justify-content-between">
          <div className="d-flex gap-4 align-items-center">
            <h1 className="h6 mb-0 text-secondary fw-normal">RA Creator Studio</h1>
            <div className="d-flex align-items-center gap-3 small border-start ps-4 opacity-75">
              <span className="stat-pill"><i className="bi bi-collection me-1"></i> {state.games.length} Games</span>
              <span className="stat-pill"><i className="bi bi-check-circle me-1"></i> {state.stats.completed} Done</span>
              <span className="stat-pill"><i className="bi bi-graph-up me-1"></i> {state.stats.percent}%</span>
            </div>
          </div>
          <div className="d-flex align-items-center gap-3">
            <TimerDock />
          </div>
        </header>

        <div className="admin-content p-4">
          <Outlet />
        </div>
      </div>

      <AchievementNotificationManager />
    </div>
  )
}