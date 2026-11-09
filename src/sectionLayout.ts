import type { Card, Section } from './types'

export const CARD_SNAP_GAP = 12
export const SECTION_PADDING = 24
export const SECTION_HEADER_HEIGHT = 36

/** Preserve reading order/columns, but resize every member before packing. */
export function fitSectionLayout(cards: Card[], section: Section, heights: Readonly<Record<string, number>>) {
  const ids = new Set(section.cardIds ?? [])
  const members = cards.filter((card) => ids.has(card.id))
  if (members.length === 0) return null
  // An incomplete measurement must not partially rearrange the section.
  if (members.some((card) => !Number.isFinite(heights[card.id]) || heights[card.id] <= 0)) return null

  const columns: Card[][] = []
  for (const card of [...members].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))) {
    const column = columns.find(([anchor]) => {
      const overlap = Math.min(card.x + card.width, anchor.x + anchor.width) - Math.max(card.x, anchor.x)
      return overlap > Math.min(card.width, anchor.width) / 2
    })
    if (column) column.push(card)
    else columns.push([card])
  }

  const startX = Math.round(Math.min(...members.map((card) => card.x)))
  const startY = Math.round(Math.min(...members.map((card) => card.y)))
  const fitted = new Map<string, Card>()
  let x = startX
  let right = startX
  let bottom = startY
  for (const column of columns) {
    let y = startY
    const width = Math.max(...column.map((card) => card.width))
    for (const card of column.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))) {
      const height = Math.max(80, Math.ceil(heights[card.id]))
      // Manual layout takes ownership from instant-mode automatic placement.
      fitted.set(card.id, { ...card, x, y, height, instantOrder: undefined })
      right = Math.max(right, x + card.width)
      bottom = Math.max(bottom, y + height)
      y += height + CARD_SNAP_GAP
    }
    x += width + CARD_SNAP_GAP
  }
  return {
    cards: cards.map((card) => fitted.get(card.id) ?? card),
    section: {
      ...section,
      x: startX - SECTION_PADDING,
      y: startY - SECTION_PADDING - SECTION_HEADER_HEIGHT,
      width: right - startX + SECTION_PADDING * 2,
      height: bottom - startY + SECTION_PADDING * 2 + SECTION_HEADER_HEIGHT,
    },
  }
}
