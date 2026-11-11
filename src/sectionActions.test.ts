import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './store'
import type { Card, Section, SectionAppearancePatch } from './types'

const card = (id: string, x: number, y: number): Card => ({ id, title: id, content: '原始内容', x, y, width: 300, height: 800 })
const section: Section = { id: 's', name: '灵感', x: 0, y: 0, width: 2000, height: 3000, color: '#60a5fa', cardIds: ['a', 'b'] }

describe('分区外观与最佳大小的保存集成', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { electronAPI: { writeData: vi.fn(async () => true) } })
    useStore.setState({
      activeCanvasId: 'board', settings: { theme: 'dark', syncProvider: 'none' }, syncDecision: null,
      canvases: [
        { id: 'board', name: '当前', cards: [card('a', 100, 100), card('b', 100, 1600), card('outside', 4000, 0)],
          sections: [structuredClone(section), { ...section, id: 'other', cardIds: [] }],
          connections: [{ id: 'line', fromCardId: 'a', toCardId: 'b' }] },
        { id: 'inactive', name: '另一张', cards: [], sections: [structuredClone(section)] },
      ],
    })
    await useStore.getState().flushPendingSave()
    vi.mocked(window.electronAPI.writeData).mockClear()
  })
  afterEach(async () => {
    await useStore.getState().flushPendingSave()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('只修改选中分区的外观并保存，背景与边框一起变色', async () => {
    const before = useStore.getState().canvases
    useStore.getState().updateSections(['s'], { color: '#ABC', borderStyle: 'solid' })
    const after = useStore.getState().canvases
    expect(after[0].sections![0]).toEqual({ ...section, color: '#aabbcc', borderStyle: 'solid', borderColor: '#aabbcc' })
    expect(after[0].cards).toBe(before[0].cards)
    expect(after[0].sections![1]).toBe(before[0].sections![1])
    expect(after[1]).toBe(before[1])
    await vi.advanceTimersByTimeAsync(600)
    expect(window.electronAPI.writeData).toHaveBeenCalledOnce()
    expect(vi.mocked(window.electronAPI.writeData).mock.calls[0][0].canvases).toEqual(after)
  })

  it('多选统一改色，拒绝无效颜色和外观接口中的几何修改', () => {
    const before = useStore.getState().canvases
    useStore.getState().updateSections(['s'], { color: 'red', borderStyle: 'none', x: 999 } as unknown as SectionAppearancePatch)
    expect(useStore.getState().canvases).toBe(before)
    useStore.getState().updateSections(['s', 'other'], { borderColor: '#234567' })
    expect(useStore.getState().canvases[0].sections!.map((item) => [item.color,item.borderColor])).toEqual([['#234567','#234567'],['#234567','#234567']])
  })

  it('再次选择原填充色也修复旧异色边框，普通编辑接口同样保持同色', () => {
    const canvases = structuredClone(useStore.getState().canvases)
    canvases[0].sections![0].borderColor = '#ff0000'
    useStore.setState({canvases})
    useStore.getState().updateSections(['s'], {color: section.color})
    expect(useStore.getState().canvases[0].sections![0].borderColor).toBe(section.color)
    useStore.getState().updateSection('s', {color:'#abc',borderColor:'#ff0000'})
    expect(useStore.getState().canvases[0].sections![0]).toMatchObject({color:'#aabbcc',borderColor:'#aabbcc'})
  })

  it('带连线成员也会调整大小、以上下 6px 排布，连线与分区外内容不变', async () => {
    const before = useStore.getState().canvases
    const changes: unknown[] = []
    const unsubscribe = useStore.subscribe((state) => { changes.push(state.canvases) })
    useStore.getState().compactSection('s', { a: 120, b: 900 })
    unsubscribe()
    const after = useStore.getState().canvases
    expect(changes).toHaveLength(1)
    expect(after[0].cards[0]).toMatchObject({ height: 120, x: 100, y: 100 })
    expect(after[0].cards[1]).toMatchObject({ height: 900, x: 100, y: 226, content: '原始内容' })
    expect(after[0].sections![0]).toMatchObject({ x: 76, y: 40, width: 348, height: 1110 })
    expect(after[0].connections).toBe(before[0].connections)
    expect(after[0].cards[2]).toBe(before[0].cards[2])
    expect(after[1]).toBe(before[1])
    await vi.advanceTimersByTimeAsync(600)
    expect(window.electronAPI.writeData).toHaveBeenCalledOnce()
    expect(vi.mocked(window.electronAPI.writeData).mock.calls[0][0].canvases).toEqual(after)
  })

  it('未完成全部成员测量时，不调整任何卡片或分区', () => {
    const before = useStore.getState().canvases
    useStore.getState().compactSection('s', { a: 120 })
    expect(useStore.getState().canvases).toBe(before)
    expect(window.electronAPI.writeData).not.toHaveBeenCalled()
  })

  it('创建时默认 373px 与手动宽度在反复最佳大小及保存后均保持不变', async () => {
    useStore.getState().addCard(100, 100)
    const created = useStore.getState().canvases[0].cards.at(-1)!
    expect(created.width).toBe(373)
    useStore.getState().updateCard('b', { width: 640 })
    useStore.getState().updateSection('s', { cardIds: [created.id, 'b'] })
    const heights = { [created.id]: 220, b: 430 }
    useStore.getState().compactSection('s', heights)
    useStore.getState().compactSection('s', heights)
    await useStore.getState().flushPendingSave()
    const saved = vi.mocked(window.electronAPI.writeData).mock.calls.at(-1)![0]
    const widths = Object.fromEntries(saved.canvases[0].cards.map(c => [c.id, c.width]))
    expect(widths[created.id]).toBe(373)
    expect(widths.b).toBe(640)
  })
})
