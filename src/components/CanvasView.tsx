import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import NoteCard from './NoteCard'

const MIN_SCALE = 0.15
const MAX_SCALE = 3

export default function CanvasView() {
  const { getActiveCanvas, addCard } = useStore()
  const canvas = getActiveCanvas()

  const viewportRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  const panRef = useRef(pan)
  panRef.current = pan
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  const [isRightDragging, setIsRightDragging] = useState(false)
  const rightDragStart = useRef({ x: 0, y: 0 })
  const panAtDragStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [canvas?.id])

  // Wheel: two-finger swipe → pan,  pinch / Ctrl+wheel → zoom
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        const s = scaleRef.current
        const p = panRef.current
        const factor = 1 + (-e.deltaY) * 0.008
        const ns = Math.min(Math.max(s * factor, MIN_SCALE), MAX_SCALE)
        const ratio = ns / s
        const rect = vp.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        setPan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio })
        setScale(ns)
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }))
      }
    }

    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [])

  // Right-click drag → pan (Windows mouse / any platform)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      setIsRightDragging(true)
      rightDragStart.current = { x: e.clientX, y: e.clientY }
      panAtDragStart.current = { x: panRef.current.x, y: panRef.current.y }
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isRightDragging) return
      setPan({
        x: panAtDragStart.current.x + (e.clientX - rightDragStart.current.x),
        y: panAtDragStart.current.y + (e.clientY - rightDragStart.current.y),
      })
    },
    [isRightDragging],
  )

  const handleMouseUp = useCallback(() => {
    setIsRightDragging(false)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  // Double-click empty area → create card at that position
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.note-card')) return
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current
      const y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current
      addCard(x, y)
    },
    [addCard],
  )

  const handleAddCard = () => {
    const vp = viewportRef.current
    if (!vp) return
    const cx =
      (vp.clientWidth / 2 - panRef.current.x) / scaleRef.current - 140
    const cy =
      (vp.clientHeight / 2 - panRef.current.y) / scaleRef.current - 100
    const jitter = () => (Math.random() - 0.5) * 60
    addCard(cx + jitter(), cy + jitter())
  }

  if (!canvas) {
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
        <h2 className="canvas-toolbar-title">{canvas.name}</h2>
        <div className="toolbar-right">
          <span className="zoom-indicator">{Math.round(scale * 100)}%</span>
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
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <div
          className="canvas-inner"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {canvas.cards.map((card) => (
            <NoteCard key={card.id} card={card} scale={scale} />
          ))}
        </div>

        {canvas.cards.length === 0 && (
          <div className="canvas-empty-cards">
            <p>双击空白区域添加卡片，或点击上方「添加卡片」按钮</p>
          </div>
        )}
      </div>
    </main>
  )
}
