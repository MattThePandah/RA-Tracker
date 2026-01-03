import React from 'react'

const THEMES = {
  bamboo: {
    mode: 'dark',
    brand: '#5ecf86',
    accent: '#ffffff',
    text: '#f0fdf4',
    card: 'rgba(8, 12, 10, 0.75)',
    border: 'rgba(94, 207, 134, 0.2)',
    shadow: '0 16px 34px rgba(0,0,0,0.5)',
    background: 'radial-gradient(120% 120% at 20% 0%, rgba(94, 207, 134, 0.15), rgba(8, 12, 10, 0.85) 45%, rgba(5, 6, 5, 0.98))'
  },
  'bamboo-light': {
    mode: 'light',
    brand: '#3fe19e',
    accent: '#28a1fe',
    text: '#1a1c1b',
    card: 'rgba(255, 255, 255, 0.9)',
    border: 'rgba(63, 225, 158, 0.25)',
    shadow: '0 18px 36px rgba(14, 24, 20, 0.15)',
    background: 'radial-gradient(120% 120% at 20% 0%, rgba(86, 198, 214, 0.2), rgba(228, 235, 240, 0.96) 45%, rgba(205, 215, 222, 0.98))',
    stage: {
      bg: 'radial-gradient(120% 120% at 20% 0%, rgba(86, 198, 214, 0.22), rgba(223, 231, 236, 0.98) 45%, rgba(198, 209, 216, 0.99))',
      border: 'rgba(63, 225, 158, 0.35)',
      shadow: '0 20px 50px rgba(18, 40, 28, 0.18)',
      sheen: 'linear-gradient(140deg, rgba(255,255,255,0.7), rgba(255,255,255,0) 45%)',
      sheenOpacity: '0.65',
      guideBorder: 'rgba(26, 28, 27, 0.2)',
      guideBg: 'rgba(26, 28, 27, 0.04)',
      guideText: 'rgba(26, 28, 27, 0.6)',
      labelBg: 'rgba(255, 255, 255, 0.7)',
      labelText: 'rgba(26, 28, 27, 0.8)'
    }
  },
  panda: {
    mode: 'light',
    brand: '#3fdc9b',
    accent: '#1e9b8a',
    text: '#1c1f1f',
    card: 'rgba(255, 255, 255, 0.92)',
    border: 'rgba(28, 31, 31, 0.12)',
    shadow: '0 18px 36px rgba(14, 24, 20, 0.16)',
    background: 'transparent',
    stage: {
      bg: 'radial-gradient(120% 120% at 20% 0%, rgba(109, 189, 188, 0.22), rgba(223, 229, 234, 0.98) 45%, rgba(200, 208, 214, 0.99))',
      border: 'rgba(28, 31, 31, 0.2)',
      shadow: '0 18px 48px rgba(18, 40, 28, 0.16)',
      sheen: 'linear-gradient(140deg, rgba(255,255,255,0.6), rgba(255,255,255,0) 45%)',
      sheenOpacity: '0.55',
      guideBorder: 'rgba(26, 28, 27, 0.2)',
      guideBg: 'rgba(26, 28, 27, 0.04)',
      guideText: 'rgba(26, 28, 27, 0.6)',
      labelBg: 'rgba(255, 255, 255, 0.7)',
      labelText: 'rgba(26, 28, 27, 0.8)'
    }
  },
  midnight: {
    mode: 'dark',
    brand: '#7dd3fc',
    accent: '#22d3ee',
    text: '#e7f2ff',
    card: 'rgba(10, 14, 24, 0.6)',
    border: 'rgba(120, 160, 255, 0.22)',
    shadow: '0 16px 34px rgba(0,0,0,0.55)',
    background: 'radial-gradient(120% 120% at 10% 0%, rgba(40, 90, 140, 0.18), rgba(8, 12, 22, 0.75) 50%, rgba(5, 8, 16, 0.95))'
  },
  minimal: {
    mode: 'dark',
    brand: '#e5e7eb',
    accent: '#9ca3af',
    text: '#f9fafb',
    card: 'rgba(15, 15, 15, 0.6)',
    border: 'rgba(255, 255, 255, 0.18)',
    shadow: '0 14px 28px rgba(0,0,0,0.45)',
    background: 'rgba(0,0,0,0.45)'
  },
  cyberpunk: {
    mode: 'dark',
    brand: '#00ff88',
    accent: '#44aaff',
    text: '#e9fff4',
    card: 'rgba(6, 14, 18, 0.6)',
    border: 'rgba(0, 255, 136, 0.22)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95) 0%, rgba(0, 8, 17, 0.98) 50%, rgba(0, 0, 0, 0.99) 100%)'
  },
  neon: {
    mode: 'dark',
    brand: '#ff5ac8',
    accent: '#7c5cff',
    text: '#f9eaff',
    card: 'rgba(26, 10, 46, 0.6)',
    border: 'rgba(255, 90, 200, 0.22)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(42, 8, 69, 0.95) 0%, rgba(26, 10, 46, 0.98) 50%, rgba(15, 5, 32, 0.99) 100%)'
  },
  quantum: {
    mode: 'dark',
    brand: '#6ee7ff',
    accent: '#a78bfa',
    text: '#eef7ff',
    card: 'rgba(15, 20, 35, 0.6)',
    border: 'rgba(110, 231, 255, 0.2)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(15, 25, 53, 0.95) 0%, rgba(15, 15, 35, 0.98) 50%, rgba(2, 2, 8, 0.99) 100%)'
  },
  gaming: {
    mode: 'dark',
    brand: '#ffd166',
    accent: '#ef476f',
    text: '#fff6e0',
    card: 'rgba(18, 12, 10, 0.6)',
    border: 'rgba(255, 209, 102, 0.24)',
    shadow: '0 18px 36px rgba(0,0,0,0.6)',
    background: 'linear-gradient(135deg, rgba(28, 16, 12, 0.95) 0%, rgba(12, 8, 6, 0.98) 50%, rgba(5, 3, 2, 0.99) 100%)'
  }
}

