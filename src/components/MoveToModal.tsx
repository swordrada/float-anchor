import { useEffect, useRef } from 'react'
import { useStore, useAllCanvases } from '../store'

interface Props {
  cardId: string
  onClose: () => void
}

export default function MoveToModal({ cardId, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const canvases = useAllCanvases()
  const activeCanvasId = useStore((s) => s.activeCanvasId)
  const moveCardToCanvas = useStore((s) => s.moveCardToCanvas)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler, true)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler, true)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  const targets = canvases.filter((c) => c.id !== activeCanvasId)

  return (
    <div className="modal-overlay">
      <div ref={ref} className="modal-box">
        <div className="modal-header">
          <h3>移动到画布</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {targets.length === 0 ? (
            <p className="modal-empty">没有其他画布可移动</p>
          ) : (
            targets.map((c) => (
              <button
                key={c.id}
                className="modal-canvas-item"
                onClick={() => {
                  moveCardToCanvas(cardId, c.id)
                  onClose()
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                </svg>
                <span>{c.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
