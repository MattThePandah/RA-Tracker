import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublicGamePublic, fetchPublicSite } from '../services/publicApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import MarkdownBlock from '../components/MarkdownBlock.jsx'
import { stripMarkdown } from '../utils/markdown.js'
import useSiteTheme from '../hooks/useSiteTheme.js'
import { cloneSiteTheme, isLight } from '../utils/siteTheme.js'

const DEFAULT_SITE = {
  title: 'Pannboo',
  tagline: '',
  twitchUrl: '',
  youtubeUrl: '',
  showSchedule: true,
  showSuggestions: true,
  logoImage: '',
  theme: cloneSiteTheme()
}

const ratingLabel = (rating) => {
  if (rating === null || rating === undefined || rating === '') return 'No rating yet'
  return `${rating}/10`
}

const consoleLabel = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return value.name || value.id || ''
  return String(value)
}

function BambooRating({ rating, size = 'md' }) {
  const value = Number(rating) || 0
  const fullIcons = Math.floor(value)
  const hasHalf = value % 1 !== 0
  const emptyIcons = 10 - fullIcons - (hasHalf ? 1 : 0)

  return (
    <div className={`bamboo-rating-container ${size}`}>
      <div className="pub-rating-value mb-1">
        <span>{value}</span>
        <small>/ 10</small>
      </div>
      <div className="bamboo-emoji-display d-flex gap-1 p-2 rounded" style={{ 
        fontSize: size === 'sm' ? '12px' : '1.4rem',
        background: 'rgba(0,0,0,0.05)',
        width: 'fit-content'
      }}>
        {Array.from({ length: fullIcons }).map((_, i) => (
          <span key={`full-${i}`} title="Full Bamboo">🎋</span>
        ))}
        {hasHalf && <span title="Half Bamboo" style={{ position: 'relative', display: 'inline-block' }}>
          <span style={{ opacity: 0.2 }}>🎋</span>
          <span style={{ position: 'absolute', top: 0, left: 0, width: '50%', overflow: 'hidden' }}>🎋</span>
        </span>}
        {Array.from({ length: emptyIcons }).map((_, i) => (
          <span key={`empty-${i}`} style={{ opacity: 0.15 }} title="Empty Slot">🎋</span>
        ))}
      </div>
    </div>
  )
}

