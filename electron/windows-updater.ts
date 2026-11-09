import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// The caller must save all editors before launching NSIS: --updated lets the
// installer close any remaining app processes before replacing locked files.
export function launchWindowsUpdate(installerPath: string, executablePath: string): Promise<void> {
  const installDirectory = path.win32.dirname(executablePath)
  const args = ['--updated', '/S', '--force-run', `/D=${installDirectory}`]

  return new Promise((resolve, reject) => {
    const installer = spawn(installerPath, args, {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
      // NSIS requires /D to be last and unquoted, including paths with spaces.
      // Quote argv[0] ourselves so a space in the download path is also safe.
      windowsVerbatimArguments: true,
      argv0: `"${installerPath}"`,
      // Do not hold the installation directory open while NSIS replaces it.
      cwd: path.win32.dirname(installerPath),
    })
    installer.once('error', reject)
    installer.once('spawn', () => {
      installer.unref()
      resolve()
    })
  })
}

export function cleanupInstalledWindowsUpdates(cacheDirectory: string, currentVersion: string): void {
  const current = currentVersion.split('.').map(Number)
  if (current.length !== 3 || !current.every(Number.isSafeInteger)) return
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(cacheDirectory, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const match = /^FloatAnchor-(\d+\.\d+\.\d+)-win-setup\.exe(?:\.part|\.meta)?$/.exec(entry.name)
    if (!match) continue
    const version = match[1].split('.').map(Number)
    const different = version.findIndex((part, index) => part !== current[index])
    // Keep newer downloads (including paused updates) until that version runs.
    if (different !== -1 && version[different] > current[different]) continue
    try { fs.unlinkSync(path.join(cacheDirectory, entry.name)) } catch {
      // The installer can still be finishing as the new app starts on Windows.
      // A locked file will be retried at the next launch, never during install.
    }
  }
}
