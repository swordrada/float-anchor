import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { launchWindowsUpdate } from './windows-updater'

const runtime = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  ready: null as null | (() => void),
  windows: [] as any[],
  directory: '',
  saveSucceeds: true,
  acknowledgeSave: true,
  events: [] as string[],
  fetch: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
}))

vi.mock('./windows-updater', () => ({ launchWindowsUpdate: vi.fn(), cleanupInstalledWindowsUpdates: vi.fn() }))
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '1.0.26',
    getPath: (name: string) => name === 'exe' ? String.raw`D:\我的应用\Float Anchor\FloatAnchor.exe` : runtime.directory,
    whenReady: () => ({ then: (callback: () => void) => { runtime.ready = callback } }),
    on: vi.fn(),
    quit: runtime.quit,
    exit: runtime.exit,
  },
  BrowserWindow: class extends EventEmitter {
    static getAllWindows() { return runtime.windows }
    webContents = Object.assign(new EventEmitter(), {
      id: runtime.windows.length + 1,
      setWindowOpenHandler: vi.fn(),
      send: vi.fn((channel: string, ...args: any[]) => {
        if (channel === 'close-save-request') {
          runtime.events.push(`save:${this.webContents.id}`)
          if (runtime.acknowledgeSave) queueMicrotask(() => {
            runtime.listeners.get('close-save-complete')!({ sender: this.webContents }, args[0], runtime.saveSucceeds)
          })
        }
      }),
    })
    constructor() { super(); runtime.windows.push(this) }
    isDestroyed() { return false }
    loadFile() {}
    loadURL() {}
    minimize() {}
    setVisibleOnAllWorkspaces() {}
  },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => runtime.handlers.set(name, handler),
    on: (name: string, listener: (...args: any[]) => any) => runtime.listeners.set(name, listener),
  },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: vi.fn() } } },
  net: { fetch: runtime.fetch },
  dialog: { showMessageBox: vi.fn() },
  shell: {},
  safeStorage: {},
}))

const asset = 'FloatAnchor-1.0.27-win-setup.exe'
const downloadUrl = `https://github.com/swordrada/float-anchor/releases/download/v1.0.27/${asset}`
const originalPlatform = process.platform
const originalArch = process.arch
const invoke = (name: string, ...args: any[]) => runtime.handlers.get(name)!({}, ...args)
const startUpdate = () => invoke('trigger-update', downloadUrl, asset)
const cachePath = () => path.join(runtime.directory, 'float-anchor-update', asset)

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  runtime.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-update-flow-'))
  runtime.handlers.clear()
  runtime.listeners.clear()
  runtime.windows = []
  runtime.events = []
  runtime.saveSucceeds = true
  runtime.acknowledgeSave = true
  runtime.quit.mockImplementation(() => { runtime.events.push('quit') })
  vi.mocked(launchWindowsUpdate).mockImplementation(async () => { runtime.events.push('installer') })
  runtime.fetch.mockImplementation(async (url: string) => url.endsWith('latest.yml')
    ? new Response(`version: 1.0.27\nfiles:\n  - url: ${asset}\n    size: 9\n`)
    : new Response('installer', { headers: { 'content-length': '9' } }))
  // Load dependencies on the host platform, then exercise the Windows branch.
  await import('./main')
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  Object.defineProperty(process, 'arch', { value: 'x64', configurable: true })
  runtime.ready!()
  await invoke('check-update')
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
  fs.writeFileSync(cachePath(), 'installer')
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  Object.defineProperty(process, 'arch', { value: originalArch, configurable: true })
  vi.useRealTimers()
  vi.restoreAllMocks()
  fs.rmSync(runtime.directory, { recursive: true, force: true })
})

