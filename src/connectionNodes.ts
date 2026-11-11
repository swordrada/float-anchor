import type { Canvas, Card, Connection } from './types'
import { labelHeight } from './canvasSnapping'

/** Endpoint IDs remain compatible with existing files; they may identify any canvas object. */
export function connectionNodes(canvas: Pick<Canvas, 'cards' | 'labels' | 'sections'>) {
  return new Map<string, Pick<Card, 'id' | 'x' | 'y' | 'width' | 'height'> & { name: string }>([
    ...canvas.cards.map(card => [card.id, { ...card, name: card.title || '无标题卡片' }] as const),
    ...(canvas.labels ?? []).map(label => [label.id, { ...label, height: labelHeight(label), name: label.text }] as const),
    ...(canvas.sections ?? []).map(section => [section.id, section] as const),
  ])
}

export function withoutConnectionsTo(connections: Connection[] | undefined, ids: Set<string>) {
  return (connections ?? []).filter(c => !ids.has(c.fromCardId) && !ids.has(c.toCardId))
}

export function connectionTarget(element: Element): string | null {
  const target = element.closest('[data-card-id], [data-label-id], [data-section-id]')
  return target?.getAttribute('data-card-id') ?? target?.getAttribute('data-label-id') ?? target?.getAttribute('data-section-id') ?? null
}
