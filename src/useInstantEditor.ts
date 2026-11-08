import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import type { InstantCardSave, InstantModeTarget } from './types'
import { findInstantNote, INSTANT_DRAFT_KEY, INSTANT_TITLE_KEY, INSTANT_RECOVERY_KEY, readRecentInstantNotes, RECENT_INSTANT_KEY, rememberInstantNote } from './lib/instantNotes'

type Session = { cardId: string | null; title: string; content: string; baseTitle: string; baseContent: string }
const newDraft = (): Session => ({ cardId: null, title: localStorage.getItem(INSTANT_TITLE_KEY) ?? '', content: localStorage.getItem(INSTANT_DRAFT_KEY) ?? '', baseTitle: '', baseContent: '' })
function recoveries(): Record<string, Session> {
  try {
    const data = JSON.parse(localStorage.getItem(INSTANT_RECOVERY_KEY) ?? '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).filter(([id, value]) => {
      const s = value as Session
      return s?.cardId === id && ['title', 'content', 'baseTitle', 'baseContent'].every((key) => typeof (s as any)[key] === 'string')
    })) as Record<string, Session>
  } catch { return {} }
}
function retain(session: Session) {
  if (!session.cardId) {
    localStorage.setItem(INSTANT_TITLE_KEY, session.title)
    localStorage.setItem(INSTANT_DRAFT_KEY, session.content)
  } else {
    const all = recoveries()
    if (session.title === session.baseTitle && session.content === session.baseContent) delete all[session.cardId]
    else all[session.cardId] = session
    localStorage.setItem(INSTANT_RECOVERY_KEY, JSON.stringify(all))
  }
}

