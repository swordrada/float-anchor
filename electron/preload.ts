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
    ipcRenderer.on('update-available', (_e, info) => cb(info))
  },
  onUpdateProgress: (cb: (progress: any) => void) => {
    ipcRenderer.on('update-progress', (_e, progress) => cb(progress))
  },
  triggerUpdate: (downloadUrl: string, assetName: string) =>
    ipcRenderer.invoke('trigger-update', downloadUrl, assetName),
  webdavTest: (config: any) => ipcRenderer.invoke('webdav-test', config),
  webdavUpload: (config: any) => ipcRenderer.invoke('webdav-upload', config),
  webdavDownload: (config: any) => ipcRenderer.invoke('webdav-download', config),
  webdavAutoSync: (config: any) => ipcRenderer.invoke('webdav-auto-sync', config),
  webdavStartupSync: (config: any) => ipcRenderer.invoke('webdav-startup-sync', config),
  onSyncStatus: (cb: (status: any) => void) => {
    ipcRenderer.on('sync-status', (_e, status) => cb(status))
  },
})
