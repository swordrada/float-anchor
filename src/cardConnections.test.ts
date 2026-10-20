import { describe, expect, it } from 'vitest'
import { getCardConnectionGeometry, getCardConnectionPoint, getCardConnectionPreview, resolveCardConnectionSides } from './cardConnections'
import type { CardConnectionGeometry, ConnectionPoint } from './cardConnections'
import type { Card, ConnectionSide } from './types'

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

describe('fixed card connection ports', () => {
  const sides: ConnectionSide[] = ['top', 'right', 'bottom', 'left']
  const normal: Record<ConnectionSide, ConnectionPoint> = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  }
  const source = card(10, 20, 200, 120)
  const target = card(430, 240, 280, 180)
  const sourcePorts: Record<ConnectionSide, ConnectionPoint> = {
    top: { x: 110, y: 20 },
    right: { x: 210, y: 80 },
    bottom: { x: 110, y: 140 },
    left: { x: 10, y: 80 },
  }
  const targetPorts: Record<ConnectionSide, ConnectionPoint> = {
    top: { x: 570, y: 240 },
    right: { x: 710, y: 330 },
    bottom: { x: 570, y: 420 },
    left: { x: 430, y: 330 },
  }

  function expectOutward(point: ConnectionPoint, control: ConnectionPoint, side: ConnectionSide) {
    const delta = { x: control.x - point.x, y: control.y - point.y }
    expect(delta.x * normal[side].x + delta.y * normal[side].y).toBeGreaterThan(0)
    expect(delta.x * normal[side].y - delta.y * normal[side].x).toBe(0)
  }

  it.each(sides)('%s 返回卡片边的中点', (side) => {
    expect(getCardConnectionPoint(source, side)).toEqual(sourcePorts[side])
    expect(getCardConnectionPoint(target, side)).toEqual(targetPorts[side])
  })

  const portPairs = sides.flatMap((fromSide) => sides.map((toSide) => ({ fromSide, toSide })))
  it.each(portPairs)('$fromSide → $toSide 始终锚定指定边，两个控制点均朝外', (ports) => {
    const geometry = getCardConnectionGeometry(source, target, ports)
    expect(geometry.start).toEqual(sourcePorts[ports.fromSide])
    expect(geometry.end).toEqual(targetPorts[ports.toSide])
    expectOutward(geometry.start, geometry.control1, ports.fromSide)
    expectOutward(geometry.end, geometry.control2, ports.toSide)
    expect(geometry.midpoint).toEqual(pointOnCurve(geometry, 0.5))

    const reverse = getCardConnectionGeometry(target, source, { fromSide: ports.toSide, toSide: ports.fromSide })
    expect(reverse.start).toEqual(geometry.end)
    expect(reverse.end).toEqual(geometry.start)
    expect(reverse.control1).toEqual(geometry.control2)
    expect(reverse.control2).toEqual(geometry.control1)
  })

  it.each(portPairs)('$fromSide → $toSide 在卡片移动到相反方向及调整大小后保留原边', (ports) => {
    const movedSource = card(700, 600, 400, 240)
    const movedTarget = card(-200, -300, 140, 90)
    const geometry = getCardConnectionGeometry(movedSource, movedTarget, ports)

    expect(geometry.start).toEqual(getCardConnectionPoint(movedSource, ports.fromSide))
    expect(geometry.end).toEqual(getCardConnectionPoint(movedTarget, ports.toSide))
    expectOutward(geometry.start, geometry.control1, ports.fromSide)
    expectOutward(geometry.end, geometry.control2, ports.toSide)
  })

  it.each(sides)('%s 预览始终从指定边出发，跟随各方向指针', (side) => {
    const pointers = [{ x: -200, y: 80 }, { x: 400, y: 80 }, { x: 110, y: -200 }, { x: 110, y: 400 }, sourcePorts[side]]
    for (const pointer of pointers) {
      const geometry = getCardConnectionPreview(source, pointer, side)
      expect(geometry.start).toEqual(sourcePorts[side])
      expect(geometry.end).toEqual(pointer)
      expectOutward(geometry.start, geometry.control1, side)
    }
  })

  it('仅指定一端时，另一端沿用自动选边', () => {
    const automatic = getCardConnectionGeometry(source, target)
    const fixedSource = getCardConnectionGeometry(source, target, { fromSide: 'top' })
    const fixedTarget = getCardConnectionGeometry(source, target, { toSide: 'bottom' })

    expect(fixedSource.start).toEqual(sourcePorts.top)
    expect(fixedSource.end).toEqual(automatic.end)
    expect(fixedTarget.start).toEqual(automatic.start)
    expect(fixedTarget.end).toEqual(targetPorts.bottom)
  })

  it('缺省或非法边值保留旧记录的自动路径', () => {
    const automatic = getCardConnectionGeometry(source, target)
    expect(getCardConnectionGeometry(source, target, {})).toEqual(automatic)
    expect(getCardConnectionGeometry(source, target, { fromSide: undefined, toSide: undefined })).toEqual(automatic)
    expect(getCardConnectionGeometry(source, target, {
      fromSide: 'unknown' as ConnectionSide,
      toSide: null as unknown as ConnectionSide,
    })).toEqual(automatic)
    expect(getCardConnectionPreview(source, { x: 500, y: 50 }, 'unknown' as ConnectionSide)).toEqual(
      getCardConnectionPreview(source, { x: 500, y: 50 }),
    )
  })

  it('异常坐标、缺失尺寸、相同端点和零尺寸卡片均生成有限坐标', () => {
    const invalidCards = [
      {} as Card,
      null as unknown as Card,
      card(NaN, Infinity, -10, -20),
      card(Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE),
      card(10, 20, 0, 0),
    ]
    for (const invalidCard of invalidCards) {
      for (const ports of portPairs) {
        const geometry = getCardConnectionGeometry(invalidCard, invalidCard, ports)
        expect(geometry.path).not.toMatch(/NaN|Infinity/)
        for (const point of [geometry.start, geometry.end, geometry.control1, geometry.control2, geometry.midpoint]) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        }
      }
      for (const side of sides) {
        const point = getCardConnectionPoint(invalidCard, side)
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        const preview = getCardConnectionPreview(invalidCard, { x: NaN, y: Infinity }, side)
        expect(preview.end).toEqual({ x: 0, y: 0 })
        expect(preview.path).not.toMatch(/NaN|Infinity/)
      }
    }
  })
})

