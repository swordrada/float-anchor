import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  readData: () => ipcRenderer.invoke('read-data'),
  writeData: (data: unknown) => ipcRenderer.invoke('write-data', data),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (data: unknown) => ipcRenderer.invoke('write-settings', data),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),
  onBeforeClose: (cb: () => Promise<void>) => {
    const cancel = () => { document.body.inert = false }
    const handler = async (_e: unknown, requestId: number) => {
      try {
        await cb()
        ipcRenderer.send('close-save-complete', requestId, true)
      } catch {
        cancel()
        ipcRenderer.send('close-save-complete', requestId, false)
      }
    }
    ipcRenderer.on('close-save-request', handler)
    ipcRenderer.on('close-save-cancelled', cancel)
    return () => {
      ipcRenderer.removeListener('close-save-request', handler)
      ipcRenderer.removeListener('close-save-cancelled', cancel)
    }
  },
  openInstantMode: (cardId?: string) => ipcRenderer.invoke('instant-mode-open', cardId),
  getInstantTarget: () => ipcRenderer.invoke('instant-mode-target'),
  onInstantTarget: (cb: (target: any) => void) => {
    const handler = (_e: any, target: any) => cb(target)
    ipcRenderer.on('instant-mode-target', handler)
    return () => ipcRenderer.removeListener('instant-mode-target', handler)
  },
  saveInstantCard: (request: any) => ipcRenderer.invoke('instant-card-save', request),
  setInstantEditingCard: (id: string | null) => ipcRenderer.invoke('instant-editing-card', id),
  getInstantEditingCard: () => ipcRenderer.invoke('instant-editing-card-get'),
  onInstantEditingCardChanged: (cb: (id: string | null) => void) => {
    const handler = (_e: any, id: string | null) => cb(id)
    ipcRenderer.on('instant-editing-card', handler)
    return () => ipcRenderer.removeListener('instant-editing-card', handler)
  },
  onInstantCloseRequested: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('instant-close-requested', handler)
    return () => ipcRenderer.removeListener('instant-close-requested', handler)
  },
  showCardInBoard: (id: string) => ipcRenderer.invoke('show-card-in-board', id),
  onShowCardInBoard: (cb: (id: string) => void) => {
    const handler = (_e: any, id: string) => cb(id)
    ipcRenderer.on('show-card-in-board', handler)
    return () => ipcRenderer.removeListener('show-card-in-board', handler)
  },
  hideInstantMode: () => ipcRenderer.send('instant-mode-hide'),
  closeInstantMode: () => ipcRenderer.send('instant-mode-close'),
  setInstantAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke('instant-mode-always-on-top', value),
  instantDataChanged: () => ipcRenderer.send('instant-mode-data-changed'),
  onInstantDataChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('instant-mode-data-changed', handler)
    return () => { ipcRenderer.removeListener('instant-mode-data-changed', handler) }
  },
  onUpdateAvailable: (cb: (info: any) => void) => {
    const handler = (_e: any, info: any) => cb(info)
    ipcRenderer.on('update-available', handler)
    return () => { ipcRenderer.removeListener('update-available', handler) }
  },
  onUpdateProgress: (cb: (progress: any) => void) => {
    const handler = (_e: any, progress: any) => cb(progress)
    ipcRenderer.on('update-progress', handler)
    return () => { ipcRenderer.removeListener('update-progress', handler) }
  },
  triggerUpdate: (downloadUrl: string, assetName: string) =>
    ipcRenderer.invoke('trigger-update', downloadUrl, assetName),
  cancelUpdate: () => ipcRenderer.invoke('cancel-update'),
  getResumeProgress: (assetName: string) =>
    ipcRenderer.invoke('get-resume-progress', assetName),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  syncTest: (config: any) => ipcRenderer.invoke('sync-test', config),
  syncAuto: () => ipcRenderer.invoke('sync-auto'),
  getSyncPending: () => ipcRenderer.invoke('sync-pending'),
  syncStartup: () => ipcRenderer.invoke('sync-startup'),
  syncPeriodic: () => ipcRenderer.invoke('sync-periodic'),
  syncResolveConflict: (resolution: 'keep-local' | 'use-remote') =>
    ipcRenderer.invoke('sync-resolve-conflict', resolution),
  onSyncStatus: (cb: (status: any) => void) => {
    ipcRenderer.on('sync-status', (_e, status) => cb(status))
  },
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  checkBackupExists: () => ipcRenderer.invoke('check-backup-exists'),
  prepareClearAllData: () => ipcRenderer.invoke('prepare-clear-all-data'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  getBackupDir: () => ipcRenderer.invoke('get-backup-dir'),
  githubTest: (c: { repo: string; token: string; branch?: string }) => ipcRenderer.invoke('github-test', c),
  githubSaveToken: (token: string) => ipcRenderer.invoke('github-save-token', token),
  githubClearToken: () => ipcRenderer.invoke('github-clear-token'),
  githubHasToken: () => ipcRenderer.invoke('github-has-token'),
  githubAccount: () => ipcRenderer.invoke('github-account'),
  saveImage: (bytes: ArrayBuffer, mime?: string) => ipcRenderer.invoke('save-image', bytes, mime),
  migrateEmbeddedImages: () => ipcRenderer.invoke('migrate-embedded-images'),
})
