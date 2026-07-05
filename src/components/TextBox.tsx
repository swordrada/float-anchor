import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import type { TextBox as TextBoxType } from '../types'

interface Props {
  text: TextBoxType
  scale: number
  selected?: boolean
}

const TextBoxComponent = React.memo(function TextBoxComponent({ text, scale, selected }: Props) {
  const updateText = useStore((s) => s.updateText)
  const deleteText = useStore((s) => s.deleteText)
  const moveText = useStore((s) => s.moveText)
  const setEditingText = useStore((s) => s.setEditingText)
  const isEditing = useStore((s) => s.editingTextId === text.id)

  const [editText, setEditText] = useState(text.text)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()
  const committedRef = useRef(false)

  const autoGrow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // 进入编辑态：同步内容、聚焦、光标置末、撑开高度
  useEffect(() => {
    if (isEditing) {
      committedRef.current = false
      setEditText(text.text)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        autoGrow(el)
      })
    }
  }, [isEditing, text.text, autoGrow])

  // 非编辑态测量渲染高度并回写，供框选/命中判定使用精确几何
  useEffect(() => {
    if (isEditing) return
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height / scale)
      if (h > 0 && Math.abs(h - (text.height ?? 0)) > 1) {
        updateText(text.id, { height: h })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isEditing, scale, text.id, text.height, text.text, text.width, updateText])

  const commitEdit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    setEditingText(null)
    if (editText !== text.text) {
      updateText(text.id, { text: editText })
    }
  }, [editText, text.id, text.text, setEditingText, updateText])

  const handleClick = useCallback(() => {
    clickCount.current++
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 350)
    } else if (clickCount.current === 2) {
      clearTimeout(clickTimer.current)
      clickCount.current = 0
      setEditingText(text.id)
    }
  }, [setEditingText, text.id])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isEditing || e.button !== 0) return
    if (selected) return
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    const sx = e.clientX
    const sy = e.clientY
    const ox = text.x
    const oy = text.y
    const s = scale
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() =>
        moveText(text.id, ox + (ev.clientX - sx) / s, oy + (ev.clientY - sy) / s),
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
  }, [isEditing, text.id, text.x, text.y, scale, moveText, selected])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const sx = e.clientX
    const ow = text.width
    const s = scale
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = Math.max(80, ow + (ev.clientX - sx) / s)
        updateText(text.id, { width: next })
      })
    }
    const onUp = () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [text.id, text.width, scale, updateText])

  return (
    <div
      ref={containerRef}
      className={`canvas-text ${isDragging ? 'dragging' : ''} ${selected ? 'multi-selected' : ''}`}
      style={{ left: text.x, top: text.y, width: text.width }}
      onMouseDown={handleDragStart}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="text-edit-input"
          value={editText}
          onChange={(e) => { setEditText(e.target.value); autoGrow(e.target) }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); commitEdit() }
            e.stopPropagation()
          }}
          spellCheck={false}
        />
      ) : (
        <div className={`text-content ${text.text ? '' : 'placeholder'}`}>
          {text.text || '输入文本'}
        </div>
      )}

      {!isEditing && (
        <div className="text-resize-handle" onMouseDown={handleResizeStart} />
      )}

      {isHovered && !isEditing && (
        <div className="text-actions">
          <button className="text-action-btn" title="编辑" onClick={(e) => { e.stopPropagation(); setEditingText(text.id) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
          <button className="text-action-btn danger" title="删除" onClick={(e) => { e.stopPropagation(); deleteText(text.id) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
})

export default TextBoxComponent
