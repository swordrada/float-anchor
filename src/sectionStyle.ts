import type { SectionAppearance, SectionAppearancePatch } from './types'

const DEFAULT_SECTION_COLOR = '#4a90d9'

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split('').map((digit) => digit + digit).join('')}`.toLowerCase()
  }
  return undefined
}

/** Validate fields separately so an invalid partial edit never resets other styles. */
export function sanitizeSectionAppearancePatch(patch: SectionAppearancePatch): SectionAppearancePatch {
  const result: SectionAppearancePatch = {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return result
  const color = normalizeColor(patch.color)
  const borderColor = normalizeColor(patch.borderColor)
  if (color) result.color = color
  if (borderColor) result.borderColor = borderColor
  if (patch.borderStyle === 'solid' || patch.borderStyle === 'dashed') result.borderStyle = patch.borderStyle
  return result
}

export function getSectionAppearance(section: SectionAppearancePatch): SectionAppearance {
  const valid = sanitizeSectionAppearancePatch(section)
  const color = valid.color ?? DEFAULT_SECTION_COLOR
  return { color, borderStyle: valid.borderStyle ?? 'dashed', borderColor: valid.borderColor ?? color }
}
