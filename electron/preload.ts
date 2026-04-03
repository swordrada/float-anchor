import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  readData: () => ipcRenderer.invoke('read-data'),
  writeData: (data: unknown) => ipcRenderer.invoke('write-data', data),
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
})
