export interface Card {
  id: string
  title: string
  content: string
  x: number
  y: number
  width: number
  height?: number
  /** Creation order used while instant-mode cards are still auto-laid out. */
  instantOrder?: number
  sourceId?: string
}

export interface InstantModeTarget { requestId: number; cardId: string | null }
export interface InstantCardSave {
  cardId: string
  title: string
  content: string
  baseTitle: string
  baseContent: string
}
export type InstantCardSaveResult =
  | { success: true; card: Card; canvasId: string }
  | { success: false; reason: 'deleted' | 'conflict' | 'error'; error: string }

export interface CanvasLabel {
  id: string
  text: string
  level: 0 | 1 | 2 | 3 | 4
  x: number
  y: number
  width: number
  sourceId?: string
}

export interface SectionAppearance {
  color: string
  borderStyle: 'solid' | 'dashed'
  borderColor: string
}

export type SectionAppearancePatch = Partial<SectionAppearance>

export interface Section extends SectionAppearancePatch {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  cardIds?: string[]
  sourceId?: string
}

export interface TextBox {
  id: string
  text: string
  x: number
  y: number
  width: number
  height?: number
  sourceId?: string
}

export type ConnectionSide = 'top' | 'right' | 'bottom' | 'left'

export interface ConnectionAppearance {
  lineStyle: 'solid' | 'dashed'
  arrow: 'none' | 'end' | 'start' | 'both'
  strokeWidth: number
  label: string
}

export type ConnectionAppearancePatch = Partial<ConnectionAppearance>

export interface Connection extends ConnectionAppearancePatch {
  id: string
  fromCardId: string
  toCardId: string
  fromSide?: ConnectionSide
  toSide?: ConnectionSide
}

export interface CanvasViewport {
  panX: number
  panY: number
  scale: number
}

export interface Canvas {
  id: string
  name: string
  cards: Card[]
  labels?: CanvasLabel[]
  sections?: Section[]
  connections?: Connection[]
  texts?: TextBox[]
  viewport?: CanvasViewport
}

export interface AppData {
  canvases: Canvas[]
  activeCanvasId: string | null
  boardViewMode?: 'overview' | 'canvas'
  activeView?: 'boards' | 'journal'
  journal?: JournalData
  journalViewMode?: 'detail' | 'table'
  journalSelectedDate?: string
  _syncTimestamp?: number
}

export interface JournalEntry {
  date: string
  customTitle?: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface JournalData {
  entriesByDate: Record<string, JournalEntry>
}

export interface WebDAVConfig {
  server: string
  username: string
  password: string
}

export type SyncProvider = 'webdav' | 'github' | 'none'

export interface AppSettings {
  theme: 'light' | 'dark'
  webdav?: WebDAVConfig
  syncProvider?: SyncProvider
  github?: { repo: string; branch?: string }
}

export interface WebDAVSyncSummary {
  canvasCount: number
  cardCount: number
  labelCount: number
  sectionCount: number
  connectionCount: number
  totalEntityCount: number
  textCount: number
}

export interface WebDAVSyncDecision {
  reason: 'remote-newer' | 'diverged' | 'destructive-remote'
  risk: 'low' | 'high'
  message: string
  preferredResolution: 'keep-local' | 'use-remote'
  localSummary: WebDAVSyncSummary
  remoteSummary: WebDAVSyncSummary
  localTimestamp: number
  remoteTimestamp: number
}

export type WebDAVSyncResolution = 'keep-local' | 'use-remote'

export type WebDAVSyncAction = 'uploaded' | 'downloaded' | 'up-to-date' | 'needs-confirmation'

export interface WebDAVSyncResult {
  success: boolean
  action?: WebDAVSyncAction
  data?: AppData | null
  decision?: WebDAVSyncDecision
  error?: string
}

interface UpdateInfo {
  version: string
  currentVersion: string
  assetName: string
  downloadUrl: string
  resumePercent?: number
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  version?: string
  currentVersion: string
  error?: string
}

interface UpdateProgress {
  stage: 'downloading' | 'installing' | 'error' | 'cancelled'
  percent: number
}

interface SyncStatus {
  status: 'pending' | 'syncing' | 'success' | 'error' | 'warning'
  error?: string
}

interface BackupStatus {
  exists: boolean
  count?: number
  dir?: string
  latestFileName?: string
  latestTimestamp?: number
  hasRecentBackup?: boolean
}

interface PrepareClearResult extends BackupStatus {
  success: boolean
  backupCreated?: boolean
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      readData: () => Promise<AppData | null>
      writeData: (data: AppData) => Promise<boolean>
      readSettings: () => Promise<AppSettings | null>
      writeSettings: (data: AppSettings) => Promise<boolean>
      getPlatform: () => Promise<string>
      winMinimize: () => void
      winMaximize: () => void
      winClose: () => void
      openInstantMode: (cardId?: string) => Promise<boolean>
      getInstantTarget: () => Promise<InstantModeTarget | null>
      onInstantTarget: (cb: (target: InstantModeTarget) => void) => () => void
      saveInstantCard: (request: InstantCardSave) => Promise<InstantCardSaveResult>
      setInstantEditingCard: (cardId: string | null) => Promise<void>
      getInstantEditingCard: () => Promise<string | null>
      onInstantEditingCardChanged: (cb: (cardId: string | null) => void) => () => void
      onInstantCloseRequested: (cb: () => void) => () => void
      showCardInBoard: (cardId: string) => Promise<void>
      onShowCardInBoard: (cb: (cardId: string) => void) => () => void
      hideInstantMode: () => void
      closeInstantMode: () => void
      setInstantAlwaysOnTop: (value: boolean) => Promise<boolean>
      instantDataChanged: () => void
      onInstantDataChanged: (cb: () => void) => () => void
      onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
      onUpdateProgress: (cb: (progress: UpdateProgress) => void) => () => void
      triggerUpdate: (downloadUrl: string, assetName: string) => Promise<{ success: boolean; error?: string }>
      cancelUpdate: () => Promise<{ success: boolean; error?: string }>
      getResumeProgress: (assetName: string) => Promise<number>
      checkUpdate: () => Promise<UpdateCheckResult>
      syncTest: (config: WebDAVConfig) => Promise<{ success: boolean; error?: string }>
      syncAuto: () => Promise<WebDAVSyncResult>
      syncStartup: () => Promise<WebDAVSyncResult>
      syncPeriodic: () => Promise<WebDAVSyncResult>
      syncResolveConflict: (resolution: WebDAVSyncResolution) => Promise<WebDAVSyncResult>
      onSyncStatus: (cb: (status: SyncStatus) => void) => void
      exportBackup: () => Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
      importBackup: () => Promise<{ success: boolean; data?: AppData; error?: string }>
      checkBackupExists: () => Promise<BackupStatus>
      prepareClearAllData: () => Promise<PrepareClearResult>
      clearAllData: () => Promise<{ success: boolean; data?: AppData; error?: string }>
      getBackupDir: () => Promise<string>
      githubTest: (c: { repo: string; token: string; branch?: string }) => Promise<{ success: boolean; error?: string }>
      githubSaveToken: (token: string) => Promise<{ success: boolean }>
      githubClearToken: () => Promise<{ success: boolean }>
      githubHasToken: () => Promise<{ has: boolean }>
      githubAccount: () => Promise<{ login: string | null }>
      saveImage: (bytes: ArrayBuffer, mime?: string) => Promise<{ name?: string; error?: string }>
      migrateEmbeddedImages: () => Promise<{ success: boolean; count?: number; beforeBytes?: number; afterBytes?: number; error?: string }>
    }
  }
}
