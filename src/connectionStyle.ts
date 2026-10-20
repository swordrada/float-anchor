import type { ConnectionAppearance, ConnectionAppearancePatch } from './types'

/** Ignore malformed fields individually so a partial edit never resets other styles. */
export function sanitizeConnectionAppearancePatch(patch: ConnectionAppearancePatch): ConnectionAppearancePatch {
  const result: ConnectionAppearancePatch = {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return result
  if (patch.lineStyle === 'solid' || patch.lineStyle === 'dashed') result.lineStyle = patch.lineStyle
  if (patch.arrow === 'none' || patch.arrow === 'end' || patch.arrow === 'start' || patch.arrow === 'both') result.arrow = patch.arrow
  if (typeof patch.strokeWidth === 'number' && Number.isFinite(patch.strokeWidth) && patch.strokeWidth >= 1 && patch.strokeWidth <= 6) {
    result.strokeWidth = patch.strokeWidth
  }
  if (typeof patch.label === 'string' && patch.label.length <= 200 && !/[\r\n\u2028\u2029]/.test(patch.label)) result.label = patch.label
  return result
}

export function getConnectionAppearance(connection: ConnectionAppearancePatch): ConnectionAppearance {
  return {
    lineStyle: 'solid',
    arrow: 'end',
    strokeWidth: 2,
    label: '',
    ...sanitizeConnectionAppearancePatch(connection),
  }
}
