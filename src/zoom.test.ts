import { describe, expect, it } from 'vitest'
import { getWheelZoomFactor } from './zoom'

describe('getWheelZoomFactor', () => {
  it('限制 Windows 鼠标滚轮单次缩放幅度', () => {
    const zoomOut = getWheelZoomFactor(120)
    const zoomIn = getWheelZoomFactor(-120)

    expect(zoomOut).toBeCloseTo(Math.exp(-0.06), 8)
    expect(zoomIn).toBeCloseTo(Math.exp(0.06), 8)
    expect(zoomOut * zoomIn).toBeCloseTo(1, 8)
  })

  it('保留触控板小增量的连续缩放', () => {
    expect(getWheelZoomFactor(1)).toBeCloseTo(Math.exp(-0.003), 8)
    expect(getWheelZoomFactor(-1)).toBeCloseTo(Math.exp(0.003), 8)
  })

  it('限制异常大的滚轮增量，避免一步跳到缩放边界', () => {
    expect(getWheelZoomFactor(1000)).toBeCloseTo(getWheelZoomFactor(20), 8)
    expect(getWheelZoomFactor(-1000)).toBeCloseTo(getWheelZoomFactor(-20), 8)
  })

  it('归一化按行和按页上报的滚轮事件', () => {
    expect(getWheelZoomFactor(1, 1)).toBeCloseTo(Math.exp(-0.048), 8)
    expect(getWheelZoomFactor(1, 2)).toBeCloseTo(Math.exp(-0.06), 8)
  })
})
