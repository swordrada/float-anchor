import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { shallow } from 'zustand/shallow'
import { useStore } from '../store'
import RichEditor from './RichEditor'
import BrandLogo from './BrandLogo'
import { useInstantEditor } from '../useInstantEditor'
import { findInstantNote } from '../lib/instantNotes'

type CreateTarget = 'canvas' | 'section'


function CreateDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: CreateTarget
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const label = target === 'canvas' ? '白板' : '分区'

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = name.trim()
    if (value) onConfirm(value)
  }

  return (
    <div className="instant-dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="instant-dialog"
        noValidate
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="instant-dialog-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3v18M3 12h18" />
          </svg>
        </div>
        <h2>新建{label}</h2>
        <p>给这块新的思考空间取个名字。</p>
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 40))}
          placeholder={`${label}名称`}
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel()
          }}
        />
        <div className="instant-dialog-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button className="primary" type="submit" disabled={!name.trim()}>
            创建并选择
          </button>
        </div>
      </form>
    </div>
  )
}

export default function InstantModeWindow() {
  const {
    loaded,
    loadData,
    loadSettings,
    createInstantCanvas,
    createInstantSection,
    createInstantCard,
    flushPendingSave,
  } = useStore(
    (state) => ({
      loaded: state.loaded,
      loadData: state.loadData,
      loadSettings: state.loadSettings,
      createInstantCanvas: state.createInstantCanvas,
      createInstantSection: state.createInstantSection,
      createInstantCard: state.createInstantCard,
      flushPendingSave: state.flushPendingSave,
    }),
    shallow,
  )
  const canvases = useStore((state) => state.canvases)
  const activeCanvasId = useStore((state) => state.activeCanvasId)
  const [selectedCanvasId, setSelectedCanvasId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const editor = useInstantEditor(loaded)
  const { title, content, editorKey } = editor
  const editingNote = editor.cardId ? findInstantNote({ canvases }, editor.cardId) : null
  const [showRecent, setShowRecent] = useState(false)
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)
  const pendingCreatedId = useRef<string | null>(null)
  const recoveryCopyId = useRef<string | null>(null)
  const [platform, setPlatform] = useState('darwin')
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [preview, setPreview] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const bootstrap = async () => {
      await loadSettings()
      await loadData()
    }
    void bootstrap()
  }, [loadData, loadSettings])

  useEffect(() => {
    if (!loaded || selectedCanvasId) return
    const initialId = activeCanvasId ?? canvases[0]?.id ?? ''
    setSelectedCanvasId(initialId)
    const initialCanvas = canvases.find((canvas) => canvas.id === initialId)
    setSelectedSectionId(initialCanvas?.sections?.[0]?.id ?? '')
  }, [activeCanvasId, canvases, loaded, selectedCanvasId])

  const selectedCanvas = useMemo(
    () => canvases.find((canvas) => canvas.id === selectedCanvasId) ?? null,
    [canvases, selectedCanvasId],
  )
  const sections = selectedCanvas?.sections ?? []

  useEffect(() => {
    if (selectedSectionId && !sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(sections[0]?.id ?? '')
    }
  }, [sections, selectedSectionId])

  useEffect(() => { void window.electronAPI.getPlatform().then(setPlatform) }, [])
  useEffect(() => { setPreview(false); setShowRecent(false) }, [editorKey])

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const showNotice = (message: string) => {
    clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = setTimeout(() => setNotice(''), 2600)
  }

  const changeCanvas = (canvasId: string) => {
    setSelectedCanvasId(canvasId)
    const canvas = canvases.find((item) => item.id === canvasId)
    setSelectedSectionId(canvas?.sections?.[0]?.id ?? '')
  }

  const completeCreation = async (name: string) => {
    setSubmitting(true)
    try {
      if (createTarget === 'canvas') {
        const canvasId = createInstantCanvas(name)
        setSelectedCanvasId(canvasId)
        setSelectedSectionId('')
      } else if (createTarget === 'section' && selectedCanvasId) {
        setSelectedSectionId(createInstantSection(selectedCanvasId, name))
      }
      setCreateTarget(null)
      await flushPendingSave()
      window.electronAPI.instantDataChanged()
      showNotice('已创建并选择')
    } catch { editor.setError('保存失败，请重试。') }
    finally { setSubmitting(false) }
  }

  const submitCard = async () => {
    if (submitting || editor.busy) return
    if (editor.cardId) { await editor.startNew(); return }
    if ((!title.trim() && !content.trim()) || !selectedCanvasId) return
    setSubmitting(true)
    try {
      let cardId = pendingCreatedId.current
      if (!cardId) {
        cardId = createInstantCard(selectedCanvasId, selectedSectionId || null, title, content.trim())
        pendingCreatedId.current = cardId
      } else {
        useStore.setState((state) => ({ canvases: state.canvases.map((canvas) => ({
          ...canvas, cards: canvas.cards.map((card) => card.id === cardId ? { ...card, title, content } : card),
        })) }))
      }
      if (!cardId) throw new Error('Missing destination')
      await flushPendingSave()
      window.electronAPI.instantDataChanged()
      editor.finishNew(cardId)
      setLastCreatedId(cardId)
      pendingCreatedId.current = null
      setPreview(false)
      requestAnimationFrame(() => titleInputRef.current?.focus())
    } catch { editor.setError('未能保存笔记，草稿已保留，请重试投入。') }
    finally { setSubmitting(false) }
  }

  const saveRecoveryCopy = async () => {
    if (submitting || editor.busy) return
    setSubmitting(true)
    try {
      if (!recoveryCopyId.current) await loadData()
      const state = useStore.getState()
      const destination = state.canvases.find((c) => c.id === editingNote?.canvas.id) ?? state.canvases[0]
      if (!destination) throw new Error('No board')
      const id = recoveryCopyId.current ?? createInstantCard(destination.id, null, title, content)
      if (!id) throw new Error('Empty note')
      recoveryCopyId.current = id
      useStore.setState((state) => ({ canvases: state.canvases.map((canvas) => ({
        ...canvas, cards: canvas.cards.map((card) => card.id === id ? { ...card, title, content } : card),
      })) }))
      await flushPendingSave()
      await editor.completeRecovery(id)
      recoveryCopyId.current = null
      window.electronAPI.instantDataChanged()
      showNotice('已另存为新笔记，原笔记未被覆盖')
    } catch { editor.setError('另存失败，当前内容已保留，请重试。') }
    finally { setSubmitting(false) }
  }

  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop
    const applied = await window.electronAPI.setInstantAlwaysOnTop(next)
    setAlwaysOnTop(applied)
  }

  if (!loaded) {
    return (
      <main className="instant-mode-shell instant-loading">
        <div className="instant-loading-mark"><span /></div>
        <p>正在展开即刻空间…</p>
      </main>
    )
  }

  return (
    <main className="instant-mode-shell">
      <div className="instant-topbar">
        <div className="instant-drag-hint">
          <span /><span /><span />
          拖动到任意位置
        </div>
        <div className="instant-window-actions">
          <button
            className={alwaysOnTop ? 'active' : ''}
            onClick={toggleAlwaysOnTop}
            title={alwaysOnTop ? '取消置顶' : '保持置顶'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4h6l-1 5 3 3H7l3-3-1-5zM12 12v8" />
            </svg>
          </button>
          <button
            className="instant-hide-button"
            onClick={async () => { if (await editor.flush()) window.electronAPI.hideInstantMode() }}
            title="隐藏即刻模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
            <span>隐藏</span>
          </button>
          <button
            className="instant-restore-button"
            onClick={() => void editor.leave()}
            title="恢复常规模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 7H5v4" />
              <path d="M5.5 10.5A7 7 0 1112 19" />
            </svg>
            <span>恢复常规模式</span>
          </button>
        </div>
      </div>

      <section className="instant-content">
        <header className="instant-hero">
          <div className="instant-brand-mark" aria-hidden="true">
            <BrandLogo alt="" />
          </div>
          <div>
            <div className="instant-kicker">QUICK CAPTURE</div>
            <h1><span>FloatAnchor</span> 即刻模式</h1>
            <p>将闪念快速锚定</p>
          </div>
        </header>

        <nav className="instant-note-nav" aria-label="笔记切换">
          <span className={editor.cardId ? 'instant-editing-label' : ''}>{editor.cardId ? '正在编辑已有笔记' : '新建笔记'}</span>
          <div>
            {editor.cardId && <button disabled={editor.busy || submitting} onClick={() => void editor.startNew()}>新建笔记</button>}
            <button className={showRecent ? 'active' : ''} aria-expanded={showRecent} aria-controls="instant-recent-notes" disabled={editor.busy || submitting} onClick={() => setShowRecent((value) => !value)}>最近笔记</button>
          </div>
        </nav>

        {showRecent ? (
          <section id="instant-recent-notes" className="instant-recent" aria-label="最近笔记" onKeyDown={(event) => { if (event.key === 'Escape') setShowRecent(false) }}>
            <div className="instant-recent-heading"><div><h2>最近笔记</h2><p>选择一篇，继续补充</p></div><button aria-label="关闭最近笔记" onClick={() => setShowRecent(false)}>关闭</button></div>
            <div className="instant-recent-list">
              {editor.recent.map((item) => {
                const note = findInstantNote({ canvases }, item.cardId)
                if (!note) return null
                return <button key={item.cardId} className={`instant-recent-item ${editor.cardId === item.cardId ? 'active' : ''}`} disabled={editor.busy || submitting} onClick={() => void editor.openCard(item.cardId)}>
                  <span className="instant-recent-title"><strong>{note.card.title || '无标题卡片'}</strong><small>{editor.cardId === item.cardId ? '正在编辑' : new Date(item.openedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span>
                  <span className="instant-recent-excerpt">{note.card.content.replace(/<[^>]+>|[#*`>]/g, '').slice(0, 100) || '暂无正文'}</span>
                  <span className="instant-recent-location">{note.canvas.name}{note.section ? ` / ${note.section.name}` : ''}</span>
                </button>
              })}
              {!editor.recent.some((item) => findInstantNote({ canvases }, item.cardId)) && <p className="instant-recent-empty">还没有最近笔记。投入一条笔记，或点击白板卡片右上角的闪电继续编辑。</p>}
            </div>
            <p className="instant-recent-footnote">显示最近在即刻模式中使用的 10 篇笔记</p>
          </section>
        ) : <>
        {editor.cardId ? (
          <div className="instant-note-location"><span title={editingNote?.canvas.name}>{editingNote ? `${editingNote.canvas.name}${editingNote.section ? ` / ${editingNote.section.name}` : ''}` : '原笔记不可用'}</span><button disabled={editor.busy || submitting} onClick={() => void editor.leave(true)}>在白板中查看</button></div>
        ) : <div className="instant-destination">
          <div className="instant-field">
            <label htmlFor="instant-canvas-select">
              <span>01</span>
              选择白板
            </label>
            <div className="instant-select-row">
              <div className="instant-select-wrap">
                <select
                  id="instant-canvas-select"
                  value={selectedCanvasId}
                  onChange={(event) => changeCanvas(event.target.value)}
                >
                  {canvases.map((canvas) => (
                    <option key={canvas.id} value={canvas.id}>{canvas.name}</option>
                  ))}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 10l5 5 5-5" />
                </svg>
              </div>
              <button className="instant-create-btn" onClick={() => setCreateTarget('canvas')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新建
              </button>
            </div>
          </div>

          <div className="instant-route-line" aria-hidden="true"><span /></div>

          <div className="instant-field">
            <label htmlFor="instant-section-select">
              <span>02</span>
              选择分区
            </label>
            <div className="instant-select-row">
              <div className="instant-select-wrap">
                <select
                  id="instant-section-select"
                  value={selectedSectionId}
                  onChange={(event) => setSelectedSectionId(event.target.value)}
                >
                  <option value="">暂不归入分区</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 10l5 5 5-5" />
                </svg>
              </div>
              <button
                className="instant-create-btn"
                onClick={() => setCreateTarget('section')}
                disabled={!selectedCanvasId}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新建
              </button>
            </div>
          </div>
        </div>}

        <section className="instant-note">
          <div className="instant-note-heading">
            <label htmlFor="instant-note-input">
              {!editor.cardId && <span>03</span>}
              卡片笔记
            </label>
            <div className="instant-note-heading-actions">
              <span className={`instant-save-state ${editor.status}`} role="status">{editor.cardId ? ({ saved: '已保存到本机', saving: '保存中…', unsaved: '待保存', error: '保存失败' }[editor.status]) : `实时 Markdown · ${content.length}`}</span>
              <button
                className={preview ? 'active' : ''}
                onClick={() => setPreview((value) => !value)}
                disabled={!title.trim() && !content.trim()}
              >
                {preview ? '继续编辑' : '预览'}
              </button>
            </div>
          </div>

          <div
            ref={editorContainerRef}
            className="instant-editor"
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                void submitCard()
              }
            }}
          >
            {preview ? (
              <div className="instant-markdown-preview markdown-body">
                {title.trim() && <h1 className="instant-preview-title">{title.trim()}</h1>}
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <>
                <input
                  ref={titleInputRef}
                  className="instant-note-title"
                  value={title}
                  onChange={(event) => editor.change({ title: event.target.value.slice(0, 120) })}
                  disabled={editor.busy || submitting}
                  aria-label="卡片标题"
                  placeholder="卡片标题"
                  spellCheck
                  autoFocus={!editor.cardId}
                  onKeyDown={(event) => {
                    if (!event.nativeEvent.isComposing && event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                      event.preventDefault()
                      editorContainerRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus()
                    }
                  }}
                />
                <div id="instant-note-input" className="instant-rich-editor">
                  <RichEditor
                    key={editorKey}
                    content={content}
                    onChange={(value) => editor.change({ content: value })}
                    autoFocusEnd={!!editor.cardId}
                    readOnly={editor.busy || submitting}
                    placeholder="此刻在想什么？输入 “- ”、“1. ” 或 “## ” 后会立即呈现 Markdown 样式…"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="instant-submit-row">
          <div className="instant-shortcut">
            <kbd>{platform === 'darwin' ? '⌘' : 'Ctrl'}</kbd><span>+</span><kbd>Enter</kbd>
          </div>
          <button
            className={`instant-submit ${submitting ? 'submitting' : ''}`}
            onClick={() => void submitCard()}
            disabled={editor.busy || submitting || (!editor.cardId && ((!title.trim() && !content.trim()) || !selectedCanvasId))}
            title={editor.cardId ? '保存并完成编辑' : '创建卡片笔记'}
          >
            <span>{editor.cardId ? (editor.busy ? '正在保存' : '完成编辑') : (submitting ? '正在投入' : '投入白板')}</span>
            <svg width="25" height="25" viewBox="0 0 28 28" fill="none" aria-hidden="true" style={editor.cardId ? { display: 'none' } : undefined}>
              <path d="M3.5 5.2L24.7 13.3L3.5 22.8L6.7 14.6L18.4 13.5L6.7 12.5L3.5 5.2Z" fill="currentColor" />
              <circle cx="6.2" cy="6.8" r="1.8" fill="var(--instant-submit-dot)" />
            </svg>
          </button>
        </footer>
        {editor.cardId ? <p className="instant-editor-hint">修改自动保存到原笔记</p> : lastCreatedId && <div className="instant-created" role="status"><span>已投入「{findInstantNote({ canvases }, lastCreatedId)?.card.title || '无标题卡片'}」</span><button disabled={editor.busy || submitting} onClick={() => void editor.openCard(lastCreatedId)}>继续补充</button></div>}
        </>}
        {editor.error && <div className="instant-error" role="alert"><p>{editor.error}</p><div><button onClick={() => void (editor.cardId ? editor.flush() : submitCard())} disabled={editor.busy || submitting}>重试保存</button>{editor.cardId && <button onClick={() => void saveRecoveryCopy()} disabled={editor.busy || submitting}>另存为新笔记</button>}</div></div>}
      </section>

      {notice && (
        <div className="instant-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12l4 4L19 6" />
          </svg>
          {notice}
        </div>
      )}
      {createTarget && (
        <CreateDialog
          target={createTarget}
          onCancel={() => setCreateTarget(null)}
          onConfirm={(name) => void completeCreation(name)}
        />
      )}
    </main>
  )
}
