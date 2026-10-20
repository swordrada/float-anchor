import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { Section, SectionAppearancePatch } from '../types'
import { getSectionAppearance } from '../sectionStyle'
import './SectionSelectionToolbar.css'

interface Props {
  sections: Section[]
  onChange: (patch: SectionAppearancePatch) => void
  onClear: () => void
}

type AppearanceField = 'color' | 'borderColor' | 'borderStyle'
const COLORS = [
  { value: '#60a5fa', label: '蓝色' },
  { value: '#34d399', label: '绿色' },
  { value: '#a78bfa', label: '紫色' },
  { value: '#facc15', label: '黄色' },
  { value: '#fb923c', label: '橙色' },
  { value: '#f87171', label: '红色' },
  { value: '#f472b6', label: '粉色' },
  { value: '#9ca3af', label: '灰色' },
]

function sharedValue<T>(values: T[]): T | undefined {
  return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined
}

function normalizeHex(value: string): string | undefined {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex.slice(1).split('').map((part) => part + part).join('')}`.toLowerCase()
  return undefined
}

function stopCanvasEvent(event: MouseEvent) {
  event.stopPropagation()
}

function CheckMark() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8 3 3 6-6" /></svg>
}

function BorderPreview({ value }: { value?: string }) {
  return <svg className="section-border-preview" width="26" height="16" viewBox="0 0 26 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    {value === undefined ? <path d="M3 5h20M3 11h8m5 0h7" /> : <path d="M3 8h20" strokeDasharray={value === 'dashed' ? '4 4' : undefined} />}
  </svg>
}

function AppearanceMenu({ field, label, value, open, onOpen, onClose, onChange }: {
  field: AppearanceField
  label: string
  value?: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  onChange: (value: string) => void
}) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const pendingFocus = useRef<number | null>(null)
  const [draft, setDraft] = useState(value ?? '')
  const isColor = field !== 'borderStyle'
  const options = isColor ? COLORS : [{ value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }]
  const selectedIndex = options.findIndex((option) => option.value === value)
  const validColor = normalizeHex(draft)
  const currentLabel = value === undefined ? '混合' : options[selectedIndex]?.label ?? '自定义'

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = undefined
  }

  useEffect(() => () => cancelClose(), [])
  useEffect(() => { setDraft(value ?? '') }, [value, open])
  useEffect(() => {
    if (open && pendingFocus.current !== null) {
      optionRefs.current[pendingFocus.current]?.focus({ preventScroll: true })
      pendingFocus.current = null
    }
  }, [open])

  function closeAndFocus() {
    cancelClose()
    onClose()
    triggerRef.current?.focus({ preventScroll: true })
  }

  function applyValue(nextValue: string) {
    onChange(nextValue)
    closeAndFocus()
  }

  function openAndFocus(index: number) {
    cancelClose()
    if (open) optionRefs.current[index]?.focus({ preventScroll: true })
    else {
      pendingFocus.current = index
      onOpen()
    }
  }

  function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing) return
    let index: number | undefined
    if (['ArrowDown', 'Enter', ' '].includes(event.key)) index = Math.max(0, selectedIndex)
    if (event.key === 'ArrowUp') index = selectedIndex >= 0 ? selectedIndex : options.length - 1
    if (event.key === 'Home') index = 0
    if (event.key === 'End') index = options.length - 1
    if (index !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      openAndFocus(index)
    }
  }

  function handleOptionKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined
    const step = isColor ? 4 : 1
    if (event.key === 'ArrowDown') nextIndex = (index + step) % options.length
    if (event.key === 'ArrowUp') nextIndex = (index - step + options.length) % options.length
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % options.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      optionRefs.current[nextIndex]?.focus({ preventScroll: true })
    } else if (event.key === 'Tab') {
      if (isColor && !event.shiftKey) {
        event.preventDefault()
        inputRef.current?.focus({ preventScroll: true })
      } else {
        triggerRef.current?.focus({ preventScroll: true })
        onClose()
      }
    }
  }

  let preview: ReactNode = <BorderPreview value={value} />
  if (isColor) preview = <span className={`section-color-swatch${value === undefined ? ' is-mixed' : ''}`} style={value === undefined ? undefined : { backgroundColor: value }} aria-hidden="true" />

  return <div
    ref={rootRef}
    className={`section-appearance-menu${open ? ' is-open' : ''}`}
    onMouseEnter={() => {
      cancelClose()
      onOpen()
    }}
    onMouseLeave={() => {
      cancelClose()
      closeTimer.current = setTimeout(() => {
        // Keep a custom color draft available while its input still has focus.
        if (rootRef.current?.contains(document.activeElement) && document.activeElement?.matches('input')) return
        onClose()
      }, 120)
    }}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
    }}
    onKeyDown={(event) => {
      if (!open || event.nativeEvent.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeAndFocus()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
      }
    }}
  >
    <button ref={triggerRef} type="button" className="section-appearance-trigger" aria-label={`分区${label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onKeyDown={handleTriggerKey} onClick={() => openAndFocus(Math.max(0, selectedIndex))}>
      <span className="section-appearance-field-label">{field === 'color' ? '背景' : field === 'borderColor' ? '边框颜色' : '边框'}</span>
      {preview}
      <span className="section-appearance-value">{currentLabel}</span>
      <svg className="section-appearance-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </button>
    {open && <div className={`section-appearance-menu-anchor${isColor ? ' is-color' : ''}`}>
      <div id={menuId} className="section-appearance-options" role="menu" aria-label={`分区${label}`}>
        <div className={isColor ? 'section-color-grid' : 'section-border-options'}>
          {options.map((option, index) => <button key={option.value} ref={(element) => { optionRefs.current[index] = element }} type="button"
            className={isColor ? 'section-color-option' : 'section-border-option'} role="menuitemradio" aria-label={option.label} aria-checked={option.value === value}
            title={isColor ? `${option.label} ${option.value.toUpperCase()}` : option.label} tabIndex={-1}
            onKeyDown={(event) => handleOptionKey(event, index)} onClick={() => applyValue(option.value)}>
            {isColor ? <span className="section-color-option-chip" style={{ backgroundColor: option.value }} aria-hidden="true">{option.value === value && <CheckMark />}</span> : <>
              <BorderPreview value={option.value} /><span>{option.label}</span>{option.value === value && <CheckMark />}
            </>}
          </button>)}
        </div>
        {isColor && <div className="section-custom-color">
          <input ref={inputRef} type="text" className="section-color-input" value={draft} spellCheck={false} maxLength={7}
            aria-label={`自定义分区${label}`} aria-invalid={draft.trim() !== '' && !validColor} placeholder="#RRGGBB"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') {
                event.preventDefault()
                if (validColor) applyValue(validColor)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(value ?? '')
                closeAndFocus()
              }
            }} />
          <button type="button" className="section-color-apply" aria-label={`应用分区${label}`} disabled={!validColor} onClick={() => { if (validColor) applyValue(validColor) }}>应用</button>
        </div>}
      </div>
    </div>}
  </div>
}

