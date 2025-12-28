import React from 'react'
import { fetchAdminSettings, updateAdminSettings, fetchPublicGames } from '../services/publicApi.js'
import { applySiteTheme, cloneSiteTheme, SITE_THEME_PRESETS, getSiteThemePreset, getSiteThemePresetId } from '../utils/siteTheme.js'

const DEFAULT_SITE = {
  title: 'Pannboo',
  tagline: 'Bamboo-themed RetroAchievements creator hub.',
  heroTitle: 'Live retro journeys, one achievement at a time.',
  heroSubtitle: 'Track the backlog, read the reviews, and influence what I play next.',
  ctaLabel: 'Watch Live',
  ctaUrl: '',
  aboutTitle: 'About Pannboo',
  aboutText: '',
  scheduleText: '',
  twitchChannel: '',
  twitchUrl: '',
  youtubeChannelId: '',
  youtubeUrl: '',
  youtubeUploadsLimit: 3,
  showTwitch: true,
  showYouTube: true,
  showSchedule: true,
  showSuggestions: true,
  showPlanned: true,
  showCompleted: true,
  showFeatured: true,
  showAbout: true,
  showLinks: true,
  featuredGameId: '',
  heroImage: '',
  characterImage: '',
  logoImage: '',
  links: [],
  theme: cloneSiteTheme()
}

