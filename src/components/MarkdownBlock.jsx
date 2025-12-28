import React from 'react'
import { renderMarkdown } from '../utils/markdown.js'

function AchievementRef({ id, achievements = [] }) {
  const ach = achievements.find(a => String(a.id) === String(id))
  if (!ach) return <span className="text-muted small">[[Achievement #{id} not found]]</span>

  const badge = ach.badge_url || `https://media.retroachievements.org/Badge/${ach.badgeName}.png`
  const raUrl = `https://retroachievements.org/achievement/${id}`

  return (
    <a href={raUrl} target="_blank" rel="noreferrer" className="pub-ach-ref">
      <img src={badge} alt="" className="pub-ach-badge" />
      <div className="pub-ach-info">
        <span className="pub-ach-title">{ach.title}</span>
        <span className="pub-ach-desc">{ach.description}</span>
      </div>
      <div className="pub-ach-points">{ach.points}</div>
    </a>
  )
}

export default function MarkdownBlock({ markdown = '', className = '', achievements = [] }) {
  const html = React.useMemo(() => renderMarkdown(markdown), [markdown])
  const classes = className ? `markdown-body ${className}` : 'markdown-body'
  
  // Custom parsing for [[ach:12345]]
  const segments = React.useMemo(() => {
    const parts = []
    const regex = /\[\[ach:(\d+)\]\]/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(html)) !== null) {
      // Push text before match
      if (match.index > lastIndex) {
        parts.push({ type: 'html', content: html.substring(lastIndex, match.index) })
      }
      // Push achievement component
      parts.push({ type: 'ach', id: match[1] })
      lastIndex = regex.lastIndex
    }

    // Push remaining text
    if (lastIndex < html.length) {
      parts.push({ type: 'html', content: html.substring(lastIndex) })
    }

    return parts
  }, [html])

  if (segments.length === 0) {
    return <div className={classes} dangerouslySetInnerHTML={{ __html: html }} />
  }

  return (
    <div className={classes}>
      {segments.map((seg, i) => (
        seg.type === 'ach' 
          ? <AchievementRef key={i} id={seg.id} achievements={achievements} />
          : <span key={i} dangerouslySetInnerHTML={{ __html: seg.content }} />
      ))}
    </div>
  )
}
