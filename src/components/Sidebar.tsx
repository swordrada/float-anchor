import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'

export default function Sidebar() {
  const {
    canvases,
    activeCanvasId,
    setActiveCanvas,
    addCanvas,
    deleteCanvas,
    renameCanvas,
  } = useStore()

  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAdding) addInputRef.current?.focus()
  }, [isAdding])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const handleAddSubmit = () => {
    const trimmed = newName.trim()
    if (trimmed) {
      addCanvas(trimmed)
    }
    setNewName('')
    setIsAdding(false)
  }

  const handleRenameSubmit = () => {
    const trimmed = renameText.trim()
    if (renamingId && trimmed) {
      renameCanvas(renamingId, trimmed)
    }
    setRenamingId(null)
    setRenameText('')
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (canvases.length <= 1) return
    deleteCanvas(id)
  }

  const handleDoubleClick = (id: string, name: string) => {
    setRenamingId(id)
    setRenameText(name)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="22" height="22" viewBox="0 0 100 100" className="logo-icon">
            <rect x="5" y="5" width="90" height="90" rx="20" fill="#fff" stroke="#dcdcdc" strokeWidth="3" />
            <text x="50" y="62" textAnchor="middle" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize="46" fontWeight="700" fill="#2d2d2d">FA</text>
            <polyline points="35,78 50,88 65,78" fill="none" stroke="#4a90d9" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="90" r="3" fill="#4a90d9" />
          </svg>
          <span>FloatAnchor</span>
        </div>
      </div>

      <nav className="canvas-list">
        {canvases.map((c) => (
          <div
            key={c.id}
            className={`canvas-item ${c.id === activeCanvasId ? 'active' : ''}`}
            onClick={() => setActiveCanvas(c.id)}
            onDoubleClick={() => handleDoubleClick(c.id, c.name)}
          >
            {renamingId === c.id ? (
              <input
                ref={renameInputRef}
                className="canvas-rename-input"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit()
                  if (e.key === 'Escape') {
                    setRenamingId(null)
                    setRenameText('')
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <svg className="canvas-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="3" />
                  <line x1="7" y1="8" x2="17" y2="8" />
                  <line x1="7" y1="12" x2="13" y2="12" />
                </svg>
                <span className="canvas-name">{c.name}</span>
                <span className="canvas-count">{c.cards.length}</span>
                <button
                  className="canvas-edit"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDoubleClick(c.id, c.name)
                  }}
                  title="重命名画布"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
                {canvases.length > 1 && (
                  <button
                    className="canvas-delete"
                    onClick={(e) => handleDelete(e, c.id)}
                    title="删除画布"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {isAdding ? (
          <div className="add-canvas-form">
            <input
              ref={addInputRef}
              className="add-canvas-input"
              placeholder="输入画布名称..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleAddSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSubmit()
                if (e.key === 'Escape') {
                  setNewName('')
                  setIsAdding(false)
                }
              }}
            />
          </div>
        ) : (
          <button
            className="add-canvas-btn"
            onClick={() => setIsAdding(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>新建画布</span>
          </button>
        )}
      </div>
    </aside>
  )
}
