import { describe, it, expect } from 'vitest'
import { contentFingerprint, preserveLocalView } from './syncData'

describe('cloud content', () => {
  it('ignores property order, view preferences and sync metadata', () => {
    const a = { canvases: [{ id: 'c', name: 'test', cards: [] }], activeCanvasId: 'c' }
    const b = { canvases: [{ cards: [], name: 'test', id: 'c', viewport: { panX: 4 } }], activeCanvasId: null, _contentUpdatedAt: 99 }
    expect(contentFingerprint(a)).toBe(contentFingerprint(b))
  })
  it('detects note position, note content and daily journal changes', () => {
    const original = { canvases: [{ id: 'c', cards: [{ id: 'n', x: 1, content: 'a' }] }] }
    for (const next of [
      { canvases: [{ id: 'c', cards: [{ id: 'n', x: 2, content: 'a' }] }] },
      { canvases: [{ id: 'c', cards: [{ id: 'n', x: 1, content: 'b' }] }] },
      { ...original, journal: { entriesByDate: { today: { content: 'journal' } } } },
    ]) expect(contentFingerprint(next)).not.toBe(contentFingerprint(original))
  })
  it('selects a surviving canvas when the selected one was deleted remotely', () => {
    expect(preserveLocalView({ canvases: [{ id: 'new', viewport: { panX: 99 } }], activeCanvasId: 'old' }, { activeCanvasId: 'old' }))
      .toEqual({ canvases: [{ id: 'new' }], activeCanvasId: 'new' })
  })
})
