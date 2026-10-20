import type { Card } from './types'

export interface ConnectionPoint {
  x: number
  y: number
}

export interface CardConnectionGeometry {
  path: string
  start: ConnectionPoint
  end: ConnectionPoint
  control1: ConnectionPoint
  control2: ConnectionPoint
  midpoint: ConnectionPoint
}

type CardBounds = Pick<Card, 'x' | 'y' | 'width' | 'height'>
type Bounds = Required<CardBounds>

function finite(value: number | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) ? value : fallback
}

function normalizeBounds(card: CardBounds): Bounds {
  return {
    x: finite(card.x, 0),
    y: finite(card.y, 0),
    width: Math.max(0, finite(card.width, 200)),
    height: Math.max(0, finite(card.height, 200)),
  }
}

function distanceSquared(from: ConnectionPoint, to: ConnectionPoint): number {
  return (to.x - from.x) ** 2 + (to.y - from.y) ** 2
}

function connectBounds(from: Bounds, to: Bounds): CardConnectionGeometry {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  const horizontalDirection = toCenter.x >= fromCenter.x ? 1 : -1
  const verticalDirection = toCenter.y >= fromCenter.y ? 1 : -1
  const horizontalStart = {
    x: from.x + (horizontalDirection > 0 ? from.width : 0),
    y: fromCenter.y,
  }
  const horizontalEnd = {
    x: to.x + (horizontalDirection > 0 ? 0 : to.width),
    y: toCenter.y,
  }
  const verticalStart = {
    x: fromCenter.x,
    y: from.y + (verticalDirection > 0 ? from.height : 0),
  }
  const verticalEnd = {
    x: toCenter.x,
    y: to.y + (verticalDirection > 0 ? 0 : to.height),
  }

  const horizontalGap = (horizontalEnd.x - horizontalStart.x) * horizontalDirection
  const verticalGap = (verticalEnd.y - verticalStart.y) * verticalDirection
  // Use an axis separating the rectangles so the curve stays between the cards.
  // For diagonal or overlapping rectangles, prefer the nearer pair of ports.
  const nearerHorizontal = distanceSquared(horizontalStart, horizontalEnd) <= distanceSquared(verticalStart, verticalEnd)
  const horizontal = horizontalGap >= 0
    ? verticalGap < 0 || nearerHorizontal
    : verticalGap < 0 && nearerHorizontal
  const start = horizontal ? horizontalStart : verticalStart
  const end = horizontal ? horizontalEnd : verticalEnd
  const bend = Math.abs(horizontal ? end.x - start.x : end.y - start.y) * 0.4
  const control1 = horizontal
    ? { x: start.x + horizontalDirection * bend, y: start.y }
    : { x: start.x, y: start.y + verticalDirection * bend }
  const control2 = horizontal
    ? { x: end.x - horizontalDirection * bend, y: end.y }
    : { x: end.x, y: end.y - verticalDirection * bend }
  const midpoint = {
    x: (start.x + 3 * control1.x + 3 * control2.x + end.x) / 8,
    y: (start.y + 3 * control1.y + 3 * control2.y + end.y) / 8,
  }

  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
    start,
    end,
    control1,
    control2,
    midpoint,
  }
}

export function getCardConnectionGeometry(from: CardBounds, to: CardBounds): CardConnectionGeometry {
  return connectBounds(normalizeBounds(from), normalizeBounds(to))
}

export function getCardConnectionPreview(from: CardBounds, pointer: ConnectionPoint): CardConnectionGeometry {
  return connectBounds(normalizeBounds(from), normalizeBounds({ ...pointer, width: 0, height: 0 }))
}
