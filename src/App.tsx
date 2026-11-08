import { useEffect, useState, useRef, useCallback } from 'react'
import { useStore, getEffectiveProvider } from './store'
import Sidebar from './components/Sidebar'
import CanvasView from './components/CanvasView'
import BoardOverviewView from './components/BoardOverviewView'
import DailyJournalView from './components/DailyJournalView'
import SettingsModal from './components/SettingsModal'
import SearchModal from './components/SearchModal'
import { REMOTE_SYNC_INTERVAL_MS } from './lib/syncData'
import type { WebDAVSyncResult } from './types'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 400
const SIDEBAR_DEFAULT = 228

export default function App() {
  const { loaded, loadData, loadSettings } = useStore()
  const showSettings = useStore((s) => s.showSettings)
  const boardViewMode = useStore((s) => s.boardViewMode)
  const activeView = useStore((s) => s.activeView)
  const syncProvider = useStore((s) => getEffectiveProvider(s.settings))
  const syncDecision = useStore((s) => s.syncDecision)
  const [platform, setPlatform] = useState<string>('darwin')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [showSearch, setShowSearch] = useState(false)
  const closeSearch = useCallback(() => setShowSearch(false), [])
  const openSearch = useCallback(() => {
    if (document.querySelector('[role="dialog"], .modal-overlay, .settings-overlay') || useStore.getState().showSettings) return
    window.dispatchEvent(new Event('fa-before-search'))
    setShowSearch(true)
  }, [])
  const dragging = useRef(false)
  const backgroundSyncingRef = useRef(false)
  const backgroundStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        if (event.isComposing || document.querySelector('[role="dialog"], .modal-overlay, .settings-overlay') || useStore.getState().showSettings) return
        event.preventDefault()
        event.stopPropagation()
        openSearch()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [openSearch])

  useEffect(() => window.electronAPI.onBeforeClose?.(async () => {
    document.body.inert = true
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    window.dispatchEvent(new Event('fa-before-save'))
    await useStore.getState().flushPendingSave()
  }), [])

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX))
      setSidebarWidth(w)
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const markSyncSuccess = useCallback(() => {
    const store = useStore.getState()
    store.setSyncStatus('success')
    if (backgroundStatusTimerRef.current) clearTimeout(backgroundStatusTimerRef.current)
    backgroundStatusTimerRef.current = setTimeout(() => {
      if (useStore.getState().syncStatus === 'success') {
        useStore.getState().setSyncStatus('idle')
      }
    }, 3000)
  }, [])

  const applySyncResult = useCallback(async (
    res: WebDAVSyncResult,
    options?: { openSettingsOnDecision?: boolean },
  ) => {
    const store = useStore.getState()
    if (!res.success) {
      store.setSyncStatus('error', res.error)
      return
    }

    if (res.action === 'needs-confirmation' && res.decision) {
      store.setSyncDecision(res.decision)
      store.setSyncStatus('warning')
      if (options?.openSettingsOnDecision) {
        store.setShowSettings(true)
      }
      return
    }

    store.setSyncDecision(null)

    if (res.action === 'downloaded' && res.data) {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      window.dispatchEvent(new Event('fa-before-reload'))
      await store.flushPendingSave()
      await store.loadData()
      store.refreshImageCache()
    }

    if (res.pending || await window.electronAPI.getSyncPending?.()) { store.setSyncStatus('pending'); return }

    if (res.action === 'uploaded' || res.action === 'downloaded') {
      markSyncSuccess()
      return
    }

    store.setSyncStatus('idle')
  }, [markSyncSuccess])

  useEffect(() => {
    let disposed = false

    const bootstrap = async () => {
      await loadSettings()
      if (disposed) return

      // Never block the first screen on remote sync.
      await loadData()
      if (disposed) return

      const { settings } = useStore.getState()
      if (getEffectiveProvider(settings) === 'none') return

      try {
        await useStore.getState().flushPendingSave()
        useStore.getState().setSyncStatus('syncing')
        const res = await window.electronAPI.syncStartup()
        if (disposed) return

        await applySyncResult(res, { openSettingsOnDecision: true })
      } catch {
        if (!disposed) useStore.getState().setSyncStatus('error')
      }
    }

    void bootstrap()
    window.electronAPI.getPlatform().then(setPlatform)

    return () => {
      disposed = true
    }
  }, [applySyncResult, loadData, loadSettings])

  const runBackgroundSync = useCallback(async () => {
    if (backgroundSyncingRef.current) return
    if (useStore.getState().syncDecision) return
    backgroundSyncingRef.current = true
    try {
      window.dispatchEvent(new Event('fa-before-save'))
      await useStore.getState().flushPendingSave()
      const res = await window.electronAPI.syncPeriodic()
      await applySyncResult(res, { openSettingsOnDecision: true })
    } catch {
      useStore.getState().setSyncStatus('error')
    } finally {
      backgroundSyncingRef.current = false
    }
  }, [applySyncResult])

  useEffect(() => {
    if (syncProvider === 'none' || syncDecision) return
    const timer = window.setInterval(() => {
      void runBackgroundSync()
    }, REMOTE_SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [runBackgroundSync, syncDecision, syncProvider])

  useEffect(() => {
    return () => {
      if (backgroundStatusTimerRef.current) clearTimeout(backgroundStatusTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let refresh = Promise.resolve()
    const reload = () => {
      refresh = refresh.then(async () => {
        await useStore.getState().flushPendingSave()
        await useStore.getState().loadData()
        useStore.getState().scheduleAutoSync()
      }).catch(() => useStore.getState().setSyncStatus('error', '本地内容尚未保存，请保留当前编辑。'))
      return refresh
    }
    const offData = window.electronAPI.onInstantDataChanged(() => void reload())
    const setInstantCard = (id: string | null) => useStore.setState({ instantEditingCardId: id })
    void window.electronAPI.getInstantEditingCard().then(setInstantCard)
    const offEditing = window.electronAPI.onInstantEditingCardChanged(setInstantCard)
    const offNavigate = window.electronAPI.onShowCardInBoard((cardId) => {
      void reload().then(() => {
        const store = useStore.getState()
        const canvas = store.canvases.find((c) => c.cards.some((card) => card.id === cardId))
        if (!canvas) return
        store.setActiveCanvas(canvas.id)
        store.setHighlightCard(cardId)
        requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('fa-fly-to-card', { detail: { cardId } }))))
      })
    })
    return () => { offData(); offEditing(); offNavigate() }
  }, [])

  if (!loaded) {
    return (
      <div className="app-loading">
        <span>加载中...</span>
      </div>
    )
  }

  return (
    <div className="app" data-platform={platform}>
      {platform === 'win32' && (
        <div className="win-titlebar">
          <span className="win-titlebar-title">FloatAnchor</span>
          <div className="win-titlebar-controls">
            <button onClick={() => window.electronAPI.winMinimize()}>
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>
            <button onClick={() => window.electronAPI.winMaximize()}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="0.5"
                  y="0.5"
                  width="9"
                  height="9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            </button>
            <button
              className="win-close"
              onClick={() => window.electronAPI.winClose()}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="app-body">
        <Sidebar width={sidebarWidth} onOpenSearch={openSearch} />
        <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
        {activeView === 'journal' ? <DailyJournalView /> : boardViewMode === 'overview' ? <BoardOverviewView /> : <CanvasView />}
      </div>
      {showSettings && <SettingsModal />}
      {showSearch && <SearchModal onClose={closeSearch} />}
    </div>
  )
}
