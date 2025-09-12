import React, { useState, useEffect, useRef } from 'react'

const AnimatedNumber = ({ value, duration = 1000, className = '' }) => {
  const [displayValue, setDisplayValue] = useState(value)
  const [isAnimating, setIsAnimating] = useState(false)
  const animationRef = useRef(null)
  const prevValueRef = useRef(value)

  useEffect(() => {
    if (value === prevValueRef.current) return
    
    setIsAnimating(true)
    const startValue = prevValueRef.current
    const endValue = value
    const startTime = performance.now()

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      
      const currentValue = Math.round(startValue + (endValue - startValue) * easeOutCubic)
      setDisplayValue(currentValue)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
        prevValueRef.current = value
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [value, duration])

  return (
    <span className={`animated-number ${className} ${isAnimating ? 'animating' : ''}`}>
      {displayValue.toString().padStart(2, '0')}
    </span>
  )
}

const CircularProgress = ({ 
  progress, 
  size = 120, 
  strokeWidth = 6, 
  color = '#00ff88',
  backgroundColor = 'rgba(255,255,255,0.1)',
  children,
  animated = true 
}) => {
  const center = size / 2
  const radius = center - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="progress-ring">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={animated ? strokeDashoffset : 0}
          strokeLinecap="round"
          className="progress-circle"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: animated ? 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
          }}
        />
      </svg>
      <div className="progress-content">
        {children}
      </div>
    </div>
  )
}

const TimeParts = ({ timeString, animated = true }) => {
  const parts = timeString.split(':')
  const [hours, minutes, seconds] = parts.length === 3 ? parts : ['00', ...parts]

  return (
    <div className="time-parts">
      {parts.length === 3 && (
        <>
          <AnimatedNumber value={parseInt(hours)} className="hours" />
          <span className="separator">:</span>
        </>
      )}
      <AnimatedNumber value={parseInt(minutes)} className="minutes" />
      <span className="separator">:</span>
      <AnimatedNumber value={parseInt(seconds)} className="seconds" />
    </div>
  )
}

const AnimatedTimer = ({ 
  time = '00:00:00', 
  label = 'Timer',
  style = 'modern',
  size = 'normal',
  showProgress = false,
  progressMax = 100,
  color = '#00ff88',
  theme = 'cyberpunk',
  animated = true,
  pulseOnUpdate = true,
  showMilliseconds = false
}) => {
  const [prevTime, setPrevTime] = useState(time)
  const [isPulsing, setIsPulsing] = useState(false)
  const pulseTimeoutRef = useRef(null)

  // Theme colors
  const themes = {
    cyberpunk: {
      primary: '#00ff88',
      secondary: '#44aaff', 
      accent: '#ff3366',
      bg: 'rgba(0, 17, 34, 0.7)'
    },
    neon: {
      primary: '#ff0080',
      secondary: '#00ffff',
      accent: '#ff8800',
      bg: 'rgba(42, 8, 69, 0.7)'
    },
    quantum: {
      primary: '#4a90ff',
      secondary: '#7c3aed',
      accent: '#06b6d4',
      bg: 'rgba(15, 25, 53, 0.7)'
    },
    minimal: {
      primary: '#ffffff',
      secondary: '#cccccc',
      accent: '#888888',
      bg: 'rgba(0, 0, 0, 0.7)'
    }
  }

  const currentTheme = themes[theme] || themes.cyberpunk
  const timerColor = color || currentTheme.primary

  // Pulse effect when time updates
  useEffect(() => {
    if (time !== prevTime && pulseOnUpdate) {
      setIsPulsing(true)
      setPrevTime(time)
      
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current)
      }
      
      pulseTimeoutRef.current = setTimeout(() => {
        setIsPulsing(false)
      }, 600)
    }
  }, [time, prevTime, pulseOnUpdate])

  // Calculate progress percentage if showing progress
  const progressValue = showProgress ? 
    Math.min(100, (parseTimeString(time) / progressMax) * 100) : 0

  // Parse time string to seconds for progress calculation
  function parseTimeString(timeStr) {
    const parts = timeStr.split(':').map(Number)
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    }
    return parts[0] || 0
  }

  const sizeClasses = {
    small: 'timer-small',
    normal: 'timer-normal', 
    large: 'timer-large',
    xl: 'timer-xl'
  }

  const sizeClass = sizeClasses[size] || sizeClasses.normal

  if (style === 'circular') {
    return (
      <div 
        className={`animated-timer circular ${sizeClass} ${isPulsing ? 'pulsing' : ''}`}
        style={{ 
          '--timer-color': timerColor,
          '--timer-bg': currentTheme.bg,
          '--timer-secondary': currentTheme.secondary
        }}
      >
        <CircularProgress
          progress={progressValue}
          color={timerColor}
          size={size === 'large' ? 150 : size === 'small' ? 100 : 120}
          animated={animated}
        >
          <div className="timer-content">
            <div className="timer-label">{label}</div>
            <div className="timer-value">
              <TimeParts timeString={time} animated={animated} />
            </div>
          </div>
        </CircularProgress>
      </div>
    )
  }

  if (style === 'card') {
    return (
      <div 
        className={`animated-timer card ${sizeClass} ${isPulsing ? 'pulsing' : ''}`}
        style={{ 
          '--timer-color': timerColor,
          '--timer-bg': currentTheme.bg,
          '--timer-secondary': currentTheme.secondary
        }}
      >
        <div className="timer-card-content">
          <div className="timer-label">{label}</div>
          <div className="timer-value">
            <TimeParts timeString={time} animated={animated} />
          </div>
          {showProgress && (
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ 
                    width: `${progressValue}%`,
                    backgroundColor: timerColor,
                    transition: animated ? 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
                  }}
                />
              </div>
              <div className="progress-text">{Math.round(progressValue)}%</div>
            </div>
          )}
        </div>
        <div className="timer-glow" style={{ boxShadow: `0 0 30px ${timerColor}40` }} />
      </div>
    )
  }

  if (style === 'minimal') {
    return (
      <div 
        className={`animated-timer minimal ${sizeClass} ${isPulsing ? 'pulsing' : ''}`}
        style={{ 
          '--timer-color': timerColor,
          '--timer-secondary': currentTheme.secondary
        }}
      >
        <span className="timer-label">{label}:</span>
        <span className="timer-value">
          <TimeParts timeString={time} animated={animated} />
        </span>
      </div>
    )
  }

  // Default 'modern' style
  return (
    <div 
      className={`animated-timer modern ${sizeClass} ${isPulsing ? 'pulsing' : ''}`}
      style={{ 
        '--timer-color': timerColor,
        '--timer-bg': currentTheme.bg,
        '--timer-secondary': currentTheme.secondary,
        '--timer-accent': currentTheme.accent
      }}
    >
      <div className="timer-modern-content">
        <div className="timer-header">
          <div className="timer-label">{label}</div>
          <div className="timer-status-dot" />
        </div>
        <div className="timer-display">
          <TimeParts timeString={time} animated={animated} />
        </div>
        {showProgress && (
          <div className="progress-ring-mini">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="transparent"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="2"
              />
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="transparent"
                stroke={timerColor}
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 10}`}
                strokeDashoffset={`${2 * Math.PI * 10 * (1 - progressValue / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 12 12)"
                style={{
                  transition: animated ? 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
                }}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

export default AnimatedTimer