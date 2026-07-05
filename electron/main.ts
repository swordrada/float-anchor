import { app, BrowserWindow, ipcMain, shell, protocol, net, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { exec } from 'node:child_process'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import { extractStoredImageName } from './sync/image-names'
import { resolveExt, hashName, rewriteEmbeddedImages } from './sync/image-store'
import { createNodeLocalStore } from './sync/local-store'
import { reconcileState, resolveConflict } from './sync/engine'
import { createWebDAVAdapter } from './sync/webdav-adapter'
import { createGitHubAdapter } from './sync/github-adapter'
import { initGitHubAuth, saveGitHubToken, readGitHubToken, clearGitHubToken, hasGitHubToken } from './sync/github-auth'
import type { RemoteAdapter, LocalStore } from './sync/types'

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

async function httpsGetJSON(url: string): Promise<any> {
  const resp = await net.fetch(url, {
    headers: {
      'User-Agent': 'FloatAnchor-Updater',
      Accept: 'application/vnd.github+json',
    },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

function getDownloadMeta(destPath: string) {
  return destPath + '.meta'
}

function isUpdateCancelledError(err: unknown) {
  return err instanceof Error && err.name === 'AbortError'
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const partPath = destPath + '.part'
  let existingBytes = 0
  if (fs.existsSync(partPath)) {
    existingBytes = fs.statSync(partPath).size
  }

  const headers: Record<string, string> = {
    'User-Agent': 'FloatAnchor-Updater',
    Accept: 'application/octet-stream',
  }
  if (existingBytes > 0) {
    headers['Range'] = `bytes=${existingBytes}-`
  }

  const resp = await net.fetch(url, { headers, signal })

  if (!resp.ok && resp.status !== 206) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const isPartial = resp.status === 206
  if (resp.status === 200 && existingBytes > 0) {
    existingBytes = 0
  }

  let totalBytes: number
  if (isPartial) {
    const cr = resp.headers.get('content-range')
    totalBytes = cr ? parseInt(cr.split('/')[1], 10) : 0
  } else {
    totalBytes = parseInt(resp.headers.get('content-length') || '0', 10)
  }

  if (totalBytes > 0) {
    fs.writeFileSync(getDownloadMeta(destPath), JSON.stringify({ totalBytes, url }))
  }

  let downloaded = existingBytes
  const ws = fs.createWriteStream(partPath, { flags: isPartial ? 'a' : 'w' })

  const reader = resp.body?.getReader()
  if (!reader) throw new Error('No response body')

  let streamError: unknown = null
  try {
    while (true) {
      if (signal?.aborted) {
        const err = new Error('update-cancelled')
        err.name = 'AbortError'
        throw err
      }
      const { done, value } = await reader.read()
      if (done) break
      ws.write(Buffer.from(value))
      downloaded += value.byteLength
      if (totalBytes > 0 && onProgress) onProgress(Math.round((downloaded / totalBytes) * 100))
    }
  } catch (err) {
    streamError = err
  } finally {
    reader.releaseLock()
  }

  await new Promise<void>((resolve, reject) => {
    ws.end(() => resolve())
    ws.on('error', reject)
  })

  if (streamError) throw streamError

  fs.renameSync(partPath, destPath)
  try { fs.unlinkSync(getDownloadMeta(destPath)) } catch {}
}

function getResumePercent(destPath: string): number {
  const partPath = destPath + '.part'
  const metaPath = getDownloadMeta(destPath)
  if (!fs.existsSync(partPath) || !fs.existsSync(metaPath)) return 0
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    const downloaded = fs.statSync(partPath).size
    if (meta.totalBytes > 0) return Math.round((downloaded / meta.totalBytes) * 100)
  } catch {}
  return 0
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

async function checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string; currentVersion: string }> {
  try {
    const release: ReleaseInfo = await httpsGetJSON(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    )
    const latestVersion = release.tag_name.replace(/^v/, '')
    if (compareVersions(latestVersion, CURRENT_VERSION) <= 0) {
      return { hasUpdate: false, currentVersion: CURRENT_VERSION }
    }

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
    if (!asset) return { hasUpdate: false, currentVersion: CURRENT_VERSION }

    const tmpDir = path.join(app.getPath('temp'), 'float-anchor-update')
    const destPath = path.join(tmpDir, asset.name)
    const alreadyDownloaded = fs.existsSync(destPath)
    const resumePct = alreadyDownloaded ? 100 : getResumePercent(destPath)

    mainWindow?.webContents.send('update-available', {
      version: latestVersion,
      currentVersion: CURRENT_VERSION,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
      resumePercent: resumePct,
    })

    return { hasUpdate: true, version: latestVersion, currentVersion: CURRENT_VERSION }
  } catch (err) {
    console.error('Update check failed:', err)
    return { hasUpdate: false, currentVersion: CURRENT_VERSION }
  }
}

function startUpdateChecker() {
  setTimeout(() => checkForUpdates(), 3000)
  updateCheckTimer = setInterval(() => checkForUpdates(), 60_000)
}

ipcMain.handle('check-update', async () => {
  return checkForUpdates()
})

ipcMain.handle('get-resume-progress', async (_event, assetName: string) => {
  const tmpDir = path.join(app.getPath('temp'), 'float-anchor-update')
  const destPath = path.join(tmpDir, assetName)
  if (fs.existsSync(destPath)) return 100
  return getResumePercent(destPath)
})

let activeDownloadAbort: (() => void) | null = null
let activeDownloadPath: string | null = null

ipcMain.handle('trigger-update', async (_event, downloadUrl: string, assetName: string) => {
  if (activeDownloadAbort) {
    return { success: false, error: '已有更新任务正在进行' }
  }

  const controller = new AbortController()
  try {
    const tmpDir = path.join(app.getPath('temp'), 'float-anchor-update')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const destPath = path.join(tmpDir, assetName)
    activeDownloadAbort = () => controller.abort()
    activeDownloadPath = destPath

    const resumePct = getResumePercent(destPath)
    mainWindow?.webContents.send('update-progress', { stage: 'downloading', percent: resumePct })

    await downloadFile(downloadUrl, destPath, (pct) => {
      mainWindow?.webContents.send('update-progress', { stage: 'downloading', percent: pct })
    }, controller.signal)

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
    if (isUpdateCancelledError(err)) {
      const resumePct = activeDownloadPath ? getResumePercent(activeDownloadPath) : 0
      mainWindow?.webContents.send('update-progress', { stage: 'cancelled', percent: resumePct })
      return { success: false, error: 'cancelled' }
    }
    console.error('Update failed:', err)
    mainWindow?.webContents.send('update-progress', { stage: 'error', percent: 0 })
    return { success: false, error: String(err) }
  } finally {
    activeDownloadAbort = null
    activeDownloadPath = null
  }
})

ipcMain.handle('cancel-update', async () => {
  if (!activeDownloadAbort) {
    return { success: false, error: '当前没有正在下载的更新任务' }
  }
  activeDownloadAbort()
  return { success: true }
})

function getThemeFromSettings(): 'light' | 'dark' {
  try {
    const { settingsFile: file } = getDataPaths()
    if (fs.existsSync(file)) {
      const s = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (s.theme === 'dark') return 'dark'
    }
  } catch {}
  return 'light'
}

function createWindow() {
  const theme = getThemeFromSettings()
  const isDark = theme === 'dark'
  const bgColor = isDark ? '#1a1a1e' : '#f0f0f0'
  const windowIcon = process.platform === 'win32'
    ? path.join(__dirname, '../build/icon.png')
    : undefined

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      color: isDark ? '#212125' : '#f0f0f0',
      symbolColor: isDark ? '#ccc' : '#555',
      height: 38,
    } : undefined,
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: bgColor,
    icon: windowIcon,
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
    const dataToWrite = (data && typeof data === 'object' && !Array.isArray(data))
      ? { ...(data as Record<string, unknown>) }
      : data

    if (
      dataToWrite &&
      typeof dataToWrite === 'object' &&
      !Array.isArray(dataToWrite) &&
      typeof (dataToWrite as Record<string, unknown>)._syncTimestamp !== 'number' &&
      fs.existsSync(file)
    ) {
      try {
        const writableData = dataToWrite as Record<string, unknown>
        const existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
        if (typeof existing?._syncTimestamp === 'number') {
          writableData._syncTimestamp = existing._syncTimestamp
        }
      } catch {}
    }

    fs.writeFileSync(file, JSON.stringify(dataToWrite, null, 2), 'utf-8')
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

/* ===== Sync ===== */

let syncTimer: ReturnType<typeof setTimeout> | undefined

function getLocalStore(): LocalStore {
  const { dataDir: dir, dataFile: file } = getDataPaths()
  return createNodeLocalStore({
    dataFile: file,
    imagesDir: path.join(dir, 'images'),
    backupDir: path.join(dir, 'backups'),
    maxBackups: 5,
  })
}

function saveImageBytes(buf: Buffer, mime?: string): string {
  const { dataDir } = getDataPaths()
  const imagesDir = path.join(dataDir, 'images')
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
  const ext = resolveExt(mime, buf)
  const name = hashName(buf, ext)
  const dest = path.join(imagesDir, name)
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf)
  return name
}

ipcMain.handle('save-image', async (_e, bytes: ArrayBuffer, mime?: string) => {
  try {
    return { name: saveImageBytes(Buffer.from(bytes), mime) }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('migrate-embedded-images', async () => {
  try {
    const { dataFile } = getDataPaths()
    if (!fs.existsSync(dataFile)) return { success: false, error: '无数据文件' }
    const raw = fs.readFileSync(dataFile, 'utf-8')
    const beforeBytes = Buffer.byteLength(raw, 'utf-8')
    getLocalStore().backup()
    const data = JSON.parse(raw)
    let count = 0
    for (const canvas of data?.canvases || []) {
      for (const card of canvas?.cards || []) {
        if (typeof card?.content === 'string' && card.content.includes('data:image/')) {
          const { content, extracted } = rewriteEmbeddedImages(card.content, saveImageBytes)
          card.content = content
          count += extracted
        }
      }
    }
    const newRaw = JSON.stringify(data, null, 2)
    fs.writeFileSync(dataFile, newRaw, 'utf-8')
    return { success: true, count, beforeBytes, afterBytes: Buffer.byteLength(newRaw, 'utf-8') }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

function readSettingsSync(): { theme?: string; webdav?: { server: string; username: string; password: string }; syncProvider?: string; github?: { repo: string; branch?: string } } | null {
  try {
    const { settingsFile: f } = getDataPaths()
    if (!fs.existsSync(f)) return null
    return JSON.parse(fs.readFileSync(f, 'utf-8'))
  } catch {
    return null
  }
}

function getActiveAdapter(): RemoteAdapter | null {
  const settings = readSettingsSync()
  const provider = settings?.syncProvider
    ?? (settings?.webdav?.server ? 'webdav' : 'none')
  if (provider === 'webdav' && settings?.webdav?.server) {
    return createWebDAVAdapter(settings.webdav)
  }
  if (provider === 'github' && settings?.github?.repo && hasGitHubToken()) {
    const token = readGitHubToken()
    if (token) return createGitHubAdapter({ repo: settings.github.repo, token, branch: settings.github.branch })
  }
  return null
}

let syncQueue: Promise<void> = Promise.resolve()

function enqueueSync<T>(task: () => Promise<T>): Promise<T> {
  const next = syncQueue.then(task, task)
  syncQueue = next.then(() => undefined, () => undefined)
  return next
}

ipcMain.handle('sync-test', async (_e, config: { server: string; username: string; password: string }) => {
  // TODO(计划2 Task4): 按 active provider 分派；当前仅 WebDAV
  // 计划 1 仅 WebDAV：直接测 webdav config
  const adapter = createWebDAVAdapter(config)
  const r = await adapter.test()
  return r.ok ? { success: true } : { success: false, error: r.error }
})

let lastRemoteTag: string | null = null

// 用当前远端标签刷新缓存，使周期同步「远端没变就跳过下载整份快照」的短路生效。
// 任何同步(上传/下载/解决冲突)后都调用——上传会改变远端 ETag，刷新后下次轮询才不会误判为变更而重下整份。
async function refreshRemoteTag(adapter: RemoteAdapter): Promise<void> {
  if (!adapter.getRemoteTag) { lastRemoteTag = null; return }
  try { lastRemoteTag = await adapter.getRemoteTag() } catch { /* 出错保留旧值 */ }
}

// 把底层错误映射成精简中文原因，供界面直接展示。
function describeSyncError(err: any): string {
  const status = err?.status ?? err?.response?.status
  const msg = String(err?.message ?? err ?? '')
  if (status === 409 || status === 422) return '云端已更新，正在重新同步'
  if (status === 403 || /\b403\b|TrafficRateExhausted/i.test(msg)) {
    return readSettingsSync()?.syncProvider === 'github'
      ? 'GitHub 请求超限或权限不足，请稍后再试'
      : '坚果云流量/请求超限，请稍后再试（约 6 小时后恢复）'
  }
  if (status === 401 || /\b401\b|Unauthorized/i.test(msg)) {
    return readSettingsSync()?.syncProvider === 'github' ? 'GitHub 令牌无效或权限不足' : '账号或应用密码不正确'
  }
  if (status === 507 || /insufficient storage|quota/i.test(msg)) return '云端空间不足'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET|getaddrinfo|fetch failed|network/i.test(msg)) return '网络连接失败，请检查网络'
  if (msg.includes('未配置同步')) return '未配置同步'
  const clean = msg.replace(/^Error:\s*/, '').trim()
  return clean ? `同步失败：${clean.slice(0, 60)}` : '同步失败'
}

async function runSync() {
  const adapter = getActiveAdapter()
  if (!adapter) return { success: false, error: '未配置同步' }
  // 先用 ETag 探测远端是否变化；未变则引擎走快路径（本地脏直接上传/干净即最新），跳过整份下载。
  let remoteUnchanged = false
  if (adapter.getRemoteTag) {
    const tag = await adapter.getRemoteTag()
    remoteUnchanged = !!tag && tag === lastRemoteTag
  }
  const result = await reconcileState(adapter, getLocalStore(), { remoteUnchanged })
  // 远端确实未变且本次没上传 → lastRemoteTag 仍准确，无需再抓；否则(下载/上传/远端变了)刷新缓存。
  if (!remoteUnchanged || result.action === 'uploaded') {
    await refreshRemoteTag(adapter)
  }
  return result
}

ipcMain.handle('sync-auto', async () => enqueueSync(async () => {
  try {
    const result = await runSync()
    if (result.success && result.action === 'needs-confirmation') {
      mainWindow?.webContents.send('sync-status', { status: 'warning' })
    } else if (result.success) {
      mainWindow?.webContents.send('sync-status', { status: 'success' })
    } else {
      mainWindow?.webContents.send('sync-status', { status: 'error', error: result.error })
    }
    return result
  } catch (err) {
    const error = describeSyncError(err)
    mainWindow?.webContents.send('sync-status', { status: 'error', error })
    return { success: false, error }
  }
}))

ipcMain.handle('sync-startup', async () => enqueueSync(async () => {
  try { return await runSync() } catch (err) { return { success: false, error: describeSyncError(err) } }
}))

ipcMain.handle('sync-periodic', async () => enqueueSync(async () => {
  // 与 sync-auto 共用 runSync：远端未变(ETag)时跳过整份下载，仅一个 PROPFIND。
  try {
    return await runSync()
  } catch (err) {
    return { success: false, error: describeSyncError(err) }
  }
}))

ipcMain.handle('sync-resolve-conflict', async (_e, resolution: 'keep-local' | 'use-remote') => enqueueSync(async () => {
  try {
    const adapter = getActiveAdapter()
    if (!adapter) return { success: false, error: '未配置同步' }
    const result = await resolveConflict(adapter, getLocalStore(), resolution)
    await refreshRemoteTag(adapter)
    if (result.success) mainWindow?.webContents.send('sync-status', { status: 'success' })
    return result
  } catch (err) {
    const error = describeSyncError(err)
    mainWindow?.webContents.send('sync-status', { status: 'error', error })
    return { success: false, error }
  }
}))

ipcMain.handle('get-platform', () => process.platform)

/* ===== Backup / Restore / Clear ===== */

function getBackupDir(): string {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('documents'), 'FloatAnchor-Backups')
  }
  return path.join(app.getPath('documents'), 'FloatAnchor-Backups')
}

const CLEAR_RECENT_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000

function listBackupArchives() {
  const backupDir = getBackupDir()
  if (!fs.existsSync(backupDir)) return []

  return fs.readdirSync(backupDir)
    .filter((fileName) => fileName.endsWith('.zip') && fileName.startsWith('FloatAnchor-backup-'))
    .map((fileName) => {
      const fullPath = path.join(backupDir, fileName)
      const stat = fs.statSync(fullPath)
      return { fileName, fullPath, mtimeMs: stat.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function getBackupStatus() {
  const backupDir = getBackupDir()
  const backups = listBackupArchives()
  const latest = backups[0]
  const hasRecentBackup = !!latest && Date.now() - latest.mtimeMs <= CLEAR_RECENT_BACKUP_MAX_AGE_MS

  return {
    exists: backups.length > 0,
    count: backups.length,
    dir: backupDir,
    latestFileName: latest?.fileName,
    latestTimestamp: latest?.mtimeMs,
    hasRecentBackup,
  }
}

async function exportBackupArchive() {
  try {
    const { dataFile: file, dataDir: dir } = getDataPaths()
    if (!fs.existsSync(file)) {
      return { success: false, error: '没有找到数据文件' }
    }

    const backupDir = getBackupDir()
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const zipName = `FloatAnchor-backup-${ts}.zip`
    const zipPath = path.join(backupDir, zipName)

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve())
      archive.on('error', (err) => reject(err))

      archive.pipe(output)
      archive.file(file, { name: 'float-anchor.json' })

      const imagesDir = path.join(dir, 'images')
      if (fs.existsSync(imagesDir)) {
        archive.directory(imagesDir, 'images')
      }

      archive.finalize()
    })

    return { success: true, path: zipPath, fileName: zipName }
  } catch (err) {
    console.error('Export backup failed:', err)
    return { success: false, error: String(err) }
  }
}

async function ensureRecentBackupForClear() {
  const status = getBackupStatus()
  if (status.hasRecentBackup) {
    return { success: true, backupCreated: false, ...status }
  }

  const backupRes = await exportBackupArchive()
  if (!backupRes.success) {
    return { success: false, error: backupRes.error || '清空前自动备份失败', ...status }
  }

  return {
    success: true,
    backupCreated: true,
    ...getBackupStatus(),
  }
}

ipcMain.handle('get-backup-dir', () => getBackupDir())

ipcMain.handle('export-backup', async () => {
  return exportBackupArchive()
})

ipcMain.handle('import-backup', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择备份文件',
      filters: [{ name: 'FloatAnchor Backup', extensions: ['zip'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }

    const zipPath = result.filePaths[0]
    const zip = new AdmZip(zipPath)
    const dataEntry = zip.getEntry('float-anchor.json')
    if (!dataEntry) {
      return { success: false, error: '无效的备份文件：缺少 float-anchor.json' }
    }

    const importedRaw = zip.readAsText(dataEntry)
    const importedData = JSON.parse(importedRaw)

    if (!importedData.canvases || !Array.isArray(importedData.canvases)) {
      return { success: false, error: '无效的备份文件：数据格式不正确' }
    }

    const { dataFile: file, dataDir: dir } = getDataPaths()
    ensureDataDir()

    let existingData: any = { canvases: [], activeCanvasId: null }
    if (fs.existsSync(file)) {
      try {
        existingData = JSON.parse(fs.readFileSync(file, 'utf-8'))
      } catch {}
    }

    const existingCanvasMap = new Map<string, any>()
    for (const c of existingData.canvases || []) {
      existingCanvasMap.set(c.id, c)
    }

    for (const importedCanvas of importedData.canvases) {
      const existing = existingCanvasMap.get(importedCanvas.id)
      if (existing) {
        const existingCardMap = new Map<string, any>()
        for (const card of existing.cards || []) existingCardMap.set(card.id, card)
        for (const card of importedCanvas.cards || []) existingCardMap.set(card.id, card)
        existing.cards = Array.from(existingCardMap.values())

        const existingLabelMap = new Map<string, any>()
        for (const l of existing.labels || []) existingLabelMap.set(l.id, l)
        for (const l of importedCanvas.labels || []) existingLabelMap.set(l.id, l)
        existing.labels = Array.from(existingLabelMap.values())

        const existingSectionMap = new Map<string, any>()
        for (const s of existing.sections || []) existingSectionMap.set(s.id, s)
        for (const s of importedCanvas.sections || []) existingSectionMap.set(s.id, s)
        existing.sections = Array.from(existingSectionMap.values())

        const existingConnMap = new Map<string, any>()
        for (const cn of existing.connections || []) existingConnMap.set(cn.id, cn)
        for (const cn of importedCanvas.connections || []) existingConnMap.set(cn.id, cn)
        existing.connections = Array.from(existingConnMap.values())

        const existingTextMap = new Map<string, any>()
        for (const t of existing.texts || []) existingTextMap.set(t.id, t)
        for (const t of importedCanvas.texts || []) existingTextMap.set(t.id, t)
        existing.texts = Array.from(existingTextMap.values())

        if (importedCanvas.viewport) existing.viewport = importedCanvas.viewport
        if (importedCanvas.name) existing.name = importedCanvas.name

        existingCanvasMap.set(importedCanvas.id, existing)
      } else {
        existingCanvasMap.set(importedCanvas.id, importedCanvas)
      }
    }

    const mergedData = {
      canvases: Array.from(existingCanvasMap.values()),
      activeCanvasId: importedData.activeCanvasId || existingData.activeCanvasId,
    }

    fs.writeFileSync(file, JSON.stringify(mergedData, null, 2), 'utf-8')

    const imagesDir = path.join(dir, 'images')
    const imageEntries = zip.getEntries().filter((e) => e.entryName.startsWith('images/') && !e.isDirectory)
    if (imageEntries.length > 0) {
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
      for (const entry of imageEntries) {
        const fileName = path.basename(entry.entryName)
        const destPath = path.join(imagesDir, fileName)
        fs.writeFileSync(destPath, entry.getData())
      }
    }

    return { success: true, data: mergedData }
  } catch (err) {
    console.error('Import backup failed:', err)
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('check-backup-exists', async () => {
  try {
    return getBackupStatus()
  } catch {
    return { exists: false }
  }
})

ipcMain.handle('prepare-clear-all-data', async () => {
  try {
    return await ensureRecentBackupForClear()
  } catch (err) {
    console.error('Prepare clear all data failed:', err)
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('clear-all-data', async () => {
  try {
    const backupRes = await ensureRecentBackupForClear()
    if (!backupRes.success) {
      return { success: false, error: backupRes.error || '清空前自动备份失败' }
    }

    const { dataFile: file } = getDataPaths()
    const emptyData = {
      canvases: [],
      activeCanvasId: null,
    }
    ensureDataDir()
    fs.writeFileSync(file, JSON.stringify(emptyData, null, 2), 'utf-8')
    return { success: true, data: emptyData }
  } catch (err) {
    console.error('Clear all data failed:', err)
    return { success: false, error: String(err) }
  }
})

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

protocol.registerSchemesAsPrivileged([
  { scheme: 'fa-image', privileges: { standard: true, secure: true, bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'fa-img', privileges: { standard: true, secure: true, bypassCSP: true, supportFetchAPI: true, stream: true } },
])

app.whenReady().then(() => {
  protocol.handle('fa-image', (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname)
      if (!fs.existsSync(filePath)) {
        const storedImageName = extractStoredImageName(filePath)
        const storedImagePath = storedImageName ? getLocalStore().resolveStoredImagePath(storedImageName) : null
        if (storedImagePath) {
          return net.fetch(pathToFileURL(storedImagePath).href)
        }
      }
      return net.fetch(pathToFileURL(filePath).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  protocol.handle('fa-img', (request) => {
    try {
      const url = new URL(request.url)
      const fileName = decodeURIComponent(url.pathname).replace(/^\/+/, '') || url.hostname
      const filePath = getLocalStore().resolveStoredImagePath(fileName)
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  initGitHubAuth(path.join(getDataPaths().dataDir, 'github-token.bin'))
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

/* ===== GitHub IPC ===== */

ipcMain.handle('github-test', async (_e, c: { repo: string; token: string; branch?: string }) => {
  const r = await createGitHubAdapter(c).test()
  return r.ok ? { success: true } : { success: false, error: r.error }
})
ipcMain.handle('github-save-token', async (_e, token: string) => { saveGitHubToken(token); return { success: true } })
ipcMain.handle('github-clear-token', async () => { clearGitHubToken(); return { success: true } })
ipcMain.handle('github-has-token', async () => ({ has: hasGitHubToken() }))
ipcMain.handle('github-account', async () => {
  const token = readGitHubToken()
  if (!token) return { login: null }
  try {
    const resp = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
    if (!resp.ok) return { login: null }
    const u = await resp.json() as { login?: string }
    return { login: u.login || null }
  } catch { return { login: null } }
})
