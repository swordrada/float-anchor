import fs from 'node:fs'
import path from 'node:path'
import type { AppData } from './summary'
import { normalizeSyncData } from './summary'
import type { LocalStore, LocalImage } from './types'
import { IMAGE_EXTENSION_CANDIDATES, getReferencedImageNames } from './image-names'

export function isRealImageFile(filePath: string): boolean {
  try {
    const header = fs.readFileSync(filePath).subarray(0, 12)
    return (
      header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      header.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])) ||
      header.subarray(0, 4).toString('ascii') === 'GIF8' ||
      (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') ||
      header.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
      header.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
    )
  } catch {
    return false
  }
}

export function createNodeLocalStore(opts: {
  dataFile: string
  imagesDir: string
  backupDir: string
  maxBackups?: number
}): LocalStore {
  const { dataFile, imagesDir, backupDir } = opts
  const maxBackups = opts.maxBackups ?? 5

  function resolveStoredImagePath(fileName: string): string | null {
    const normalizedName = path.basename(fileName)
    const exactPath = path.join(imagesDir, normalizedName)
    if (fs.existsSync(exactPath) && isRealImageFile(exactPath)) return exactPath
    const baseName = path.parse(normalizedName).name || normalizedName
    for (const ext of IMAGE_EXTENSION_CANDIDATES) {
      const candidate = path.join(imagesDir, `${baseName}${ext}`)
      if (fs.existsSync(candidate) && isRealImageFile(candidate)) return candidate
    }
    return null
  }

  return {
    readSnapshot(): AppData | null {
      try {
        if (!fs.existsSync(dataFile)) return null
        return normalizeSyncData(JSON.parse(fs.readFileSync(dataFile, 'utf-8')))
      } catch {
        return null
      }
    },
    writeSnapshot(data: AppData) {
      if (!fs.existsSync(path.dirname(dataFile))) fs.mkdirSync(path.dirname(dataFile), { recursive: true })
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8')
    },
    getModifiedAt(): number {
      try {
        if (!fs.existsSync(dataFile)) return 0
        return fs.statSync(dataFile).mtimeMs
      } catch {
        return 0
      }
    },
    markSynced(syncTimestamp: number) {
      if (!syncTimestamp || !fs.existsSync(dataFile)) return
      try {
        const t = new Date(syncTimestamp)
        fs.utimesSync(dataFile, t, t)
      } catch {}
    },
    backup() {
      try {
        if (!fs.existsSync(dataFile)) return
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        fs.copyFileSync(dataFile, path.join(backupDir, `backup-${ts}.json`))
        const files = fs.readdirSync(backupDir).sort()
        while (files.length > maxBackups) fs.unlinkSync(path.join(backupDir, files.shift()!))
      } catch (err) {
        console.error('Backup failed:', err)
      }
    },
    listImages(): LocalImage[] {
      if (!fs.existsSync(imagesDir)) return []
      return fs.readdirSync(imagesDir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, size: fs.statSync(path.join(imagesDir, e.name)).size }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    readImage(name: string): Buffer | null {
      const p = path.join(imagesDir, path.basename(name))
      return fs.existsSync(p) ? fs.readFileSync(p) : null
    },
    writeImage(name: string, buf: Buffer) {
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
      fs.writeFileSync(path.join(imagesDir, path.basename(name)), buf)
    },
    getMissingImageNames(data: AppData): string[] {
      return Array.from(getReferencedImageNames(data)).filter((n) => !resolveStoredImagePath(n))
    },
    resolveStoredImagePath,
  }
}
