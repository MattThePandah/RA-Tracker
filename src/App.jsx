import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useGame } from './context/GameContext.jsx'
import AchievementNotificationManager from './components/AchievementNotificationManager.jsx'

export default function App() {
  const { state } = useGame()
  const location = useLocation()
  const active = (path) => location.pathname.startsWith(path) ? 'active' : ''

  return (
    <div className="container-fluid min-vh-100 d-flex flex-column">
      <header className="navbar navbar-expand-lg navbar-dark bg-black border-bottom border-secondary px-3">
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-2" to="/current">
          <i className="bi bi-controller"></i>
          <span className="brand">Game Library Manager</span>
        </Link>
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item">
            <Link className={`nav-link ${active('/current')}`} to="/current">
              <i className="bi bi-play-circle me-1"></i>Current
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('/library')}`} to="/library">
              <i className="bi bi-collection me-1"></i>Library
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('/achievements')}`} to="/achievements">
              <i className="bi bi-trophy me-1"></i>Achievements
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('/select')}`} to="/select">
              <i className="bi bi-dice-3 me-1"></i>Random Select
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('/import-export')}`} to="/import-export">
              <i className="bi bi-arrow-down-up me-1"></i>Import/Export
            </Link>
          </li>
          <li className="nav-item">
            <Link className={`nav-link ${active('/settings')}`} to="/settings">
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
        </div>
      </header>
      <main className="flex-grow-1">
        <Outlet />
      </main>
      <footer className="bg-black border-top border-secondary text-center p-2 small opacity-75">
        <i className="bi bi-controller me-2"></i>
        Game Library Manager • Multi-Platform Achievement Tracker
      </footer>
      <AchievementNotificationManager />
    </div>
  )
}






