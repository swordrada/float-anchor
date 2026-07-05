export interface AppData {
  canvases: any[]
  activeCanvasId: string | null
  _syncTimestamp?: number
  [k: string]: any
}

export interface SyncSummary {
  canvasCount: number
  cardCount: number
  labelCount: number
  sectionCount: number
  connectionCount: number
  textCount: number
  totalEntityCount: number
}

export type SyncResolution = 'keep-local' | 'use-remote'
export type SyncReason = 'remote-newer' | 'diverged' | 'destructive-remote'
export type SyncAction = 'uploaded' | 'downloaded' | 'up-to-date' | 'needs-confirmation'

export interface SyncDecision {
  reason: SyncReason
  risk: 'low' | 'high'
  message: string
  preferredResolution: 'keep-local'
  localSummary: SyncSummary
  remoteSummary: SyncSummary
  localTimestamp: number
  remoteTimestamp: number
}

export function normalizeSyncData(data: any, fallbackSyncTimestamp = 0): AppData {
  return {
    ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
    canvases: Array.isArray(data?.canvases) ? data.canvases : [],
    activeCanvasId: data?.activeCanvasId ?? null,
    _syncTimestamp: typeof data?._syncTimestamp === 'number' ? data._syncTimestamp : fallbackSyncTimestamp,
  }
}

export function summarizeSyncData(data: any): SyncSummary {
  const normalized = normalizeSyncData(data)
  const canvases = normalized.canvases || []
  const cardCount = canvases.reduce((s: number, c: any) => s + (c.cards?.length || 0), 0)
  const labelCount = canvases.reduce((s: number, c: any) => s + (c.labels?.length || 0), 0)
  const sectionCount = canvases.reduce((s: number, c: any) => s + (c.sections?.length || 0), 0)
  const connectionCount = canvases.reduce((s: number, c: any) => s + (c.connections?.length || 0), 0)
  const textCount = canvases.reduce((s: number, c: any) => s + (c.texts?.length || 0), 0)
  return {
    canvasCount: canvases.length,
    cardCount,
    labelCount,
    sectionCount,
    connectionCount,
    textCount,
    totalEntityCount: cardCount + labelCount + sectionCount + connectionCount + textCount,
  }
}

export function hasMeaningfulSyncData(summary: SyncSummary): boolean {
  return summary.totalEntityCount > 0 || summary.canvasCount > 1
}

export function getComparableSyncSnapshot(data: any): string {
  const normalized = normalizeSyncData(data)
  return JSON.stringify({
    canvases: normalized.canvases,
    activeCanvasId: normalized.activeCanvasId,
  })
}

export function formatSyncSummary(summary: SyncSummary): string {
  return `${summary.canvasCount} 个画布、${summary.cardCount} 张卡片、${summary.labelCount} 个标题、${summary.sectionCount} 个分区、${summary.connectionCount} 条连线、${summary.textCount} 个文本框`
}

export function isHighRiskRemoteOverwrite(localSummary: SyncSummary, remoteSummary: SyncSummary): boolean {
  if (!hasMeaningfulSyncData(localSummary)) return false
  if (!hasMeaningfulSyncData(remoteSummary)) return true
  if (localSummary.cardCount >= 10 && remoteSummary.cardCount === 0) return true
  const entityLoss = localSummary.totalEntityCount - remoteSummary.totalEntityCount
  return entityLoss >= 20 && remoteSummary.totalEntityCount <= Math.floor(localSummary.totalEntityCount * 0.7)
}

export function buildSyncDecision(localData: any, remoteData: any, reason: SyncReason): SyncDecision {
  const normalizedLocal = normalizeSyncData(localData)
  const normalizedRemote = normalizeSyncData(remoteData)
  const localSummary = summarizeSyncData(normalizedLocal)
  const remoteSummary = summarizeSyncData(normalizedRemote)
  const highRisk = reason === 'destructive-remote' || isHighRiskRemoteOverwrite(localSummary, remoteSummary)

  let message = `检测到云端与本地数据不同步，当前仍会优先保留本地显示。请确认是保留本地上传，还是使用云端覆盖本地。`
  if (reason === 'remote-newer' && !highRisk) {
    message = `检测到云端有更新，本地仍会优先显示。请确认是否使用云端数据更新本地内容。`
  }
  if (highRisk) {
    message = `云端数据会把本地数据从 ${formatSyncSummary(localSummary)} 变成 ${formatSyncSummary(remoteSummary)}。这是高危操作，请确认是否继续使用云端数据覆盖本地。`
  }

  return {
    reason: highRisk ? 'destructive-remote' : reason,
    risk: highRisk ? 'high' : 'low',
    message,
    preferredResolution: 'keep-local',
    localSummary,
    remoteSummary,
    localTimestamp: normalizedLocal._syncTimestamp || 0,
    remoteTimestamp: normalizedRemote._syncTimestamp || 0,
  }
}
