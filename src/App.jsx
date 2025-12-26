import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useGame } from './context/GameContext.jsx'
import AchievementNotificationManager from './components/AchievementNotificationManager.jsx'
import { useAdmin } from './context/AdminContext.jsx'
import { fetchPublicSite } from './services/publicApi.js'
import useSiteTheme from './hooks/useSiteTheme.js'

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
      } catch {}
    }
    loadTheme()
    return () => { activeRequest = false }
  }, [])

  useSiteTheme(siteTheme)

  return (
    <div className="container-fluid min-vh-100 d-flex flex-column admin-shell">
      <header className="navbar navbar-expand-lg navbar-dark bg-black border-bottom border-secondary px-3">
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-2" to={`${base}/dashboard`}>
          <i className="bi bi-controller"></i>
          <span className="brand">RA Creator Studio</span>
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
            <Link className={`nav-link ${active('suggestions')}`} to={`${base}/suggestions`}>
              <i className="bi bi-chat-left-dots me-1"></i>Suggestions
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('public-site')}`} to={`${base}/public-site`}>
              <i className="bi bi-layout-text-window-reverse me-1"></i>Public Site
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
          <li className="nav-item">
            <Link className={`nav-link ${active('select')}`} to={`${base}/select`}>
              <i className="bi bi-dice-3 me-1"></i>Random Select
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('import-export')}`} to={`${base}/import-export`}>
              <i className="bi bi-arrow-down-up me-1"></i>Import/Export
            </Link>
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
      <footer className="bg-black border-top border-secondary text-center p-2 small opacity-75">
        <i className="bi bi-controller me-2"></i>
        RA Creator Studio - RetroAchievements tracking and video planning
      </footer>
      <AchievementNotificationManager />
    </div>
  )
}







