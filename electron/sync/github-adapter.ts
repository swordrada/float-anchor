import { normalizeSyncData } from './summary'
import type { AppData } from './summary'
import type { RemoteAdapter, RemoteImageEntry } from './types'

const API = 'https://api.github.com'
const SNAPSHOT_PATH = 'float-anchor.json'
const IMAGES_DIR = 'images'

export interface GitHubConfig { repo: string; token: string; branch?: string }

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export function createGitHubAdapter(config: GitHubConfig): Required<RemoteAdapter> {
  const slash = config.repo.trim().replace(/^\/+|\/+$/g, '')
  const [owner, repo] = slash.split('/')
  const branch = config.branch || 'main'
  const base = `${API}/repos/${owner}/${repo}/contents`
  // 实例内缓存各路径 blob sha（更新必带）。同一次 runSync 复用同一 adapter 实例，故上传时 sha 新鲜。
  const shaCache = new Map<string, string>()

  async function ghFetch(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const resp = await fetch(url, { ...init, headers: { ...authHeaders(config.token), ...(init.headers || {}) } })
    // 速率受限(remaining=0)退避一次
    if ((resp.status === 403 || resp.status === 429) && retry && resp.headers.get('X-RateLimit-Remaining') === '0') {
      const reset = Number(resp.headers.get('X-RateLimit-Reset') || '0') * 1000
      const wait = Math.min(Math.max(reset - Date.now(), 1000), 10000)
      await new Promise((r) => setTimeout(r, wait))
      return ghFetch(url, init, false)
    }
    return resp
  }

  const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')
  const contentUrl = (path: string) => `${base}/${encodePath(path)}?ref=${encodeURIComponent(branch)}`

  async function fetchSha(path: string): Promise<string | null> {
    const resp = await ghFetch(contentUrl(path))
    if (resp.status === 404) return null
    if (!resp.ok) throw new Error(`GitHub ${resp.status}`)
    const meta = await resp.json()
    if (meta?.sha) shaCache.set(path, meta.sha)
    return meta?.sha || null
  }

  async function putFile(path: string, base64: string, message: string, ifMatch?: string): Promise<string | undefined> {
    const body: Record<string, unknown> = { message, content: base64, branch }
    const sha = ifMatch ?? shaCache.get(path)
    if (sha) body.sha = sha
    const resp = await ghFetch(`${base}/${encodePath(path)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!resp.ok) throw new Error(`GitHub ${resp.status}`)
    const json = await resp.json()
    const newSha = json?.content?.sha
    if (newSha) shaCache.set(path, newSha)
    return newSha
  }

  return {
    async test() {
      try {
        const resp = await ghFetch(`${API}/repos/${owner}/${repo}`)
        return resp.ok ? { ok: true } : { ok: false, error: `GitHub ${resp.status}` }
      } catch (err) { return { ok: false, error: String(err) } }
    },

    async getRemoteTag() {
      return fetchSha(SNAPSHOT_PATH)
    },

    async loadRemoteSnapshot(): Promise<{ data: AppData; tag?: string } | null> {
      const metaResp = await ghFetch(contentUrl(SNAPSHOT_PATH))
      if (metaResp.status === 404) return null
      if (!metaResp.ok) throw new Error(`GitHub ${metaResp.status}`)
      const meta = await metaResp.json()
      if (meta?.sha) shaCache.set(SNAPSHOT_PATH, meta.sha)
      let text: string
      if (meta?.content && meta.encoding === 'base64') {
        text = Buffer.from(meta.content, 'base64').toString('utf-8')
      } else {
        const rawResp = await ghFetch(contentUrl(SNAPSHOT_PATH), { headers: { Accept: 'application/vnd.github.raw' } })
        if (!rawResp.ok) throw new Error(`GitHub ${rawResp.status}`)
        text = await rawResp.text()
      }
      return { data: normalizeSyncData(JSON.parse(text)), tag: meta?.sha }
    },

    async uploadRemoteSnapshot(data: AppData, opts?: { ifMatch?: string }) {
      const base64 = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64')
      const newSha = await putFile(SNAPSHOT_PATH, base64, 'FloatAnchor: 同步快照', opts?.ifMatch)
      return { tag: newSha }
    },

    async listRemoteImages(): Promise<RemoteImageEntry[]> {
      const resp = await ghFetch(contentUrl(IMAGES_DIR))
      if (resp.status === 404) return []
      if (!resp.ok) return []
      const arr = await resp.json()
      if (!Array.isArray(arr)) return []
      const out: RemoteImageEntry[] = []
      for (const it of arr) {
        if (it?.type === 'file' && it.name) {
          if (it.sha) shaCache.set(`${IMAGES_DIR}/${it.name}`, it.sha)
          out.push({ name: it.name, size: it.size ?? 0 })
        }
      }
      return out
    },

    async uploadImage(name: string, buf: Buffer) {
      const path = `${IMAGES_DIR}/${name}`
      if (!shaCache.has(path)) { try { await fetchSha(path) } catch {} }
      await putFile(path, buf.toString('base64'), 'FloatAnchor: 图片')
    },

    async downloadImage(name: string): Promise<Buffer> {
      const resp = await ghFetch(contentUrl(`${IMAGES_DIR}/${name}`), {
        headers: { Accept: 'application/vnd.github.raw' },
      })
      if (!resp.ok) throw new Error(`GitHub ${resp.status}`)
      return Buffer.from(await resp.arrayBuffer())
    },
  }
}
