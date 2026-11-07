import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, markdownToHtml } from './markdown'

describe.each(['ol', 'ul'])('%s continuation persistence', (tag) => {
  it('keeps summary paragraphs inside the last nested item after repeated round trips', () => {
    let html = `<${tag}><li><p>Parent</p><${tag}><li><p>One</p></li><li><p>Two</p><p>Summary</p><p>More explanation</p></li></${tag}></li></${tag}>`
    for (let i = 0; i < 3; i++) {
      html = markdownToHtml(htmlToMarkdown(html))
      expect(html).toMatch(/Two\s*<\/p>\s*<p>Summary<\/p>\s*<p>More explanation<\/p>\s*<\/li>/)
      expect(html.match(/<li>/g)).toHaveLength(3)
      expect(html.match(new RegExp(`<${tag}>`, 'g'))).toHaveLength(2)
    }
  })

  it('preserves the blank continuation when saving before typing or before exiting', () => {
    const html = `<${tag}><li><p>Parent</p><${tag}><li><p>One</p><p></p></li></${tag}></li></${tag}>`
    const restored = markdownToHtml(htmlToMarkdown(html))
    expect(restored).toMatch(/One<\/p>\s*<p><\/p>\s*<\/li>/)
    expect(restored.match(/<li>/g)).toHaveLength(2)
  })

  it('retains inline formatting and a later numbered/bulleted sibling', () => {
    const html = `<${tag}><li><p>One</p><p><strong>Summary</strong> with <em>emphasis</em></p></li><li><p>Two</p></li></${tag}>`
    const restored = markdownToHtml(htmlToMarkdown(html))
    expect(restored).toContain('<strong>Summary</strong> with <em>emphasis</em>')
    expect(restored.match(/<li>/g)).toHaveLength(2)
  })
})
