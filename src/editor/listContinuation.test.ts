import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState, TextSelection, type Command } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { describe, expect, it } from 'vitest'
import { continueListParagraph, removeEmptyListMarker } from './listContinuation'

const schema = getSchema([StarterKit])
const p = (text = '') => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
const li = (...content: ReturnType<typeof p>[]) => schema.nodes.listItem.create(null, content)
const list = (type: string, ...items: ReturnType<typeof li>[]) => schema.nodes[type].create(null, items)

function cursorState(doc: ReturnType<typeof p>, text: string, atEnd = true) {
  let cursor = -1
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent === text) cursor = pos + 1 + (atEnd ? node.content.size : 0)
  })
  if (cursor < 0) throw new Error('Paragraph not found')
  return EditorState.create({ doc, selection: TextSelection.create(doc, cursor), plugins: [history()] })
}

function run(state: EditorState, command: Command) {
  let next = state
  expect(command(state, (tr) => { next = state.apply(tr) })).toBe(true)
  next.doc.check()
  return next
}

describe.each(['orderedList', 'bulletList'])('%s continuation paragraphs', (type) => {
  function initial() {
    return cursorState(schema.nodes.doc.create(null, list(type, li(p('Parent'),
      list(type, li(p('One')), li(p('Two')), li(p('Three')), li(p('Four')), li(p())),
    ))), '')
  }

  it('removes the next empty marker without lifting or joining the previous text', () => {
    const state = run(initial(), removeEmptyListMarker)
    const nested = state.doc.firstChild!.firstChild!.lastChild!
    expect(nested.childCount).toBe(4)
    expect(nested.lastChild!.childCount).toBe(2)
    expect(nested.lastChild!.firstChild!.textContent).toBe('Four')
    expect(state.selection.$from.parent.textContent).toBe('')
    expect(state.selection.$from.depth).toBe(5)
  })

  it('keeps summary paragraphs at the same level and exits only on empty Enter', () => {
    let state = run(initial(), removeEmptyListMarker)
    state = state.apply(state.tr.insertText('Summary'))
    state = run(state, continueListParagraph)
    expect(state.selection.$from.depth).toBe(5)
    expect(state.selection.$from.node(-1).childCount).toBe(3)
    state = state.apply(state.tr.insertText('More explanation'))
    state = run(state, continueListParagraph)
    expect(state.selection.$from.depth).toBe(5)
    state = run(state, continueListParagraph)
    expect(state.selection.$from.depth).toBe(3)
    expect(state.doc.firstChild!.childCount).toBe(2)
    expect(state.doc.textContent).toBe('ParentOneTwoThreeFourSummaryMore explanation')
  })

  it('exits a top-level continuation to an ordinary paragraph', () => {
    const doc = schema.nodes.doc.create(null, list(type, li(p('One')), li(p())))
    let state = run(cursorState(doc, ''), removeEmptyListMarker)
    state = state.apply(state.tr.insertText('Summary'))
    state = run(state, continueListParagraph)
    state = run(state, continueListParagraph)
    expect(state.selection.$from.depth).toBe(1)
    expect(state.doc.childCount).toBe(2)
    expect(state.doc.lastChild!.type.name).toBe('paragraph')
    expect(state.doc.firstChild!.textContent).toBe('OneSummary')
  })

  it('preserves following siblings when removing a marker in the middle', () => {
    const doc = schema.nodes.doc.create(null, list(type, li(p('One')), li(p()), li(p('Three'))))
    const state = run(cursorState(doc, ''), removeEmptyListMarker)
    expect(state.doc.firstChild!.childCount).toBe(2)
    expect(state.doc.firstChild!.lastChild!.textContent).toBe('Three')
  })

  it('moves out only one level in mixed deeply nested lists', () => {
    const other = type === 'orderedList' ? 'bulletList' : 'orderedList'
    const doc = schema.nodes.doc.create(null, list(type, li(p('Outer'),
      list(other, li(p('Middle'), list(type, li(p('Inner')), li(p())))),
    )))
    let state = run(cursorState(doc, ''), removeEmptyListMarker)
    expect(state.selection.$from.depth).toBe(7)
    state = run(state, continueListParagraph)
    expect(state.selection.$from.depth).toBe(5)
    expect(state.selection.$from.node(-2).type.name).toBe(other)
    expect(state.doc.textContent).toBe('OuterMiddleInner')
  })

  it('supports undo and redo of marker removal', () => {
    const before = initial()
    const after = run(before, removeEmptyListMarker)
    const reverted = run(after, undo)
    expect(reverted.doc.eq(before.doc)).toBe(true)
    expect(run(reverted, redo).doc.eq(after.doc)).toBe(true)
  })

  it('leaves normal item splitting, first-item backspace and non-empty text to the editor', () => {
    const doc = schema.nodes.doc.create(null, list(type, li(p()), li(p('Text'))))
    expect(removeEmptyListMarker(cursorState(doc, ''))).toBe(false)
    expect(removeEmptyListMarker(cursorState(doc, 'Text', false))).toBe(false)
    expect(continueListParagraph(cursorState(doc, 'Text'))).toBe(false)
  })
})
