import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../store'
import type { Card, Connection, ConnectionSide } from '../types'
import type { CardPort } from './CardConnectionPorts'
import { resolveCardConnectionSides } from '../cardConnections'
import { getConnectionAppearance } from '../connectionStyle'
import { findCardPortAtPoint } from '../cardPortHitTest'
import type { ConnectionPoint } from '../cardConnections'

interface Reconnection {
  connection: Connection
  endpoint: 'from' | 'to'
  fixed: CardPort
  label: string
}

interface PortConnectionDraft {
  canvasId: string
  source: CardPort
  fixed: CardPort
  reconnect?: Reconnection
  target: CardPort | null
  pointer: ConnectionPoint
}

interface ActiveDrag extends Omit<PortConnectionDraft, 'target' | 'pointer'> {
  pointerId: number
  element: HTMLButtonElement
}

interface ConnectionPicker {
  source: CardPort
  element: HTMLButtonElement
  choices: Reconnection[]
  x: number
  y: number
}

const sideLabels: Record<ConnectionSide, string> = { top: '上', right: '右', bottom: '下', left: '左' }
const portKey = (port: CardPort) => `${port.cardId}/${port.side}`

function targetAtPoint(x: number, y: number, fixed: CardPort): CardPort | null {
  const hit = findCardPortAtPoint(x, y)
  return hit && hit.port.cardId !== fixed.cardId ? hit.port : null
}

function unchangedConnection(a: Connection, b?: Connection) {
  return b && a.fromCardId === b.fromCardId && a.toCardId === b.toCardId && a.fromSide === b.fromSide && a.toSide === b.toSide
}

