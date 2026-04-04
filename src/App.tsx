import { useEffect, useState, useRef, useCallback } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import CanvasView from './components/CanvasView'
import SettingsModal from './components/SettingsModal'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 400
const SIDEBAR_DEFAULT = 228

export default function App() {
  const { loaded, loadData, loadSettings } = useStore()
  const showSettings = useStore((s) => s.showSettings)
  const [platform, setPlatform] = useState<string>('darwin')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const dragging = useRef(false)

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

  useEffect(() => {
    loadSettings().then(async () => {
      const { settings } = useStore.getState()
      if (settings.webdav?.server) {
        try {
          useStore.getState().setSyncStatus('syncing')
          const res = await window.electronAPI.webdavStartupSync(settings.webdav)
          if (res.success && res.action === 'downloaded' && res.data) {
            await loadData()
            useStore.getState().setSyncStatus('idle')
            return
          }
          useStore.getState().setSyncStatus(res.success ? 'idle' : 'error')
        } catch {
          useStore.getState().setSyncStatus('error')
        }
      }
      await loadData()
    })
    window.electronAPI.getPlatform().then(setPlatform)
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
        <Sidebar width={sidebarWidth} />
        <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
        <CanvasView />
      </div>
      {showSettings && <SettingsModal />}
    </div>
  )
}
