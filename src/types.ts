export interface Card {
  id: string
  title: string
  content: string
  x: number
  y: number
  width: number
  height?: number
  sourceId?: string
}

export interface CanvasLabel {
  id: string
  text: string
  level: 0 | 1 | 2 | 3 | 4
  x: number
  y: number
  width: number
  sourceId?: string
}

export interface Section {
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

export interface Connection {
  id: string
  fromCardId: string
  toCardId: string
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
  viewport?: CanvasViewport
}

export interface AppData {
  schemaVersion: number
  canvases: Canvas[]
  activeCanvasId: string | null
  mainView: MainView
  journal: JournalData
  trackSystem: TrackSystemData
  uiState: UIState
  _syncTimestamp?: number
}

export type MainView = 'journal' | 'tracks' | 'boards'

export type BoardViewMode = 'overview' | 'canvas'

export type JournalViewMode = 'detail' | 'table'

export type TrackViewMode = 'overview' | 'detail' | 'reports'

export type TrackReportPeriod = 'week' | 'month' | 'quarter' | 'halfYear' | 'year'

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

export interface TrackDuration {
  unit: 'month' | 'year'
  count: number
}

export interface TrackMilestone {
  id: string
  title: string
  dueDate: string
  definition: string
  achievedAt?: string
}

export interface Track {
  id: string
  title: string
  summary: string
  duration: TrackDuration
  startDate: string
  status: 'active' | 'archived'
  color: string
  milestones: TrackMilestone[]
  actions: TrackAction[]
  createdAt: number
  updatedAt: number
}

export interface TrackActionFrequency {
  unit: 'daily' | 'workday' | 'weekly' | 'monthly'
  targetCount: number
}

export interface TrackAction {
  id: string
  title: string
  detail: string
  frequency: TrackActionFrequency
}

export interface TrackRevision {
  id: string
  trackId: string
  title: string
  summary: string
  reason: string
  effectiveFrom: string
  createdAt: number
}

export interface TrackCheckinEntry {
  id: string
  completedAt: number
}

export interface TrackCheckin {
  id: string
  trackId: string
  revisionId?: string | null
  actionId: string
  date: string
  count: number
  entries?: TrackCheckinEntry[]
  note?: string
  createdAt: number
  updatedAt: number
}

export interface TrackSystemData {
  tracks: Track[]
  revisions: TrackRevision[]
  checkins: TrackCheckin[]
}

export interface UIState {
  boardViewMode: BoardViewMode
  journalViewMode: JournalViewMode
  journalSelectedDate: string
  journalCalendarMonth: string
  selectedTrackId: string | null
  trackViewMode: TrackViewMode
  trackReportPeriod: TrackReportPeriod
}

export interface WebDAVConfig {
  server: string
  username: string
  password: string
}

export interface AppSettings {
  theme: 'light' | 'dark'
  webdav?: WebDAVConfig
  notifications: NotificationSettings
}

export interface QuietHours {
  enabled: boolean
  start: string
  end: string
}

export interface NotificationSettings {
  enabled: boolean
  runInBackground: boolean
  launchAtLogin: boolean
  quietHours: QuietHours
}

export interface WebDAVSyncSummary {
  canvasCount: number
  cardCount: number
  labelCount: number
  sectionCount: number
  connectionCount: number
  journalEntryCount: number
  trackCount: number
  trackCheckinCount: number
  totalEntityCount: number
}

export interface WebDAVSyncDecision {
  reason: 'remote-newer' | 'diverged' | 'destructive-remote' | 'remote-missing'
  risk: 'low' | 'high'
  message: string
  preferredResolution: 'keep-local' | 'use-remote'
  localSummary: WebDAVSyncSummary
  remoteSummary: WebDAVSyncSummary
  localTimestamp: number
  remoteTimestamp: number
}

export type WebDAVSyncResolution = 'keep-local' | 'use-remote' | 'dismiss'

export type WebDAVSyncAction = 'uploaded' | 'downloaded' | 'up-to-date' | 'needs-confirmation' | 'dismissed'

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

interface UpdateProgress {
  stage: 'downloading' | 'installing' | 'error' | 'cancelled'
  percent: number
}

interface SyncStatus {
  status: 'syncing' | 'success' | 'error' | 'warning'
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
      onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
      onUpdateProgress: (cb: (progress: UpdateProgress) => void) => () => void
      triggerUpdate: (downloadUrl: string, assetName: string) => Promise<{ success: boolean; error?: string }>
      cancelUpdate: () => Promise<{ success: boolean; error?: string }>
      getResumeProgress: (assetName: string) => Promise<number>
      checkUpdate: () => Promise<{ hasUpdate: boolean; version?: string; currentVersion: string }>
      webdavTest: (config: WebDAVConfig) => Promise<{ success: boolean; error?: string }>
      webdavUpload: (config: WebDAVConfig) => Promise<{ success: boolean; error?: string }>
      webdavDownload: (config: WebDAVConfig) => Promise<{ success: boolean; data?: AppData; error?: string }>
      webdavAutoSync: (config: WebDAVConfig) => Promise<WebDAVSyncResult>
      webdavStartupSync: (config: WebDAVConfig) => Promise<WebDAVSyncResult>
      webdavPeriodicSync: (config: WebDAVConfig) => Promise<WebDAVSyncResult>
      webdavResolveConflict: (config: WebDAVConfig, resolution: WebDAVSyncResolution) => Promise<WebDAVSyncResult>
      onSyncStatus: (cb: (status: SyncStatus) => void) => void
      exportBackup: () => Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
      importBackup: () => Promise<{ success: boolean; data?: AppData; error?: string }>
      checkBackupExists: () => Promise<BackupStatus>
      prepareClearAllCards: () => Promise<PrepareClearResult>
      clearAllCards: () => Promise<{ success: boolean; data?: AppData; error?: string }>
      getBackupDir: () => Promise<string>
      onTrackReminderOpen: (cb: (payload: { trackId: string; date: string }) => void) => () => void
    }
  }
}
