import { create } from 'zustand'
import { shallow } from 'zustand/shallow'
import { v4 as uuid } from 'uuid'
import type { Canvas, Card } from './types'

interface AppState {
  canvases: Canvas[]
  activeCanvasId: string | null
  editingCardId: string | null
  loaded: boolean

  loadData: () => Promise<void>
  persist: () => void

  addCanvas: (name: string) => void
  deleteCanvas: (id: string) => void
  renameCanvas: (id: string, name: string) => void
  setActiveCanvas: (id: string) => void

  addCard: (x: number, y: number) => void
  updateCard: (cardId: string, patch: Partial<Card>) => void
  deleteCard: (cardId: string) => void
  moveCard: (cardId: string, x: number, y: number) => void
  setEditingCard: (cardId: string | null) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<AppState>((set, get) => ({
  canvases: [],
  activeCanvasId: null,
  editingCardId: null,
  loaded: false,

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
      const { canvases, activeCanvasId } = get()
      window.electronAPI.writeData({ canvases, activeCanvasId })
    }, 300)
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
      width: 288,
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

      const xSnaps: [number, number][] = [
        [Math.abs(x - (other.x + ow + GAP)), other.x + ow + GAP],
        [Math.abs((x + selfW) - (other.x - GAP)), other.x - GAP - selfW],
        [Math.abs(x - other.x), other.x],
        [Math.abs((x + selfW) - (other.x + ow)), other.x + ow - selfW],
      ]
      for (const [dist, snap] of xSnaps) {
        if (dist < bestDx) { bestDx = dist; bestX = snap }
      }

      const ySnaps: [number, number][] = [
        [Math.abs(y - other.y), other.y],
        [Math.abs((y + selfH) - (other.y + oh)), other.y + oh - selfH],
        [Math.abs(y - (other.y + oh + GAP)), other.y + oh + GAP],
        [Math.abs((y + selfH) - (other.y - GAP)), other.y - GAP - selfH],
      ]
      for (const [dist, snap] of ySnaps) {
        if (dist < bestDy) { bestDy = dist; bestY = snap }
      }
    }

    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              cards: c.cards.map((card) =>
                card.id === cardId ? { ...card, x: bestX, y: bestY } : card,
              ),
            }
          : c,
      ),
    }))
    get().persist()
  },

  setEditingCard: (cardId) => set({ editingCardId: cardId }),
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
