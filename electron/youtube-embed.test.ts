import { describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
import { configureYouTubeEmbeds } from './youtube-embed'

describe('packaged YouTube player identity', () => {
  function configured() {
    const register = vi.fn()
    configureYouTubeEmbeds({ webRequest: { onBeforeSendHeaders: register } } as unknown as Session)
    return { filter: register.mock.calls[0][0], handler: register.mock.calls[0][1] }
  }

  it('identifies the app only for the embedded player request from a packaged page', () => {
    const { filter, handler } = configured()
    expect(filter.urls).toEqual(['https://www.youtube-nocookie.com/embed/*'])
    const callback = vi.fn()
    handler({ resourceType: 'subFrame', webContents: { getURL: () => 'file:///app/index.html' }, requestHeaders: { Accept: '*/*' } }, callback)
    expect(callback).toHaveBeenCalledWith({ requestHeaders: { Accept: '*/*', Referer: 'https://com.floatanchor.app/' } })
  })

  it.each([
    ['subFrame', 'http://localhost:5174', {}],
    ['mainFrame', 'file:///app/index.html', {}],
    ['subFrame', 'file:///app/index.html', { referer: 'https://existing.example/' }],
  ])('preserves existing headers for %s at %s', (resourceType, location, requestHeaders) => {
    const { handler } = configured()
    const callback = vi.fn()
    handler({ resourceType, webContents: { getURL: () => location }, requestHeaders }, callback)
    expect(callback).toHaveBeenCalledWith({ requestHeaders })
  })
})
