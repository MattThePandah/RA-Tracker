const DEFAULT_SITE_THEME = {
  admin: {
    brand: '#3FE19E',
    accent: '#28A1FE',
    bg: '#080a09',
    panel: '#141816',
    panel2: '#0c0e0d',
    text: '#f0fdf4',
    muted: 'rgba(240, 253, 244, 0.6)',
    border: 'rgba(63, 225, 158, 0.15)'
  },
  public: {
    bg: '#060807',
    bgDark: '#050605',
    bg2: '#0b120d',
    text: '#f0fdf4',
    muted: 'rgba(240, 253, 244, 0.65)',
    primary: '#3FE19E',
    accent: '#28A1FE',
    lime: '#9dff6d',
    card: 'rgba(12, 16, 14, 0.88)',
    border: 'rgba(63, 225, 158, 0.18)',
    nav: 'rgba(6, 8, 7, 0.85)',
    shadow: '0 24px 50px rgba(0, 0, 0, 0.55)',
    soft: 'rgba(255, 255, 255, 0.04)',
    font: 'Manrope, system-ui, sans-serif',
    radius: '12px'
  }
}

const SITE_THEME_PRESETS = [
  {
    id: 'bamboo',
    label: 'Bamboo Dark (Panda)',
    theme: DEFAULT_SITE_THEME
  },
  {
    id: 'bamboo-light',
    label: 'Bamboo Light (Panda)',
    theme: {
      admin: {
        brand: '#3FE19E',
        accent: '#28A1FE',
        bg: '#f0f4f2',
        panel: '#ffffff',
        panel2: '#e6ede9',
        text: '#1a1c1b',
        muted: 'rgba(26, 28, 27, 0.6)',
        border: 'rgba(63, 225, 158, 0.25)'
      },
      public: {
        bg: '#fdfdfd',
        bgDark: '#f4f7f5',
        bg2: '#d9e4df',
        text: '#1a1c1b',
        muted: 'rgba(26, 28, 27, 0.75)',
        primary: '#3FE19E',
        accent: '#28A1FE',
        lime: '#34d399',
        card: 'rgba(255, 255, 255, 0.96)',
        border: 'rgba(63, 225, 158, 0.25)',
        nav: 'rgba(255, 255, 255, 0.92)',
        shadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
        soft: 'rgba(0, 0, 0, 0.05)',
        font: 'Manrope, system-ui, sans-serif',
        radius: '16px'
      }
    }
  },
  {
    id: 'neon-arcade',
    label: 'Neon Arcade',
    theme: {
      admin: {
        brand: '#00e5ff',
        accent: '#ff3d81',
        bg: '#07080c',
        panel: '#0e1118',
        panel2: '#0a0d12',
        text: '#f4f7ff',
        muted: 'rgba(244, 247, 255, 0.6)',
        border: 'rgba(0, 229, 255, 0.18)'
      },
      public: {
        bg: '#05070d',
        bgDark: '#03050a',
        bg2: '#0b1020',
        text: '#f5f7ff',
        muted: 'rgba(245, 247, 255, 0.65)',
        primary: '#00e5ff',
        accent: '#ff3d81',
        lime: '#7dffb3',
        card: 'rgba(9, 13, 24, 0.9)',
        border: 'rgba(0, 229, 255, 0.15)',
        nav: 'rgba(5, 8, 14, 0.86)',
        shadow: '0 30px 50px rgba(0, 0, 0, 0.6)',
        soft: 'rgba(255, 255, 255, 0.04)',
        font: 'Manrope, system-ui, sans-serif',
        radius: '14px'
      }
    }
  },
  {
    id: 'crimson-stream',
    label: 'Crimson Stream',
    theme: {
      admin: {
        brand: '#ff6b4a',
        accent: '#ffd166',
        bg: '#0b0707',
        panel: '#151010',
        panel2: '#120c0c',
        text: '#fff5f2',
        muted: 'rgba(255, 245, 242, 0.6)',
        border: 'rgba(255, 107, 74, 0.2)'
      },
      public: {
        bg: '#0b0606',
        bgDark: '#090404',
        bg2: '#1a0f12',
        text: '#fff5f2',
        muted: 'rgba(255, 245, 242, 0.6)',
        primary: '#ff6b4a',
        accent: '#ffd166',
        lime: '#7fe3b0',
        card: 'rgba(18, 10, 12, 0.9)',
        border: 'rgba(255, 107, 74, 0.2)',
        nav: 'rgba(11, 6, 6, 0.85)',
        shadow: '0 30px 50px rgba(0, 0, 0, 0.6)',
        soft: 'rgba(255, 255, 255, 0.04)',
        font: 'Manrope, system-ui, sans-serif',
        radius: '14px'
      }
    }
  },
  {
    id: 'deep-ocean',
    label: 'Deep Ocean',
    theme: {
      admin: {
        brand: '#4cc9f0',
        accent: '#e0f2fe',
        bg: '#060b16',
        panel: '#0b1322',
        panel2: '#0a0f1c',
        text: '#eef6ff',
        muted: 'rgba(238, 246, 255, 0.6)',
        border: 'rgba(76, 201, 240, 0.18)'
      },
      public: {
        bg: '#050b16',
        bgDark: '#040910',
        bg2: '#0c1932',
        text: '#eef6ff',
        muted: 'rgba(238, 246, 255, 0.65)',
        primary: '#4cc9f0',
        accent: '#9dff6d',
        lime: '#7dd3fc',
        card: 'rgba(10, 17, 32, 0.9)',
        border: 'rgba(76, 201, 240, 0.18)',
        nav: 'rgba(5, 11, 22, 0.85)',
        shadow: '0 30px 50px rgba(0, 0, 0, 0.6)',
        soft: 'rgba(255, 255, 255, 0.04)',
        font: 'Manrope, system-ui, sans-serif',
        radius: '14px'
      }
    }
  }
]

