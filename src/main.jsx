import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import App from './App.jsx'
import Library from './routes/Library.jsx'
import Select from './routes/Select.jsx'
import OverlayMain from './routes/OverlayMain.jsx'
import OverlayStats from './routes/OverlayStats.jsx'
import OverlayWheel from './routes/OverlayWheel.jsx'
import OverlayAchievements from './routes/OverlayAchievements.jsx'
import OverlayFooter from './routes/OverlayFooter.jsx'
import Settings from './routes/Settings.jsx'
import ImportExport from './routes/ImportExport.jsx'
import Current from './routes/Current.jsx'
import Achievements from './routes/Achievements.jsx'
import { GameProvider } from './context/GameContext.jsx'
import { AchievementProvider } from './context/AchievementContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Main App wrapped with providers */}
        <Route
          path='/'
          element={
            <GameProvider>
              <AchievementProvider>
                <App />
              </AchievementProvider>
            </GameProvider>
          }
        >
          <Route index element={<Navigate to='/current' replace />} />
          <Route path='current' element={<Current />} />
          <Route path='library' element={<Library />} />
          <Route path='achievements' element={<Achievements />} />
          <Route path='select' element={<Select />} />
          <Route path='settings' element={<Settings />} />
          <Route path='import-export' element={<ImportExport />} />
        </Route>

        {/* OBS overlays (standalone, minimal chrome) - no GameProvider to avoid posting 0 stats */}
        <Route path='/overlay/main' element={<AchievementProvider><OverlayMain /></AchievementProvider>} />
        <Route path='/overlay/stats' element={<OverlayStats />} />
        <Route path='/overlay/wheel' element={<OverlayWheel />} />
        <Route path='/overlay/achievements' element={<AchievementProvider><OverlayAchievements /></AchievementProvider>} />
        <Route path='/overlay/footer' element={<OverlayFooter />} />

        <Route path='*' element={<div className='p-4'>Not found</div>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
