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
import type { AppData, InstantCardSave, InstantModeTarget } from '../src/types'
import { applyInstantCardSave, findInstantNote } from '../src/lib/instantNotes'
import { mergeAppData } from '../src/lib/mergeData'
import { getComparableSyncSnapshot } from './sync/summary'
import { prepareLocalSnapshot } from './sync/local-data'
import type { SyncResult } from './sync/types'
import { checkForReleaseUpdate, type UpdateCheckResult } from './updater'

// Development previews never use the user's real notes or settings.
if (!app.isPackaged && process.env.FLOAT_ANCHOR_PREVIEW_DIR) {
  app.setPath('userData', path.resolve(process.env.FLOAT_ANCHOR_PREVIEW_DIR))
}

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
let instantWindow: BrowserWindow | null = null
let isQuitting = false
let allowMainClose = false
let closing: Promise<void> | null = null
let closeRequestId = 0
const closeSaves = new Map<number, { sender: number; finish: (success: boolean) => void }>()

ipcMain.on('close-save-complete', (event, id: number, success: boolean) => {
  const pending = closeSaves.get(id)
  if (pending?.sender === event.sender.id) pending.finish(success === true)
})

function flushWindow(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const id = ++closeRequestId
    const finish = (saved: boolean) => {
      clearTimeout(timer)
      closeSaves.delete(id)
      saved ? resolve() : reject(new Error('本地内容尚未保存，已取消关闭，请重试。'))
    }
    const timer = setTimeout(() => finish(false), 5000)
    closeSaves.set(id, { sender: window.webContents.id, finish })
    window.webContents.send('close-save-request', id)
  })
}

function closeAfterSave(quit: boolean) {
  if (closing) return
  const target = mainWindow
  closing = (async () => {
    try {
      // Flush the instant editor first, then merge/flush the main renderer.
      if (instantWindow && !instantWindow.isDestroyed()) await flushWindow(instantWindow)
      if (target && !target.isDestroyed()) await flushWindow(target)
      if (getActiveAdapter() && !lastSyncDecision) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            enqueueSync(() => runSync()).catch(error => console.warn('Exit sync deferred:', describeSyncError(error))),
            new Promise<void>(resolve => { timer = setTimeout(resolve, 8000) }),
          ])
        } finally { clearTimeout(timer) }
      }
      if (quit) { isQuitting = true; app.quit() }
      else {
        allowMainClose = true
        target?.close()
        if (instantWindow && !instantWindow.isDestroyed()) instantWindow.webContents.send('close-save-cancelled')
      }
    } catch (error) {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('close-save-cancelled')
      await dialog.showMessageBox({ type: 'error', title: '未能保存', message: String(error), buttons: ['返回编辑'] })
    } finally { closing = null }
  })()
}
let instantTarget: InstantModeTarget | null = null
let instantEditingCardId: string | null = null
let allowInstantClose = false
let instantRequestId = 0
const rendererSnapshots = new Map<number, AppData>()

function broadcastEditingCard(cardId: string | null) {
  instantEditingCardId = cardId
  mainWindow?.webContents.send('instant-editing-card', cardId)
}

function readAppData(): AppData | null {
  const { dataFile: file } = getDataPaths()
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null
}

function writeAppData(data: AppData) {
  ensureDataDir()
  const { dataFile: file } = getDataPaths()
  const current = readAppData()
  const previousMtime = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0
  const next = prepareLocalSnapshot(data, current, previousMtime)
  fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2), 'utf-8')
  fs.renameSync(file + '.tmp', file)
}

const CURRENT_VERSION = app.getVersion()

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

let updateCheckTimer: ReturnType<typeof setInterval> | null = null
let pendingUpdateCheck: Promise<UpdateCheckResult> | null = null

async function performUpdateCheck(): Promise<UpdateCheckResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const result = await checkForReleaseUpdate({
      currentVersion: CURRENT_VERSION,
      platform: process.platform,
      arch: process.arch,
      fetch: (url, init) => net.fetch(url, init),
      signal: controller.signal,
    })
    if (result.error) console.error('Update check failed:', result.error)
    if (result.hasUpdate && result.version && result.assetName && result.downloadUrl) {
      const tmpDir = path.join(app.getPath('temp'), 'float-anchor-update')
      const destPath = path.join(tmpDir, result.assetName)
      const resumePct = fs.existsSync(destPath) ? 100 : getResumePercent(destPath)
      mainWindow?.webContents.send('update-available', {
        version: result.version,
        currentVersion: CURRENT_VERSION,
        assetName: result.assetName,
        downloadUrl: result.downloadUrl,
        resumePercent: resumePct,
      })
    }
    return {
      hasUpdate: result.hasUpdate,
      currentVersion: result.currentVersion,
      ...(result.version ? { version: result.version } : {}),
      ...(result.error ? { error: result.error } : {}),
    }
  } catch (err) {
    console.error('Update check failed:', err)
    return { hasUpdate: false, currentVersion: CURRENT_VERSION, error: '检查更新失败，请稍后重试' }
  } finally {
    clearTimeout(timeout)
  }
}

