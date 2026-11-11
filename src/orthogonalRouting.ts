import type { Card, ConnectionRoute, ConnectionSide } from './types'
import { sourceConnectionSides } from './connectionAnchors'

type Bounds = Pick<Card, 'x' | 'y' | 'width' | 'height'>
type Side = Exclude<ConnectionSide, 'auto'>
interface Point { x: number; y: number }
interface Anchor extends Point { side: Side }
const normal: Record<Side, Point> = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
}
function anchor(b: Bounds, side: Side): Anchor {
  const h = b.height ?? 200
  return { side, x: b.x + (side === 'left' ? 0 : side === 'right' ? b.width : b.width / 2),
    y: b.y + (side === 'top' ? 0 : side === 'bottom' ? h : h / 2) }
}
function automaticSides(a: Bounds, b: Bounds): [Side, Side] {
  // A column is a meaningful lane. Prefer facing horizontal edges whenever
  // columns are separated, even if their cards are far apart vertically.
  if (a.x + a.width <= b.x) return ['right', 'left']
  if (b.x + b.width <= a.x) return ['left', 'right']
  return a.y + (a.height ?? 200) / 2 <= b.y + (b.height ?? 200) / 2
    ? ['bottom', 'top'] : ['top', 'bottom']
}
function simplify(points: Point[]): Point[] {
  const result: Point[] = []
  for (const p of points) {
    const last = result[result.length - 1]
    if (last && p.x === last.x && p.y === last.y) continue
    const prev = result[result.length - 2]
    if (prev && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) result.pop()
    result.push(p)
  }
  return result
}
export function segmentHitsBounds(a: Point, b: Point, r: Bounds): boolean {
  const right = r.x + r.width, bottom = r.y + (r.height ?? 200), eps = 0.001
  if (a.x === b.x) return a.x > r.x + eps && a.x < right - eps &&
    Math.max(a.y, b.y) > r.y + eps && Math.min(a.y, b.y) < bottom - eps
  if (a.y === b.y) return a.y > r.y + eps && a.y < bottom - eps &&
    Math.max(a.x, b.x) > r.x + eps && Math.min(a.x, b.x) < right - eps
  return true
}
function clear(points: Point[], bounds: Bounds[]) {
  return points.slice(1).every((p, i) => bounds.every(r => !segmentHitsBounds(points[i], p, r)))
}
function midpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i]) {
      const t = remaining / lengths[i]
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t }
    }
    remaining -= lengths[i]
  }
  return points[0]
}

// Rectilinear visibility graph, used only when the simple shared lane is blocked.
// Dijkstra includes incoming direction to discourage needless bends.
function detour(start: Point, end: Point, bounds: Bounds[], clearance: number): Point[] | null {
  const xs = [...new Set([start.x, end.x, ...bounds.flatMap(r => [r.x - clearance, r.x + r.width + clearance])])].sort((a,b) => a-b)
  const ys = [...new Set([start.y, end.y, ...bounds.flatMap(r => [r.y - clearance, r.y + (r.height ?? 200) + clearance])])].sort((a,b) => a-b)
  const ny = ys.length
  const index = (p: Point) => xs.indexOf(p.x) * ny + ys.indexOf(p.y)
  const point = (i: number) => ({ x: xs[Math.floor(i / ny)], y: ys[i % ny] })
  const source = index(start), target = index(end)
  const distances = new Map<number, number>([[source * 3, 0]])
  const previous = new Map<number, number>()
  // Binary heap keeps large boards from paying a quadratic queue scan.
  const heap: { key: number; cost: number }[] = [{ key: source * 3, cost: 0 }]
  const push = (entry: { key: number; cost: number }) => {
    heap.push(entry); let i = heap.length - 1
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].cost <= entry.cost) break
      heap[i] = heap[parent]; i = parent }
    heap[i] = entry
  }
  const pop = () => {
    const first = heap[0], last = heap.pop()!
    if (heap.length) { let i = 0
      while (i * 2 + 1 < heap.length) { let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++
        if (heap[child].cost >= last.cost) break
        heap[i] = heap[child]; i = child }
      heap[i] = last }
    return first
  }
  while (heap.length) {
    const { key, cost } = pop()
    if (cost !== distances.get(key)) continue
    const node = Math.floor(key / 3), direction = key % 3
    if (node === target) {
      const path = [point(node)]; let k = key
      while (previous.has(k)) { k = previous.get(k)!; path.push(point(Math.floor(k / 3))) }
      return path.reverse()
    }
    const x = Math.floor(node / ny), y = node % ny
    for (const [nx, nyi, nextDirection] of [[x-1,y,1],[x+1,y,1],[x,y-1,2],[x,y+1,2]]) {
      if (nx < 0 || nx >= xs.length || nyi < 0 || nyi >= ys.length) continue
      const next = nx * ny + nyi, a = point(node), b = point(next)
      if (!clear([a, b], bounds)) continue
      const nextKey = next * 3 + nextDirection
      const nextCost = cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) +
        (direction && direction !== nextDirection ? 24 : 0)
      if (nextCost >= (distances.get(nextKey) ?? Infinity)) continue
      distances.set(nextKey, nextCost); previous.set(nextKey, key); push({ key: nextKey, cost: nextCost })
    }
  }
  return null
}

