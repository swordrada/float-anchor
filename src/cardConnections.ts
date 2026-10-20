import type { Card, ConnectionSide } from './types'

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
type ConnectionPorts = { fromSide?: ConnectionSide; toSide?: ConnectionSide }
type ResolvedConnectionSides = { fromSide: ConnectionSide; toSide: ConnectionSide }

function finite(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  // Extreme imported coordinates must not overflow the path or its midpoint.
  return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, value))
}

function normalizeBounds(card: CardBounds): Bounds {
  return {
    x: finite(card?.x, 0),
    y: finite(card?.y, 0),
    width: Math.max(0, finite(card?.width, 200)),
    height: Math.max(0, finite(card?.height, 200)),
  }
}

const SIDE_NORMALS: Record<ConnectionSide, ConnectionPoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

function validSide(side: ConnectionSide | undefined): ConnectionSide | undefined {
  return side === 'top' || side === 'right' || side === 'bottom' || side === 'left' ? side : undefined
}

function pointOnSide(card: Bounds, side: ConnectionSide): ConnectionPoint {
  switch (side) {
    case 'top': return { x: card.x + card.width / 2, y: card.y }
    case 'right': return { x: card.x + card.width, y: card.y + card.height / 2 }
    case 'bottom': return { x: card.x + card.width / 2, y: card.y + card.height }
    case 'left': return { x: card.x, y: card.y + card.height / 2 }
  }
}

export function getCardConnectionPoint(card: CardBounds, side: ConnectionSide): ConnectionPoint {
  return pointOnSide(normalizeBounds(card), validSide(side) ?? 'right')
}

function distanceSquared(from: ConnectionPoint, to: ConnectionPoint): number {
  return (to.x - from.x) ** 2 + (to.y - from.y) ** 2
}

function resolveBoundsSides(
  from: Bounds,
  to: Bounds,
  ports?: ConnectionPorts,
): ResolvedConnectionSides {
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
  const automaticFromSide: ConnectionSide = horizontal
    ? horizontalDirection > 0 ? 'right' : 'left'
    : verticalDirection > 0 ? 'bottom' : 'top'
  const automaticToSide: ConnectionSide = horizontal
    ? horizontalDirection > 0 ? 'left' : 'right'
    : verticalDirection > 0 ? 'top' : 'bottom'
  return {
    fromSide: validSide(ports?.fromSide) ?? automaticFromSide,
    toSide: validSide(ports?.toSide) ?? automaticToSide,
  }
}

export function resolveCardConnectionSides(
  from: CardBounds,
  to: CardBounds,
  ports?: ConnectionPorts,
): ResolvedConnectionSides {
  return resolveBoundsSides(normalizeBounds(from), normalizeBounds(to), ports)
}

function connectBounds(from: Bounds, to: Bounds, ports?: ConnectionPorts): CardConnectionGeometry {
  const { fromSide, toSide } = resolveBoundsSides(from, to, ports)
  const start = pointOnSide(from, fromSide)
  const end = pointOnSide(to, toSide)
  const hasFixedPort = validSide(ports?.fromSide) || validSide(ports?.toSide)
  const horizontal = fromSide === 'left' || fromSide === 'right'
  // Fixed ports keep an outward tangent even for equal-axis or coincident ports.
  // Automatic records retain their original bend and route.
  const bend = hasFixedPort
    ? Math.max(24, Math.min(240, Math.hypot(end.x - start.x, end.y - start.y) * 0.4))
    : Math.abs(horizontal ? end.x - start.x : end.y - start.y) * 0.4
  const fromNormal = SIDE_NORMALS[fromSide]
  const toNormal = SIDE_NORMALS[toSide]
  const control1 = { x: start.x + fromNormal.x * bend, y: start.y + fromNormal.y * bend }
  const control2 = { x: end.x + toNormal.x * bend, y: end.y + toNormal.y * bend }
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

export function getCardConnectionGeometry(
  from: CardBounds,
  to: CardBounds,
  ports?: ConnectionPorts,
): CardConnectionGeometry {
  return connectBounds(normalizeBounds(from), normalizeBounds(to), ports)
}

export function getCardConnectionPreview(
  from: CardBounds,
  pointer: ConnectionPoint,
  fromSide?: ConnectionSide,
): CardConnectionGeometry {
  return connectBounds(normalizeBounds(from), normalizeBounds({ ...pointer, width: 0, height: 0 }), { fromSide })
}