export default function PublicSite() {
  const [site, setSite] = React.useState({ ...DEFAULT_SITE })
  const [games, setGames] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [adminPresetId, setAdminPresetId] = React.useState('custom')
  const [publicPresetId, setPublicPresetId] = React.useState('custom')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [settingsData, gamesData] = await Promise.all([
        fetchAdminSettings(),
        fetchPublicGames()
      ])
      const nextSite = { ...DEFAULT_SITE, ...(settingsData.site || {}) }
      setSite(nextSite)
      setAdminPresetId(getSiteThemePresetId({ admin: nextSite.theme?.admin }))
      setPublicPresetId(getSiteThemePresetId({ public: nextSite.theme?.public }))
      setGames(gamesData.games || [])
    } catch (err) {
      setError('Failed to load public site settings.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    load()
  }, [])

  const updateField = (key, value) => {
    setSite(prev => ({ ...prev, [key]: value }))
  }

  const updateTheme = (section, key, value) => {
    setSite(prev => {
      const theme = { ...(prev.theme || {}) }
      const nextSection = { ...(theme[section] || {}) }
      nextSection[key] = value
      theme[section] = nextSection
      return { ...prev, theme }
    })
    if (section === 'admin') setAdminPresetId('custom')
    if (section === 'public') setPublicPresetId('custom')
  }

  const updateLink = (index, field, value) => {
    setSite(prev => {
      const links = [...(prev.links || [])]
      links[index] = { ...(links[index] || {}), [field]: value }
      return { ...prev, links }
    })
  }

  const addLink = () => {
    setSite(prev => ({ ...prev, links: [...(prev.links || []), { label: '', url: '', kind: '' }] }))
  }

  const removeLink = (index) => {
    setSite(prev => {
      const links = [...(prev.links || [])]
      links.splice(index, 1)
      return { ...prev, links }
    })
  }

  const onSave = async () => {
    setError('')
    setSaved(false)
    try {
      await updateAdminSettings({ site })
      applySiteTheme(site.theme)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError('Failed to save public site settings.')
    }
  }

  const completedGames = games.filter(g => g.publicStatus === 'Completed')
  const adminTheme = site.theme?.admin || {}
  const publicTheme = site.theme?.public || {}
  const presets = SITE_THEME_PRESETS

  const applyAdminPreset = (pid) => {
    setAdminPresetId(pid)
    const preset = getSiteThemePreset(pid)
    if (!preset) return
    setSite(prev => ({
      ...prev,
      theme: {
        ...(prev.theme || {}),
        admin: { ...(preset.theme.admin || {}) }
      }
    }))
  }

  const applyPublicPreset = (pid) => {
    setPublicPresetId(pid)
    const preset = getSiteThemePreset(pid)
    if (!preset) return
    setSite(prev => ({
      ...prev,
      theme: {
        ...(prev.theme || {}),
        public: { ...(preset.theme.public || {}) }
      }
    }))
  }

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="me-auto">
          <h2 className="h4 mb-0">Public Site</h2>
          <div className="text-secondary small">Control the public-facing Pannboo homepage.</div>
        </div>
        <button className="btn btn-sm btn-outline-light" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {saved && <div className="alert alert-success">Saved.</div>}

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Branding</h5>
            <div className="mb-2">
              <label className="form-label">Site Title</label>
              <input className="form-control" value={site.title} onChange={e => updateField('title', e.target.value)} />
            </div>
            <div className="mb-2">
              <label className="form-label">Tagline</label>
              <input className="form-control" value={site.tagline} onChange={e => updateField('tagline', e.target.value)} />
            </div>
            <div className="mb-2">
              <label className="form-label">Character/Avatar Image</label>
              <input className="form-control" value={site.characterImage} onChange={e => updateField('characterImage', e.target.value)} placeholder="e.g. mascot.png" />
            </div>
            <div className="mb-2">
              <label className="form-label">Navbar Logo Image</label>
              <input className="form-control" value={site.logoImage} onChange={e => updateField('logoImage', e.target.value)} placeholder="e.g. logo.png" />
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Theme Configuration</h5>
            <div className="row g-3">
              <div className="col-12 col-lg-6">
                <div className="fw-semibold mb-2">Admin UI Theme</div>
                <div className="row g-2 align-items-end mb-3">
                  <div className="col">
                    <select
                      className="form-select"
                      value={adminPresetId}
                      onChange={e => applyAdminPreset(e.target.value)}
                    >
                      <option value="custom">Custom / Current</option>
                      {presets.map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-sm-6">
                    <label className="form-label">Brand (Green)</label>
                    <input className="form-control" value={adminTheme.brand || ''} onChange={e => updateTheme('admin', 'brand', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Accent (Blue)</label>
                    <input className="form-control" value={adminTheme.accent || ''} onChange={e => updateTheme('admin', 'accent', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Background</label>
                    <input className="form-control" value={adminTheme.bg || ''} onChange={e => updateTheme('admin', 'bg', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Panel</label>
                    <input className="form-control" value={adminTheme.panel || ''} onChange={e => updateTheme('admin', 'panel', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Panel 2</label>
                    <input className="form-control" value={adminTheme.panel2 || ''} onChange={e => updateTheme('admin', 'panel2', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Text</label>
                    <input className="form-control" value={adminTheme.text || ''} onChange={e => updateTheme('admin', 'text', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Muted</label>
                    <input className="form-control" value={adminTheme.muted || ''} onChange={e => updateTheme('admin', 'muted', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Border</label>
                    <input className="form-control" value={adminTheme.border || ''} onChange={e => updateTheme('admin', 'border', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-6">
                <div className="fw-semibold mb-2">Public Site Theme</div>
                <div className="row g-2 align-items-end mb-3">
                  <div className="col">
                    <select
                      className="form-select"
                      value={publicPresetId}
                      onChange={e => applyPublicPreset(e.target.value)}
                    >
                      <option value="custom">Custom / Current</option>
                      {presets.map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-sm-6">
                    <label className="form-label">Background</label>
                    <input className="form-control" value={publicTheme.bg || ''} onChange={e => updateTheme('public', 'bg', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Background Dark</label>
                    <input className="form-control" value={publicTheme.bgDark || ''} onChange={e => updateTheme('public', 'bgDark', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Background 2</label>
                    <input className="form-control" value={publicTheme.bg2 || ''} onChange={e => updateTheme('public', 'bg2', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Text</label>
                    <input className="form-control" value={publicTheme.text || ''} onChange={e => updateTheme('public', 'text', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Muted</label>
                    <input className="form-control" value={publicTheme.muted || ''} onChange={e => updateTheme('public', 'muted', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Primary (Green)</label>
                    <input className="form-control" value={publicTheme.primary || ''} onChange={e => updateTheme('public', 'primary', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Accent (Blue)</label>
                    <input className="form-control" value={publicTheme.accent || ''} onChange={e => updateTheme('public', 'accent', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Lime</label>
                    <input className="form-control" value={publicTheme.lime || ''} onChange={e => updateTheme('public', 'lime', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Card</label>
                    <input className="form-control" value={publicTheme.card || ''} onChange={e => updateTheme('public', 'card', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Border</label>
                    <input className="form-control" value={publicTheme.border || ''} onChange={e => updateTheme('public', 'border', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Nav</label>
                    <input className="form-control" value={publicTheme.nav || ''} onChange={e => updateTheme('public', 'nav', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Shadow</label>
                    <input className="form-control" value={publicTheme.shadow || ''} onChange={e => updateTheme('public', 'shadow', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Soft</label>
                    <input className="form-control" value={publicTheme.soft || ''} onChange={e => updateTheme('public', 'soft', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Font</label>
                    <input className="form-control" value={publicTheme.font || ''} onChange={e => updateTheme('public', 'font', e.target.value)} />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Radius</label>
                    <input className="form-control" value={publicTheme.radius || ''} onChange={e => updateTheme('public', 'radius', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="text-secondary small mt-2">
              Theme values support hex or rgba strings. Admin and Public themes are now configured independently.
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Hero</h5>
            <div className="mb-2">
              <label className="form-label">Headline</label>
              <input className="form-control" value={site.heroTitle} onChange={e => updateField('heroTitle', e.target.value)} />
            </div>
            <div className="mb-2">
              <label className="form-label">Subheadline</label>
              <textarea className="form-control" rows="2" value={site.heroSubtitle} onChange={e => updateField('heroSubtitle', e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">Hero Background Image</label>
              <input className="form-control" value={site.heroImage} onChange={e => updateField('heroImage', e.target.value)} placeholder="e.g. background.png (from local-assets)" />
              <small className="text-secondary">Files from the local assets folder are available via <code>/local-assets/</code></small>
            </div>
            <div className="row g-2">
              <div className="col">
                <label className="form-label">CTA Label</label>
                <input className="form-control" value={site.ctaLabel} onChange={e => updateField('ctaLabel', e.target.value)} />
              </div>
              <div className="col">
                <label className="form-label">CTA URL</label>
                <input className="form-control" value={site.ctaUrl} onChange={e => updateField('ctaUrl', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Live Platforms</h5>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showTwitch} onChange={e => updateField('showTwitch', e.target.checked)} />
              <label className="form-check-label">Show Twitch</label>
            </div>
            <div className="mb-2">
              <label className="form-label">Twitch Channel</label>
              <input className="form-control" value={site.twitchChannel} onChange={e => updateField('twitchChannel', e.target.value)} placeholder="pannboo" />
            </div>
            <div className="mb-3">
              <label className="form-label">Twitch URL (optional)</label>
              <input className="form-control" value={site.twitchUrl} onChange={e => updateField('twitchUrl', e.target.value)} placeholder="https://twitch.tv/pannboo" />
            </div>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showYouTube} onChange={e => updateField('showYouTube', e.target.checked)} />
              <label className="form-check-label">Show YouTube</label>
            </div>
            <div className="mb-2">
              <label className="form-label">YouTube Channel ID</label>
              <input className="form-control" value={site.youtubeChannelId} onChange={e => updateField('youtubeChannelId', e.target.value)} placeholder="UC..." />
            </div>
            <div className="mb-2">
              <label className="form-label">YouTube URL (optional)</label>
              <input className="form-control" value={site.youtubeUrl} onChange={e => updateField('youtubeUrl', e.target.value)} placeholder="https://youtube.com/@pannboo" />
            </div>
            <div className="mb-2">
              <label className="form-label">Recent Uploads Count</label>
              <input type="number" min="1" max="8" className="form-control" value={site.youtubeUploadsLimit} onChange={e => updateField('youtubeUploadsLimit', e.target.value)} />
            </div>
            <div className="text-secondary small">
              YouTube live status and uploads require <code>YOUTUBE_API_KEY</code> on the server.
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Featured Review</h5>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showFeatured} onChange={e => updateField('showFeatured', e.target.checked)} />
              <label className="form-check-label">Show Featured Review</label>
            </div>
            <label className="form-label">Featured Completed Game</label>
            <select className="form-select" value={site.featuredGameId} onChange={e => updateField('featuredGameId', e.target.value)}>
              <option value="">Auto (latest completed)</option>
              {completedGames.map(game => (
                <option key={game.id} value={game.id}>{game.game?.title || game.id}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Section Visibility</h5>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showPlanned} onChange={e => updateField('showPlanned', e.target.checked)} />
              <label className="form-check-label">Show Planned + Queued</label>
            </div>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showCompleted} onChange={e => updateField('showCompleted', e.target.checked)} />
              <label className="form-check-label">Show Completed Reviews</label>
            </div>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showSuggestions} onChange={e => updateField('showSuggestions', e.target.checked)} />
              <label className="form-check-label">Show Viewer Suggestions</label>
            </div>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showAbout} onChange={e => updateField('showAbout', e.target.checked)} />
              <label className="form-check-label">Show About Section</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" checked={site.showLinks} onChange={e => updateField('showLinks', e.target.checked)} />
              <label className="form-check-label">Show Links Hub</label>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">About</h5>
            <div className="mb-2">
              <label className="form-label">About Title</label>
              <input className="form-control" value={site.aboutTitle} onChange={e => updateField('aboutTitle', e.target.value)} />
            </div>
            <div className="mb-2">
              <label className="form-label">About Copy</label>
              <textarea className="form-control" rows="4" value={site.aboutText} onChange={e => updateField('aboutText', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Schedule</h5>
            <div className="form-check form-switch mb-2">
              <input className="form-check-input" type="checkbox" checked={site.showSchedule} onChange={e => updateField('showSchedule', e.target.checked)} />
              <label className="form-check-label">Show Schedule</label>
            </div>
            <textarea className="form-control" rows="4" value={site.scheduleText} onChange={e => updateField('scheduleText', e.target.value)} placeholder="Mon/Wed/Fri 7pm..." />
          </div>
        </div>

        <div className="col-12">
          <div className="card bg-panel p-3">
            <h5 className="h6 mb-3">Links</h5>
            {(site.links || []).map((link, idx) => (
              <div key={`${idx}-${link.label}`} className="row g-2 align-items-end mb-2">
                <div className="col-md-3">
                  <label className="form-label">Label</label>
                  <input className="form-control" value={link.label || ''} onChange={e => updateLink(idx, 'label', e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">URL</label>
                  <input className="form-control" value={link.url || ''} onChange={e => updateLink(idx, 'url', e.target.value)} />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Kind</label>
                  <input className="form-control" value={link.kind || ''} onChange={e => updateLink(idx, 'kind', e.target.value)} placeholder="discord" />
                </div>
                <div className="col-md-1 d-grid">
                  <button className="btn btn-outline-danger" type="button" onClick={() => removeLink(idx)}>Remove</button>
                </div>
              </div>
            ))}
            <button className="btn btn-outline-primary" type="button" onClick={addLink}>Add Link</button>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-end mt-3">
        <button className="btn btn-success" onClick={onSave}>Save Public Site</button>
      </div>
    </div>
  )
}
