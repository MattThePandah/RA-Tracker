// Theme Manager for Overlay Customization

export const OVERLAY_THEMES = {
  default: {
    id: 'default',
    name: 'Default Dark',
    description: 'Classic dark theme with blue accents',
    colors: {
      primary: '#87cafe',
      accent: '#3de09d',
      background: 'rgba(0,0,0,0.9)',
      backgroundGradient: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(20,20,20,0.98) 50%, rgba(0,0,0,0.95) 100%)',
      border: 'rgba(255,255,255,0.12)',
      text: '#ffffff',
      textSecondary: 'rgba(255,255,255,0.8)',
      textMuted: 'rgba(255,255,255,0.6)',
      cardBackground: 'rgba(0,0,0,0.5)',
      cardBorder: 'rgba(255,255,255,0.12)'
    },
    shadows: {
      card: '0 8px 24px rgba(0,0,0,0.45)',
      popup: '0 20px 60px rgba(0,0,0,0.8)',
      glow: '0 0 20px rgba(135,202,254,0.3)'
    }
  },
  
  neon: {
    id: 'neon',
    name: 'Neon Gaming',
    description: 'Vibrant cyberpunk theme with neon colors',
    colors: {
      primary: '#00ff88',
      accent: '#ff0088',
      background: 'rgba(5,0,20,0.95)',
      backgroundGradient: 'linear-gradient(135deg, rgba(5,0,20,0.95) 0%, rgba(20,0,40,0.98) 50%, rgba(5,0,20,0.95) 100%)',
      border: 'rgba(0,255,136,0.4)',
      text: '#ffffff',
      textSecondary: 'rgba(0,255,136,0.9)',
      textMuted: 'rgba(255,255,255,0.7)',
      cardBackground: 'rgba(5,0,20,0.8)',
      cardBorder: 'rgba(0,255,136,0.3)'
    },
    shadows: {
      card: '0 8px 32px rgba(0,255,136,0.2)',
      popup: '0 20px 60px rgba(0,255,136,0.4)',
      glow: '0 0 30px rgba(0,255,136,0.6)'
    }
  },
  
  minimal: {
    id: 'minimal',
    name: 'Clean Minimal',
    description: 'Simple, clean design with subtle colors',
    colors: {
      primary: '#6366f1',
      accent: '#8b5cf6',
      background: 'rgba(255,255,255,0.95)',
      backgroundGradient: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 50%, rgba(255,255,255,0.95) 100%)',
      border: 'rgba(0,0,0,0.1)',
      text: '#1f2937',
      textSecondary: 'rgba(31,41,55,0.8)',
      textMuted: 'rgba(31,41,55,0.6)',
      cardBackground: 'rgba(255,255,255,0.8)',
      cardBorder: 'rgba(0,0,0,0.08)'
    },
    shadows: {
      card: '0 4px 16px rgba(0,0,0,0.1)',
      popup: '0 20px 40px rgba(0,0,0,0.15)',
      glow: '0 0 20px rgba(99,102,241,0.2)'
    }
  },
  
  retro: {
    id: 'retro',
    name: 'Retro Arcade',
    description: '80s-inspired theme with warm colors',
    colors: {
      primary: '#ff6b35',
      accent: '#f7931e',
      background: 'rgba(20,5,0,0.95)',
      backgroundGradient: 'linear-gradient(135deg, rgba(20,5,0,0.95) 0%, rgba(40,20,5,0.98) 50%, rgba(20,5,0,0.95) 100%)',
      border: 'rgba(255,107,53,0.4)',
      text: '#fff2e6',
      textSecondary: 'rgba(255,242,230,0.9)',
      textMuted: 'rgba(255,242,230,0.7)',
      cardBackground: 'rgba(20,5,0,0.8)',
      cardBorder: 'rgba(255,107,53,0.3)'
    },
    shadows: {
      card: '0 8px 32px rgba(255,107,53,0.2)',
      popup: '0 20px 60px rgba(255,107,53,0.4)',
      glow: '0 0 30px rgba(247,147,30,0.5)'
    }
  },
  
  ocean: {
    id: 'ocean',
    name: 'Ocean Depth',
    description: 'Cool blue theme inspired by ocean depths',
    colors: {
      primary: '#0ea5e9',
      accent: '#06b6d4',
      background: 'rgba(0,15,30,0.95)',
      backgroundGradient: 'linear-gradient(135deg, rgba(0,15,30,0.95) 0%, rgba(5,25,45,0.98) 50%, rgba(0,15,30,0.95) 100%)',
      border: 'rgba(14,165,233,0.4)',
      text: '#e0f7ff',
      textSecondary: 'rgba(224,247,255,0.9)',
      textMuted: 'rgba(224,247,255,0.7)',
      cardBackground: 'rgba(0,15,30,0.8)',
      cardBorder: 'rgba(14,165,233,0.3)'
    },
    shadows: {
      card: '0 8px 32px rgba(14,165,233,0.2)',
      popup: '0 20px 60px rgba(14,165,233,0.4)',
      glow: '0 0 30px rgba(6,182,212,0.5)'
    }
  },
  
  forest: {
    id: 'forest',
    name: 'Forest Grove',
    description: 'Natural green theme with earthy tones',
    colors: {
      primary: '#10b981',
      accent: '#059669',
      background: 'rgba(5,20,5,0.95)',
      backgroundGradient: 'linear-gradient(135deg, rgba(5,20,5,0.95) 0%, rgba(15,35,15,0.98) 50%, rgba(5,20,5,0.95) 100%)',
      border: 'rgba(16,185,129,0.4)',
      text: '#ecfdf5',
      textSecondary: 'rgba(236,253,245,0.9)',
      textMuted: 'rgba(236,253,245,0.7)',
      cardBackground: 'rgba(5,20,5,0.8)',
      cardBorder: 'rgba(16,185,129,0.3)'
    },
    shadows: {
      card: '0 8px 32px rgba(16,185,129,0.2)',
      popup: '0 20px 60px rgba(16,185,129,0.4)',
      glow: '0 0 30px rgba(5,150,105,0.5)'
    }
  }
}

