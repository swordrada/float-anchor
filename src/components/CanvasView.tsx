import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useStore, useActiveCanvasMeta, useActiveCards, useActiveConnections, useActiveLabels, useActiveSections, useHighlightCard } from '../store'
import NoteCard from './NoteCard'
import CanvasLabelComponent from './CanvasLabel'
import SectionBox from './SectionBox'
import ContextMenu from './ContextMenu'
import MoveToModal from './MoveToModal'
import type { Card, Connection } from '../types'
import type { MenuItem } from './ContextMenu'

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

function getConnectionPath(from: Card, to: Card): string {
  const fx = from.x + from.width
  const fy = from.y + (from.height ?? 200) / 2
  const tx = to.x
  const ty = to.y + (to.height ?? 200) / 2
  const cpx = Math.abs(tx - fx) * 0.4
  return `M ${fx} ${fy} C ${fx + cpx} ${fy}, ${tx - cpx} ${ty}, ${tx} ${ty}`
}

export default function CanvasView() {
  const addCard = useStore((s) => s.addCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const updateCard = useStore((s) => s.updateCard)
  const setEditingCard = useStore((s) => s.setEditingCard)
  const addConnection = useStore((s) => s.addConnection)
  const deleteConnection = useStore((s) => s.deleteConnection)
  const addLabel = useStore((s) => s.addLabel)
  const addSection = useStore((s) => s.addSection)
  const highlightCardId = useHighlightCard()
  const setHighlightCard = useStore((s) => s.setHighlightCard)
  const meta = useActiveCanvasMeta()
  const cards = useActiveCards()
  const connections = useActiveConnections()
  const labels = useActiveLabels()
  const sections = useActiveSections()

  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)

  const pan = useRef({ x: 0, y: 0 })
  const scaleVal = useRef(1)

  const [cullTick, setCullTick] = useState(0)
  const cullTimer = useRef<ReturnType<typeof setTimeout>>()
  const rafId = useRef(0)

  const [isMiddleDragging, setIsMiddleDragging] = useState(false)
  const middleDragStart = useRef({ x: 0, y: 0 })
  const panAtDragStart = useRef({ x: 0, y: 0 })

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [moveModalCardId, setMoveModalCardId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [connectingMouse, setConnectingMouse] = useState<{ x: number; y: number } | null>(null)
  const [hoveredConn, setHoveredConn] = useState<string | null>(null)

  useEffect(() => {
    if (!highlightCardId) return
    const timer = setTimeout(() => setHighlightCard(null), 2000)
    return () => clearTimeout(timer)
  }, [highlightCardId, setHighlightCard])

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
    if (e.button === 1) {
      e.preventDefault()
      setIsMiddleDragging(true)
      middleDragStart.current = { x: e.clientX, y: e.clientY }
      panAtDragStart.current = { ...pan.current }
    }
    if (connectingFrom && e.button === 0) {
      const target = (e.target as HTMLElement).closest('.note-card')
      if (target) {
        const targetId = target.getAttribute('data-card-id')
        if (targetId && targetId !== connectingFrom) {
          addConnection(connectingFrom, targetId)
        }
      }
      setConnectingFrom(null)
    }
  }, [connectingFrom, addConnection])

  useEffect(() => {
    if (!isMiddleDragging) return
    const onMove = (e: MouseEvent) => {
      pan.current = {
        x: panAtDragStart.current.x + (e.clientX - middleDragStart.current.x),
        y: panAtDragStart.current.y + (e.clientY - middleDragStart.current.y),
      }
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(applyTransform)
      scheduleCull()
    }
    const onUp = () => setIsMiddleDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isMiddleDragging, applyTransform, scheduleCull])

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - pan.current.x) / scaleVal.current,
      y: (clientY - rect.top - pan.current.y) / scaleVal.current,
    }
  }, [])

  useEffect(() => {
    if (!connectingFrom) {
      setConnectingMouse(null)
      return
    }
    const onMove = (e: MouseEvent) => {
      const coords = toCanvasCoords(e.clientX, e.clientY)
      setConnectingMouse(coords)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConnectingFrom(null)
      if (e.key === 'Backspace') {
        const last = connections[connections.length - 1]
        if (last) deleteConnection(last.id)
        setConnectingFrom(null)
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('keydown', onKey)
    }
  }, [connectingFrom, connections, deleteConnection, toCanvasCoords])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (connectingFrom) {
      setConnectingFrom(null)
      return
    }

    const noteCard = (e.target as HTMLElement).closest('.note-card')

    if (noteCard) {
      const cardId = noteCard.getAttribute('data-card-id')
      if (!cardId) return
      const card = cards.find((c) => c.id === cardId)

      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: '最佳大小',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>,
            onClick: () => {
              if (!cardId) return
              const el = noteCard as HTMLElement

              const prevHeight = el.style.height
              const prevContain = el.style.contain
              el.style.height = 'auto'
              el.style.contain = 'none'

              void el.offsetHeight

              const naturalHeight = el.scrollHeight
              el.style.height = prevHeight
              el.style.contain = prevContain

              const bestHeight = Math.max(80, Math.round(naturalHeight))
              updateCard(cardId, { height: bestHeight })
            },
          },
          {
            label: '拷贝卡片链接',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>,
            onClick: () => {
              if (!card) return
              const title = card.title || '无标题卡片'
              const html = `<a href="fa://${cardId}">${title}</a>`
              const text = `[${title}](fa://${cardId})`
              const blob = new Blob([html], { type: 'text/html' })
              const textBlob = new Blob([text], { type: 'text/plain' })
              navigator.clipboard.write([
                new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
              ])
            },
          },
          {
            label: '移动到...',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>,
            onClick: () => setMoveModalCardId(cardId),
          },
          {
            label: '连接',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 012 2v7" /><path d="M6 9v3a2 2 0 002 2h7" /></svg>,
            onClick: () => setConnectingFrom(cardId),
          },
          {
            label: '编辑',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>,
            onClick: () => setEditingCard(cardId),
          },
          {
            label: '删除',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
            danger: true,
            onClick: () => deleteCard(cardId),
          },
        ],
      })
    } else {
      const coords = toCanvasCoords(e.clientX, e.clientY)
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: '创建空白卡片',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
            onClick: () => addCard(coords.x, coords.y),
          },
          {
            label: '创建标题',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4v16M18 4v16M6 12h12" /></svg>,
            onClick: () => addLabel(coords.x, coords.y),
          },
          {
            label: '创建分区',
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" /></svg>,
            onClick: () => addSection(coords.x, coords.y),
          },
        ],
      })
    }
  }, [cards, addCard, addLabel, addSection, deleteCard, setEditingCard, updateCard, toCanvasCoords, connectingFrom])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.note-card')) return
      const coords = toCanvasCoords(e.clientX, e.clientY)
      addCard(coords.x, coords.y)
    },
    [addCard, toCanvasCoords],
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

  const flyTo = useCallback((targetPanX: number, targetPanY: number, targetScale: number) => {
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
  }, [applyTransform, scheduleCull])

  useEffect(() => {
    const handler = (e: Event) => {
      const { cardId } = (e as CustomEvent).detail
      const card = cards.find((c) => c.id === cardId)
      const vp = viewportRef.current
      if (!card || !vp) return
      const targetScale = 1
      const cx = card.x + card.width / 2
      const cy = card.y + (card.height ?? 200) / 2
      flyTo(vp.clientWidth / 2 - cx * targetScale, vp.clientHeight / 2 - cy * targetScale, targetScale)
    }
    window.addEventListener('fa-fly-to-card', handler)
    return () => window.removeEventListener('fa-fly-to-card', handler)
  }, [cards, flyTo])

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
    flyTo(vpW / 2 - centerX * targetScale, vpH / 2 - centerY * targetScale, targetScale)
  }, [cards, flyTo])

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

  const connectionPaths = useMemo(() => {
    const cardMap = new Map(cards.map((c) => [c.id, c]))
    return connections
      .map((conn) => {
        const from = cardMap.get(conn.fromCardId)
        const to = cardMap.get(conn.toCardId)
        if (!from || !to) return null
        return { ...conn, path: getConnectionPath(from, to), from, to }
      })
      .filter(Boolean) as (Connection & { path: string; from: Card; to: Card })[]
  }, [cards, connections])

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
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`canvas-viewport ${isMiddleDragging ? 'panning' : ''} ${connectingFrom ? 'connecting' : ''}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <div
          ref={innerRef}
          className="canvas-inner"
          style={{ transform: 'translate3d(0,0,0) scale(1)', transformOrigin: '0 0' }}
        >
          {sections.map((sec) => (
            <SectionBox key={sec.id} section={sec} scale={scaleVal.current} />
          ))}

          {labels.map((label) => (
            <CanvasLabelComponent key={label.id} label={label} scale={scaleVal.current} />
          ))}

          <svg className="connections-layer">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#bbb" />
              </marker>
              <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
              </marker>
            </defs>
            {connectingFrom && connectingMouse && (() => {
              const fromCard = cards.find((c) => c.id === connectingFrom)
              if (!fromCard) return null
              const fx = fromCard.x + fromCard.width
              const fy = fromCard.y + (fromCard.height ?? 200) / 2
              const tx = connectingMouse.x
              const ty = connectingMouse.y
              const cpx = Math.abs(tx - fx) * 0.4
              const path = `M ${fx} ${fy} C ${fx + cpx} ${fy}, ${tx - cpx} ${ty}, ${tx} ${ty}`
              return (
                <path
                  d={path}
                  className="conn-line conn-preview"
                  markerEnd="url(#arrowhead-active)"
                />
              )
            })()}
            {connectionPaths.map((conn) => (
              <g key={conn.id}
                onMouseEnter={() => setHoveredConn(conn.id)}
                onMouseLeave={() => setHoveredConn(null)}
              >
                <path d={conn.path} className="conn-hit-area" />
                <path
                  d={conn.path}
                  className={`conn-line ${hoveredConn === conn.id ? 'active' : ''}`}
                  markerEnd={hoveredConn === conn.id ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                />
                {hoveredConn === conn.id && (
                  <foreignObject
                    x={(conn.from.x + conn.from.width + conn.to.x) / 2 - 10}
                    y={(conn.from.y + (conn.from.height ?? 200) / 2 + conn.to.y + (conn.to.height ?? 200) / 2) / 2 - 10}
                    width="20" height="20"
                  >
                    <button className="conn-delete-btn" onClick={() => deleteConnection(conn.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </foreignObject>
                )}
              </g>
            ))}
          </svg>

          {cards.map((card) =>
            visibleCardIds.has(card.id) ? (
              <NoteCard
                key={card.id}
                cardId={card.id}
                scale={scaleVal.current}
                highlight={highlightCardId === card.id}
              />
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
            <p>双击空白区域创建卡片，或右键呼出菜单</p>
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

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {moveModalCardId && (
        <MoveToModal
          cardId={moveModalCardId}
          onClose={() => setMoveModalCardId(null)}
        />
      )}
    </main>
  )
}