describe('Windows update IPC lifecycle', () => {
  it('saves the instant editor and main window before launching, then quits without deleting the installer', async () => {
    await invoke('instant-mode-open')
    expect(await startUpdate()).toEqual({ success: true })
    expect(runtime.events).toEqual(['save:2', 'save:1', 'installer', 'quit'])
    expect(launchWindowsUpdate).toHaveBeenCalledWith(cachePath(), String.raw`D:\我的应用\Float Anchor\FloatAnchor.exe`)
    expect(fs.readFileSync(cachePath(), 'utf-8')).toBe('installer')
    expect(runtime.exit).not.toHaveBeenCalled()
    expect(runtime.fetch).toHaveBeenCalledTimes(1) // Reuse a fully downloaded package on retry.
  })

  it('downloads the complete package before saving or starting installation', async () => {
    fs.unlinkSync(cachePath())
    expect(await startUpdate()).toEqual({ success: true })
    expect(fs.readFileSync(cachePath(), 'utf-8')).toBe('installer')
    expect(fs.existsSync(cachePath() + '.part')).toBe(false)
    expect(runtime.events).toEqual(['save:1', 'installer', 'quit'])
    expect(runtime.fetch).toHaveBeenCalledWith(downloadUrl, expect.any(Object))
  })

  it('keeps the app and cached package when saving fails, then allows retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    runtime.saveSucceeds = false
    expect(await startUpdate()).toMatchObject({ success: false, error: expect.stringContaining('尚未保存') })
    expect(launchWindowsUpdate).not.toHaveBeenCalled()
    expect(runtime.quit).not.toHaveBeenCalled()
    expect(runtime.windows[0].webContents.send).toHaveBeenCalledWith('close-save-cancelled')
    expect(fs.existsSync(cachePath())).toBe(true)
    runtime.saveSucceeds = true
    expect(await startUpdate()).toEqual({ success: true })
  })

  it('keeps both editors usable after a launch failure and reports the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await invoke('instant-mode-open')
    vi.mocked(launchWindowsUpdate).mockRejectedValueOnce(new Error('EACCES'))
    expect(await startUpdate()).toMatchObject({ success: false, error: expect.stringContaining('EACCES') })
    expect(runtime.quit).not.toHaveBeenCalled()
    for (const window of runtime.windows) expect(window.webContents.send).toHaveBeenCalledWith('close-save-cancelled')
    expect(runtime.windows[0].webContents.send).toHaveBeenCalledWith('update-progress', {
      stage: 'error', percent: 0, error: 'Error: EACCES',
    })
    expect(await startUpdate()).toEqual({ success: true })
  })

  it('blocks repeated updates and cancellation while saving for installation', async () => {
    runtime.acknowledgeSave = false
    const pending = startUpdate()
    expect(await startUpdate()).toMatchObject({ success: false, error: expect.stringContaining('正在进行') })
    expect(await invoke('cancel-update')).toMatchObject({ success: false })
    const window = runtime.windows[0]
    const request = window.webContents.send.mock.calls.find(([channel]: [string]) => channel === 'close-save-request')!
    runtime.listeners.get('close-save-complete')!({ sender: window.webContents }, request[1], true)
    expect(await pending).toEqual({ success: true })
    expect(launchWindowsUpdate).toHaveBeenCalledOnce()
  })

  it('aborts installation if an editor does not acknowledge saving in time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    runtime.acknowledgeSave = false
    const pending = startUpdate()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toMatchObject({ success: false, error: expect.stringContaining('尚未保存') })
    expect(launchWindowsUpdate).not.toHaveBeenCalled()
    expect(runtime.quit).not.toHaveBeenCalled()
    expect(runtime.windows[0].webContents.send).toHaveBeenCalledWith('close-save-cancelled')
  })

  it('preserves a cancelled partial download and resumes it before installing', async () => {
    fs.unlinkSync(cachePath())
    runtime.fetch.mockImplementationOnce(async (_url: string, { signal }: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('inst'))
        signal!.addEventListener('abort', () => controller.error(new DOMException('cancelled', 'AbortError')), { once: true })
      },
    }), { headers: { 'content-length': '9' } }))
    const pending = startUpdate()
    await vi.waitFor(() => expect(fs.statSync(cachePath() + '.part').size).toBe(4))
    expect(await invoke('cancel-update')).toEqual({ success: true })
    expect(await pending).toEqual({ success: false, error: 'cancelled' })
    expect(launchWindowsUpdate).not.toHaveBeenCalled()
    expect(runtime.quit).not.toHaveBeenCalled()
    expect(fs.readFileSync(cachePath() + '.part', 'utf-8')).toBe('inst')

    runtime.fetch.mockResolvedValueOnce(new Response('aller', {
      status: 206, headers: { 'content-range': 'bytes 4-8/9', 'content-length': '5' },
    }))
    expect(await startUpdate()).toEqual({ success: true })
    expect(runtime.fetch).toHaveBeenLastCalledWith(downloadUrl, expect.objectContaining({
      headers: expect.objectContaining({ Range: 'bytes=4-' }),
    }))
    expect(fs.readFileSync(cachePath(), 'utf-8')).toBe('installer')
    expect(launchWindowsUpdate).toHaveBeenCalledOnce()
  })

  it('rejects unverified download URLs and filenames before executing or writing them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await invoke('trigger-update', 'https://example.com/setup.exe', '../setup.exe')).toMatchObject({ success: false })
    expect(launchWindowsUpdate).not.toHaveBeenCalled()
    expect(runtime.quit).not.toHaveBeenCalled()
    expect(runtime.fetch).toHaveBeenCalledTimes(1)
  })
})
