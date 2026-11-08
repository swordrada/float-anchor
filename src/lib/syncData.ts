// View preferences belong to this device; only content participates in cloud sync.
export const REMOTE_SYNC_INTERVAL_MS = 5 * 60_000
const viewKeys = ['activeCanvasId', 'activeView', 'boardViewMode', 'journalViewMode', 'journalSelectedDate'] as const

export function syncContent(data: any) {
  return {
    canvases: (data?.canvases ?? []).map(({ viewport: _viewport, ...canvas }: any) => canvas),
    journal: { entriesByDate: data?.journal?.entriesByDate ?? {} },
  }
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

export function contentFingerprint(data: any): string {
  return JSON.stringify(canonical(syncContent(data)))
}

export function preserveLocalView<T extends { canvases: any[]; activeCanvasId: string | null }>(incoming: T, local: any): T {
  const result = { ...incoming } as T & Record<string, any>
  for (const key of viewKeys) if (local?.[key] !== undefined) (result as any)[key] = local[key]
  result.canvases = incoming.canvases.map(canvas => {
    const viewport = local?.canvases?.find((c: any) => c.id === canvas.id)?.viewport
    const { viewport: _remoteViewport, ...content } = canvas
    return viewport ? { ...content, viewport } : content
  })
  if (!result.canvases.some(c => c.id === result.activeCanvasId)) result.activeCanvasId = result.canvases[0]?.id ?? null
  return result
}
