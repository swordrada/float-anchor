import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useMainView, useSortedJournalEntries, useStore, useTrackSystem, useTracks, useUIState } from '../store'
import { shallow } from 'zustand/shallow'
import { clampText, formatDateTitle, getTodayDateKey, stripMarkdown } from '../lib/dateUtils'
import { getTrackDashboard, getTrackDayStatus } from '../lib/trackUtils'
import StarTrackLogo from './tracks/StarTrackLogo'

function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloadUrl: string; assetName: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [progress, setProgress] = useState<{ stage: string; percent: number } | null>(null)
  const [resumePercent, setResumePercent] = useState(0)

  useEffect(() => {
    const unsub1 = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo({ version: info.version, downloadUrl: info.downloadUrl, assetName: info.assetName })
      setDismissed(false)
      setResumePercent(info.resumePercent ?? 0)
      setProgress((prev) => (
        prev?.stage === 'downloading' || prev?.stage === 'installing'
          ? prev
          : null
      ))
    })
    const unsub2 = window.electronAPI.onUpdateProgress((p) => {
      if (p.stage === 'cancelled') {
        setResumePercent(p.percent)
        setProgress(null)
        return
      }
      if (p.stage === 'downloading') {
        setResumePercent(p.percent)
      }
      setProgress({ stage: p.stage, percent: p.percent })
    })
    return () => { unsub1(); unsub2() }
  }, [])

  const handleUpdate = useCallback(() => {
    if (!updateInfo) return
    setProgress({ stage: 'downloading', percent: resumePercent > 0 ? resumePercent : 0 })
    window.electronAPI.triggerUpdate(updateInfo.downloadUrl, updateInfo.assetName)
  }, [resumePercent, updateInfo])

  const handleCancelUpdate = useCallback(() => {
    window.electronAPI.cancelUpdate()
  }, [])

  if (!updateInfo) return null

  const isDownloading = progress?.stage === 'downloading' && progress.percent < 100
  const canResume = resumePercent > 0 && resumePercent < 100

  if (dismissed && isDownloading) {
    return (
      <div className="update-mini-bar" onClick={() => setDismissed(false)} title={`下载中 ${progress!.percent}%，点击展开`}>
        <div className="update-mini-fill" style={{ width: `${progress!.percent}%` }} />
        <span className="update-mini-label">{progress!.percent}%</span>
      </div>
    )
  }

  if (dismissed) return null

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
          {isDownloading && (
            <div className="update-banner-actions">
              <button className="update-banner-btn secondary" onClick={handleCancelUpdate}>
                停止更新
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="update-banner-actions">
          <button className="update-banner-btn" onClick={handleUpdate}>
            {canResume ? `继续更新（${resumePercent}%）` : '更新'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ width }: { width?: number }) {
  const mainView = useMainView()
  const uiState = useUIState()
  const today = getTodayDateKey()
  const journalEntries = useSortedJournalEntries()
  const tracks = useTracks()
  const trackSystem = useTrackSystem()
  const { activeCanvasId, openCanvasDetail, openBoardOverview, addCanvas, deleteCanvas, renameCanvas, setMainView, setJournalSelectedDate, setSelectedTrackId, setTrackViewMode } =
    useStore(
      (s) => ({
        activeCanvasId: s.activeCanvasId,
        openCanvasDetail: s.openCanvasDetail,
        openBoardOverview: s.openBoardOverview,
        addCanvas: s.addCanvas,
        deleteCanvas: s.deleteCanvas,
        renameCanvas: s.renameCanvas,
        setMainView: s.setMainView,
        setJournalSelectedDate: s.setJournalSelectedDate,
        setSelectedTrackId: s.setSelectedTrackId,
        setTrackViewMode: s.setTrackViewMode,
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

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (canvases.length <= 1) return
    if (!window.confirm(`确定删除白板「${name}」吗？`)) return
    deleteCanvas(id)
  }

  const handleDoubleClick = (id: string, name: string) => {
    setRenamingId(id)
    setRenameText(name)
  }

  const activeTracks = useMemo(() => tracks.filter((track) => track.status === 'active'), [tracks])
  const archivedTracks = useMemo(() => tracks.filter((track) => track.status === 'archived'), [tracks])

  return (
    <aside className="sidebar" style={width ? { width } : undefined}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="22" height="22" viewBox="0 0 100 100" className="logo-icon">
            <rect x="5" y="5" width="90" height="90" rx="20" fill="var(--card-bg)" stroke="var(--border)" strokeWidth="3" />
            <text x="50" y="62" textAnchor="middle" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize="46" fontWeight="700" fill="var(--text-primary)">FA</text>
            <polyline points="35,78 50,88 65,78" fill="none" stroke="#4a90d9" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="90" r="3" fill="#4a90d9" />
          </svg>
          <span>FloatAnchor</span>
        </div>
        <button
          className="settings-gear"
          onClick={() => useStore.getState().setShowSettings(true)}
          title="设置"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>

      <div className="sidebar-mode-nav">
        <button
          className={`sidebar-mode-featured ${mainView === 'tracks' ? 'active' : ''}`}
          onClick={() => setMainView('tracks')}
        >
          <div className="sidebar-mode-button-main">
            <StarTrackLogo variant="nav" subtle={mainView !== 'tracks'} />
            <span>星轨</span>
          </div>
          <span className="sidebar-mode-badge new">NEW</span>
        </button>
        <button className={mainView === 'journal' ? 'active' : ''} onClick={() => setMainView('journal')}>每日记</button>
        <button className={mainView === 'boards' ? 'active' : ''} onClick={() => openBoardOverview()}>笔记白板</button>
      </div>

      {mainView === 'boards' ? (
        <>
          <nav className="canvas-list">
            <div
              className={`canvas-item ${uiState.boardViewMode === 'overview' ? 'active' : ''}`}
              onClick={() => openBoardOverview()}
            >
              <svg className="canvas-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span className="canvas-name">全部白板</span>
            </div>
            {canvases.map((c) => (
              <div
                key={c.id}
                className={`canvas-item ${c.id === activeCanvasId && uiState.boardViewMode === 'canvas' ? 'active' : ''}`}
                onClick={() => openCanvasDetail(c.id)}
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
                        onClick={(e) => handleDelete(e, c.id, c.name)}
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
              <button className="add-canvas-btn" onClick={() => setIsAdding(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>新建画布</span>
              </button>
            )}
          </div>
        </>
      ) : mainView === 'journal' ? (
        <>
          <div className="sidebar-subtitle">近期每日记</div>
          <nav className="canvas-list">
            <div
              className={`canvas-item ${uiState.journalSelectedDate === today ? 'active' : ''}`}
              onClick={() => setJournalSelectedDate(today)}
            >
              <svg className="canvas-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="canvas-name">今天</span>
            </div>
            {journalEntries.length === 0 ? (
              <div className="sidebar-empty-note">还没有每日记，先从今天开始。</div>
            ) : (
              journalEntries.map((entry) => (
                <div
                  key={entry.date}
                  className={`canvas-item ${uiState.journalSelectedDate === entry.date ? 'active' : ''}`}
                  onClick={() => setJournalSelectedDate(entry.date)}
                >
                  <svg className="canvas-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div className="sidebar-rich-item">
                    <span className="canvas-name">{entry.customTitle || formatDateTitle(entry.date)}</span>
                    <small>{clampText(stripMarkdown(entry.content), 38) || entry.date}</small>
                  </div>
                </div>
              ))
            )}
          </nav>

          <UpdateBanner />

          <div className="sidebar-footer">
            <button className="add-canvas-btn" onClick={() => setJournalSelectedDate(today)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M8 2v4M16 2v4M3 10h18" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
              </svg>
              <span>打开今天</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sidebar-subtitle">当前星轨</div>
          <nav className="canvas-list">
            <div
              className={`canvas-item ${uiState.trackViewMode === 'overview' ? 'active' : ''}`}
              onClick={() => {
                setSelectedTrackId(null)
                setTrackViewMode('overview')
              }}
            >
              <svg className="canvas-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 15l3-3 2 2 5-5" />
              </svg>
              <span className="canvas-name">星轨总览</span>
            </div>
            {activeTracks.map((track) => (
              (() => {
                const dashboard = getTrackDashboard(track, today)
                const status = getTrackDayStatus(trackSystem, track, today)
                return (
                  <div
                    key={track.id}
                    className={`canvas-item ${uiState.selectedTrackId === track.id ? 'active' : ''}`}
                    onClick={() => setSelectedTrackId(track.id)}
                  >
                    <span className="track-dot" style={{ background: track.color }} />
                    <div className="sidebar-rich-item">
                      <span className="canvas-name">{track.title}</span>
                      <small>
                        {status.isOnTrack ? '在轨' : '有风险'}
                        {dashboard.nextMilestone ? ` · 下一阶段：${dashboard.nextMilestone.title}` : ' · 阶段成果已达成'}
                      </small>
                    </div>
                  </div>
                )
              })()
            ))}
            {archivedTracks.length > 0 && (
              <div className="sidebar-subsection-label">已归档</div>
            )}
            {archivedTracks.map((track) => (
              <div key={track.id} className="canvas-item" onClick={() => setSelectedTrackId(track.id)}>
                <span className="track-dot archived" style={{ background: track.color }} />
                <div className="sidebar-rich-item">
                  <span className="canvas-name">{track.title}</span>
                  <small>已归档</small>
                </div>
              </div>
            ))}
            {tracks.length === 0 && (
              <div className="sidebar-empty-note">还没有星轨，去右侧创建第一条结构化人生主线。</div>
            )}
          </nav>

          <UpdateBanner />

          <div className="sidebar-footer">
            <button
              className="add-canvas-btn"
              onClick={() => {
                setSelectedTrackId(null)
                setTrackViewMode('overview')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 15l3-3 2 2 5-5" />
              </svg>
              <span>查看总览</span>
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
