const LINE_DELTA_IN_PIXELS = 16
const PAGE_DELTA_IN_PIXELS = 160
const MAX_ZOOM_DELTA_IN_PIXELS = 20
const ZOOM_SENSITIVITY = 0.003

function wheelDeltaInPixels(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) return 0
  if (deltaMode === 1) return deltaY * LINE_DELTA_IN_PIXELS
  if (deltaMode === 2) return deltaY * PAGE_DELTA_IN_PIXELS
  return deltaY
}

export function getWheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixelDelta = wheelDeltaInPixels(deltaY, deltaMode)
  const limitedDelta = Math.min(
    Math.max(pixelDelta, -MAX_ZOOM_DELTA_IN_PIXELS),
    MAX_ZOOM_DELTA_IN_PIXELS,
  )
  return Math.exp(-limitedDelta * ZOOM_SENSITIVITY)
}
