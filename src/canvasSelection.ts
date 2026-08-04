import type { Section } from './types'

export function expandCardIdsForSelectedSections(
  cardIds: Iterable<string>,
  sectionIds: Iterable<string>,
  sections: Section[],
): Set<string> {
  const expanded = new Set(cardIds)
  const selectedSectionIds = new Set(sectionIds)

  for (const section of sections) {
    if (!selectedSectionIds.has(section.id)) continue
    for (const cardId of section.cardIds ?? []) expanded.add(cardId)
  }

  return expanded
}
