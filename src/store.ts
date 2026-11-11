import { connectionNodes, withoutConnectionsTo } from './connectionNodes'
import { contentFingerprint } from './lib/syncData'
import { create } from 'zustand'
import { shallow } from 'zustand/shallow'
import { v4 as uuid } from 'uuid'
import type { Canvas, Card, CanvasLabel, Section, SectionAppearance, SectionAppearancePatch, Connection, CanvasViewport, AppSettings, WebDAVConfig, WebDAVSyncDecision, TextBox, SyncProvider, JournalData } from './types'
import { getTodayDateKey } from './lib/dateUtils'
import { getSectionAppearance, sanitizeSectionAppearancePatch } from './sectionStyle'
import { fitSectionLayout, CARD_SNAP_GAP, CARD_VERTICAL_SNAP_GAP } from './sectionLayout'
import { canvasSnapRects, labelHeight, snapCanvasRects } from './canvasSnapping'

export function getEffectiveProvider(settings: AppSettings): SyncProvider {
  return settings.syncProvider ?? (settings.webdav?.server ? 'webdav' : 'none')
}

interface SnapRect { x: number; y: number; width: number; height: number }

const INSTANT_CARD_WIDTH = 373
const INSTANT_GAP = CARD_SNAP_GAP
const SECTION_PAD = 24
const SECTION_HEADER = 36

interface LayoutRect extends SnapRect { id: string }

export function estimateInstantCardHeight(title: string, content: string): number {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let visualLines = 0
  let blockExtra = 0
  let inCodeBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock
      visualLines += 1
      continue
    }
    if (!line.trim()) {
      visualLines += 0.45
      continue
    }
    if (/!\[[^\]]*\]\([^)]*\)/.test(line) || /<img\b/i.test(line)) blockExtra += 180
    if (/^\s{0,3}#{1,6}\s+/.test(line)) blockExtra += 12
    if (/^\s*>/.test(line)) blockExtra += 4

    const plain = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/^\s*(?:[-*+] |\d+\. |#{1,6}\s+)/, '')
    const charsPerLine = inCodeBlock ? 48 : 44
    visualLines += Math.max(1, Math.ceil(Math.max(plain.length, 1) / charsPerLine))
  }

  const dragHandle = 24
  const titleHeight = title.trim() ? 43 : 0
  const contentHeight = content.trim()
    ? 26 + visualLines * 22 + blockExtra
    : 54
  return Math.max(200, Math.ceil(dragHandle + titleHeight + contentHeight))
}

function overlapsWithGap(candidate: SnapRect, other: SnapRect): boolean {
  return candidate.x < other.x + other.width + INSTANT_GAP &&
    candidate.x + candidate.width + INSTANT_GAP > other.x &&
    candidate.y < other.y + other.height + INSTANT_GAP &&
    candidate.y + candidate.height + INSTANT_GAP > other.y
}

