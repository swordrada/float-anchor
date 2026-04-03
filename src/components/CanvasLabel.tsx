import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import type { CanvasLabel as LabelType } from '../types'

interface Props {
  label: LabelType
  scale: number
}

const LEVEL_SIZES: Record<number, { fontSize: number; fontWeight: number }> = {
  0: { fontSize: 14, fontWeight: 400 },
  1: { fontSize: 28, fontWeight: 700 },
  2: { fontSize: 22, fontWeight: 650 },
  3: { fontSize: 18, fontWeight: 600 },
  4: { fontSize: 15, fontWeight: 600 },
}

function parseMarkdownHeading(text: string): { level: 0 | 1 | 2 | 3 | 4; cleanText: string } {
  const m = text.match(/^(#{1,4})\s+(.*)/)
  if (m) return { level: Math.min(m[1].length, 4) as 0 | 1 | 2 | 3 | 4, cleanText: m[2] }
  return { level: 0, cleanText: text }
}

const CanvasLabelComponent = React.memo(function CanvasLabelComponent({ label, scale }: Props) {
  const updateLabel = useStore((s) => s.updateLabel)
  const deleteLabel = useStore((s) => s.deleteLabel)
  const moveLabel = useStore((s) => s.moveLabel)

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(label.text)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()

  const style = LEVEL_SIZES[label.level] ?? LEVEL_SIZES[1]

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
        moveLabel(label.id, ox + (ev.clientX - sx) / s, oy + (ev.clientY - sy) / s),
      )
    }
    const onUp = () => {
      cancelAnimationFrame(raf)
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [isEditing, label.id, label.x, label.y, scale, moveLabel])

  return (
    <div
      className={`canvas-label ${isDragging ? 'dragging' : ''}`}
      style={{ left: label.x, top: label.y, width: label.width }}
      onMouseDown={handleDragStart}
      onClick={handleClick}
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
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setIsEditing(false)
          }}
          spellCheck={false}
        />
      ) : (
        <div
          className="label-text"
          style={{ fontSize: style.fontSize, fontWeight: style.fontWeight }}
        >
          {label.text}
        </div>
      )}

      {isHovered && !isEditing && (
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