export default function SectionSelectionToolbar({ sections, onChange, onClear }: Props) {
  const [openMenu, setOpenMenu] = useState<AppearanceField | null>(null)
  const selectionKey = sections.map((section) => section.id).sort().join('|')
  useEffect(() => { setOpenMenu(null) }, [selectionKey])
  useEffect(() => {
    if (!openMenu) return
    const handleOutsideFocusKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.isComposing || target?.closest('.section-selection-toolbar')) return
      const editingText = target?.closest('input, textarea, select, [contenteditable]')
      if (event.key === 'Escape' || (!editingText && (event.key === 'Delete' || event.key === 'Backspace'))) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') setOpenMenu(null)
      }
    }
    document.addEventListener('keydown', handleOutsideFocusKey, true)
    return () => document.removeEventListener('keydown', handleOutsideFocusKey, true)
  }, [openMenu])
  const appearances = sections.map(getSectionAppearance)
  const color = sharedValue(appearances.map((appearance) => appearance.color))
  const borderColor = sharedValue(appearances.map((appearance) => appearance.borderColor))
  const borderStyle = sharedValue(appearances.map((appearance) => appearance.borderStyle))
  if (sections.length === 0) return null

  return <div className="section-selection-toolbar" role="toolbar" aria-label="分区操作"
    onMouseDown={stopCanvasEvent} onClick={stopCanvasEvent} onDoubleClick={stopCanvasEvent}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
    onKeyDown={(event) => {
      if (!openMenu && (event.key === 'Delete' || event.key === 'Backspace')) return
      event.stopPropagation()
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (openMenu) setOpenMenu(null)
        else onClear()
      } else if (openMenu && (event.key === 'Delete' || event.key === 'Backspace')) event.preventDefault()
    }}>
    <span className="section-toolbar-count" aria-live="polite">已选 <strong>{sections.length}</strong> 个分区</span>
    <div className="section-toolbar-controls">
      <AppearanceMenu key={`color-${selectionKey}`} field="color" label="背景颜色" value={color} open={openMenu === 'color'}
        onOpen={() => setOpenMenu('color')} onClose={() => setOpenMenu((current) => current === 'color' ? null : current)} onChange={(value) => onChange({ color: value })} />
      <AppearanceMenu key={`borderStyle-${selectionKey}`} field="borderStyle" label="边框线型" value={borderStyle} open={openMenu === 'borderStyle'}
        onOpen={() => setOpenMenu('borderStyle')} onClose={() => setOpenMenu((current) => current === 'borderStyle' ? null : current)} onChange={(value) => onChange({ borderStyle: value as 'solid' | 'dashed' })} />
      <AppearanceMenu key={`borderColor-${selectionKey}`} field="borderColor" label="边框颜色" value={borderColor} open={openMenu === 'borderColor'}
        onOpen={() => setOpenMenu('borderColor')} onClose={() => setOpenMenu((current) => current === 'borderColor' ? null : current)} onChange={(value) => onChange({ borderColor: value })} />
    </div>
    <button type="button" className="section-toolbar-button" aria-label="取消分区选择" title="取消选择（Esc）" onClick={onClear}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      <span>取消选择</span>
    </button>
  </div>
}
