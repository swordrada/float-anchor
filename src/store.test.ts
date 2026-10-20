import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { estimateInstantCardHeight, getEffectiveProvider, isCardSnappedAdjacent, selectActiveCards, selectActiveLabels, selectActiveTexts, selectActiveSections, selectActiveConnections, useStore } from './store'
import type { AppData, AppSettings, Canvas, Card, ConnectionAppearancePatch, ConnectionSide, Section, SectionAppearancePatch } from './types'
import { getConnectionAppearance } from './connectionStyle'
import { getSectionAppearance } from './sectionStyle'
import { mergeAppData } from './lib/mergeData'
import { getComparableSyncSnapshot, normalizeSyncData } from '../electron/sync/summary'

describe('当前画布集合的稳定引用', () => {
  const selectors = [
    { key: 'cards', select: selectActiveCards },
    { key: 'labels', select: selectActiveLabels },
    { key: 'texts', select: selectActiveTexts },
    { key: 'sections', select: selectActiveSections },
    { key: 'connections', select: selectActiveConnections },
  ] as const

  const makeCanvas = (id: string): Canvas => ({
    id,
    name: id,
    cards: [{ id: `${id}-card`, title: '', content: '', x: 0, y: 0, width: 200 }],
    labels: [{ id: `${id}-label`, text: '', level: 1, x: 0, y: 0, width: 200 }],
    texts: [{ id: `${id}-text`, text: '', x: 0, y: 0, width: 200 }],
    sections: [{ id: `${id}-section`, name: '', color: '#fff', x: 0, y: 0, width: 400, height: 400 }],
    connections: [{ id: `${id}-connection`, fromCardId: `${id}-card`, toCardId: `${id}-other` }],
  })

  it.each(selectors)('$key 缺省时重复读取或切换无效画布均返回同一个空数组', ({ key, select }) => {
    const state = { activeCanvasId: 'missing', canvases: [] }
    const empty = select(state)
    expect(empty).toEqual([])
    expect(select(state)).toBe(empty)
    expect(select({ ...state })).toBe(empty)
    expect(select({ ...state, activeCanvasId: null })).toBe(empty)
    if (key !== 'cards') {
      expect(select({ activeCanvasId: 'legacy', canvases: [{ id: 'legacy', name: '', cards: [] }] })).toBe(empty)
    }
  })

  it.each(selectors)('$key 保持真实集合引用，包括已有的空集合', ({ key, select }) => {
    const canvas = makeCanvas('one')
    const state = { activeCanvasId: 'one', canvases: [canvas] }
    expect(select(state)).toBe(canvas[key])
    expect(select({ ...state, canvases: [{ ...canvas, name: '重命名' }] })).toBe(canvas[key])
    const emptyCanvas = { ...canvas, [key]: [] }
    expect(select({ ...state, canvases: [emptyCanvas] })).toBe(emptyCanvas[key])
  })

  it.each(selectors)('$key 随活动画布切换读取对应集合，不沿用旧画布数据', ({ key, select }) => {
    const first = makeCanvas('first')
    const second = makeCanvas('second')
    const state = { activeCanvasId: first.id, canvases: [first, second] }
    expect(select(state)).toBe(first[key])
    expect(select({ ...state, activeCanvasId: second.id })).toBe(second[key])
    expect(select(state)).toBe(first[key])
  })
})

