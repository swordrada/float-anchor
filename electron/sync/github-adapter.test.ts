import { describe, it, expect, vi, afterEach } from 'vitest'
import { createGitHubAdapter } from './github-adapter'

function mockFetch(handler: (url: string, init?: any) => { status?: number; ok?: boolean; json?: any; text?: string; headers?: Record<string, string> }) {
  const calls: { url: string; init?: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init })
    const r = handler(url, init)
    const status = r.status ?? 200
    return {
      status,
      ok: r.ok ?? (status >= 200 && status < 300),
      headers: { get: (k: string) => (r.headers || {})[k] ?? null },
      async json() { return r.json },
      async text() { return r.text ?? '' },
      async arrayBuffer() { return new Uint8Array(Buffer.from(r.text ?? '')).buffer },
    } as any
  }))
  return calls
}
afterEach(() => vi.unstubAllGlobals())

const cfg = { repo: 'me/notes', token: 't0ken', branch: 'main' }

describe('GitHubAdapter', () => {
  it('getRemoteTag 返回 sha；404 返回 null', async () => {
    mockFetch((url) => url.includes('float-anchor.json') ? { json: { sha: 'abc123' } } : { status: 404, ok: false })
    expect(await createGitHubAdapter(cfg).getRemoteTag()).toBe('abc123')

    mockFetch(() => ({ status: 404, ok: false }))
    expect(await createGitHubAdapter(cfg).getRemoteTag()).toBeNull()
  })

  it('loadRemoteSnapshot 解析内联 base64 + 返回 tag', async () => {
    const data = { canvases: [{ id: 'c1', cards: [] }], activeCanvasId: 'c1', _syncTimestamp: 7 }
    const content = Buffer.from(JSON.stringify(data)).toString('base64')
    mockFetch(() => ({ json: { sha: 's1', content, encoding: 'base64' } }))
    const res = await createGitHubAdapter(cfg).loadRemoteSnapshot()
    expect(res?.tag).toBe('s1')
    expect(res?.data.canvases.length).toBe(1)
  })

  it('uploadRemoteSnapshot PUT 带 sha 并请求头含 Bearer', async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === 'PUT') return { json: { content: { sha: 'new9' } } }
      return { json: { sha: 'old1' } } // getRemoteTag 预热缓存
    })
    const a = createGitHubAdapter(cfg)
    await a.getRemoteTag() // 缓存 old1
    const r = await a.uploadRemoteSnapshot({ canvases: [], activeCanvasId: null } as any)
    expect(r.tag).toBe('new9')
    const put = calls.find((c) => c.init?.method === 'PUT')!
    expect(JSON.parse(put.init.body).sha).toBe('old1')
    expect(put.init.headers.Authorization).toBe('Bearer t0ken')
  })

  it('listRemoteImages 过滤 file；404 返回 []', async () => {
    mockFetch(() => ({ json: [{ type: 'file', name: 'a.png', size: 3, sha: 'i1' }, { type: 'dir', name: 'x' }] }))
    expect(await createGitHubAdapter(cfg).listRemoteImages()).toEqual([{ name: 'a.png', size: 3 }])
    mockFetch(() => ({ status: 404, ok: false }))
    expect(await createGitHubAdapter(cfg).listRemoteImages()).toEqual([])
  })

  it('含空格文件名: uploadImage 与 downloadImage URL 路径均含 %20 且一致', async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === 'PUT') return { json: { content: { sha: 'sha-img' } } }
      // fetchSha 预热: 404 使 uploadImage 跳过 sha; downloadImage 需返回 ok+二进制
      if (init?.headers?.Accept === 'application/vnd.github.raw') return { ok: true, text: '\x01\x02\x03' }
      return { status: 404, ok: false }
    })
    const a = createGitHubAdapter(cfg)

    await a.uploadImage('a b.png', Buffer.from([1, 2, 3]))
    await a.downloadImage('a b.png')

    // PUT URL 含编码后的 a%20b.png
    const putCall = calls.find((c) => c.init?.method === 'PUT')!
    expect(putCall.url).toContain('a%20b.png')

    // downloadImage GET URL（raw Accept）也含编码后的 a%20b.png
    const dlCall = calls.find((c) => c.init?.headers?.Accept === 'application/vnd.github.raw')!
    expect(dlCall.url).toContain('a%20b.png')

    // 两者路径中图片段一致
    const segment = (url: string) => url.split('images/')[1]?.split('?')[0]
    expect(segment(putCall.url)).toBe(segment(dlCall.url))
  })
})
