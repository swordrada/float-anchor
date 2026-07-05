import { create } from 'zustand'
import { shallow } from 'zustand/shallow'
import { v4 as uuid } from 'uuid'
import type { Canvas, Card, CanvasLabel, Section, Connection, CanvasViewport, AppSettings, WebDAVConfig, WebDAVSyncDecision, TextBox, SyncProvider } from './types'

export function getEffectiveProvider(settings: AppSettings): SyncProvider {
  return settings.syncProvider ?? (settings.webdav?.server ? 'webdav' : 'none')
}

interface SnapRect { x: number; y: number; width: number; height: number }

// 判断卡片 cd 是否真正"贴靠"在 member 旁边：在一个轴方向上贴合（边缘吻合或相隔一个 GAP），
// 且在另一个轴方向上有实际重叠。仅单轴边缘吻合（如只有 x 对齐、y 却相距很远）不算贴靠——
// 否则磁吸把卡片吸到远处分区成员的同列/同行坐标后，那个远分区会误判并拉伸过来框住卡片。
export function isCardSnappedAdjacent(cd: SnapRect, member: SnapRect, gap: number, tol = 1): boolean {
  const cR = cd.x + cd.width, cB = cd.y + cd.height
  const mR = member.x + member.width, mB = member.y + member.height
  const overlapsX = Math.min(cR, mR) - Math.max(cd.x, member.x) > tol
  const overlapsY = Math.min(cB, mB) - Math.max(cd.y, member.y) > tol
  const touchH =
    Math.abs(cd.x - (mR + gap)) < tol ||
    Math.abs(cR - (member.x - gap)) < tol ||
    Math.abs(cd.x - member.x) < tol ||
    Math.abs(cR - mR) < tol
  const touchV =
    Math.abs(cd.y - member.y) < tol ||
    Math.abs(cB - mB) < tol ||
    Math.abs(cd.y - (mB + gap)) < tol ||
    Math.abs(cB - (member.y - gap)) < tol
  return (touchH && overlapsY) || (touchV && overlapsX)
}

interface AppState {
  canvases: Canvas[]
  activeCanvasId: string | null
  editingCardId: string | null
  editingTextId: string | null
  highlightCardId: string | null
  loaded: boolean
  settings: AppSettings
  syncStatus: 'idle' | 'pending' | 'syncing' | 'success' | 'error' | 'warning'
  syncError: string | null
  syncDecision: WebDAVSyncDecision | null
  imageCacheVersion: number
  showSettings: boolean

  loadData: () => Promise<void>
  persist: () => void
  loadSettings: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>
  setTheme: (theme: 'light' | 'dark') => void
  setWebDAVConfig: (config: WebDAVConfig | undefined) => void
  setSyncProvider: (p: SyncProvider) => void
  setShowSettings: (v: boolean) => void
  setSyncStatus: (s: 'idle' | 'pending' | 'syncing' | 'success' | 'error' | 'warning', error?: string | null) => void
  setSyncDecision: (decision: WebDAVSyncDecision | null) => void
  refreshImageCache: () => void
  flushPendingSave: () => Promise<void>

  addCanvas: (name: string) => void
  deleteCanvas: (id: string) => void
  renameCanvas: (id: string, name: string) => void
  setActiveCanvas: (id: string) => void

  addCard: (x: number, y: number) => void
  updateCard: (cardId: string, patch: Partial<Card>) => void
  deleteCard: (cardId: string) => void
  moveCard: (cardId: string, x: number, y: number) => void
  setEditingCard: (cardId: string | null) => void
  moveCardToCanvas: (cardId: string, targetCanvasId: string) => void
  setHighlightCard: (cardId: string | null) => void
  addText: (x: number, y: number) => void
  updateText: (textId: string, patch: Partial<TextBox>) => void
  deleteText: (textId: string) => void
  moveText: (textId: string, x: number, y: number) => void
  setEditingText: (textId: string | null) => void

  addLabel: (x: number, y: number) => void
  updateLabel: (labelId: string, patch: Partial<CanvasLabel>) => void
  deleteLabel: (labelId: string) => void
  moveLabel: (labelId: string, x: number, y: number) => void

  addSection: (x: number, y: number) => void
  updateSection: (sectionId: string, patch: Partial<Section>) => void
  deleteSection: (sectionId: string) => void
  moveSection: (sectionId: string, dx: number, dy: number) => void
  autoFitSection: (sectionId: string) => void
  compactSection: (sectionId: string) => void
  arrangeUnits: (ids: { cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] }) => void
  deleteUnits: (ids: { cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] }) => void
  nudgeUnits: (ids: { cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] }, dx: number, dy: number) => void

  finalizeCardMove: (cardId: string) => void

  addConnection: (fromCardId: string, toCardId: string) => void
  deleteConnection: (connId: string) => void

  saveViewport: (canvasId: string, viewport: CanvasViewport) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let syncTimer: ReturnType<typeof setTimeout> | undefined
