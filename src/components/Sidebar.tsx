import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useStore } from '../store'
import { shallow } from 'zustand/shallow'

function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloadUrl: string; assetName: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [progress, setProgress] = useState<{ stage: string; percent: number } | null>(null)

  useEffect(() => {
    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo({ version: info.version, downloadUrl: info.downloadUrl, assetName: info.assetName })
      setDismissed(false)
      setProgress(null)
    })
    window.electronAPI.onUpdateProgress((p) => {
      setProgress({ stage: p.stage, percent: p.percent })
    })
  }, [])

  const handleUpdate = useCallback(() => {
    if (!updateInfo) return
    setProgress({ stage: 'downloading', percent: 0 })
    window.electronAPI.triggerUpdate(updateInfo.downloadUrl, updateInfo.assetName)
  }, [updateInfo])

  if (!updateInfo || dismissed) return null

  return (
    <div className="update-banner">
      <div className="update-banner-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2v10m0 0l-3-3m3 3l3-3" />
          <path d="M20 21H4a1 1 0 01-1-1v-3h18v3a1 1 0 01-1 1z" />
        </svg>
        <span className="update-banner-text">
          v{updateInfo.version} 可用
        </span>
        <button className="update-banner-close" onClick={() => setDismissed(true)} title="关闭">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {progress ? (
        <div className="update-banner-progress">
          <div className="update-progress-bar">
            <div
              className="update-progress-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="update-progress-label">
            {progress.stage === 'downloading' ? `下载中 ${progress.percent}%` :
             progress.stage === 'installing' ? '安装中...' : '更新失败'}
          </span>
        </div>
      ) : (
        <button className="update-banner-btn" onClick={handleUpdate}>
          更新
        </button>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { activeCanvasId, setActiveCanvas, addCanvas, deleteCanvas, renameCanvas } =
    useStore(
      (s) => ({
        activeCanvasId: s.activeCanvasId,
        setActiveCanvas: s.setActiveCanvas,
        addCanvas: s.addCanvas,
        deleteCanvas: s.deleteCanvas,
        renameCanvas: s.renameCanvas,
      }),
      shallow,
    )
  const canvases = useStore((s) =>
    s.canvases.map((c) => ({ id: c.id, name: c.name, cardCount: c.cards.length })),
    shallow,
  )

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
                <span className="canvas-count">{c.cardCount}</span>
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

      <UpdateBanner />

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