function findInstantCardPlacement(section: Section, placed: LayoutRect[], width: number, height: number) {
  const origin = { x: section.x + SECTION_PAD, y: section.y + SECTION_HEADER + SECTION_PAD }
  if (placed.length === 0) return origin

  const minX = Math.min(...placed.map((rect) => rect.x))
  const minY = Math.min(...placed.map((rect) => rect.y))
  const maxRight = Math.max(...placed.map((rect) => rect.x + rect.width))
  const maxBottom = Math.max(...placed.map((rect) => rect.y + rect.height))
  const candidates: Array<{ x: number; y: number }> = [origin]

  for (const rect of placed) {
    candidates.push(
      { x: rect.x + rect.width + INSTANT_GAP, y: rect.y },
      { x: rect.x, y: rect.y + rect.height + INSTANT_GAP },
      { x: maxRight + INSTANT_GAP, y: rect.y },
      { x: rect.x, y: maxBottom + INSTANT_GAP },
    )
  }
  candidates.push(
    { x: maxRight + INSTANT_GAP, y: minY },
    { x: minX, y: maxBottom + INSTANT_GAP },
  )

  const seen = new Set<string>()
  const valid = candidates.filter((candidate) => {
    const key = `${candidate.x}:${candidate.y}`
    if (seen.has(key)) return false
    seen.add(key)
    const rect = { ...candidate, width, height }
    return !placed.some((other) => overlapsWithGap(rect, other))
  })

  const byReadingOrder = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    a.y - b.y || a.x - b.x

  // The first pair always starts horizontally.
  if (placed.length === 1) {
    const right = valid.find((candidate) => candidate.x === maxRight + INSTANT_GAP && candidate.y === minY)
    if (right) return right
  }

  // Fill an already-open row/column before growing the outer bounds again.
  const interior = valid
    .filter((candidate) =>
      candidate.x >= minX && candidate.y >= minY &&
      candidate.x + width <= maxRight && candidate.y + height <= maxBottom,
    )
    .sort(byReadingOrder)
  if (interior[0]) return interior[0]

  const contentWidth = maxRight - minX
  const contentHeight = maxBottom - minY
  if (contentWidth > contentHeight) {
    const downward = valid
      .filter((candidate) => candidate.y >= maxBottom + INSTANT_GAP)
      .sort((a, b) => a.x - b.x || a.y - b.y)
    if (downward[0]) return downward[0]
  } else {
    const rightward = valid
      .filter((candidate) => candidate.x >= maxRight + INSTANT_GAP)
      .sort((a, b) => a.y - b.y || a.x - b.x)
    if (rightward[0]) return rightward[0]
  }

  return valid.sort((a, b) => {
    const aWidth = Math.max(maxRight, a.x + width) - Math.min(minX, a.x)
    const aHeight = Math.max(maxBottom, a.y + height) - Math.min(minY, a.y)
    const bWidth = Math.max(maxRight, b.x + width) - Math.min(minX, b.x)
    const bHeight = Math.max(maxBottom, b.y + height) - Math.min(minY, b.y)
    return Math.abs(aWidth - aHeight) - Math.abs(bWidth - bHeight) || byReadingOrder(a, b)
  })[0] ?? origin
}

function reflowInstantCardsInSection(canvas: Canvas, section: Section): { cards: Card[]; section: Section } {
  const memberIds = new Set(section.cardIds ?? [])
  const instantCards = canvas.cards
    .filter((card) => memberIds.has(card.id) && card.instantOrder != null)
    .sort((a, b) => a.instantOrder! - b.instantOrder!)
  const instantIds = new Set(instantCards.map((card) => card.id))
  const placed: LayoutRect[] = canvas.cards
    .filter((card) => memberIds.has(card.id) && !instantIds.has(card.id))
    .map((card) => ({
      id: card.id,
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height ?? 200,
    }))
  const positions = new Map<string, { x: number; y: number }>()

  for (const card of instantCards) {
    const height = card.height ?? estimateInstantCardHeight(card.title, card.content)
    const position = findInstantCardPlacement(section, placed, card.width, height)
    positions.set(card.id, position)
    placed.push({ id: card.id, ...position, width: card.width, height })
  }

  const cards = canvas.cards.map((card) => {
    const position = positions.get(card.id)
    return position ? { ...card, ...position } : card
  })
  if (placed.length === 0) return { cards, section }

  const minX = Math.min(...placed.map((rect) => rect.x))
  const minY = Math.min(...placed.map((rect) => rect.y))
  const maxRight = Math.max(...placed.map((rect) => rect.x + rect.width))
  const maxBottom = Math.max(...placed.map((rect) => rect.y + rect.height))
  const nextX = Math.min(section.x, minX - SECTION_PAD)
  const nextY = Math.min(section.y, minY - SECTION_PAD - SECTION_HEADER)
  const nextRight = Math.max(section.x + section.width, maxRight + SECTION_PAD)
  const nextBottom = Math.max(section.y + section.height, maxBottom + SECTION_PAD)
  return {
    cards,
    section: {
      ...section,
      x: nextX,
      y: nextY,
      width: nextRight - nextX,
      height: nextBottom - nextY,
    },
  }
}

// 判断卡片 cd 是否真正"贴靠"在 member 旁边：在一个轴方向上贴合（边缘吻合或相隔一个 GAP），
// 且在另一个轴方向上有实际重叠。仅单轴边缘吻合（如只有 x 对齐、y 却相距很远）不算贴靠——
// 否则磁吸把卡片吸到远处分区成员的同列/同行坐标后，那个远分区会误判并拉伸过来框住卡片。
export function isCardSnappedAdjacent(cd: SnapRect, member: SnapRect, gap: number, tol = 1, verticalGap = gap): boolean {
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
    Math.abs(cd.y - (mB + verticalGap)) < tol ||
    Math.abs(cB - (member.y - verticalGap)) < tol
  return (touchH && overlapsY) || (touchV && overlapsX)
}