describe('isCardSnappedAdjacent（拖拽贴靠分区成员的判定）', () => {
  const GAP = 12
  const A = { x: 0, y: 100, width: 200, height: 150 } // 成员：x∈[0,200] y∈[100,250]

  // —— 合法相邻：必须仍为 true（防止"漏吸附"回归） ——
  it('右邻：带 GAP、同一行 → true', () => {
    expect(isCardSnappedAdjacent({ x: 212, y: 100, width: 200, height: 150 }, A, GAP)).toBe(true)
  })
  it('左邻：带 GAP、同一行 → true', () => {
    expect(isCardSnappedAdjacent({ x: -212, y: 100, width: 200, height: 150 }, A, GAP)).toBe(true)
  })
  it('右邻：同一行但只部分纵向重叠 → true', () => {
    expect(isCardSnappedAdjacent({ x: 212, y: 180, width: 200, height: 150 }, A, GAP)).toBe(true)
  })
  it('下邻：带 GAP、左对齐同一列 → true', () => {
    expect(isCardSnappedAdjacent({ x: 0, y: 262, width: 200, height: 150 }, A, GAP)).toBe(true)
  })
  it('上邻：带 GAP、左对齐同一列 → true', () => {
    expect(isCardSnappedAdjacent({ x: 0, y: -62, width: 200, height: 150 }, A, GAP)).toBe(true)
  })
  it('下邻：横向只部分重叠（错位半格）→ true', () => {
    expect(isCardSnappedAdjacent({ x: 100, y: 262, width: 200, height: 150 }, A, GAP)).toBe(true)
  })
  it('直接压在成员上（左上对齐、重叠）→ true', () => {
    expect(isCardSnappedAdjacent({ x: 0, y: 100, width: 200, height: 150 }, A, GAP)).toBe(true)
  })

  // —— bug 几何：单轴对齐而另一轴远离，必须 false（修复点） ——
  it('左边缘对齐但 y 相距很远（不同分区）→ false', () => {
    expect(isCardSnappedAdjacent({ x: 0, y: 3000, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
  it('右边缘对齐但 y 相距很远 → false', () => {
    expect(isCardSnappedAdjacent({ x: 0, y: -3000, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
  it('顶边对齐但 x 相距很远（不同分区）→ false', () => {
    expect(isCardSnappedAdjacent({ x: 3000, y: 100, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
  it('底边对齐但 x 相距很远 → false', () => {
    expect(isCardSnappedAdjacent({ x: -3000, y: 100, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
  it('GAP 列对齐但 y 远离（同列不同分区）→ false', () => {
    expect(isCardSnappedAdjacent({ x: 212, y: 3000, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
  it('完全不挨着 → false', () => {
    expect(isCardSnappedAdjacent({ x: 3000, y: 3000, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
  it('仅对角角接触（右下各隔一个 GAP，无边重叠）→ false（更合理）', () => {
    expect(isCardSnappedAdjacent({ x: 212, y: 262, width: 200, height: 150 }, A, GAP)).toBe(false)
  })
})

describe('finalizeCardMove（分区贴靠的集成行为）', () => {
  const mkCard = (id: string, x: number, y: number, w = 200, h = 150): Card =>
    ({ id, title: '', content: '', x, y, width: w, height: h })
  const mkSection = (id: string, x: number, y: number, w: number, h: number, cardIds: string[]): Section =>
    ({ id, name: id, x, y, width: w, height: h, color: '#fff', cardIds })

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as unknown as { window: unknown }).window = { electronAPI: { writeData: () => Promise.resolve(true) } }
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as unknown as { window?: unknown }).window
  })

  const setup = (cards: Card[], sections: Section[]) => {
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [{ id: 'cv', name: 'cv', cards, sections }],
      settings: { theme: 'light' } as AppSettings,
      syncDecision: null,
    })
  }

  it('远处分区不因单轴对齐被拉伸/吸附（bug 复现 → 已修）', () => {
    // cX 属于 A 且完全在 A 内；B 远在右侧，其成员 c2 与 cX 顶边对齐(y 同) 但 x 相距很远
    const cX = mkCard('cX', 50, 100)   // 在 A 内
    const c2 = mkCard('c2', 2000, 100) // B 成员，与 cX 顶边对齐
    const A = mkSection('A', 0, 0, 500, 500, ['cX'])
    const B = mkSection('B', 1990, 50, 300, 300, ['c2'])
    setup([cX, c2], [A, B])

    useStore.getState().finalizeCardMove('cX')

    const cv = useStore.getState().canvases[0]
    const a = cv.sections!.find((s) => s.id === 'A')!
    const b = cv.sections!.find((s) => s.id === 'B')!
    // B 几何完全不变、不吸纳 cX
    expect({ x: b.x, y: b.y, width: b.width, height: b.height }).toEqual({ x: 1990, y: 50, width: 300, height: 300 })
    expect(b.cardIds).toEqual(['c2'])
    // cX 仍属于 A
    expect(a.cardIds).toContain('cX')
  })

  it('近邻分区仍正常吸附扩展（防回归）', () => {
    // cX 不属于任何分区，紧贴 B 成员 c2 右侧(同一行、带 GAP)
    const c2 = mkCard('c2', 2000, 100)
    const cX = mkCard('cX', 2212, 100) // c2 右侧 GAP 紧邻
    const B = mkSection('B', 1990, 50, 300, 300, ['c2'])
    setup([cX, c2], [B])

    useStore.getState().finalizeCardMove('cX')

    const b = useStore.getState().canvases[0].sections!.find((s) => s.id === 'B')!
    expect(b.cardIds).toContain('cX')                  // 吸纳
    expect(b.x + b.width).toBeGreaterThanOrEqual(2412) // 扩展到包住 cX 右边(2212+200)
  })

  it('超出分区宽度和高度的卡片放入空分区后，分区自动吸纳并扩容', () => {
    const oversized = mkCard('large', 50, 60, 500, 400)
    const section = mkSection('S', 0, 0, 300, 220, [])
    setup([oversized], [section])

    useStore.getState().finalizeCardMove('large')

    const fitted = useStore.getState().canvases[0].sections![0]
    expect(fitted.cardIds).toContain('large')
    expect(fitted.x + fitted.width).toBeGreaterThanOrEqual(oversized.x + oversized.width + 24)
    expect(fitted.y + fitted.height).toBeGreaterThanOrEqual(oversized.y + oversized.height! + 24)
  })

  it('只有轻微擦边的卡片不会误吸入并拉伸分区', () => {
    const grazing = mkCard('grazing', 295, 60, 200, 100)
    const section = mkSection('S', 0, 0, 300, 220, [])
    setup([grazing], [section])

    useStore.getState().finalizeCardMove('grazing')

    const unchanged = useStore.getState().canvases[0].sections![0]
    expect(unchanged.cardIds).toEqual([])
    expect({ x: unchanged.x, y: unchanged.y, width: unchanged.width, height: unchanged.height })
      .toEqual({ x: 0, y: 0, width: 300, height: 220 })
  })
})

describe('getEffectiveProvider', () => {
  it('无 syncProvider 但有 webdav.server → webdav（老用户兜底）', () => {
    const settings: AppSettings = { theme: 'light', webdav: { server: 'x', username: '', password: '' } }
    expect(getEffectiveProvider(settings)).toBe('webdav')
  })

  it('无 syncProvider 且无 webdav → none', () => {
    const settings: AppSettings = { theme: 'light' }
    expect(getEffectiveProvider(settings)).toBe('none')
  })

  it('显式 syncProvider=none 时，即使有 webdav.server 也返回 none', () => {
    const settings: AppSettings = { theme: 'light', syncProvider: 'none', webdav: { server: 'x', username: '', password: '' } }
    expect(getEffectiveProvider(settings)).toBe('none')
  })

})

describe('从所选卡片创建分区', () => {
  const originalPersist = useStore.getState().persist
  const persist = vi.fn()
  const mkCard = (id: string, x: number, y: number, width = 200, height?: number): Card =>
    ({ id, title: '', content: '', x, y, width, height })

  beforeEach(() => {
    persist.mockClear()
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [{ id: 'cv', name: 'cv', cards: [] }],
      persist,
    })
  })

  afterEach(() => {
    useStore.setState({ persist: originalPersist })
  })

  it('包裹所有成员并留出标题和内边距，不移动卡片或吸纳未选中的卡片', () => {
    const cards = [mkCard('a', -100, 50, 180, 80), mkCard('b', 200, 120, 300, 350), mkCard('outside', 100, 200, 50, 50)]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards }] })

    const sectionId = useStore.getState().createSectionFromCards(['a', 'b'])
    const canvas = useStore.getState().canvases[0]

    expect(sectionId).not.toBeNull()
    expect(canvas.sections).toEqual([{
      id: sectionId,
      name: '分区',
      x: -124,
      y: -10,
      width: 648,
      height: 504,
      color: '#9ca3af',
      cardIds: ['a', 'b'],
    }])
    expect(canvas.cards).toEqual(cards)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('转移已有分区的成员，忽略重复和其他画布的卡片 ID，且原子保存', () => {
    const first: Section = { id: 'first', name: '原分区', x: 0, y: 0, width: 500, height: 500, color: '#fff', cardIds: ['a', 'keep'] }
    const second: Section = { ...first, id: 'second', cardIds: ['b'] }
    const otherCanvas = { id: 'other', name: '另一画布', cards: [mkCard('other-card', 0, 0, 200, 150)], sections: [{ ...first, id: 'other-section', cardIds: ['other-card'] }] }
    useStore.setState({ canvases: [
      { id: 'cv', name: 'cv', cards: [mkCard('a', 20, 60, 200, 150), mkCard('b', 250, 60, 200, 150), mkCard('keep', 20, 250, 200, 150)], sections: [first, second] },
      otherCanvas,
    ] })
    const changes = vi.fn()
    const unsubscribe = useStore.subscribe(changes)

    const sectionId = useStore.getState().createSectionFromCards(['a', 'a', 'missing', 'other-card', 'b'])
    unsubscribe()
    const [canvas, unchangedCanvas] = useStore.getState().canvases

    expect(canvas.sections![0]).toEqual({ ...first, cardIds: ['keep'] })
    expect(canvas.sections![1]).toEqual({ ...second, cardIds: [] })
    expect(canvas.sections![2]).toMatchObject({ id: sectionId, color: '#34d399', cardIds: ['a', 'b'] })
    expect(unchangedCanvas).toBe(otherCanvas)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('再次编组同一分区的全部成员时返回原分区，不创建重叠的空壳', () => {
    const cards = [mkCard('a', 20, 60, 200, 150), mkCard('b', 250, 60, 200, 150)]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards }] })
    const firstId = useStore.getState().createSectionFromCards(['a', 'b'])
    const canvases = useStore.getState().canvases
    persist.mockClear()

    const repeatedId = useStore.getState().createSectionFromCards(['b', 'a', 'a', 'missing'])

    expect(repeatedId).toBe(firstId)
    expect(useStore.getState().canvases).toBe(canvases)
    expect(useStore.getState().canvases[0].sections).toHaveLength(1)
    expect(persist).not.toHaveBeenCalled()
  })

  it('成员引用相同但卡片已经位于旧分区外时，创建能包裹当前位置的新分区', () => {
    const cards = [mkCard('a', 20, 60, 200, 150), mkCard('b', 250, 60, 200, 150)]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards }] })
    const firstId = useStore.getState().createSectionFromCards(['a', 'b'])
    useStore.getState().nudgeUnits({ cardIds: ['a', 'b'], labelIds: [], sectionIds: [], textIds: [] }, 2000, 500)

    const newId = useStore.getState().createSectionFromCards(['a', 'b'])

    expect(newId).not.toBe(firstId)
    const sections = useStore.getState().canvases[0].sections!
    expect(sections.find((section) => section.id === firstId)!.cardIds).toEqual([])
    expect(sections.find((section) => section.id === newId)).toMatchObject({ x: 1996, y: 500, cardIds: ['a', 'b'] })
  })

  it('整体拖动新分区时只带动成员，删除分区保留卡片及连线', () => {
    const cards = [mkCard('a', 20, 60, 200, 150), mkCard('b', 250, 60, 200, 150), mkCard('unselected', 500, 60, 200, 150)]
    const connections = [{ id: 'connection', fromCardId: 'a', toCardId: 'b' }]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards, connections }] })
    const sectionId = useStore.getState().createSectionFromCards(['a', 'b'])!

    useStore.getState().moveSection(sectionId, 30, -15)
    let canvas = useStore.getState().canvases[0]
    expect(canvas.cards).toEqual([
      { ...cards[0], x: 50, y: 45 },
      { ...cards[1], x: 280, y: 45 },
      cards[2],
    ])
    expect(canvas.sections![0]).toMatchObject({ x: 26, y: -15 })

    useStore.getState().deleteSection(sectionId)
    canvas = useStore.getState().canvases[0]
    expect(canvas.sections).toEqual([])
    expect(canvas.cards).toHaveLength(3)
    expect(canvas.connections).toEqual(connections)
  })

  it('在重叠的旧分区内编组后，轻微拖动卡片不会把归属改回旧分区', () => {
    useStore.setState({ canvases: [{
      id: 'cv',
      name: 'cv',
      cards: [mkCard('a', 20, 60, 200, 150), mkCard('b', 400, 300, 200, 150), mkCard('keep', 800, 800, 200, 150)],
      sections: [{ id: 'old', name: '旧分区', x: -200, y: -200, width: 1200, height: 1200, color: '#fff', cardIds: ['a', 'b', 'keep'] }],
    }] })
    const sectionId = useStore.getState().createSectionFromCards(['a', 'b'])

    useStore.getState().moveCard('a', 35, 80)
    useStore.getState().finalizeCardMove('a')

    const sections = useStore.getState().canvases[0].sections!
    expect(sections.find((section) => section.id === 'old')!.cardIds).toEqual(['keep'])
    expect(sections.find((section) => section.id === sectionId)!.cardIds).toEqual(['a', 'b'])
  })

  it('批量拖出分区的相邻成员不会互相吸附并拉伸原分区', () => {
    const cards = [mkCard('a', 20, 60, 200, 150), mkCard('b', 232, 60, 200, 150)]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards }] })
    useStore.getState().createSectionFromCards(['a', 'b'])
    const originalSection = useStore.getState().canvases[0].sections![0]
    useStore.getState().nudgeUnits({ cardIds: ['a', 'b'], labelIds: [], textIds: [], sectionIds: [] }, 2000, 500)
    const movedCards = useStore.getState().canvases[0].cards
    persist.mockClear()

    useStore.getState().finalizeCardMoves(['a', 'b', 'a', 'missing'])

    const canvas = useStore.getState().canvases[0]
    expect(canvas.sections).toEqual([{ ...originalSection, cardIds: [] }])
    expect(canvas.cards).toEqual(movedCards)
    expect(persist).toHaveBeenCalled()
  })

  it('批量拖入新分区时转移全部有效成员，保持卡片相对位置和原分区大小', () => {
    const cards = [mkCard('a', 20, 60, 200, 150), mkCard('b', 232, 60, 200, 150)]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards }] })
    useStore.getState().createSectionFromCards(['a', 'b'])
    const canvas = useStore.getState().canvases[0]
    const originalSection = canvas.sections![0]
    const target: Section = { id: 'target', name: '目标分区', x: 1000, y: 100, width: 500, height: 300, color: '#fff', cardIds: [] }
    useStore.setState({ canvases: [{ ...canvas, sections: [...canvas.sections!, target] }] })
    useStore.getState().nudgeUnits({ cardIds: ['a', 'b'], labelIds: [], textIds: [], sectionIds: [] }, 1000, 100)
    const movedCards = useStore.getState().canvases[0].cards

    useStore.getState().finalizeCardMoves(['a', 'b', 'a', 'missing'])

    const movedCanvas = useStore.getState().canvases[0]
    expect(movedCanvas.sections).toEqual([
      { ...originalSection, cardIds: [] },
      { ...target, cardIds: ['a', 'b'] },
    ])
    expect(movedCanvas.cards).toEqual(movedCards)
    expect(movedCanvas.cards[1].x - movedCanvas.cards[0].x).toBe(212)
    expect(movedCanvas.cards[1].y - movedCanvas.cards[0].y).toBe(0)
  })

  it('批量完成重叠区域内的拖动时保留完整包含卡片的新分组归属', () => {
    const old: Section = { id: 'old', name: '旧分区', x: -200, y: -200, width: 1200, height: 1200, color: '#fff', cardIds: ['a', 'b', 'keep'] }
    useStore.setState({ canvases: [{
      id: 'cv', name: 'cv',
      cards: [mkCard('a', 20, 60, 200, 150), mkCard('b', 400, 300, 200, 150), mkCard('keep', 800, 800, 200, 150)],
      sections: [old],
    }] })
    const sectionId = useStore.getState().createSectionFromCards(['a', 'b'])
    useStore.getState().nudgeUnits({ cardIds: ['a', 'b'], labelIds: [], textIds: [], sectionIds: [] }, 10, 10)

    useStore.getState().finalizeCardMoves(['a', 'b'])

    const sections = useStore.getState().canvases[0].sections!
    expect(sections.find((section) => section.id === 'old')).toEqual({ ...old, cardIds: ['keep'] })
    expect(sections.find((section) => section.id === sectionId)!.cardIds).toEqual(['a', 'b'])
  })

  it('未测量高度的长卡片使用内容估算，之后测量变高时继续扩容', () => {
    const content = Array.from({ length: 36 }, (_, index) => `第 ${index + 1} 行内容`).join('\n')
    const card = { ...mkCard('a', 100, 80), title: '长卡片', content }
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards: [card] }] })

    useStore.getState().createSectionFromCards(['a'])
    let section = useStore.getState().canvases[0].sections![0]
    expect(section.y + section.height).toBe(card.y + estimateInstantCardHeight(card.title, card.content) + 24)
    expect(section.height).toBeGreaterThan(700)
    expect(useStore.getState().canvases[0].cards[0].height).toBeUndefined()

    useStore.getState().updateCard('a', { height: 1200 })
    section = useStore.getState().canvases[0].sections![0]
    expect(section.y + section.height).toBeGreaterThanOrEqual(card.y + 1200 + 24)
  })

  it('手动编组后保持即刻卡片布局，测高和编辑不重新排列成员', () => {
    const cards = [
      { ...mkCard('a', 250, 60, 200, 150), instantOrder: 1 },
      { ...mkCard('b', 20, 60, 200, 150), instantOrder: 2 },
    ]
    useStore.setState({ canvases: [{ id: 'cv', name: 'cv', cards }] })
    useStore.getState().createSectionFromCards(['a', 'b'])

    useStore.getState().updateCard('a', { height: 300, content: '更新正文' })

    const groupedCards = useStore.getState().canvases[0].cards
    expect(groupedCards.map(({ x, y, instantOrder }) => ({ x, y, instantOrder }))).toEqual([
      { x: 250, y: 60, instantOrder: undefined },
      { x: 20, y: 60, instantOrder: undefined },
    ])
  })

  it('空选择或全部失效的选择不会创建空分区或保存', () => {
    const canvases = useStore.getState().canvases
    expect(useStore.getState().createSectionFromCards([])).toBeNull()
    expect(useStore.getState().createSectionFromCards(['missing', 'missing'])).toBeNull()
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('没有有效的当前画布时安全返回', () => {
    useStore.setState({ activeCanvasId: null })
    expect(useStore.getState().createSectionFromCards(['a'])).toBeNull()
    useStore.setState({ activeCanvasId: 'missing' })
    expect(useStore.getState().createSectionFromCards(['a'])).toBeNull()
    expect(persist).not.toHaveBeenCalled()
  })
})

