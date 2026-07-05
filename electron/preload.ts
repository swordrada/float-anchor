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
