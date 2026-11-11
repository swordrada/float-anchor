import type { Card, ConnectionRoute } from './types'
import { getPlannedConnection } from './orthogonalRouting'
import { anchorAt, sourceConnectionSides } from './connectionAnchors'

type CardBounds = Pick<Card, 'x' | 'y' | 'width' | 'height'>
type Side = 'left' | 'right' | 'top' | 'bottom'
interface Point { x: number; y: number }
interface Anchor extends Point { side: Side }

const normals: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

function anchors(card: CardBounds): Anchor[] {
  const height = card.height ?? 200
  return [
    { side: 'right', x: card.x + card.width, y: card.y + height / 2 },
    { side: 'left', x: card.x, y: card.y + height / 2 },
    { side: 'bottom', x: card.x + card.width / 2, y: card.y + height },
    { side: 'top', x: card.x + card.width / 2, y: card.y },
  ]
}

function outwardDistance(anchor: Anchor, point: Point): number {
  const normal = normals[anchor.side]
  return (point.x - anchor.x) * normal.x + (point.y - anchor.y) * normal.y
}

function curvePoint(start: Point, c1: Point, c2: Point, end: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
  }
}

function makeCurve(start: Anchor, end: Anchor, curved = true) {
  // Limit handles to the forward gap: all controls remain monotone in x/y,
  // so the curve cannot double back or pass through either endpoint card.
  const startOffset = curved ? Math.max(0, outwardDistance(start, end)) * 0.4 : 0
  const endOffset = curved ? Math.max(0, outwardDistance(end, start)) * 0.4 : 0
  const c1 = {
    x: start.x + normals[start.side].x * startOffset,
    y: start.y + normals[start.side].y * startOffset,
  }
  const c2 = {
    x: end.x + normals[end.side].x * endOffset,
    y: end.y + normals[end.side].y * endOffset,
  }
  return {
    start, end, c1, c2,
    midpoint: curvePoint(start, c1, c2, end, 0.5),
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  }
}

function curveLength(curve: ReturnType<typeof makeCurve>): number {
  let length = 0
  let previous: Point = curve.start
  for (let i = 1; i <= 16; i++) {
    const point = curvePoint(curve.start, curve.c1, curve.c2, curve.end, i / 16)
    length += Math.hypot(point.x - previous.x, point.y - previous.y)
    previous = point
  }
  return length
}

export function getConnectionGeometry(from: CardBounds, to: CardBounds, route: ConnectionRoute = {}, obstacles: CardBounds[] = []) {
  if (route.routing === 'elbow' || route.routing === 'straight') return getPlannedConnection(from, to, route, obstacles)
  if (route.anchorMode === 'heptabase' || route.controlPoints?.length) {
    const [fromSide, toSide] = sourceConnectionSides(from, to, route)
    const start = anchorAt(from, fromSide), end = anchorAt(to, toSide)
    const points: Point[] = [start, ...(route.controlPoints ?? []), end]
    // Interpolate source waypoints, retaining endpoint tangents and smooth joins.
    const curves = points.slice(1).map((p, i) => {
      const previous = points[i], before = points[Math.max(0, i-1)], after = points[Math.min(points.length-1, i+2)]
      const handle = Math.hypot(p.x-previous.x, p.y-previous.y) / 3
      const c1 = i === 0
        ? { x: previous.x+normals[start.side].x*handle, y: previous.y+normals[start.side].y*handle }
        : { x: previous.x+(p.x-before.x)/6, y: previous.y+(p.y-before.y)/6 }
      const c2 = i === points.length-2
        ? { x: p.x+normals[end.side].x*handle, y: p.y+normals[end.side].y*handle }
        : { x: p.x-(after.x-previous.x)/6, y: p.y-(after.y-previous.y)/6 }
      return { c1, c2, end: p }
    })
    return { start, end, c1: curves[0].c1, c2: curves[curves.length-1].c2,
      midpoint: route.controlPoints?.[Math.floor(route.controlPoints.length/2)] ?? curvePoint(start, curves[0].c1, curves[0].c2, end, 0.5),
      path: `M ${start.x} ${start.y} ` + curves.map(c => `C ${c.c1.x} ${c.c1.y}, ${c.c2.x} ${c.c2.y}, ${c.end.x} ${c.end.y}`).join(' ') }
  }
  let best: ReturnType<typeof makeCurve> | undefined
  let bestLength = Infinity
  let closest: ReturnType<typeof makeCurve> | undefined
  let closestDistance = Infinity

  for (const start of anchors(from).filter(a => !route.fromSide || route.fromSide === 'auto' || a.side === route.fromSide)) {
    for (const end of anchors(to).filter(a => !route.toSide || route.toSide === 'auto' || a.side === route.toSide)) {
      const distance = Math.hypot(end.x - start.x, end.y - start.y)
      if (distance < closestDistance) {
        closestDistance = distance
        closest = makeCurve(start, end, false)
      }
      // Both anchors must face the other endpoint. This also admits mixed
      // sides (e.g. right → top) when they provide a shorter diagonal route.
      if (outwardDistance(start, end) <= 0 || outwardDistance(end, start) <= 0) continue
      const curve = makeCurve(start, end)
      const length = curveLength(curve)
      if (length < bestLength - 0.001) {
        best = curve
        bestLength = length
      }
    }
  }

  // Touching/overlapping cards may have no outward-facing pair. A straight
  // fallback stays finite and avoids manufacturing a loop around the cards.
  return best ?? closest!
}

export function getConnectionPreview(from: CardBounds, pointer: Point, target?: CardBounds, route: ConnectionRoute = {}, obstacles: CardBounds[] = []) {
  return getConnectionGeometry(from, target ?? { ...pointer, width: 0, height: 0 }, route, obstacles)
}
