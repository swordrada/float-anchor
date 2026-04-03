import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import { IncomingMessage } from 'node:http'
import { exec } from 'node:child_process'

let dataDir = ''
let dataFile = ''
let settingsFile = ''

function getDataPaths() {
  if (!dataDir) {
    dataDir = path.join(app.getPath('userData'), 'data')
    dataFile = path.join(dataDir, 'float-anchor.json')
    settingsFile = path.join(dataDir, 'float-anchor-settings.json')
  }
  return { dataDir, dataFile, settingsFile }
}

let mainWindow: BrowserWindow | null = null

const GITHUB_OWNER = 'swordrada'
const GITHUB_REPO = 'float-anchor'
const CURRENT_VERSION = app.getVersion()

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function httpsGetJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const get = (reqUrl: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))
      https.get(reqUrl, { headers: { 'User-Agent': 'FloatAnchor-Updater' } }, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1)
        }
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
        })
        res.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

function downloadFile(url: string, destPath: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = (reqUrl: string, redirects = 0) => {
      if (redirects > 10) return reject(new Error('Too many redirects'))
      const mod = reqUrl.startsWith('https') ? https : require('node:http')
      mod.get(reqUrl, { headers: { 'User-Agent': 'FloatAnchor-Updater', Accept: 'application/octet-stream' } }, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1)
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0
        const ws = fs.createWriteStream(destPath)
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (totalBytes > 0 && onProgress) onProgress(Math.round((downloaded / totalBytes) * 100))
        })
        res.pipe(ws)
        ws.on('finish', () => { ws.close(); resolve() })
        ws.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

interface ReleaseInfo {
  tag_name: string
  assets: ReleaseAsset[]
}

let updateCheckTimer: ReturnType<typeof setInterval> | null = null

async function checkForUpdates() {
  try {
    const release: ReleaseInfo = await httpsGetJSON(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    )
    const latestVersion = release.tag_name.replace(/^v/, '')
    if (compareVersions(latestVersion, CURRENT_VERSION) <= 0) return

    const platform = process.platform
    const arch = process.arch
    let assetName = ''
    if (platform === 'darwin') {
      assetName = arch === 'x64'
        ? `FloatAnchor-${latestVersion}-mac-x64.dmg`
        : `FloatAnchor-${latestVersion}-mac-arm64.dmg`
    } else {
      assetName = `FloatAnchor-${latestVersion}-win-setup.exe`
    }

    const asset = release.assets.find((a) => a.name === assetName)
    if (!asset) return

    mainWindow?.webContents.send('update-available', {
      version: latestVersion,
      currentVersion: CURRENT_VERSION,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
    })
  } catch (err) {
    console.error('Update check failed:', err)
  }
}

function startUpdateChecker() {
  setTimeout(() => checkForUpdates(), 3000)
  updateCheckTimer = setInterval(() => checkForUpdates(), 60_000)
}

ipcMain.handle('trigger-update', async (_event, downloadUrl: string, assetName: string) => {
  try {
    const tmpDir = path.join(app.getPath('temp'), 'float-anchor-update')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const destPath = path.join(tmpDir, assetName)

    mainWindow?.webContents.send('update-progress', { stage: 'downloading', percent: 0 })

    await downloadFile(downloadUrl, destPath, (pct) => {
      mainWindow?.webContents.send('update-progress', { stage: 'downloading', percent: pct })
    })

    mainWindow?.webContents.send('update-progress', { stage: 'installing', percent: 100 })

    if (process.platform === 'darwin') {
      await new Promise<void>((resolve, reject) => {
        exec(`hdiutil attach "${destPath}" -nobrowse`, (err, stdout) => {
          if (err) return reject(err)
          const volumeMatch = stdout.match(/\/Volumes\/.+/)
          if (!volumeMatch) return reject(new Error('Failed to mount DMG'))
          const volumePath = volumeMatch[0].trim()
          const appName = 'FloatAnchor.app'
          const srcApp = path.join(volumePath, appName)
          const destApp = `/Applications/${appName}`

          exec(`rm -rf "${destApp}" && cp -R "${srcApp}" "${destApp}" && hdiutil detach "${volumePath}"`, (err2) => {
            if (err2) return reject(err2)
            resolve()
          })
        })
      })
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
      app.relaunch({ execPath: '/Applications/FloatAnchor.app/Contents/MacOS/FloatAnchor' })
      app.exit(0)
    } else {
      exec(`start "" "${destPath}"`)
      setTimeout(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
        app.exit(0)
      }, 2000)
    }

    return { success: true }
  } catch (err) {
    console.error('Update failed:', err)
    mainWindow?.webContents.send('update-progress', { stage: 'error', percent: 0 })
    return { success: false, error: String(err) }
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#f0f0f0',
      symbolColor: '#555',
      height: 38,
    } : undefined,
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f0f0f0',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function ensureDataDir() {
  const { dataDir: dir } = getDataPaths()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

ipcMain.handle('read-data', async () => {
  try {
    const { dataFile: file } = getDataPaths()
    ensureDataDir()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('Failed to read data:', err)
  }
  return null
})

ipcMain.handle('write-data', async (_event, data: unknown) => {
  try {
    const { dataFile: file } = getDataPaths()
    ensureDataDir()
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('Failed to write data:', err)
    return false
  }
})

ipcMain.handle('read-settings', async () => {
  try {
    const { settingsFile: file } = getDataPaths()
    ensureDataDir()
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'))
    }
  } catch (err) {
    console.error('Failed to read settings:', err)
  }
  return null
})

