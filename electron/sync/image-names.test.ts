import { describe, it, expect } from 'vitest'
import { extractStoredImageName, getImageBasename, getReferencedImageNames, isRemoteImageNameMatch } from './image-names'

describe('getImageBasename', () => {
  it('去掉 query/hash 取文件名', () => {
    expect(getImageBasename('a/b/c.png?x=1#y')).toBe('c.png')
  })
})

describe('extractStoredImageName', () => {
  it('解析 fa-img:// 协议', () => {
    expect(extractStoredImageName('fa-img://abc.png')).toBe('abc.png')
  })
  it('非图片返回 null', () => {
    expect(extractStoredImageName('https://x.com/page')).toBeNull()
  })
})

describe('getReferencedImageNames', () => {
  it('扫描卡片正文里的 fa-img 引用', () => {
    const data = { canvases: [{ cards: [{ content: 'see fa-img://k.png here' }] }] }
    expect(getReferencedImageNames(data).has('k.png')).toBe(true)
  })
})

describe('isRemoteImageNameMatch', () => {
  it('同名匹配', () => {
    expect(isRemoteImageNameMatch('k.png', 'k.png')).toBe(true)
  })
})
