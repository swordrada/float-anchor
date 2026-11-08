import { describe, it, expect, vi } from 'vitest'
import { reconcileState, resolveConflict, downloadMissingImages } from './engine'
import type { RemoteAdapter, LocalStore, RemoteImageEntry } from './types'
import { getComparableSyncSnapshot, type AppData } from './summary'
import type { SyncBaseline } from './types'

function fakeAdapter(init?: { data?: AppData | null }): RemoteAdapter & { _data: AppData | null } {
  let remote: AppData | null = init?.data ?? null
  return {
    _data: remote,
    async test() { return { ok: true } },
    async loadRemoteSnapshot() { return remote ? { data: remote } : null },
    async uploadRemoteSnapshot(data) { remote = JSON.parse(JSON.stringify(data)); this._data = remote; return {} },
    async listRemoteImages(): Promise<RemoteImageEntry[]> { return [] },
    async uploadImage() {},
    async downloadImage() { return Buffer.from([]) },
  }
}

function memStore(init?: { data?: AppData | null; mtime?: number }): LocalStore {
  let data: AppData | null = init?.data ?? null
  let mtime = init?.mtime ?? 0
  let baseline: SyncBaseline | null = null
  return {
    readSnapshot() { return data ? JSON.parse(JSON.stringify(data)) : null },
    writeSnapshot(d) { data = JSON.parse(JSON.stringify(d)) },
    getModifiedAt() { return mtime },
    markSynced(ts) { mtime = ts },
    readSyncBaseline() { return baseline },
    writeSyncBaseline(value) { baseline = value },
    backup() {},
    listImages() { return [] },
    readImage() { return null },
    writeImage() {},
    getMissingImageNames() { return [] },
    resolveStoredImagePath() { return null },
  }
}

const canvasWith = (over: any) => ({ canvases: [{ id: 'c1', name: 'C', cards: [], ...over }], activeCanvasId: 'c1' })

describe('reconcileState', () => {
  it('远端无快照、本地有数据 → 上传', async () => {
    const store = memStore({ data: { ...canvasWith({ cards: [{}] }), _syncTimestamp: 1 }, mtime: 1 })
    const adapter = fakeAdapter()
    const res = await reconcileState(adapter, store)
    expect(res.action).toBe('uploaded')
    expect(adapter._data?.canvases[0].cards.length).toBe(1)
  })

  it('本地无、远端有有效数据 → 下载', async () => {
    const store = memStore()
    const adapter = fakeAdapter({ data: { ...canvasWith({ cards: [{}] }), _syncTimestamp: 5 } })
    const res = await reconcileState(adapter, store)
    expect(res.action).toBe('downloaded')
  })

  it('指纹一致 → up-to-date', async () => {
    const data = { ...canvasWith({ cards: [{}] }), _syncTimestamp: 3 }
    const res = await reconcileState(fakeAdapter({ data }), memStore({ data, mtime: 3 }))
    expect(res.action).toBe('up-to-date')
  })

  it('本地脏 + 远端更新 → 需确认', async () => {
    const local = { ...canvasWith({ cards: [{}] }), _syncTimestamp: 1 }
    const remote = { ...canvasWith({ cards: [{}, {}] }), _syncTimestamp: 10000 }
    const store = memStore({ data: local, mtime: 999999 }) // mtime 远大于 ts → dirty
    const res = await reconcileState(fakeAdapter({ data: remote }), store)
    expect(res.action).toBe('needs-confirmation')
  })
})

