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
  webdavTest: (config: any) => ipcRenderer.invoke('webdav-test', config),
  webdavUpload: (config: any) => ipcRenderer.invoke('webdav-upload', config),
  webdavDownload: (config: any) => ipcRenderer.invoke('webdav-download', config),
  webdavAutoSync: (config: any) => ipcRenderer.invoke('webdav-auto-sync', config),
  webdavStartupSync: (config: any) => ipcRenderer.invoke('webdav-startup-sync', config),
  webdavPeriodicSync: (config: any) => ipcRenderer.invoke('webdav-periodic-sync', config),
  webdavResolveConflict: (config: any, resolution: 'keep-local' | 'use-remote' | 'dismiss') =>
    ipcRenderer.invoke('webdav-resolve-conflict', config, resolution),
  onSyncStatus: (cb: (status: any) => void) => {
    ipcRenderer.on('sync-status', (_e, status) => cb(status))
  },
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  checkBackupExists: () => ipcRenderer.invoke('check-backup-exists'),
  prepareClearAllCards: () => ipcRenderer.invoke('prepare-clear-all-cards'),
  clearAllCards: () => ipcRenderer.invoke('clear-all-cards'),
  getBackupDir: () => ipcRenderer.invoke('get-backup-dir'),
  onTrackReminderOpen: (cb: (payload: { trackId: string; date: string }) => void) => {
    const handler = (_e: unknown, payload: { trackId: string; date: string }) => cb(payload)
    ipcRenderer.on('track-reminder-open', handler)
    return () => { ipcRenderer.removeListener('track-reminder-open', handler) }
  },
})
