import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore, getEffectiveProvider } from '../store'
import type { WebDAVConfig, WebDAVSyncResolution, WebDAVSyncResult, WebDAVSyncSummary } from '../types'
import { SHORTCUTS, scKey } from '../shortcuts'

export default function SettingsModal() {
  const settings = useStore((s) => s.settings)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncDecision = useStore((s) => s.syncDecision)
  const setTheme = useStore((s) => s.setTheme)
  const setWebDAVConfig = useStore((s) => s.setWebDAVConfig)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setSyncDecision = useStore((s) => s.setSyncDecision)

  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle')
  const [backupMessage, setBackupMessage] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearInput, setClearInput] = useState('')
  const [clearStatus, setClearStatus] = useState<'idle' | 'preparing' | 'no-backup' | 'ready' | 'clearing' | 'done'>('idle')
  const [clearMessage, setClearMessage] = useState('')
  const [migrateStatus, setMigrateStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [migrateMessage, setMigrateMessage] = useState('')

  const CLEAR_CONFIRM_TEXT = '我已明确该操作会清空所有内容，执行'
  const formatBackupTime = (ts?: number) => ts ? new Date(ts).toLocaleString('zh-CN') : '未知时间'

  const fmtKB = (b?: number) => b == null ? '?' : (b / 1024 >= 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

  const handleMigrateImages = useCallback(async () => {
    setMigrateStatus('running'); setMigrateMessage('')
    try {
      await useStore.getState().flushPendingSave()
      const res = await window.electronAPI.migrateEmbeddedImages()
      if (res.success) {
        await useStore.getState().loadData()
        useStore.getState().refreshImageCache()
        setMigrateStatus('done')
        setMigrateMessage(res.count ? `已提取 ${res.count} 张内嵌图，数据从 ${fmtKB(res.beforeBytes)} 缩到 ${fmtKB(res.afterBytes)}` : '没有发现内嵌图片')
        setTimeout(() => { setMigrateStatus('idle'); setMigrateMessage('') }, 8000)
      } else {
        setMigrateStatus('error'); setMigrateMessage(res.error || '提取失败')
        setTimeout(() => { setMigrateStatus('idle'); setMigrateMessage('') }, 6000)
      }
    } catch {
      setMigrateStatus('error'); setMigrateMessage('提取时发生错误')
      setTimeout(() => { setMigrateStatus('idle'); setMigrateMessage('') }, 6000)
    }
  }, [])

  const handleExport = useCallback(async () => {
    setBackupStatus('exporting')
    setBackupMessage('')
    try {
      const res = await window.electronAPI.exportBackup()
      if (res.success) {
        setBackupStatus('success')
        setBackupMessage(`备份成功：${res.fileName}`)
        setTimeout(() => { setBackupStatus('idle'); setBackupMessage('') }, 5000)
      } else {
        setBackupStatus('error')
        setBackupMessage(res.error || '导出失败')
        setTimeout(() => { setBackupStatus('idle'); setBackupMessage('') }, 5000)
      }
    } catch {
      setBackupStatus('error')
      setBackupMessage('导出时发生错误')
      setTimeout(() => { setBackupStatus('idle'); setBackupMessage('') }, 5000)
    }
  }, [])

  const handleImport = useCallback(async () => {
    setImportStatus('importing')
    setImportMessage('')
    try {
      const res = await window.electronAPI.importBackup()
      if (res.success && res.data) {
        setImportStatus('success')
        setImportMessage('导入成功，正在重新加载数据...')
        await useStore.getState().loadData()
        setTimeout(() => { setImportStatus('idle'); setImportMessage('') }, 3000)
      } else if (res.error === 'cancelled') {
        setImportStatus('idle')
      } else {
        setImportStatus('error')
        setImportMessage(res.error || '导入失败')
        setTimeout(() => { setImportStatus('idle'); setImportMessage('') }, 5000)
      }
    } catch {
      setImportStatus('error')
      setImportMessage('导入时发生错误')
      setTimeout(() => { setImportStatus('idle'); setImportMessage('') }, 5000)
    }
  }, [])

  const handleClearClick = useCallback(async () => {
    setClearInput('')
    setClearMessage('')
    setClearStatus('preparing')
    setShowClearConfirm(true)
    try {
      const res = await window.electronAPI.prepareClearAllData()
      if (!res.success) {
        setClearStatus('no-backup')
        setClearMessage(res.error || '清空前自动备份失败，请先导出备份后重试。')
        return
      }

      if (res.backupCreated) {
        const backupLabel = res.latestFileName ? `：${res.latestFileName}` : ''
        setClearMessage(`未检测到 1 天内的备份，已自动创建新备份${backupLabel}，请再次确认是否清空。`)
      } else if (res.latestTimestamp) {
        setClearMessage(`已检测到 1 天内的最新备份（${formatBackupTime(res.latestTimestamp)}），可以继续清空。`)
      } else {
        setClearMessage('已完成清空前备份检查，可以继续清空。')
      }

      setClearStatus('ready')
    } catch {
      setClearStatus('no-backup')
      setClearMessage('清空前自动备份失败，请先导出备份后重试。')
    }
  }, [])

  const handleClearConfirm = useCallback(async () => {
    if (clearInput !== CLEAR_CONFIRM_TEXT || clearStatus !== 'ready') return
    setClearStatus('clearing')
    setClearMessage('')
    try {
      const res = await window.electronAPI.clearAllData()
      if (res.success) {
        setClearStatus('done')
        setClearMessage('所有数据已清空')
        await useStore.getState().loadData()
        setTimeout(() => {
          setShowClearConfirm(false)
          setClearStatus('idle')
          setClearMessage('')
          setClearInput('')
        }, 2000)
      } else {
        setClearStatus('ready')
        setClearMessage(res.error || '清空失败')
      }
    } catch {
      setClearStatus('ready')
      setClearMessage('清空时发生错误')
    }
  }, [clearInput, clearStatus])

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installing' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateResumePercent, setUpdateResumePercent] = useState(0)
  const [updateInfo, setUpdateInfo] = useState<{ downloadUrl: string; assetName: string } | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const checkedRef = useRef(false)

  useEffect(() => {
    const unsub1 = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateVersion(info.version)
      setUpdateInfo({ downloadUrl: info.downloadUrl, assetName: info.assetName })
      setCurrentVersion(info.currentVersion)
      const rp = info.resumePercent ?? 0
      setUpdateResumePercent(rp)
      setUpdateProgress(rp)
      setUpdateStatus((prev) => (prev === 'downloading' || prev === 'installing') ? prev : 'available')
    })
    const unsub2 = window.electronAPI.onUpdateProgress((p) => {
      if (p.stage === 'downloading') {
        setUpdateStatus('downloading')
        setUpdateProgress(p.percent)
        setUpdateResumePercent(p.percent)
      } else if (p.stage === 'installing') {
        setUpdateStatus('installing')
        setUpdateProgress(100)
        setUpdateResumePercent(100)
      } else if (p.stage === 'cancelled') {
        setUpdateStatus('available')
        setUpdateProgress(p.percent)
        setUpdateResumePercent(p.percent)
      } else if (p.stage === 'error') {
        setUpdateStatus('error')
      }
    })
    return () => { unsub1(); unsub2() }
  }, [])

  useEffect(() => {
    if (checkedRef.current) return
    checkedRef.current = true
    setUpdateStatus('checking')
    window.electronAPI.checkUpdate().then((res) => {
      setCurrentVersion(res.currentVersion)
      if (res.hasUpdate && res.version) {
        setUpdateVersion(res.version)
        setUpdateStatus((prev) => (prev === 'downloading' || prev === 'installing') ? prev : 'available')
      } else {
        setUpdateResumePercent(0)
        setUpdateStatus((prev) => (prev === 'downloading' || prev === 'installing') ? prev : 'up-to-date')
      }
    }).catch(() => {
      setUpdateStatus((prev) => (prev === 'downloading' || prev === 'installing') ? prev : 'error')
    })
  }, [])

  const handleCheckUpdate = useCallback(() => {
    setUpdateStatus('checking')
    window.electronAPI.checkUpdate().then((res) => {
      setCurrentVersion(res.currentVersion)
      if (res.hasUpdate && res.version) {
        setUpdateVersion(res.version)
        setUpdateStatus('available')
      } else {
        setUpdateResumePercent(0)
        setUpdateStatus('up-to-date')
      }
    }).catch(() => setUpdateStatus('error'))
  }, [])

  const handleStartUpdate = useCallback(() => {
    if (!updateInfo) return
    setUpdateStatus('downloading')
    setUpdateProgress(updateResumePercent > 0 ? updateResumePercent : 0)
    window.electronAPI.triggerUpdate(updateInfo.downloadUrl, updateInfo.assetName)
  }, [updateInfo, updateResumePercent])

  const handleCancelUpdate = useCallback(() => {
    window.electronAPI.cancelUpdate()
  }, [])

  const [server, setServer] = useState(settings.webdav?.server || 'https://dav.jianguoyun.com/dav/')
  const [username, setUsername] = useState(settings.webdav?.username || '')
  const [password, setPassword] = useState(settings.webdav?.password || '')
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [connected, setConnected] = useState(!!settings.webdav?.server)
  const [syncResolveLoading, setSyncResolveLoading] = useState<WebDAVSyncResolution | null>(null)

  // GitHub state
  const [ghRepo, setGhRepo] = useState(settings.github?.repo || '')
  const [ghBranch, setGhBranch] = useState(settings.github?.branch || 'main')
  const [ghToken, setGhToken] = useState('')
  const [ghConnected, setGhConnected] = useState(false)
  const [ghAccount, setGhAccount] = useState<string | null>(null)
  const [ghTest, setGhTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    window.electronAPI.githubHasToken().then((r) => {
      setGhConnected(r.has)
      if (r.has) window.electronAPI.githubAccount().then((a) => setGhAccount(a.login))
    })
  }, [])

  const formatSyncSummary = useCallback((summary: WebDAVSyncSummary) => {
    return `${summary.canvasCount} 个画布 / ${summary.cardCount} 张卡片 / ${summary.labelCount} 个标题 / ${summary.sectionCount} 个分区 / ${summary.connectionCount} 条连线 / ${summary.textCount} 个文本框`
  }, [])

  // 当前真实生效的 provider（来自已保存的 settings）
  const syncProvider = getEffectiveProvider(settings)
  // 当前查看的标签页（本地状态，与真实生效 provider 分离）：
  // 点 WebDAV/GitHub 标签只切换面板，不改生效 provider；只有保存/连接成功才真正切换。
  const [activeTab, setActiveTab] = useState(syncProvider)

  const markSyncSuccess = useCallback(() => {
    useStore.getState().setSyncStatus('success')
    setTimeout(() => {
      if (useStore.getState().syncStatus === 'success') {
        useStore.getState().setSyncStatus('idle')
      }
    }, 3000)
  }, [])

  const applySyncResult = useCallback(async (syncRes: WebDAVSyncResult) => {
    const store = useStore.getState()
    if (!syncRes.success) {
      store.setSyncStatus('error', syncRes.error)
      return
    }

    if (syncRes.action === 'needs-confirmation' && syncRes.decision) {
      store.setSyncDecision(syncRes.decision)
      store.setSyncStatus('warning')
      return
    }

    store.setSyncDecision(null)

    if (syncRes.action === 'downloaded' && syncRes.data) {
      await store.loadData()
      store.refreshImageCache()
    }

    if (syncRes.action === 'uploaded' || syncRes.action === 'downloaded') {
      markSyncSuccess()
      return
    }

    store.setSyncStatus('idle')
  }, [markSyncSuccess])

  const handleGithubSave = useCallback(async () => {
    if (!ghRepo.trim() || !ghToken.trim()) return
    setGhTest('testing')
    const res = await window.electronAPI.githubTest({ repo: ghRepo.trim(), token: ghToken.trim(), branch: ghBranch.trim() || 'main' })
    if (!res.success) { setGhTest('fail'); setTimeout(() => setGhTest('idle'), 3000); return }
    setGhTest('ok')
    await window.electronAPI.githubSaveToken(ghToken.trim())
    const s = { ...useStore.getState().settings, github: { repo: ghRepo.trim(), branch: ghBranch.trim() || 'main' } }
    await useStore.getState().saveSettings(s)
    useStore.getState().setSyncProvider('github')
    setGhConnected(true); setGhToken(''); setGhTest('idle')
    window.electronAPI.githubAccount().then((a) => setGhAccount(a.login))
    useStore.getState().setSyncStatus('syncing')
    window.electronAPI.syncAuto().then((r) => applySyncResult(r)).catch(() => useStore.getState().setSyncStatus('error', '同步失败'))
  }, [applySyncResult, ghRepo, ghBranch, ghToken])

  const handleGithubDisconnect = useCallback(async () => {
    await window.electronAPI.githubClearToken()
    useStore.getState().setSyncProvider('none')
    setGhConnected(false); setGhAccount(null)
  }, [])

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
    const res = await window.electronAPI.syncTest(config)
    setTestResult(res.success ? 'ok' : 'fail')
    setTimeout(() => setTestResult('idle'), 3000)
  }, [server, username, password])

  const handleSave = useCallback(async () => {
    if (!server || !username || !password) return
    const config: WebDAVConfig = { server, username, password }
    const res = await window.electronAPI.syncTest(config)
    if (res.success) {
      setWebDAVConfig(config)
      useStore.getState().saveSettings({ ...useStore.getState().settings, webdav: config, syncProvider: 'webdav' })
      setConnected(true)
      setTestResult('ok')
      setTimeout(() => setTestResult('idle'), 2000)
      useStore.getState().setSyncStatus('syncing')
      window.electronAPI.syncAuto().then(async (syncRes) => {
        await applySyncResult(syncRes)
      }).catch(() => useStore.getState().setSyncStatus('error'))
    } else {
      setTestResult('fail')
      setTimeout(() => setTestResult('idle'), 3000)
    }
  }, [applySyncResult, server, username, password, setWebDAVConfig])

  const handleManualSync = useCallback(async () => {
    if (getEffectiveProvider(settings) === 'none') return
    const store = useStore.getState()
    store.setSyncStatus('syncing')
    try {
      await window.electronAPI.writeData({
        canvases: store.canvases,
        activeCanvasId: store.activeCanvasId,
      })
      const res = await window.electronAPI.syncStartup()
      await applySyncResult(res)
    } catch {
      store.setSyncStatus('error')
    }
  }, [applySyncResult, settings])

  const handleResolveSync = useCallback(async (resolution: WebDAVSyncResolution) => {
    if (getEffectiveProvider(settings) === 'none') return
    if (resolution === 'use-remote' && syncDecision?.risk === 'high') {
      const confirmed = window.confirm(
        `这是高危覆盖操作。\n\n本地：${formatSyncSummary(syncDecision.localSummary)}\n云端：${formatSyncSummary(syncDecision.remoteSummary)}\n\n继续后，当前本地大量数据会被云端覆盖。确定继续吗？`,
      )
      if (!confirmed) return
    }

    setSyncResolveLoading(resolution)
    useStore.getState().setSyncStatus('syncing')
    try {
      const res = await window.electronAPI.syncResolveConflict(resolution)
      await applySyncResult(res)
    } catch {
      useStore.getState().setSyncStatus('error')
    } finally {
      setSyncResolveLoading(null)
    }
  }, [applySyncResult, formatSyncSummary, settings, syncDecision])

  const handleDisconnect = useCallback(() => {
    setWebDAVConfig(undefined)
    useStore.getState().setSyncProvider('none')
    setSyncDecision(null)
    useStore.getState().setSyncStatus('idle')
    setConnected(false)
    setUsername('')
    setPassword('')
    setTestResult('idle')
  }, [setSyncDecision, setWebDAVConfig])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setShowSettings(false)
  }

  const syncLabel = syncStatus === 'syncing'
    ? '同步中...'
    : syncStatus === 'warning'
    ? '待确认同步策略'
    : syncStatus === 'success'
    ? '已同步'
    : syncStatus === 'error'
    ? '同步失败'
    : (connected || ghConnected) ? '已连接' : '未连接'

  const syncDotClass = syncStatus === 'syncing'
    ? 'syncing'
    : syncStatus === 'warning'
    ? 'warning'
    : syncStatus === 'error'
    ? 'error'
    : (connected || ghConnected) ? 'connected' : ''

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
          <h3>键盘快捷键</h3>
          <div className="shortcut-list">
            {SHORTCUTS.map((s) => (
              <div className="shortcut-row" key={s.id}>
                <span className="shortcut-label">{s.label}</span>
                <span className="shortcut-key">{scKey(s.id)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>软件更新</h3>
          <div className="update-section">
            <div className="update-version-row">
              <span className="update-current">当前版本：v{currentVersion || '...'}</span>
              {updateVersion && updateStatus !== 'up-to-date' && (
                <span className="update-new-badge">v{updateVersion} 可用</span>
              )}
            </div>

            {(updateStatus === 'downloading' || updateStatus === 'installing') && (
              <div className="update-settings-progress">
                <div className="update-progress-bar">
                  <div className="update-progress-fill" style={{ width: `${updateProgress}%` }} />
                </div>
                <span className="update-progress-label">
                  {updateStatus === 'installing' ? '安装中...' : `下载中 ${updateProgress}%`}
                </span>
              </div>
            )}

            <div className="update-settings-actions">
              <button
                onClick={handleCheckUpdate}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing'}
              >
                {updateStatus === 'checking' ? '检查中...' : updateStatus === 'up-to-date' ? '已是最新版本' : '检查更新'}
              </button>
              {updateStatus === 'available' && updateInfo && (
                <button className="primary" onClick={handleStartUpdate}>
                  {updateResumePercent > 0 && updateResumePercent < 100
                    ? `继续更新（${updateResumePercent}%）`
                    : `更新到 v${updateVersion}`}
                </button>
              )}
              {updateStatus === 'downloading' && (
                <button onClick={handleCancelUpdate}>
                  停止更新
                </button>
              )}
              {updateStatus === 'error' && (
                <span className="update-error-hint">检查更新失败，请稍后再试</span>
              )}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>云同步</h3>
          <div className="provider-switcher">
            <button
              className={`provider-option ${activeTab === 'webdav' ? 'active' : ''}`}
              onClick={() => setActiveTab('webdav')}
            >
              坚果云 WebDAV{syncProvider === 'webdav' ? ' ✓' : ''}
            </button>
            <button
              className={`provider-option ${activeTab === 'github' ? 'active' : ''}`}
              onClick={() => setActiveTab('github')}
            >
              GitHub{syncProvider === 'github' ? ' ✓' : ''}
            </button>
            <button
              className={`provider-option ${activeTab === 'none' ? 'active' : ''}`}
              onClick={() => { setActiveTab('none'); useStore.getState().setSyncProvider('none') }}
            >
              关闭{syncProvider === 'none' ? ' ✓' : ''}
            </button>
          </div>

          {activeTab === 'github' && (
            <div className="github-panel">
              {ghConnected ? (
                <>
                  <div className="onedrive-account">已连接：{ghAccount || 'GitHub'} · {settings.github?.repo}</div>
                  <div className="webdav-actions">
                    <button onClick={handleManualSync} disabled={syncStatus === 'syncing' || !!syncDecision}>同步</button>
                    <button onClick={handleGithubDisconnect}>断开</button>
                  </div>
                  <div className="data-hint">提交历史可在 GitHub 仓库网页查看。</div>
                </>
              ) : (
                <>
                  <div className="webdav-field"><label>仓库 (owner/repo)</label>
                    <input value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} placeholder="yourname/float-anchor-data" /></div>
                  <div className="webdav-field"><label>分支</label>
                    <input value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} placeholder="main" /></div>
                  <div className="webdav-field"><label>访问令牌 (PAT)</label>
                    <input type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="fine-grained PAT, Contents 读写" /></div>
                  <div className="webdav-actions">
                    <button className="primary" onClick={handleGithubSave} disabled={ghTest === 'testing'}>
                      {ghTest === 'testing' ? '连接中...' : ghTest === 'fail' ? '连接失败' : '连接并保存'}
                    </button>
                  </div>
                  <div className="data-hint">在 GitHub → Settings → Developer settings → Fine-grained tokens 生成，仅授予该仓库 Contents 读写。</div>
                </>
              )}
            </div>
          )}

          {activeTab === 'webdav' && (
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
                    <button onClick={handleManualSync} disabled={syncStatus === 'syncing' || !!syncDecision || !!syncResolveLoading}>
                      {syncStatus === 'syncing' ? '同步中...' : syncDecision ? '待确认' : '同步'}
                    </button>
                    <button onClick={handleDisconnect}>断开</button>
                  </>
                )}
              </div>
            </div>
          )}

          {syncProvider !== 'none' && (
            <>
              <div className="sync-status">
                <span className={`sync-dot ${syncDotClass}`} />
                <span>{syncLabel}</span>
              </div>
              {syncDecision && (
                <div className={`sync-decision-card ${syncDecision.risk === 'high' ? 'high-risk' : ''}`}>
                  <div className="sync-decision-title">
                    {syncDecision.risk === 'high' ? '检测到高危云端覆盖' : '检测到云端与本地数据不同步'}
                  </div>
                  <div className={`data-message ${syncDecision.risk === 'high' ? 'error' : 'success'}`}>
                    {syncDecision.message}
                  </div>
                  <div className="sync-decision-summary">
                    <div className="sync-decision-row">
                      <span className="sync-decision-label">本地</span>
                      <span>{formatSyncSummary(syncDecision.localSummary)}</span>
                    </div>
                    <div className="sync-decision-row">
                      <span className="sync-decision-label">云端</span>
                      <span>{formatSyncSummary(syncDecision.remoteSummary)}</span>
                    </div>
                  </div>
                  <div className="sync-decision-note">
                    当前仍以本地数据为准展示，自动同步已暂停，等你确认后再继续。
                  </div>
                  <div className="sync-decision-actions">
                    <button
                      className="primary"
                      onClick={() => handleResolveSync('keep-local')}
                      disabled={!!syncResolveLoading}
                    >
                      {syncResolveLoading === 'keep-local' ? '上传中...' : '保留本地并上传云端'}
                    </button>
                    <button
                      className={syncDecision.risk === 'high' ? 'danger' : ''}
                      onClick={() => handleResolveSync('use-remote')}
                      disabled={!!syncResolveLoading}
                    >
                      {syncResolveLoading === 'use-remote' ? '覆盖中...' : '使用云端覆盖本地'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="settings-section">
          <h3>数据管理</h3>
          <div className="data-management">
            <div className="data-management-row">
              <div className="data-management-item">
                <button
                  className="data-btn export-btn"
                  onClick={handleExport}
                  disabled={backupStatus === 'exporting'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {backupStatus === 'exporting' ? '导出中...' : '导出备份'}
                </button>
                <span className="data-hint">将所有数据导出为压缩包备份</span>
              </div>
              <div className="data-management-item">
                <button
                  className="data-btn import-btn"
                  onClick={handleImport}
                  disabled={importStatus === 'importing'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {importStatus === 'importing' ? '导入中...' : '导入备份'}
                </button>
                <span className="data-hint">从备份文件恢复数据</span>
              </div>
            </div>
            {backupMessage && (
              <div className={`data-message ${backupStatus === 'error' ? 'error' : 'success'}`}>
                {backupMessage}
              </div>
            )}
            {importMessage && (
              <div className={`data-message ${importStatus === 'error' ? 'error' : 'success'}`}>
                {importMessage}
              </div>
            )}
            <div className="data-management-item">
              <button className="data-btn" onClick={handleMigrateImages} disabled={migrateStatus === 'running'}>
                {migrateStatus === 'running' ? '提取中...' : '提取内嵌图片为文件'}
              </button>
              <span className="data-hint">把笔记里 base64 内嵌的图片抽成本地文件，显著减小数据体积</span>
            </div>
            {migrateMessage && (
              <div className={`data-message ${migrateStatus === 'error' ? 'error' : 'success'}`}>{migrateMessage}</div>
            )}
            <div className="data-management-danger">
              <button
                className="data-btn danger-btn"
                onClick={handleClearClick}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                清空所有数据
              </button>
              <span className="data-hint danger-hint">此操作不可恢复，请谨慎操作</span>
            </div>
          </div>
        </div>

        {showClearConfirm && (
          <div className="clear-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowClearConfirm(false); setClearStatus('idle'); setClearMessage(''); setClearInput('') } }}>
            <div className="clear-confirm-modal">
              <h3>清空所有数据</h3>
              {clearStatus === 'preparing' ? (
                <div className="clear-info">
                  正在检查最近备份，如 1 天内没有备份会先自动创建新备份...
                </div>
              ) : clearStatus === 'no-backup' ? (
                <div className="clear-warning">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{clearMessage}</span>
                </div>
              ) : (
                <>
                  <p className="clear-desc">此操作将永久删除所有画布、卡片、标题、分区和连线数据。请输入以下文字确认：</p>
                  {clearMessage && (
                    <div className="data-message success">
                      {clearMessage}
                    </div>
                  )}
                  <p className="clear-confirm-text">{CLEAR_CONFIRM_TEXT}</p>
                  <input
                    className="clear-input"
                    value={clearInput}
                    onChange={(e) => setClearInput(e.target.value)}
                    placeholder="请输入上方文字以确认"
                    disabled={clearStatus === 'clearing' || clearStatus === 'done'}
                  />
                  <div className="clear-confirm-actions">
                    <button onClick={() => { setShowClearConfirm(false); setClearStatus('idle'); setClearMessage(''); setClearInput('') }}>
                      取消
                    </button>
                    <button
                      className="danger-btn"
                      disabled={clearInput !== CLEAR_CONFIRM_TEXT || clearStatus === 'clearing' || clearStatus === 'done'}
                      onClick={handleClearConfirm}
                    >
                      {clearStatus === 'clearing' ? '清空中...' : clearStatus === 'done' ? '已清空' : '确认清空'}
                    </button>
                  </div>
                </>
              )}
              {(clearStatus === 'no-backup' || clearStatus === 'preparing') && (
                <div className="clear-confirm-actions">
                  <button onClick={() => { setShowClearConfirm(false); setClearStatus('idle'); setClearMessage('') }}>
                    {clearStatus === 'preparing' ? '关闭' : '我知道了'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="settings-footer">
          <button onClick={() => setShowSettings(false)}>关闭</button>
        </div>
      </div>
    </div>
  )
}
