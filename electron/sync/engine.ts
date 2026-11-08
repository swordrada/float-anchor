import path from 'node:path'
import type { AppData, SyncResolution } from './summary'
import {
  normalizeSyncData, summarizeSyncData, hasMeaningfulSyncData, getComparableSyncSnapshot,
  isHighRiskRemoteOverwrite, buildSyncDecision,
} from './summary'
import type { RemoteAdapter, LocalStore, SyncResult } from './types'
import { syncContent, preserveLocalView } from '../../src/lib/syncData'
import { isRemoteImageNameMatch, getImageBasename } from './image-names'

export const LOCAL_SYNC_DIRTY_TOLERANCE_MS = 1500

async function uploadImagesDiff(adapter: RemoteAdapter, store: LocalStore) {
  const local = store.listImages()
  if (local.length === 0) return
  const remote = await adapter.listRemoteImages()
  const remoteByName = new Map(remote.map((r) => [r.name, r.size]))
  for (const img of local) {
    const remoteSize = remoteByName.get(img.name)
    if (remoteSize === img.size) continue // 同名同大小，跳过
    const buf = store.readImage(img.name)
    if (buf) await adapter.uploadImage(img.name, buf)
  }
}

export async function downloadMissingImages(adapter: RemoteAdapter, store: LocalStore, data: AppData): Promise<number> {
  const missing = store.getMissingImageNames(data)
  if (missing.length === 0) return 0
  const remote = await adapter.listRemoteImages()
  if (remote.length === 0) return 0
  let n = 0
  for (const name of missing) {
    const wantedBase = getImageBasename(name)
    const entry = remote.find((r) => isRemoteImageNameMatch(wantedBase, r.name))
    if (!entry) continue
    const buf = await adapter.downloadImage(entry.name)
    // 落盘名：若引用名扩展名与远端一致则用引用名，否则用远端文件名（保留实际格式）
    const refExt = path.extname(name).toLowerCase()
    const remoteExt = path.extname(entry.name).toLowerCase()
    const localFileName = (refExt && refExt === remoteExt) ? (wantedBase || entry.name) : entry.name
    store.writeImage(localFileName, buf)
    n += 1
  }
  return n
}

function contentTime(data: AppData | null): number {
  return data?._contentUpdatedAt ?? data?._syncTimestamp ?? 0
}

function acknowledge(store: LocalStore, data: AppData, tag?: string) {
  store.writeSyncBaseline({
    fingerprint: getComparableSyncSnapshot(data),
    contentUpdatedAt: contentTime(data),
    syncTimestamp: data._syncTimestamp || 0,
    tag,
  })
  // Network I/O may have overlapped another local save. Never write an old
  // uploaded snapshot back over newer edits (including local view preferences).
  const current = store.readSnapshot()
  if (current && getComparableSyncSnapshot(current) === getComparableSyncSnapshot(data)) {
    store.writeSnapshot({ ...current, _syncTimestamp: data._syncTimestamp, _contentUpdatedAt: contentTime(data) })
    store.markSynced(data._syncTimestamp || 0)
  }
}

async function uploadSnapshot(adapter: RemoteAdapter, store: LocalStore, remote: { data: AppData; tag?: string } | null): Promise<SyncResult> {
  const local = store.readSnapshot()
  if (!local) return { success: false, error: '没有找到本地数据文件' }
  const data: AppData = {
    ...syncContent(local),
    activeCanvasId: local.canvases[0]?.id ?? null,
    _contentUpdatedAt: contentTime(local) || store.getModifiedAt(),
    _syncTimestamp: Math.max(Date.now(), (remote?.data._syncTimestamp || 0) + 1),
  }
  await uploadImagesDiff(adapter, store)
  const uploaded = await adapter.uploadRemoteSnapshot(data, { ifMatch: remote?.tag, createOnly: !remote })
  acknowledge(store, data, uploaded.tag)
  const pending = getComparableSyncSnapshot(store.readSnapshot()) !== getComparableSyncSnapshot(data)
  return { success: true, action: 'uploaded', pending }
}

