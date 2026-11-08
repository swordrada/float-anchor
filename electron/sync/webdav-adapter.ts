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
    if (!(await client.exists(dir, { signal: AbortSignal.timeout(20000) }))) await client.createDirectory(dir, { signal: AbortSignal.timeout(20000) })
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
        await client.getDirectoryContents('/', { signal: AbortSignal.timeout(20000) })
        await ensureDir(client, WEBDAV_REMOTE_DIR)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
    async loadRemoteSnapshot(): Promise<{ data: AppData; tag?: string } | null> {
      const client = await getClient()
      try {
        const response = await client.getFileContents(WEBDAV_REMOTE_FILE, { format: 'text', details: true, signal: AbortSignal.timeout(20000) })
        return { data: normalizeSyncData(JSON.parse(response.data)), tag: response.headers.etag }
      } catch (error: any) {
        if (error.status === 404) return null
        throw error
      }
    },
    async uploadRemoteSnapshot(data: AppData, opts) {
      const client = await getClient()
      if (opts && !opts.createOnly && !opts.ifMatch) throw new Error('云端未提供文件版本标识，已保留本地内容，请稍后重试')
      await ensureDir(client, WEBDAV_REMOTE_DIR)
      const saved = await client.putFileContents(WEBDAV_REMOTE_FILE, JSON.stringify(data, null, 2), {
        overwrite: !opts?.createOnly,
        signal: AbortSignal.timeout(20000),
        headers: opts?.ifMatch ? { 'If-Match': opts.ifMatch } : {},
      })
      if (!saved) throw new Error('云端已更新，请重新同步')
      // Do not cache a fresh PROPFIND here: it may belong to another writer.
      return {}
    },
    async getRemoteTag() {
      // 用一个轻量 PROPFIND(stat) 拿文件 ETag/Last-Modified，避免周期同步每次下整份快照。
      // 不存在或出错 → 返回 null，调用方退回完整 reconcile。
      try {
        const client = await getClient()
        const st = await client.stat(WEBDAV_REMOTE_FILE, { signal: AbortSignal.timeout(20000) }) as { etag?: string | null; lastmod?: string }
        return st.etag ? (st.etag.startsWith('W/') ? st.etag : JSON.stringify(st.etag.replaceAll('"', ''))) : null
      } catch {
        return null
      }
    },
    async listRemoteImages(): Promise<RemoteImageEntry[]> {
      const client = await getClient()
      if (!(await client.exists(WEBDAV_REMOTE_IMAGES_DIR, { signal: AbortSignal.timeout(20000) }))) return []
      const entries = await client.getDirectoryContents(WEBDAV_REMOTE_IMAGES_DIR, { signal: AbortSignal.timeout(20000) })
      return (Array.isArray(entries) ? entries : [entries])
        .filter((e: any) => e?.type === 'file')
        .map((e: any) => ({ name: e.basename || path.posix.basename(e.filename || ''), size: e.size ?? 0 }))
    },
    async uploadImage(name: string, buf: Buffer) {
      const client = await getClient()
      await ensureDir(client, WEBDAV_REMOTE_IMAGES_DIR)
      await client.putFileContents(`${WEBDAV_REMOTE_IMAGES_DIR}/${name}`, buf, { overwrite: true, signal: AbortSignal.timeout(20000) })
    },
    async downloadImage(name: string): Promise<Buffer> {
      const client = await getClient()
      const binary = await client.getFileContents(`${WEBDAV_REMOTE_IMAGES_DIR}/${name}`, { format: 'binary', signal: AbortSignal.timeout(20000) })
      return toBinaryBuffer(binary)
    },
  }
}
