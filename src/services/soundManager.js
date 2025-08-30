// Sound Manager for Achievement Notifications and Stream Alerts

class SoundManager {
  constructor() {
    this.audioContext = null
    this.sounds = new Map()
    this.volume = 0.7
    this.enabled = true
    this.initialized = false
    this.soundsLoaded = false
  }

  // Initialize audio context (must be called after user interaction)
  async initialize() {
    if (this.initialized || typeof window === 'undefined') return

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this.initialized = true
      console.log('SoundManager: Audio context initialized')
    } catch (error) {
      console.warn('SoundManager: Failed to initialize audio context:', error)
    }
  }

  // Load achievement sound effects
  async loadSounds() {
    if (this.soundsLoaded) return
    if (!this.initialized) await this.initialize()
    if (!this.audioContext) return

    const soundUrls = {
      achievement: '/sounds/achievement.mp3',
      achievementHardcore: '/sounds/achievement-hardcore.mp3',
      milestone25: '/sounds/milestone-25.mp3',
      milestone50: '/sounds/milestone-50.mp3',
      milestone75: '/sounds/milestone-75.mp3',
      milestone100: '/sounds/milestone-100.mp3',
      streak: '/sounds/streak.mp3',
      rare: '/sounds/rare-achievement.mp3'
    }

    for (const [name, url] of Object.entries(soundUrls)) {
      try {
        const buffer = await this.loadSoundBuffer(url)
        if (buffer) {
          this.sounds.set(name, buffer)
          console.log(`SoundManager: Loaded sound ${name}`)
        }
      } catch (error) {
        console.warn(`SoundManager: Failed to load sound ${name}:`, error)
        // Create fallback synthesized sounds
        this.createFallbackSound(name)
      }
    }

    this.soundsLoaded = true
  }

  // Load sound buffer from URL
  async loadSoundBuffer(url) {
    if (!this.audioContext) return null

    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      return audioBuffer
    } catch (error) {
      // File not found or decode error - will use fallback
      return null
    }
  }

  // Create synthesized fallback sounds
  createFallbackSound(name) {
    if (!this.audioContext) return

    const sampleRate = this.audioContext.sampleRate
    let duration, frequencies, type

    switch (name) {
      case 'achievement':
        duration = 0.6
        frequencies = [523, 659, 784] // C5, E5, G5
        type = 'sine'
        break
      case 'achievementHardcore':
        duration = 0.8
        frequencies = [523, 659, 784, 1047] // C5, E5, G5, C6
        type = 'square'
        break
      case 'milestone25':
        duration = 0.4
        frequencies = [440, 554] // A4, C#5
        type = 'triangle'
        break
      case 'milestone50':
        duration = 0.5
        frequencies = [440, 554, 659] // A4, C#5, E5
        type = 'triangle'
        break
      case 'milestone75':
        duration = 0.6
        frequencies = [440, 554, 659, 784] // A4, C#5, E5, G5
        type = 'triangle'
        break
      case 'milestone100':
        duration = 1.0
        frequencies = [523, 659, 784, 1047, 1319] // Victory fanfare
        type = 'sine'
        break
      case 'streak':
        duration = 0.3
        frequencies = [784, 880, 988] // G5, A5, B5
        type = 'sawtooth'
        break
      case 'rare':
        duration = 0.9
        frequencies = [392, 523, 659, 784, 880] // Rare achievement fanfare
        type = 'triangle'
        break
      default:
        return
    }

    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate)
    const channelData = buffer.getChannelData(0)

    for (let i = 0; i < channelData.length; i++) {
      const time = i / sampleRate
      let sample = 0

      frequencies.forEach((freq, index) => {
        const noteStart = (index / frequencies.length) * duration
        const noteEnd = ((index + 1) / frequencies.length) * duration
        
        if (time >= noteStart && time < noteEnd) {
          const envelope = Math.exp(-3 * (time - noteStart) / (noteEnd - noteStart))
          const oscillator = this.getOscillatorSample(type, freq, time - noteStart)
          sample += oscillator * envelope * 0.3
        }
      })

      channelData[i] = Math.max(-1, Math.min(1, sample))
    }

    this.sounds.set(name, buffer)
    console.log(`SoundManager: Created fallback sound ${name}`)
  }

  // Generate oscillator sample
  getOscillatorSample(type, frequency, time) {
    const phase = 2 * Math.PI * frequency * time

    switch (type) {
      case 'sine':
        return Math.sin(phase)
      case 'square':
        return Math.sin(phase) > 0 ? 1 : -1
      case 'triangle':
        return (2 / Math.PI) * Math.asin(Math.sin(phase))
      case 'sawtooth':
        return 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5))
      default:
        return Math.sin(phase)
    }
  }

  // Play achievement sound with appropriate type
  async playAchievementSound(achievement, gameProgress = null) {
    if (!this.enabled || !this.audioContext) return

    let soundName = 'achievement'

    // Determine sound type based on achievement properties
    if (achievement.hardcoreMode) {
      soundName = 'achievementHardcore'
    } else if (achievement.points >= 50) {
      soundName = 'rare' // High-point achievements get rare sound
    }

    // Check for milestone celebrations
    if (gameProgress) {
      const completionPercentage = gameProgress.completionPercentage || 0
      
      if (completionPercentage >= 100) {
        soundName = 'milestone100'
      } else if (completionPercentage >= 75) {
        soundName = 'milestone75'
      } else if (completionPercentage >= 50) {
        soundName = 'milestone50'
      } else if (completionPercentage >= 25) {
        soundName = 'milestone25'
      }
    }

    await this.playSound(soundName)
  }

  // Play specific sound
  async playSound(soundName) {
    if (!this.enabled || !this.audioContext || !this.sounds.has(soundName)) {
      return
    }

    try {
      const buffer = this.sounds.get(soundName)
      const source = this.audioContext.createBufferSource()
      const gainNode = this.audioContext.createGain()
      
      source.buffer = buffer
      gainNode.gain.value = this.volume
      
      source.connect(gainNode)
      gainNode.connect(this.audioContext.destination)
      
      source.start()
      
      console.log(`SoundManager: Played sound ${soundName}`)
    } catch (error) {
      console.warn(`SoundManager: Failed to play sound ${soundName}:`, error)
    }
  }

  // Play streak sound
  async playStreakSound(streakCount) {
    if (streakCount >= 3) {
      await this.playSound('streak')
    }
  }

  // Settings
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  setEnabled(enabled) {
    this.enabled = enabled
  }

  getSettings() {
    return {
      enabled: this.enabled,
      volume: this.volume,
      initialized: this.initialized,
      soundsLoaded: this.soundsLoaded
    }
  }

  // Test sounds
  async testSound(soundName = 'achievement') {
    await this.playSound(soundName)
  }
}

// Global instance
const soundManager = new SoundManager()

export default soundManager