function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!pendingUpdateCheck) {
    pendingUpdateCheck = performUpdateCheck().finally(() => { pendingUpdateCheck = null })
  }
  return pendingUpdateCheck
}

function startUpdateChecker() {
  setTimeout(() => checkForUpdates(), 3000)
  updateCheckTimer = setInterval(() => checkForUpdates(), 15 * 60_000)
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
  const windowIcon = path.join(__dirname, '../build/icon.png')

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

  allowMainClose = false
  mainWindow.on('close', event => {
    if (isQuitting || allowMainClose) return
    event.preventDefault()
    closeAfterSave(process.platform !== 'darwin')
  })
  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function restoreMainWindow() {
  if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createInstantWindow() {
  mainWindow?.minimize()
  if (instantWindow && !instantWindow.isDestroyed()) {
    if (instantWindow.isMinimized()) instantWindow.restore()
    instantWindow.show()
    instantWindow.focus()
    if (instantTarget) instantWindow.webContents.send('instant-mode-target', instantTarget)
    return
  }

  const theme = getThemeFromSettings()
  const isDark = theme === 'dark'
  mainWindow?.minimize()

  instantWindow = new BrowserWindow({
    width: 430,
    height: 560,
    minWidth: 360,
    minHeight: 440,
    maxWidth: 720,
    maxHeight: 900,
    frame: false,
    title: 'FloatAnchor 即刻模式',
    backgroundColor: isDark ? '#1b1c20' : '#f7f7f4',
    icon: path.join(__dirname, '../build/icon.png'),
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  instantWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  instantWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  instantWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
  instantWindow.webContents.once('did-fail-load', () => {
    allowInstantClose = true
    instantWindow?.close()
  })
  instantWindow.once('ready-to-show', () => {
    instantWindow?.show()
    instantWindow?.focus()
  })
  instantWindow.on('close', (event) => {
    if (!allowInstantClose && !isQuitting) {
      event.preventDefault()
      instantWindow?.webContents.send('instant-close-requested')
    }
  })
  instantWindow.on('closed', () => {
    allowInstantClose = false
    instantTarget = null
    broadcastEditingCard(null)
    instantWindow = null
    restoreMainWindow()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    url.searchParams.set('mode', 'instant')
    instantWindow.loadURL(url.toString())
  } else {
    instantWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: 'instant' },
    })
  }
}

function ensureDataDir() {
  const { dataDir: dir } = getDataPaths()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

ipcMain.handle('read-data', (event) => {
  try {
    const data = readAppData()
    if (data) rendererSnapshots.set(event.sender.id, data)
    return data
  } catch (err) {
    console.error('Failed to read data:', err)
    return null
  }
})

ipcMain.handle('write-data', (event, incoming: AppData) => {
  try {
    if (!incoming || !Array.isArray(incoming.canvases)) return false
    const current = readAppData()
    const base = rendererSnapshots.get(event.sender.id)
    const merged = current && base ? mergeAppData(base, incoming, current) : incoming
    writeAppData(merged)
    // Baseline is what this renderer knows, not the merged snapshot it has never seen.
    rendererSnapshots.set(event.sender.id, incoming)
    return true
  } catch (err) {
    console.error('Failed to save data:', err)
    return false
  }
})

ipcMain.handle('instant-card-save', (event, request: InstantCardSave) => {
  if (event.sender !== instantWindow?.webContents) return { success: false, reason: 'error', error: '请在即刻窗口中编辑。' }
  try {
    if (!request || ['cardId', 'title', 'content', 'baseTitle', 'baseContent'].some((key) => typeof (request as any)[key] !== 'string')) {
      throw new Error('Invalid card update')
    }
    const current = readAppData()
    if (!current) throw new Error('Missing local data')
    const { data, result } = applyInstantCardSave(current, request)
    if (result.success) {
      writeAppData(data)
      mainWindow?.webContents.send('instant-mode-data-changed')
    }
    return result
  } catch (err) {
    console.error('Failed to save instant card:', err)
    return { success: false, reason: 'error', error: '保存失败，内容已保留，请重试。' }
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

function getLocalStore(): LocalStore {
  const { dataDir: dir, dataFile: file } = getDataPaths()
  const settings = readSettingsSync()
  const provider = settings?.syncProvider ?? (settings?.webdav?.server ? 'webdav' : 'none')
  const syncIdentity = JSON.stringify(provider === 'github'
    ? ['github', settings?.github?.repo, settings?.github?.branch || 'main']
    : [provider, settings?.webdav?.server, settings?.webdav?.username])
  return createNodeLocalStore({
    syncIdentity,
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

let lastSyncDecision: SyncResult | null = null

// 把底层错误映射成精简中文原因，供界面直接展示。
function describeSyncError(err: any): string {
  const status = err?.status ?? err?.response?.status
  const msg = String(err?.message ?? err ?? '')
  if (status === 409 || status === 412 || status === 422) return '云端已更新，请重新同步'
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
  const result = await reconcileState(adapter, getLocalStore())
  lastSyncDecision = result.action === 'needs-confirmation' ? result : null
  return result
}

ipcMain.handle('sync-pending', () => {
  const store = getLocalStore()
  const data = store.readSnapshot()
  return !!data && store.readSyncBaseline()?.fingerprint !== getComparableSyncSnapshot(data)
})

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

ipcMain.handle('sync-periodic', async () => {
  // 即刻窗口持有一份独立的渲染态；暂停周期拉取，避免远端下载与正在记录的草稿互相覆盖。
  if (instantWindow && !instantWindow.isDestroyed()) {
    return { success: true, pending: true }
  }
  // 与 sync-auto 共用 runSync：远端未变(ETag)时跳过整份下载，仅一个 PROPFIND。
  return enqueueSync(async () => {
    try {
      return await runSync()
    } catch (err) {
      return { success: false, error: describeSyncError(err) }
    }
  })
})

ipcMain.handle('sync-resolve-conflict', async (_e, resolution: 'keep-local' | 'use-remote') => enqueueSync(async () => {
  try {
    const adapter = getActiveAdapter()
    if (!adapter) return { success: false, error: '未配置同步' }
    const result = await resolveConflict(adapter, getLocalStore(), resolution)
    lastSyncDecision = result.action === 'needs-confirmation' ? result : null
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
    return { success: false, error: ('error' in backupRes ? backupRes.error : '') || '清空前自动备份失败', ...status }
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
      return { success: false, error: ('error' in backupRes ? backupRes.error : '') || '清空前自动备份失败' }
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

ipcMain.handle('instant-mode-open', (_event, cardId?: string) => {
  if (cardId && !findInstantNote(readAppData() ?? { canvases: [] }, cardId)) return false
  if (cardId || !instantWindow) instantTarget = { requestId: ++instantRequestId, cardId: cardId ?? null }
  createInstantWindow()
  return true
})

ipcMain.on('instant-mode-close', () => {
  allowInstantClose = true
  instantWindow?.close()
})

ipcMain.handle('instant-mode-target', () => instantTarget)
ipcMain.handle('instant-editing-card-get', () => instantEditingCardId)
ipcMain.handle('instant-editing-card', (event, cardId: string | null) => {
  if (event.sender === instantWindow?.webContents) broadcastEditingCard(cardId)
})
ipcMain.handle('show-card-in-board', (_event, cardId: string) => {
  allowInstantClose = true
  instantWindow?.close()
  restoreMainWindow()
  mainWindow?.webContents.send('show-card-in-board', cardId)
})

ipcMain.on('instant-mode-hide', (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender)
  if (senderWindow && senderWindow === instantWindow) {
    senderWindow.minimize()
  }
})

ipcMain.handle('instant-mode-always-on-top', (_event, value: boolean) => {
  if (!instantWindow || instantWindow.isDestroyed()) return false
  instantWindow.setAlwaysOnTop(value)
  return instantWindow.isAlwaysOnTop()
})

ipcMain.on('instant-mode-data-changed', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instant-mode-data-changed')
  }
})

protocol.registerSchemesAsPrivileged([
  { scheme: 'fa-image', privileges: { standard: true, secure: true, bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'fa-img', privileges: { standard: true, secure: true, bypassCSP: true, supportFetchAPI: true, stream: true } },
])

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, '../build/icon.png'))
  }

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
  if (instantWindow && !instantWindow.isDestroyed()) {
    if (instantWindow.isMinimized()) instantWindow.restore()
    instantWindow.show()
    instantWindow.focus()
    return
  }
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', event => {
  if (isQuitting) return
  event.preventDefault()
  closeAfterSave(true)
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
