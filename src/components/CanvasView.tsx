import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useStore, useActiveCanvasMeta, useActiveCards } from '../store'
import NoteCard from './NoteCard'

const MIN_SCALE = 0.15
const MAX_SCALE = 3
const VIEWPORT_PADDING = 400
const CULL_THROTTLE = 120

export default function CanvasView() {
  const addCard = useStore((s) => s.addCard)
  const meta = useActiveCanvasMeta()
  const cards = useActiveCards()

  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)

  const pan = useRef({ x: 0, y: 0 })
  const scaleVal = useRef(1)

  const [cullTick, setCullTick] = useState(0)
  const cullTimer = useRef<ReturnType<typeof setTimeout>>()
  const rafId = useRef(0)

  const [isRightDragging, setIsRightDragging] = useState(false)
  const rightDragStart = useRef({ x: 0, y: 0 })
  const panAtDragStart = useRef({ x: 0, y: 0 })

  const applyTransform = useCallback(() => {
    if (innerRef.current) {
      innerRef.current.style.transform =
        `translate3d(${pan.current.x}px,${pan.current.y}px,0) scale(${scaleVal.current})`
    }
    if (zoomRef.current) {
      zoomRef.current.textContent = `${Math.round(scaleVal.current * 100)}%`
    }
  }, [])

  const scheduleCull = useCallback(() => {
    clearTimeout(cullTimer.current)
    cullTimer.current = setTimeout(() => setCullTick((t) => t + 1), CULL_THROTTLE)
  }, [])

  useEffect(() => {
    pan.current = { x: 0, y: 0 }
    scaleVal.current = 1
    applyTransform()
    setCullTick((t) => t + 1)
  }, [meta?.id, applyTransform])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        const s = scaleVal.current
        const p = pan.current
        const factor = 1 + (-e.deltaY) * 0.008
        const ns = Math.min(Math.max(s * factor, MIN_SCALE), MAX_SCALE)
        const ratio = ns / s
        const rect = vp.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        pan.current = { x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }
        scaleVal.current = ns
      } else {
        pan.current = {
          x: pan.current.x - e.deltaX,
          y: pan.current.y - e.deltaY,
        }
      }

      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(applyTransform)
      scheduleCull()
    }

    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      vp.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(rafId.current)
      clearTimeout(cullTimer.current)
    }
  }, [applyTransform, scheduleCull])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      setIsRightDragging(true)
      rightDragStart.current = { x: e.clientX, y: e.clientY }
      panAtDragStart.current = { ...pan.current }
    }
  }, [])

  useEffect(() => {
    if (!isRightDragging) return
    const onMove = (e: MouseEvent) => {
      pan.current = {
        x: panAtDragStart.current.x + (e.clientX - rightDragStart.current.x),
        y: panAtDragStart.current.y + (e.clientY - rightDragStart.current.y),
      }
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(applyTransform)
      scheduleCull()
    }
    const onUp = () => setIsRightDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isRightDragging, applyTransform, scheduleCull])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.note-card')) return
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left - pan.current.x) / scaleVal.current
      const y = (e.clientY - rect.top - pan.current.y) / scaleVal.current
      addCard(x, y)
    },
    [addCard],
  )

  const handleAddCard = () => {
    const vp = viewportRef.current
    if (!vp) return
    const cx = (vp.clientWidth / 2 - pan.current.x) / scaleVal.current - 140
    const cy = (vp.clientHeight / 2 - pan.current.y) / scaleVal.current - 100
    const jitter = () => (Math.random() - 0.5) * 60
    addCard(cx + jitter(), cy + jitter())
  }

  const vpRect = viewportRef.current?.getBoundingClientRect()
  const vpW = vpRect?.width ?? 1400
  const vpH = vpRect?.height ?? 900

  const visibleCardIds = useMemo(() => {
    const p = pan.current
    const s = scaleVal.current
    const viewLeft = (-p.x) / s - VIEWPORT_PADDING
    const viewTop = (-p.y) / s - VIEWPORT_PADDING
    const viewRight = (vpW - p.x) / s + VIEWPORT_PADDING
    const viewBottom = (vpH - p.y) / s + VIEWPORT_PADDING

    const ids = new Set<string>()
    for (const card of cards) {
      const cardRight = card.x + card.width
      const cardBottom = card.y + (card.height ?? 300)
      if (
        card.x < viewRight &&
        cardRight > viewLeft &&
        card.y < viewBottom &&
        cardBottom > viewTop
      ) {
        ids.add(card.id)
      }
    }
    return ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, cullTick, vpW, vpH])

  if (!meta) {
    return (
      <main className="canvas-empty-state">
        <div className="empty-hint">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          <p>在左侧创建一个画布开始使用</p>
        </div>
      </main>
    )
  }

  return (
    <main className="canvas-main">
      <div className="canvas-toolbar">
        <h2 className="canvas-toolbar-title">{meta.name}</h2>
        <div className="toolbar-right">
          <span ref={zoomRef} className="zoom-indicator">100%</span>
          <button className="toolbar-add-btn" onClick={handleAddCard}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>添加卡片</span>
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`canvas-viewport ${isRightDragging ? 'panning' : ''}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <div
          ref={innerRef}
          className="canvas-inner"
          style={{ transform: 'translate3d(0,0,0) scale(1)', transformOrigin: '0 0' }}
        >
          {cards.map((card) =>
            visibleCardIds.has(card.id) ? (
              <NoteCard key={card.id} cardId={card.id} scale={scaleVal.current} />
            ) : (
              <div
                key={card.id}
                className="note-card-placeholder"
                style={{
                  position: 'absolute',
                  left: card.x,
                  top: card.y,
                  width: card.width,
                  height: card.height ?? 60,
                }}
              />
            ),
          )}
        </div>

        {cards.length === 0 && (
          <div className="canvas-empty-cards">
            <p>双击空白区域添加卡片，或点击上方「添加卡片」按钮</p>
          </div>
        )}
      </div>
    </main>
  )
}
