import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { shallow } from 'zustand/shallow'
import { useStore } from '../store'

type CreateTarget = 'canvas' | 'section'

const DRAFT_KEY = 'float-anchor-instant-draft'
const TITLE_DRAFT_KEY = 'float-anchor-instant-title-draft'

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
  const [title, setTitle] = useState(() => localStorage.getItem(TITLE_DRAFT_KEY) ?? '')
  const [content, setContent] = useState(() => localStorage.getItem(DRAFT_KEY) ?? '')
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [preview, setPreview] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  useEffect(() => {
    if (content) localStorage.setItem(DRAFT_KEY, content)
    else localStorage.removeItem(DRAFT_KEY)
  }, [content])

  useEffect(() => {
    if (title) localStorage.setItem(TITLE_DRAFT_KEY, title)
    else localStorage.removeItem(TITLE_DRAFT_KEY)
  }, [title])

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
    if (createTarget === 'canvas') {
      const canvasId = createInstantCanvas(name)
      setSelectedCanvasId(canvasId)
      setSelectedSectionId('')
      await flushPendingSave()
      window.electronAPI.instantDataChanged()
      showNotice(`已新建白板「${name}」`)
    } else if (createTarget === 'section' && selectedCanvasId) {
      const sectionId = createInstantSection(selectedCanvasId, name)
      setSelectedSectionId(sectionId)
      await flushPendingSave()
      window.electronAPI.instantDataChanged()
      showNotice(`已新建分区「${name}」`)
    }
    setCreateTarget(null)
  }

  const insertInline = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const next = content.slice(0, start) + before + selected + after + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const prefixLines = (prefix: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = content.lastIndexOf('\n', textarea.selectionStart - 1) + 1
    const selectionEnd = textarea.selectionEnd
    const endBreak = content.indexOf('\n', selectionEnd)
    const end = endBreak === -1 ? content.length : endBreak
    const selected = content.slice(start, end) || '列表项'
    const replacement = selected.split('\n').map((line) => `${prefix}${line}`).join('\n')
    setContent(content.slice(0, start) + replacement + content.slice(end))
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + replacement.length)
    })
  }

  const submitCard = async () => {
    if ((!title.trim() && !content.trim()) || !selectedCanvasId || submitting) return
    setSubmitting(true)
    const sectionName = sections.find((section) => section.id === selectedSectionId)?.name
    const cardId = createInstantCard(
      selectedCanvasId,
      selectedSectionId || null,
      title,
      content.trim(),
    )
    if (!cardId) {
      showNotice('未能创建卡片，请重试')
      setSubmitting(false)
      return
    }
    await flushPendingSave()
    window.electronAPI.instantDataChanged()
    setTitle('')
    setContent('')
    setPreview(false)
    setSubmitting(false)
    showNotice(sectionName ? `已投入「${sectionName}」` : '卡片已投入白板')
    requestAnimationFrame(() => titleInputRef.current?.focus())
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
            onClick={() => window.electronAPI.hideInstantMode()}
            title="隐藏即刻模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
            <span>隐藏</span>
          </button>
          <button
            className="instant-restore-button"
            onClick={() => window.electronAPI.closeInstantMode()}
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
            <img src="./float-anchor-logo.svg" alt="" />
          </div>
          <div>
            <div className="instant-kicker">QUICK CAPTURE</div>
            <h1><span>FloatAnchor</span> 即刻模式</h1>
            <p>将闪念快速锚定</p>
          </div>
        </header>

        <div className="instant-destination">
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
        </div>

        <section className="instant-note">
          <div className="instant-note-heading">
            <label htmlFor="instant-note-input">
              <span>03</span>
              卡片笔记
            </label>
            <button
              className={preview ? 'active' : ''}
              onClick={() => setPreview((value) => !value)}
              disabled={!title.trim() && !content.trim()}
            >
              {preview ? '继续编辑' : '预览 Markdown'}
            </button>
          </div>

          <div className="instant-editor">
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
                  onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                  placeholder="卡片标题"
                  spellCheck
                  autoFocus
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void submitCard()
                    }
                    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                      event.preventDefault()
                      textareaRef.current?.focus()
                    }
                  }}
                />
                <textarea
                  id="instant-note-input"
                  ref={textareaRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={'此刻在想什么？\n支持 Markdown，⌘ + Enter 即刻投入。'}
                  spellCheck
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void submitCard()
                    }
                    if (event.key === 'Tab') {
                      event.preventDefault()
                      insertInline('  ', '', '')
                    }
                  }}
                />
              </>
            )}
            <div className="instant-markdown-toolbar">
              <div className="instant-format-actions">
                <button onClick={() => prefixLines('## ')} title="标题">H</button>
                <button onClick={() => insertInline('**', '**', '加粗文字')} title="加粗"><strong>B</strong></button>
                <button onClick={() => insertInline('`', '`', '代码')} title="行内代码">&lt;/&gt;</button>
                <button onClick={() => prefixLines('- ')} title="无序列表">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="4" cy="7" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="17" r="1" fill="currentColor" />
                    <path d="M8 7h12M8 12h12M8 17h12" />
                  </svg>
                </button>
                <button onClick={() => prefixLines('- [ ] ')} title="待办">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><path d="M14 6h7M14 18h7" /><rect x="3" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
                <button onClick={() => insertInline('[', '](https://)', '链接文字')} title="链接">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 007.1.1l2-2a5 5 0 00-7.1-7.1l-1.1 1.1M14 11a5 5 0 00-7.1-.1l-2 2A5 5 0 0012 20l1.1-1.1" />
                  </svg>
                </button>
              </div>
              <span>{content.length}</span>
            </div>
          </div>
        </section>

        <footer className="instant-submit-row">
          <div className="instant-shortcut">
            <kbd>⌘</kbd><span>+</span><kbd>Enter</kbd>
          </div>
          <button
            className={`instant-submit ${submitting ? 'submitting' : ''}`}
            onClick={() => void submitCard()}
            disabled={(!title.trim() && !content.trim()) || !selectedCanvasId || submitting}
            title="创建卡片笔记"
          >
            <span>{submitting ? '正在投入' : '投入白板'}</span>
            <svg width="25" height="25" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M3.5 5.2L24.7 13.3L3.5 22.8L6.7 14.6L18.4 13.5L6.7 12.5L3.5 5.2Z" fill="currentColor" />
              <circle cx="6.2" cy="6.8" r="1.8" fill="var(--instant-submit-dot)" />
            </svg>
          </button>
        </footer>
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