describe('每日记与白板视图', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as unknown as { window: unknown }).window = { electronAPI: { writeData: () => Promise.resolve(true) } }
    useStore.setState({
      activeView: 'boards',
      boardViewMode: 'canvas',
      journal: { entriesByDate: {} },
      journalViewMode: 'detail',
      journalSelectedDate: '2026-07-25',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('切到每日记并保存内容后，保留日期和标题', () => {
    useStore.getState().openDailyJournal()
    useStore.getState().upsertJournalEntry('2026-07-25', { customTitle: '今天的记录', content: '保留每日记' })

    const state = useStore.getState()
    expect(state.activeView).toBe('journal')
    expect(state.journal.entriesByDate['2026-07-25']).toMatchObject({
      customTitle: '今天的记录',
      content: '保留每日记',
    })
  })

  it('从白板总览打开指定白板时回到白板画布', () => {
    useStore.getState().openBoardOverview()
    useStore.getState().setActiveCanvas('cv')

    const state = useStore.getState()
    expect(state.activeView).toBe('boards')
    expect(state.boardViewMode).toBe('canvas')
    expect(state.activeCanvasId).toBe('cv')
  })
})

describe('即刻模式写入', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as unknown as { window: unknown }).window = {
      electronAPI: { writeData: () => Promise.resolve(true) },
    }
    useStore.setState({
      activeCanvasId: 'cv',
      activeView: 'boards',
      boardViewMode: 'canvas',
      canvases: [{
        id: 'cv',
        name: '灵感白板',
        cards: [],
        sections: [{
          id: 's1',
          name: '待整理',
          x: 100,
          y: 80,
          width: 430,
          height: 150,
          color: '#60a5fa',
          cardIds: [],
        }],
      }],
      settings: { theme: 'light' } as AppSettings,
      syncDecision: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('新建白板后自动选中该白板', () => {
    const canvasId = useStore.getState().createInstantCanvas('闪念收集')
    const state = useStore.getState()

    expect(state.activeCanvasId).toBe(canvasId)
    expect(state.canvases.find((canvas) => canvas.id === canvasId)).toMatchObject({
      name: '闪念收集',
      cards: [],
    })
  })

  it('新建分区后自动选择目标白板并使用轮换色', () => {
    const sectionId = useStore.getState().createInstantSection('cv', '马上行动')
    const state = useStore.getState()
    const section = state.canvases[0].sections?.find((item) => item.id === sectionId)

    expect(state.activeCanvasId).toBe('cv')
    expect(section).toMatchObject({
      name: '马上行动',
      color: '#60a5fa',
      cardIds: [],
    })
  })

  it('Markdown 卡片写入所选分区并自动扩展分区边界', () => {
    const cardId = useStore.getState().createInstantCard(
      'cv',
      's1',
      '今日想法',
      '## 今日想法\n\n- [ ] 验证即刻模式',
    )
    const canvas = useStore.getState().canvases[0]
    const card = canvas.cards.find((item) => item.id === cardId)
    const section = canvas.sections?.[0]

    expect(card).toMatchObject({
      title: '今日想法',
      content: '## 今日想法\n\n- [ ] 验证即刻模式',
      x: 124,
      y: 140,
      width: 373,
    })
    expect(section?.cardIds).toContain(cardId)
    expect(section?.height).toBeGreaterThanOrEqual(284)
    expect(useStore.getState().highlightCardId).toBe(cardId)
  })

  it('只有标题时也可以快速创建卡片', () => {
    const cardId = useStore.getState().createInstantCard('cv', null, '稍后继续展开', '')
    const card = useStore.getState().canvases[0].cards.find((item) => item.id === cardId)

    expect(card).toMatchObject({
      title: '稍后继续展开',
      content: '',
    })
  })

  it('成员卡片保存后变高时，所属分区同步扩展到底部留白之外', () => {
    const cardId = useStore.getState().createInstantCard('cv', 's1', '长笔记', '正文')
    expect(cardId).not.toBeNull()

    useStore.getState().updateCard(cardId!, { height: 620 })

    const canvas = useStore.getState().canvases[0]
    const card = canvas.cards.find((item) => item.id === cardId)!
    const section = canvas.sections?.find((item) => item.id === 's1')!
    expect(section.y + section.height).toBeGreaterThanOrEqual(card.y + card.height! + 24)
  })

  it('连续写入时先横排、再换行并优先填满当前行', () => {
    const ids = Array.from({ length: 4 }, (_, index) =>
      useStore.getState().createInstantCard('cv', 's1', `卡片 ${index + 1}`, '正文'),
    ) as string[]
    const canvas = useStore.getState().canvases[0]
    const cards = ids.map((id) => canvas.cards.find((card) => card.id === id)!)
    const [first, second, third, fourth] = cards

    expect(second.x).toBe(first.x + first.width + 12)
    expect(second.y).toBe(first.y)
    expect(third.x).toBe(first.x)
    expect(third.y).toBe(first.y + first.height! + 12)
    expect(fourth.x).toBe(second.x)
    expect(fourth.y).toBe(third.y)

    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]
        const b = cards[j]
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height! && a.y + a.height! > b.y
        expect(overlap).toBe(false)
      }
    }
  })

  it('真实高度变大后重排后续即刻卡片并继续包裹全部内容', () => {
    const ids = Array.from({ length: 4 }, (_, index) =>
      useStore.getState().createInstantCard('cv', 's1', `卡片 ${index + 1}`, '正文'),
    ) as string[]
    useStore.getState().updateCard(ids[0], { height: 620 })

    const canvas = useStore.getState().canvases[0]
    const cards = ids.map((id) => canvas.cards.find((card) => card.id === id)!)
    const section = canvas.sections![0]
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      expect(card.x).toBeGreaterThanOrEqual(section.x + 24)
      expect(card.y).toBeGreaterThanOrEqual(section.y + 36 + 24)
      expect(card.x + card.width + 24).toBeLessThanOrEqual(section.x + section.width)
      expect(card.y + card.height! + 24).toBeLessThanOrEqual(section.y + section.height)
      for (let j = i + 1; j < cards.length; j++) {
        const other = cards[j]
        const overlap = card.x < other.x + other.width && card.x + card.width > other.x &&
          card.y < other.y + other.height! && card.y + card.height! > other.y
        expect(overlap).toBe(false)
      }
    }
  })

  it('长 Markdown 在首次渲染前也使用内容高度扩展分区', () => {
    const content = Array.from({ length: 36 }, (_, index) => `- 第 ${index + 1} 行较长的卡片内容`).join('\n')
    const cardId = useStore.getState().createInstantCard('cv', 's1', '长卡片', content)!
    const canvas = useStore.getState().canvases[0]
    const card = canvas.cards.find((item) => item.id === cardId)!
    const section = canvas.sections![0]

    expect(card.height).toBe(estimateInstantCardHeight('长卡片', content))
    expect(card.height).toBeGreaterThan(700)
    expect(section.y + section.height).toBeGreaterThanOrEqual(card.y + card.height! + 24)
  })
})

