import { describe, expect, it } from 'vitest'
import { getSectionAppearance, sanitizeSectionAppearancePatch } from './sectionStyle'
import type { SectionAppearancePatch } from './types'

describe('分区外观兼容与校验', () => {
  it('旧分区保留同色底色和虚线边框，并规范化三位和大写颜色', () => {
    expect(getSectionAppearance({ color: '#AbC' })).toEqual({ color: '#aabbcc', borderColor: '#aabbcc', borderStyle: 'dashed' })
    expect(getSectionAppearance({ color: '#AABBCC' })).toEqual({ color: '#aabbcc', borderColor: '#aabbcc', borderStyle: 'dashed' })
  })

  it('独立边框颜色和实线样式覆盖默认值', () => {
    expect(getSectionAppearance({ color: '#abc', borderColor: '#Ff0022', borderStyle: 'solid' }))
      .toEqual({ color: '#aabbcc', borderColor: '#ff0022', borderStyle: 'solid' })
  })

  it('缺失或非法旧颜色使用默认蓝色，非法边框回退到有效底色', () => {
    expect(getSectionAppearance({})).toEqual({ color: '#4a90d9', borderColor: '#4a90d9', borderStyle: 'dashed' })
    expect(getSectionAppearance({ color: 'invalid', borderColor: '#12', borderStyle: 'dotted' } as unknown as SectionAppearancePatch))
      .toEqual({ color: '#4a90d9', borderColor: '#4a90d9', borderStyle: 'dashed' })
    expect(getSectionAppearance({ color: '#123456', borderColor: 'red' }).borderColor).toBe('#123456')
  })

  it.each(['#1234', '#12345678', 'red', 'rgb(1,2,3)', 'transparent', '#ggg', '', '#12', ' #123456'])('拒绝不受支持的色值 %s', (value) => {
    expect(sanitizeSectionAppearancePatch({ color: value, borderColor: value })).toEqual({})
  })

  it('非法字段不影响同次修改中的合法字段，忽略几何等未知字段', () => {
    expect(sanitizeSectionAppearancePatch({ color: '#F80', borderColor: 123, borderStyle: 'solid', x: 999, name: 'ignored' } as unknown as SectionAppearancePatch))
      .toEqual({ color: '#ff8800', borderStyle: 'solid' })
  })

  it.each([null, undefined, [], 'red', 42])('非对象输入不产生修改 %j', (value) => {
    expect(sanitizeSectionAppearancePatch(value as unknown as SectionAppearancePatch)).toEqual({})
  })
})
