import { describe, it, expect } from 'vitest'
import { fitSectionLayout, CARD_SNAP_GAP } from './sectionLayout'
import type { Card, Section } from './types'

const card = (id: string, x: number, y: number, width = 300, height = 600): Card =>
  ({ id, x, y, width, height, title: id, content: 'content', sourceId: `source-${id}` })
const section = (ids: string[]): Section =>
  ({ id: 's', name: '资料', x: 0, y: 0, width: 3000, height: 4000, color: '#60a5fa', cardIds: ids })

describe('分区最佳大小：先量内容，再磁吸排布，最后包围分区', () => {
  it('使用新高度填紧两列，保持原有列和上下阅读顺序', () => {
    const cards = [card('bottom', 100, 1200), card('right', 900, 350), card('top', 100, 100)]
    const result = fitSectionLayout(cards, section(['top', 'bottom', 'right']), { top: 120, bottom: 240, right: 300 })!
    const [bottom, right, top] = result.cards
    expect([top.x, top.y, top.height]).toEqual([100, 100, 120])
    expect(bottom.y - (top.y + top.height!)).toBe(CARD_SNAP_GAP)
    expect(right.x - (top.x + top.width)).toBe(CARD_SNAP_GAP)
    expect(right.y).toBe(top.y)
    expect(result.section).toMatchObject({ x: 76, y: 40, width: 660, height: 456 })
    expect(cards[0].height).toBe(600) // inputs are immutable
  })

  it('长内容会增长，短内容会缩小；不裁切内容、不改变宽度', () => {
    const result = fitSectionLayout([card('a', 0, 60, 420, 90), card('b', 0, 200, 280, 900)], section(['a', 'b']), { a: 1000.4, b: 90 })!
    expect(result.cards[0]).toMatchObject({ width: 420, height: 1001 })
    expect(result.cards[1]).toMatchObject({ width: 280, height: 90, y: 1073 })
    expect(result.section.y + result.section.height).toBe(1163 + 24)
  })

  it('重复执行不漂移；原卡片内容与来源标识不变', () => {
    const sizes = { a: 80, b: 180, c: 90 }
    const initial = [card('a', -400, 100, 300), card('b', -380, 900, 180), card('c', 500, 200, 500)]
    const first = fitSectionLayout(initial, section(['a', 'b', 'c']), sizes)!
    const second = fitSectionLayout(first.cards, first.section, sizes)!
    expect(second).toEqual(first)
    expect(second.cards[0]).toMatchObject({ title: 'a', content: 'content', sourceId: 'source-a', width: 300 })
  })

  it('不移动分区外卡片，手动整理后清除成员的即刻自动排布标记', () => {
    const outside = card('outside', 10000, 10000)
    const result = fitSectionLayout([{ ...card('a', 0, 0), instantOrder: 123 }, outside], section(['a']), { a: 100 })!
    expect(result.cards[0].instantOrder).toBeUndefined()
    expect(result.cards[1]).toBe(outside)
  })

  it('空分区或全部失效的成员 ID 不会产生无限大的边界', () => {
    expect(fitSectionLayout([], section([]), {})).toBeNull()
    expect(fitSectionLayout([card('other', 0, 0)], section(['missing']), {})).toBeNull()
  })

  it.each<Readonly<Record<string, number>>>([{}, { a: NaN }, { a: Infinity }, { a: 0 }, { a: -30 }])('测量缺失或无效时不提交部分布局 %j', (sizes) => {
    expect(fitSectionLayout([card('a', 0, 0)], section(['a']), sizes)).toBeNull()
  })
})
