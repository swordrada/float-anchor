import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWebDAVAdapter } from './webdav-adapter'

const client = vi.hoisted(() => ({
  exists: vi.fn(), createDirectory: vi.fn(), getFileContents: vi.fn(), putFileContents: vi.fn(),
}))
vi.mock('webdav', () => ({ createClient: () => client }))
const data = { canvases: [], activeCanvasId: null }
const adapter = () => createWebDAVAdapter({ server: 'https://example.test', username: 'test', password: 'test' })
beforeEach(() => { vi.resetAllMocks(); client.exists.mockResolvedValue(true) })

describe('WebDAV conditional writes', () => {
  it('uses the ETag from the same GET response and sends If-Match on upload', async () => {
    client.getFileContents.mockResolvedValue({ data: JSON.stringify(data), headers: { etag: '"revision-1"' } })
    client.putFileContents.mockResolvedValue(true)
    const remote = adapter()
    const snapshot = await remote.loadRemoteSnapshot()
    await remote.uploadRemoteSnapshot(data, { ifMatch: snapshot!.tag })
    expect(client.putFileContents).toHaveBeenCalledWith('FloatAnchor/float-anchor.json', expect.any(String), expect.objectContaining({ headers: { 'If-Match': '"revision-1"' } }))
  })
  it('does not retry a rejected conditional upload without its precondition', async () => {
    client.putFileContents.mockRejectedValue(Object.assign(new Error('precondition failed'), { status: 412 }))
    await expect(adapter().uploadRemoteSnapshot(data, { ifMatch: '"old"' })).rejects.toMatchObject({ status: 412 })
    expect(client.putFileContents).toHaveBeenCalledTimes(1)
  })
  it('refuses to overwrite an existing snapshot when its version cannot be verified', async () => {
    await expect(adapter().uploadRemoteSnapshot(data, { createOnly: false })).rejects.toThrow('版本标识')
    expect(client.putFileContents).not.toHaveBeenCalled()
  })
  it('creates missing snapshots only if they are still missing at upload time', async () => {
    client.putFileContents.mockResolvedValue(false)
    await expect(adapter().uploadRemoteSnapshot(data, { createOnly: true })).rejects.toThrow('云端已更新')
    expect(client.putFileContents).toHaveBeenCalledWith('FloatAnchor/float-anchor.json', expect.any(String), expect.objectContaining({ overwrite: false }))
  })
  it('treats only HTTP 404 as a missing snapshot, not offline/auth failures', async () => {
    client.getFileContents.mockRejectedValueOnce({ status: 404 }).mockRejectedValueOnce({ status: 503 })
    const remote = adapter()
    expect(await remote.loadRemoteSnapshot()).toBeNull()
    await expect(remote.loadRemoteSnapshot()).rejects.toMatchObject({ status: 503 })
  })
})
