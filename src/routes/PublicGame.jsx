import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPublicGamePublic, fetchPublicSite } from '../services/publicApi.js'
import { buildCoverUrl } from '../utils/coverUrl.js'
import MarkdownBlock from '../components/MarkdownBlock.jsx'
import { stripMarkdown } from '../utils/markdown.js'
import useSiteTheme from '../hooks/useSiteTheme.js'
import { cloneSiteTheme } from '../utils/siteTheme.js'

const DEFAULT_SITE = {
  title: 'Pannboo',
  tagline: '',
  twitchUrl: '',
  youtubeUrl: '',
  showSchedule: true,
  showSuggestions: true,
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
  useSiteTheme(site.theme)
  const [game, setGame] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [copied, setCopied] = React.useState(false)

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
      <nav className="pub-nav">
        <div className="pub-container pub-nav-inner">
          <Link className="pub-brand" to="/">{site.title || 'Pannboo'}</Link>
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

      <section className="pub-section pub-review">
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
                {consoleLabel(game.game?.console) && <span>{consoleLabel(game.game?.console)}</span>}
                {game.game?.release_year && <span>{game.game.release_year}</span>}
                {game.game?.publisher && <span>{game.game.publisher}</span>}
              </div>
              <div className="pub-review-rating">
                <span>Rating</span>
                <strong>{ratingLabel(game.publicRating)}</strong>
              </div>
              <div className="pub-review-actions">
                <Link className="pub-btn ghost" to="/">Back to Pannboo</Link>
                {game.publicVideoUrl && (
                  <a className="pub-btn primary" href={game.publicVideoUrl} target="_blank" rel="noreferrer">
                    Watch Video Review
                  </a>
                )}
                <button type="button" className="pub-btn ghost" onClick={copyLink}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </div>

          <div className="pub-review-content">
            <div className="pub-review-card">
              <h2>Written Review</h2>
              <MarkdownBlock markdown={game.publicReview || 'Review coming soon.'} />
            </div>
            {embedUrl && (
              <div className="pub-review-card pub-review-video">
                <h2>Video Review</h2>
                <div className="pub-review-embed">
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
    </div>
  )
}
