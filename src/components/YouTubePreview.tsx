import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { youtubeEmbedUrl, type YouTubeVideo } from '../lib/youtube'

// Keep the media at 16:9 without adding a black strip to satisfy YouTube's
// 200 × 200 minimum player viewport. Smaller cards play in the existing dialog.
const MIN_INLINE_WIDTH = 200 * 16 / 9

export default function YouTubePreview({ video, onRemove }: { video: YouTubeVideo; onRemove?: () => void }) {
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const previewRef = useRef<HTMLSpanElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)
  const watchUrl = `https://www.youtube.com/watch?v=${video.id}${video.start ? `&t=${video.start}s` : ''}`

  useEffect(() => {
    if (expanded) dialogRef.current?.showModal()
  }, [expanded])

  useEffect(() => {
    const preview = previewRef.current
    if (!playing || expanded || !preview) return
    const observer = new ResizeObserver(() => {
      if (preview.clientWidth < MIN_INLINE_WIDTH) setExpanded(true)
    })
    observer.observe(preview)
    return () => observer.disconnect()
  }, [playing, expanded])

  const close = () => {
    setExpanded(false)
    setPlaying(false)
    requestAnimationFrame(() => {
      const trigger = returnFocusRef.current
      if (trigger?.isConnected) trigger.focus()
      else playRef.current?.focus()
    })
  }
  const expand = (event: MouseEvent<HTMLButtonElement>) => {
    returnFocusRef.current = event.currentTarget
    setExpanded(true)
  }
  const play = (event: MouseEvent<HTMLButtonElement>) => {
    returnFocusRef.current = event.currentTarget
    if ((previewRef.current?.clientWidth ?? 0) < MIN_INLINE_WIDTH) setExpanded(true)
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
      <span className="youtube-media">
        {playing && !expanded ? player : (
          <button ref={playRef} type="button" className="youtube-cover" onClick={play} aria-label="在卡片内播放 YouTube 视频">
            {!imageFailed && <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" onError={() => setImageFailed(true)} />}
            <span className="youtube-play-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
            {imageFailed && <span className="youtube-cover-error">封面暂不可用，仍可尝试播放</span>}
          </button>
        )}
        <span className="youtube-overlay-actions">
          <button type="button" onClick={expand} aria-label="放大播放" title="放大播放">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" /></svg>
          </button>
          {playing && <button type="button" onClick={close} aria-label="停止播放" title="停止播放">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
          </button>}
          {onRemove && <button type="button" onClick={onRemove} aria-label="删除视频" title="删除视频（可撤销）">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
          </button>}
        </span>
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
