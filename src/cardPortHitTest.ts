import type { ConnectionSide } from './types'

export interface CardPortHit {
  port: { cardId: string; side: ConnectionSide }
  element: HTMLButtonElement
}

const portSelector = '.card-connection-port[data-port-card-id][data-connection-side]'
const sides: ConnectionSide[] = ['top', 'right', 'bottom', 'left']

// Overlapping hot areas must agree on the nearest visible anchor for hover,
// drag start and drop. The native hit stack also respects rounded corners.
export function findCardPortAtPoint(x: number, y: number): CardPortHit | null {
  const elements = document.elementsFromPoint(x, y)
  const frontPort = elements[0]?.closest<HTMLButtonElement>(portSelector)
  const viewport = frontPort?.closest('.canvas-viewport')
  // Do not reach through a toolbar, card grip or other covering control.
  if (!frontPort || !viewport) return null

  const visited = new Set<string>()
  let nearest: CardPortHit | null = null
  let nearestDistance = Infinity
  for (const hit of elements) {
    const element = hit.closest<HTMLButtonElement>(portSelector)
    if (!element || element.closest('.canvas-viewport') !== viewport) continue
    const cardId = element.dataset.portCardId
    const side = element.dataset.connectionSide as ConnectionSide
    if (!cardId || !sides.includes(side)) continue
    const key = JSON.stringify([cardId, side])
    if (visited.has(key)) continue
    visited.add(key)

    const dot = element.querySelector('span')
    if (!dot) continue
    const bounds = dot.getBoundingClientRect()
    const distance = (x - bounds.left - bounds.width / 2) ** 2
      + (y - bounds.top - bounds.height / 2) ** 2
    // Keep native stacking order for coincident/equidistant anchors.
    if (distance < nearestDistance) {
      nearest = { port: { cardId, side }, element }
      nearestDistance = distance
    }
  }
  return nearest
}
