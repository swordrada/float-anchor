import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import type { CanvasLabel as LabelType } from '../types'

interface Props {
  label: LabelType
  scale: number
  selected?: boolean
}

const LEVEL_SIZES: Record<number, { fontSize: number; fontWeight: number }> = {
  0: { fontSize: 14, fontWeight: 400 },
  1: { fontSize: 28, fontWeight: 700 },
  2: { fontSize: 22, fontWeight: 650 },
  3: { fontSize: 18, fontWeight: 600 },
  4: { fontSize: 15, fontWeight: 600 },
}

const MIN_LABEL_WIDTH = 80

function parseMarkdownHeading(text: string): { level: 0 | 1 | 2 | 3 | 4; cleanText: string } {
  const m = text.match(/^(#{1,4})\s+(.*)/)
  if (m) return { level: Math.min(m[1].length, 4) as 0 | 1 | 2 | 3 | 4, cleanText: m[2] }
  return { level: 0, cleanText: text }
}

const CanvasLabelComponent = React.memo(function CanvasLabelComponent({ label, scale, selected }: Props) {
  const updateLabel = useStore((s) => s.updateLabel)
  const deleteLabel = useStore((s) => s.deleteLabel)
  const moveLabel = useStore((s) => s.moveLabel)

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(label.text)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ pointerId: number; startX: number; width: number; scale: number } | null>(null)
  const resizeRaf = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()

  const style = LEVEL_SIZES[label.level] ?? LEVEL_SIZES[1]

  useEffect(() => () => {
    cancelAnimationFrame(resizeRaf.current)
    clearTimeout(clickTimer.current)
  }, [])

  const applyResize = useCallback((clientX: number) => {
    const start = resizeRef.current
    if (!start) return
    updateLabel(label.id, { width: Math.max(MIN_LABEL_WIDTH, start.width + (clientX - start.startX) / start.scale) })
  }, [label.id, updateLabel])

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || resizeRef.current) return
    e.stopPropagation()
    e.preventDefault()
    clearTimeout(clickTimer.current)
    clickCount.current = 0
    // Use the rendered scale: canvas zoom can update before the scale prop does.
    const renderedWidth = containerRef.current?.getBoundingClientRect().width
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      width: label.width,
      scale: renderedWidth && label.width > 0 ? renderedWidth / label.width : scale,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsResizing(true)
  }, [label.width, scale])

  const finishResize = useCallback((e: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const start = resizeRef.current
    if (!start || start.pointerId !== e.pointerId) return
    e.stopPropagation()
    cancelAnimationFrame(resizeRaf.current)
    if (cancelled) updateLabel(label.id, { width: start.width })
    else applyResize(e.clientX)
    resizeRef.current = null
    setIsResizing(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }, [applyResize, label.id, updateLabel])

  useEffect(() => {
    if (isEditing) {
      setEditText(label.text)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isEditing, label.text])

  const commitEdit = useCallback(() => {
    setIsEditing(false)
    const trimmed = editText.trim()
    if (!trimmed) return
    const { level, cleanText } = parseMarkdownHeading(trimmed)
    if (cleanText !== label.text || level !== label.level) {
      updateLabel(label.id, { text: cleanText || label.text, level: level || label.level })
    }
  }, [editText, label, updateLabel])

  const handleClick = useCallback(() => {
    clickCount.current++
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => {
        clickCount.current = 0
      }, 350)
    } else if (clickCount.current === 2) {
      clearTimeout(clickTimer.current)
      clickCount.current = 0
      setIsEditing(true)
    }
  }, [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isEditing || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input')) return
    if (selected) return
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    const sx = e.clientX
    const sy = e.clientY
    const ox = label.x
    const oy = label.y
    const s = scale
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() =>
        moveLabel(label.id, ox + (ev.clientX - sx) / s, oy + (ev.clientY - sy) / s, s),
      )
    }
    const onUp = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      moveLabel(label.id, ox + (ev.clientX - sx) / s, oy + (ev.clientY - sy) / s, s)
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [isEditing, label.id, label.x, label.y, scale, moveLabel, selected])

  return (
    <div
      ref={containerRef}
      data-label-id={label.id}
      className={`canvas-label ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${selected ? 'multi-selected' : ''}`}
      style={{ left: label.x, top: label.y, width: label.width }}
      onMouseDown={handleDragStart}
      onClick={handleClick}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="label-edit-input"
          style={{ fontSize: style.fontSize, fontWeight: style.fontWeight }}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setIsEditing(false)
          }}
          spellCheck={false}
        />
      ) : (
        <div
          className="label-text"
          title={label.text}
          style={{ fontSize: style.fontSize, fontWeight: style.fontWeight }}
        >
          {label.text}
        </div>
      )}

      {!isEditing && (
        <button
          type="button"
          className="label-resize-handle"
          aria-label={`调整标题宽度，当前 ${Math.round(label.width)} 像素`}
          title="拖动调整标题宽度；左右方向键微调，Shift 加速"
          onPointerDown={handleResizeStart}
          onPointerMove={(e) => {
            if (resizeRef.current?.pointerId !== e.pointerId) return
            const x = e.clientX
            cancelAnimationFrame(resizeRaf.current)
            resizeRaf.current = requestAnimationFrame(() => applyResize(x))
          }}
          onPointerUp={(e) => finishResize(e)}
          onPointerCancel={(e) => finishResize(e, true)}
          onLostPointerCapture={(e) => finishResize(e, true)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            if (resizeRef.current) return
            const delta = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1)
            updateLabel(label.id, { width: Math.max(MIN_LABEL_WIDTH, label.width + delta) })
          }}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
          </svg>
        </button>
      )}

      {isHovered && !isEditing && !isResizing && (
        <div className="label-actions">
          <button className="label-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
          <button className="label-action-btn danger" title="删除" onClick={(e) => { e.stopPropagation(); deleteLabel(label.id) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
})

export default CanvasLabelComponent