describe('content-based batched sync', () => {
  const base = () => ({ ...canvasWith({ cards: [{ id: 'note', content: 'original' }] }), _syncTimestamp: 10000, _contentUpdatedAt: 9000 })
  const baseline = (store: LocalStore, data: AppData, tag?: string) => store.writeSyncBaseline({
    fingerprint: getComparableSyncSnapshot(data), syncTimestamp: data._syncTimestamp || 0,
    contentUpdatedAt: data._contentUpdatedAt, tag,
  })
  const changed = (data: AppData, content: string, time = 20000) => ({
    ...data, _contentUpdatedAt: time, canvases: [{ ...data.canvases[0], cards: [{ id: 'note', content }] }],
  })

  it('panning, zooming and switching views never upload, even with a newer file mtime', async () => {
    const remote = base()
    const local = { ...remote, activeView: 'journal', activeCanvasId: 'other', canvases: [{ ...remote.canvases[0], viewport: { panX: 20, panY: 30, scale: 2 } }] }
    const store = memStore({ data: local, mtime: 999999 })
    const adapter = fakeAdapter({ data: remote })
    adapter.uploadRemoteSnapshot = vi.fn(adapter.uploadRemoteSnapshot)
    for (let i = 0; i < 3; i++) expect((await reconcileState(adapter, store)).action).toBe('up-to-date')
    expect(adapter.uploadRemoteSnapshot).not.toHaveBeenCalled()
    expect(store.readSnapshot()?.canvases[0].viewport).toEqual(local.canvases[0].viewport)
  })

  it('a verified baseline survives restart and permits only changed content to upload', async () => {
    const original = base(), store = memStore({ data: changed(original, 'new') })
    baseline(store, original)
    const adapter = fakeAdapter({ data: original })
    expect((await reconcileState(adapter, store)).action).toBe('uploaded')
    expect(adapter._data?.canvases[0].cards[0].content).toBe('new')
    expect((await reconcileState(adapter, store)).action).toBe('up-to-date')
  })

  it('only skips download for a tag belonging to the last agreed content', async () => {
    const original = base(), store = memStore({ data: original })
    baseline(store, original, 'etag-1')
    const adapter = fakeAdapter({ data: original })
    adapter.getRemoteTag = vi.fn(async () => 'etag-1')
    adapter.loadRemoteSnapshot = vi.fn(adapter.loadRemoteSnapshot)
    expect((await reconcileState(adapter, store)).action).toBe('up-to-date')
    expect(adapter.loadRemoteSnapshot).not.toHaveBeenCalled()
  })

  it('downloads a remote-only edit with backup while keeping this device viewport', async () => {
    const original = base(), local = { ...original, canvases: [{ ...original.canvases[0], viewport: { panX: 20 } }] }
    const store = memStore({ data: local }), remote = changed(original, 'remote edit')
    baseline(store, original)
    store.backup = vi.fn()
    expect((await reconcileState(fakeAdapter({ data: remote }), store)).action).toBe('downloaded')
    expect(store.readSnapshot()?.canvases[0]).toMatchObject({ viewport: { panX: 20 }, cards: [{ content: 'remote edit' }] })
    expect(store.backup).toHaveBeenCalledOnce()
  })

  it('does not upload an externally restored old local backup over the common version', async () => {
    const original = base(), store = memStore({ data: changed(original, 'old backup', 1000) })
    baseline(store, original)
    const adapter = fakeAdapter({ data: original })
    expect((await reconcileState(adapter, store)).action).toBe('downloaded')
    expect(adapter._data).toEqual(original)
  })

  it('repeated checks of simultaneous edits remain conflicts without changing the baseline', async () => {
    const original = base(), store = memStore({ data: changed(original, 'local') })
    baseline(store, original)
    const adapter = fakeAdapter({ data: changed(original, 'remote', 99999999) })
    for (let i = 0; i < 3; i++) expect((await reconcileState(adapter, store)).action).toBe('needs-confirmation')
    expect(store.readSyncBaseline()?.fingerprint).toBe(getComparableSyncSnapshot(original))
    expect(store.readSnapshot()?.canvases[0].cards[0].content).toBe('local')
    expect(adapter._data?.canvases[0].cards[0].content).toBe('remote')
  })

  it('an upload in flight cannot overwrite another local edit or mark it synced', async () => {
    const original = base(), store = memStore({ data: changed(original, 'upload this') })
    baseline(store, original)
    const adapter = fakeAdapter({ data: original })
    const upload = adapter.uploadRemoteSnapshot.bind(adapter)
    adapter.uploadRemoteSnapshot = async (data, options) => {
      store.writeSnapshot(changed(original, 'typed while uploading', 30000))
      return upload(data, options)
    }
    expect(await reconcileState(adapter, store)).toMatchObject({ action: 'uploaded', pending: true })
    expect(store.readSnapshot()?.canvases[0].cards[0].content).toBe('typed while uploading')
    expect(adapter._data?.canvases[0].cards[0].content).toBe('upload this')
    expect((await reconcileState(adapter, store)).action).toBe('uploaded')
  })

  it('an edit during remote image download prevents overwriting local content', async () => {
    const original = base(), store = memStore({ data: original })
    baseline(store, original)
    const adapter = fakeAdapter({ data: changed(original, 'remote') })
    store.getMissingImageNames = () => ['a.png']
    adapter.listRemoteImages = async () => [{ name: 'a.png', size: 1 }]
    adapter.downloadImage = async () => { store.writeSnapshot(changed(original, 'local while downloading')); return Buffer.from([1]) }
    expect((await reconcileState(adapter, store)).action).toBe('needs-confirmation')
    expect(store.readSnapshot()?.canvases[0].cards[0].content).toBe('local while downloading')
  })

  it('daily-journal-only changes are uploaded and are not treated as an empty document', async () => {
    const data = { ...canvasWith({}), journal: { entriesByDate: { '2026-11-08': { content: 'journal' } } } }
    const adapter = fakeAdapter(), store = memStore({ data })
    expect((await reconcileState(adapter, store)).action).toBe('uploaded')
    expect(adapter._data?.journal).toEqual(data.journal)
  })

  it('failed uploads leave local data and last agreed baseline intact for restart retry', async () => {
    const original = base(), local = changed(original, 'offline edit'), store = memStore({ data: local })
    baseline(store, original)
    const adapter = fakeAdapter({ data: original })
    adapter.uploadRemoteSnapshot = async () => { throw new Error('offline') }
    await expect(reconcileState(adapter, store)).rejects.toThrow('offline')
    expect(store.readSnapshot()).toEqual(local)
    expect(store.readSyncBaseline()?.fingerprint).toBe(getComparableSyncSnapshot(original))
    expect((await reconcileState(fakeAdapter({ data: original }), store)).action).toBe('uploaded')
  })

  it('passes the observed remote revision to conditional upload', async () => {
    const original = base(), store = memStore({ data: changed(original, 'local') })
    baseline(store, original)
    const adapter = fakeAdapter({ data: original })
    adapter.loadRemoteSnapshot = async () => ({ data: original, tag: 'etag-read' })
    adapter.uploadRemoteSnapshot = vi.fn(async () => { throw new Error('412 newer remote') })
    await expect(reconcileState(adapter, store)).rejects.toThrow('412')
    expect(adapter.uploadRemoteSnapshot).toHaveBeenCalledWith(expect.anything(), { ifMatch: 'etag-read', createOnly: false })
    expect(store.readSyncBaseline()?.fingerprint).toBe(getComparableSyncSnapshot(original))
  })

  it('does not overlook a content edit immediately after the last sync during migration', async () => {
    const original = base(), store = memStore({ data: changed(original, 'one millisecond later', 10001) })
    const adapter = fakeAdapter({ data: original })
    expect((await reconcileState(adapter, store)).action).toBe('uploaded')
    expect(adapter._data?.canvases[0].cards[0].content).toBe('one millisecond later')
  })

  it('does not replace local content if the backup cannot be written', async () => {
    const original = base(), store = memStore({ data: original })
    baseline(store, original)
    store.backup = () => { throw new Error('disk full') }
    await expect(reconcileState(fakeAdapter({ data: changed(original, 'remote') }), store)).rejects.toThrow('disk full')
    expect(store.readSnapshot()).toEqual(original)
  })
})

