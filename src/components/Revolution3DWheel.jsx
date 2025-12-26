import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { buildCoverUrl } from '../utils/coverUrl.js'

const getImageUrl = (url) => buildCoverUrl(url)

const Revolution3DWheel = ({ 
  games = [], 
  onGameSelected, 
  onSampleUpdate,
  spinning = false,
  selectedIndex = null,
  theme = 'cyberpunk',
  onThemeChange,
  spinSeed = null,
  targetGameId = null,
}) => {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const wheelGroupRef = useRef(null)
  const gameCardsRef = useRef([])
  const particleSystemRef = useRef(null)
  const animationIdRef = useRef(null)
  const audioContextRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const WHEEL_RADIUS = 8
  const CARD_WIDTH = 2
  const CARD_HEIGHT = 2.8
  const TWO_PI = Math.PI * 2

  // Theme configurations
  const themes = {
    cyberpunk: {
      bg: new THREE.Color(0x0a0a0a),
      primary: new THREE.Color(0x00ff88),
      secondary: new THREE.Color(0xff3366),
      accent: new THREE.Color(0x44aaff),
      particles: 0x88ffaa
    },
    neon: {
      bg: new THREE.Color(0x1a0a2e),
      primary: new THREE.Color(0xff0080),
      secondary: new THREE.Color(0x00ffff),
      accent: new THREE.Color(0xff8800),
      particles: 0xff44cc
    },
    quantum: {
      bg: new THREE.Color(0x0f0f23),
      primary: new THREE.Color(0x4a90ff),
      secondary: new THREE.Color(0x7c3aed),
      accent: new THREE.Color(0x06b6d4),
      particles: 0x60a5fa
    }
  }

  const currentTheme = themes[theme] || themes.cyberpunk

  // Audio system for immersive sound
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch (e) {
        console.warn('Web Audio API not supported:', e)
      }
    }
  }, [])

  const playWheelSound = useCallback((type, frequency = 440, duration = 0.1) => {
    if (!audioContextRef.current) return
    
    try {
      const oscillator = audioContextRef.current.createOscillator()
      const gainNode = audioContextRef.current.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)
      
      oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime)
      
      switch (type) {
        case 'spin':
          oscillator.type = 'sawtooth'
          gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration)
          break
        case 'tick':
          oscillator.type = 'square'
          gainNode.gain.setValueAtTime(0.05, audioContextRef.current.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.05)
          break
        case 'selection':
          oscillator.type = 'sine'
          gainNode.gain.setValueAtTime(0.2, audioContextRef.current.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.5)
          break
      }
      
      oscillator.start(audioContextRef.current.currentTime)
      oscillator.stop(audioContextRef.current.currentTime + duration)
    } catch (e) {
      console.warn('Audio playback failed:', e)
    }
  }, [])

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!mountRef.current) {
      console.log('No mount ref available')
      return
    }

    try {
      console.log('Initializing 3D scene...')
      
      // Check WebGL support
      if (!window.WebGLRenderingContext) {
        throw new Error('WebGL not supported')
      }

      // Scene setup with brighter background
      const scene = new THREE.Scene()
      const brightBg = currentTheme.bg.clone().addScalar(0.1) // Brighten background
      scene.background = brightBg
      scene.fog = new THREE.Fog(brightBg, 10, 50) // Less dense fog
      sceneRef.current = scene
      console.log('Scene created')

      // Camera with dynamic positioning
      const camera = new THREE.PerspectiveCamera(
        45, 
        mountRef.current.clientWidth / mountRef.current.clientHeight, 
        0.1, 
        1000
      )
      camera.position.set(0, 5, 20)
      camera.lookAt(0, 0, 0)
      cameraRef.current = camera
      console.log('Camera created')

      // Renderer with conservative settings for compatibility
      const renderer = new THREE.WebGLRenderer({ 
        antialias: false, // Disable for better compatibility
        alpha: true,
        powerPreference: "default" // Use default instead of high-performance
      })
      
      // Test if WebGL context was created
      const gl = renderer.getContext()
      if (!gl) {
        throw new Error('Failed to get WebGL context')
      }
      
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)) // Reduce pixel ratio for performance
      renderer.shadowMap.enabled = false // Disable shadows for compatibility
      // Remove advanced tone mapping for compatibility
      rendererRef.current = renderer
      console.log('Renderer created successfully')

      mountRef.current.appendChild(renderer.domElement)
      console.log('Canvas added to DOM')

      // Much brighter lighting system
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2) // Much brighter ambient
      scene.add(ambientLight)

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.5) // Brighter directional
      mainLight.position.set(10, 10, 5)
      scene.add(mainLight)

      const frontLight = new THREE.DirectionalLight(0xffffff, 1.0) // Additional front lighting
      frontLight.position.set(0, 0, 10)
      scene.add(frontLight)

      const backLight = new THREE.DirectionalLight(currentTheme.primary, 0.8) // Theme colored back light
      backLight.position.set(0, 5, -10)
      scene.add(backLight)

      console.log('Bright lighting setup complete')

      // Create wheel group
      const wheelGroup = new THREE.Group()
      wheelGroupRef.current = wheelGroup
      scene.add(wheelGroup)

      // Create bright, visible wheel structure
      const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.5, 32)
      const wheelMaterial = new THREE.MeshPhongMaterial({
        color: currentTheme.primary.getHex(), // Use theme color
        shininess: 100,
        transparent: true,
        opacity: 0.9,
        emissive: new THREE.Color(currentTheme.primary).multiplyScalar(0.2) // Make it glow
      })
      const wheelBase = new THREE.Mesh(wheelGeometry, wheelMaterial)
      wheelGroup.add(wheelBase)

      // Add bright rim for visibility
      const rimGeometry = new THREE.TorusGeometry(WHEEL_RADIUS, 0.1, 8, 32)
      const rimMaterial = new THREE.MeshBasicMaterial({
        color: currentTheme.accent.getHex(),
        transparent: true,
        opacity: 0.8
      })
      const rim = new THREE.Mesh(rimGeometry, rimMaterial)
      rim.rotation.x = Math.PI / 2
      rim.position.y = 0.3
      wheelGroup.add(rim)

      // Create particle system
      const particleGeometry = new THREE.BufferGeometry()
      const particleCount = 1000
      const positions = new Float32Array(particleCount * 3)
      const colors = new Float32Array(particleCount * 3)
      const sizes = new Float32Array(particleCount)

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3
        positions[i3] = (Math.random() - 0.5) * 60
        positions[i3 + 1] = Math.random() * 30 - 5
        positions[i3 + 2] = (Math.random() - 0.5) * 60
        
        const color = new THREE.Color(currentTheme.particles)
        colors[i3] = color.r
        colors[i3 + 1] = color.g
        colors[i3 + 2] = color.b
        
        sizes[i] = Math.random() * 3 + 1
      }

      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

      const particleMaterial = new THREE.PointsMaterial({
        size: 4, // Bigger particles
        vertexColors: true,
        transparent: true,
        opacity: 0.9, // More visible
        blending: THREE.AdditiveBlending
      })

      const particleSystem = new THREE.Points(particleGeometry, particleMaterial)
      particleSystemRef.current = particleSystem
      scene.add(particleSystem)

      setIsLoading(false)
    } catch (err) {
      console.error('Failed to initialize 3D scene:', err)
      setError(err.message)
    }
  }, [currentTheme])

  // Create game cards
  const createGameCards = useCallback(() => {
    console.log('createGameCards called with games:', games.length, games)
    if (!wheelGroupRef.current || !games.length) {
      console.log('Early return - no wheel group or games')
      return
    }

    // Clear existing cards
    gameCardsRef.current.forEach(card => {
      wheelGroupRef.current.remove(card.group)
    })
    gameCardsRef.current = []

    const n = Math.max(1, games.length)
    games.slice(0, n).forEach((game, index) => {
      const angle = (index / n) * TWO_PI
      const x = Math.cos(angle) * WHEEL_RADIUS
      const z = Math.sin(angle) * WHEEL_RADIUS

      // Card group
      const cardGroup = new THREE.Group()
      cardGroup.position.set(x, 0, z)
      cardGroup.rotation.y = angle + Math.PI / 2

      // Bright, visible card base
      const cardGeometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT)
      const cardMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff, // White base for maximum visibility
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x111111) // Slight glow
      })
      const cardMesh = new THREE.Mesh(cardGeometry, cardMaterial)
      cardGroup.add(cardMesh)

      // Add bright border for each card
      const borderGeometry = new THREE.PlaneGeometry(CARD_WIDTH + 0.1, CARD_HEIGHT + 0.1)
      const borderMaterial = new THREE.MeshBasicMaterial({
        color: currentTheme.primary.getHex(),
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      })
      const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial)
      borderMesh.position.z = -0.005
      cardGroup.add(borderMesh)

      // Game cover (if available)
      if (game.image_url) {
        const loader = new THREE.TextureLoader()
        const imageUrl = getImageUrl(game.image_url)
        console.log('Loading texture for', game.title, 'from:', imageUrl)
        loader.load(
          imageUrl,
          (texture) => {
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            cardMaterial.map = texture
            cardMaterial.needsUpdate = true
            console.log('Texture loaded successfully for', game.title)
          },
          undefined,
          (err) => {
            console.warn('Failed to load texture for', game.title, 'error:', err)
          }
        )
      }

      // Glow effect for selected card
      if (index === selectedIndex) {
        const glowGeometry = new THREE.PlaneGeometry(CARD_WIDTH + 0.2, CARD_HEIGHT + 0.2)
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: currentTheme.primary,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        })
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
        glowMesh.position.z = -0.01
        cardGroup.add(glowMesh)
      }

      wheelGroupRef.current.add(cardGroup)
      gameCardsRef.current.push({ 
        group: cardGroup, 
        game, 
        index,
        originalRotation: cardGroup.rotation.clone()
      })
    })
  }, [games, selectedIndex, currentTheme])

  // Animation loop
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) {
      console.log('Animation stopped - missing refs')
      return
    }

    try {
      // Particle animation
      if (particleSystemRef.current) {
        const positions = particleSystemRef.current.geometry.attributes.position.array
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] -= 0.05 // Fall down
          if (positions[i + 1] < -10) {
            positions[i + 1] = 20 // Reset to top
          }
        }
        particleSystemRef.current.geometry.attributes.position.needsUpdate = true
        particleSystemRef.current.rotation.y += 0.001
      }

      // Card hover effects
      gameCardsRef.current.forEach(card => {
        try {
          if (card.index === selectedIndex) {
            card.group.position.y = Math.sin(Date.now() * 0.003) * 0.2 + 0.1
            card.group.scale.setScalar(1.1 + Math.sin(Date.now() * 0.005) * 0.05)
          } else {
            card.group.position.y = 0
            card.group.scale.setScalar(1)
          }
        } catch (cardErr) {
          console.warn('Card animation error:', cardErr)
        }
      })

      // Camera gentle movement
      if (cameraRef.current) {
        cameraRef.current.position.x = Math.sin(Date.now() * 0.0005) * 2
        cameraRef.current.lookAt(0, 0, 0)
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current)
      animationIdRef.current = requestAnimationFrame(animate)
    } catch (animateErr) {
      console.error('Animation error:', animateErr)
      setError(animateErr.message)
    }
  }, [selectedIndex])

  // Deterministic spin to target game when a new spinSeed arrives
  useEffect(() => {
    if (!spinSeed || !spinSeed.ts) return
    if (!wheelGroupRef.current || !games.length) return

    const n = Math.max(1, games.length)
    const idx = targetGameId != null ? games.findIndex(g => g && g.id === targetGameId) : -1
    const targetIdx = idx >= 0 ? idx : 0
    const baseAngle = (targetIdx / n) * TWO_PI
    const pointerWorldAngle = Math.PI / 2 // front/top center toward camera

    const currentAngle = wheelGroupRef.current.rotation.y || 0
    const currentMod = ((currentAngle % TWO_PI) + TWO_PI) % TWO_PI
    const targetMod = ((pointerWorldAngle - baseAngle) % TWO_PI + TWO_PI) % TWO_PI
    let deltaBase = (targetMod - currentMod)
    if (deltaBase < 0) deltaBase += TWO_PI

    const extraTurns = Math.max(1, Number(spinSeed.turns) || 6)
    const finalAngle = currentAngle + deltaBase + TWO_PI * extraTurns
    const duration = Math.max(800, Number(spinSeed.durationMs) || 4500)

    // Align with server timestamp so overlay and local stay in sync
    const now = Date.now()
    const offset = Math.max(0, now - Number(spinSeed.ts))
    let start = performance.now() - offset
    const startAngle = currentAngle

    const tick = (t) => {
      if (start == null) start = t
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const angle = startAngle + (finalAngle - startAngle) * eased
      if (wheelGroupRef.current) wheelGroupRef.current.rotation.y = angle
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        try { rendererRef.current.render(sceneRef.current, cameraRef.current) } catch {}
      }
      if (p < 1) animationIdRef.current = requestAnimationFrame(tick)
    }
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
    animationIdRef.current = requestAnimationFrame(tick)
  }, [spinSeed, targetGameId, games])

  // Handle resize
  const handleResize = useCallback(() => {
    if (!mountRef.current || !rendererRef.current) return

    const width = mountRef.current.clientWidth
    const height = mountRef.current.clientHeight

    rendererRef.current.setSize(width, height)
    if (cameraRef.current) {
      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
    }
  }, [])

  // Cleanup
  const cleanup = useCallback(() => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current)
    }
    if (rendererRef.current) {
      rendererRef.current.dispose()
      if (mountRef.current && rendererRef.current.domElement) {
        mountRef.current.removeChild(rendererRef.current.domElement)
      }
    }
    if (sceneRef.current) {
      sceneRef.current.clear()
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    initAudio()
    initScene()
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      cleanup()
    }
  }, [initAudio, initScene, handleResize, cleanup])

  // Update cards when games change
  useEffect(() => {
    if (!isLoading && !error) {
      createGameCards()
    }
  }, [games, selectedIndex, createGameCards, isLoading, error])

  // Start animation loop
  useEffect(() => {
    if (!isLoading && !error) {
      animate()
      return () => {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current)
        }
      }
    }
  }, [animate, isLoading, error])

  // Play sounds for interactions
  useEffect(() => {
    if (spinning) {
      playWheelSound('spin', 220, 2)
    } else if (selectedIndex !== null) {
      playWheelSound('selection', 440, 0.5)
    }
  }, [spinning, selectedIndex, playWheelSound])

  if (error) {
    return (
      <div className="revolution-wheel-error">
        <div className="error-container">
          <h3>3D Wheel Error</h3>
          <p>{error}</p>
          <div className="error-actions">
            <button 
              className="btn btn-primary"
              onClick={() => { setError(null); setIsLoading(true); initScene(); }}
            >
              Retry 3D Wheel
            </button>
          </div>
        </div>
        
        {/* Simple 2D fallback */}
        <div className="fallback-wheel">
          <h4>2D Game Display</h4>
          <div className="simple-game-grid">
            {games.slice(0, 6).map((game, index) => (
              <div 
                key={game.id || index}
                className={`game-card-2d ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => onGameSelected?.(game)}
              >
                {game.image_url && (
                  <img src={getImageUrl(game.image_url)} alt={game.title} />
                )}
                <div className="game-title">{game.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="revolution-3d-wheel">
      <div 
        ref={mountRef} 
        className={`wheel-3d-container ${spinning ? 'spinning' : ''} ${theme}`}
        style={{ 
          width: '100%', 
          height: '600px', 
          background: 'radial-gradient(circle, #2a2a4e 0%, #1f1f43 70%)', // Much brighter background
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
          border: '2px solid rgba(0, 255, 136, 0.3)' // Add theme colored border
        }}
      />
      
      {isLoading && (
        <div className="wheel-loading-overlay">
          <div className="loading-spinner"></div>
          <p>Initializing 3D Wheel...</p>
        </div>
      )}

      {/* Control overlay */}
      <div className="wheel-controls-overlay">
        <div className="wheel-theme-selector">
          {Object.keys(themes).map(themeName => (
            <button
              key={themeName}
              className={`theme-btn ${theme === themeName ? 'active' : ''}`}
              onClick={() => onThemeChange?.(themeName)}
            >
              {themeName}
            </button>
          ))}
        </div>
        
        <div className="wheel-stats">
          <div className="stat">
            <span className="label">Games</span>
            <span className="value">{games.length}</span>
          </div>
          <div className="stat">
            <span className="label">Selected</span>
            <span className="value">{selectedIndex !== null ? selectedIndex + 1 : '-'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Revolution3DWheel
