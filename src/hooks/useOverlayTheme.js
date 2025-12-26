import React from 'react'

const THEMES = {
  bamboo: {
    brand: '#5ecf86',
    accent: '#ffffff',
    text: '#f0fdf4',
    card: 'rgba(8, 12, 10, 0.75)',
    border: 'rgba(94, 207, 134, 0.2)',
    shadow: '0 16px 34px rgba(0,0,0,0.5)',
    background: 'radial-gradient(120% 120% at 20% 0%, rgba(94, 207, 134, 0.15), rgba(8, 12, 10, 0.85) 45%, rgba(5, 6, 5, 0.98))'
  },
  midnight: {
    brand: '#7dd3fc',
    accent: '#22d3ee',
    text: '#e7f2ff',
    card: 'rgba(10, 14, 24, 0.6)',
    border: 'rgba(120, 160, 255, 0.22)',
    shadow: '0 16px 34px rgba(0,0,0,0.55)',
    background: 'radial-gradient(120% 120% at 10% 0%, rgba(40, 90, 140, 0.18), rgba(8, 12, 22, 0.75) 50%, rgba(5, 8, 16, 0.95))'
  },
  minimal: {
    brand: '#e5e7eb',
    accent: '#9ca3af',
    text: '#f9fafb',
    card: 'rgba(15, 15, 15, 0.6)',
    border: 'rgba(255, 255, 255, 0.18)',
    shadow: '0 14px 28px rgba(0,0,0,0.45)',
    background: 'rgba(0,0,0,0.45)'
  },
  cyberpunk: {
    brand: '#00ff88',
    accent: '#44aaff',
    text: '#e9fff4',
    card: 'rgba(6, 14, 18, 0.6)',
    border: 'rgba(0, 255, 136, 0.22)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95) 0%, rgba(0, 8, 17, 0.98) 50%, rgba(0, 0, 0, 0.99) 100%)'
  },
  neon: {
    brand: '#ff5ac8',
    accent: '#7c5cff',
    text: '#f9eaff',
    card: 'rgba(26, 10, 46, 0.6)',
    border: 'rgba(255, 90, 200, 0.22)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(42, 8, 69, 0.95) 0%, rgba(26, 10, 46, 0.98) 50%, rgba(15, 5, 32, 0.99) 100%)'
  },
  quantum: {
    brand: '#6ee7ff',
    accent: '#a78bfa',
    text: '#eef7ff',
    card: 'rgba(15, 20, 35, 0.6)',
    border: 'rgba(110, 231, 255, 0.2)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(15, 25, 53, 0.95) 0%, rgba(15, 15, 35, 0.98) 50%, rgba(2, 2, 8, 0.99) 100%)'
  },
  gaming: {
    brand: '#ffd166',
    accent: '#ef476f',
    text: '#fff6e0',
    card: 'rgba(18, 12, 10, 0.6)',
    border: 'rgba(255, 209, 102, 0.24)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(28, 16, 12, 0.95) 0%, rgba(12, 8, 6, 0.98) 50%, rgba(5, 3, 2, 0.99) 100%)'
  }
}

function hexToRgb(value) {
  const hex = String(value || '').replace('#', '')
  if (hex.length !== 6) return null
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if ([r, g, b].some(n => Number.isNaN(n))) return null
  return `${r}, ${g}, ${b}`
}

export function useOverlayTheme(theme, clean, overrides = {}) {
  React.useEffect(() => {
    const body = document.body
    const themeName = theme && THEMES[theme] ? theme : 'bamboo'
    const preset = THEMES[themeName]
    const brand = overrides.brandColor || preset.brand
    const accent = overrides.accentColor || preset.accent
    const text = overrides.textColor || preset.text
    const brandRgb = hexToRgb(brand) || '94, 207, 134'
    const accentRgb = hexToRgb(accent) || '102, 183, 255'

    const themeClasses = Object.keys(THEMES).map(key => `overlay-theme-${key}`)
    themeClasses.forEach(cls => body.classList.remove(cls))
    body.classList.add(`overlay-theme-${themeName}`)

    if (clean) body.classList.add('overlay-clean')
    else body.classList.remove('overlay-clean')

    body.style.setProperty('--brand', brand)
    body.style.setProperty('--accent', accent)
    body.style.setProperty('--brand-rgb', brandRgb)
    body.style.setProperty('--accent-rgb', accentRgb)
    body.style.setProperty('--theme-text', text)
    body.style.setProperty('--theme-cardBackground', preset.card)
    body.style.setProperty('--theme-cardBorder', preset.border)
    body.style.setProperty('--theme-shadow-card', preset.shadow)
    body.style.setProperty('--overlay-bg', preset.background)
    body.style.setProperty('font-family', '\'Bricolage Grotesque\', \'Manrope\', system-ui, sans-serif')

    return () => {
      themeClasses.forEach(cls => body.classList.remove(cls))
      body.classList.remove('overlay-clean')
      body.style.removeProperty('--brand')
      body.style.removeProperty('--accent')
      body.style.removeProperty('--brand-rgb')
      body.style.removeProperty('--accent-rgb')
      body.style.removeProperty('--theme-text')
      body.style.removeProperty('--theme-cardBackground')
      body.style.removeProperty('--theme-cardBorder')
      body.style.removeProperty('--theme-shadow-card')
      body.style.removeProperty('--overlay-bg')
      body.style.removeProperty('font-family')
    }
  }, [theme, clean, overrides.brandColor, overrides.accentColor, overrides.textColor])
}
