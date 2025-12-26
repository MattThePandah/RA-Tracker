import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import App from './App.jsx'
import Library from './routes/Library.jsx'
import Select from './routes/Select.jsx'
import OverlayMain from './routes/OverlayMain.jsx'
import ModernOverlayMain from './routes/ModernOverlayMain.jsx'
import OverlayStats from './routes/OverlayStats.jsx'
import OverlayWheel from './routes/OverlayWheel.jsx'
import OverlayAchievements from './routes/OverlayAchievements.jsx'
import OverlayFooter from './routes/OverlayFooter.jsx'
import OverlayBadgeCarousel from './routes/OverlayBadgeCarousel.jsx'
import Settings from './routes/Settings.jsx'
import ImportExport from './routes/ImportExport.jsx'
import Current from './routes/Current.jsx'
import Achievements from './routes/Achievements.jsx'
import Studio from './routes/Studio.jsx'
import Suggestions from './routes/Suggestions.jsx'
import PublicSite from './routes/PublicSite.jsx'
import Dashboard from './routes/Dashboard.jsx'
import Pulse from './routes/Pulse.jsx'
import Overlays from './routes/Overlays.jsx'
import Public from './routes/Public.jsx'
import PublicGame from './routes/PublicGame.jsx'
import { GameProvider } from './context/GameContext.jsx'
import { AchievementProvider } from './context/AchievementContext.jsx'
import { AdminProvider } from './context/AdminContext.jsx'
import AdminGate from './components/AdminGate.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route index element={<Public />} />

        {/* Public-facing UI */}
        <Route path='/public' element={<Public />} />
        <Route path='/game/:gameId' element={<PublicGame />} />

        {/* Admin app wrapped with providers */}
        <Route
          path='/admin'
          element={
            <AdminProvider>
              <AdminGate>
                <GameProvider>
                  <AchievementProvider>
                    <App />
                  </AchievementProvider>
                </GameProvider>
              </AdminGate>
            </AdminProvider>
          }
        >
          <Route index element={<Navigate to='dashboard' replace />} />
          <Route path='dashboard' element={<Dashboard />} />
          <Route path='pulse' element={<Pulse />} />
          <Route path='current' element={<Current />} />
          <Route path='studio' element={<Studio />} />
          <Route path='overlays' element={<Overlays />} />
          <Route path='suggestions' element={<Suggestions />} />
          <Route path='public-site' element={<PublicSite />} />
          <Route path='library' element={<Library />} />
          <Route path='achievements' element={<Achievements />} />
          <Route path='select' element={<Select />} />
          <Route path='settings' element={<Settings />} />
          <Route path='import-export' element={<ImportExport />} />
        </Route>

        {/* OBS overlays (standalone, minimal chrome) - no GameProvider to avoid posting 0 stats */}
        <Route path='/overlay/main' element={<AchievementProvider><OverlayMain /></AchievementProvider>} />
        <Route path='/overlay/modern' element={<AchievementProvider><ModernOverlayMain /></AchievementProvider>} />
        <Route path='/overlay/stats' element={<OverlayStats />} />
        <Route path='/overlay/wheel' element={<OverlayWheel />} />
        <Route path='/overlay/achievements' element={<AchievementProvider><OverlayAchievements /></AchievementProvider>} />
        <Route path='/overlay/footer' element={<AchievementProvider><OverlayFooter /></AchievementProvider>} />
        <Route path='/overlay/badge-carousel' element={<AchievementProvider><OverlayBadgeCarousel /></AchievementProvider>} />

        <Route path='*' element={<div className='p-4'>Not found</div>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
