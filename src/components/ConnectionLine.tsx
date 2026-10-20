import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Connection } from '../types'
import type { CardConnectionGeometry } from '../cardConnections'
import { getConnectionAppearance } from '../connectionStyle'
import './ConnectionLine.css'

interface Props {
  connection: Connection & CardConnectionGeometry
  selected: boolean
  highlighted: boolean
  scale: number
  labelLayer: SVGSVGElement | null
  fromTitle: string
  toTitle: string
  onSelect: (event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>) => void
  onHover: (hovered: boolean) => void
  onLabelChange: (label: string) => void
}

export default function ConnectionLine({ connection, selected, highlighted, scale, labelLayer, fromTitle, toTitle, onSelect, onHover, onLabelChange }: Props) {
  const markerId = `connection-arrow-${useId().replace(/:/g, '')}`
  const appearance = getConnectionAppearance(connection)
  const labelBeforeEditing = useRef(appearance.label)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!selected) setIsEditingLabel(false)
  }, [selected])

  useEffect(() => {
    if (selected && isEditingLabel) {
      labelInputRef.current?.focus({ preventScroll: true })
      labelInputRef.current?.select()
    }
  }, [selected, isEditingLabel])
  const inverseScale = 1 / Math.max(0.15, scale)
  const markerSize = 10 + appearance.strokeWidth
  const hasStart = appearance.arrow === 'start' || appearance.arrow === 'both'
  const hasEnd = appearance.arrow === 'end' || appearance.arrow === 'both'
  const label = `连线：${fromTitle || '无标题卡片'} 与 ${toTitle || '无标题卡片'}${appearance.label ? `，${appearance.label}` : ''}`

  return (
    <g
      className={`connection-shape${selected ? ' is-selected' : ''}${highlighted ? ' is-highlighted' : ''}`}
      data-connection-id={connection.id}
      data-from-card-id={connection.fromCardId}
      data-to-card-id={connection.toCardId}
      data-from-side={connection.fromSide}
      data-to-side={connection.toSide}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      tabIndex={0}
      onMouseDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.focus({ preventScroll: true })
        onSelect(event)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) onSelect(event)
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation() }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth={markerSize * inverseScale}
          markerHeight={markerSize * inverseScale}
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M1 1 L11 6 L1 11 Z" className="connection-arrow" />
        </marker>
      </defs>
      {selected && (
        <path d={connection.path} className="connection-selection-halo" strokeWidth={appearance.strokeWidth + 7} vectorEffect="non-scaling-stroke" />
      )}
      <path d={connection.path} className="connection-hit-area" strokeWidth={Math.max(16, appearance.strokeWidth + 10)} vectorEffect="non-scaling-stroke" />
      <path
        d={connection.path}
        className="connection-stroke"
        strokeWidth={appearance.strokeWidth}
        strokeDasharray={appearance.lineStyle === 'dashed' ? '8 5' : undefined}
        markerStart={hasStart ? `url(#${markerId})` : undefined}
        markerEnd={hasEnd ? `url(#${markerId})` : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {(selected || appearance.label) && labelLayer && createPortal(
        <foreignObject
          className={`connection-label-container${selected ? ' is-selected' : ''}`}
          x={connection.midpoint.x - 130 * inverseScale}
          y={connection.midpoint.y - 15 * inverseScale}
          width={260 * inverseScale}
          height={30 * inverseScale}
        >
          <div className="connection-label-position" style={{ transform: `scale(${inverseScale})` }}>
            {selected && isEditingLabel ? (
              <input
                ref={labelInputRef}
                className="connection-label connection-label-input"
                data-connection-label-id={connection.id}
                aria-label="连线文字"
                title={`${fromTitle} 与 ${toTitle} 的连线文字`}
                placeholder="添加文字"
                maxLength={200}
                value={appearance.label}
                style={{ width: Math.min(260, Math.max(104, appearance.label.length * 12 + 24)) }}
                onBlur={() => setIsEditingLabel(false)}
                onChange={(event) => onLabelChange(event.target.value.replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 200))}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    onLabelChange(labelBeforeEditing.current)
                    event.currentTarget.blur()
                  }
                }}
              />
            ) : (
              <>
                {appearance.label && (
                  <span className={`connection-label${selected ? ' has-edit-button' : ''}`} data-connection-label-id={connection.id} title={appearance.label}>{appearance.label}</span>
                )}
                {selected && (
                  <button
                    type="button"
                    className="connection-label-edit"
                    data-connection-label-edit={connection.id}
                    aria-label={appearance.label ? '编辑连线文字' : '添加连线文字'}
                    title={appearance.label ? '编辑文字' : '添加文字'}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      labelBeforeEditing.current = appearance.label
                      setIsEditingLabel(true)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 5V3.5h12V5M10 3.5v13M7 16.5h6" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </foreignObject>,
        labelLayer,
      )}
    </g>
  )
}
