import React from 'react'
import { buildOverlayUrl } from '../utils/overlayApi.js'

export default function StartingSoonModule({ enabled }) {
  const [videos, setVideos] = React.useState([])
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [showLabel, setShowLabel] = React.useState(false)
  const videoRef = React.useRef(null)
  const videosRef = React.useRef([])
  const currentIndexRef = React.useRef(0)
  const currentVideo = videos[currentIndex]
  const trailerLabel = React.useMemo(() => {
    if (!currentVideo?.name) return ''
    return currentVideo.name
      .replace(/[\\/]+/g, ' / ')
      .replace(/\.[^.]+$/, '')
      .replace(/_+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }, [currentVideo])

  React.useEffect(() => {
    videosRef.current = videos
  }, [videos])

  React.useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  React.useEffect(() => {
    if (!currentVideo) {
      setShowLabel(false)
      return
    }
    setShowLabel(true)
    const timer = setTimeout(() => setShowLabel(false), 15000)
    return () => clearTimeout(timer)
  }, [currentVideo?.name])

  React.useEffect(() => {
    if (!enabled) return
    const base = import.meta.env.VITE_IGDB_PROXY_URL || 'http://localhost:8787'
    let active = true
    const fetchTrailers = async () => {
      try {
        const url = buildOverlayUrl(`/overlay/trailers?ts=${Date.now()}`, base)
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        const nextVideos = Array.isArray(data)
          ? [...data].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
          : []
        const prevVideos = videosRef.current
        const isSame = prevVideos.length === nextVideos.length
          && prevVideos.every((video, index) => video?.name === nextVideos[index]?.name)
        if (isSame) return
        const prevIndex = currentIndexRef.current
        const prevName = prevVideos[prevIndex]?.name
        let nextIndex = 0
        if (prevName) {
          const foundIndex = nextVideos.findIndex(video => video?.name === prevName)
          if (foundIndex >= 0) nextIndex = foundIndex
        }
        setVideos(nextVideos)
        setCurrentIndex(nextVideos.length ? nextIndex : 0)
      } catch (err) {
        console.error('Failed to load trailers:', err)
      }
    }
    fetchTrailers()
    const poll = setInterval(fetchTrailers, 30000)
    return () => {
      active = false
      clearInterval(poll)
    }
  }, [enabled])

  const handleVideoEnd = () => {
    if (videos.length <= 1) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }
      return
    }
    setCurrentIndex(prev => (prev + 1) % videos.length)
  }
  const handleVideoError = () => {
    if (videos.length <= 1) return
    setCurrentIndex(prev => (prev + 1) % videos.length)
  }

  if (!enabled) return null

  return (
    <div className="starting-soon-video-player" style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {currentVideo ? (
        <video
          ref={videoRef}
          src={currentVideo.url}
          autoPlay
          loop={videos.length <= 1}
          onEnded={handleVideoEnd}
          onError={handleVideoError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'rgba(255,255,255,0.2)', letterSpacing: '8px' }}>
            STARTING SOON
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.1)', marginTop: '10px' }}>
            (No trailers in /trailers folder)
          </div>
        </div>
      )}

      {currentVideo && trailerLabel && showLabel && (
        <div style={{
          position: 'absolute',
          bottom: '18px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#7cff9e',
          fontSize: '14px',
          fontFamily: 'monospace',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          fontWeight: 700,
          zIndex: 3,
          maxWidth: '90%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '0 0 6px rgba(124, 255, 158, 0.6), 0 0 12px rgba(124, 255, 158, 0.35), 0 2px 3px rgba(0,0,0,0.85)'
        }}>
          <span style={{
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: '9px solid #7cff9e',
            filter: 'drop-shadow(0 0 6px rgba(124, 255, 158, 0.6))'
          }} />
          <span>PLAY</span>
          <span style={{
            opacity: 0.85,
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {trailerLabel}
          </span>
        </div>
      )}
      
      {/* OSD overlay */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        padding: '5px 10px',
        background: 'rgba(0,0,0,0.5)',
        color: '#5ecf86',
        fontSize: '12px',
        fontFamily: 'monospace',
        border: '1px solid #5ecf86',
        zIndex: 10
      }}>
        STATUS: PRE-BROADCAST
      </div>
      {/* CRT Scanline Overlay */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%)',
        backgroundSize: '100% 4px',
        zIndex: 2
      }} />
    </div>
  )
}
