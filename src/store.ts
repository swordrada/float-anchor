import { create } from 'zustand'
import { shallow } from 'zustand/shallow'
import { v4 as uuid } from 'uuid'
import type { Canvas, Card, CanvasLabel, Section, Connection, CanvasViewport, AppSettings, WebDAVConfig } from './types'

interface AppState {
  canvases: Canvas[]
  activeCanvasId: string | null
  editingCardId: string | null
  highlightCardId: string | null
  loaded: boolean
  settings: AppSettings
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  showSettings: boolean

  loadData: () => Promise<void>
  persist: () => void
  loadSettings: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>
  setTheme: (theme: 'light' | 'dark') => void
  setWebDAVConfig: (config: WebDAVConfig | undefined) => void
  setShowSettings: (v: boolean) => void
  setSyncStatus: (s: 'idle' | 'syncing' | 'success' | 'error') => void

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

  finalizeCardMove: (cardId: string) => void

  addConnection: (fromCardId: string, toCardId: string) => void
  deleteConnection: (connId: string) => void

  saveViewport: (canvasId: string, viewport: CanvasViewport) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let syncTimer: ReturnType<typeof setTimeout> | undefined

const SECTION_COLORS = ['#9ca3af', '#60a5fa', '#34d399', '#fb923c', '#f472b6']

export const useStore = create<AppState>((set, get) => ({
  canvases: [],
  activeCanvasId: null,
  editingCardId: null,
  highlightCardId: null,
  loaded: false,
  settings: { theme: 'light' },
  syncStatus: 'idle',
  showSettings: false,

  loadData: async () => {
    try {
      const data = await window.electronAPI.readData()
      if (data && data.canvases.length > 0) {
        set({
          canvases: data.canvases,
          activeCanvasId: data.activeCanvasId ?? data.canvases[0].id,
          loaded: true,
        })
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
      const { canvases, activeCanvasId, settings } = get()
      window.electronAPI.writeData({ canvases, activeCanvasId })
      if (settings.webdav?.server) {
        clearTimeout(syncTimer)
        syncTimer = setTimeout(() => {
          set({ syncStatus: 'syncing' })
          window.electronAPI.webdavAutoSync(settings.webdav!).then((res) => {
            set({ syncStatus: res.success ? 'success' : 'error' })
            if (res.success) setTimeout(() => set({ syncStatus: 'idle' }), 3000)
          }).catch(() => set({ syncStatus: 'error' }))
        }, 5000)
      }
    }, 300)
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

  setShowSettings: (v) => set({ showSettings: v }),

  setSyncStatus: (s) => set({ syncStatus: s }),

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
          ? { ...c, cards: c.cards.filter((card) => card.id !== cardId) }
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

    const SNAP_DIST = 10
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
        return sec
      })
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
      for (const mId of members) {
        if (mId === cd.id) continue
        const member = canvas.cards.find((c) => c.id === mId)
        if (!member) continue
        const mW = member.width; const mH = member.height ?? 300
        const cW = cd.width; const cH = cd.height ?? 300
        const touchH = (Math.abs(cd.x - (member.x + mW + GAP)) < 1) ||
                      (Math.abs((cd.x + cW) - (member.x - GAP)) < 1) ||
                      (Math.abs(cd.x - member.x) < 1) ||
                      (Math.abs((cd.x + cW) - (member.x + mW)) < 1)
        const touchV = (Math.abs(cd.y - member.y) < 1) ||
                      (Math.abs((cd.y + cH) - (member.y + mH)) < 1) ||
                      (Math.abs(cd.y - (member.y + mH + GAP)) < 1) ||
                      (Math.abs((cd.y + cH) - (member.y - GAP)) < 1)
        if (touchH || touchV) return true
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
    const updatedSections = sections.map((sec) => {
      const members = sec.cardIds ?? []
      const isMember = members.includes(cardId)

      if (isMember) {
        if (isFullyInside(card, sec)) return sec
        changed = true
        return expandToFit(sec, members)
      }

      if (!snappedToMemberOf(card, sec)) return sec
      changed = true
      return expandToFit(sec, [...members, cardId])
    })

    if (!changed) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId ? { ...c, sections: updatedSections } : c,
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
  return useStore((s) => {
    const c = s.canvases.find((c) => c.id === s.activeCanvasId)
    return c?.cards ?? []
  })
}

export function useCardById(cardId: string) {
  return useStore(
    (s) => {
      const c = s.canvases.find((c) => c.id === s.activeCanvasId)
      return c?.cards.find((card) => card.id === cardId)
    },
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
  return useStore((s) => {
    const c = s.canvases.find((c) => c.id === s.activeCanvasId)
    return c?.labels ?? []
  })
}

export function useActiveSections() {
  return useStore((s) => {
    const c = s.canvases.find((c) => c.id === s.activeCanvasId)
    return c?.sections ?? []
  })
}

export function useActiveConnections() {
  return useStore((s) => {
    const c = s.canvases.find((c) => c.id === s.activeCanvasId)
    return c?.connections ?? []
  })
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
