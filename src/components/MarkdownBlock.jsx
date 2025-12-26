import React from 'react'
import { renderMarkdown } from '../utils/markdown.js'

export default function MarkdownBlock({ markdown = '', className = '' }) {
  const html = React.useMemo(() => renderMarkdown(markdown), [markdown])
  const classes = className ? `markdown-body ${className}` : 'markdown-body'
  return <div className={classes} dangerouslySetInnerHTML={{ __html: html }} />
}
