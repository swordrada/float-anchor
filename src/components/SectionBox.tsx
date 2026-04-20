import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useStore, SECTION_COLORS } from '../store'
import type { Section } from '../types'

interface Props {
  section: Section
  scale: number
  selected?: boolean
}

const SECTION_PAD = 24
const HEADER_H = 36

function getReadableTextColor(hex: string): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return '#ffffff'
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  const toLin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
  return L > 0.55 ? '#1a1a1f' : '#ffffff'
}

const SectionBox = React.memo(function SectionBox({ section, scale, selected }: Props) {
  const updateSection = useStore((s) => s.updateSection)
  const deleteSection = useStore((s) => s.deleteSection)
  const moveSection = useStore((s) => s.moveSection)
  const getCanvasCards = () => {
    const s = useStore.getState()
    const c = s.canvases.find((cv) => cv.id === s.activeCanvasId)
    return c?.cards ?? []
  }

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(section.name)
  const [isHovered, setIsHovered] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!showColorPicker) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowColorPicker(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showColorPicker])

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
    if (selected) return
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    const s = scale
    let prevX = e.clientX
    let prevY = e.clientY
    let raf = 0

    const onMove = (ev: MouseEvent) => {
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
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [isEditing, section.id, scale, moveSection, selected])

  const handleResizeStart = useCallback((e: React.MouseEvent, corner: 'br' | 'bl' | 'tr' | 'tl') => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    const sx = e.clientX
    const sy = e.clientY
    const ox = section.x
    const oy = section.y
    const ow = section.width
    const oh = section.height
    const s = scale
    let raf = 0

    const getMinBounds = () => {
      const memberIds = new Set(section.cardIds ?? [])
      const cards = getCanvasCards()
      let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity
      let hasCards = false
      for (const card of cards) {
        if (!memberIds.has(card.id)) continue
        hasCards = true
        cMinX = Math.min(cMinX, card.x)
        cMinY = Math.min(cMinY, card.y)
        cMaxX = Math.max(cMaxX, card.x + card.width)
        cMaxY = Math.max(cMaxY, card.y + (card.height ?? 200))
      }
      if (!hasCards) return null
      return { cMinX, cMinY, cMaxX, cMaxY }
    }

    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const dx = (ev.clientX - sx) / s
        const dy = (ev.clientY - sy) / s
        const bounds = getMinBounds()

        let nx = ox, ny = oy, nw = ow, nh = oh

        if (corner === 'br') {
          nw = ow + dx; nh = oh + dy
        } else if (corner === 'bl') {
          nx = ox + dx; nw = ow - dx; nh = oh + dy
        } else if (corner === 'tr') {
          ny = oy + dy; nw = ow + dx; nh = oh - dy
        } else {
          nx = ox + dx; ny = oy + dy; nw = ow - dx; nh = oh - dy
        }

        nw = Math.max(200, nw)
        nh = Math.max(120, nh)

        if (bounds) {
          const maxLeft = bounds.cMinX - SECTION_PAD
          const maxTop = bounds.cMinY - SECTION_PAD - HEADER_H
          const minRight = bounds.cMaxX + SECTION_PAD
          const minBottom = bounds.cMaxY + SECTION_PAD

          if (corner === 'tl' || corner === 'bl') {
            if (nx > maxLeft) { nw += (nx - maxLeft); nx = maxLeft }
          }
          if (corner === 'tl' || corner === 'tr') {
            if (ny > maxTop) { nh += (ny - maxTop); ny = maxTop }
          }
          if (corner === 'br' || corner === 'tr') {
            if (nx + nw < minRight) nw = minRight - nx
          }
          if (corner === 'br' || corner === 'bl') {
            if (ny + nh < minBottom) nh = minBottom - ny
          }
        }

        if (corner === 'bl' || corner === 'tl') {
          if (nw < 200) { nx = ox + ow - 200; nw = 200 }
        }
        if (corner === 'tl' || corner === 'tr') {
          if (nh < 120) { ny = oy + oh - 120; nh = 120 }
        }

        updateSection(section.id, { x: nx, y: ny, width: nw, height: nh })
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
  }, [section.id, section.x, section.y, section.width, section.height, section.cardIds, scale, updateSection])

  const borderColor = section.color + 'A0'
  const bgColor = section.color + '14'
  const headerBg = section.color + 'F2'
  const headerFg = getReadableTextColor(section.color)
  const headerOnDark = headerFg === '#1a1a1f'
  const actionHover = headerOnDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)'
  const inputUnderline = headerOnDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)'

  return (
    <div
      className={`section-box ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${selected ? 'multi-selected' : ''}`}
      data-section-id={section.id}
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
      <div
        className="section-header"
        onMouseDown={handleDragStart}
        style={{ background: headerBg, color: headerFg }}
      >
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
            style={{ color: headerFg, borderBottomColor: inputUnderline }}
          />
        ) : (
          <span className="section-name" onClick={handleTitleClick} style={{ color: headerFg }}>{section.name}</span>
        )}

        {(isHovered || showColorPicker) && !isEditing && (
          <div className="section-actions">
            <button
              className="section-action-btn"
              title="编辑名称"
              onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ color: headerFg, ['--sec-action-hover' as never]: actionHover }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
            <button
              className="section-action-btn"
              title="更改颜色"
              onClick={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v) }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ color: headerFg, ['--sec-action-hover' as never]: actionHover }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="17.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="8.5" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="6.5" cy="12.5" r="0.8" fill="currentColor" stroke="none" />
                <path d="M12 22a10 10 0 1 1 0-20c5.5 0 10 4.5 10 10 0 2.2-2.8 4-5 4h-1.5c-.83 0-1.5.67-1.5 1.5 0 .39.15.74.39 1 .25.27.39.62.39 1.01 0 .83-.67 1.5-1.5 1.5z" />
              </svg>
            </button>
            <button
              className="section-action-btn danger"
              title="删除"
              onClick={(e) => { e.stopPropagation(); deleteSection(section.id) }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ color: headerFg, ['--sec-action-hover' as never]: actionHover }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        )}

        {showColorPicker && (
          <div
            ref={colorPickerRef}
            className="section-color-picker"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {SECTION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`section-color-swatch ${c.toLowerCase() === section.color.toLowerCase() ? 'active' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={(e) => {
                  e.stopPropagation()
                  if (c.toLowerCase() !== section.color.toLowerCase()) {
                    updateSection(section.id, { color: c })
                  }
                  setShowColorPicker(false)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="section-resize-handle section-resize-br" onMouseDown={(e) => handleResizeStart(e, 'br')} />
      <div className="section-resize-handle section-resize-tl" onMouseDown={(e) => handleResizeStart(e, 'tl')} />
      <div className="section-resize-handle section-resize-tr" onMouseDown={(e) => handleResizeStart(e, 'tr')} />
      <div className="section-resize-handle section-resize-bl" onMouseDown={(e) => handleResizeStart(e, 'bl')} />
    </div>
  )
})

export default SectionBox
