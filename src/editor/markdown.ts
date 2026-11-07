import { marked } from 'marked'
import TurndownService from 'turndown'

const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  blankReplacement: (_content, node) => {
    // Markdown drops trailing empty paragraphs. Keep a blank continuation
    // inside its list item so draft reload/preview does not restore a marker.
    if (node.nodeName === 'P' && node.parentNode?.nodeName === 'LI' && (node as HTMLElement).previousElementSibling) {
      return '\n\n<p></p>\n\n'
    }
    return (node as HTMLElement & { isBlock: boolean }).isBlock ? '\n\n' : ''
  },
  strongDelimiter: '**',
})

td.addRule('strikethrough', {
  filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
  replacement: (c) => `~~${c}~~`,
})

td.addRule('emptyParagraph', {
  filter: (node) => {
    if (node.nodeName !== 'P') return false
    const html = (node as HTMLElement).innerHTML?.trim()
    return html === '<br>' || html === '' || html === '<br class="ProseMirror-trailingBreak">'
  },
  replacement: () => '\n\n<br>\n\n',
})

td.addRule('image', {
  filter: 'img',
  replacement: (_c, node) => {
    const el = node as HTMLElement
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    return `![${alt}](${src})`
  },
})

td.addRule('coloredText', {
  filter: (node) => {
    return node.nodeName === 'SPAN' && !!(node as HTMLElement).style.color
  },
  replacement: (c, node) => {
    const color = (node as HTMLElement).style.color
    return `<span style="color: ${color}">${c}</span>`
  },
})

td.addRule('highlightMark', {
  filter: (node) => {
    return node.nodeName === 'MARK' && !!(node as HTMLElement).getAttribute('data-color')
  },
  replacement: (c, node) => {
    const color = (node as HTMLElement).getAttribute('data-color') || ''
    return `<mark data-color="${color}" style="background-color: ${color}">${c}</mark>`
  },
})

export function htmlToMarkdown(html: string): string {
  return td.turndown(html)
}

export function markdownToHtml(md: string): string {
  if (!md.trim()) return ''
  return marked.parse(md, { async: false }) as string
}
