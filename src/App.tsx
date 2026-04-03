import { useEffect, useState } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import CanvasView from './components/CanvasView'
import SettingsModal from './components/SettingsModal'

export default function App() {
  const { loaded, loadData, loadSettings } = useStore()
  const showSettings = useStore((s) => s.showSettings)
  const [platform, setPlatform] = useState<string>('darwin')

  useEffect(() => {
    loadSettings().then(() => {
      loadData().then(() => {
        const { settings } = useStore.getState()
        if (settings.webdav?.server) {
          useStore.getState().setSyncStatus('syncing')
          window.electronAPI.webdavStartupSync(settings.webdav).then((res) => {
            if (res.success && res.action === 'downloaded' && res.data) {
              useStore.setState({
                canvases: res.data.canvases,
                activeCanvasId: res.data.activeCanvasId ?? useStore.getState().activeCanvasId,
              })
            }
            useStore.getState().setSyncStatus(res.success ? 'idle' : 'error')
          }).catch(() => useStore.getState().setSyncStatus('error'))
        }
      })
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
        <Sidebar />
        <CanvasView />
      </div>
      {showSettings && <SettingsModal />}
    </div>
  )
}
