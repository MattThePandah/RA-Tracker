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
        <Link className="navbar-brand fw-bold" to="/current">PSFest</Link>
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item"><Link className={`nav-link ${active('/current')}`} to="/current">Current</Link></li>
          <li className="nav-item"><Link className={`nav-link ${active('/library')}`} to="/library">Library</Link></li>
          <li className="nav-item"><Link className={`nav-link ${active('/achievements')}`} to="/achievements">Achievements</Link></li>
          <li className="nav-item"><Link className={`nav-link ${active('/select')}`} to="/select">Select</Link></li>
          <li className="nav-item"><Link className={`nav-link ${active('/import-export')}`} to="/import-export">Import/Export</Link></li>
          <li className="nav-item"><Link className={`nav-link ${active('/settings')}`} to="/settings">Settings</Link></li>
        </ul>
        <div className="d-flex align-items-center gap-3 small">
          <span>Games: <strong>{state.games.length}</strong></span>
          <span>Completed: <strong>{state.stats.completed}</strong></span>
          <span>Progress: <strong>{state.stats.percent}%</strong></span>
        </div>
      </header>
      <main className="flex-grow-1">
        <Outlet />
      </main>
      <footer className="bg-black border-top border-secondary text-center p-2 small opacity-75">
        PSFest • RetroAchievements Tracker
      </footer>
      <AchievementNotificationManager />
    </div>
  )
}