export const OVERLAY_SIZES = {
  compact: {
    id: 'compact',
    name: 'Compact',
    description: 'Small size for corner placement',
    scale: 0.8,
    padding: '12px',
    fontSize: '14px',
    borderRadius: '8px'
  },
  
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Default size for most setups',
    scale: 1.0,
    padding: '16px',
    fontSize: '16px',
    borderRadius: '12px'
  },
  
  large: {
    id: 'large',
    name: 'Large',
    description: 'Larger size for prominent display',
    scale: 1.2,
    padding: '20px',
    fontSize: '18px',
    borderRadius: '16px'
  },
  
  xl: {
    id: 'xl',
    name: 'Extra Large',
    description: 'Maximum size for main focus',
    scale: 1.5,
    padding: '24px',
    fontSize: '20px',
    borderRadius: '20px'
  }
}

class ThemeManager {
  constructor() {
    this.currentTheme = 'default'
    this.currentSize = 'standard'
    this.customThemes = new Map()
    this.loadSettings()
  }

  // Load theme settings from localStorage
  loadSettings() {
    try {
      const settings = localStorage.getItem('overlayThemeSettings')
      if (settings) {
        const parsed = JSON.parse(settings)
        this.currentTheme = parsed.theme || 'default'
        this.currentSize = parsed.size || 'standard'
        
        // Load custom themes
        if (parsed.customThemes) {
          parsed.customThemes.forEach(theme => {
            this.customThemes.set(theme.id, theme)
          })
        }
      }
    } catch (error) {
      console.warn('ThemeManager: Failed to load settings:', error)
    }
  }

  // Save theme settings to localStorage
  saveSettings() {
    try {
      const settings = {
        theme: this.currentTheme,
        size: this.currentSize,
        customThemes: Array.from(this.customThemes.values())
      }
      localStorage.setItem('overlayThemeSettings', JSON.stringify(settings))
    } catch (error) {
      console.warn('ThemeManager: Failed to save settings:', error)
    }
  }

