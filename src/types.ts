export interface Card {
  id: string
  title: string
  content: string
  x: number
  y: number
  width: number
  height?: number
}

export interface CanvasLabel {
  id: string
  text: string
  level: 0 | 1 | 2 | 3 | 4
  x: number
  y: number
  width: number
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
  canvases: Canvas[]
  activeCanvasId: string | null
  _syncTimestamp?: number
}

export interface WebDAVConfig {
  server: string
  username: string
  password: string
}

export interface AppSettings {
  theme: 'light' | 'dark'
  webdav?: WebDAVConfig
}

interface UpdateInfo {
  version: string
  currentVersion: string
  assetName: string
  downloadUrl: string
}

interface UpdateProgress {
  stage: 'downloading' | 'installing' | 'error'
  percent: number
}

interface SyncStatus {
  status: 'syncing' | 'success' | 'error'
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
      onUpdateAvailable: (cb: (info: UpdateInfo) => void) => void
      onUpdateProgress: (cb: (progress: UpdateProgress) => void) => void
      triggerUpdate: (downloadUrl: string, assetName: string) => Promise<{ success: boolean; error?: string }>
      webdavTest: (config: WebDAVConfig) => Promise<{ success: boolean; error?: string }>
      webdavUpload: (config: WebDAVConfig) => Promise<{ success: boolean; error?: string }>
      webdavDownload: (config: WebDAVConfig) => Promise<{ success: boolean; data?: AppData; error?: string }>
      webdavAutoSync: (config: WebDAVConfig) => Promise<{ success: boolean; error?: string }>
      webdavStartupSync: (config: WebDAVConfig) => Promise<{ success: boolean; action?: string; data?: AppData; error?: string }>
      onSyncStatus: (cb: (status: SyncStatus) => void) => void
    }
  }
}