const ADMIN_KEYS = [
  'brand',
  'accent',
  'bg',
  'panel',
  'panel2',
  'text',
  'muted',
  'border'
]

const PUBLIC_KEYS = [
  'bg',
  'bgDark',
  'bg2',
  'text',
  'muted',
  'primary',
  'accent',
  'lime',
  'card',
  'border',
  'nav',
  'shadow',
  'soft',
  'font',
  'radius'
]

function cleanValue(value, fallback, maxLen = 160) {
  if (value === null || value === undefined) return fallback
  const next = String(value).trim()
  if (!next) return fallback
  return next.length > maxLen ? next.slice(0, maxLen) : next
}

function hexToRgb(value) {
  const hex = String(value || '').trim()
  if (!hex.startsWith('#')) return null
  const raw = hex.slice(1)
  if (raw.length !== 3 && raw.length !== 6) return null
  const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw
  const num = Number.parseInt(full, 16)
  if (!Number.isFinite(num)) return null
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `${r}, ${g}, ${b}`
}

function applyVars(target, vars) {
  if (!target) return
  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue
    target.style.setProperty(key, value)
  }
}

export function normalizeSiteTheme(raw, base = DEFAULT_SITE_THEME) {
  const next = raw || {}
  const adminBase = base.admin || DEFAULT_SITE_THEME.admin
  const publicBase = base.public || DEFAULT_SITE_THEME.public
  const adminInput = next.admin || {}
  const publicInput = next.public || {}

  const admin = {}
  for (const key of ADMIN_KEYS) {
    admin[key] = cleanValue(adminInput[key], adminBase[key], 120)
  }

  const publicTheme = {}
  for (const key of PUBLIC_KEYS) {
    const limit = key === 'font' ? 200 : 160
    publicTheme[key] = cleanValue(publicInput[key], publicBase[key], limit)
  }

  return { admin, public: publicTheme }
}

export function getSiteThemePresetId(theme) {
  const normalized = normalizeSiteTheme(theme, DEFAULT_SITE_THEME)
  const isCheckAdmin = !!theme?.admin
  const isCheckPublic = !!theme?.public

  for (const preset of SITE_THEME_PRESETS) {
    const presetNormalized = normalizeSiteTheme(preset.theme, DEFAULT_SITE_THEME)
    
    let match = true
    if (isCheckAdmin) {
      if (JSON.stringify(presetNormalized.admin) !== JSON.stringify(normalized.admin)) match = false
    }
    if (isCheckPublic) {
      if (JSON.stringify(presetNormalized.public) !== JSON.stringify(normalized.public)) match = false
    }
    
    if (match) return preset.id
  }
  return 'custom'
}

