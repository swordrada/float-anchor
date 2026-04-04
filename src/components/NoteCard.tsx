import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import ReactMarkdown, { Components, defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useStore, useCardById, useIsEditing, useCardActions } from '../store'
import RichEditor from './RichEditor'

interface Props {
  cardId: string
  scale: number
  highlight?: boolean
}

const remarkPlugins = [remarkGfm]

function faUrlTransform(url: string): string {
  if (url.startsWith('fa://') || url.startsWith('fa:')) return url
  if (url.startsWith('data:')) return url
  return defaultUrlTransform(url)
}

function navigateToCard(targetId: string) {
  const s = useStore.getState()
  const currentCanvas = s.canvases.find((c) => c.id === s.activeCanvasId)
  if (currentCanvas?.cards.find((c) => c.id === targetId)) {
    s.setHighlightCard(targetId)
    window.dispatchEvent(new CustomEvent('fa-fly-to-card', { detail: { cardId: targetId } }))
    return
  }
  const otherCanvas = s.canvases.find((c) => c.cards.some((card) => card.id === targetId))
  if (otherCanvas) {
    s.setActiveCanvas(otherCanvas.id)
    s.setHighlightCard(targetId)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('fa-fly-to-card', { detail: { cardId: targetId } }))
    }, 50)
  }
}

function FaCardLink({ targetId }: { targetId: string }) {
  const store = useStore.getState()
  let targetTitle = '无标题卡片'
  for (const c of store.canvases) {
    const found = c.cards.find((card) => card.id === targetId)
    if (found) { targetTitle = found.title || '无标题卡片'; break }
  }
  return (
    <a
      href="#"
      className="fa-card-link"
      onClick={(e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        navigateToCard(targetId)
      }}
    >
      {targetTitle}
    </a>
  )
}

