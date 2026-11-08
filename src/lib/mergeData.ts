import type { AppData } from '../types'

export class DataConflictError extends Error {}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const entities = (v: unknown): v is Array<Record<string, unknown> & { id: string }> =>
  Array.isArray(v) && v.every((item) => object(item) && typeof item.id === 'string')

function merge(base: unknown, incoming: unknown, current: unknown): unknown {
  if (equal(incoming, base)) return current
  if (equal(current, base) || equal(incoming, current)) return incoming
  if (entities(base) && entities(incoming) && entities(current)) {
    const byId = (items: typeof base) => new Map(items.map((item) => [item.id, item]))
    const b = byId(base), i = byId(incoming), c = byId(current)
    // Keep current ordering and append newly created entities, preserving concurrent additions.
    return [...new Set([...c.keys(), ...i.keys()])].flatMap((id) => {
      const value = merge(b.get(id), i.get(id), c.get(id))
      return value === undefined ? [] : [value]
    })
  }
  if (object(base) && object(incoming) && object(current)) {
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(base), ...Object.keys(incoming), ...Object.keys(current)])) {
      const value = merge(base[key], incoming[key], current[key])
      if (value !== undefined) result[key] = value
    }
    return result
  }
  throw new DataConflictError('内容已在其他窗口更新，请保留当前编辑后重新打开。')
}

/** Three-way merge stops stale renderer snapshots overwriting unrelated/newer notes. */
export function mergeAppData(base: AppData, incoming: AppData, current: AppData): AppData {
  const viewKeys = ['activeCanvasId', 'activeView', 'boardViewMode', 'journalViewMode', 'journalSelectedDate'] as const
  const b = { ...base }, i = { ...incoming }, c = { ...current }
  for (const key of [...viewKeys, '_syncTimestamp', '_contentUpdatedAt'] as const) {
    delete (b as unknown as Record<string, unknown>)[key]
    delete (i as unknown as Record<string, unknown>)[key]
    delete (c as unknown as Record<string, unknown>)[key]
  }
  const merged = merge(b, i, c) as AppData
  for (const key of viewKeys) (merged as unknown as Record<string, unknown>)[key] = incoming[key] === base[key] ? current[key] : incoming[key]
  if (current._syncTimestamp !== undefined) merged._syncTimestamp = current._syncTimestamp
  if (current._contentUpdatedAt !== undefined) merged._contentUpdatedAt = current._contentUpdatedAt
  return merged
}
