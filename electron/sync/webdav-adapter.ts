import path from 'node:path'
import { normalizeSyncData } from './summary'
import type { AppData } from './summary'
import type { RemoteAdapter, RemoteImageEntry } from './types'

export const WEBDAV_REMOTE_DIR = 'FloatAnchor'
export const WEBDAV_REMOTE_FILE = 'FloatAnchor/float-anchor.json'
export const WEBDAV_REMOTE_IMAGES_DIR = 'FloatAnchor/images'

function toBinaryBuffer(content: unknown): Buffer {
  if (Buffer.isBuffer(content)) return content
  if (content instanceof Uint8Array) return Buffer.from(content)
  if (content instanceof ArrayBuffer) return Buffer.from(content)
  if (typeof content === 'string') return Buffer.from(content, 'binary')
  return Buffer.from([])
}

async function ensureDir(client: any, dir: string) {
  try {
    if (!(await client.exists(dir))) await client.createDirectory(dir)
  } catch (err) {
    console.log(`ensureDir note for ${dir}:`, err)
  }
}

export function createWebDAVAdapter(config: { server: string; username: string; password: string }): RemoteAdapter {
  let clientPromise: Promise<any> | null = null
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('webdav').then(({ createClient }) =>
        createClient(config.server, { username: config.username, password: config.password }))
    }
    return clientPromise
  }

  return {
    async test() {
      try {
        const client = await getClient()
        await client.getDirectoryContents('/')
        await ensureDir(client, WEBDAV_REMOTE_DIR)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
    async loadRemoteSnapshot(): Promise<{ data: AppData; tag?: string } | null> {
      const client = await getClient()
      if (!(await client.exists(WEBDAV_REMOTE_FILE))) return null
      const raw = await client.getFileContents(WEBDAV_REMOTE_FILE, { format: 'text' })
      return { data: normalizeSyncData(JSON.parse(raw as string)) }
    },
    async uploadRemoteSnapshot(data: AppData) {
      const client = await getClient()
      await ensureDir(client, WEBDAV_REMOTE_DIR)
      await client.putFileContents(WEBDAV_REMOTE_FILE, JSON.stringify(data, null, 2), { overwrite: true })
      return {}
    },
    async getRemoteTag() {
      // 用一个轻量 PROPFIND(stat) 拿文件 ETag/Last-Modified，避免周期同步每次下整份快照。
      // 不存在或出错 → 返回 null，调用方退回完整 reconcile。
      try {
        const client = await getClient()
        const st = await client.stat(WEBDAV_REMOTE_FILE) as { etag?: string | null; lastmod?: string }
        return st.etag || st.lastmod || null
      } catch {
        return null
      }
    },
    async listRemoteImages(): Promise<RemoteImageEntry[]> {
      const client = await getClient()
      if (!(await client.exists(WEBDAV_REMOTE_IMAGES_DIR))) return []
      const entries = await client.getDirectoryContents(WEBDAV_REMOTE_IMAGES_DIR)
      return (Array.isArray(entries) ? entries : [entries])
        .filter((e: any) => e?.type === 'file')
        .map((e: any) => ({ name: e.basename || path.posix.basename(e.filename || ''), size: e.size ?? 0 }))
    },
    async uploadImage(name: string, buf: Buffer) {
      const client = await getClient()
      await ensureDir(client, WEBDAV_REMOTE_IMAGES_DIR)
      await client.putFileContents(`${WEBDAV_REMOTE_IMAGES_DIR}/${name}`, buf, { overwrite: true })
    },
    async downloadImage(name: string): Promise<Buffer> {
      const client = await getClient()
      const binary = await client.getFileContents(`${WEBDAV_REMOTE_IMAGES_DIR}/${name}`, { format: 'binary' })
      return toBinaryBuffer(binary)
    },
  }
}
