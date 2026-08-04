import { describe, expect, it } from 'vitest'
import { expandCardIdsForSelectedSections } from './canvasSelection'
import type { Section } from './types'

const section = (id: string, cardIds: string[]): Section => ({
  id,
  name: id,
  x: 0,
  y: 0,
  width: 600,
  height: 400,
  color: '#60a5fa',
  cardIds,
})

describe('expandCardIdsForSelectedSections', () => {
  it('选中分区拖动时包含分区成员卡片', () => {
    const result = expandCardIdsForSelectedSections(
      [],
      ['volume'],
      [section('volume', ['card-a', 'card-b'])],
    )

    expect([...result]).toEqual(['card-a', 'card-b'])
  })

  it('合并直接选中的卡片并去重，且不包含未选中分区的成员', () => {
    const result = expandCardIdsForSelectedSections(
      ['card-a', 'standalone'],
      ['volume'],
      [
        section('volume', ['card-a', 'card-b']),
        section('other', ['card-c']),
      ],
    )

    expect([...result]).toEqual(['card-a', 'standalone', 'card-b'])
  })
})
