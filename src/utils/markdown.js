import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true
})

export function renderMarkdown(markdown = '') {
  const raw = marked.parse(String(markdown || ''), { gfm: true, breaks: true })
  return DOMPurify.sanitize(raw)
}

export function stripMarkdown(markdown = '') {
  let text = String(markdown || '')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/`[^`]*`/g, ' ')
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  text = text.replace(/[#>*_~`]/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}
