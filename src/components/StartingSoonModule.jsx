import React from 'react'
import { buildOverlayUrl } from '../utils/overlayApi.js'

export default function StartingSoonModule({ enabled, mode = 'startingSoon' }) {
  const [videos, setVideos] = React.useState([])
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [showLabel, setShowLabel] = React.useState(false)
  const videoRef = React.useRef(null)
  const videosRef = React.useRef([])
  const currentIndexRef = React.useRef(0)
  const recentRef = React.useRef([]) // last played trailer names
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

  const rememberPlayed = React.useCallback((name) => {
    const n = String(name || '').trim()
    if (!n) return
    const prev = recentRef.current || []
    const next = [n, ...prev.filter(x => x !== n)].slice(0, 3)
    recentRef.current = next
  }, [])

  const buildDeck = React.useCallback((list) => {
    const items = Array.isArray(list) ? list.filter(v => v && v.name && v.url) : []
    if (items.length <= 1) return items

    const recentSet = new Set(recentRef.current || [])
    const recentGuard = Math.min(3, items.length - 1)

    const remaining = [...items]
    const deck = []

    while (remaining.length) {
      const avoid = deck.length < recentGuard ? recentSet : null
      let candidates = remaining
      if (avoid) {
        const filtered = remaining.filter(v => !avoid.has(v.name))
        if (filtered.length) candidates = filtered
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]
      deck.push(pick)
      remaining.splice(remaining.indexOf(pick), 1)
    }

    // Extra guard: ensure first item isn't the last-played if we can avoid it.
    if (deck.length > 1) {
      const last = (recentRef.current || [])[0]
      if (last && deck[0]?.name === last) {
        const swapIdx = deck.findIndex(v => v?.name && v.name !== last)
        if (swapIdx > 0) {
          const tmp = deck[0]
          deck[0] = deck[swapIdx]
          deck[swapIdx] = tmp
        }
      }
    }

    return deck
  }, [])

  const sameTrailerSet = (a, b) => {
    const A = Array.isArray(a) ? a : []
    const B = Array.isArray(b) ? b : []
    if (A.length !== B.length) return false
    const an = A.map(x => String(x?.name || '')).filter(Boolean).sort()
    const bn = B.map(x => String(x?.name || '')).filter(Boolean).sort()
    if (an.length !== bn.length) return false
    for (let i = 0; i < an.length; i += 1) {
      if (an[i] !== bn[i]) return false
    }
    return true
  }

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
        const nextRaw = Array.isArray(data) ? data : []
        const prevVideos = videosRef.current
        const isSameSet = sameTrailerSet(prevVideos, nextRaw)
        if (isSameSet && prevVideos.length) return
        const prevIndex = currentIndexRef.current
        const prevName = prevVideos[prevIndex]?.name

        const nextDeck = buildDeck(nextRaw)
        let nextIndex = 0
        if (prevName) {
          const foundIndex = nextDeck.findIndex(video => video?.name === prevName)
          if (foundIndex >= 0) nextIndex = foundIndex
        }
        setVideos(nextDeck)
        setCurrentIndex(nextDeck.length ? nextIndex : 0)
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
  }, [enabled, buildDeck])

  const handleVideoEnd = () => {
    if (currentVideo?.name) rememberPlayed(currentVideo.name)
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
    if (currentVideo?.name) rememberPlayed(currentVideo.name)
    if (videos.length <= 1) return
    setCurrentIndex(prev => (prev + 1) % videos.length)
  }

  if (!enabled) return null

  const isStartingSoon = mode === 'startingSoon'
  const title = isStartingSoon ? 'STARTING SOON' : 'BE RIGHT BACK'
  const status = isStartingSoon ? 'STATUS: PRE-BROADCAST' : 'STATUS: BRB'

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
            {title}
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
        {status}
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