export function getPlannedConnection(from: Bounds, to: Bounds, route: ConnectionRoute, obstacles: Bounds[] = []) {
  const [autoFrom, autoTo] = route.anchorMode === 'heptabase' ? sourceConnectionSides(from, to, route) : automaticSides(from, to)
  const start = anchor(from, route.fromSide && route.fromSide !== 'auto' ? route.fromSide : autoFrom)
  const end = anchor(to, route.toSide && route.toSide !== 'auto' ? route.toSide : autoTo)
  const sn = normal[start.side], en = normal[end.side]
  const offset = Number.isFinite(route.laneOffset) ? route.laneOffset! : 0
  const bounds = [from, to, ...obstacles.filter(r => r !== from && r !== to)]
  let points: Point[] = [start, end]
  if (route.routing !== 'straight') {
    // First try a consistent mid-gap trunk. All links between the same two
    // columns share its x, so fan-outs remain orderly rather than crisscrossing.
    const candidates: Point[][] = []
    if (route.controlPoints?.length && route.controlPoints.every(p => p.direction)) {
      const manual: Point[] = [start]
      for (const control of route.controlPoints) {
        const last = manual[manual.length - 1]
        manual.push(control.direction === 'vertical' ? { x: control.x, y: last.y } : { x: last.x, y: control.y })
      }
      const last = manual[manual.length - 1]
      manual.push(en.x ? { x: last.x, y: end.y } : { x: end.x, y: last.y }, end)
      const first = manual.find(p => p.x !== start.x || p.y !== start.y)
      const beforeEnd = [...manual].reverse().find(p => p.x !== end.x || p.y !== end.y)
      if (first && beforeEnd && (first.x-start.x)*sn.x + (first.y-start.y)*sn.y >= 0 &&
          (beforeEnd.x-end.x)*en.x + (beforeEnd.y-end.y)*en.y >= 0) candidates.push(manual)
    }
    if (sn.x && en.x) {
      const x = (start.x + end.x) / 2 + offset
      if ((x-start.x)*sn.x >= 0 && (x-end.x)*en.x >= 0)
        candidates.push([start, {x,y:start.y}, {x,y:end.y}, end])
    } else if (sn.y && en.y) {
      const y = (start.y + end.y) / 2 + offset
      if ((y-start.y)*sn.y >= 0 && (y-end.y)*en.y >= 0)
        candidates.push([start, {x:start.x,y}, {x:end.x,y}, end])
    } else {
      const corner = sn.x ? {x:end.x,y:start.y} : {x:start.x,y:end.y}
      if ((corner.x-start.x)*sn.x + (corner.y-start.y)*sn.y >= 0 &&
          (corner.x-end.x)*en.x + (corner.y-end.y)*en.y >= 0) candidates.push([start,corner,end])
    }
    const candidate = candidates.find(p => clear(p, bounds))
    if (candidate) points = candidate
    else {
      const clearance = 12
      // Short stubs preserve the explicitly chosen entry/exit side.
      const a = {x:start.x+sn.x*clearance,y:start.y+sn.y*clearance}
      const b = {x:end.x+en.x*clearance,y:end.y+en.y*clearance}
      const path = detour(a, b, bounds, clearance)
      points = path ? [start, ...path, end] : [start, a, {x:a.x,y:b.y}, b, end]
    }
  }
  points = simplify(points)
  return { start, end, points, c1: points[1] ?? start, c2: points[points.length-2] ?? end,
    midpoint: midpoint(points), path: points.map((p,i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') }
}
