import type { ComponentProps } from 'react'
import { parseYouTubeUrl } from '../lib/youtube'
import YouTubePreview from './YouTubePreview'

export default function MarkdownVideoLink({ href, children, title }: ComponentProps<'a'>) {
  const video = href ? parseYouTubeUrl(href) : null
  if (video) return <YouTubePreview key={`${video.id}:${video.start}`} video={video} />
  return <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
}
