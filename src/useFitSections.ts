import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useStore } from './store'
import { measureCardHeights, waitForCardImages } from './lib/cardMeasurement'

interface Request { canvasId: string; sectionIds: string[]; cardIds: Set<string> }
const EMPTY_IDS = new Set<string>()

export function useFitSections(root: RefObject<HTMLElement>, canvasId?: string) {
  const [request, setRequest] = useState<Request | null>(null)
  const [error, setError] = useState('')
  const fitSections = useCallback((sectionIds: string[]) => {
    const state = useStore.getState()
    const canvas = state.canvases.find((item) => item.id === state.activeCanvasId)
    if (!canvas || state.editingCardId || state.editingTextId) return
    const sections = (canvas.sections ?? []).filter((section) => sectionIds.includes(section.id))
    if (sections.length === 0) return
    setError('')
    setRequest((current) => current ?? {
      canvasId: canvas.id,
      sectionIds: sections.map((section) => section.id),
      cardIds: new Set(sections.flatMap((section) => section.cardIds ?? [])),
    })
  }, [])

  useEffect(() => { setError('') }, [canvasId])
  useEffect(() => {
    if (!request) return
    if (canvasId !== request.canvasId) { setRequest(null); return }
    const controller = new AbortController()
    const run = async () => {
      try {
        const elements = Array.from(root.current?.querySelectorAll<HTMLElement>('.note-card[data-card-id]') ?? [])
          .filter((element) => request.cardIds.has(element.dataset.cardId!))
        await waitForCardImages(elements, controller.signal)
        if (controller.signal.aborted) return
        const state = useStore.getState()
        if (state.activeCanvasId !== request.canvasId) return
        const canvas = state.canvases.find((item) => item.id === request.canvasId)
        if (!canvas) return
        const heights = measureCardHeights(elements.filter((element) => element.isConnected))
        const liveMembers = new Set((canvas.sections ?? []).filter((section) => request.sectionIds.includes(section.id))
          .flatMap((section) => section.cardIds ?? []))
        if (canvas.cards.some((card) => liveMembers.has(card.id) && !heights[card.id])) {
          throw new Error('分区内容已变化，请重试最佳大小。')
        }
        for (const id of request.sectionIds) state.compactSection(id, heights)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '调整失败，请重试。')
      } finally {
        if (!controller.signal.aborted) setRequest(null)
      }
    }
    void run()
    return () => controller.abort()
  }, [request, canvasId, root])

  return { fitSections, fittingCardIds: request?.cardIds ?? EMPTY_IDS, fitting: !!request, error }
}
