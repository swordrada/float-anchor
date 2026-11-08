import { describe, it, expect, vi } from 'vitest'
import { prepareLocalSnapshot } from './local-data'

describe('local content clock', () => {
  const original = { canvases: [{ id: 'c', cards: [{ content: 'note' }] }], activeCanvasId: 'c', _syncTimestamp: 100, _contentUpdatedAt: 90 }
  it('does not advance for view-only writes or restored older metadata', () => {
    const next = prepareLocalSnapshot({ ...original, activeCanvasId: null, canvases: [{ ...original.canvases[0], viewport: { panX: 30 } }] }, original)
    expect(next._contentUpdatedAt).toBe(90)
    expect(next._syncTimestamp).toBe(100)
  })
  it('records real content changes monotonically even if the device clock moves back', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10)
    try {
      const next = prepareLocalSnapshot({ ...original, journal: { entriesByDate: { today: { content: 'new' } } } }, original)
      expect(next._contentUpdatedAt).toBe(91)
      expect(next._syncTimestamp).toBe(100)
    } finally { clock.mockRestore() }
  })
})
