import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useStore, useActiveCanvasMeta, useActiveCards, useActiveConnections, useActiveLabels, useActiveSections, useHighlightCard, useSettings, useActiveTexts } from '../store'
import NoteCard from './NoteCard'
import CanvasLabelComponent from './CanvasLabel'
import TextBoxComponent from './TextBox'
import SectionBox from './SectionBox'
import ContextMenu from './ContextMenu'
import MoveToModal from './MoveToModal'
import ConfirmModal from './ConfirmModal'
import type { Card, Connection, Section, CanvasLabel, TextBox } from '../types'
import type { MenuItem } from './ContextMenu'
import { scKey } from '../shortcuts'

const MIN_SCALE = 0.15
const MAX_SCALE = 3
const VIEWPORT_PADDING = 800
const CULL_THROTTLE = 50

interface SelectionSet {
  cardIds: Set<string>
  labelIds: Set<string>
  sectionIds: Set<string>
  textIds: Set<string>
}

function emptySelection(): SelectionSet {
  return { cardIds: new Set(), labelIds: new Set(), sectionIds: new Set(), textIds: new Set() }
}

function selectionEmpty(sel: SelectionSet): boolean {
  return sel.cardIds.size === 0 && sel.labelIds.size === 0 && sel.sectionIds.size === 0 && sel.textIds.size === 0
}

function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function rectContains(
  ox: number, oy: number, ow: number, oh: number,
  ix: number, iy: number, iw: number, ih: number,
): boolean {
  return ix >= ox && iy >= oy && ix + iw <= ox + ow && iy + ih <= oy + oh
}

function computeSelection(
  selRect: { x: number; y: number; w: number; h: number },
  cards: Card[],
  labels: CanvasLabel[],
  sections: Section[],
  texts: TextBox[],
): SelectionSet {
  const sel = emptySelection()

  for (const card of cards) {
    const ch = card.height ?? 200
    if (rectsIntersect(selRect.x, selRect.y, selRect.w, selRect.h, card.x, card.y, card.width, ch)) {
      sel.cardIds.add(card.id)
    }
  }

  for (const label of labels) {
    const lh = 40
    if (rectsIntersect(selRect.x, selRect.y, selRect.w, selRect.h, label.x, label.y, label.width, lh)) {
      sel.labelIds.add(label.id)
    }
  }

  for (const t of texts) {
    const th = t.height ?? 24
    if (rectsIntersect(selRect.x, selRect.y, selRect.w, selRect.h, t.x, t.y, t.width, th)) {
      sel.textIds.add(t.id)
    }
  }

  for (const sec of sections) {
    if (rectContains(selRect.x, selRect.y, selRect.w, selRect.h, sec.x, sec.y, sec.width, sec.height)) {
      sel.sectionIds.add(sec.id)
      const memberIds = sec.cardIds ?? []
      for (const cid of memberIds) sel.cardIds.add(cid)
    }
  }

  return sel
}

function pointInSelection(
  coords: { x: number; y: number },
  sel: SelectionSet,
  cards: Card[],
  labels: CanvasLabel[],
  sections: Section[],
  texts: TextBox[],
): boolean {
  for (const id of sel.cardIds) {
    const c = cards.find((x) => x.id === id)
    if (c && coords.x >= c.x && coords.x <= c.x + c.width &&
        coords.y >= c.y && coords.y <= c.y + (c.height ?? 200)) return true
  }
  for (const id of sel.labelIds) {
    const l = labels.find((x) => x.id === id)
    if (l && coords.x >= l.x && coords.x <= l.x + l.width &&
        coords.y >= l.y && coords.y <= l.y + 40) return true
  }
  for (const id of sel.sectionIds) {
    const s = sections.find((x) => x.id === id)
    if (s && coords.x >= s.x && coords.x <= s.x + s.width &&
        coords.y >= s.y && coords.y <= s.y + s.height) return true
  }
  for (const id of sel.textIds) {
    const t = texts.find((x) => x.id === id)
    if (t && coords.x >= t.x && coords.x <= t.x + t.width &&
        coords.y >= t.y && coords.y <= t.y + (t.height ?? 24)) return true
  }
  return false
}

