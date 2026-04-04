import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import type { WebDAVConfig } from '../types'

export default function SettingsModal() {
  const settings = useStore((s) => s.settings)
  const syncStatus = useStore((s) => s.syncStatus)
  const setTheme = useStore((s) => s.setTheme)
  const setWebDAVConfig = useStore((s) => s.setWebDAVConfig)
  const setShowSettings = useStore((s) => s.setShowSettings)

  const [server, setServer] = useState(settings.webdav?.server || 'https://dav.jianguoyun.com/dav/')
  const [username, setUsername] = useState(settings.webdav?.username || '')
  const [password, setPassword] = useState(settings.webdav?.password || '')
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [connected, setConnected] = useState(!!settings.webdav?.server)

  useEffect(() => {
    if (settings.webdav) {
      setServer(settings.webdav.server)
      setUsername(settings.webdav.username)
      setPassword(settings.webdav.password)
      setConnected(true)
    }
  }, [settings.webdav])

  const handleTest = useCallback(async () => {
    if (!server || !username || !password) return
    setTestResult('testing')
    const config: WebDAVConfig = { server, username, password }
    const res = await window.electronAPI.webdavTest(config)
    setTestResult(res.success ? 'ok' : 'fail')
    setTimeout(() => setTestResult('idle'), 3000)
  }, [server, username, password])

  const handleSave = useCallback(async () => {
    if (!server || !username || !password) return
    const config: WebDAVConfig = { server, username, password }
    const res = await window.electronAPI.webdavTest(config)
    if (res.success) {
      setWebDAVConfig(config)
      setConnected(true)
      setTestResult('ok')
      setTimeout(() => setTestResult('idle'), 2000)
      useStore.getState().setSyncStatus('syncing')
      window.electronAPI.webdavAutoSync(config).then((syncRes) => {
        useStore.getState().setSyncStatus(syncRes.success ? 'success' : 'error')
        if (syncRes.success) setTimeout(() => useStore.getState().setSyncStatus('idle'), 3000)
      }).catch(() => useStore.getState().setSyncStatus('error'))
    } else {
      setTestResult('fail')
      setTimeout(() => setTestResult('idle'), 3000)
    }
  }, [server, username, password, setWebDAVConfig])

  const handleManualSync = useCallback(async () => {
    const cfg = settings.webdav
    if (!cfg?.server) return
    const store = useStore.getState()
    store.setSyncStatus('syncing')
    try {
      store.persist()
      await new Promise((r) => setTimeout(r, 500))
      const res = await window.electronAPI.webdavStartupSync(cfg)
      if (res.success && res.action === 'downloaded' && res.data) {
        await store.loadData()
      }
      store.setSyncStatus(res.success ? 'success' : 'error')
      if (res.success) setTimeout(() => useStore.getState().setSyncStatus('idle'), 3000)
    } catch {
      store.setSyncStatus('error')
    }
  }, [settings.webdav])

  const handleDisconnect = useCallback(() => {
    setWebDAVConfig(undefined)
    setConnected(false)
    setUsername('')
    setPassword('')
    setTestResult('idle')
  }, [setWebDAVConfig])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setShowSettings(false)
  }

  const syncLabel = syncStatus === 'syncing'
    ? '同步中...'
    : syncStatus === 'success'
    ? '已同步'
    : syncStatus === 'error'
    ? '同步失败'
    : connected ? '已连接' : '未连接'

  const syncDotClass = syncStatus === 'syncing'
    ? 'syncing'
    : syncStatus === 'error'
    ? 'error'
    : connected ? 'connected' : ''

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-modal">
        <h2>设置</h2>

        <div className="settings-section">
          <h3>外观</h3>
          <div className="theme-switcher">
            <button
              className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              Light
            </button>
            <button
              className={`theme-option ${settings.theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              Dark
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>云同步 — 坚果云 (WebDAV)</h3>
          <div className="webdav-form">
            <div className="webdav-field">
              <label>服务器地址</label>
              <input
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="https://dav.jianguoyun.com/dav/"
              />
            </div>
            <div className="webdav-field">
              <label>账号（邮箱）</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div className="webdav-field">
              <label>应用密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="在坚果云后台生成"
              />
            </div>
            <div className="webdav-actions">
              <button onClick={handleTest} disabled={testResult === 'testing'}>
                {testResult === 'testing' ? '测试中...' : testResult === 'ok' ? '连接成功' : testResult === 'fail' ? '连接失败' : '测试连接'}
              </button>
              <button className="primary" onClick={handleSave}>保存</button>
              {connected && (
                <>
                  <button onClick={handleManualSync} disabled={syncStatus === 'syncing'}>
                    {syncStatus === 'syncing' ? '同步中...' : '同步'}
                  </button>
                  <button onClick={handleDisconnect}>断开</button>
                </>
              )}
            </div>
            <div className="sync-status">
              <span className={`sync-dot ${syncDotClass}`} />
              <span>{syncLabel}</span>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button onClick={() => setShowSettings(false)}>关闭</button>
        </div>
      </div>
    </div>
  )
}
