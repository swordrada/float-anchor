import type { Canvas, CanvasLabel } from './types'
import { CARD_SNAP_GAP, CARD_VERTICAL_SNAP_GAP } from './sectionLayout'

export interface SnapRect { id: string; x: number; y: number; width: number; height: number; kind?: 'card' | 'label' | 'section' }
export const LABEL_SNAP_GAP = 4
export const LABEL_FONT_SIZES = [14, 28, 22, 18, 15] as const
export function labelHeight(label: Pick<CanvasLabel, 'level'>): number {
  return LABEL_FONT_SIZES[label.level] * 1.3 + 14
}

export function canvasSnapRects(canvas: Canvas): SnapRect[] {
  return [
    ...canvas.cards.map(c => ({ ...c, height: c.height ?? 300 })),
    ...(canvas.labels ?? []).map(l => ({ ...l, kind: 'label' as const, height: labelHeight(l) })),
    ...(canvas.sections ?? []),
  ]
}

// One delta for the whole selection preserves its internal arrangement.
// Only nearby objects attract: distant columns must not make a drag sticky.
export function snapCanvasRects(moving: SnapRect[], targets: SnapRect[], scale = 1) {
  const threshold = 6 / Math.max(0.15, scale)
  let dx = 0, dy = 0, bestX = threshold, bestY = threshold
  const ids = new Set(moving.map(r => r.id))
  for (const self of moving) for (const other of targets) {
    if (ids.has(other.id)) continue
    const hasLabel = self.kind === 'label' || other.kind === 'label'
    const gapX = hasLabel ? LABEL_SNAP_GAP : CARD_SNAP_GAP
    const gapY = hasLabel ? LABEL_SNAP_GAP : CARD_VERTICAL_SNAP_GAP
    const nearX = self.x <= other.x + other.width + gapX + threshold &&
      self.x + self.width >= other.x - gapX - threshold
    const nearY = self.y <= other.y + other.height + gapY + threshold &&
      self.y + self.height >= other.y - gapY - threshold
    if (!nearX || !nearY) continue
    const xs = [other.x, other.x + other.width - self.width,
      other.x + (other.width - self.width) / 2,
      other.x + other.width + gapX, other.x - gapX - self.width]
    const ys = [other.y, other.y + other.height - self.height,
      other.y + (other.height - self.height) / 2,
      other.y + other.height + gapY, other.y - gapY - self.height]
    for (const x of xs) if (Math.abs(x - self.x) < bestX) {
      bestX = Math.abs(x - self.x); dx = x - self.x
    }
    for (const y of ys) if (Math.abs(y - self.y) < bestY) {
      bestY = Math.abs(y - self.y); dy = y - self.y
    }
  }
  return { dx, dy, snappedX: bestX < threshold, snappedY: bestY < threshold }
}
