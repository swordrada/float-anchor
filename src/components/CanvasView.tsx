import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useStore, useActiveCanvasMeta, useActiveCards } from '../store'
import NoteCard from './NoteCard'
import type { Card } from '../types'

const MIN_SCALE = 0.15
const MAX_SCALE = 3
const VIEWPORT_PADDING = 400
const CULL_THROTTLE = 120

function findDensestCenter(cards: Card[]): { cx: number; cy: number; clusterCards: Card[] } | null {
  if (cards.length === 0) return null
  if (cards.length <= 3) {
    const cx = cards.reduce((s, c) => s + c.x + c.width / 2, 0) / cards.length
    const cy = cards.reduce((s, c) => s + c.y + (c.height ?? 200) / 2, 0) / cards.length
    return { cx, cy, clusterCards: cards }
  }

  const centers = cards.map((c) => ({
    card: c,
    mx: c.x + c.width / 2,
    my: c.y + (c.height ?? 200) / 2,
  }))

  const radius = 800
  let bestIdx = 0
  let bestCount = 0

  for (let i = 0; i < centers.length; i++) {
    let count = 0
    for (let j = 0; j < centers.length; j++) {
      const dx = centers[i].mx - centers[j].mx
      const dy = centers[i].my - centers[j].my
      if (dx * dx + dy * dy <= radius * radius) count++
    }
    if (count > bestCount) {
      bestCount = count
      bestIdx = i
    }
  }

  const cluster = centers.filter((c) => {
    const dx = c.mx - centers[bestIdx].mx
    const dy = c.my - centers[bestIdx].my
    return dx * dx + dy * dy <= radius * radius
  })

  const cx = cluster.reduce((s, c) => s + c.mx, 0) / cluster.length
  const cy = cluster.reduce((s, c) => s + c.my, 0) / cluster.length
  return { cx, cy, clusterCards: cluster.map((c) => c.card) }
}

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

  const flyAnimRef = useRef(0)

  const handleLocate = useCallback(() => {
    const vp = viewportRef.current
    if (!vp || cards.length === 0) return

    const result = findDensestCenter(cards)
    if (!result) return

    const { clusterCards } = result
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of clusterCards) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + (c.height ?? 200))
    }

    const clusterW = maxX - minX
    const clusterH = maxY - minY
    const vpW = vp.clientWidth
    const vpH = vp.clientHeight
    const padding = 80

    const targetScale = Math.min(
      Math.max(Math.min((vpW - padding * 2) / clusterW, (vpH - padding * 2) / clusterH), MIN_SCALE),
      MAX_SCALE,
    )
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const targetPanX = vpW / 2 - centerX * targetScale
    const targetPanY = vpH / 2 - centerY * targetScale

    const startPanX = pan.current.x
    const startPanY = pan.current.y
    const startScale = scaleVal.current
    const duration = 400
    const startTime = performance.now()

    cancelAnimationFrame(flyAnimRef.current)
    const animate = (now: number) => {
      const elapsed = now - startTime
      const rawT = Math.min(elapsed / duration, 1)
      const t = 1 - (1 - rawT) * (1 - rawT)

      pan.current.x = startPanX + (targetPanX - startPanX) * t
      pan.current.y = startPanY + (targetPanY - startPanY) * t
      scaleVal.current = startScale + (targetScale - startScale) * t
      applyTransform()

      if (rawT < 1) {
        flyAnimRef.current = requestAnimationFrame(animate)
      } else {
        scheduleCull()
      }
    }
    flyAnimRef.current = requestAnimationFrame(animate)
  }, [cards, applyTransform, scheduleCull])

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

        {cards.length > 0 && (
          <button className="canvas-locate-btn" title="定位到卡片密集区域" onClick={handleLocate}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </button>
        )}
      </div>
    </main>
  )
}
