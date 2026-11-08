export const YOUTUBE_APP_ORIGIN = 'https://com.floatanchor.app'

export interface YouTubeVideo {
  id: string
  start: number
}

export function parseYouTubeUrl(href: string): YouTubeVideo | null {
  try {
    const url = new URL(href.startsWith('www.') ? `https://${href}` : href)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    let id: string | null = null
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      if (parts.length === 1) id = parts[0]
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else if (parts.length === 2 && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1]
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null
    const time = url.searchParams.get('start') ?? url.searchParams.get('t') ?? new URLSearchParams(url.hash.slice(1)).get('t') ?? ''
    const match = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
    const seconds = /^\d+$/.test(time) ? Number(time)
      : match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0
    return { id, start: Number.isSafeInteger(seconds) ? seconds : 0 }
  } catch {
    return null
  }
}

export function youtubeEmbedUrl(video: YouTubeVideo): string {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${video.id}`)
  url.searchParams.set('autoplay', '1')
  url.searchParams.set('playsinline', '1')
  if (video.start) url.searchParams.set('start', String(video.start))
  return url.href
}