ipcMain.handle('write-settings', async (_event, data: unknown) => {
  try {
    const { settingsFile: file } = getDataPaths()
    ensureDataDir()
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('Failed to write settings:', err)
    return false
  }
})

/* ===== WebDAV Sync ===== */

let webdavClient: any = null
let syncTimer: ReturnType<typeof setTimeout> | undefined
const WEBDAV_REMOTE_DIR = '/FloatAnchor'
const WEBDAV_REMOTE_FILE = '/FloatAnchor/float-anchor.json'
const MAX_BACKUPS = 5

function createBackup() {
  try {
    const { dataDir: dir, dataFile: file } = getDataPaths()
    if (!fs.existsSync(file)) return
    const backupDir = path.join(dir, 'backups')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(file, path.join(backupDir, `backup-${ts}.json`))
    const files = fs.readdirSync(backupDir).sort()
    while (files.length > MAX_BACKUPS) {
      fs.unlinkSync(path.join(backupDir, files.shift()!))
    }
  } catch (err) {
    console.error('Backup failed:', err)
  }
}

async function getWebDAVClient(config: { server: string; username: string; password: string }) {
  const { createClient } = await import('webdav')
  return createClient(config.server, {
    username: config.username,
    password: config.password,
  })
}

async function ensureRemoteDir(client: any) {
  try {
    if (!await client.exists(WEBDAV_REMOTE_DIR)) {
      await client.createDirectory(WEBDAV_REMOTE_DIR)
    }
  } catch { /* may already exist */ }
}

ipcMain.handle('webdav-test', async (_event, config: { server: string; username: string; password: string }) => {
  try {
    const client = await getWebDAVClient(config)
    await client.getDirectoryContents('/')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('webdav-upload', async (_event, config: { server: string; username: string; password: string }) => {
  try {
    const { dataFile: file } = getDataPaths()
    if (!fs.existsSync(file)) return { success: false, error: 'No data file' }
    const client = await getWebDAVClient(config)
    await ensureRemoteDir(client)
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    data._syncTimestamp = Date.now()
    await client.putFileContents(WEBDAV_REMOTE_FILE, JSON.stringify(data, null, 2), { overwrite: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('webdav-download', async (_event, config: { server: string; username: string; password: string }) => {
  try {
    const client = await getWebDAVClient(config)
    if (!await client.exists(WEBDAV_REMOTE_FILE)) {
      return { success: true, data: null }
    }
    const raw = await client.getFileContents(WEBDAV_REMOTE_FILE, { format: 'text' })
    const data = JSON.parse(raw as string)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('webdav-auto-sync', async (_event, config: { server: string; username: string; password: string }) => {
  try {
    const { dataFile: file } = getDataPaths()
    if (!fs.existsSync(file)) return { success: false }
    createBackup()
    const client = await getWebDAVClient(config)
    await ensureRemoteDir(client)
    const localRaw = fs.readFileSync(file, 'utf-8')
    const localData = JSON.parse(localRaw)
    localData._syncTimestamp = Date.now()
    await client.putFileContents(WEBDAV_REMOTE_FILE, JSON.stringify(localData, null, 2), { overwrite: true })
    fs.writeFileSync(file, JSON.stringify(localData, null, 2), 'utf-8')
    mainWindow?.webContents.send('sync-status', { status: 'success' })
    return { success: true }
  } catch (err) {
    mainWindow?.webContents.send('sync-status', { status: 'error', error: String(err) })
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('webdav-startup-sync', async (_event, config: { server: string; username: string; password: string }) => {
  try {
    const { dataFile: file } = getDataPaths()
    const client = await getWebDAVClient(config)
    if (!await client.exists(WEBDAV_REMOTE_FILE)) {
      if (fs.existsSync(file)) {
        await ensureRemoteDir(client)
        const raw = fs.readFileSync(file, 'utf-8')
        const data = JSON.parse(raw)
        data._syncTimestamp = Date.now()
        await client.putFileContents(WEBDAV_REMOTE_FILE, JSON.stringify(data, null, 2), { overwrite: true })
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
      }
      return { success: true, action: 'uploaded' }
    }
    const remoteRaw = await client.getFileContents(WEBDAV_REMOTE_FILE, { format: 'text' })
    const remoteData = JSON.parse(remoteRaw as string)
    const remoteTs = remoteData._syncTimestamp || 0
    let localTs = 0
    if (fs.existsSync(file)) {
      try {
        const localData = JSON.parse(fs.readFileSync(file, 'utf-8'))
        localTs = localData._syncTimestamp || 0
      } catch {}
    }
    if (remoteTs > localTs) {
      createBackup()
      fs.writeFileSync(file, JSON.stringify(remoteData, null, 2), 'utf-8')
      return { success: true, action: 'downloaded', data: remoteData }
    }
    return { success: true, action: 'up-to-date' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('get-platform', () => process.platform)

ipcMain.on('win-minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})

ipcMain.on('win-maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.on('win-close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})

app.whenReady().then(() => {
  createWindow()
  startUpdateChecker()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