const NoteCard = React.memo(function NoteCard({ cardId, scale, highlight }: Props) {
  const card = useCardById(cardId)
  const isEditing = useIsEditing(cardId)
  const { moveCard, deleteCard, updateCard, setEditingCard } = useCardActions()

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [title, setTitle] = useState(card?.title ?? '')
  const [content, setContent] = useState(card?.content ?? '')
  const cardRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const wasEditing = useRef(false)

  useEffect(() => {
    if (!isEditing && card) {
      setTitle(card.title)
      setContent(card.content)
    }
  }, [card?.title, card?.content, isEditing])

  const measureHeight = useCallback(() => {
    const el = cardRef.current
    if (!el) return
    const prev = el.style.height
    const prevContain = el.style.contain
    el.style.height = 'auto'
    el.style.contain = 'none'
    el.style.overflow = 'visible'
    void el.offsetHeight
    const naturalHeight = Math.max(80, el.scrollHeight)
    el.style.height = prev
    el.style.contain = prevContain
    el.style.overflow = ''
    return naturalHeight
  }, [])

  useEffect(() => {
    if (isEditing) {
      wasEditing.current = true
      requestAnimationFrame(() => {
        if (titleRef.current) {
          titleRef.current.focus()
          if (card?.title === '新卡片') titleRef.current.select()
        }
      })
    } else if (wasEditing.current) {
      wasEditing.current = false
      requestAnimationFrame(() => {
        const h = measureHeight()
        if (h != null) updateCard(cardId, { height: h })
      })
    }
  }, [isEditing, cardId, updateCard, measureHeight])

  useEffect(() => {
    if (isEditing || !card) return
    requestAnimationFrame(() => {
      const h = measureHeight()
      if (h != null && card.height && Math.abs(h - card.height) > 2) {
        updateCard(cardId, { height: h })
      }
    })
  }, [card?.content, card?.title, card?.width])

  const debouncedSave = useCallback(
    (t: string, c: string) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(
        () => updateCard(cardId, { title: t, content: c }),
        500,
      )
    },
    [cardId, updateCard],
  )

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const onTitleChange = (v: string) => {
    setTitle(v)
    debouncedSave(v, content)
  }

  const onContentChange = (md: string) => {
    setContent(md)
    debouncedSave(title, md)
  }

  const autoFitAndClose = useCallback(() => {
    clearTimeout(saveTimer.current)
    updateCard(cardId, { title, content })
    setEditingCard(null)
  }, [cardId, title, content, updateCard, setEditingCard])

  const closeEditing = () => {
    autoFitAndClose()
  }

  useEffect(() => {
    if (!isEditing) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        autoFitAndClose()
      }
    }
    const timer = setTimeout(
      () => document.addEventListener('mousedown', handler),
      80,
    )
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [isEditing, autoFitAndClose])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || !card) return
      e.stopPropagation()
      e.preventDefault()
      setIsDragging(true)
      const sx = e.clientX
      const sy = e.clientY
      const ox = card.x
      const oy = card.y
      const s = scale
      let dragRaf = 0
      const onMove = (ev: MouseEvent) => {
        cancelAnimationFrame(dragRaf)
        dragRaf = requestAnimationFrame(() =>
          moveCard(cardId, ox + (ev.clientX - sx) / s, oy + (ev.clientY - sy) / s),
        )
      }
      const onUp = () => {
        cancelAnimationFrame(dragRaf)
        setIsDragging(false)
        useStore.getState().finalizeCardMove(cardId)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [cardId, card?.x, card?.y, scale, moveCard],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!isEditing) setEditingCard(cardId)
    },
    [cardId, isEditing, setEditingCard],
  )

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isEditing) setEditingCard(cardId)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteCard(cardId)
  }

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || !card) return
      e.stopPropagation()
      e.preventDefault()
      setIsResizing(true)
      const sx = e.clientX
      const sy = e.clientY
      const ow = card.width
      const oh =
        card.height ??
        (cardRef.current ? cardRef.current.getBoundingClientRect().height / scale : 200)
      const s = scale
      let resizeRaf = 0
      const onMove = (ev: MouseEvent) => {
        cancelAnimationFrame(resizeRaf)
        resizeRaf = requestAnimationFrame(() => {
          const nw = Math.max(200, ow + (ev.clientX - sx) / s)
          const nh = Math.max(100, oh + (ev.clientY - sy) / s)
          updateCard(cardId, { width: nw, height: nh })
        })
      }
      const onUp = () => {
        cancelAnimationFrame(resizeRaf)
        setIsResizing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [cardId, card?.width, card?.height, scale, updateCard],
  )

  const mdComponents = useMemo<Partial<Components>>(() => ({
    a: ({ href, children }) => {
      if (href) {
        const faMatch = href.match(/^fa:\/\/(.+)/) || href.match(/^fa:(.+)/)
        if (faMatch) {
          return <FaCardLink targetId={faMatch[1]} />
        }
      }
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    },
    img: ({ src, alt, ...props }) => (
      <img
        src={src}
        alt={alt || ''}
        {...props}
        style={{ maxWidth: '100%', borderRadius: 4 }}
        onError={(e) => {
          const el = e.currentTarget
          if (!el.dataset.failed) {
            el.dataset.failed = '1'
            el.style.display = 'none'
            const placeholder = document.createElement('div')
            placeholder.textContent = alt || 'Image unavailable'
            placeholder.style.cssText = 'padding:12px 16px;background:#f3f4f6;border-radius:6px;color:#9ca3af;font-size:13px;text-align:center;margin:4px 0'
            el.parentNode?.insertBefore(placeholder, el.nextSibling)
          }
        }}
      />
    ),
  }), [])

  const renderedContent = useMemo(() => {
    if (!card?.content) return null
    return (
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={[rehypeRaw]} components={mdComponents} urlTransform={faUrlTransform}>
        {card.content}
      </ReactMarkdown>
    )
  }, [card?.content, mdComponents])

  if (!card) return null

  return (
    <div
      ref={cardRef}
      data-card-id={cardId}
      className={`note-card ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isEditing ? 'editing' : ''} ${highlight ? 'highlight-breathe' : ''}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        ...(card.height && !isEditing ? { height: card.height } : {}),
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div className="card-drag-handle" onMouseDown={handleDragStart}>
        <div className="drag-grip">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="card-banner-actions">
          {!isEditing && (
            <button
              className="card-banner-btn card-edit-btn"
              title="编辑"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleEdit}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
          )}
          <button
            className="card-banner-btn card-delete-btn"
            title="删除"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {isEditing ? (
        <div
          className="card-edit-mode"
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeEditing()
          }}
        >
          <input
            ref={titleRef}
            className="card-edit-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="输入标题..."
            spellCheck={false}
          />
          <RichEditor content={content} onChange={onContentChange} />
        </div>
      ) : (
        <>
          {card.title && (
            <div className="card-header">
              <h3 className="card-title">{card.title}</h3>
            </div>
          )}
          {card.content ? (
            <div className={`card-content markdown-body${card.title ? '' : ' no-title'}`}>
              {renderedContent}
            </div>
          ) : (
            <div className="card-placeholder">双击编辑内容...</div>
          )}
        </>
      )}

      <div className="card-resize-handle" onMouseDown={handleResizeStart}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="9" y1="1" x2="1" y2="9" stroke="#bbb" strokeWidth="1" />
          <line x1="9" y1="4" x2="4" y2="9" stroke="#bbb" strokeWidth="1" />
          <line x1="9" y1="7" x2="7" y2="9" stroke="#bbb" strokeWidth="1" />
        </svg>
      </div>
    </div>
  )
})

export default NoteCard
