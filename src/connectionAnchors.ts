import type { Card, ConnectionRoute, ConnectionSide } from './types'

type Bounds = Pick<Card, 'x' | 'y' | 'width' | 'height'>
type Side = Exclude<ConnectionSide, 'auto'>
export function anchorAt(b: Bounds, side: Side) {
  return { side, x: b.x + (side === 'left' ? 0 : side === 'right' ? b.width : b.width / 2),
    y: b.y + (side === 'top' ? 0 : side === 'bottom' ? (b.height ?? 200) : (b.height ?? 200) / 2) }
}

/** Source-compatible automatic sides: a fixed side and manual waypoints guide the other end. */
export function sourceConnectionSides(a: Bounds, b: Bounds, route: ConnectionRoute): [Side, Side] {
  const sa = route.fromSide ?? 'auto', sb = route.toSide ?? 'auto'
  const points = route.controlPoints ?? []
  const nearest = (box: Bounds, point: { x: number; y: number }): Side =>
    (['top', 'right', 'bottom', 'left'] as Side[]).sort((s, t) => {
      const x = anchorAt(box, s), y = anchorAt(box, t)
      return Math.hypot(x.x-point.x, x.y-point.y) - Math.hypot(y.x-point.x, y.y-point.y)
    })[0]
  if (points.length) return [sa === 'auto' ? nearest(a, points[0]) : sa,
    sb === 'auto' ? nearest(b, points[points.length-1]) : sb]
  if (sa !== 'auto' && sb !== 'auto') return [sa, sb]
  if (sa === 'auto' && sb === 'auto') {
    const overlap = a.x < b.x+b.width && b.x < a.x+a.width
    if (overlap && b.y+(b.height ?? 200) < a.y) return ['top', 'bottom']
    if (overlap && b.y > a.y+(a.height ?? 200)) return ['bottom', 'top']
    return b.x+b.width/2 > a.x+a.width/2 ? ['right','left'] : ['left','right']
  }
  const fixed = sa === 'auto' ? b : a, auto = sa === 'auto' ? a : b
  const side = sa === 'auto' ? sb : sa
  const right = auto.x+auto.width, bottom = auto.y+(auto.height ?? 200)
  const fixedRight = fixed.x+fixed.width, fixedBottom = fixed.y+(fixed.height ?? 200)
  let other: Side
  if (side === 'top') other = bottom > fixed.y ? 'top' : auto.x > fixedRight ? 'left' : right < fixed.x ? 'right' : 'bottom'
  else if (side === 'bottom') other = auto.y < fixedBottom ? 'bottom' : right < fixed.x ? 'right' : auto.x > fixedRight ? 'left' : 'top'
  else if (side === 'right') other = auto.x < fixedRight ? 'right' : bottom < fixed.y ? 'bottom' : auto.y > fixedBottom ? 'top' : 'left'
  else other = right > fixed.x ? 'left' : auto.y > fixedBottom ? 'top' : bottom < fixed.y ? 'bottom' : 'right'
  return sa === 'auto' ? [other, sb as Side] : [sa, other]
}
