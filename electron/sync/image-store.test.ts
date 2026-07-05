import { describe, it, expect, vi } from 'vitest'
import { extFromMime, sniffExt, resolveExt, hashName, rewriteEmbeddedImages } from './image-store'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])

describe('extFromMime / sniffExt / resolveExt', () => {
  it('mime 映射', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('image/webp')).toBe('webp')
    expect(extFromMime('application/x')).toBe('')
  })
  it('magic bytes 嗅探', () => {
    expect(sniffExt(PNG)).toBe('png')
    expect(sniffExt(JPG)).toBe('jpg')
    expect(sniffExt(Buffer.from([1, 2, 3]))).toBe('')
  })
  it('resolveExt 优先 mime，其次嗅探，再兜底 png', () => {
    expect(resolveExt('image/gif', PNG)).toBe('gif')
    expect(resolveExt(undefined, JPG)).toBe('jpg')
    expect(resolveExt(undefined, Buffer.from([1, 2]))).toBe('png')
  })
})

describe('hashName', () => {
  it('同内容同名（去重）、含扩展名', () => {
    const a = hashName(PNG, 'png')
    const b = hashName(PNG, 'png')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}\.png$/)
  })
})

describe('rewriteEmbeddedImages', () => {
  it('把 markdown 里的 data URL 替换为 fa-img:// 并调用 save', () => {
    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const content = `前文 ![](data:image/png;base64,${png1x1}) 后文`
    const saved: { mime: string; len: number }[] = []
    const save = vi.fn((buf: Buffer, mime: string) => { saved.push({ mime, len: buf.length }); return 'deadbeefdeadbeef.png' })
    const res = rewriteEmbeddedImages(content, save)
    expect(res.extracted).toBe(1)
    expect(res.content).toBe('前文 ![](fa-img://deadbeefdeadbeef.png) 后文')
    expect(save).toHaveBeenCalledTimes(1)
    expect(saved[0].mime).toBe('image/png')
    expect(saved[0].len).toBeGreaterThan(0)
  })
  it('无 data URL 时原样返回，extracted=0', () => {
    const res = rewriteEmbeddedImages('![](fa-img://x.png) 纯文本', vi.fn())
    expect(res.extracted).toBe(0)
    expect(res.content).toBe('![](fa-img://x.png) 纯文本')
  })
})