describe('删除卡片清理悬空引用（#3）', () => {
  const mkCard = (id: string): Card => ({ id, title: '', content: '', x: 0, y: 0, width: 200, height: 150 })

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as unknown as { window: unknown }).window = { electronAPI: { writeData: () => Promise.resolve(true) } }
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as unknown as { window?: unknown }).window
  })

  const setup = () => {
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [{
        id: 'cv', name: 'cv',
        cards: [mkCard('c1'), mkCard('c2'), mkCard('c3')],
        connections: [
          { id: 'cn1', fromCardId: 'c1', toCardId: 'c2' },
          { id: 'cn2', fromCardId: 'c2', toCardId: 'c3' },
        ],
        sections: [{ id: 's1', name: 's', x: 0, y: 0, width: 400, height: 400, color: '#fff', cardIds: ['c1', 'c2'] }],
      }],
      settings: { theme: 'light' } as AppSettings,
      syncDecision: null,
    })
  }

  it('deleteUnits 删卡片后，清理指向它的连接 + 分区成员引用', () => {
    setup()
    useStore.getState().deleteUnits({ cardIds: ['c1'], labelIds: [], sectionIds: [], textIds: [] })
    const cv = useStore.getState().canvases[0]
    expect(cv.cards.map((c) => c.id)).toEqual(['c2', 'c3'])
    expect((cv.connections ?? []).map((c) => c.id)).toEqual(['cn2'])           // cn1(c1↔c2) 被清
    expect(cv.sections![0].cardIds).toEqual(['c2'])                            // 分区成员去掉 c1
  })

  it('deleteCard 单删后，同样清理连接 + 分区成员引用', () => {
    setup()
    useStore.getState().deleteCard('c2')
    const cv = useStore.getState().canvases[0]
    expect(cv.cards.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect((cv.connections ?? []).map((c) => c.id)).toEqual([])               // cn1、cn2 都引用 c2 → 全清
    expect(cv.sections![0].cardIds).toEqual(['c1'])                           // 分区成员去掉 c2
  })
})

