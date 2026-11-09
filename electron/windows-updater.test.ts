import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupInstalledWindowsUpdates, launchWindowsUpdate } from './windows-updater'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(spawn).mockReset()
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('Windows silent update launcher', () => {
  it.each([
    String.raw`C:\Users\Alice\AppData\Local\Programs\FloatAnchor\FloatAnchor.exe`,
    String.raw`D:\我的应用\Float Anchor & Notes (个人)\FloatAnchor.exe`,
    String.raw`C:\Program Files\FloatAnchor\FloatAnchor.exe`,
  ])('silently updates the running installation at %s and asks NSIS to restart it', async executable => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess)
    const installer = String.raw`C:\Users\测试 用户\AppData\Local\Temp\float-anchor-update\FloatAnchor-1.0.27-win-setup.exe`
    const started = vi.fn()
    const promise = launchWindowsUpdate(installer, executable).then(started)
    await Promise.resolve()
    expect(started).not.toHaveBeenCalled()
    expect(child.unref).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(installer, [
      '--updated', '/S', '--force-run', `/D=${path.win32.dirname(executable)}`,
    ], expect.objectContaining({
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: true,
      argv0: `"${installer}"`,
      cwd: path.win32.dirname(installer),
    }))
    child.emit('spawn')
    await promise
    expect(child.unref).toHaveBeenCalledOnce()
    expect(started).toHaveBeenCalledOnce()
  })

  it('rejects an asynchronous launch failure instead of reporting a started update', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess)
    const promise = launchWindowsUpdate(String.raw`C:\Temp\setup.exe`, String.raw`D:\FloatAnchor\FloatAnchor.exe`)
    const rejected = expect(promise).rejects.toThrow('EACCES')
    child.emit('error', new Error('EACCES'))
    await rejected
    expect(child.unref).not.toHaveBeenCalled()
  })

  it('reports synchronous launch failures through the same promise', async () => {
    vi.mocked(spawn).mockImplementation(() => { throw new Error('Invalid executable') })
    await expect(launchWindowsUpdate('setup.exe', 'FloatAnchor.exe')).rejects.toThrow('Invalid executable')
  })
})

describe('Windows update cache cleanup', () => {
  it('removes only already installed Windows versions and preserves future/partial downloads', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-update-cache-'))
    directories.push(directory)
    const old = ['FloatAnchor-1.0.9-win-setup.exe', 'FloatAnchor-1.0.26-win-setup.exe', 'FloatAnchor-1.0.26-win-setup.exe.meta']
    const keep = [
      'FloatAnchor-1.0.27-win-setup.exe', 'FloatAnchor-1.0.100-win-setup.exe.part',
      'FloatAnchor-1.0.100-win-setup.exe.meta', 'FloatAnchor-1.0.26-mac-arm64.dmg', 'notes.json',
    ]
    for (const name of [...old, ...keep]) fs.writeFileSync(path.join(directory, name), 'data')
    fs.mkdirSync(path.join(directory, 'FloatAnchor-1.0.25-win-setup.exe'))
    cleanupInstalledWindowsUpdates(directory, '1.0.26')
    expect(fs.readdirSync(directory).sort()).toEqual([...keep, 'FloatAnchor-1.0.25-win-setup.exe'].sort())
  })

  it('tolerates an installer still locked by Windows and retries at a later startup', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-update-cache-'))
    directories.push(directory)
    const file = path.join(directory, 'FloatAnchor-1.0.27-win-setup.exe')
    fs.writeFileSync(file, 'data')
    vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => { throw new Error('EBUSY') })
    expect(() => cleanupInstalledWindowsUpdates(directory, '1.0.27')).not.toThrow()
    expect(fs.existsSync(file)).toBe(true)
    cleanupInstalledWindowsUpdates(directory, '1.0.27')
    expect(fs.existsSync(file)).toBe(false)
  })
})