let lastRemoteUploadAt = 0

const SECTION_COLORS = ['#9ca3af', '#60a5fa', '#34d399', '#fb923c', '#f472b6']
const LOCAL_WEBDAV_SYNC_DELAY_MS = 2000
const MIN_REMOTE_UPLOAD_INTERVAL_MS = 30000

export const useStore = create<AppState>((set, get) => ({
  canvases: [],
  activeCanvasId: null,
  editingCardId: null,
  editingTextId: null,
  highlightCardId: null,
  loaded: false,
  settings: { theme: 'light' },
  syncStatus: 'idle',
  syncError: null,
  syncDecision: null,
  imageCacheVersion: 0,
  showSettings: false,

  loadData: async () => {
    try {
      const data = await window.electronAPI.readData()
      if (data && data.canvases.length > 0) {
        let needsPersist = false
        const cleaned = data.canvases.map((canvas) => {
          const sections = canvas.sections
          if (!sections || sections.length < 2) return canvas
          const claimed = new Set<string>()
          const fixed = sections.map((sec) => {
            const ids = sec.cardIds ?? []
            const deduped = ids.filter((id) => {
              if (claimed.has(id)) { needsPersist = true; return false }
              claimed.add(id)
              return true
            })
            return deduped.length !== ids.length ? { ...sec, cardIds: deduped } : sec
          })
          return { ...canvas, sections: fixed }
        })
        set({
          canvases: cleaned,
          activeCanvasId: data.activeCanvasId ?? cleaned[0].id,
          loaded: true,
        })
        if (needsPersist) get().persist()
        return
      }
    } catch { /* ignore */ }

    const first: Canvas = { id: uuid(), name: '默认画布', cards: [] }
    set({ canvases: [first], activeCanvasId: first.id, loaded: true })
    get().persist()
  },

  persist: () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const { canvases, activeCanvasId, settings, syncDecision } = get()
      void window.electronAPI.writeData({ canvases, activeCanvasId }).then((saved) => {
        if (!saved) return
        if (getEffectiveProvider(settings) !== 'none' && !syncDecision) {
          set({ syncStatus: 'pending', syncError: null })
          clearTimeout(syncTimer)
          const sinceLast = Date.now() - lastRemoteUploadAt
          const delay = Math.max(LOCAL_WEBDAV_SYNC_DELAY_MS, MIN_REMOTE_UPLOAD_INTERVAL_MS - sinceLast)
          syncTimer = setTimeout(() => {
            set({ syncStatus: 'syncing', syncError: null })
            window.electronAPI.syncAuto().then(async (res) => {
              if (!res.success) {
                // 失败时不更新 lastRemoteUploadAt，使下次编辑可较快重试（delay 退化为 2s）
                set({ syncStatus: 'error', syncError: res.error ?? '同步失败' })
                return
              }
              if (res.action === 'needs-confirmation' && res.decision) {
                set({
                  syncStatus: 'warning',
                  syncDecision: res.decision,
                  showSettings: true,
                })
                return
              }
              if (res.action === 'downloaded' && res.data) {
                await get().loadData()
                get().refreshImageCache()
              }
              if (res.action === 'uploaded' || res.action === 'downloaded' || res.action === 'up-to-date') {
                // 仅成功路径才更新节流时间戳
                lastRemoteUploadAt = Date.now()
                if (res.action !== 'up-to-date') {
                  set({ syncStatus: 'success', syncDecision: null })
                  setTimeout(() => {
                    if (get().syncStatus === 'success') set({ syncStatus: 'idle' })
                  }, 3000)
                } else {
                  set({ syncStatus: 'idle', syncDecision: null })
                }
                return
              }
              set({ syncStatus: 'idle', syncDecision: null })
            }).catch(() => set({ syncStatus: 'error', syncError: '同步失败' }))
          }, delay)
        }
      })
    }, 600)
  },

  loadSettings: async () => {
    try {
      const s = await window.electronAPI.readSettings()
      if (s) {
        set({ settings: s })
        document.documentElement.dataset.theme = s.theme
      }
    } catch { /* ignore */ }
  },

  saveSettings: async (s) => {
    set({ settings: s })
    document.documentElement.dataset.theme = s.theme
    await window.electronAPI.writeSettings(s)
  },

  setTheme: (theme) => {
    const s = { ...get().settings, theme }
    get().saveSettings(s)
  },

  setWebDAVConfig: (config) => {
    const s = { ...get().settings, webdav: config }
    get().saveSettings(s)
  },

  setSyncProvider: (p) => {
    const s = { ...get().settings, syncProvider: p }
    get().saveSettings(s)
  },

  setShowSettings: (v) => set({ showSettings: v }),

  setSyncStatus: (s, error = null) => set({ syncStatus: s, syncError: s === 'error' ? (error ?? '同步失败') : null }),

  setSyncDecision: (decision) => set({ syncDecision: decision }),

  refreshImageCache: () => set((s) => ({ imageCacheVersion: s.imageCacheVersion + 1 })),

  flushPendingSave: async () => {
    clearTimeout(saveTimer)
    const { canvases, activeCanvasId } = get()
    await window.electronAPI.writeData({ canvases, activeCanvasId })
  },

  addCanvas: (name) => {
    const canvas: Canvas = { id: uuid(), name, cards: [] }
    set((s) => ({
      canvases: [...s.canvases, canvas],
      activeCanvasId: canvas.id,
    }))
    get().persist()
  },

  deleteCanvas: (id) => {
    set((s) => {
      const next = s.canvases.filter((c) => c.id !== id)
      return {
        canvases: next,
        activeCanvasId:
          s.activeCanvasId === id
            ? next.length > 0
              ? next[0].id
              : null
            : s.activeCanvasId,
        editingCardId:
          s.activeCanvasId === id ? null : s.editingCardId,
      }
    })
    get().persist()
  },

  renameCanvas: (id, name) => {
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === id ? { ...c, name } : c,
      ),
    }))
    get().persist()
  },

  setActiveCanvas: (id) => {
    set({ activeCanvasId: id, editingCardId: null })
    get().persist()
  },

  addCard: (x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const card: Card = {
      id: uuid(),
      title: '新卡片',
      content: '',
      x,
      y,
      width: 373,
    }
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, cards: [...c.cards, card] }
          : c,
      ),
      editingCardId: card.id,
    }))
    get().persist()
  },

  updateCard: (cardId, patch) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              cards: c.cards.map((card) =>
                card.id === cardId ? { ...card, ...patch } : card,
              ),
            }
          : c,
      ),
    }))
    get().persist()
  },

  deleteCard: (cardId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              cards: c.cards.filter((card) => card.id !== cardId),
              connections: (c.connections ?? []).filter(
                (cn) => cn.fromCardId !== cardId && cn.toCardId !== cardId,
              ),
              sections: (c.sections ?? []).map((sec) => {
                const members = sec.cardIds ?? []
                return members.includes(cardId)
                  ? { ...sec, cardIds: members.filter((id) => id !== cardId) }
                  : sec
              }),
            }
          : c,
      ),
      editingCardId:
        s.editingCardId === cardId ? null : s.editingCardId,
    }))
    get().persist()
  },

  moveCard: (cardId, x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const self = canvas.cards.find((c) => c.id === cardId)
    if (!self) return

    const SNAP_DIST = 6
    const GAP = 12
    const selfW = self.width
    const selfH = self.height ?? 300

    let bestX = x
    let bestY = y
    let bestDx = SNAP_DIST
    let bestDy = SNAP_DIST

    for (const other of canvas.cards) {
      if (other.id === cardId) continue
      const ow = other.width
      const oh = other.height ?? 300

      let d: number

      d = Math.abs(x - (other.x + ow + GAP))
      if (d < bestDx) { bestDx = d; bestX = other.x + ow + GAP }
      d = Math.abs((x + selfW) - (other.x - GAP))
      if (d < bestDx) { bestDx = d; bestX = other.x - GAP - selfW }
      d = Math.abs(x - other.x)
      if (d < bestDx) { bestDx = d; bestX = other.x }
      d = Math.abs((x + selfW) - (other.x + ow))
      if (d < bestDx) { bestDx = d; bestX = other.x + ow - selfW }

      d = Math.abs(y - other.y)
      if (d < bestDy) { bestDy = d; bestY = other.y }
      d = Math.abs((y + selfH) - (other.y + oh))
      if (d < bestDy) { bestDy = d; bestY = other.y + oh - selfH }
      d = Math.abs(y - (other.y + oh + GAP))
      if (d < bestDy) { bestDy = d; bestY = other.y + oh + GAP }
      d = Math.abs((y + selfH) - (other.y - GAP))
      if (d < bestDy) { bestDy = d; bestY = other.y - GAP - selfH }
    }

    if (self.x === bestX && self.y === bestY) return

    const movedCard = { ...self, x: bestX, y: bestY }
    const sections = canvas.sections ?? []
    let updatedSections = sections

    if (sections.length > 0) {
      const isFullyInside = (card: Card, sec: Section) =>
        card.x >= sec.x && card.y >= sec.y + 32 &&
        card.x + card.width <= sec.x + sec.width &&
        card.y + (card.height ?? 200) <= sec.y + sec.height

      updatedSections = sections.map((sec) => {
        const members = sec.cardIds ?? []
        const inside = isFullyInside(movedCard, sec)
        const wasMember = members.includes(cardId)
        if (inside && !wasMember) {
          return { ...sec, cardIds: [...members, cardId] }
        }
        if (!inside && wasMember) {
          return { ...sec, cardIds: members.filter((id) => id !== cardId) }
        }
        return sec
      })

      const belongsTo = updatedSections.filter((sec) => (sec.cardIds ?? []).includes(cardId))
      if (belongsTo.length > 1) {
        let bestSection: Section | null = null
        let bestOverlap = -1
        const cw = movedCard.width
        const ch = movedCard.height ?? 200
        for (const sec of belongsTo) {
          const ox = Math.max(0, Math.min(movedCard.x + cw, sec.x + sec.width) - Math.max(movedCard.x, sec.x))
          const oy = Math.max(0, Math.min(movedCard.y + ch, sec.y + sec.height) - Math.max(movedCard.y, sec.y))
          const overlap = ox * oy
          if (overlap > bestOverlap) { bestOverlap = overlap; bestSection = sec }
        }
        updatedSections = updatedSections.map((sec) => {
          if (sec === bestSection) return sec
          const ids = sec.cardIds ?? []
          if (!ids.includes(cardId)) return sec
          return { ...sec, cardIds: ids.filter((id) => id !== cardId) }
        })
      }
    }

    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              cards: c.cards.map((card) =>
                card.id === cardId ? movedCard : card,
              ),
              sections: updatedSections,
            }
          : c,
      ),
    }))
    get().persist()
  },

  finalizeCardMove: (cardId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const card = canvas.cards.find((c) => c.id === cardId)
    if (!card) return
    const sections = canvas.sections ?? []
    if (sections.length === 0) return

    const GAP = 12
    const SECTION_PAD = 24
    const SECTION_HEADER = 36

    const isFullyInside = (cd: Card, sec: Section) =>
      cd.x >= sec.x && cd.y >= sec.y + 32 &&
      cd.x + cd.width <= sec.x + sec.width &&
      cd.y + (cd.height ?? 200) <= sec.y + sec.height

    const snappedToMemberOf = (cd: Card, sec: Section): boolean => {
      const members = sec.cardIds ?? []
      if (members.length === 0) return false
      const cdRect = { x: cd.x, y: cd.y, width: cd.width, height: cd.height ?? 300 }
      for (const mId of members) {
        if (mId === cd.id) continue
        const member = canvas.cards.find((c) => c.id === mId)
        if (!member) continue
        const mRect = { x: member.x, y: member.y, width: member.width, height: member.height ?? 300 }
        // 需一轴贴合 + 另一轴有重叠，避免远处分区因单轴对齐被误判贴靠并拉伸
        if (isCardSnappedAdjacent(cdRect, mRect, GAP)) return true
      }
      return false
    }

    const expandToFit = (sec: Section, memberIds: string[]): Section => {
      const allCards = canvas.cards.filter((c) => memberIds.includes(c.id))
      if (allCards.length === 0) return sec
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const ac of allCards) {
        minX = Math.min(minX, ac.x)
        minY = Math.min(minY, ac.y)
        maxX = Math.max(maxX, ac.x + ac.width)
        maxY = Math.max(maxY, ac.y + (ac.height ?? 200))
      }
      return {
        ...sec,
        cardIds: memberIds,
        x: Math.min(sec.x, minX - SECTION_PAD),
        y: Math.min(sec.y, minY - SECTION_PAD - SECTION_HEADER),
        width: Math.max(sec.width, maxX - Math.min(sec.x, minX - SECTION_PAD) + SECTION_PAD),
        height: Math.max(sec.height, maxY - Math.min(sec.y, minY - SECTION_PAD - SECTION_HEADER) + SECTION_PAD + SECTION_HEADER),
      }
    }

    let changed = false
    let removedFrom = false

    let result = sections.map((sec) => {
      const members = sec.cardIds ?? []
      const isMember = members.includes(cardId)

      if (isMember) {
        if (isFullyInside(card, sec)) return sec
        changed = true
        removedFrom = true
        return { ...sec, cardIds: members.filter((id) => id !== cardId) }
      }

      return sec
    })

    if (!removedFrom) {
      result = result.map((sec) => {
        if ((sec.cardIds ?? []).includes(cardId)) return sec
        if (!snappedToMemberOf(card, sec)) return sec
        changed = true
        return expandToFit(sec, [...(sec.cardIds ?? []), cardId])
      })
    }

    if (!changed) return

    const belongsTo = result.filter((sec) => (sec.cardIds ?? []).includes(cardId))
    let dedupedSections = result
    if (belongsTo.length > 1) {
      let bestSection: Section | null = null
      let bestOverlap = -1
      const cw = card.width; const ch = card.height ?? 200
      for (const sec of belongsTo) {
        const ox = Math.max(0, Math.min(card.x + cw, sec.x + sec.width) - Math.max(card.x, sec.x))
        const oy = Math.max(0, Math.min(card.y + ch, sec.y + sec.height) - Math.max(card.y, sec.y))
        if (ox * oy > bestOverlap) { bestOverlap = ox * oy; bestSection = sec }
      }
      dedupedSections = result.map((sec) => {
        if (sec === bestSection) return sec
        const ids = sec.cardIds ?? []
        if (!ids.includes(cardId)) return sec
        return { ...sec, cardIds: ids.filter((id) => id !== cardId) }
      })
    }

    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId ? { ...c, sections: dedupedSections } : c,
      ),
    }))
    get().persist()
  },

  setEditingCard: (cardId) => set({ editingCardId: cardId }),

  moveCardToCanvas: (cardId, targetCanvasId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId || activeCanvasId === targetCanvasId) return
    const srcCanvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!srcCanvas) return
    const card = srcCanvas.cards.find((c) => c.id === cardId)
    if (!card) return
    set((s) => ({
      canvases: s.canvases.map((c) => {
        if (c.id === activeCanvasId)
          return { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) }
        if (c.id === targetCanvasId)
          return { ...c, cards: [...c.cards, { ...card, x: 100, y: 100 }] }
        return c
      }),
      activeCanvasId: targetCanvasId,
      editingCardId: null,
      highlightCardId: cardId,
    }))
    get().persist()
  },

  setHighlightCard: (cardId) => set({ highlightCardId: cardId }),

  addText: (x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const text: TextBox = { id: uuid(), text: '', x, y, width: 300 }
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, texts: [...(c.texts ?? []), text] }
          : c,
      ),
      editingTextId: text.id,
    }))
    get().persist()
  },

  updateText: (textId, patch) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, texts: (c.texts ?? []).map((t) => t.id === textId ? { ...t, ...patch } : t) }
          : c,
      ),
    }))
    get().persist()
  },

  deleteText: (textId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, texts: (c.texts ?? []).filter((t) => t.id !== textId) }
          : c,
      ),
      editingTextId: s.editingTextId === textId ? null : s.editingTextId,
    }))
    get().persist()
  },

  moveText: (textId, x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, texts: (c.texts ?? []).map((t) => t.id === textId ? { ...t, x, y } : t) }
          : c,
      ),
    }))
    get().persist()
  },

  setEditingText: (textId) => set({ editingTextId: textId }),

  addLabel: (x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const label: CanvasLabel = { id: uuid(), text: '标题', level: 1, x, y, width: 300 }
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, labels: [...(c.labels ?? []), label] }
          : c,
      ),
    }))
    get().persist()
  },

  updateLabel: (labelId, patch) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, labels: (c.labels ?? []).map((l) => l.id === labelId ? { ...l, ...patch } : l) }
          : c,
      ),
    }))
    get().persist()
  },

  deleteLabel: (labelId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, labels: (c.labels ?? []).filter((l) => l.id !== labelId) }
          : c,
      ),
    }))
    get().persist()
  },

  moveLabel: (labelId, x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, labels: (c.labels ?? []).map((l) => l.id === labelId ? { ...l, x, y } : l) }
          : c,
      ),
    }))
    get().persist()
  },

  addSection: (x, y) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    const existingCount = canvas?.sections?.length ?? 0
    const color = SECTION_COLORS[existingCount % SECTION_COLORS.length]
    const section: Section = { id: uuid(), name: '分区', x, y, width: 600, height: 400, color, cardIds: [] }
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, sections: [...(c.sections ?? []), section] }
          : c,
      ),
    }))
    get().persist()
  },

  updateSection: (sectionId, patch) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, sections: (c.sections ?? []).map((sec) => sec.id === sectionId ? { ...sec, ...patch } : sec) }
          : c,
      ),
    }))
    get().persist()
  },

  deleteSection: (sectionId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, sections: (c.sections ?? []).filter((sec) => sec.id !== sectionId) }
          : c,
      ),
    }))
    get().persist()
  },

  moveSection: (sectionId, dx, dy) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const section = (canvas.sections ?? []).find((s) => s.id === sectionId)
    if (!section) return

    const memberCardIds = new Set(section.cardIds ?? [])

    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              sections: (c.sections ?? []).map((sec) => sec.id === sectionId ? { ...sec, x: sec.x + dx, y: sec.y + dy } : sec),
              cards: c.cards.map((card) => memberCardIds.has(card.id) ? { ...card, x: card.x + dx, y: card.y + dy } : card),
            }
          : c,
      ),
    }))
    get().persist()
  },

  autoFitSection: (sectionId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const section = (canvas.sections ?? []).find((s) => s.id === sectionId)
    if (!section) return
    const memberIds = new Set(section.cardIds ?? [])
    if (memberIds.size === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const card of canvas.cards) {
      if (!memberIds.has(card.id)) continue
      minX = Math.min(minX, card.x)
      minY = Math.min(minY, card.y)
      maxX = Math.max(maxX, card.x + card.width)
      maxY = Math.max(maxY, card.y + (card.height ?? 200))
    }
    if (minX === Infinity) return
    const pad = 24
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, sections: (c.sections ?? []).map((sec) => sec.id === sectionId ? { ...sec, x: minX - pad, y: minY - pad - 36, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 + 36 } : sec) }
          : c,
      ),
    }))
    get().persist()
  },

  compactSection: (sectionId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const section = (canvas.sections ?? []).find((s) => s.id === sectionId)
    if (!section) return
    const memberIds = section.cardIds ?? []
    if (memberIds.length === 0) return

    const GAP = 12
    const members = canvas.cards.filter((c) => memberIds.includes(c.id))
    const connections = canvas.connections ?? []

    const lockedIds = new Set<string>()
    for (const conn of connections) {
      if (memberIds.includes(conn.fromCardId) && memberIds.includes(conn.toCardId)) {
        lockedIds.add(conn.fromCardId)
        lockedIds.add(conn.toCardId)
      }
    }

    type Rect = { id: string; x: number; y: number; w: number; h: number; locked: boolean }
    const rects: Rect[] = members.map((c) => ({
      id: c.id, x: c.x, y: c.y, w: c.width, h: c.height ?? 200,
      locked: lockedIds.has(c.id),
    }))

    const byX = [...rects].sort((a, b) => a.x - b.x)
    const columns: Rect[][] = []
    for (const r of byX) {
      const cx = r.x + r.w / 2
      let placed = false
      for (const col of columns) {
        const colCx = col[0].x + col[0].w / 2
        if (Math.abs(cx - colCx) < Math.max(r.w, col[0].w) * 0.6) {
          col.push(r)
          placed = true
          break
        }
      }
      if (!placed) columns.push([r])
    }

    for (const col of columns) col.sort((a, b) => a.y - b.y)
    columns.sort((a, b) => {
      const medA = a.reduce((s, r) => s + r.x, 0) / a.length
      const medB = b.reduce((s, r) => s + r.x, 0) / b.length
      return medA - medB
    })

    const originY = Math.min(...rects.map((r) => r.y))
    const cardMap = new Map(members.map((c) => [c.id, { ...c }]))

    const finalPlaced: Rect[] = []
    for (const r of rects) {
      if (r.locked) finalPlaced.push({ ...r })
    }

    const colOverlapsLocked = (x: number, y: number, w: number, h: number) =>
      finalPlaced.some((p) =>
        x < p.x + p.w + GAP && x + w + GAP > p.x &&
        y < p.y + p.h + GAP && y + h + GAP > p.y)

    let colX = rects.reduce((m, r) => Math.min(m, r.x), Infinity)

    for (const col of columns) {
      const colW = Math.max(...col.map((r) => r.w))
      const freeInCol = col.filter((r) => !r.locked)
      const lockedInCol = col.filter((r) => r.locked).sort((a, b) => a.y - b.y)

      // Build list of "slots" — free vertical intervals in this column,
      // considering locked cards as immovable obstacles.
      type Slot = { top: number; bottom: number }
      const slots: Slot[] = []
      let scanY = originY

      for (const lk of lockedInCol) {
        if (lk.y > scanY + GAP) {
          slots.push({ top: scanY, bottom: lk.y - GAP })
        }
        scanY = Math.max(scanY, lk.y + lk.h + GAP)
      }
      // Unbounded slot after all locked cards
      slots.push({ top: scanY, bottom: Infinity })

      // Fill slots with free cards, preserving original y-order.
      const pending = [...freeInCol]
      for (const slot of slots) {
        let cy = slot.top
        let i = 0
        while (i < pending.length) {
          const r = pending[i]
          if (cy + r.h > slot.bottom && slot.bottom !== Infinity) {
            // Card doesn't fit in remaining slot space, try next card
            i++
            continue
          }
          // Check overlap with all already-placed cards (including locked from other cols)
          if (!colOverlapsLocked(colX, cy, r.w, r.h)) {
            cardMap.set(r.id, { ...cardMap.get(r.id)!, x: Math.round(colX), y: Math.round(cy) })
            finalPlaced.push({ ...r, x: colX, y: cy })
            cy += r.h + GAP
            pending.splice(i, 1)
          } else {
            // Skip past the obstacle
            let maxBottom = cy
            for (const p of finalPlaced) {
              if (colX < p.x + p.w + GAP && colX + r.w + GAP > p.x &&
                  cy < p.y + p.h + GAP && cy + r.h + GAP > p.y) {
                maxBottom = Math.max(maxBottom, p.y + p.h + GAP)
              }
            }
            cy = maxBottom
          }
        }
      }

      // Any remaining cards that couldn't fit in slots go at the tail
      let tailY = slots[slots.length - 1].top
      for (const p of finalPlaced) {
        if (p.x >= colX - GAP && p.x < colX + colW + GAP) {
          tailY = Math.max(tailY, p.y + p.h + GAP)
        }
      }
      for (const r of pending) {
        cardMap.set(r.id, { ...cardMap.get(r.id)!, x: Math.round(colX), y: Math.round(tailY) })
        finalPlaced.push({ ...r, x: colX, y: tailY })
        tailY += r.h + GAP
      }

      colX += colW + GAP
    }

    const updatedCards = [...cardMap.values()]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of updatedCards) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + (c.height ?? 200))
    }
    const pad = 24
    const newSection = {
      ...section,
      x: minX - pad,
      y: minY - pad - 36,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2 + 36,
    }

    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              cards: c.cards.map((card) => {
                const updated = cardMap.get(card.id)
                return updated ? updated : card
              }),
              sections: (c.sections ?? []).map((sec) => sec.id === sectionId ? newSection : sec),
            }
          : c,
      ),
    }))
    get().persist()
  },

  arrangeUnits: (ids) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return

    const cardIds = new Set(ids.cardIds)
    const labelIds = new Set(ids.labelIds)
    const sectionIds = new Set(ids.sectionIds)
    const textIds = new Set(ids.textIds)

    const selSections = (canvas.sections ?? []).filter((s) => sectionIds.has(s.id))
    const memberOfSelected = new Set<string>()
    for (const s of selSections) {
      for (const cid of (s.cardIds ?? [])) memberOfSelected.add(cid)
    }

    type Unit = { id: string; x: number; y: number; w: number; h: number }
    const units: Unit[] = []
    for (const t of canvas.texts ?? []) {
      if (textIds.has(t.id)) units.push({ id: t.id, x: t.x, y: t.y, w: t.width, h: t.height ?? 24 })
    }
    for (const l of canvas.labels ?? []) {
      if (labelIds.has(l.id)) units.push({ id: l.id, x: l.x, y: l.y, w: l.width, h: 40 })
    }
    for (const s of canvas.sections ?? []) {
      if (sectionIds.has(s.id)) units.push({ id: s.id, x: s.x, y: s.y, w: s.width, h: s.height })
    }
    for (const c of canvas.cards) {
      if (cardIds.has(c.id) && !memberOfSelected.has(c.id)) {
        units.push({ id: c.id, x: c.x, y: c.y, w: c.width, h: c.height ?? 200 })
      }
    }

    if (units.length < 2) return

    const GAP = 20

    // 列聚类（按中心 x），复用 compactSection 思路
    const byX = [...units].sort((a, b) => a.x - b.x)
    const columns: Unit[][] = []
    for (const r of byX) {
      const cx = r.x + r.w / 2
      let placed = false
      for (const col of columns) {
        const colCx = col.reduce((s, u) => s + u.x + u.w / 2, 0) / col.length
        const colW = col.reduce((s, u) => s + u.w, 0) / col.length
        if (Math.abs(cx - colCx) < Math.max(r.w, colW) * 0.6) {
          col.push(r); placed = true; break
        }
      }
      if (!placed) columns.push([r])
    }
    for (const col of columns) col.sort((a, b) => a.y - b.y)
    columns.sort((a, b) => {
      const ma = a.reduce((s, r) => s + r.x, 0) / a.length
      const mb = b.reduce((s, r) => s + r.x, 0) / b.length
      return ma - mb
    })

    const originX = Math.min(...units.map((u) => u.x))
    const originY = Math.min(...units.map((u) => u.y))
    const newPos = new Map<string, { x: number; y: number }>()
    let colX = originX
    for (const col of columns) {
      const colW = Math.max(...col.map((u) => u.w))
      let cy = originY
      for (const u of col) {
        newPos.set(u.id, { x: Math.round(colX), y: Math.round(cy) })
        cy += u.h + GAP
      }
      colX += colW + GAP
    }

    // 分区位移 + 成员卡片归属
    const sectionDelta = new Map<string, { dx: number; dy: number }>()
    for (const s of selSections) {
      const np = newPos.get(s.id)
      if (np) sectionDelta.set(s.id, { dx: np.x - s.x, dy: np.y - s.y })
    }
    const cardToSection = new Map<string, string>()
    for (const s of selSections) {
      for (const cid of (s.cardIds ?? [])) cardToSection.set(cid, s.id)
    }

    set((st) => ({
      canvases: st.canvases.map((c) => {
        if (c.id !== activeCanvasId) return c
        return {
          ...c,
          texts: (c.texts ?? []).map((t) => {
            const np = newPos.get(t.id)
            return np ? { ...t, x: np.x, y: np.y } : t
          }),
          labels: (c.labels ?? []).map((l) => {
            const np = newPos.get(l.id)
            return np ? { ...l, x: np.x, y: np.y } : l
          }),
          sections: (c.sections ?? []).map((s) => {
            const np = newPos.get(s.id)
            return np ? { ...s, x: np.x, y: np.y } : s
          }),
          cards: c.cards.map((cd) => {
            const secId = cardToSection.get(cd.id)
            if (secId) {
              const d = sectionDelta.get(secId)
              return d ? { ...cd, x: cd.x + d.dx, y: cd.y + d.dy } : cd
            }
            const np = newPos.get(cd.id)
            return np ? { ...cd, x: np.x, y: np.y } : cd
          }),
        }
      }),
    }))
    get().persist()
  },

  deleteUnits: (ids) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const cardIds = new Set(ids.cardIds)
    const labelIds = new Set(ids.labelIds)
    const sectionIds = new Set(ids.sectionIds)
    const textIds = new Set(ids.textIds)
    set((s) => ({
      canvases: s.canvases.map((c) => {
        if (c.id !== activeCanvasId) return c
        return {
          ...c,
          cards: c.cards.filter((cd) => !cardIds.has(cd.id)),
          labels: (c.labels ?? []).filter((l) => !labelIds.has(l.id)),
          texts: (c.texts ?? []).filter((t) => !textIds.has(t.id)),
          connections: (c.connections ?? []).filter(
            (cn) => !cardIds.has(cn.fromCardId) && !cardIds.has(cn.toCardId),
          ),
          sections: (c.sections ?? [])
            .filter((sec) => !sectionIds.has(sec.id))
            .map((sec) => {
              const members = sec.cardIds ?? []
              const kept = members.filter((id) => !cardIds.has(id))
              return kept.length !== members.length ? { ...sec, cardIds: kept } : sec
            }),
        }
      }),
      editingCardId: s.editingCardId && cardIds.has(s.editingCardId) ? null : s.editingCardId,
      editingTextId: s.editingTextId && textIds.has(s.editingTextId) ? null : s.editingTextId,
    }))
    get().persist()
  },

  nudgeUnits: (ids, dx, dy) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    if (dx === 0 && dy === 0) return
    const labelIds = new Set(ids.labelIds)
    const sectionIds = new Set(ids.sectionIds)
    const textIds = new Set(ids.textIds)
    // 选中分区的成员卡片随分区一起移动（与拖动分区 moveSection 行为一致）；
    // 用 Set 与直接选中的卡片去重，避免成员卡片被移动两次。
    const cardIds = new Set(ids.cardIds)
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    for (const sec of (canvas?.sections ?? [])) {
      if (sectionIds.has(sec.id)) for (const cid of (sec.cardIds ?? [])) cardIds.add(cid)
    }
    set((s) => ({
      canvases: s.canvases.map((c) => {
        if (c.id !== activeCanvasId) return c
        return {
          ...c,
          cards: c.cards.map((cd) => cardIds.has(cd.id) ? { ...cd, x: cd.x + dx, y: cd.y + dy } : cd),
          labels: (c.labels ?? []).map((l) => labelIds.has(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l),
          texts: (c.texts ?? []).map((t) => textIds.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t),
          sections: (c.sections ?? []).map((sec) => sectionIds.has(sec.id) ? { ...sec, x: sec.x + dx, y: sec.y + dy } : sec),
        }
      }),
    }))
    get().persist()
  },

  addConnection: (fromCardId, toCardId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId || fromCardId === toCardId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const exists = (canvas.connections ?? []).some((c) => c.fromCardId === fromCardId && c.toCardId === toCardId)
    if (exists) return
    const conn: Connection = { id: uuid(), fromCardId, toCardId }
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, connections: [...(c.connections ?? []), conn] }
          : c,
      ),
    }))
    get().persist()
  },

  deleteConnection: (connId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, connections: (c.connections ?? []).filter((cn) => cn.id !== connId) }
          : c,
      ),
    }))
    get().persist()
  },

  saveViewport: (canvasId, viewport) => {
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === canvasId ? { ...c, viewport } : c,
      ),
    }))
    get().persist()
  },
}))

