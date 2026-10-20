import { afterEach, describe, expect, it, vi } from 'vitest'
import { findCardPortAtPoint } from './cardPortHitTest'
import type { ConnectionSide } from './types'

const viewport = {} as Element
const selector = '.card-connection-port[data-port-card-id][data-connection-side]'

function port(cardId: string, side: ConnectionSide, x: number, y: number, owner = viewport) {
  const dot = {
    getBoundingClientRect: () => ({ left: x - 4, top: y - 4, width: 8, height: 8 }),
  }
  const button = {
    dataset: { portCardId: cardId, connectionSide: side },
    closest: (query: string): unknown => query === selector ? button : query === '.canvas-viewport' ? owner : null,
    querySelector: (query: string) => query === 'span' ? dot : null,
  } as unknown as HTMLButtonElement
  return button
}

function hitStack(...elements: Element[]) {
  const elementsFromPoint = vi.fn().mockReturnValue(elements)
  vi.stubGlobal('document', { elementsFromPoint })
  return elementsFromPoint
}

afterEach(() => vi.unstubAllGlobals())

describe('card port hit testing', () => {
  it.each([false, true])('12px 左右间距按圆点距离选择起点，不受叠层顺序影响（反转=%s）', (reversed) => {
    const left = port('left', 'right', 200, 60)
    const right = port('right', 'left', 212, 60)
    const read = hitStack(...(reversed ? [left, right] : [right, left]))

    expect(findCardPortAtPoint(200, 60)).toEqual({ port: { cardId: 'left', side: 'right' }, element: left })
    expect(findCardPortAtPoint(212, 60)).toEqual({ port: { cardId: 'right', side: 'left' }, element: right })
    expect(read).toHaveBeenLastCalledWith(212, 60)
  })

  it('12px 上下间距选择靠近的下侧圆点', () => {
    const top = port('top', 'bottom', 100, 120)
    const bottom = port('bottom', 'top', 100, 132)
    hitStack(bottom, top)

    expect(findCardPortAtPoint(100, 120)?.port).toEqual({ cardId: 'top', side: 'bottom' })
    expect(findCardPortAtPoint(100, 131)?.port).toEqual({ cardId: 'bottom', side: 'top' })
  })

  it('缩小后间距不足 2px 时仍以屏幕圆点位置选择最近端点', () => {
    const left = port('left', 'right', 30, 9)
    const right = port('right', 'left', 31.8, 9)
    hitStack(right, left)

    expect(findCardPortAtPoint(30.2, 9)?.element).toBe(left)
    expect(findCardPortAtPoint(31.6, 9)?.element).toBe(right)
  })

  it('距离相同时保留原生命中栈顺序', () => {
    const left = port('left', 'right', 200, 60)
    const right = port('right', 'left', 212, 60)
    hitStack(right, left)
    expect(findCardPortAtPoint(206, 60)?.element).toBe(right)
    hitStack(left, right)
    expect(findCardPortAtPoint(206, 60)?.element).toBe(left)
  })

  it('同时命中圆点子元素和按钮时只检查该端点一次', () => {
    const left = port('left', 'right', 200, 60)
    const right = port('right', 'left', 212, 60)
    const child = { closest: () => right } as unknown as Element
    const query = vi.spyOn(right, 'querySelector')
    hitStack(child, right, left)

    expect(findCardPortAtPoint(200, 60)?.element).toBe(left)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it.each(['toolbar', 'grip', 'overlay'])('不穿过前方的 %s 控件选取端点', () => {
    const blocking = { closest: () => null } as unknown as Element
    hitStack(blocking, port('card', 'top', 100, 0))
    expect(findCardPortAtPoint(100, 0)).toBeNull()
  })

  it('指针未命中端点时返回空值', () => {
    hitStack()
    expect(findCardPortAtPoint(-1, -1)).toBeNull()
    hitStack({ closest: () => null } as unknown as Element)
    expect(findCardPortAtPoint(500, 500)).toBeNull()
  })

  it('只考虑最前方端点所属画布，忽略更近的其他画布端点', () => {
    const front = port('front', 'left', 212, 60)
    const other = port('other', 'right', 200, 60, {} as Element)
    hitStack(front, other)
    expect(findCardPortAtPoint(200, 60)?.element).toBe(front)
  })
})
