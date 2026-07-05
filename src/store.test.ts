import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getEffectiveProvider, isCardSnappedAdjacent, useStore } from './store'
import type { AppSettings, Card, Section } from './types'

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
