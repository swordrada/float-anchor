import path from 'node:path'
import type { AppData, SyncResolution } from './summary'
import {
  normalizeSyncData, summarizeSyncData, hasMeaningfulSyncData, getComparableSyncSnapshot,
  isHighRiskRemoteOverwrite, buildSyncDecision,
} from './summary'
import type { RemoteAdapter, LocalStore, SyncResult } from './types'
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

async function uploadSnapshot(adapter: RemoteAdapter, store: LocalStore): Promise<AppData> {
  const local = store.readSnapshot()
  const data = normalizeSyncData(local, 0)
  data._syncTimestamp = Date.now()
  await uploadImagesDiff(adapter, store)
  await adapter.uploadRemoteSnapshot(data)
  store.writeSnapshot(data)
  store.markSynced(data._syncTimestamp)
  return data
}

async function applyRemote(adapter: RemoteAdapter, store: LocalStore, remoteData: any): Promise<AppData> {
  const normalized = normalizeSyncData(remoteData, Date.now())
  store.backup()
  store.writeSnapshot(normalized)
  store.markSynced(normalized._syncTimestamp || 0)
  await downloadMissingImages(adapter, store, normalized)
  return normalized
}

export async function reconcileState(
  adapter: RemoteAdapter,
  store: LocalStore,
  opts?: { remoteUnchanged?: boolean },
): Promise<SyncResult> {
  const localData = store.readSnapshot()
  const localTs = localData?._syncTimestamp || 0
  const localModifiedAt = store.getModifiedAt()
  const localDirty = !!localData && localModifiedAt > localTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS

  // 调用方已用 ETag/Last-Modified 确认远端自上次同步以来未变 → 跳过下载整份快照。
  // 远端 == 我们上次同步的状态，故本地脏即"本地领先"，直接上传无冲突；本地干净即已是最新。
  // 代价：无法下载远端做内容指纹比对，本地脏但内容恰好相同时会多上传一次（最坏与旧版下载等价，永不更差）。
  if (opts?.remoteUnchanged && localData) {
    if (localDirty) {
      await uploadSnapshot(adapter, store)
      return { success: true, action: 'uploaded' }
    }
    return { success: true, action: 'up-to-date' }
  }

  const localSummary = summarizeSyncData(localData)
  const localFingerprint = localData ? getComparableSyncSnapshot(localData) : ''
  const remote = await adapter.loadRemoteSnapshot()
  if (!remote) {
    if (localData && hasMeaningfulSyncData(localSummary)) {
      await uploadSnapshot(adapter, store)
      return { success: true, action: 'uploaded' }
    }
    return { success: true, action: 'up-to-date' }
  }

  const remoteData = remote.data
  const remoteTs = remoteData._syncTimestamp || 0
  const remoteSummary = summarizeSyncData(remoteData)
  const remoteFingerprint = getComparableSyncSnapshot(remoteData)
  const localMissingDownloaded = localData ? await downloadMissingImages(adapter, store, localData) : 0

  if (!localData) {
    if (hasMeaningfulSyncData(remoteSummary)) {
      const applied = await applyRemote(adapter, store, remoteData)
      return { success: true, action: 'downloaded', data: applied }
    }
    return { success: true, action: 'up-to-date' }
  }

  if (localFingerprint === remoteFingerprint) {
    if (localMissingDownloaded > 0) return { success: true, action: 'downloaded', data: localData }
    return { success: true, action: 'up-to-date' }
  }

  if (localDirty) {
    if (remoteTs > localTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS) {
      return { success: true, action: 'needs-confirmation', decision: buildSyncDecision(localData, remoteData, 'diverged') }
    }
    await uploadSnapshot(adapter, store)
    return { success: true, action: 'uploaded' }
  }

  if (localTs > remoteTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS) {
    await uploadSnapshot(adapter, store)
    return { success: true, action: 'uploaded' }
  }

  if (remoteTs > localTs + LOCAL_SYNC_DIRTY_TOLERANCE_MS) {
    if (!hasMeaningfulSyncData(localSummary) && hasMeaningfulSyncData(remoteSummary)) {
      const applied = await applyRemote(adapter, store, remoteData)
      return { success: true, action: 'downloaded', data: applied }
    }
    return {
      success: true,
      action: 'needs-confirmation',
      decision: buildSyncDecision(localData, remoteData, isHighRiskRemoteOverwrite(localSummary, remoteSummary) ? 'destructive-remote' : 'remote-newer'),
    }
  }

  if (!hasMeaningfulSyncData(localSummary) && hasMeaningfulSyncData(remoteSummary)) {
    const applied = await applyRemote(adapter, store, remoteData)
    return { success: true, action: 'downloaded', data: applied }
  }

  if (hasMeaningfulSyncData(localSummary) && !hasMeaningfulSyncData(remoteSummary)) {
    await uploadSnapshot(adapter, store)
    return { success: true, action: 'uploaded' }
  }

  return {
    success: true,
    action: 'needs-confirmation',
    decision: buildSyncDecision(localData, remoteData, isHighRiskRemoteOverwrite(localSummary, remoteSummary) ? 'destructive-remote' : 'diverged'),
  }
}

export async function resolveConflict(adapter: RemoteAdapter, store: LocalStore, resolution: SyncResolution): Promise<SyncResult> {
  if (resolution === 'keep-local') {
    if (!store.readSnapshot()) return { success: false, error: '没有找到本地数据文件' }
    const uploaded = await uploadSnapshot(adapter, store)
    return { success: true, action: 'uploaded', data: uploaded }
  }
  const remote = await adapter.loadRemoteSnapshot()
  if (!remote) return { success: false, error: '云端没有可用数据' }
  const applied = await applyRemote(adapter, store, remote.data)
  return { success: true, action: 'downloaded', data: applied }
}