const DEFAULT_STAGE = {
  bg: 'radial-gradient(120% 120% at 20% 0%, rgba(var(--brand-rgb), 0.18), rgba(6, 10, 12, 0.9) 45%, rgba(4, 6, 8, 0.98))',
  border: 'rgba(255,255,255,0.12)',
  shadow: '0 26px 60px rgba(0,0,0,0.6)',
  sheen: 'linear-gradient(140deg, rgba(255,255,255,0.08), transparent 45%)',
  sheenOpacity: '0.5',
  guideBorder: 'rgba(255,255,255,0.25)',
  guideBg: 'rgba(255,255,255,0.03)',
  guideText: 'rgba(255,255,255,0.7)',
  labelBg: 'rgba(0,0,0,0.55)',
  labelText: 'rgba(255,255,255,0.85)'
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

function isLightColor(value) {
  const rgb = hexToRgb(value)
  if (!rgb) return false
  const parts = rgb.split(',').map(part => Number(part.trim()))
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return false
  const [r, g, b] = parts
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150
}

export function useOverlayTheme(theme, clean, overrides = {}) {
  React.useEffect(() => {
    const body = document.body
    const themeName = theme && THEMES[theme] ? theme : 'bamboo'
    const preset = THEMES[themeName]
    const brand = overrides.brandColor || preset.brand
    const accent = overrides.accentColor || preset.accent
    const mode = preset.mode || 'dark'
    const preferTextOverride = overrides.textColor && (mode !== 'light' || !isLightColor(overrides.textColor))
    const text = preferTextOverride ? overrides.textColor : preset.text
    const brandRgb = hexToRgb(brand) || '94, 207, 134'
    const accentRgb = hexToRgb(accent) || '102, 183, 255'
    const stage = { ...DEFAULT_STAGE, ...(preset.stage || {}) }

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
    body.style.setProperty('--overlay-stage-bg', stage.bg)
    body.style.setProperty('--overlay-stage-border', stage.border)
    body.style.setProperty('--overlay-stage-shadow', stage.shadow)
    body.style.setProperty('--overlay-stage-sheen', stage.sheen)
    body.style.setProperty('--overlay-stage-sheen-opacity', stage.sheenOpacity)
    body.style.setProperty('--overlay-guide-border', stage.guideBorder)
    body.style.setProperty('--overlay-guide-bg', stage.guideBg)
    body.style.setProperty('--overlay-guide-text', stage.guideText)
    body.style.setProperty('--overlay-guide-label-bg', stage.labelBg)
    body.style.setProperty('--overlay-guide-label-text', stage.labelText)
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
      body.style.removeProperty('--overlay-stage-bg')
      body.style.removeProperty('--overlay-stage-border')
      body.style.removeProperty('--overlay-stage-shadow')
      body.style.removeProperty('--overlay-stage-sheen')
      body.style.removeProperty('--overlay-stage-sheen-opacity')
      body.style.removeProperty('--overlay-guide-border')
      body.style.removeProperty('--overlay-guide-bg')
      body.style.removeProperty('--overlay-guide-text')
      body.style.removeProperty('--overlay-guide-label-bg')
      body.style.removeProperty('--overlay-guide-label-text')
      body.style.removeProperty('font-family')
    }
  }, [theme, clean, overrides.brandColor, overrides.accentColor, overrides.textColor])
}
