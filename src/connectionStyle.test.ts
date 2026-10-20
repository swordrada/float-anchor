import { describe, expect, it } from 'vitest'
import { getConnectionAppearance } from './connectionStyle'
import type { Connection, ConnectionAppearancePatch } from './types'

describe('连线外观的兼容与校验', () => {
  const legacy: Connection = { id: 'legacy', fromCardId: 'a', toCardId: 'b' }

  it('旧连线读取为实线、终点箭头、2px 和空文字，不修改原记录', () => {
    expect(getConnectionAppearance(legacy)).toEqual({ lineStyle: 'solid', arrow: 'end', strokeWidth: 2, label: '' })
    expect(legacy).toEqual({ id: 'legacy', fromCardId: 'a', toCardId: 'b' })
  })

  it('支持全部线型与箭头组合，以及线宽边界和单行200字符', () => {
    for (const lineStyle of ['solid', 'dashed'] as const) {
      for (const arrow of ['none', 'end', 'start', 'both'] as const) {
        for (const strokeWidth of [1, 2.5, 6]) {
          const appearance = { lineStyle, arrow, strokeWidth, label: '字'.repeat(200) }
          expect(getConnectionAppearance(appearance)).toEqual(appearance)
        }
      }
    }
  })

  it.each([0, 7, NaN, Infinity, '3', null])('非法线宽 %s 使用默认值并保留其他合法外观', (strokeWidth) => {
    expect(getConnectionAppearance({ lineStyle: 'dashed', arrow: 'both', strokeWidth, label: '有效文字' } as ConnectionAppearancePatch))
      .toEqual({ lineStyle: 'dashed', arrow: 'both', strokeWidth: 2, label: '有效文字' })
  })

  it.each(['两行\n文字', '两行\r文字', '两行\u2028文字', '两行\u2029文字', '字'.repeat(201), 123, null])('非法文字不会进入显示结果', (label) => {
    expect(getConnectionAppearance({ label } as ConnectionAppearancePatch).label).toBe('')
  })

  it('未知枚举回退默认值，空文字是合法值', () => {
    expect(getConnectionAppearance({ lineStyle: 'dotted', arrow: 'sideways', label: '' } as unknown as ConnectionAppearancePatch))
      .toEqual({ lineStyle: 'solid', arrow: 'end', strokeWidth: 2, label: '' })
  })
})
