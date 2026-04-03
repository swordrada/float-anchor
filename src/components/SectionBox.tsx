import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import type { Section } from '../types'

interface Props {
  section: Section
  scale: number
}

const SectionBox = React.memo(function SectionBox({ section, scale }: Props) {
  const updateSection = useStore((s) => s.updateSection)
  const deleteSection = useStore((s) => s.deleteSection)
  const moveSection = useStore((s) => s.moveSection)

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(section.name)
  const [isHovered, setIsHovered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (isEditing) {
      setEditName(section.name)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing, section.name])

  const commitEdit = useCallback(() => {
    setIsEditing(false)
    const trimmed = editName.trim()
    if (trimmed && trimmed !== section.name) {
      updateSection(section.id, { name: trimmed })
    }
  }, [editName, section.id, section.name, updateSection])

  const handleTitleClick = useCallback(() => {
    clickCount.current++
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 350)
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
    const s = scale
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const dx = (ev.clientX - sx) / s
        const dy = (ev.clientY - sy) / s
        moveSection(section.id, dx, dy)
        ;(sx as any) !== undefined
      })
    }

    let prevX = sx
    let prevY = sy
    const onMoveActual = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      const curX = ev.clientX
      const curY = ev.clientY
      const ddx = (curX - prevX) / s
      const ddy = (curY - prevY) / s
      prevX = curX
      prevY = curY
      raf = requestAnimationFrame(() => moveSection(section.id, ddx, ddy))
    }

    const onUp = () => {
      cancelAnimationFrame(raf)
      setIsDragging(false)
      document.removeEventListener('mousemove', onMoveActual)
      document.removeEventListener('mouseup', onUp)
    }
    document.removeEventListener('mousemove', onMove)
    document.addEventListener('mousemove', onMoveActual)
    document.addEventListener('mouseup', onUp)
  }, [isEditing, section.id, scale, moveSection])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    const sx = e.clientX
    const sy = e.clientY
    const ow = section.width
    const oh = section.height
    const s = scale
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const nw = Math.max(200, ow + (ev.clientX - sx) / s)
        const nh = Math.max(120, oh + (ev.clientY - sy) / s)
        updateSection(section.id, { width: nw, height: nh })
      })
    }
    const onUp = () => {
      cancelAnimationFrame(raf)
      setIsResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [section.id, section.width, section.height, scale, updateSection])

  const borderColor = section.color + '55'
  const bgColor = section.color + '0A'

  return (
    <div
      className={`section-box ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: section.x,
        top: section.y,
        width: section.width,
        height: section.height,
        borderColor,
        backgroundColor: bgColor,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="section-header" onMouseDown={handleDragStart}>
        <div className="section-color-dot" style={{ background: section.color }} />
        {isEditing ? (
          <input
            ref={inputRef}
            className="section-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        ) : (
          <span className="section-name" onClick={handleTitleClick}>{section.name}</span>
        )}

        {isHovered && !isEditing && (
          <div className="section-actions">
            <button className="section-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
            <button className="section-action-btn danger" title="删除" onClick={(e) => { e.stopPropagation(); deleteSection(section.id) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="section-resize-handle" onMouseDown={handleResizeStart}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="9" y1="1" x2="1" y2="9" stroke={section.color} strokeWidth="1" opacity="0.5" />
          <line x1="9" y1="4" x2="4" y2="9" stroke={section.color} strokeWidth="1" opacity="0.5" />
          <line x1="9" y1="7" x2="7" y2="9" stroke={section.color} strokeWidth="1" opacity="0.5" />
        </svg>
      </div>
    </div>
  )
})

export default SectionBox
