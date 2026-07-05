import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'

let tokenFilePath = ''
export function initGitHubAuth(filePath: string) { tokenFilePath = filePath }

export function saveGitHubToken(token: string) {
  if (!tokenFilePath) return
  try {
    if (!fs.existsSync(path.dirname(tokenFilePath))) fs.mkdirSync(path.dirname(tokenFilePath), { recursive: true })
    // safeStorage 不可用时(如无 keyring 的 Linux)降级明文存储，属 Electron 既有模型权衡
    const enc = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, 'utf-8')
    fs.writeFileSync(tokenFilePath, enc)
  } catch (err) { console.error('saveGitHubToken failed:', err) }
}

export function readGitHubToken(): string | null {
  try {
    if (!tokenFilePath || !fs.existsSync(tokenFilePath)) return null
    const buf = fs.readFileSync(tokenFilePath)
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8')
  } catch { return null }
}

export function clearGitHubToken() {
  try { if (tokenFilePath && fs.existsSync(tokenFilePath)) fs.unlinkSync(tokenFilePath) } catch {}
}

export function hasGitHubToken(): boolean {
  return !!tokenFilePath && fs.existsSync(tokenFilePath)
}