describe('卡片连线只引用当前画布的有效卡片', () => {
  const originalPersist = useStore.getState().persist
  const persist = vi.fn()
  const mkCard = (id: string): Card => ({ id, title: '', content: '', x: 0, y: 0, width: 200, height: 150 })

  beforeEach(() => {
    persist.mockClear()
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [
        { id: 'cv', name: 'cv', cards: [mkCard('a'), mkCard('b')] },
        { id: 'other', name: 'other', cards: [mkCard('other-card')] },
      ],
      persist,
    })
  })

  afterEach(() => {
    useStore.setState({ persist: originalPersist })
    vi.unstubAllGlobals()
  })

  it('拒绝自连、已删除端点和其他画布端点，不保存悬空引用', () => {
    const canvases = useStore.getState().canvases
    const { addConnection } = useStore.getState()
    addConnection('a', 'a')
    addConnection('deleted', 'b')
    addConnection('a', 'deleted')
    addConnection('other-card', 'b')
    addConnection('a', 'other-card')
    const ports = { fromSide: 'right', toSide: 'left' } as const
    addConnection('a', 'a', ports)
    addConnection('deleted', 'b', ports)
    addConnection('a', 'deleted', ports)
    addConnection('other-card', 'b', ports)
    addConnection('a', 'other-card', ports)
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('有效连线同方向去重，反方向仍可单独创建', () => {
    const { addConnection } = useStore.getState()
    addConnection('a', 'b')
    addConnection('a', 'b')
    addConnection('b', 'a')

    expect(useStore.getState().canvases[0].connections).toEqual([
      { id: expect.any(String), fromCardId: 'a', toCardId: 'b' },
      { id: expect.any(String), fromCardId: 'b', toCardId: 'a' },
    ])
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('四条边的所有端口组合均可保存，相同有向端口对只创建一次', () => {
    const { addConnection } = useStore.getState()
    const sides: ConnectionSide[] = ['top', 'right', 'bottom', 'left']
    for (const fromSide of sides) {
      for (const toSide of sides) {
        addConnection('a', 'b', { fromSide, toSide })
        addConnection('a', 'b', { fromSide, toSide })
      }
    }
    const connections = useStore.getState().canvases[0].connections!
    expect(connections).toHaveLength(16)
    expect(new Set(connections.map((connection) => `${connection.fromSide}:${connection.toSide}`)).size).toBe(16)
    expect(connections.every((connection) => connection.fromCardId === 'a' && connection.toCardId === 'b')).toBe(true)
    expect(persist).toHaveBeenCalledTimes(16)
  })

  it('指定端口的反向连线可独立创建', () => {
    const { addConnection } = useStore.getState()
    addConnection('a', 'b', { fromSide: 'bottom', toSide: 'top' })
    addConnection('b', 'a', { fromSide: 'top', toSide: 'bottom' })
    expect(useStore.getState().canvases[0].connections).toEqual([
      { id: expect.any(String), fromCardId: 'a', toCardId: 'b', fromSide: 'bottom', toSide: 'top' },
      { id: expect.any(String), fromCardId: 'b', toCardId: 'a', fromSide: 'top', toSide: 'bottom' },
    ])
  })

  it('新增端口连线不会覆盖旧无端口连线，旧调用继续按同向卡片对去重', () => {
    const { addConnection } = useStore.getState()
    addConnection('a', 'b')
    const originalConnection = useStore.getState().canvases[0].connections![0]
    addConnection('a', 'b', { fromSide: 'right', toSide: 'left' })
    addConnection('a', 'b')
    addConnection('b', 'a', { fromSide: 'left', toSide: 'right' })
    addConnection('b', 'a')

    const connections = useStore.getState().canvases[0].connections!
    expect(connections).toHaveLength(3)
    expect(connections[0]).toBe(originalConnection)
    expect(connections[0]).not.toHaveProperty('fromSide')
    expect(connections[0]).not.toHaveProperty('toSide')
    expect(connections[1]).toMatchObject({ fromSide: 'right', toSide: 'left' })
    expect(persist).toHaveBeenCalledTimes(3)
  })

  it('拒绝非法或不完整的端口参数，不写入半条连线', () => {
    const canvases = useStore.getState().canvases
    const invalidPorts: unknown[] = [
      null,
      {},
      { fromSide: 'top' },
      { toSide: 'left' },
      { fromSide: 'center', toSide: 'left' },
      { fromSide: 'right', toSide: 'RIGHT' },
      { fromSide: 0, toSide: 'bottom' },
    ]
    for (const ports of invalidPorts) {
      useStore.getState().addConnection('a', 'b', ports as { fromSide: ConnectionSide; toSide: ConnectionSide })
    }
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('移动、缩放卡片及画布后保存重载，保留所有端口和旧连线', async () => {
    let saved: AppData | null = null
    vi.stubGlobal('window', { electronAPI: {
      writeData: async (data: AppData) => { saved = JSON.parse(JSON.stringify(data)); return true },
      readData: async () => saved,
    } })
    const { addConnection } = useStore.getState()
    addConnection('a', 'b')
    addConnection('a', 'b', { fromSide: 'top', toSide: 'bottom' })
    const connections = useStore.getState().canvases[0].connections

    useStore.getState().moveCard('a', 70, 80)
    useStore.getState().updateCard('b', { width: 350, height: 260 })
    useStore.getState().saveViewport('cv', { panX: 20, panY: -30, scale: 0.5 })
    await useStore.getState().flushPendingSave()
    useStore.setState({ canvases: [], activeCanvasId: null })
    await useStore.getState().loadData()

    expect(useStore.getState().canvases[0].connections).toEqual(connections)
    expect(useStore.getState().canvases[0].cards[0]).toMatchObject({ x: 70, y: 80 })
    expect(useStore.getState().canvases[0].cards[1]).toMatchObject({ width: 350, height: 260 })
    expect(useStore.getState().canvases[0].viewport).toEqual({ panX: 20, panY: -30, scale: 0.5 })
  })

  it('同步快照与多窗口合并保留端口，端口变化参与同步差异比较', () => {
    useStore.getState().addConnection('a', 'b')
    const base: AppData = structuredClone({ activeCanvasId: 'cv', canvases: useStore.getState().canvases })
    useStore.getState().addConnection('a', 'b', { fromSide: 'right', toSide: 'top' })
    const incoming: AppData = structuredClone({ activeCanvasId: 'cv', canvases: useStore.getState().canvases })
    const current = structuredClone(base)
    current.canvases[0].cards[1].content = '另一个窗口的内容'

    const merged = mergeAppData(base, incoming, current)
    const synced = normalizeSyncData(JSON.parse(JSON.stringify(merged)))
    expect(synced.canvases[0].connections).toEqual(incoming.canvases[0].connections)
    expect(synced.canvases[0].cards[1].content).toBe('另一个窗口的内容')
    const otherPorts = structuredClone(synced)
    otherPorts.canvases[0].connections[1].fromSide = 'left'
    expect(getComparableSyncSnapshot(synced)).not.toBe(getComparableSyncSnapshot(otherPorts))
  })
})

describe('拖动已有连线的端点', () => {
  const originalPersist = useStore.getState().persist
  const persist = vi.fn()
  const mkCard = (id: string): Card => ({ id, title: '', content: '', x: 0, y: 0, width: 200, height: 150 })

  beforeEach(() => {
    persist.mockClear()
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [
        { id: 'cv', name: 'cv', cards: [mkCard('a'), mkCard('b'), mkCard('c')] },
        { id: 'other', name: 'other', cards: [mkCard('other-card')] },
      ],
      persist,
    })
  })

  afterEach(() => useStore.setState({ persist: originalPersist }))

  const addOriginal = () => {
    useStore.getState().addConnection('a', 'b', { fromSide: 'right', toSide: 'left' })
    const connection = useStore.getState().canvases[0].connections![0]
    persist.mockClear()
    return connection
  }

  it.each(['from', 'to'] as const)('修改 %s 端点保留 ID、方向及固定端口，并原子保存一次', (endpoint) => {
    const original = addOriginal()
    const otherCanvas = useStore.getState().canvases[1]
    const changes = vi.fn()
    const unsubscribe = useStore.subscribe(changes)

    useStore.getState().reconnectConnection(original.id, endpoint, 'c', 'top', 'bottom')

    unsubscribe()
    expect(useStore.getState().canvases[0].connections).toEqual([endpoint === 'from'
      ? { ...original, fromCardId: 'c', fromSide: 'top' }
      : { ...original, toCardId: 'c', toSide: 'top' }])
    expect(useStore.getState().canvases[1]).toBe(otherCanvas)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('可在原卡片上改换连接边，落回原端口则不修改或保存', () => {
    const original = addOriginal()
    const canvases = useStore.getState().canvases
    useStore.getState().reconnectConnection(original.id, 'to', 'b', 'left')
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()

    useStore.getState().reconnectConnection(original.id, 'to', 'b', 'bottom')
    expect(useStore.getState().canvases[0].connections).toEqual([{ ...original, toSide: 'bottom' }])
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('完全重复的有向端口对拒绝修改，其他端口与反向连线仍可共存', () => {
    const original = addOriginal()
    useStore.getState().addConnection('a', 'c', { fromSide: 'right', toSide: 'top' })
    useStore.getState().addConnection('c', 'a', { fromSide: 'bottom', toSide: 'right' })
    const canvases = useStore.getState().canvases
    const otherConnections = canvases[0].connections!.slice(1)
    persist.mockClear()

    useStore.getState().reconnectConnection(original.id, 'to', 'c', 'top')
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()

    useStore.getState().reconnectConnection(original.id, 'to', 'c', 'bottom')
    expect(useStore.getState().canvases[0].connections).toEqual([
      { ...original, toCardId: 'c', toSide: 'bottom' },
      ...otherConnections,
    ])
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it.each(['from', 'to'] as const)('旧自动连线修改 %s 时采用调用方解析出的固定端口', (endpoint) => {
    useStore.getState().addConnection('a', 'b')
    const original = useStore.getState().canvases[0].connections![0]
    persist.mockClear()

    useStore.getState().reconnectConnection(original.id, endpoint, 'c', 'bottom', 'top')

    expect(useStore.getState().canvases[0].connections).toEqual([endpoint === 'from'
      ? { ...original, fromCardId: 'c', fromSide: 'bottom', toSide: 'top' }
      : { ...original, toCardId: 'c', toSide: 'bottom', fromSide: 'top' }])
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('旧自动连线未提供固定端口时不猜测位置或修改数据', () => {
    useStore.getState().addConnection('a', 'b')
    const canvases = useStore.getState().canvases
    const connection = canvases[0].connections![0]
    persist.mockClear()
    useStore.getState().reconnectConnection(connection.id, 'from', 'c', 'top')
    useStore.getState().reconnectConnection(connection.id, 'to', 'c', 'top')
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('无效 ID、自连、跨画布目标和非法端口均保留原连线且不保存', () => {
    const original = addOriginal()
    const canvases = useStore.getState().canvases
    const { reconnectConnection } = useStore.getState()
    reconnectConnection('missing', 'to', 'c', 'top')
    reconnectConnection(original.id, 'to', 'missing', 'top')
    reconnectConnection(original.id, 'to', 'other-card', 'top')
    reconnectConnection(original.id, 'to', 'a', 'top')
    reconnectConnection(original.id, 'from', 'b', 'top')
    reconnectConnection(original.id, 'invalid' as 'from', 'c', 'top')
    reconnectConnection(original.id, 'to', 'c', 'center' as ConnectionSide)
    reconnectConnection(original.id, 'to', 'c', 'top', 'center' as ConnectionSide)
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()

    useStore.setState({ activeCanvasId: 'other' })
    reconnectConnection(original.id, 'to', 'other-card', 'top')
    useStore.setState({ activeCanvasId: null })
    reconnectConnection(original.id, 'to', 'c', 'top')
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('固定端卡片已删除时拒绝重连，避免保存悬空引用', () => {
    const original = addOriginal()
    const canvas = useStore.getState().canvases[0]
    useStore.setState({ canvases: [{ ...canvas, cards: canvas.cards.filter((card) => card.id !== 'a') }] })
    const canvases = useStore.getState().canvases
    useStore.getState().reconnectConnection(original.id, 'to', 'c', 'top')
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })
})

describe('连线外观编辑与批量删除', () => {
  const originalPersist = useStore.getState().persist
  const persist = vi.fn()
  const mkCard = (id: string): Card => ({ id, title: '', content: '', x: 0, y: 0, width: 200, height: 150 })

  beforeEach(() => {
    persist.mockClear()
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [
        { id: 'cv', name: 'cv', cards: [mkCard('a'), mkCard('b'), mkCard('c')], connections: [
          { id: 'one', fromCardId: 'a', toCardId: 'b', fromSide: 'right', toSide: 'left', arrow: 'both', strokeWidth: 4, label: '原文字' },
          { id: 'two', fromCardId: 'b', toCardId: 'c' },
          { id: 'keep', fromCardId: 'c', toCardId: 'a', lineStyle: 'dashed', arrow: 'none' },
        ] },
        { id: 'other', name: 'other', cards: [mkCard('oa'), mkCard('ob')], connections: [
          { id: 'one', fromCardId: 'oa', toCardId: 'ob' },
          { id: 'other-only', fromCardId: 'ob', toCardId: 'oa' },
        ] },
      ],
      persist,
    })
  })

  afterEach(() => {
    useStore.setState({ persist: originalPersist })
    vi.unstubAllGlobals()
  })

  it('批量局部修改只更新选中的当前画布连线，保留端点与其他样式且仅保存一次', () => {
    const [before, otherCanvas] = useStore.getState().canvases
    const changes = vi.fn()
    const unsubscribe = useStore.subscribe(changes)

    useStore.getState().updateConnections(['one', 'two', 'one', 'missing', 'other-only'], { lineStyle: 'dashed', label: '新的关系' })

    unsubscribe()
    const [after, unchangedOtherCanvas] = useStore.getState().canvases
    expect(after.connections).toEqual([
      { ...before.connections![0], lineStyle: 'dashed', label: '新的关系' },
      { ...before.connections![1], lineStyle: 'dashed', label: '新的关系' },
      before.connections![2],
    ])
    expect(after.connections![2]).toBe(before.connections![2])
    expect(after.cards).toBe(before.cards)
    expect(unchangedOtherCanvas).toBe(otherCanvas)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('旧记录设置默认外观、空选择、失效ID和非法空patch均不产生写入', () => {
    const canvases = useStore.getState().canvases
    const { updateConnections } = useStore.getState()
    updateConnections(['two'], { lineStyle: 'solid', arrow: 'end', strokeWidth: 2, label: '' })
    updateConnections([], { lineStyle: 'dashed' })
    updateConnections(['missing', 'other-only'], { arrow: 'both' })
    updateConnections(['one'], {})
    updateConnections(['one'], null as unknown as ConnectionAppearancePatch)
    updateConnections(['one'], { lineStyle: 'dotted', arrow: 'sideways', strokeWidth: 7, label: '多行\n文字', fromCardId: 'c' } as unknown as ConnectionAppearancePatch)
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('混合patch只接受合法字段，允许清空文字且相同值不重复保存', () => {
    const original = useStore.getState().canvases[0].connections![0]
    useStore.getState().updateConnections(['one'], { arrow: 'start', label: '', strokeWidth: NaN, lineStyle: 'bad' } as unknown as ConnectionAppearancePatch)
    expect(useStore.getState().canvases[0].connections![0]).toEqual({ ...original, arrow: 'start', label: '' })
    const canvases = useStore.getState().canvases
    useStore.getState().updateConnections(['one'], { arrow: 'start', label: '' })
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('批量删除去重并忽略其他画布ID，不删除卡片和未选择的连线', () => {
    const [before, otherCanvas] = useStore.getState().canvases
    const changes = vi.fn()
    const unsubscribe = useStore.subscribe(changes)

    useStore.getState().deleteConnections(['one', 'two', 'one', 'missing', 'other-only'])

    unsubscribe()
    const [after, unchangedOtherCanvas] = useStore.getState().canvases
    expect(after.connections).toEqual([before.connections![2]])
    expect(after.cards).toBe(before.cards)
    expect(unchangedOtherCanvas).toBe(otherCanvas)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
    useStore.getState().deleteConnections([])
    useStore.getState().deleteConnections(['one', 'two', 'other-only'])
    expect(useStore.getState().canvases[0]).toBe(after)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('旧单删API继续可用，重复删除和无活动画布时不保存', () => {
    useStore.getState().deleteConnection('one')
    expect(useStore.getState().canvases[0].connections!.map((connection) => connection.id)).toEqual(['two', 'keep'])
    useStore.getState().deleteConnection('one')
    useStore.setState({ activeCanvasId: null })
    const canvases = useStore.getState().canvases
    useStore.getState().updateConnections(['two'], { label: '不应写入' })
    useStore.getState().deleteConnections(['two'])
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it.each(['from', 'to'] as const)('重连%s端点保留外观、文字、ID和另一端', (endpoint) => {
    useStore.getState().updateConnections(['one'], { lineStyle: 'dashed', arrow: 'start', strokeWidth: 6, label: '依赖关系' })
    const original = useStore.getState().canvases[0].connections![0]

    useStore.getState().reconnectConnection('one', endpoint, 'c', 'top')

    expect(useStore.getState().canvases[0].connections![0]).toEqual(endpoint === 'from'
      ? { ...original, fromCardId: 'c', fromSide: 'top' }
      : { ...original, toCardId: 'c', toSide: 'top' })
  })

  it('样式和文字经保存重载、同步规范化和多窗口合并后仍保留', async () => {
    let saved: AppData | null = null
    vi.stubGlobal('window', { electronAPI: {
      writeData: async (data: AppData) => { saved = JSON.parse(JSON.stringify(data)); return true },
      readData: async () => saved,
    } })
    const base: AppData = structuredClone({ activeCanvasId: 'cv', canvases: useStore.getState().canvases })
    const appearance = { lineStyle: 'dashed', arrow: 'both', strokeWidth: 5, label: '先完成 A，再执行 B' } as const
    useStore.getState().updateConnections(['one', 'two'], appearance)
    await useStore.getState().flushPendingSave()
    useStore.setState({ canvases: [], activeCanvasId: null })
    await useStore.getState().loadData()
    const incoming: AppData = { activeCanvasId: 'cv', canvases: useStore.getState().canvases }
    const current = structuredClone(base)
    current.canvases[0].cards[0].content = '另一个窗口的内容'
    const synced = normalizeSyncData(JSON.parse(JSON.stringify(mergeAppData(base, incoming, current))))
    expect(getConnectionAppearance(synced.canvases[0].connections[0])).toEqual(appearance)
    expect(getConnectionAppearance(synced.canvases[0].connections[1])).toEqual(appearance)
    expect(synced.canvases[0].cards[0].content).toBe('另一个窗口的内容')
    expect(getComparableSyncSnapshot(synced)).not.toBe(getComparableSyncSnapshot(base))
  })
})

describe('分区外观批量编辑', () => {
  const originalPersist = useStore.getState().persist
  const persist = vi.fn()
  const mkSection = (id: string, patch: Partial<Section> = {}): Section => ({
    id, name: `分区 ${id}`, x: 20, y: 30, width: 400, height: 300, color: '#AbC', cardIds: [], ...patch,
  })

  beforeEach(() => {
    persist.mockClear()
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [
        { id: 'cv', name: 'cv', cards: [{ id: 'card', title: '成员', content: '保留内容', x: 60, y: 90, width: 200, height: 150 }], sections: [
          mkSection('legacy', { cardIds: ['card'], sourceId: 'source' }),
          mkSection('styled', { color: '#112233', borderColor: '#445566', borderStyle: 'solid' }),
          mkSection('keep'),
        ] },
        { id: 'other', name: 'other', cards: [], sections: [mkSection('legacy'), mkSection('other-only')] },
      ],
      persist,
    })
  })

  afterEach(() => {
    useStore.setState({ persist: originalPersist })
    vi.unstubAllGlobals()
  })

  it('批量局部修改仅更新当前画布选中分区，保留名称位置成员且仅保存一次', () => {
    const [before, other] = useStore.getState().canvases
    const changes = vi.fn()
    const unsubscribe = useStore.subscribe(changes)
    useStore.getState().updateSections(['legacy', 'styled', 'legacy', 'missing', 'other-only'], { borderColor: '#F80' })
    unsubscribe()
    const [after, unchangedOther] = useStore.getState().canvases
    expect(after.sections).toEqual([
      { ...before.sections![0], borderColor: '#ff8800' },
      { ...before.sections![1], borderColor: '#ff8800' },
      before.sections![2],
    ])
    expect(after.sections![2]).toBe(before.sections![2])
    expect(after.cards).toBe(before.cards)
    expect(unchangedOther).toBe(other)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('只改底色时固定旧分区的原边框色，已有独立边框保持原值', () => {
    useStore.getState().updateSections(['legacy', 'styled'], { color: '#FF8800' })
    const sections = useStore.getState().canvases[0].sections!
    expect(getSectionAppearance(sections[0])).toEqual({ color: '#ff8800', borderColor: '#aabbcc', borderStyle: 'dashed' })
    expect(getSectionAppearance(sections[1])).toEqual({ color: '#ff8800', borderColor: '#445566', borderStyle: 'solid' })
    useStore.getState().updateSections(['legacy'], { color: '#0055FF' })
    expect(getSectionAppearance(useStore.getState().canvases[0].sections![0]).borderColor).toBe('#aabbcc')
  })

  it('同时设置底色和边框色时使用所选新值，边框线型独立', () => {
    useStore.getState().updateSections(['legacy'], { color: '#f80', borderColor: '#00f', borderStyle: 'solid' })
    expect(getSectionAppearance(useStore.getState().canvases[0].sections![0]))
      .toEqual({ color: '#ff8800', borderColor: '#0000ff', borderStyle: 'solid' })
    useStore.getState().updateSections(['legacy'], { borderStyle: 'dashed' })
    expect(getSectionAppearance(useStore.getState().canvases[0].sections![0]))
      .toEqual({ color: '#ff8800', borderColor: '#0000ff', borderStyle: 'dashed' })
  })

  it('旧记录设置同等外观、空选择、无效ID、非法patch均不产生写入', () => {
    const canvases = useStore.getState().canvases
    const { updateSections } = useStore.getState()
    updateSections(['legacy'], { color: '#AABBCC', borderColor: '#abc', borderStyle: 'dashed' })
    updateSections([], { borderStyle: 'solid' })
    updateSections(['missing', 'other-only'], { color: '#123456' })
    updateSections(['legacy'], {})
    updateSections(['legacy'], null as unknown as SectionAppearancePatch)
    updateSections(['legacy'], { color: 'red', borderColor: '#abcd', borderStyle: 'dotted', name: '无效', x: 999 } as unknown as SectionAppearancePatch)
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).not.toHaveBeenCalled()
  })

  it('混合patch忽略非法字段和几何字段，同值不重复保存且无活动画布不保存', () => {
    const original = useStore.getState().canvases[0].sections![0]
    useStore.getState().updateSections(['legacy'], { borderStyle: 'solid', color: 'red', borderColor: '#12', name: '忽略', x: 999 } as unknown as SectionAppearancePatch)
    expect(useStore.getState().canvases[0].sections![0]).toEqual({ ...original, borderStyle: 'solid' })
    const canvases = useStore.getState().canvases
    useStore.getState().updateSections(['legacy'], { borderStyle: 'solid' })
    useStore.setState({ activeCanvasId: null })
    useStore.getState().updateSections(['legacy'], { borderColor: '#fff' })
    expect(useStore.getState().canvases).toBe(canvases)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('非法旧颜色在改底色时保留回退后的默认边框色', () => {
    const canvas = useStore.getState().canvases[0]
    useStore.setState({ canvases: [{ ...canvas, sections: [mkSection('legacy', { color: 'broken', borderColor: 'also-broken' })] }] })
    useStore.getState().updateSections(['legacy'], { color: '#F80' })
    expect(getSectionAppearance(useStore.getState().canvases[0].sections![0]))
      .toEqual({ color: '#ff8800', borderColor: '#4a90d9', borderStyle: 'dashed' })
  })

  it('拖动分区和成员卡片、调整大小或重命名后外观不丢失', () => {
    const appearance = { color: '#ff8800', borderColor: '#0000ff', borderStyle: 'solid' } as const
    useStore.getState().updateSections(['legacy'], appearance)
    useStore.getState().moveSection('legacy', 40, 50)
    useStore.getState().updateSection('legacy', { name: '新名称', width: 500, height: 400 })
    const canvas = useStore.getState().canvases[0]
    expect(getSectionAppearance(canvas.sections![0])).toEqual(appearance)
    expect(canvas.sections![0]).toMatchObject({ x: 60, y: 80, name: '新名称', width: 500, height: 400, cardIds: ['card'], sourceId: 'source' })
    expect(canvas.cards[0]).toMatchObject({ x: 100, y: 140, title: '成员', content: '保留内容' })
  })

  it('样式经保存重载、同步规范化和多窗口合并后仍保留', async () => {
    let saved: AppData | null = null
    vi.stubGlobal('window', { electronAPI: {
      writeData: async (data: AppData) => { saved = JSON.parse(JSON.stringify(data)); return true },
      readData: async () => saved,
    } })
    const base: AppData = structuredClone({ activeCanvasId: 'cv', canvases: useStore.getState().canvases })
    const appearance = { color: '#ff8800', borderColor: '#0000ff', borderStyle: 'solid' } as const
    useStore.getState().updateSections(['legacy', 'styled'], appearance)
    await useStore.getState().flushPendingSave()
    useStore.setState({ canvases: [], activeCanvasId: null })
    await useStore.getState().loadData()
    const incoming: AppData = { activeCanvasId: 'cv', canvases: useStore.getState().canvases }
    const current = structuredClone(base)
    current.canvases[0].cards[0].content = '另一个窗口的内容'
    const synced = normalizeSyncData(JSON.parse(JSON.stringify(mergeAppData(base, incoming, current))))
    expect(getSectionAppearance(synced.canvases[0].sections[0])).toEqual(appearance)
    expect(getSectionAppearance(synced.canvases[0].sections[1])).toEqual(appearance)
    expect(synced.canvases[0].cards[0].content).toBe('另一个窗口的内容')
    expect(getComparableSyncSnapshot(synced)).not.toBe(getComparableSyncSnapshot(base))
  })
})

describe('方向键微移分区带动成员卡片（#4）', () => {
  const mkCard = (id: string, x: number, y: number): Card => ({ id, title: '', content: '', x, y, width: 200, height: 150 })

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as unknown as { window: unknown }).window = { electronAPI: { writeData: () => Promise.resolve(true) } }
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as unknown as { window?: unknown }).window
  })

  const setup = () => {
    useStore.setState({
      activeCanvasId: 'cv',
      canvases: [{
        id: 'cv', name: 'cv',
        cards: [mkCard('c1', 10, 10), mkCard('c2', 20, 20), mkCard('c3', 500, 500)],
        sections: [{ id: 's1', name: 's', x: 0, y: 0, width: 400, height: 400, color: '#fff', cardIds: ['c1', 'c2'] }],
      }],
      settings: { theme: 'light' } as AppSettings,
      syncDecision: null,
    })
  }

  it('微移选中分区时，成员卡片一起移动，非成员不动', () => {
    setup()
    useStore.getState().nudgeUnits({ cardIds: [], labelIds: [], sectionIds: ['s1'], textIds: [] }, 5, 7)
    const cv = useStore.getState().canvases[0]
    const get = (id: string) => cv.cards.find((c) => c.id === id)!
    expect({ x: cv.sections![0].x, y: cv.sections![0].y }).toEqual({ x: 5, y: 7 })  // 分区移动
    expect({ x: get('c1').x, y: get('c1').y }).toEqual({ x: 15, y: 17 })            // 成员 c1 跟随
    expect({ x: get('c2').x, y: get('c2').y }).toEqual({ x: 25, y: 27 })            // 成员 c2 跟随
    expect({ x: get('c3').x, y: get('c3').y }).toEqual({ x: 500, y: 500 })          // 非成员不动
  })

  it('成员卡片同时被直接选中时只移动一次（去重）', () => {
    setup()
    useStore.getState().nudgeUnits({ cardIds: ['c1'], labelIds: [], sectionIds: ['s1'], textIds: [] }, 5, 7)
    const c1 = useStore.getState().canvases[0].cards.find((c) => c.id === 'c1')!
    expect({ x: c1.x, y: c1.y }).toEqual({ x: 15, y: 17 })  // 只 +5,+7，不是 +10,+14
  })
})
