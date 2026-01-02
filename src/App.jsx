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
  const moreActive = [
    'events',
    'suggestions',
    'public-site',
    'select',
    'import-export'
  ].some(path => location.pathname.startsWith(`${base}/${path}`))

  React.useEffect(() => {
    let activeRequest = true
    const loadTheme = async () => {
      try {
        const data = await fetchPublicSite()
        if (activeRequest) setSiteTheme(data.site?.theme || null)
      } catch {}
    }
    loadTheme()
    return () => { activeRequest = false }
  }, [])

  useSiteTheme(siteTheme)

  const isThemeLight = isLight(siteTheme?.admin?.bg || '#080a09')
  const navThemeClass = isLight(siteTheme?.admin?.panel || '#141816') ? 'navbar-light' : 'navbar-dark'

  return (
    <div className={`container-fluid min-vh-100 d-flex flex-column admin-shell ${isThemeLight ? 'light-mode' : ''}`}>
      <header className={`navbar navbar-expand-lg ${navThemeClass} px-3 shadow-sm`} style={{ background: 'var(--admin-panel)', borderBottom: '1px solid var(--admin-border)', backdropFilter: 'blur(10px)' }}>
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-2" to={`${base}/dashboard`}>
          <i className="bi bi-controller"></i>
          <span className="brand" style={{ color: 'var(--brand)' }}>RA Creator Studio</span>
        </Link>
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item">
            <Link className={`nav-link ${active('dashboard')}`} to={`${base}/dashboard`}>
              <i className="bi bi-speedometer2 me-1"></i>Dashboard
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('pulse')}`} to={`${base}/pulse`}>
              <i className="bi bi-activity me-1"></i>Activity Pulse
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('current')}`} to={`${base}/current`}>
              <i className="bi bi-play-circle me-1"></i>Current
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('studio')}`} to={`${base}/studio`}>
              <i className="bi bi-film me-1"></i>Studio
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('overlays')}`} to={`${base}/overlays`}>
              <i className="bi bi-broadcast me-1"></i>Overlays
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('library')}`} to={`${base}/library`}>
              <i className="bi bi-collection me-1"></i>Library
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('achievements')}`} to={`${base}/achievements`}>
              <i className="bi bi-trophy me-1"></i>Achievements
            </Link>
          </li>
          <li className="nav-item nav-more">
            <details>
              <summary className={`nav-link ${moreActive ? 'active' : ''}`}>
                <i className="bi bi-three-dots me-1"></i>More
              </summary>
              <div className="nav-more-menu">
                <Link className={`dropdown-item ${active('events')}`} to={`${base}/events`}>
                  <i className="bi bi-calendar-event me-2"></i>Events
                </Link>
                <Link className={`dropdown-item ${active('suggestions')}`} to={`${base}/suggestions`}>
                  <i className="bi bi-chat-left-dots me-2"></i>Suggestions
                </Link>
                <Link className={`dropdown-item ${active('public-site')}`} to={`${base}/public-site`}>
                  <i className="bi bi-layout-text-window-reverse me-2"></i>Public Site
                </Link>
                <Link className={`dropdown-item ${active('select')}`} to={`${base}/select`}>
                  <i className="bi bi-dice-3 me-2"></i>Random Select
                </Link>
                <Link className={`dropdown-item ${active('import-export')}`} to={`${base}/import-export`}>
                  <i className="bi bi-arrow-down-up me-2"></i>Import/Export
                </Link>
              </div>
            </details>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('settings')}`} to={`${base}/settings`}>
              <i className="bi bi-gear me-1"></i>Settings
            </Link>
          </li>
        </ul>
        <div className="d-flex align-items-center gap-3 small">
          <span className="stat-chip">
            <i className="bi bi-collection-fill me-1"></i>
            <strong>{state.games.length}</strong> Games
          </span>
          <span className="stat-chip">
            <i className="bi bi-check-circle-fill me-1"></i>
            <strong>{state.stats.completed}</strong> Complete
          </span>
          <span className="stat-chip">
            <i className="bi bi-graph-up me-1"></i>
            <strong>{state.stats.percent}%</strong> Progress
          </span>
          <TimerDock />
          <Link className="btn btn-sm btn-outline-secondary" to="/">Public</Link>
          {user && (
            <button className="btn btn-sm btn-outline-light" onClick={logout}>
              Log out
            </button>
          )}
        </div>
      </header>
      <main className="flex-grow-1">
        <Outlet />
      </main>
      <footer className={`text-center p-2 small opacity-75 mt-auto ${isLight(siteTheme?.admin?.panel2 || '#0c0e0d') ? 'text-dark' : 'text-light'}`} style={{ background: 'var(--admin-panel-2)', borderTop: '1px solid var(--admin-border)' }}>
        <i className="bi bi-controller me-2"></i>
        RA Creator Studio - RetroAchievements tracking and video planning
      </footer>
      <AchievementNotificationManager />
    </div>
  )
}