describe('resolveCardConnectionSides', () => {
  it.each([
    { from: card(0, 0), to: card(320, 20), fromSide: 'right', toSide: 'left' },
    { from: card(320, 20), to: card(0, 0), fromSide: 'left', toSide: 'right' },
    { from: card(0, 0), to: card(40, 260), fromSide: 'bottom', toSide: 'top' },
    { from: card(40, 260), to: card(0, 0), fromSide: 'top', toSide: 'bottom' },
  ])('旧自动连线解析为 $fromSide → $toSide，与渲染端点一致', ({ from, to, fromSide, toSide }) => {
    const sides = resolveCardConnectionSides(from, to)
    const geometry = getCardConnectionGeometry(from, to)
    expect(sides).toEqual({ fromSide, toSide })
    expect(geometry.start).toEqual(getCardConnectionPoint(from, sides.fromSide))
    expect(geometry.end).toEqual(getCardConnectionPoint(to, sides.toSide))
  })

  it('显式端点覆盖自动结果，仅指定一端时保留另一端的自动选择', () => {
    const from = card(0, 0)
    const to = card(320, 20)
    expect(resolveCardConnectionSides(from, to, { fromSide: 'top', toSide: 'bottom' })).toEqual({ fromSide: 'top', toSide: 'bottom' })
    expect(resolveCardConnectionSides(from, to, { fromSide: 'top' })).toEqual({ fromSide: 'top', toSide: 'left' })
    expect(resolveCardConnectionSides(from, to, { toSide: 'bottom' })).toEqual({ fromSide: 'right', toSide: 'bottom' })
  })

  it('卡片移动后重新识别自动端点，并保留已保存的固定端点', () => {
    const from = card(0, 0)
    expect(resolveCardConnectionSides(from, card(320, 20))).toEqual({ fromSide: 'right', toSide: 'left' })
    expect(resolveCardConnectionSides(from, card(40, 260))).toEqual({ fromSide: 'bottom', toSide: 'top' })
    expect(resolveCardConnectionSides(from, card(40, 260), { fromSide: 'right' })).toEqual({ fromSide: 'right', toSide: 'top' })
    expect(resolveCardConnectionSides(from, card(-400, -300), { fromSide: 'right', toSide: 'left' })).toEqual({ fromSide: 'right', toSide: 'left' })
  })

  it('空参数和非法端点仍使用同一自动选择规则', () => {
    const from = card(0, 0)
    const to = card(320, 20)
    expect(resolveCardConnectionSides(from, to, {})).toEqual({ fromSide: 'right', toSide: 'left' })
    expect(resolveCardConnectionSides(from, to, { fromSide: 'invalid' as ConnectionSide, toSide: undefined })).toEqual({ fromSide: 'right', toSide: 'left' })
  })

  it('提取选边逻辑不会改变自动连线和固定端点连线的曲线', () => {
    const from = card(0, 0)
    const to = card(212, 0)
    expect(getCardConnectionGeometry(from, to).path).toBe('M 200 60 C 204.8 60, 207.2 60, 212 60')
    expect(getCardConnectionGeometry(from, to, { fromSide: 'right', toSide: 'left' }).path).toBe('M 200 60 C 224 60, 188 60, 212 60')
  })
})
