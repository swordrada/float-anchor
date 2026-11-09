import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { history, undo, redo, undoDepth } from '@tiptap/pm/history'
import { EditorState, NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { YouTubeVideoNode, deleteAdjacentYouTube, videoHistoryBoundary } from './youtubeEditor'

const schema = getSchema([StarterKit, YouTubeVideoNode])
const p = (text = '') => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
const video = () => schema.nodes.youtubeVideo.create({
  src: 'https://youtu.be/vKy6Q9hwon4?t=1m30s&si=original', label: '课程片段', linkTitle: '从 90 秒开始',
})

function session(nodes: ReturnType<typeof p>[], caret: number) {
  const doc = schema.nodes.doc.create(null, nodes)
  let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, caret), plugins: [history(), videoHistoryBoundary()] })
  const dispatch = (tr: Transaction) => { state = state.applyTransaction(tr).state }
  return { get state() { return state }, dispatch }
}

describe('video deletion and history', () => {
  it.each(['', '下方正文'])('backspace below a video preserves the following paragraph: %s', (text) => {
    const s = session([p('上文'), video(), p(text)], 6)
    const original = s.state.doc.toJSON()
    expect(deleteAdjacentYouTube('backward')(s.state, s.dispatch)).toBe(true)
    expect(s.state.doc.toJSON()).toEqual(schema.nodes.doc.create(null, [p('上文'), p(text)]).toJSON())
    expect(s.state.selection.from).toBe(5)
    expect(undoDepth(s.state)).toBe(1)
    expect(undo(s.state, s.dispatch)).toBe(true)
    expect(s.state.doc.toJSON()).toEqual(original)
    expect(s.state.selection.from).toBe(6)
    expect(redo(s.state, s.dispatch)).toBe(true)
    expect(s.state.doc.childCount).toBe(2)
  })

  it('isolates deletion from typing immediately before and after it', () => {
    const s = session([video(), p()], 2)
    s.dispatch(s.state.tr.insertText('后'))
    s.dispatch(s.state.tr.setSelection(TextSelection.create(s.state.doc, 2)))
    deleteAdjacentYouTube('backward')(s.state, s.dispatch)
    s.dispatch(s.state.tr.insertText('新'))
    expect(undoDepth(s.state)).toBe(3)
    undo(s.state, s.dispatch)
    expect(s.state.doc.textContent).toBe('后')
    expect(s.state.doc.childCount).toBe(1)
    undo(s.state, s.dispatch)
    expect(s.state.doc.firstChild?.attrs).toEqual(video().attrs)
    expect(s.state.doc.textContent).toBe('后')
    undo(s.state, s.dispatch)
    expect(s.state.doc.textContent).toBe('')
    expect(s.state.doc.firstChild?.attrs).toEqual(video().attrs)
  })

  it('deletes forward from the preceding paragraph without joining text', () => {
    const s = session([p('前'), video(), p('后')], 2)
    const original = s.state.doc.toJSON()
    expect(deleteAdjacentYouTube('forward')(s.state, s.dispatch)).toBe(true)
    expect(s.state.doc.childCount).toBe(2)
    expect(s.state.doc.textContent).toBe('前后')
    undo(s.state, s.dispatch)
    expect(s.state.doc.toJSON()).toEqual(original)
  })

  it.each(['backward', 'forward'] as const)('supports a selected video with %s deletion and undo', (direction) => {
    const s = session([video(), p('正文')], 2)
    s.dispatch(s.state.tr.setSelection(NodeSelection.create(s.state.doc, 0)))
    deleteAdjacentYouTube(direction)(s.state, s.dispatch)
    expect(s.state.doc.textContent).toBe('正文')
    undo(s.state, s.dispatch)
    expect(s.state.selection).toBeInstanceOf(NodeSelection)
    expect(s.state.doc.firstChild?.attrs).toEqual(video().attrs)
  })

  it('deletes only the adjacent video and restores multiple videos in order', () => {
    const s = session([video(), video(), p()], 3)
    const original = s.state.doc.toJSON()
    deleteAdjacentYouTube('backward')(s.state, s.dispatch)
    deleteAdjacentYouTube('backward')(s.state, s.dispatch)
    expect(s.state.doc.childCount).toBe(1)
    expect(undoDepth(s.state)).toBe(2)
    undo(s.state, s.dispatch)
    undo(s.state, s.dispatch)
    expect(s.state.doc.toJSON()).toEqual(original)
  })

  it('does not intercept ordinary text deletion or a range selection', () => {
    const s = session([video(), p('正文')], 3)
    expect(deleteAdjacentYouTube('backward')(s.state, s.dispatch)).toBe(false)
    s.dispatch(s.state.tr.setSelection(TextSelection.create(s.state.doc, 2, 4)))
    expect(deleteAdjacentYouTube('backward')(s.state, s.dispatch)).toBe(false)
    expect(undoDepth(s.state)).toBe(0)
  })

  it('does not remove a video separated by another paragraph', () => {
    const s = session([video(), p(), p('正文')], 4)
    expect(deleteAdjacentYouTube('backward')(s.state, s.dispatch)).toBe(false)
  })

  it('preserves list structure when removing a video inside a list item', () => {
    const item = schema.nodes.listItem.create(null, [p('条目'), video(), p('补充')])
    const list = schema.nodes.bulletList.create(null, item)
    const s = session([list, p()], 8)
    const original = s.state.doc.toJSON()
    expect(deleteAdjacentYouTube('backward')(s.state, s.dispatch)).toBe(true)
    expect(s.state.doc.firstChild?.firstChild?.childCount).toBe(2)
    undo(s.state, s.dispatch)
    expect(s.state.doc.toJSON()).toEqual(original)
  })

  it('does not hijack code-block backspace', () => {
    const s = session([video(), schema.nodes.codeBlock.create(null, schema.text('code'))], 2)
    expect(deleteAdjacentYouTube('backward')(s.state, s.dispatch)).toBe(false)
  })
})