export function getSiteThemePreset(presetId) {
  return SITE_THEME_PRESETS.find(preset => preset.id === presetId) || null
}

export function cloneSiteTheme(theme = DEFAULT_SITE_THEME) {
  const normalized = normalizeSiteTheme(theme, DEFAULT_SITE_THEME)
  return {
    admin: { ...normalized.admin },
    public: { ...normalized.public }
  }
}

export function isLight(color) {
  if (!color) return false
  const s = String(color).trim().toLowerCase()
  
  let r = 0, g = 0, b = 0

  if (s.startsWith('#')) {
    const raw = s.slice(1)
    const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw
    const num = parseInt(full, 16)
    r = (num >> 16) & 255
    g = (num >> 8) & 255
    b = num & 255
  } else if (s.startsWith('rgb')) {
    const match = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      r = parseInt(match[1])
      g = parseInt(match[2])
      b = parseInt(match[3])
    }
  } else {
    return false
  }

  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 140 // Adjusted threshold for better light mode detection
}

export function applySiteTheme(rawTheme) {
  if (typeof document === 'undefined') return
  const theme = normalizeSiteTheme(rawTheme, DEFAULT_SITE_THEME)
  
  // Apply Admin Theme
  const adminVars = {
    '--brand': theme.admin.brand,
    '--accent': theme.admin.accent,
    '--admin-bg': theme.admin.bg,
    '--admin-panel': theme.admin.panel,
    '--admin-panel-2': theme.admin.panel2,
    '--admin-ink': theme.admin.text,
    '--admin-muted': theme.admin.muted,
    '--admin-border': theme.admin.border
  }

  const adminTarget = document.querySelector('.admin-shell')
  if (adminTarget) {
    applyVars(adminTarget, adminVars)
    const brandRgb = hexToRgb(theme.admin.brand)
    if (brandRgb) adminTarget.style.setProperty('--brand-rgb', brandRgb)
    const accentRgb = hexToRgb(theme.admin.accent)
    if (accentRgb) adminTarget.style.setProperty('--accent-rgb', accentRgb)
  }

  // Apply Public Theme (to root or specific container)
  const publicVars = {
    '--pub-bg': theme.public.bg,
    '--pub-bg-dark': theme.public.bgDark,
    '--pub-bg-2': theme.public.bg2,
    '--pub-text': theme.public.text,
    '--pub-muted': theme.public.muted,
    '--pub-primary': theme.public.primary,
    '--pub-accent': theme.public.accent,
    '--pub-lime': theme.public.lime,
    '--pub-card-bg': theme.public.card,
    '--pub-card-border': theme.public.border,
    '--pub-nav-bg': theme.public.nav,
    '--pub-font': theme.public.font,
    '--pub-radius': theme.public.radius,
    '--pub-shadow': theme.public.shadow,
    '--pub-soft': theme.public.soft,
    // Legacy mapping support
    '--public-ink': theme.public.text,
    '--public-bg': theme.public.bg,
    '--public-accent': theme.public.accent
  }

  const publicPrimaryRgb = hexToRgb(theme.public.primary)
  const publicAccentRgb = hexToRgb(theme.public.accent)
  const publicBgRgb = hexToRgb(theme.public.bg)
  
  if (publicPrimaryRgb) publicVars['--pub-primary-rgb'] = publicPrimaryRgb
  if (publicAccentRgb) publicVars['--pub-accent-rgb'] = publicAccentRgb
  if (publicBgRgb) publicVars['--pub-bg-rgb'] = publicBgRgb

  const root = document.documentElement
  const pubTarget = document.querySelector('.pub-shell')
  
  // Apply to root for globals like font
  root.style.setProperty('--pub-font', theme.public.font)
  
  if (pubTarget) {
    applyVars(pubTarget, publicVars)
  } else {
    // If not on public page, still apply to root so preview works
    applyVars(root, publicVars)
  }
}

export { DEFAULT_SITE_THEME, SITE_THEME_PRESETS }
