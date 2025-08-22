import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import App from './App.jsx'
import Library from './routes/Library.jsx'
import Select from './routes/Select.jsx'
import OverlayMain from './routes/OverlayMain.jsx'
import OverlayStats from './routes/OverlayStats.jsx'
import OverlayWheel from './routes/OverlayWheel.jsx'
import Settings from './routes/Settings.jsx'
import ImportExport from './routes/ImportExport.jsx'
import Current from './routes/Current.jsx'
import { GameProvider } from './context/GameContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <GameProvider>
        <Routes>
          <Route path='/' element={<App />}>
            <Route index element={<Navigate to='/current' replace />} />
            <Route path='current' element={<Current />} />
            <Route path='library' element={<Library />} />
            <Route path='select' element={<Select />} />
            <Route path='settings' element={<Settings />} />
            <Route path='import-export' element={<ImportExport />} />
          </Route>

          {/* OBS overlays (standalone, minimal chrome) */}
          <Route path='/overlay/main' element={<OverlayMain />} />
          <Route path='/overlay/stats' element={<OverlayStats />} />
          <Route path='/overlay/wheel' element={<OverlayWheel />} />

          <Route path='*' element={<div className='p-4'>Not found</div>} />
        </Routes>
      </GameProvider>
    </BrowserRouter>
  </React.StrictMode>
)
