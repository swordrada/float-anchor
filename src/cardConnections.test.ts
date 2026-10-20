import { describe, expect, it } from 'vitest'
import { getCardConnectionGeometry, getCardConnectionPreview } from './cardConnections'
import type { CardConnectionGeometry, ConnectionPoint } from './cardConnections'

const card = (x: number, y: number, width = 200, height = 120) => ({ x, y, width, height })

function pointOnCurve(geometry: CardConnectionGeometry, t: number): ConnectionPoint {
  const u = 1 - t
  const { start, control1, control2, end } = geometry
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * end.y,
  }
}

describe('card connection geometry', () => {
  it('从左卡的右边连接到右卡的左边，曲线保持在两卡之间', () => {
    const geometry = getCardConnectionGeometry(card(0, 0), card(320, 20))

    expect(geometry.start).toEqual({ x: 200, y: 60 })
    expect(geometry.end).toEqual({ x: 320, y: 80 })
    expect(geometry.control1.x).toBeGreaterThan(geometry.start.x)
    expect(geometry.control2.x).toBeLessThan(geometry.end.x)
    for (let i = 0; i <= 20; i++) {
      const point = pointOnCurve(geometry, i / 20)
      expect(point.x).toBeGreaterThanOrEqual(200)
      expect(point.x).toBeLessThanOrEqual(320)
    }
  })

  it('先选右卡再选左卡时使用相向的边，反向路径不穿过卡片', () => {
    const forward = getCardConnectionGeometry(card(0, 0), card(320, 20))
    const reverse = getCardConnectionGeometry(card(320, 20), card(0, 0))

    expect(reverse.start).toEqual(forward.end)
    expect(reverse.end).toEqual(forward.start)
    expect(reverse.control1).toEqual(forward.control2)
    expect(reverse.control2).toEqual(forward.control1)
    expect(reverse.midpoint).toEqual(forward.midpoint)
  })

  it('上下排列时连接底边与顶边，反向连线使用同一路径', () => {
    const down = getCardConnectionGeometry(card(0, 0), card(40, 260))
    const up = getCardConnectionGeometry(card(40, 260), card(0, 0))

    expect(down.start).toEqual({ x: 100, y: 120 })
    expect(down.end).toEqual({ x: 140, y: 260 })
    expect(up.start).toEqual(down.end)
    expect(up.end).toEqual(down.start)
    expect(up.control1).toEqual(down.control2)
    expect(up.control2).toEqual(down.control1)
    for (let i = 0; i <= 20; i++) {
      const point = pointOnCurve(down, i / 20)
      expect(point.y).toBeGreaterThanOrEqual(120)
      expect(point.y).toBeLessThanOrEqual(260)
    }
  })

  it('对角布局选择较近且朝向对方的边', () => {
    expect(getCardConnectionGeometry(card(0, 0), card(260, 200)).start).toEqual({ x: 200, y: 60 })
    expect(getCardConnectionGeometry(card(0, 0), card(220, 400)).start).toEqual({ x: 100, y: 120 })
  })

  it('删除按钮坐标位于真实曲线中点', () => {
    const geometry = getCardConnectionGeometry(card(-130, 200), card(230, -70, 280, 90))
    const center = pointOnCurve(geometry, 0.5)

    expect(geometry.midpoint.x).toBeCloseTo(center.x)
    expect(geometry.midpoint.y).toBeCloseTo(center.y)
  })

  it.each([
    [{ x: 350, y: 60 }, { x: 200, y: 60 }],
    [{ x: -150, y: 60 }, { x: 0, y: 60 }],
    [{ x: 100, y: 260 }, { x: 100, y: 120 }],
    [{ x: 100, y: -160 }, { x: 100, y: 0 }],
  ])('预览从指针方向对应的边出发：%j', (pointer, start) => {
    const preview = getCardConnectionPreview(card(0, 0), pointer)

    expect(preview.start).toEqual(start)
    expect(preview.end).toEqual(pointer)
  })

  it('缺失高度、相切、重叠或零尺寸输入不会生成非有限坐标', () => {
    const geometries = [
      getCardConnectionGeometry({ x: 0, y: 0, width: 200 }, card(300, 0)),
      getCardConnectionGeometry(card(0, 0), card(200, 0)),
      getCardConnectionGeometry(card(0, 0), card(0, 0)),
      getCardConnectionGeometry(card(0, 0, 0, 0), card(0, 0, 0, 0)),
      getCardConnectionGeometry(card(NaN, Infinity, NaN, -10), card(300, 0)),
      getCardConnectionPreview(card(0, 0), { x: 100, y: 60 }),
    ]

    expect(geometries[0].start.y).toBe(100)
    for (const geometry of geometries) {
      expect(geometry.path).not.toMatch(/NaN|Infinity/)
      for (const point of [geometry.start, geometry.end, geometry.control1, geometry.control2, geometry.midpoint]) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      }
    }
  })
})