async function applyRemote(adapter: RemoteAdapter, store: LocalStore, remote: { data: AppData; tag?: string }, expected: AppData | null): Promise<SyncResult> {
  const normalized = normalizeSyncData(remote.data)
  await downloadMissingImages(adapter, store, normalized)
  const current = store.readSnapshot()
  // A user may still be typing while the network is slow. Preserve those edits.
  if (getComparableSyncSnapshot(current) !== getComparableSyncSnapshot(expected)) {
    return { success: true, action: 'needs-confirmation', decision: buildSyncDecision(current, normalized, 'diverged') }
  }
  store.backup()
  const applied = preserveLocalView(normalized, current)
  store.writeSnapshot(applied)
  acknowledge(store, applied, remote.tag)
  return { success: true, action: 'downloaded', data: applied }
}

export async function reconcileState(adapter: RemoteAdapter, store: LocalStore): Promise<SyncResult> {
  const initial = store.readSnapshot()
  const baseline = store.readSyncBaseline()
  // A cached tag is only useful together with the content it actually described.
  // Unknown tags are never used as a shortcut after a conflict or a restart.
  if (baseline?.tag && adapter.getRemoteTag && initial
      && baseline.fingerprint === getComparableSyncSnapshot(initial)
      && store.getMissingImageNames(initial).length === 0) {
    if (await adapter.getRemoteTag() === baseline.tag) return {
      success: true, action: 'up-to-date',
      pending: getComparableSyncSnapshot(store.readSnapshot()) !== baseline.fingerprint,
    }
  }
  const remote = await adapter.loadRemoteSnapshot()
  // Re-read after network I/O, not before it.
  const localData = store.readSnapshot()
  const localSummary = summarizeSyncData(localData)
  if (!remote) {
    if (localData && hasMeaningfulSyncData(localSummary)) return uploadSnapshot(adapter, store, null)
    return { success: true, action: 'up-to-date' }
  }
  const remoteData = remote.data
  const remoteSummary = summarizeSyncData(remoteData)
  const localFingerprint = getComparableSyncSnapshot(localData)
  const remoteFingerprint = getComparableSyncSnapshot(remoteData)
  if (!localData) return applyRemote(adapter, store, remote, null)

  if (localFingerprint === remoteFingerprint) {
    const downloaded = await downloadMissingImages(adapter, store, localData)
    acknowledge(store, remoteData, remote.tag)
    const pending = getComparableSyncSnapshot(store.readSnapshot()) !== remoteFingerprint
    return { success: true, action: downloaded ? 'downloaded' : 'up-to-date', data: downloaded ? store.readSnapshot() : undefined, pending }
  }

  const confirm = (reason: 'diverged' | 'destructive-remote') => ({
    success: true, action: 'needs-confirmation' as const,
    decision: buildSyncDecision(localData, remoteData, reason),
  })
  const download = () => isHighRiskRemoteOverwrite(localSummary, remoteSummary)
    ? Promise.resolve(confirm('destructive-remote'))
    : applyRemote(adapter, store, remote, localData)

  if (baseline) {
    const localChanged = localFingerprint !== baseline.fingerprint
    const remoteChanged = remoteFingerprint !== baseline.fingerprint
    if (!localChanged) return download()
    if (contentTime(localData) < baseline.contentUpdatedAt) return download()
    if (!remoteChanged) {
      return uploadSnapshot(adapter, store, remote)
    }
    return confirm('diverged')
  }

  // Upgrade path for legacy snapshots without a saved common ancestor. Keep
  // ambiguous simultaneous changes for review instead of last-writer-wins.
  const localTs = localData._syncTimestamp || 0
  const remoteTs = remoteData._syncTimestamp || 0
  const localModified = localData._contentUpdatedAt ?? store.getModifiedAt()
  const localDirty = localModified > localTs + (localData._contentUpdatedAt === undefined ? LOCAL_SYNC_DIRTY_TOLERANCE_MS : 0)
  if (!hasMeaningfulSyncData(localSummary) && hasMeaningfulSyncData(remoteSummary) && !localTs) return download()
  if (localDirty && remoteTs > localTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS) return confirm('diverged')
  if (localDirty || localTs > remoteTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS) return uploadSnapshot(adapter, store, remote)
  if (remoteTs > localTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS) return download()
  return confirm('diverged')
}

export async function resolveConflict(adapter: RemoteAdapter, store: LocalStore, resolution: SyncResolution): Promise<SyncResult> {
  const remote = await adapter.loadRemoteSnapshot()
  if (resolution === 'keep-local') return uploadSnapshot(adapter, store, remote)
  if (!remote) return { success: false, error: '云端没有可用数据' }
  return applyRemote(adapter, store, remote, store.readSnapshot())
}
