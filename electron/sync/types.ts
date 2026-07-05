import type { AppData, SyncAction, SyncDecision } from './summary'

export interface RemoteImageEntry { name: string; size: number }

export interface RemoteAdapter {
  test(): Promise<{ ok: boolean; error?: string }>
  loadRemoteSnapshot(): Promise<{ data: AppData; tag?: string } | null>
  uploadRemoteSnapshot(data: AppData, opts?: { ifMatch?: string }): Promise<{ tag?: string }>
  getRemoteTag?(): Promise<string | null>
  listRemoteImages(): Promise<RemoteImageEntry[]>
  uploadImage(name: string, buf: Buffer): Promise<void>
  downloadImage(name: string): Promise<Buffer>
}

export interface LocalImage { name: string; size: number }

export interface LocalStore {
  readSnapshot(): AppData | null
  writeSnapshot(data: AppData): void
  getModifiedAt(): number
  markSynced(syncTimestamp: number): void
  backup(): void
  listImages(): LocalImage[]
  readImage(name: string): Buffer | null
  writeImage(name: string, buf: Buffer): void
  getMissingImageNames(data: AppData): string[]
  resolveStoredImagePath(name: string): string | null
}

export interface SyncResult {
  success: boolean
  action?: SyncAction
  data?: AppData | null
  decision?: SyncDecision
  error?: string
}