export function useCardPortConnection(
  canvasId: string | undefined,
  cards: Card[],
  connections: Connection[],
  toCanvasCoords: (x: number, y: number) => ConnectionPoint,
) {
  const [draft, setDraft] = useState<PortConnectionDraft | null>(null)
  const [picker, setPicker] = useState<ConnectionPicker | null>(null)
  const [hovered, setHovered] = useState<CardPort | null>(null)
  const active = useRef<ActiveDrag | null>(null)
  const pickerRef = useRef<ConnectionPicker | null>(null)
  const closePicker = useCallback(() => { pickerRef.current = null; setPicker(null) }, [])

  const { choicesByPort, connectedSides } = useMemo(() => {
    const cardMap = new Map(cards.map((card) => [card.id, card]))
    const choicesByPort = new Map<string, Reconnection[]>()
    const connectedSides = new Map<string, Set<ConnectionSide>>()
    for (const connection of connections) {
      const from = cardMap.get(connection.fromCardId)
      const to = cardMap.get(connection.toCardId)
      if (!from || !to) continue
      const sides = resolveCardConnectionSides(from, to, connection)
      for (const endpoint of ['from', 'to'] as const) {
        const source = { cardId: endpoint === 'from' ? from.id : to.id, side: endpoint === 'from' ? sides.fromSide : sides.toSide }
        const fixed = { cardId: endpoint === 'from' ? to.id : from.id, side: endpoint === 'from' ? sides.toSide : sides.fromSide }
        const other = endpoint === 'from' ? to : from
        const { arrow, label } = getConnectionAppearance(connection)
        const direction = arrow === 'both' ? '双向连接' : arrow === 'none' ? '连接'
          : (endpoint === 'from') === (arrow === 'end') ? '连向' : '来自'
        const choice = { connection, endpoint, fixed, label: `${direction}「${other.title || '无标题卡片'}」${sideLabels[fixed.side]}侧${label ? ` · ${label}` : ''}` }
        const key = portKey(source)
        choicesByPort.set(key, [...(choicesByPort.get(key) ?? []), choice])
        const occupied = connectedSides.get(source.cardId) ?? new Set<ConnectionSide>()
        occupied.add(source.side)
        connectedSides.set(source.cardId, occupied)
      }
    }
    return { choicesByPort, connectedSides }
  }, [cards, connections])

  const cancel = useCallback(() => {
    const drag = active.current
    active.current = null
    if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    setDraft(null)
    setHovered(null)
    closePicker()
  }, [closePicker])

  const begin = useCallback((event: ReactPointerEvent<HTMLButtonElement>, source: CardPort, element: HTMLButtonElement, reconnect?: Reconnection) => {
    if (event.button !== 0 || !event.isPrimary || !canvasId || !element.isConnected) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
    const fixed = reconnect?.fixed ?? source
    active.current = { canvasId, source, fixed, reconnect, pointerId: event.pointerId, element }
    // The port stays mounted when a connection is picked; the menu item does not.
    element.setPointerCapture(event.pointerId)
    setDraft({ canvasId, source, fixed, reconnect, target: null, pointer: toCanvasCoords(event.clientX, event.clientY) })
  }, [canvasId, cancel, toCanvasCoords])

  const start = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || !canvasId) return
    const hit = findCardPortAtPoint(event.clientX, event.clientY)
    if (!hit) return
    const { port: source, element } = hit
    const choices = choicesByPort.get(portKey(source)) ?? []
    if (choices.length <= 1) { begin(event, source, element, choices[0]); return }
    event.preventDefault()
    event.stopPropagation()
    cancel()
    const next = { source, element, choices, x: Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 272)), y: Math.max(8, Math.min(event.clientY + 12, window.innerHeight - 290)) }
    pickerRef.current = next
    setPicker(next)
  }, [canvasId, choicesByPort, begin, cancel])

  const pick = useCallback((event: ReactPointerEvent<HTMLButtonElement>, choice: Reconnection) => {
    const menu = pickerRef.current
    if (menu) begin(event, menu.source, menu.element, choice)
  }, [begin])

  const lostCapture = useCallback((pointerId: number) => {
    if (active.current?.pointerId === pointerId) cancel()
  }, [cancel])

  useEffect(() => { cancel() }, [canvasId, cancel])
  useEffect(() => {
    setHovered(null)
    const drag = active.current
    if (drag && (!cards.some((card) => card.id === drag.source.cardId) || !cards.some((card) => card.id === drag.fixed.cardId) ||
      (drag.reconnect && !unchangedConnection(drag.reconnect.connection, connections.find((conn) => conn.id === drag.reconnect?.connection.id))))) cancel()
    if (pickerRef.current) closePicker()
  }, [cards, connections, cancel, closePicker])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = active.current
      if (!drag) {
        // Avoid hit-testing the whole canvas unless the pointer is over a port.
        const port = (event.target as Element).closest('.card-connection-port')
          ? findCardPortAtPoint(event.clientX, event.clientY)?.port ?? null : null
        setHovered((current) => current?.cardId === port?.cardId && current?.side === port?.side ? current : port)
        return
      }
      if (event.pointerId !== drag.pointerId) return
      if (event.buttons === 0) { cancel(); return }
      event.preventDefault()
      setDraft({ ...drag, target: targetAtPoint(event.clientX, event.clientY, drag.fixed), pointer: toCanvasCoords(event.clientX, event.clientY) })
    }
    const onUp = (event: PointerEvent) => {
      const drag = active.current
      if (!drag || event.pointerId !== drag.pointerId || event.button !== 0) return
      const hit = findCardPortAtPoint(event.clientX, event.clientY)
      const target = hit && hit.port.cardId !== drag.fixed.cardId ? hit.port : null
      const store = useStore.getState()
      if (target && store.activeCanvasId === drag.canvasId) {
        if (drag.reconnect) {
          const current = store.canvases.find((canvas) => canvas.id === drag.canvasId)?.connections?.find((conn) => conn.id === drag.reconnect?.connection.id)
          if (unchangedConnection(drag.reconnect.connection, current) && portKey(target) !== portKey(drag.source)) {
            store.reconnectConnection(drag.reconnect.connection.id, drag.reconnect.endpoint, target.cardId, target.side, drag.fixed.side)
          }
        } else {
          store.addConnection(drag.source.cardId, target.cardId, { fromSide: drag.source.side, toSide: target.side })
        }
      }
      cancel()
      setHovered(hit?.port ?? null)
    }
    const onCancel = (event: PointerEvent) => { if (event.pointerId === active.current?.pointerId) cancel() }
    const onKey = (event: KeyboardEvent) => {
      if (!active.current) setHovered(null)
      if ((!active.current && !pickerRef.current) || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.port-connection-picker')) closePicker()
    }
    const onOut = (event: PointerEvent) => {
      if (active.current) return
      const port = (event.relatedTarget as Element | null)?.closest?.('.card-connection-port')
        ? findCardPortAtPoint(event.clientX, event.clientY)?.port ?? null : null
      setHovered((current) => current?.cardId === port?.cardId && current?.side === port?.side ? current : port)
    }
    const onWheel = (event: WheelEvent) => {
      setHovered(null)
      if (!(event.target as Element).closest('.port-connection-picker')) closePicker()
      if (!active.current) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('blur', cancel)
    window.addEventListener('fa-before-search', cancel)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('fa-before-search', cancel)
      const drag = active.current
      active.current = null
      if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    }
  }, [cancel, closePicker, toCanvasCoords])

  return { draft, active, start, cancel, lostCapture, connectedSides, picker, pick, hovered }
}