function getYouTubeEmbed(url) {
  if (!url) return null
  const value = String(url)
  const match =
    value.match(/youtu\.be\/([^?&#]+)/) ||
    value.match(/youtube\.com\/watch\?v=([^?&#]+)/) ||
    value.match(/youtube\.com\/embed\/([^?&#]+)/)
  if (!match) return null
  return `https://www.youtube.com/embed/${match[1]}`
}

export default function PublicGame() {
  const { gameId } = useParams()
  const [site, setSite] = React.useState({ ...DEFAULT_SITE })
  const [game, setGame] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  useSiteTheme(site.theme)

  React.useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const results = await Promise.allSettled([
          fetchPublicGamePublic(gameId),
          fetchPublicSite()
        ])
        if (!mounted) return
        const gameResult = results[0]
        const siteResult = results[1]
        if (siteResult.status === 'fulfilled') {
          setSite({ ...DEFAULT_SITE, ...(siteResult.value.site || {}) })
        }
        if (gameResult.status === 'fulfilled') {
          console.log('Loaded public game data. Achievements:', gameResult.value.achievements?.length)
          setGame(gameResult.value || null)
        } else {
          setError('This review is not available.')
        }
      } catch (err) {
        if (mounted) setError('This review is not available.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [gameId])

  React.useEffect(() => {
    if (!game) return
    const title = game.publicReviewTitle || game.game?.title || 'Game Review'
    document.title = `${title} - ${site.title || 'Pannboo'}`
  }, [game, site.title])

  React.useEffect(() => {
    if (!game) return
    const summary = game.publicReview ? stripMarkdown(game.publicReview).slice(0, 160) : 'Pannboo game review'
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', summary)
  }, [game])

  const toAbsolute = (url) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (typeof window !== 'undefined' && url.startsWith('/')) {
      return `${window.location.origin}${url}`
    }
    return url
  }

  React.useEffect(() => {
    if (!game) return
    const title = game.publicReviewTitle || game.game?.title || 'Game Review'
    const description = game.publicReview ? stripMarkdown(game.publicReview).slice(0, 160) : 'Pannboo game review'
    const imageCandidate = game.game?.image_url ? toAbsolute(buildCoverUrl(game.game.image_url)) : ''

    const upsert = (key, content, isProperty = false) => {
      if (!content) return
      const attr = isProperty ? 'property' : 'name'
      let node = document.querySelector(`meta[${attr}="${key}"]`)
      if (!node) {
        node = document.createElement('meta')
        node.setAttribute(attr, key)
        document.head.appendChild(node)
      }
      node.setAttribute('content', content)
    }

    upsert('og:title', title, true)
    upsert('og:description', description, true)
    upsert('og:type', 'article', true)
    upsert('og:url', typeof window !== 'undefined' ? window.location.href : '', true)
    upsert('twitter:card', imageCandidate ? 'summary_large_image' : 'summary')
    upsert('twitter:title', title)
    upsert('twitter:description', description)
    if (imageCandidate) {
      upsert('og:image', imageCandidate, true)
      upsert('twitter:image', imageCandidate)
    }
  }, [game])

  const copyLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {}
  }

  const embedUrl = getYouTubeEmbed(game?.publicVideoUrl)
  const navThemeClass = isLight(site.theme?.public?.nav || '#060807') ? 'pub-nav-light' : 'pub-nav-dark'

  if (loading) {
    return (
      <div className="pub-shell">
        <div className="pub-section">
          <div className="pub-container">Loading...</div>
        </div>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="pub-shell">
        <div className="pub-section">
          <div className="pub-container">
            <div className="pub-review-card">
              <h2>Not found</h2>
              <p>{error || 'This review is not available.'}</p>
              <Link className="pub-btn ghost" to="/">Back to Pannboo</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pub-shell pub-review-shell">
      {/* Decorative Blobs */}
      <div className="position-fixed top-0 start-0 w-100 h-100 overflow-hidden" style={{ pointerEvents: 'none', zIndex: 0 }}>
        <div className="position-absolute" style={{ top: '-5%', right: '-5%', width: '35%', height: '35%', background: 'radial-gradient(circle, rgba(var(--pub-primary-rgb), 0.06) 0%, transparent 70%)', filter: 'blur(60px)' }}></div>
        <div className="position-absolute" style={{ bottom: '-5%', left: '-5%', width: '30%', height: '30%', background: 'radial-gradient(circle, rgba(var(--pub-accent-rgb), 0.04) 0%, transparent 70%)', filter: 'blur(50px)' }}></div>
      </div>

      <nav className={`pub-nav ${navThemeClass}`}>
        <div className="pub-container pub-nav-inner">
          <Link className="pub-brand d-flex align-items-center" to="/">
            {site.logoImage ? (
              <img 
                src={`${import.meta.env.VITE_IGDB_PROXY_URL || ''}/local-assets/${site.logoImage}`} 
                alt={site.title} 
                style={{ height: '40px', width: 'auto', objectFit: 'contain' }} 
              />
            ) : (site.title || 'Pannboo')}
          </Link>
          <div className="pub-links">
            <Link to="/">Home</Link>
            {site.twitchUrl && <a href={site.twitchUrl} target="_blank" rel="noreferrer">Twitch</a>}
            {site.youtubeUrl && <a href={site.youtubeUrl} target="_blank" rel="noreferrer">YouTube</a>}
          </div>
          <div className="pub-nav-actions">
            <Link className="pub-btn ghost small" to="/">Back</Link>
          </div>
        </div>
      </nav>

      <section className="pub-section pub-review pub-animate-in">
        <div className="pub-container">
          <div className="pub-review-hero">
            <div className="pub-review-cover">
              {game.game?.image_url ? (
                <img src={buildCoverUrl(game.game.image_url)} alt="" />
              ) : (
                <div className="pub-no-cover">No cover</div>
              )}
            </div>
            <div className="pub-review-summary">
              <span className="pub-review-status">{game.publicStatus || 'Completed'}</span>
              <h1>{game.publicReviewTitle || game.game?.title || 'Untitled Review'}</h1>
              <div className="pub-review-meta">
                <span>{game.game?.title || 'Unknown title'}</span>
                {consoleLabel(game.game?.console) && <span>&bull; {consoleLabel(game.game?.console)}</span>}
                {game.game?.release_year && <span>&bull; {game.game.release_year}</span>}
                {game.game?.publisher && <span>&bull; {game.game.publisher}</span>}
              </div>
              <div className="pub-review-rating border-0 bg-transparent p-0 text-start align-items-start">
                <span className="small text-uppercase fw-bold opacity-50 mb-2 d-block">Streamer Rating</span>
                <BambooRating rating={game.publicRating} />
              </div>
              <div className="pub-review-actions">
                <Link className="pub-btn ghost" to="/">Back to Pannboo</Link>
                {game.publicVideoUrl && (
                  <a className="pub-btn primary" href={game.publicVideoUrl} target="_blank" rel="noreferrer">
                    Watch Video Review
                  </a>
                )}
                <button type="button" className="pub-btn ghost" onClick={copyLink}>
                  {copied ? 'Copied Link!' : 'Share Review'}
                </button>
              </div>
            </div>
          </div>

                    <div className="pub-review-content mt-5">

                      <div className="row g-4">

                        <div className="col-lg-8">

                          <div className="pub-review-card p-4 p-lg-5 pub-glass shadow-lg h-100">

                            <div className="d-flex align-items-center gap-3 mb-4">

                              <div className="pub-pill">Analysis</div>

                              <h2 className="h3 mb-0">The Deep Dive</h2>

                            </div>

                            <div className="markdown-body opacity-90" style={{ lineHeight: '1.8', fontSize: '1.1rem' }}>

                              <MarkdownBlock markdown={game.publicReview || 'Review coming soon.'} achievements={game.achievements || []} />

                            </div>

                          </div>

                        </div>

                        

                        <div className="col-lg-4">

                                          <div className="pub-review-card p-4 pub-glass shadow-lg">

                                            <div className="d-flex align-items-center gap-3 mb-4">

                                              <div className="pub-pill" style={{ background: 'rgba(var(--pub-primary-rgb), 0.1)', color: 'var(--pub-primary)' }}>Trophies</div>

                                              <h2 className="h5 mb-0" style={{ color: '#000' }}>Achievements</h2>

                                            </div>

                          

                            <div className="pub-review-ach-list d-flex flex-column gap-2" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>

                              {(game.achievements || []).length === 0 && <div className="text-muted small">No achievements found for this game.</div>}

                              {(game.achievements || []).map(ach => {

                                const badge = ach.badge_url || `https://media.retroachievements.org/Badge/${ach.badgeName}.png`

                                return (

                                  <a 

                                    key={ach.id} 

                                    href={`https://retroachievements.org/achievement/${ach.id}`} 

                                    target="_blank" 

                                    rel="noreferrer" 

                                    className="d-flex align-items-center gap-3 p-2 rounded text-decoration-none hover-bg-white-05 transition-all"

                                    title={ach.description}

                                  >

                                    <img src={badge} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px' }} />

                                                              <div className="min-w-0 flex-1">

                                                                <div className="fw-bold small truncate-1" style={{ color: 'var(--pub-text)' }}>{ach.title}</div>

                                                                <div className="text-muted" style={{ fontSize: '10px' }}>{ach.points} pts</div>

                                                              </div>

                                    

                                  </a>

                                )

                              })}

                            </div>

                          </div>

                        </div>

                      </div>

          

                      {embedUrl && (

                        <div className="pub-review-card pub-review-video p-4 pub-glass shadow-lg mt-4">
                <div className="d-flex align-items-center gap-3 mb-4">
                  <div className="pub-pill" style={{ background: 'rgba(255, 0, 0, 0.1)', color: '#ff4444', borderColor: 'rgba(255, 0, 0, 0.2)' }}>Video</div>
                  <h2 className="h3 mb-0">Visual Review</h2>
                </div>
                <div className="pub-review-embed shadow-lg border border-white border-opacity-10">
                  <iframe
                    src={embedUrl}
                    height="100%"
                    width="100%"
                    allowFullScreen
                    loading="lazy"
                    title="Video Review"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="pub-footer border-top border-secondary border-opacity-10 pt-5 mt-auto" id="about">
        <div className="pub-container pb-5">
          <div className="pub-footer-grid">
            <div className="pub-footer-col">
              <h3 className="h5 fw-bold mb-4 text-uppercase" style={{ letterSpacing: '2px', color: 'var(--pub-primary)' }}>
                {site.aboutTitle || 'About'}
              </h3>
              <p className="pub-preline lead opacity-75 fs-6">{site.aboutText || 'Welcome to the retro tracking hub.'}</p>
            </div>
            {site.showSchedule && (
              <div className="pub-footer-col">
                <h3 className="h5 fw-bold mb-4 text-uppercase" style={{ letterSpacing: '2px', color: 'var(--pub-primary)' }}>
                  Schedule
                </h3>
                <p className="pub-preline opacity-75">{site.scheduleText || 'Check Twitch for the latest schedule.'}</p>
              </div>
            )}
            {site.showLinks && (
              <div className="pub-footer-col">
                <h3 className="h5 fw-bold mb-4 text-uppercase" style={{ letterSpacing: '2px', color: 'var(--pub-primary)' }}>
                  Links Hub
                </h3>
                <div className="pub-footer-links">
                  {site.links.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noreferrer" className="text-decoration-none py-1 d-inline-block hover-translate-x">
                      {link.label}
                    </a>
                  ))}
                  {site.showTwitch && <a href={site.twitchUrl} className="text-decoration-none py-1 d-inline-block hover-translate-x">Twitch</a>}
                  {site.showYouTube && <a href={site.youtubeUrl} className="text-decoration-none py-1 d-inline-block hover-translate-x">YouTube</a>}
                </div>
              </div>
            )}
          </div>
          <div className="pub-copyright mt-5 pt-4 border-top border-secondary border-opacity-10 opacity-50">
            &copy; {new Date().getFullYear()} {site.title}. Crafted with RA Tracker.
          </div>
        </div>
      </footer>
    </div>
  )
}
