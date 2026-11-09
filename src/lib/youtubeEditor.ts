import { Node } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, Plugin, TextSelection, type Command } from '@tiptap/pm/state'
import { parseYouTubeUrl } from './youtube'

const videoChange = 'floatAnchorVideoChange'

// Keep a video removal separate from typing on either side of it. An empty
// history boundary adds no undo step and does not modify the saved document.
export const videoHistoryBoundary = () => new Plugin({
  appendTransaction(transactions, _oldState, state) {
    return transactions.some((tr) => tr.getMeta(videoChange)) ? closeHistory(state.tr) : null
  },
})

export function deleteAdjacentYouTube(direction: 'backward' | 'forward'): Command {
  return (state, dispatch) => {
    const { selection } = state
    let from: number
    let to: number
    if (selection instanceof NodeSelection && selection.node.type.name === 'youtubeVideo') {
      from = selection.from
      to = selection.to
    } else {
      if (!(selection instanceof TextSelection) || !selection.empty) return false
      const { $from } = selection
      if (!$from.depth || !$from.parent.isTextblock || $from.parent.type.spec.code) return false
      const backward = direction === 'backward'
      if ($from.parentOffset !== (backward ? 0 : $from.parent.content.size)) return false
      const boundary = backward ? $from.before() : $from.after()
      const $boundary = state.doc.resolve(boundary)
      const adjacent = backward ? $boundary.nodeBefore : $boundary.nodeAfter
      if (adjacent?.type.name !== 'youtubeVideo') return false
      from = backward ? boundary - adjacent.nodeSize : boundary
      to = from + adjacent.nodeSize
    }
    if (dispatch) dispatch(closeHistory(state.tr.delete(from, to)).setMeta(videoChange, true).scrollIntoView())
    return true
  }
}

function videoAttributes(element: HTMLElement) {
  const src = element.getAttribute('data-src') ?? element.getAttribute('href') ?? ''
  if (!parseYouTubeUrl(src) || element.closest('pre, code')) return false
  return {
    src,
    label: element.getAttribute('data-label') ?? element.textContent ?? src,
    linkTitle: element.getAttribute('data-link-title') ?? element.getAttribute('title'),
  }
}

// Markdown remains an ordinary link, so older notes, sync and exports keep
// their original URL, label and starting time. The atom exists only in editor state.
export const YouTubeVideoNode = Node.create({
  name: 'youtubeVideo',
  priority: 1000,
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '', rendered: false },
      label: { default: '', rendered: false },
      linkTitle: { default: null, rendered: false },
    }
  },

  parseHTML() {
    return [
      // Consume the wrapping paragraph for a standalone Markdown link; parsing
      // only its <a> would leave an empty paragraph in front of the block.
      { tag: 'p', priority: 100, getAttrs: (element) => {
        const children = Array.from(element.childNodes).filter((child) => child.nodeType !== 3 || child.textContent?.trim())
        if (children.length !== 1 || children[0].nodeName !== 'A') return false
        return videoAttributes(children[0] as HTMLElement)
      } },
      { tag: 'div[data-youtube-video]', priority: 100, getAttrs: videoAttributes },
      { tag: 'a[href]', priority: 100, getAttrs: videoAttributes },
    ]
  },

  renderHTML({ node }) {
    const { src, label, linkTitle } = node.attrs
    return ['div', { 'data-youtube-video': '', 'data-src': src, 'data-label': label, 'data-link-title': linkTitle },
      ['a', { href: src, title: linkTitle }, label || src]]
  },

  renderText({ node }) { return node.attrs.src },

  addKeyboardShortcuts() {
    const remove = (direction: 'backward' | 'forward') => {
      if (!this.editor.isEditable || this.editor.view.composing) return false
      return deleteAdjacentYouTube(direction)(this.editor.state, this.editor.view.dispatch)
    }
    return { Backspace: () => remove('backward'), Delete: () => remove('forward') }
  },

  addProseMirrorPlugins() {
    return [videoHistoryBoundary(), new Plugin({
      props: {
        handlePaste: (_view, event) => {
          if (!this.editor.isEditable || this.editor.isActive('codeBlock') || !this.editor.state.selection.empty) return false
          const src = event.clipboardData?.getData('text/plain').trim() ?? ''
          if (!parseYouTubeUrl(src)) return false
          // Rich links use the node parser so copying a video retains its
          // label/title. A URL in otherwise plain HTML still becomes a video.
          const html = event.clipboardData?.getData('text/html')
          if (html && new DOMParser().parseFromString(html, 'text/html').querySelector('a[href], [data-youtube-video]')) return false
          event.preventDefault()
          this.editor.view.dispatch(closeHistory(this.editor.state.tr))
          this.editor.commands.insertContent([
            { type: this.name, attrs: { src, label: src } },
            { type: 'paragraph' },
          ])
          this.editor.view.dispatch(closeHistory(this.editor.state.tr))
          return true
        },
      },
    })]
  },
})
