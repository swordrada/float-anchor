import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Connection, ConnectionAppearancePatch } from '../types'
import { getConnectionAppearance } from '../connectionStyle'
import './ConnectionSelectionToolbar.css'

interface Props {
  connections: Connection[]
  onChange: (patch: ConnectionAppearancePatch) => void
  onDelete: () => void
  onClear: () => void
}

function sharedValue<T>(values: T[]): T | undefined {
  return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined
}

function stopCanvasEvent(event: MouseEvent) {
  event.stopPropagation()
}

type StyleField = 'lineStyle' | 'arrow' | 'strokeWidth'
type StyleValue = string | number

interface StyleOption {
  value: StyleValue
  label: string
}

function StylePreview({ field, value }: { field: StyleField; value?: StyleValue }) {
  const mixed = value === undefined
  const arrow = field === 'arrow' ? value : 'none'
  return (
    <svg className="connection-style-preview" width="28" height="16" viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {mixed ? <path d="M4 5h20M4 11h7m5 0h8" strokeWidth="1.5" /> : <>
        <path d="M3 8h22" strokeWidth={field === 'strokeWidth' ? Number(value) : 1.5} strokeDasharray={field === 'lineStyle' && value === 'dashed' ? '4 4' : undefined} />
        {(arrow === 'start' || arrow === 'both') && <path d="m8 3-5 5 5 5" strokeWidth="1.5" />}
        {(arrow === 'end' || arrow === 'both') && <path d="m20 3 5 5-5 5" strokeWidth="1.5" />}
      </>}
    </svg>
  )
}

