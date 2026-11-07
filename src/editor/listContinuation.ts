import { Extension } from '@tiptap/core'
import { liftEmptyBlock, splitBlockKeepMarks } from '@tiptap/pm/commands'
import { splitListItem } from '@tiptap/pm/schema-list'
import type { Command } from '@tiptap/pm/state'
import { canJoin } from '@tiptap/pm/transform'

// A continuation is a normal paragraph after the first block in a list item.
// This is native Markdown list structure, so no visual-only indent is needed.
export const removeEmptyListMarker: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false
  const itemDepth = $from.depth - 1
  if (itemDepth < 1 || $from.node(itemDepth).type.name !== 'listItem') return false
  if ($from.node(itemDepth).childCount !== 1 || $from.index(itemDepth - 1) === 0) return false

  const boundary = $from.before(itemDepth)
  if (!canJoin(state.doc, boundary)) return false
  // Join only the list-item wrappers, leaving the empty paragraph intact.
  // Text remains aligned with the previous item's text, without another marker.
  if (dispatch) dispatch(state.tr.join(boundary).scrollIntoView())
  return true
}

export const continueListParagraph: Command = (state, dispatch, view) => {
  const { $from, $to } = state.selection
  if (!$from.sameParent($to) || $from.parent.type.name !== 'paragraph') return false
  const itemDepth = $from.depth - 1
  if (itemDepth < 1 || $from.node(itemDepth).type.name !== 'listItem' || $from.index(itemDepth) === 0) return false

  if ($from.parent.content.size === 0) {
    // Empty Enter exits one level; at the root it exits the list entirely.
    return splitListItem(state.schema.nodes.listItem)(state, dispatch, view) || liftEmptyBlock(state, dispatch, view)
  }
  return splitBlockKeepMarks(state, dispatch, view)
}

export const ListContinuation = Extension.create({
  name: 'listContinuation',
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      Backspace: () => this.editor.commands.command(({ state, dispatch }) => removeEmptyListMarker(state, dispatch)),
      Enter: () => this.editor.commands.command(({ state, dispatch }) => continueListParagraph(state, dispatch)),
    }
  },
})