interface AppState {
  canvases: Canvas[]
  activeCanvasId: string | null
  boardViewMode: 'overview' | 'canvas'
  activeView: 'boards' | 'journal'
  journal: JournalData
  journalViewMode: 'detail' | 'table'
  journalSelectedDate: string
  editingCardId: string | null
  instantEditingCardId: string | null
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
  scheduleAutoSync: () => void
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
  createInstantCanvas: (name: string) => string
  createInstantSection: (canvasId: string, name: string) => string
  createInstantCard: (canvasId: string, sectionId: string | null, title: string, content: string) => string | null
  openBoardOverview: () => void
  openDailyJournal: () => void
  setJournalViewMode: (mode: 'detail' | 'table') => void
  setJournalSelectedDate: (date: string) => void
  upsertJournalEntry: (date: string, patch: { customTitle?: string; content?: string }) => void
  deleteCanvas: (id: string) => void
  renameCanvas: (id: string, name: string) => void
  setActiveCanvas: (id: string) => void

  addCard: (x: number, y: number) => void
  updateCard: (cardId: string, patch: Partial<Card>) => void
  deleteCard: (cardId: string) => void
  moveCard: (cardId: string, x: number, y: number, scale?: number) => void
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
  moveLabel: (labelId: string, x: number, y: number, scale?: number) => void

  addSection: (x: number, y: number) => void
  updateSection: (sectionId: string, patch: Partial<Section>) => void
  updateSections: (ids: string[], patch: SectionAppearancePatch) => void
  deleteSection: (sectionId: string) => void
  moveSection: (sectionId: string, dx: number, dy: number) => void
  autoFitSection: (sectionId: string) => void
  compactSection: (sectionId: string, heights: Readonly<Record<string, number>>) => void
  arrangeUnits: (ids: { cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] }) => void
  deleteUnits: (ids: { cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] }) => void
  nudgeUnits: (ids: { cardIds: string[]; labelIds: string[]; sectionIds: string[]; textIds: string[] }, dx: number, dy: number) => void

  finalizeCardMove: (cardId: string) => void

  addConnection: (fromCardId: string, toCardId: string) => void
  updateConnection: (connId: string, patch: Partial<Pick<Connection, 'routing' | 'fromSide' | 'toSide' | 'laneOffset' | 'controlPoints'>>) => void
  deleteConnection: (connId: string) => void

  saveViewport: (canvasId: string, viewport: CanvasViewport) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastPersistedContent = ''

const SECTION_COLORS = ['#9ca3af', '#60a5fa', '#34d399', '#fb923c', '#f472b6']

function normalizeJournal(raw: unknown): JournalData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { entriesByDate: {} }
  const entries = (raw as { entriesByDate?: unknown }).entriesByDate
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return { entriesByDate: {} }
  const entriesByDate: JournalData['entriesByDate'] = {}
  for (const [date, value] of Object.entries(entries)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !value || typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    entriesByDate[date] = {
      date,
      customTitle: typeof item.customTitle === 'string' ? item.customTitle : undefined,
      content: typeof item.content === 'string' ? item.content : '',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    }
  }
  return { entriesByDate }
}

