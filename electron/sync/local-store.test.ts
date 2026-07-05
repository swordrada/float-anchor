import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createNodeLocalStore } from './local-store'

let dir: string
let store: ReturnType<typeof createNodeLocalStore>

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-ls-'))
  store = createNodeLocalStore({
    dataFile: path.join(dir, 'float-anchor.json'),
    imagesDir: path.join(dir, 'images'),
    backupDir: path.join(dir, 'backups'),
    maxBackups: 2,
  })
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('LocalStore 读写', () => {
  it('写入后能读回并归一化', () => {
    store.writeSnapshot({ canvases: [{ id: 'c1', cards: [] }], activeCanvasId: 'c1', _syncTimestamp: 9 })
    const back = store.readSnapshot()
    expect(back?._syncTimestamp).toBe(9)
    expect(back?.canvases.length).toBe(1)
  })
  it('无文件时 readSnapshot 返回 null', () => {
    expect(store.readSnapshot()).toBeNull()
  })
})

describe('LocalStore 备份保留上限', () => {
  it('超过 maxBackups 时清理最旧', () => {
    store.writeSnapshot({ canvases: [], activeCanvasId: null })
    store.backup(); store.backup(); store.backup()
    const files = fs.readdirSync(path.join(dir, 'backups'))
    expect(files.length).toBeLessThanOrEqual(2)
  })
})

describe('LocalStore 图片', () => {
  it('写入图片后能列出含大小', () => {
    store.writeImage('a.png', Buffer.from([1, 2, 3]))
    const list = store.listImages()
    expect(list).toEqual([{ name: 'a.png', size: 3 }])
  })
})
