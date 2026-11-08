import { describe, expect, it } from 'vitest'
import { parseYouTubeUrl, youtubeEmbedUrl } from './youtube'

describe('YouTube links', () => {
  it.each([
    'https://www.youtube.com/watch?v=vKy6Q9hwon4',
    'https://youtu.be/vKy6Q9hwon4?si=share',
    'https://m.youtube.com/watch?v=vKy6Q9hwon4&list=playlist',
    'https://youtube.com/shorts/vKy6Q9hwon4',
    'https://youtube.com/live/vKy6Q9hwon4',
    'https://www.youtube-nocookie.com/embed/vKy6Q9hwon4',
    'www.youtube.com/watch?v=vKy6Q9hwon4',
  ])('recognizes %s', (url) => {
    expect(parseYouTubeUrl(url)).toEqual({ id: 'vKy6Q9hwon4', start: 0 })
  })

  it.each([
    ['?t=90', 90], ['?t=1h2m3s', 3723], ['?start=42', 42], ['#t=2m', 120],
    ['?t=-4', 0], ['?t=Infinity', 0], ['?t=999999999999999999999', 0],
  ])('preserves valid timestamps %s', (suffix, start) => {
    expect(parseYouTubeUrl(`https://youtu.be/vKy6Q9hwon4${suffix}`)?.start).toBe(start)
  })

  it.each([
    'https://example.com/watch?v=vKy6Q9hwon4',
    'https://youtube.com.evil.test/watch?v=vKy6Q9hwon4',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/watch?v=bad',
    'https://youtu.be/vKy6Q9hwon4/extra',
    'javascript:alert(1)',
    'file:///watch?v=vKy6Q9hwon4',
    'not a url',
  ])('leaves non-video/invalid links alone: %s', (url) => {
    expect(parseYouTubeUrl(url)).toBeNull()
  })

  it('builds a privacy-enhanced player URL with timestamp and inline playback', () => {
    const url = new URL(youtubeEmbedUrl(parseYouTubeUrl('https://youtu.be/vKy6Q9hwon4?t=60')!))
    expect(url.origin).toBe('https://www.youtube-nocookie.com')
    expect(url.pathname).toBe('/embed/vKy6Q9hwon4')
    expect(url.searchParams.get('start')).toBe('60')
    expect(url.searchParams.get('playsinline')).toBe('1')
  })
})