export function useActiveCanvas() {
  return useStore((s) => {
    const c = s.canvases.find((c) => c.id === s.activeCanvasId)
    return c ?? null
  })
}

export function useActiveCanvasMeta() {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c ? { id: c.id, name: c.name, cardCount: c.cards.length } : null
    },
    shallow,
  )
}

export function useActiveCards() {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.cards ?? []
    },
    (a, b) => a === b,
  )
}

export function useCardById(cardId: string) {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.cards.find((card) => card.id === cardId)
    },
    shallow,
  )
}

export function useIsEditing(cardId: string) {
  return useStore((s) => s.editingCardId === cardId)
}

export function useCardActions() {
  return useStore(
    (s) => ({
      moveCard: s.moveCard,
      deleteCard: s.deleteCard,
      updateCard: s.updateCard,
      setEditingCard: s.setEditingCard,
    }),
    shallow,
  )
}

export function useActiveLabels() {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.labels ?? []
    },
    (a, b) => a === b,
  )
}

export function useActiveTexts() {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.texts ?? []
    },
    (a, b) => a === b,
  )
}

export function useActiveSections() {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.sections ?? []
    },
    (a, b) => a === b,
  )
}

export function useActiveConnections() {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.connections ?? []
    },
    (a, b) => a === b,
  )
}

export function useHighlightCard() {
  return useStore((s) => s.highlightCardId)
}

export function useCanvasViewport(canvasId: string | null) {
  return useStore((s) => {
    if (!canvasId) return undefined
    const c = s.canvases.find((cv) => cv.id === canvasId)
    return c?.viewport
  })
}

export function useAllCanvases() {
  return useStore((s) => s.canvases.map((c) => ({ id: c.id, name: c.name })), shallow)
}

export function useSettings() {
  return useStore((s) => s.settings)
}