  // Get current theme object
  getCurrentTheme() {
    return this.getTheme(this.currentTheme)
  }

  // Get theme by ID
  getTheme(themeId) {
    if (this.customThemes.has(themeId)) {
      return this.customThemes.get(themeId)
    }
    return OVERLAY_THEMES[themeId] || OVERLAY_THEMES.default
  }

  // Get current size object
  getCurrentSize() {
    return OVERLAY_SIZES[this.currentSize] || OVERLAY_SIZES.standard
  }

  // Get all available themes
  getAllThemes() {
    const themes = { ...OVERLAY_THEMES }
    this.customThemes.forEach((theme, id) => {
      themes[id] = theme
    })
    return themes
  }

  // Set current theme
  setTheme(themeId) {
    if (OVERLAY_THEMES[themeId] || this.customThemes.has(themeId)) {
      this.currentTheme = themeId
      this.saveSettings()
      this.applyTheme()
      return true
    }
    return false
  }

  // Set current size
  setSize(sizeId) {
    if (OVERLAY_SIZES[sizeId]) {
      this.currentSize = sizeId
      this.saveSettings()
      this.applyTheme()
      return true
    }
    return false
  }

  // Apply current theme to document
  applyTheme() {
    const theme = this.getCurrentTheme()
    const size = this.getCurrentSize()
    const root = document.documentElement

    // Apply theme colors as CSS custom properties
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value)
    })

    // Apply theme shadows
    Object.entries(theme.shadows).forEach(([key, value]) => {
      root.style.setProperty(`--theme-shadow-${key}`, value)
    })

    // Apply size properties
    root.style.setProperty('--overlay-scale', size.scale)
    root.style.setProperty('--overlay-padding', size.padding)
    root.style.setProperty('--overlay-font-size', size.fontSize)
    root.style.setProperty('--overlay-border-radius', size.borderRadius)

    // Set theme class on body
    document.body.className = document.body.className.replace(/theme-\w+/g, '')
    document.body.classList.add(`theme-${this.currentTheme}`)
    document.body.classList.add(`size-${this.currentSize}`)

    console.log(`ThemeManager: Applied theme "${theme.name}" with size "${size.name}"`)
  }

  // Create custom theme
  createCustomTheme(themeData) {
    if (!themeData.id || !themeData.name) {
      throw new Error('Theme must have id and name')
    }

    const customTheme = {
      ...themeData,
      isCustom: true,
      createdAt: Date.now()
    }

    this.customThemes.set(themeData.id, customTheme)
    this.saveSettings()
    return customTheme
  }

  // Delete custom theme
  deleteCustomTheme(themeId) {
    if (this.customThemes.has(themeId)) {
      this.customThemes.delete(themeId)
      
      // Switch to default if current theme was deleted
      if (this.currentTheme === themeId) {
        this.setTheme('default')
      }
      
      this.saveSettings()
      return true
    }
    return false
  }

  // Get theme preview CSS
  getThemePreviewCSS(themeId) {
    const theme = this.getTheme(themeId)
    return `
      .theme-preview-${themeId} {
        background: ${theme.colors.background};
        border: 1px solid ${theme.colors.border};
        color: ${theme.colors.text};
        box-shadow: ${theme.shadows.card};
      }
      .theme-preview-${themeId} .primary {
        color: ${theme.colors.primary};
      }
      .theme-preview-${themeId} .accent {
        color: ${theme.colors.accent};
      }
    `
  }

  // Initialize theme manager
  initialize() {
    this.applyTheme()
    
    // Watch for system theme changes
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
      darkModeQuery.addEventListener('change', (e) => {
        console.log('ThemeManager: System theme changed to', e.matches ? 'dark' : 'light')
      })
    }
  }
}

// Global instance
const themeManager = new ThemeManager()

export default themeManager