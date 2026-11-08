import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { youtubeEmbedUrl, type YouTubeVideo } from '../lib/youtube'

export default function YouTubePreview({ video, children }: { video: YouTubeVideo; children: ReactNode }) {
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const previewRef = useRef<HTMLSpanElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const watchUrl = `https://www.youtube.com/watch?v=${video.id}${video.start ? `&t=${video.start}s` : ''}`

  useEffect(() => {
    if (expanded) dialogRef.current?.showModal()
  }, [expanded])

  useEffect(() => {
    const preview = previewRef.current
    if (!playing || expanded || !preview) return
    const observer = new ResizeObserver(() => {
      if (preview.clientWidth < 200) setExpanded(true)
    })
    observer.observe(preview)
    return () => observer.disconnect()
  }, [playing, expanded])

  const close = () => {
    setExpanded(false)
    setPlaying(false)
    requestAnimationFrame(() => playRef.current?.focus())
  }
  const play = () => {
    // YouTube requires a 200px-wide player. Narrow cards keep their width
    // and use an in-app dialog instead of stretching the card.
    if ((previewRef.current?.clientWidth ?? 0) < 200) setExpanded(true)
    else setPlaying(true)
  }
  const player = (
    <iframe
      className="youtube-player"
      src={youtubeEmbedUrl(video)}
      title="YouTube 视频播放器"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )

  return (
    <span className="youtube-preview" ref={previewRef} onDoubleClick={(e) => e.stopPropagation()}>
      <span className={`youtube-media${playing && !expanded ? ' is-playing' : ''}`}>
        {playing && !expanded ? player : (
          <button ref={playRef} type="button" className="youtube-cover" onClick={play} aria-label="在卡片内播放 YouTube 视频">
            {!imageFailed && <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="YouTube 视频封面" loading="lazy" onError={() => setImageFailed(true)} />}
            <span className="youtube-play-icon" aria-hidden="true">▶</span>
            <span className="youtube-cover-label">YouTube · 点击播放</span>
          </button>
        )}
      </span>
      <span className="youtube-actions">
        <a href={watchUrl} target="_blank" rel="noopener noreferrer" title="在 YouTube 打开">{children || '在 YouTube 打开'}</a>
        <button type="button" onClick={() => setExpanded(true)}>放大播放</button>
        {playing && <button type="button" onClick={close}>收起</button>}
      </span>
      {expanded && createPortal(
        <dialog ref={dialogRef} className="youtube-dialog" aria-label="YouTube 视频" onCancel={close} onClose={close}
          onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <div className="youtube-dialog-toolbar">
            <a href={watchUrl} target="_blank" rel="noopener noreferrer">在 YouTube 打开</a>
            <button type="button" onClick={close} autoFocus>关闭</button>
          </div>
          {player}
        </dialog>, document.body,
      )}
    </span>
  )
}
