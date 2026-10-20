import type { CSSProperties, PointerEvent } from 'react'
import type { Card, ConnectionSide } from '../types'
import './CardConnectionPorts.css'

export interface CardPort {
  cardId: string
  side: ConnectionSide
}

const sides: { side: ConnectionSide; label: string }[] = [
  { side: 'top', label: '上' },
  { side: 'right', label: '右' },
  { side: 'bottom', label: '下' },
  { side: 'left', label: '左' },
]

interface Props {
  card: Card
  scale: number
  connectedSides?: Set<ConnectionSide>
  source?: CardPort
  target?: CardPort | null
  hovered?: CardPort | null
  hoveredConnected?: boolean
  onStart: (event: PointerEvent<HTMLButtonElement>) => void
  onLostCapture: (pointerId: number) => void
  onCancel: () => void
}

export default function CardConnectionPorts({ card, scale, connectedSides, source, target, hovered, hoveredConnected, onStart, onLostCapture, onCancel }: Props) {
  return (
    <div
      className="card-connection-ports"
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height ?? 200,
        '--port-inverse-scale': 1 / Math.max(0.15, scale),
        cursor: source ? 'grabbing' : hoveredConnected ? 'grab' : 'crosshair',
      } as CSSProperties}
    >
      {sides.map(({ side, label }) => {
        const isSource = source?.cardId === card.id && source.side === side
        const isTarget = target?.cardId === card.id && target.side === side
        const isHovered = hovered?.cardId === card.id && hovered.side === side
        const connected = connectedSides?.has(side)
        return (
          <button
            key={side}
            type="button"
            className={`card-connection-port port-${side}${connected ? ' is-connected' : ''}${isSource ? ' is-source' : ''}${isTarget ? ' is-target' : ''}${isHovered ? ' is-hovered' : ''}`}
            data-port-card-id={card.id}
            data-connection-side={side}
            aria-label={`${card.title || '无标题卡片'}：${label}侧连接点`}
            title={hovered && !isHovered ? undefined : connected ? `拖动修改${label}侧连接点的已有连线` : `从${label}侧连接点拖到另一张卡片的连接点`}
            tabIndex={-1}
            onPointerDown={onStart}
            onLostPointerCapture={(event) => onLostCapture(event.pointerId)}
            onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
            onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation() }}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onCancel() }}
          >
            <span />
          </button>
        )
      })}
    </div>
  )
}