function arrangeableUnitCount(sel: SelectionSet, sections: Section[]): number {
  const memberOfSelected = new Set<string>()
  for (const sid of sel.sectionIds) {
    const s = sections.find((x) => x.id === sid)
    for (const cid of (s?.cardIds ?? [])) memberOfSelected.add(cid)
  }
  let cards = 0
  for (const cid of sel.cardIds) if (!memberOfSelected.has(cid)) cards++
  return sel.textIds.size + sel.labelIds.size + sel.sectionIds.size + cards
}

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
  const addText = useStore((s) => s.addText)
  const arrangeUnits = useStore((s) => s.arrangeUnits)
  const deleteUnits = useStore((s) => s.deleteUnits)
  const nudgeUnits = useStore((s) => s.nudgeUnits)
  const setEditingText = useStore((s) => s.setEditingText)
  const addSection = useStore((s) => s.addSection)
  const compactSection = useStore((s) => s.compactSection)
  const highlightCardId = useHighlightCard()
  const setHighlightCard = useStore((s) => s.setHighlightCard)
  const saveViewport = useStore((s) => s.saveViewport)
  const meta = useActiveCanvasMeta()
  const cards = useActiveCards()
  const connections = useActiveConnections()
  const labels = useActiveLabels()
  const texts = useActiveTexts()
  const sections = useActiveSections()
  const settings = useSettings()
  const arrowColor = settings.theme === 'dark' ? '#888' : '#bbb'

  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)

  const pan = useRef({ x: 0, y: 0 })
  const scaleVal = useRef(1)

  const [cullTick, setCullTick] = useState(0)
  const cullTimer = useRef<ReturnType<typeof setTimeout>>()
  const rafId = useRef(0)

  const [isPanDragging, setIsPanDragging] = useState(false)
  const panDragStart = useRef({ x: 0, y: 0 })
  const panAtDragStart = useRef({ x: 0, y: 0 })
  const rightClickStart = useRef({ x: 0, y: 0, time: 0 })
  const rightDragged = useRef(false)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [moveModalCardId, setMoveModalCardId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] } | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [connectingMouse, setConnectingMouse] = useState<{ x: number; y: number } | null>(null)
  const [hoveredConn, setHoveredConn] = useState<string | null>(null)

  const [selection, setSelection] = useState<SelectionSet>(emptySelection)
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const lassoStart = useRef<{ cx: number; cy: number } | null>(null)
  const isLassoing = useRef(false)
  const [isMultiDragging, setIsMultiDragging] = useState(false)
  const multiDragStart = useRef<{ cx: number; cy: number } | null>(null)

  useEffect(() => {
    if (!highlightCardId) return
    const timer = setTimeout(() => setHighlightCard(null), 2000)
    return () => clearTimeout(timer)
  }, [highlightCardId, setHighlightCard])

  const rerasterTimer = useRef<ReturnType<typeof setTimeout>>()

  const applyTransform = useCallback(() => {
    const el = innerRef.current
    if (el) {
      el.style.willChange = 'transform'
      el.style.transform =
        `translate3d(${pan.current.x}px,${pan.current.y}px,0) scale(${scaleVal.current})`

      clearTimeout(rerasterTimer.current)
      rerasterTimer.current = setTimeout(() => {
        if (!innerRef.current) return
        innerRef.current.style.willChange = 'auto'
      }, 200)
    }
    if (zoomRef.current) {
      zoomRef.current.textContent = `${Math.round(scaleVal.current * 100)}%`
    }
  }, [])

  const scheduleCull = useCallback(() => {
    clearTimeout(cullTimer.current)
    cullTimer.current = setTimeout(() => setCullTick((t) => t + 1), CULL_THROTTLE)
  }, [])

  const prevCanvasId = useRef<string | null>(null)

  useEffect(() => {
    if (prevCanvasId.current && prevCanvasId.current !== meta?.id) {
      saveViewport(prevCanvasId.current, {
        panX: pan.current.x,
        panY: pan.current.y,
        scale: scaleVal.current,
      })
    }

    const canvas = useStore.getState().canvases.find((c) => c.id === meta?.id)
    const vp = canvas?.viewport
    if (vp) {
      pan.current = { x: vp.panX, y: vp.panY }
      scaleVal.current = vp.scale
    } else {
      const canvasCards = canvas?.cards ?? []
      const vpEl = viewportRef.current
      if (canvasCards.length > 0 && vpEl) {
        const result = findDensestCenter(canvasCards)
        if (result) {
          const { clusterCards } = result
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const c of clusterCards) {
            if (c.x < minX) minX = c.x
            if (c.y < minY) minY = c.y
            if (c.x + c.width > maxX) maxX = c.x + c.width
            if (c.y + (c.height ?? 200) > maxY) maxY = c.y + (c.height ?? 200)
          }
          const clusterW = maxX - minX
          const clusterH = maxY - minY
          const centerX = minX + clusterW / 2
          const centerY = minY + clusterH / 2
          const vpW = vpEl.clientWidth
          const vpH = vpEl.clientHeight
          const scaleX = (vpW * 0.85) / Math.max(clusterW, 1)
          const scaleY = (vpH * 0.85) / Math.max(clusterH, 1)
          const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_SCALE), MAX_SCALE, 1.2)
          pan.current = {
            x: vpW / 2 - centerX * targetScale,
            y: vpH / 2 - centerY * targetScale,
          }
          scaleVal.current = targetScale
        } else {
          pan.current = { x: 0, y: 0 }
          scaleVal.current = 1
        }
      } else {
        pan.current = { x: 0, y: 0 }
        scaleVal.current = 1
      }
    }
    prevCanvasId.current = meta?.id ?? null

    applyTransform()
    setCullTick((t) => t + 1)
  }, [meta?.id, applyTransform, saveViewport])

  useEffect(() => {
    return () => {
      const cid = prevCanvasId.current
      if (cid) {
        useStore.getState().saveViewport(cid, {
          panX: pan.current.x,
          panY: pan.current.y,
          scale: scaleVal.current,
        })
      }
    }
  }, [])

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
        pan.current = { x: Math.round(cx - (cx - p.x) * ratio), y: Math.round(cy - (cy - p.y) * ratio) }
        scaleVal.current = ns
      } else {
        const dx = Math.abs(e.deltaX) < 0.5 ? 0 : e.deltaX
        const dy = Math.abs(e.deltaY) < 0.5 ? 0 : e.deltaY
        if (dx === 0 && dy === 0) return
        pan.current = {
          x: Math.round(pan.current.x - dx),
          y: Math.round(pan.current.y - dy),
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

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - pan.current.x) / scaleVal.current,
      y: (clientY - rect.top - pan.current.y) / scaleVal.current,
    }
  }, [])

  const viewportCenterCanvasCoords = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return toCanvasCoords(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [toCanvasCoords])

  const zoomAroundCenter = useCallback((factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.width / 2
    const cy = rect.height / 2
    const s = scaleVal.current
    const ns = Math.min(Math.max(s * factor, MIN_SCALE), MAX_SCALE)
    const ratio = ns / s
    pan.current = { x: Math.round(cx - (cx - pan.current.x) * ratio), y: Math.round(cy - (cy - pan.current.y) * ratio) }
    scaleVal.current = ns
    applyTransform()
    scheduleCull()
  }, [applyTransform, scheduleCull])

  const resetZoomAroundCenter = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.width / 2
    const cy = rect.height / 2
    const s = scaleVal.current
    const ratio = 1 / s
    pan.current = { x: Math.round(cx - (cx - pan.current.x) * ratio), y: Math.round(cy - (cy - pan.current.y) * ratio) }
    scaleVal.current = 1
    applyTransform()
    scheduleCull()
  }, [applyTransform, scheduleCull])

  const lassoRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const startLassoListeners = useCallback(() => {
    const onMove = (e: MouseEvent) => {
      if (!lassoStart.current) return
      const cur = toCanvasCoords(e.clientX, e.clientY)
      const sx = lassoStart.current.cx
      const sy = lassoStart.current.cy
      const dx = Math.abs(cur.x - sx)
      const dy = Math.abs(cur.y - sy)
      if (!isLassoing.current && dx < 4 && dy < 4) return
      isLassoing.current = true
      const rx = Math.min(sx, cur.x)
      const ry = Math.min(sy, cur.y)
      const rw = Math.abs(cur.x - sx)
      const rh = Math.abs(cur.y - sy)
      const rect = { x: rx, y: ry, w: rw, h: rh }
      lassoRectRef.current = rect
      setLassoRect(rect)
    }
    const onUp = () => {
      if (isLassoing.current && lassoRectRef.current) {
        const store = useStore.getState()
        const canvas = store.canvases.find((c) => c.id === store.activeCanvasId)
        const curCards = canvas?.cards ?? []
        const curLabels = canvas?.labels ?? []
        const curSections = canvas?.sections ?? []
        const curTexts = canvas?.texts ?? []
        const sel = computeSelection(lassoRectRef.current, curCards, curLabels, curSections, curTexts)
        setSelection(sel)
      }
      lassoStart.current = null
      isLassoing.current = false
      lassoRectRef.current = null
      setLassoRect(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [toCanvasCoords])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      setIsPanDragging(true)
      panDragStart.current = { x: e.clientX, y: e.clientY }
      panAtDragStart.current = { ...pan.current }
    }
    if (e.button === 2) {
      rightClickStart.current = { x: e.clientX, y: e.clientY, time: Date.now() }
      rightDragged.current = false
      setIsPanDragging(true)
      panDragStart.current = { x: e.clientX, y: e.clientY }
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
      return
    }
    if (e.button === 0) {
      const target = e.target as HTMLElement

      if (!selectionEmpty(selection)) {
        const coords = toCanvasCoords(e.clientX, e.clientY)
        const hitSelected = pointInSelection(coords, selection, cards, labels, sections, texts)

        if (hitSelected) {
          e.preventDefault()
          e.stopPropagation()
          setIsMultiDragging(true)
          multiDragStart.current = { cx: e.clientX, cy: e.clientY }
          return
        }

        setSelection(emptySelection())
      }

      if (target.closest('.note-card') || target.closest('.canvas-label') || target.closest('.canvas-text') || target.closest('.section-header') ||
          target.closest('.section-resize-handle') || target.closest('.card-resize-handle') ||
          target.closest('.conn-delete-btn') || target.closest('.canvas-toolbar')) return

      const canvasCoords = toCanvasCoords(e.clientX, e.clientY)
      lassoStart.current = { cx: canvasCoords.x, cy: canvasCoords.y }
      isLassoing.current = false
      startLassoListeners()
    }
  }, [connectingFrom, addConnection, selection, cards, labels, sections, texts, toCanvasCoords, startLassoListeners])

  useEffect(() => {
    if (!isPanDragging) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - panDragStart.current.x
      const dy = e.clientY - panDragStart.current.y
      if (!rightDragged.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        rightDragged.current = true
      }
      pan.current = {
        x: Math.round(panAtDragStart.current.x + dx),
        y: Math.round(panAtDragStart.current.y + dy),
      }
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(applyTransform)
      scheduleCull()
    }
    const onUp = () => setIsPanDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isPanDragging, applyTransform, scheduleCull])

  useEffect(() => {
    if (!isMultiDragging) return
    const s = scaleVal.current
    const startX = multiDragStart.current!.cx
    const startY = multiDragStart.current!.cy
    let dragRaf = 0

    const SNAP_DIST = 6
    const GAP = 12

    const store0 = useStore.getState()
    const canvas0 = store0.canvases.find((c) => c.id === store0.activeCanvasId)
    const origCards = new Map<string, { x: number; y: number }>()
    const origLabels = new Map<string, { x: number; y: number }>()
    const origSections = new Map<string, { x: number; y: number }>()
    const origTexts = new Map<string, { x: number; y: number }>()
    if (canvas0) {
      for (const c of canvas0.cards) {
        if (selection.cardIds.has(c.id)) origCards.set(c.id, { x: c.x, y: c.y })
      }
      for (const l of canvas0.labels ?? []) {
        if (selection.labelIds.has(l.id)) origLabels.set(l.id, { x: l.x, y: l.y })
      }
      for (const sec of canvas0.sections ?? []) {
        if (selection.sectionIds.has(sec.id)) origSections.set(sec.id, { x: sec.x, y: sec.y })
      }
      for (const t of canvas0.texts ?? []) {
        if (selection.textIds.has(t.id)) origTexts.set(t.id, { x: t.x, y: t.y })
      }
    }

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(dragRaf)
      const totalDx = (e.clientX - startX) / s
      const totalDy = (e.clientY - startY) / s

      dragRaf = requestAnimationFrame(() => {
        const store = useStore.getState()
        const canvas = store.canvases.find((c) => c.id === store.activeCanvasId)
        if (!canvas) return

        const selectedCardData = canvas.cards.filter((c) => selection.cardIds.has(c.id))
        if (selectedCardData.length === 0) {
          const updatedLabels = (canvas.labels ?? []).map((l) => {
            const orig = origLabels.get(l.id)
            return orig ? { ...l, x: orig.x + totalDx, y: orig.y + totalDy } : l
          })
          const updatedSections = (canvas.sections ?? []).map((sec) => {
            const orig = origSections.get(sec.id)
            return orig ? { ...sec, x: orig.x + totalDx, y: orig.y + totalDy } : sec
          })
          const updatedTexts = (canvas.texts ?? []).map((t) => {
            const orig = origTexts.get(t.id)
            return orig ? { ...t, x: orig.x + totalDx, y: orig.y + totalDy } : t
          })
          useStore.setState({
            canvases: store.canvases.map((c) =>
              c.id === store.activeCanvasId
                ? { ...c, labels: updatedLabels, sections: updatedSections, texts: updatedTexts }
                : c,
            ),
          })
          return
        }

        let snapOffX = 0
        let snapOffY = 0
        let bestDistX = SNAP_DIST
        let bestDistY = SNAP_DIST

        for (const other of canvas.cards) {
          if (selection.cardIds.has(other.id)) continue
          const ow = other.width
          const oh = other.height ?? 300

          for (const sc of selectedCardData) {
            const orig = origCards.get(sc.id)
            if (!orig) continue
            const scx = orig.x + totalDx
            const scy = orig.y + totalDy
            const scw = sc.width
            const sch = sc.height ?? 300

            let d: number

            d = Math.abs(scx - (other.x + ow + GAP))
            if (d < bestDistX) { bestDistX = d; snapOffX = other.x + ow + GAP - scx }
            d = Math.abs((scx + scw) - (other.x - GAP))
            if (d < bestDistX) { bestDistX = d; snapOffX = other.x - GAP - scw - scx }
            d = Math.abs(scx - other.x)
            if (d < bestDistX) { bestDistX = d; snapOffX = other.x - scx }
            d = Math.abs((scx + scw) - (other.x + ow))
            if (d < bestDistX) { bestDistX = d; snapOffX = other.x + ow - scw - scx }

            d = Math.abs(scy - other.y)
            if (d < bestDistY) { bestDistY = d; snapOffY = other.y - scy }
            d = Math.abs((scy + sch) - (other.y + oh))
            if (d < bestDistY) { bestDistY = d; snapOffY = other.y + oh - sch - scy }
            d = Math.abs(scy - (other.y + oh + GAP))
            if (d < bestDistY) { bestDistY = d; snapOffY = other.y + oh + GAP - scy }
            d = Math.abs((scy + sch) - (other.y - GAP))
            if (d < bestDistY) { bestDistY = d; snapOffY = other.y - GAP - sch - scy }
          }
        }

        const finalDx = totalDx + snapOffX
        const finalDy = totalDy + snapOffY

        const updatedCards = canvas.cards.map((c) => {
          const orig = origCards.get(c.id)
          return orig ? { ...c, x: orig.x + finalDx, y: orig.y + finalDy } : c
        })
        const updatedLabels = (canvas.labels ?? []).map((l) => {
          const orig = origLabels.get(l.id)
          return orig ? { ...l, x: orig.x + finalDx, y: orig.y + finalDy } : l
        })
        const updatedSections = (canvas.sections ?? []).map((sec) => {
          const orig = origSections.get(sec.id)
          return orig ? { ...sec, x: orig.x + finalDx, y: orig.y + finalDy } : sec
        })
        const updatedTexts = (canvas.texts ?? []).map((t) => {
          const orig = origTexts.get(t.id)
          return orig ? { ...t, x: orig.x + finalDx, y: orig.y + finalDy } : t
        })

        useStore.setState({
          canvases: store.canvases.map((c) =>
            c.id === store.activeCanvasId
              ? { ...c, cards: updatedCards, labels: updatedLabels, sections: updatedSections, texts: updatedTexts }
              : c,
          ),
        })
      })
    }
    const onUp = () => {
      cancelAnimationFrame(dragRaf)
      setIsMultiDragging(false)
      multiDragStart.current = null
      useStore.getState().persist()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isMultiDragging, selection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 编辑输入上下文 / 确认弹窗打开 → 不处理全局快捷键
      const ae = document.activeElement as HTMLElement | null
      const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
      const st = useStore.getState()
      if (typing || st.editingCardId || st.editingTextId || confirmDelete) return

      // 连线 / Esc（保留并优先）
      if (e.key === 'Escape') {
        if (connectingFrom) setConnectingFrom(null)
        if (!selectionEmpty(selection)) setSelection(emptySelection())
        return
      }
      if (e.key === 'Backspace' && connectingFrom) {
        const last = connections[connections.length - 1]
        if (last) deleteConnection(last.id)
        setConnectingFrom(null)
        return
      }

      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const canvas = st.canvases.find((c) => c.id === st.activeCanvasId)
      if (!canvas) return

      const selIds = () => ({
        cardIds: [...selection.cardIds],
        labelIds: [...selection.labelIds],
        sectionIds: [...selection.sectionIds],
        textIds: [...selection.textIds],
      })

      if (mod && !e.shiftKey && k === 'a') {
        e.preventDefault()
        setSelection({
          cardIds: new Set((canvas.cards ?? []).map((c) => c.id)),
          labelIds: new Set((canvas.labels ?? []).map((l) => l.id)),
          sectionIds: new Set((canvas.sections ?? []).map((s) => s.id)),
          textIds: new Set((canvas.texts ?? []).map((t) => t.id)),
        })
        return
      }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomAroundCenter(1.1); return }
      if (mod && k === '-') { e.preventDefault(); zoomAroundCenter(1 / 1.1); return }
      if (mod && k === '0') { e.preventDefault(); resetZoomAroundCenter(); return }
      if (mod) return

      if (k === 'c') { const p = viewportCenterCanvasCoords(); addCard(p.x - 186, p.y - 40); return }
      if (k === 't') { const p = viewportCenterCanvasCoords(); addText(p.x - 150, p.y - 20); return }
      if (k === 'r') { const p = viewportCenterCanvasCoords(); addSection(p.x - 300, p.y - 200); return }
      if (k === 'l') { e.preventDefault(); arrangeUnits(selIds()); return }
      if (k === 'f') {
        if (selection.sectionIds.size === 0) return
        e.preventDefault()
        for (const sid of selection.sectionIds) compactSection(sid)
        return
      }

      if (e.key === 'Enter') {
        const total = selection.cardIds.size + selection.labelIds.size + selection.sectionIds.size + selection.textIds.size
        if (total === 1) {
          const cid = [...selection.cardIds][0]
          const tid = [...selection.textIds][0]
          if (cid) setEditingCard(cid)
          else if (tid) setEditingText(tid)
        }
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !selectionEmpty(selection)) {
        e.preventDefault()
        setConfirmDelete(selIds())
        return
      }

      if (!selectionEmpty(selection) &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        nudgeUnits(selIds(), dx, dy)
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [connectingFrom, connections, deleteConnection, selection, confirmDelete, arrangeUnits, compactSection, addCard, addText, addSection, setEditingCard, setEditingText, nudgeUnits, zoomAroundCenter, resetZoomAroundCenter, viewportCenterCanvasCoords])

  useEffect(() => {
    if (!connectingFrom) {
      setConnectingMouse(null)
      return
    }
    const onMove = (e: MouseEvent) => {
      const coords = toCanvasCoords(e.clientX, e.clientY)
      setConnectingMouse(coords)
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [connectingFrom, toCanvasCoords])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (rightDragged.current) return

    if (connectingFrom) {
      setConnectingFrom(null)
      return
    }

    const selCoords = toCanvasCoords(e.clientX, e.clientY)
    if (arrangeableUnitCount(selection, sections) >= 2 &&
        pointInSelection(selCoords, selection, cards, labels, sections, texts)) {
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: '自动排布',
            shortcut: scKey('arrange'),
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
            onClick: () => arrangeUnits({
              cardIds: [...selection.cardIds],
              labelIds: [...selection.labelIds],
              sectionIds: [...selection.sectionIds],
              textIds: [...selection.textIds],
            }),
          },
        ],
      })
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
            shortcut: scKey('edit'),
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>,
            onClick: () => setEditingCard(cardId),
          },
          {
            label: '删除',
            shortcut: scKey('delete'),
            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
            danger: true,
            onClick: () => deleteCard(cardId),
          },
        ],
      })
    } else {
      const coords = toCanvasCoords(e.clientX, e.clientY)
      const hitSection = sections.find((sec) =>
        coords.x >= sec.x && coords.x <= sec.x + sec.width &&
        coords.y >= sec.y && coords.y <= sec.y + sec.height
      )
      if (hitSection) {
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: '分区最佳大小',
              shortcut: scKey('compactSection'),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>,
              onClick: () => compactSection(hitSection.id),
            },
          ],
        })
      } else {
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: '创建空白卡片',
              shortcut: scKey('card'),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
              onClick: () => addCard(coords.x, coords.y),
            },
            {
              label: '创建标题',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4v16M18 4v16M6 12h12" /></svg>,
              onClick: () => addLabel(coords.x, coords.y),
            },
            {
              label: '创建文本',
              shortcut: scKey('text'),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>,
              onClick: () => addText(coords.x, coords.y),
            },
            {
              label: '创建分区',
              shortcut: scKey('section'),
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" /></svg>,
              onClick: () => addSection(coords.x, coords.y),
            },
          ],
        })
      }
    }
  }, [cards, sections, labels, texts, selection, addCard, addLabel, addText, addSection, deleteCard, setEditingCard, updateCard, toCanvasCoords, connectingFrom, compactSection, arrangeUnits])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.note-card')) return
      if (!selectionEmpty(selection)) {
        setSelection(emptySelection())
        return
      }
      const coords = toCanvasCoords(e.clientX, e.clientY)
      addCard(coords.x, coords.y)
    },
    [addCard, toCanvasCoords, selection],
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
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
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
        className={`canvas-viewport ${isPanDragging ? 'panning' : ''} ${connectingFrom ? 'connecting' : ''}`}
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
            <SectionBox key={sec.id} section={sec} scale={scaleVal.current} selected={selection.sectionIds.has(sec.id)} onSelect={(id) => setSelection({ ...emptySelection(), sectionIds: new Set([id]) })} />
          ))}

          {labels.map((label) => (
            <CanvasLabelComponent key={label.id} label={label} scale={scaleVal.current} selected={selection.labelIds.has(label.id)} />
          ))}

          {texts.map((t) => (
            <TextBoxComponent key={t.id} text={t} scale={scaleVal.current} selected={selection.textIds.has(t.id)} />
          ))}

          <svg className="connections-layer">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={arrowColor} />
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
                selected={selection.cardIds.has(card.id)}
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

          {lassoRect && (
            <div
              className="lasso-rect"
              style={{
                left: lassoRect.x,
                top: lassoRect.y,
                width: lassoRect.w,
                height: lassoRect.h,
              }}
            />
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

      {confirmDelete && (
        <ConfirmModal
          message={`确定删除选中的 ${confirmDelete.cardIds.length + confirmDelete.labelIds.length + confirmDelete.sectionIds.length + confirmDelete.textIds.length} 个元素吗？删除后无法恢复。`}
          confirmText="删除"
          danger
          onConfirm={() => {
            deleteUnits(confirmDelete)
            setSelection(emptySelection())
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </main>
  )
}