export function useInstantEditor(loaded: boolean) {
  const [session, setSession] = useState<Session>(newDraft)
  const current = useRef(session)
  const [recent, setRecent] = useState(() => readRecentInstantNotes(localStorage))
  const [editorKey, setEditorKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [error, setError] = useState('')
  const saving = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const switching = useRef(false)
  const transitions = useRef<Promise<unknown>>(Promise.resolve())
  const requestId = useRef(0)
  const mounted = useRef(true)

  const save = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current)
    if (saving.current) {
      if (!await saving.current) return false
    }
    const snapshot = current.current
    if (!snapshot.cardId || (snapshot.title === snapshot.baseTitle && snapshot.content === snapshot.baseContent)) return true
    const work = (async () => {
      setStatus('saving')
      try {
        const result = await window.electronAPI.saveInstantCard(snapshot as InstantCardSave)
        if (!result.success) { setError(result.error); setStatus('error'); return false }
        const next = { ...current.current, baseTitle: snapshot.title, baseContent: snapshot.content }
        current.current = next
        retain(next)
        if (mounted.current) {
          setSession(next)
          setError('')
          setStatus(next.title === snapshot.title && next.content === snapshot.content ? 'saved' : 'unsaved')
        }
        // Keep this renderer's read model current without scheduling a whole-snapshot save.
        useStore.setState((state) => ({ canvases: state.canvases.map((canvas) => ({
          ...canvas, cards: canvas.cards.map((card) => card.id === snapshot.cardId ? result.card : card),
        })) }))
        return true
      } catch {
        setError('保存失败，内容已保留，请重试。'); setStatus('error'); return false
      }
    })()
    saving.current = work
    try { return await work } finally { if (saving.current === work) saving.current = null }
  }, [])

  const flush = useCallback(async () => {
    if (!await save()) return false
    // Input may have advanced while the previous write was in flight.
    return save()
  }, [save])

  const remember = useCallback((cardId: string) => {
    const items = rememberInstantNote(readRecentInstantNotes(localStorage), cardId)
    localStorage.setItem(RECENT_INSTANT_KEY, JSON.stringify(items))
    setRecent(items)
  }, [])

  const replace = useCallback((next: Session) => {
    current.current = next
    setSession(next)
    setEditorKey((key) => key + 1)
    setError('')
    setStatus('saved')
  }, [])

  const runTransition = useCallback((work: () => Promise<boolean>) => {
    const queued = transitions.current.then(async () => {
      switching.current = true; setBusy(true)
      try { return await work() }
      catch { setError('未能切换笔记，当前内容已保留，请重试。'); return false }
      finally { switching.current = false; setBusy(false) }
    })
    transitions.current = queued.catch(() => {})
    return queued
  }, [])

  const openCard = useCallback((cardId: string) => runTransition(async () => {
      if (!await flush()) return false
      await useStore.getState().loadData()
      const found = findInstantNote(useStore.getState(), cardId)
      const recovery = recoveries()[cardId]
      if (!found) {
        if (recovery) replace(recovery)
        setError('原笔记已被删除，未保存的内容已保留，可另存为新笔记。'); setStatus('error')
        return false
      }
      replace(recovery ?? { cardId, title: found.card.title, content: found.card.content, baseTitle: found.card.title, baseContent: found.card.content })
      await window.electronAPI.setInstantEditingCard(cardId)
      remember(cardId)
      if (recovery) {
        setStatus('unsaved')
        if (recovery.baseTitle !== found.card.title || recovery.baseContent !== found.card.content) {
          setError('已恢复未完成的编辑；原笔记也有新修改，请另存为新笔记以保留两份内容。'); setStatus('error')
        } else timer.current = setTimeout(() => void save(), 600)
      }
      return true
  }), [flush, remember, replace, runTransition, save])

  const startNew = useCallback(() => runTransition(async () => {
      if (!await flush()) return false
      await window.electronAPI.setInstantEditingCard(null)
      await useStore.getState().loadData()
      replace(newDraft())
      return true
  }), [flush, replace, runTransition])

  const change = useCallback((patch: Partial<Pick<Session, 'title' | 'content'>>) => {
    if (switching.current) return
    const next = { ...current.current, ...patch }
    current.current = next; setSession(next)
    try { retain(next) } catch { setError('草稿暂存失败，请勿关闭窗口，并重试保存。') }
    if (next.cardId) {
      setStatus('unsaved')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), 600)
    }
  }, [save])

  const finishNew = useCallback((cardId: string) => {
    remember(cardId)
    const blank = { cardId: null, title: '', content: '', baseTitle: '', baseContent: '' }
    retain(blank); replace(blank)
  }, [remember, replace])

  const completeRecovery = useCallback(async (newCardId: string) => {
    clearTimeout(timer.current)
    const all = recoveries()
    if (current.current.cardId) delete all[current.current.cardId]
    localStorage.setItem(INSTANT_RECOVERY_KEY, JSON.stringify(all))
    await window.electronAPI.setInstantEditingCard(null)
    remember(newCardId)
    replace(newDraft())
  }, [remember, replace])

  const leave = useCallback((showCard = false) => runTransition(async () => {
      if (!await flush()) return false
      if (showCard && current.current.cardId) await window.electronAPI.showCardInBoard(current.current.cardId)
      else window.electronAPI.closeInstantMode()
      return true
  }), [flush, runTransition])

  useEffect(() => {
    if (!loaded) return
    let live = true
    const handle = async (target: InstantModeTarget | null) => {
      if (!live || !target || target.requestId <= requestId.current) return
      requestId.current = target.requestId
      if (target.cardId) await openCard(target.cardId)
      else {
        const recovery = Object.values(recoveries()).slice(-1)[0]
        if (recovery?.cardId) await openCard(recovery.cardId)
      }
    }
    const off = window.electronAPI.onInstantTarget((target) => void handle(target))
    void window.electronAPI.getInstantTarget().then(handle)
    return () => { live = false; off() }
  }, [loaded, openCard])

  useEffect(() => window.electronAPI.onBeforeClose?.(async () => {
    document.body.inert = true
    if (!await flush()) throw new Error('本地保存失败')
    await useStore.getState().flushPendingSave()
  }), [flush])

  useEffect(() => window.electronAPI.onInstantCloseRequested(() => void leave()), [leave])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(timer.current) }
  }, [])

  return { ...session, recent, editorKey, busy, status, error, setError, change, openCard, startNew, finishNew, completeRecovery, remember, leave, flush, recoveries }
}