export const useStore = create<AppState>((set, get) => ({
  canvases: [],
  activeCanvasId: null,
  boardViewMode: 'canvas',
  activeView: 'boards',
  journal: { entriesByDate: {} },
  journalViewMode: 'detail',
  journalSelectedDate: getTodayDateKey(),
  editingCardId: null,
  instantEditingCardId: null,
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
        lastPersistedContent = contentFingerprint(data)
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
          boardViewMode: data.boardViewMode === 'overview' ? 'overview' : 'canvas',
          activeView: data.activeView === 'journal' ? 'journal' : 'boards',
          journal: normalizeJournal(data.journal),
          journalViewMode: data.journalViewMode === 'table' ? 'table' : 'detail',
          journalSelectedDate: /^\d{4}-\d{2}-\d{2}$/.test(data.journalSelectedDate ?? '') ? data.journalSelectedDate! : getTodayDateKey(),
          loaded: true,
        })
        if (needsPersist) get().persist()
        return
      }
    } catch { /* ignore */ }

    const first: Canvas = { id: uuid(), name: '默认画布', cards: [] }
    set({ canvases: [first], activeCanvasId: first.id, boardViewMode: 'canvas', activeView: 'boards', journal: { entriesByDate: {} }, journalViewMode: 'detail', journalSelectedDate: getTodayDateKey(), loaded: true })
    get().persist()
  },

  persist: () => {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      const { canvases, activeCanvasId, boardViewMode, activeView, journal, journalViewMode, journalSelectedDate } = get()
      void window.electronAPI.writeData({ canvases, activeCanvasId, boardViewMode, activeView, journal, journalViewMode, journalSelectedDate }).then((saved) => {
        if (!saved) {
          set({ syncStatus: 'error', syncError: '本地保存失败或内容已在其他窗口更新，当前编辑已保留。' })
          return
        }
        const fingerprint = contentFingerprint({ canvases, journal })
        if (fingerprint !== lastPersistedContent) get().scheduleAutoSync()
        lastPersistedContent = fingerprint
      }).catch(() => set({ syncStatus: 'error', syncError: '本地保存失败，当前编辑已保留。' }))
    }, 600)
  },

  // Cloud work runs on a fixed five-minute cadence, not once per save.
  scheduleAutoSync: () => {
    const { settings, syncDecision } = get()
    if (getEffectiveProvider(settings) !== 'none' && !syncDecision) {
      set({ syncStatus: 'pending', syncError: null })
    }
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
    saveTimer = undefined
    const { canvases, activeCanvasId, boardViewMode, activeView, journal, journalViewMode, journalSelectedDate } = get()
    const saved = await window.electronAPI.writeData({ canvases, activeCanvasId, boardViewMode, activeView, journal, journalViewMode, journalSelectedDate })
    if (!saved) throw new Error('本地保存失败，请保留编辑内容后重试。')
    const fingerprint = contentFingerprint({ canvases, journal })
    if (fingerprint !== lastPersistedContent) get().scheduleAutoSync()
    lastPersistedContent = fingerprint
  },

  addCanvas: (name) => {
    const canvas: Canvas = { id: uuid(), name, cards: [] }
    set((s) => ({
      canvases: [...s.canvases, canvas],
      activeCanvasId: canvas.id,
      boardViewMode: 'canvas',
      activeView: 'boards',
    }))
    get().persist()
  },

  createInstantCanvas: (name) => {
    const canvas: Canvas = { id: uuid(), name, cards: [] }
    set((s) => ({
      canvases: [...s.canvases, canvas],
      activeCanvasId: canvas.id,
      boardViewMode: 'canvas',
      activeView: 'boards',
      editingCardId: null,
      editingTextId: null,
    }))
    get().persist()
    return canvas.id
  },

  createInstantSection: (canvasId, name) => {
    const canvas = get().canvases.find((item) => item.id === canvasId)
    const sectionId = uuid()
    if (!canvas) return sectionId

    const existingSections = canvas.sections ?? []
    const color = SECTION_COLORS[existingSections.length % SECTION_COLORS.length]
    const contentBottom = Math.max(
      0,
      ...existingSections.map((section) => section.y + section.height),
      ...canvas.cards.map((card) => card.y + (card.height ?? 200)),
    )
    const section: Section = {
      id: sectionId,
      name,
      x: 0,
      y: existingSections.length || canvas.cards.length ? contentBottom + 80 : 0,
      width: 600,
      height: 400,
      color,
      cardIds: [],
    }

    set((s) => ({
      canvases: s.canvases.map((item) =>
        item.id === canvasId
          ? { ...item, sections: [...(item.sections ?? []), section] }
          : item,
      ),
      activeCanvasId: canvasId,
      boardViewMode: 'canvas',
      activeView: 'boards',
      editingCardId: null,
      editingTextId: null,
    }))
    get().persist()
    return sectionId
  },

  createInstantCard: (canvasId, sectionId, title, content) => {
    const canvas = get().canvases.find((item) => item.id === canvasId)
    if (!canvas || (!title.trim() && !content.trim())) return null

    const selectedSection = sectionId
      ? (canvas.sections ?? []).find((section) => section.id === sectionId)
      : undefined
    const cardId = uuid()
    const cardWidth = INSTANT_CARD_WIDTH
    const estimatedHeight = estimateInstantCardHeight(title, content)
    let x = 0
    let y = 0

    if (selectedSection) {
      const memberIds = new Set(selectedSection.cardIds ?? [])
      const members: LayoutRect[] = canvas.cards
        .filter((card) => memberIds.has(card.id))
        .map((card) => ({
          id: card.id,
          x: card.x,
          y: card.y,
          width: card.width,
          height: card.height ?? estimateInstantCardHeight(card.title, card.content),
        }))
      const placement = findInstantCardPlacement(selectedSection, members, cardWidth, estimatedHeight)
      x = placement.x
      y = placement.y
    } else if (canvas.cards.length) {
      const rightMost = canvas.cards.reduce((best, card) =>
        card.x + card.width > best.x + best.width ? card : best,
      )
      x = rightMost.x + rightMost.width + 24
      y = rightMost.y
    }

    const card: Card = {
      id: cardId,
      title: title.trim(),
      content,
      x,
      y,
      width: cardWidth,
      height: estimatedHeight,
      ...(selectedSection
        ? { instantOrder: Math.max(0, ...canvas.cards.map((item) => item.instantOrder ?? 0)) + 1 }
        : {}),
    }

    set((s) => ({
      canvases: s.canvases.map((item) => {
        if (item.id !== canvasId) return item
        const nextSection = selectedSection
          ? { ...selectedSection, cardIds: [...(selectedSection.cardIds ?? []), cardId] }
          : null
        const nextCanvas = {
          ...item,
          cards: [...item.cards, card],
          sections: (item.sections ?? []).map((section) =>
            section.id === nextSection?.id ? nextSection : section,
          ),
        }
        if (!nextSection) return nextCanvas
        const reflowed = reflowInstantCardsInSection(nextCanvas, nextSection)
        return {
          ...nextCanvas,
          cards: reflowed.cards,
          sections: nextCanvas.sections.map((section) =>
            section.id === nextSection.id ? reflowed.section : section,
          ),
        }
      }),
      activeCanvasId: canvasId,
      boardViewMode: 'canvas',
      activeView: 'boards',
      editingCardId: null,
      editingTextId: null,
      highlightCardId: cardId,
    }))
    get().persist()
    return cardId
  },

  openBoardOverview: () => {
    set({ activeView: 'boards', boardViewMode: 'overview', editingCardId: null, editingTextId: null })
    get().persist()
  },

  openDailyJournal: () => {
    set({ activeView: 'journal', editingCardId: null, editingTextId: null })
    get().persist()
  },

  setJournalViewMode: (journalViewMode) => {
    set({ activeView: 'journal', journalViewMode })
    get().persist()
  },

  setJournalSelectedDate: (journalSelectedDate) => {
    set({ activeView: 'journal', journalSelectedDate })
    get().persist()
  },

  upsertJournalEntry: (date, patch) => {
    set((s) => {
      const previous = s.journal.entriesByDate[date]
      const now = Date.now()
      return {
        activeView: 'journal' as const,
        journal: {
          entriesByDate: {
            ...s.journal.entriesByDate,
            [date]: {
              date,
              customTitle: patch.customTitle ?? previous?.customTitle,
              content: patch.content ?? previous?.content ?? '',
              createdAt: previous?.createdAt ?? now,
              updatedAt: now,
            },
          },
        },
      }
    })
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
    set({ activeCanvasId: id, activeView: 'boards', boardViewMode: 'canvas', editingCardId: null })
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
    if (get().instantEditingCardId === cardId && ('title' in patch || 'content' in patch)) return
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? (() => {
              const currentCard = c.cards.find((card) => card.id === cardId)
              if (!currentCard) return c
              const updatedCard = { ...currentCard, ...patch }
              let nextCanvas: Canvas = {
                ...c,
                cards: c.cards.map((card) =>
                  card.id === cardId ? updatedCard : card,
                ),
              }
              for (const section of c.sections ?? []) {
                if (!(section.cardIds ?? []).includes(cardId)) continue
                const currentSection = nextCanvas.sections?.find((item) => item.id === section.id) ?? section
                const reflowed = reflowInstantCardsInSection(nextCanvas, currentSection)
                nextCanvas = {
                  ...nextCanvas,
                  cards: reflowed.cards,
                  sections: (nextCanvas.sections ?? []).map((item) =>
                    item.id === section.id ? reflowed.section : item,
                  ),
                }
              }
              return nextCanvas
            })()
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

  moveCard: (cardId, x, y, scale) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    const canvas = get().canvases.find((c) => c.id === activeCanvasId)
    if (!canvas) return
    const self = canvas.cards.find((c) => c.id === cardId)
    if (!self) return

    const { dx, dy } = snapCanvasRects(
      [{ ...self, x, y, height: self.height ?? 300 }], canvasSnapRects(canvas), scale ?? canvas.viewport?.scale ?? 1,
    )
    const bestX = x + dx
    const bestY = y + dy

    if (self.x === bestX && self.y === bestY) return

    const movedCard = { ...self, x: bestX, y: bestY, instantOrder: undefined }
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

    const GAP = CARD_SNAP_GAP
    const SECTION_PAD = 24
    const SECTION_HEADER = 36

    const isFullyInside = (cd: Card, sec: Section) =>
      cd.x >= sec.x && cd.y >= sec.y + SECTION_HEADER &&
      cd.x + cd.width <= sec.x + sec.width &&
      cd.y + (cd.height ?? 200) <= sec.y + sec.height

    const placementInSection = (cd: Card, sec: Section) => {
      const cardHeight = cd.height ?? 200
      const contentTop = sec.y + SECTION_HEADER
      const contentHeight = Math.max(0, sec.height - SECTION_HEADER)
      const overlapWidth = Math.max(
        0,
        Math.min(cd.x + cd.width, sec.x + sec.width) - Math.max(cd.x, sec.x),
      )
      const overlapHeight = Math.max(
        0,
        Math.min(cd.y + cardHeight, sec.y + sec.height) - Math.max(cd.y, contentTop),
      )
      const overlapArea = overlapWidth * overlapHeight
      const cardArea = cd.width * cardHeight
      const contentArea = sec.width * contentHeight
      const overlapRatio = overlapArea / Math.max(1, Math.min(cardArea, contentArea))
      const centerX = cd.x + cd.width / 2
      const centerY = cd.y + cardHeight / 2
      const centerInside =
        centerX >= sec.x && centerX <= sec.x + sec.width &&
        centerY >= contentTop && centerY <= sec.y + sec.height

      return {
        accepted: centerInside || overlapRatio >= 0.25,
        overlapArea,
      }
    }

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
        if (isCardSnappedAdjacent(cdRect, mRect, GAP, 1, CARD_VERTICAL_SNAP_GAP)) return true
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
      const nextX = Math.min(sec.x, minX - SECTION_PAD)
      const nextY = Math.min(sec.y, minY - SECTION_PAD - SECTION_HEADER)
      const nextRight = Math.max(sec.x + sec.width, maxX + SECTION_PAD)
      const nextBottom = Math.max(sec.y + sec.height, maxY + SECTION_PAD)
      return {
        ...sec,
        cardIds: memberIds,
        x: nextX,
        y: nextY,
        width: nextRight - nextX,
        height: nextBottom - nextY,
      }
    }

    const candidates = sections
      .map((sec) => {
        const placement = placementInSection(card, sec)
        const snapped = snappedToMemberOf(card, sec)
        return { sec, ...placement, snapped }
      })
      .filter((candidate) => candidate.accepted || candidate.snapped)
      .sort((a, b) => {
        if (b.overlapArea !== a.overlapArea) return b.overlapArea - a.overlapArea
        const aWasMember = (a.sec.cardIds ?? []).includes(cardId) ? 1 : 0
        const bWasMember = (b.sec.cardIds ?? []).includes(cardId) ? 1 : 0
        return bWasMember - aWasMember
      })

    const targetSection = candidates[0]?.sec
    const result = sections.map((sec) => {
      const members = sec.cardIds ?? []
      const isMember = members.includes(cardId)

      if (sec.id !== targetSection?.id) {
        return isMember
          ? { ...sec, cardIds: members.filter((id) => id !== cardId) }
          : sec
      }

      const nextMembers = isMember ? members : [...members, cardId]
      if (isFullyInside(card, sec)) {
        return isMember ? sec : { ...sec, cardIds: nextMembers }
      }
      return expandToFit(sec, nextMembers)
    })

    if (result.every((sec, index) => sec === sections[index])) return

    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId ? { ...c, sections: result } : c,
      ),
    }))
    get().persist()
  },

  setEditingCard: (cardId) => {
    if (cardId && get().instantEditingCardId === cardId) return
    set({ editingCardId: cardId })
  },

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
          ? { ...c, labels: (c.labels ?? []).filter((l) => l.id !== labelId), connections: withoutConnectionsTo(c.connections, new Set([labelId])) }
          : c,
      ),
    }))
    get().persist()
  },

  moveLabel: (labelId, x, y, scale = 1) => {
    const { activeCanvasId } = get()
    const canvas = get().canvases.find(c => c.id === activeCanvasId)
    const label = canvas?.labels?.find(l => l.id === labelId)
    if (!canvas || !label) return
    const { dx, dy } = snapCanvasRects([{ ...label, kind: 'label', x, y, height: labelHeight(label) }], canvasSnapRects(canvas), scale)
    x += dx
    y += dy
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

  updateSections: (ids, patch) => {
    const validPatch = sanitizeSectionAppearancePatch(patch)
    const keys = Object.keys(validPatch) as (keyof SectionAppearance)[]
    if (ids.length === 0 || keys.length === 0) return
    const { activeCanvasId, canvases } = get()
    const canvas = canvases.find((item) => item.id === activeCanvasId)
    if (!canvas?.sections?.length) return
    const selectedIds = new Set(ids)
    let changed = false
    const sections = canvas.sections.map((section) => {
      if (!selectedIds.has(section.id)) return section
      const appearance = getSectionAppearance(section)
      if (!keys.some((key) => appearance[key] !== validPatch[key])) return section
      changed = true
      const next = { ...section, ...validPatch }
      // Legacy sections derive their border from the fill. Freeze that old border
      // before changing the fill so the two color controls remain independent.
      if (validPatch.color && validPatch.color !== appearance.color && validPatch.borderColor === undefined &&
        sanitizeSectionAppearancePatch(section).borderColor === undefined) {
        next.borderColor = appearance.borderColor
      }
      return next
    })
    if (!changed) return
    set((s) => ({
      canvases: s.canvases.map((item) => item.id === activeCanvasId ? { ...item, sections } : item),
    }))
    get().persist()
  },

  deleteSection: (sectionId) => {
    const { activeCanvasId } = get()
    if (!activeCanvasId) return
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, sections: (c.sections ?? []).filter((sec) => sec.id !== sectionId), connections: withoutConnectionsTo(c.connections, new Set([sectionId])) }
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

  compactSection: (sectionId, heights) => {
    const { activeCanvasId, canvases } = get()
    const canvas = canvases.find((item) => item.id === activeCanvasId)
    const section = canvas?.sections?.find((item) => item.id === sectionId)
    if (!canvas || !section) return
    const layout = fitSectionLayout(canvas.cards, section, heights)
    if (!layout) return
    // Commit fitted card sizes, snapped positions and section bounds together.
    // Connections retain their IDs/endpoints and follow the new card geometry.
    set((state) => ({
      canvases: state.canvases.map((item) => item.id === activeCanvasId ? {
        ...item,
        cards: layout.cards,
        sections: item.sections?.map((item) => item.id === sectionId ? layout.section : item),
      } : item),
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
          connections: withoutConnectionsTo(c.connections, new Set([...cardIds, ...labelIds, ...sectionIds])),
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
    const nodes = connectionNodes(canvas)
    if (!nodes.has(fromCardId) || !nodes.has(toCardId)) return
    const exists = (canvas.connections ?? []).some((c) => c.fromCardId === fromCardId && c.toCardId === toCardId)
    if (exists) return
    const conn: Connection = { id: uuid(), fromCardId, toCardId, routing: 'elbow' }
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === activeCanvasId
          ? { ...c, connections: [...(c.connections ?? []), conn] }
          : c,
      ),
    }))
    get().persist()
  },

  updateConnection: (connId, patch) => {
    set(s => ({ canvases: s.canvases.map(c => c.id === s.activeCanvasId
      ? { ...c, connections: (c.connections ?? []).map(conn => conn.id === connId ? { ...conn, ...patch } : conn) }
      : c) }))
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
