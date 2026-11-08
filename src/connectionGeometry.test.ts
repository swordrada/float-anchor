import { describe, expect, it } from 'vitest'
import { getConnectionGeometry, getConnectionPreview } from './connectionGeometry'

const source = { x: 500, y: 500, width: 200, height: 120 }
type Geometry = ReturnType<typeof getConnectionGeometry>

function sample(curve: Geometry, t: number) {
  const u = 1 - t
  return {
    x: u ** 3 * curve.start.x + 3 * u ** 2 * t * curve.c1.x + 3 * u * t ** 2 * curve.c2.x + t ** 3 * curve.end.x,
    y: u ** 3 * curve.start.y + 3 * u ** 2 * t * curve.c1.y + 3 * u * t ** 2 * curve.c2.y + t ** 3 * curve.end.y,
  }
}

describe('adaptive connection routing', () => {
  it.each([
    ['right', 900, 500, 'right', 'left'],
    ['left', 100, 500, 'left', 'right'],
    ['above', 500, 100, 'top', 'bottom'],
    ['below', 500, 900, 'bottom', 'top'],
    ['upper left', 100, 350, 'left', 'right'],
    ['lower left', 100, 650, 'left', 'right'],
    ['upper right', 900, 350, 'right', 'left'],
    ['lower right', 900, 650, 'right', 'left'],
    ['mostly above', 550, 100, 'top', 'bottom'],
    ['mostly below', 450, 900, 'bottom', 'top'],
    ['diagonal', 800, 800, 'right', 'left'],
  ])('routes %s through facing sides', (_label, x, y, fromSide, toSide) => {
    const route = getConnectionGeometry(source, { ...source, x: Number(x), y: Number(y) })
    expect(route.start.side).toBe(fromSide)
    expect(route.end.side).toBe(toSide)
  })

  it('routes both screenshot connections from the right card’s left to the left cards’ right', () => {
    const right = { x: 822, y: 603, width: 475, height: 169 }
    const targets = [
      { x: 154, y: 191, width: 475, height: 219 },
      { x: 154, y: 599, width: 475, height: 172 },
    ]
    for (const target of targets) {
      const route = getConnectionGeometry(right, target)
      expect(route.start).toEqual({ side: 'left', x: 822, y: 687.5 })
      expect(route.end).toEqual({ side: 'right', x: 629, y: target.y + target.height / 2 })
      expect(route.c1.x).toBeLessThan(route.start.x)
      expect(route.c2.x).toBeGreaterThan(route.end.x)
    }
  })

  it('uses the card edges, not just center displacement, for wide/tall cards', () => {
    const wide = { x: 100, y: 100, width: 1000, height: 100 }
    const below = { x: 800, y: 300, width: 200, height: 100 }
    const route = getConnectionGeometry(wide, below)
    expect(route.start.side).toBe('bottom')
    expect(route.end.side).toBe('left')
  })

  it('keeps curves monotone and outside both endpoint cards across sizes and directions', () => {
    for (const width of [80, 200, 700]) {
      for (const height of [60, 120, 600]) {
        for (const x of [-600, 100, 500, 720, 1000]) {
          for (const y of [-600, 200, 500, 640, 1000]) {
            const target = { x, y, width, height }
            if (x < 700 && x + width > 500 && y < 620 && y + height > 500) continue
            const route = getConnectionGeometry(source, target)
            let previous = route.start
            for (let i = 1; i <= 100; i++) {
              const point = sample(route, i / 100)
              for (const card of [source, target]) {
                const inside = point.x > card.x + 1e-6 && point.x < card.x + card.width - 1e-6 &&
                  point.y > card.y + 1e-6 && point.y < card.y + card.height - 1e-6
                expect(inside).toBe(false)
              }
              expect((point.x - previous.x) * (route.end.x - route.start.x)).toBeGreaterThanOrEqual(-1e-6)
              expect((point.y - previous.y) * (route.end.y - route.start.y)).toBeGreaterThanOrEqual(-1e-6)
              previous = { ...route.start, ...point }
            }
            expect(route.midpoint).toEqual(sample(route, 0.5))
          }
        }
      }
    }
  })

  it('recomputes anchors when cards move or resize and supports missing heights', () => {
    expect(getConnectionGeometry(source, { ...source, x: 100 }).start.side).toBe('left')
    expect(getConnectionGeometry(source, { ...source, y: 100 }).start.side).toBe('top')
    const route = getConnectionGeometry({ ...source, height: undefined }, { ...source, x: 900, height: 300 })
    expect(route.start.y).toBe(600)
    expect(route.end.y).toBe(650)
  })

  it.each([
    { ...source },
    { ...source, x: 600 },
    { ...source, x: 700 },
    { ...source, x: 700, y: 620 },
  ])('handles touching and overlapping cards without invalid coordinates', (target) => {
    const route = getConnectionGeometry(source, target)
    expect(route.path).not.toMatch(/NaN|Infinity/)
    expect(Number.isFinite(route.midpoint.x)).toBe(true)
    expect(Number.isFinite(route.midpoint.y)).toBe(true)
  })

  it.each([
    [{ x: 100, y: 560 }, 'left'],
    [{ x: 900, y: 560 }, 'right'],
    [{ x: 600, y: 100 }, 'top'],
    [{ x: 600, y: 900 }, 'bottom'],
  ] as const)('previews toward the pointer at %o', (pointer, side) => {
    const route = getConnectionPreview(source, pointer)
    expect(route.start.side).toBe(side)
    expect(route.end.x).toBe(pointer.x)
    expect(route.end.y).toBe(pointer.y)
  })

  it('snaps the preview to the exact saved connection when hovering a target card', () => {
    const target = { x: 100, y: 300, width: 250, height: 150 }
    const route = getConnectionPreview(source, { x: 150, y: 320 }, target)
    expect(route).toEqual(getConnectionGeometry(source, target))
  })
})