describe('downloadMissingImages — 扩展名容差匹配', () => {
  it('本地引用 a.png，远端只有 a.jpeg → 应下载并写入 a.jpeg', async () => {
    const remoteImages: RemoteImageEntry[] = [{ name: 'a.jpeg', size: 10 }]
    const downloadedFiles: string[] = []
    const adapter: RemoteAdapter = {
      async test() { return { ok: true } },
      async loadRemoteSnapshot() { return null },
      async uploadRemoteSnapshot() { return {} },
      async listRemoteImages() { return remoteImages },
      async uploadImage() {},
      async downloadImage(name) { return Buffer.from([0xff, 0xd8, 0xff]) }, // 模拟 JPEG buffer
    }
    const data: AppData = { canvases: [], activeCanvasId: null }
    const store: LocalStore = {
      readSnapshot() { return data },
      writeSnapshot() {},
      getModifiedAt() { return 0 },
      markSynced() {},
      readSyncBaseline() { return null },
      writeSyncBaseline() {},
      backup() {},
      listImages() { return [] },
      readImage() { return null },
      writeImage(name) { downloadedFiles.push(name) },
      getMissingImageNames() { return ['a.png'] },
      resolveStoredImagePath() { return null },
    }
    const n = await downloadMissingImages(adapter, store, data)
    expect(n).toBe(1)
    // 落盘文件名应含 a（basename 一致），且用远端扩展名 .jpeg
    expect(downloadedFiles.length).toBe(1)
    expect(downloadedFiles[0]).toMatch(/^a\.jpeg$/)
  })
})

describe('resolveConflict', () => {
  it('keep-local → 上传本地', async () => {
    const store = memStore({ data: { ...canvasWith({ cards: [{}] }), _syncTimestamp: 1 }, mtime: 1 })
    const adapter = fakeAdapter({ data: { ...canvasWith({}), _syncTimestamp: 9 } })
    const res = await resolveConflict(adapter, store, 'keep-local')
    expect(res.action).toBe('uploaded')
    expect(adapter._data?.canvases[0].cards.length).toBe(1)
  })
  it('use-remote → 下载覆盖', async () => {
    const store = memStore({ data: { ...canvasWith({ cards: [{}] }), _syncTimestamp: 1 }, mtime: 1 })
    const adapter = fakeAdapter({ data: { ...canvasWith({ cards: [{}, {}] }), _syncTimestamp: 9 } })
    const res = await resolveConflict(adapter, store, 'use-remote')
    expect(res.action).toBe('downloaded')
    expect(res.data?.canvases[0].cards.length).toBe(2)
  })
})
