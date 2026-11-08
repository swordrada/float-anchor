import { contentFingerprint } from '../../src/lib/syncData'
import type { AppData } from './summary'

/** A content clock is independent of filesystem mtime and viewport-only saves. */
export function prepareLocalSnapshot(incoming: AppData, current: AppData | null, previousMtime = 0): AppData {
  const changed = !current || contentFingerprint(incoming) !== contentFingerprint(current)
  const previous = current?._contentUpdatedAt ?? previousMtime ?? 0
  return {
    ...incoming,
    _syncTimestamp: current?._syncTimestamp ?? incoming._syncTimestamp ?? 0,
    _contentUpdatedAt: changed ? Math.max(Date.now(), previous + 1) : previous,
  }
}