function StyleMenu({ field, label, value, options, open, onOpen, onClose, onChange }: {
  field: StyleField
  label: string
  value?: StyleValue
  options: StyleOption[]
  open: boolean
  onOpen: () => void
  onClose: () => void
  onChange: (value: StyleValue) => void
}) {
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const pendingFocus = useRef<number | null>(null)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const currentLabel = options[selectedIndex]?.label ?? (value === undefined ? '混合' : `${value} px`)

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = undefined
  }

  useEffect(() => () => cancelClose(), [])
  useEffect(() => {
    if (open && pendingFocus.current !== null) {
      optionRefs.current[pendingFocus.current]?.focus({ preventScroll: true })
      pendingFocus.current = null
    }
  }, [open])

  function openAndFocus(index: number) {
    cancelClose()
    if (open) optionRefs.current[index]?.focus({ preventScroll: true })
    else {
      pendingFocus.current = index
      onOpen()
    }
  }

  function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    const lastIndex = options.length - 1
    let targetIndex: number | undefined
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') targetIndex = Math.max(0, selectedIndex)
    if (event.key === 'ArrowUp') targetIndex = selectedIndex >= 0 ? selectedIndex : lastIndex
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = lastIndex
    if (targetIndex !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      openAndFocus(targetIndex)
    }
  }

  return (
    <div
      className={`connection-style-menu${open ? ' is-open' : ''}`}
      onMouseEnter={() => {
        cancelClose()
        onOpen()
      }}
      onMouseLeave={() => {
        cancelClose()
        closeTimer.current = setTimeout(onClose, 120)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
      onKeyDown={(event) => {
        if (!open || event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          triggerRef.current?.focus({ preventScroll: true })
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="connection-style-trigger"
        aria-label={`连线${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onKeyDown={handleTriggerKey}
        onClick={() => openAndFocus(Math.max(0, selectedIndex))}
      >
        <span className="connection-style-field-label">{label}</span>
        <StylePreview field={field} value={value} />
        <span className="connection-style-value">{currentLabel}</span>
        <svg className="connection-style-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
      </button>
      {open && <div className="connection-style-menu-anchor">
        <div id={menuId} className="connection-style-options" role="menu" aria-label={`连线${label}`}>
          {options.map((option, index) => <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element }}
            type="button"
            className="connection-style-option"
            role="menuitemradio"
            aria-checked={option.value === value}
            tabIndex={-1}
            onKeyDown={(event) => {
              let targetIndex: number | undefined
              if (event.key === 'ArrowDown') targetIndex = (index + 1) % options.length
              if (event.key === 'ArrowUp') targetIndex = (index - 1 + options.length) % options.length
              if (event.key === 'Home') targetIndex = 0
              if (event.key === 'End') targetIndex = options.length - 1
              if (targetIndex !== undefined) {
                event.preventDefault()
                event.stopPropagation()
                optionRefs.current[targetIndex]?.focus({ preventScroll: true })
              } else if (event.key === 'Tab') {
                // Resume the toolbar's natural tab order after closing the menu.
                triggerRef.current?.focus({ preventScroll: true })
                onClose()
              }
            }}
            onClick={() => {
              onChange(option.value)
              onClose()
              triggerRef.current?.focus({ preventScroll: true })
            }}
          >
            <StylePreview field={field} value={option.value} />
            <span>{option.label}</span>
            {option.value === value && <svg className="connection-style-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8 3 3 6-6" /></svg>}
          </button>)}
        </div>
      </div>}
    </div>
  )
}

export default function ConnectionSelectionToolbar({ connections, onChange, onDelete, onClear }: Props) {
  const [openMenu, setOpenMenu] = useState<StyleField | null>(null)
  useEffect(() => {
    if (!openMenu) return
    const handleOutsideFocusKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.isComposing || target?.closest('.connection-selection-toolbar')) return
      const editingText = target?.closest('input, textarea, select, [contenteditable]')
      if (event.key === 'Escape' || (!editingText && (event.key === 'Delete' || event.key === 'Backspace'))) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') setOpenMenu(null)
      }
    }
    // Hover opens a menu without moving focus away from the selected connection.
    document.addEventListener('keydown', handleOutsideFocusKey, true)
    return () => document.removeEventListener('keydown', handleOutsideFocusKey, true)
  }, [openMenu])
  const appearances = connections.map(getConnectionAppearance)
  const lineStyle = sharedValue(appearances.map((appearance) => appearance.lineStyle))
  const arrow = sharedValue(appearances.map((appearance) => appearance.arrow))
  const strokeWidth = sharedValue(appearances.map((appearance) => appearance.strokeWidth))
  if (connections.length === 0) return null

  return (
    <div
      className="connection-selection-toolbar"
      role="toolbar"
      aria-label="连线操作"
      onMouseDown={stopCanvasEvent}
      onClick={stopCanvasEvent}
      onDoubleClick={stopCanvasEvent}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (openMenu && ['Delete', 'Backspace', 'Escape'].includes(event.key) && !event.nativeEvent.isComposing) {
          event.preventDefault()
          if (event.key === 'Escape') setOpenMenu(null)
          return
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !event.nativeEvent.isComposing &&
            !(event.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) {
          event.preventDefault()
          onDelete()
          return
        }
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          onClear()
        }
      }}
    >
      <div className="connection-toolbar-main">
        <span className="connection-toolbar-count" aria-live="polite">已选 <strong>{connections.length}</strong> 条</span>
        <div className="connection-toolbar-controls">
          <StyleMenu field="lineStyle" label="线型" value={lineStyle}
            options={[{ value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }]}
            open={openMenu === 'lineStyle'} onOpen={() => setOpenMenu('lineStyle')}
            onClose={() => setOpenMenu((current) => current === 'lineStyle' ? null : current)}
            onChange={(value) => onChange({ lineStyle: value as 'solid' | 'dashed' })} />
          <StyleMenu field="arrow" label="箭头" value={arrow}
            options={[{ value: 'none', label: '无箭头' }, { value: 'end', label: '正向' }, { value: 'start', label: '反向' }, { value: 'both', label: '双向' }]}
            open={openMenu === 'arrow'} onOpen={() => setOpenMenu('arrow')}
            onClose={() => setOpenMenu((current) => current === 'arrow' ? null : current)}
            onChange={(value) => onChange({ arrow: value as 'none' | 'end' | 'start' | 'both' })} />
          <StyleMenu field="strokeWidth" label="粗细" value={strokeWidth}
            options={[1, 2, 3, 4, 5, 6].map((width) => ({ value: width, label: `${width} px` }))}
            open={openMenu === 'strokeWidth'} onOpen={() => setOpenMenu('strokeWidth')}
            onClose={() => setOpenMenu((current) => current === 'strokeWidth' ? null : current)}
            onChange={(value) => onChange({ strokeWidth: Number(value) })} />
        </div>
        <div className="connection-toolbar-actions">
          <button type="button" className="connection-toolbar-button is-danger" aria-label="删除选中连线" title="删除选中的连线" onClick={onDelete}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
            </svg>
            <span>删除</span>
          </button>
          <button type="button" className="connection-toolbar-button" aria-label="取消连线选择" title="取消选择（Esc）" onClick={onClear}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            <span>取消选择</span>
          </button>
        </div>
      </div>
    </div>
  )
}
