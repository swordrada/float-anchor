import type { MouseEvent } from 'react'
import './CanvasSelectionToolbar.css'

interface Props {
  cardCount: number
  connecting: boolean
  pairConnected: boolean
  canArrange: boolean
  onGroup: () => void
  onConnect: () => void
  onArrange: () => void
  onClear: () => void
}

function ToolbarIcon({ name }: { name: 'group' | 'connect' | 'arrange' | 'clear' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'group' && <><rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" /><rect x="7" y="8" width="4" height="8" rx="1" /><rect x="14" y="8" width="3" height="5" rx="1" /></>}
      {name === 'connect' && <><rect x="2" y="4" width="6" height="6" rx="1.5" /><rect x="16" y="14" width="6" height="6" rx="1.5" /><path d="M8 7h4a3 3 0 0 1 3 3v4M12 12l3 3 3-3" /></>}
      {name === 'arrange' && <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>}
      {name === 'clear' && <><path d="m6 6 12 12M18 6 6 18" /></>}
    </svg>
  )
}

function stopCanvasEvent(event: MouseEvent) {
  event.stopPropagation()
}

export default function CanvasSelectionToolbar({
  cardCount,
  connecting,
  pairConnected,
  canArrange,
  onGroup,
  onConnect,
  onArrange,
  onClear,
}: Props) {
  if (cardCount === 0 && !connecting) return null

  const connectedPair = cardCount === 2 && pairConnected
  const canConnect = !connecting && (cardCount === 1 || cardCount === 2) && !connectedPair
  const connectTitle = connecting
    ? '点击目标卡片完成连线，按 Esc 取消'
    : connectedPair
      ? '这两张卡片已经连接'
      : cardCount > 2
        ? '请选择一张卡片后点击目标，或选择两张卡片直接连线'
        : cardCount === 2
          ? '连接选中的两张卡片'
          : '开始连线，然后点击目标卡片'

  return (
    <div
      className={`canvas-selection-toolbar${connecting ? ' is-connecting' : ''}`}
      role="toolbar"
      aria-label="卡片操作"
      onMouseDown={stopCanvasEvent}
      onDoubleClick={stopCanvasEvent}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="selection-toolbar-main">
        <span className="selection-toolbar-count" aria-live="polite">
          {cardCount > 0 ? <>已选 <strong>{cardCount}</strong> 张</> : '卡片连线'}
        </span>
        <div className="selection-toolbar-actions">
          <button
            type="button"
            className="selection-toolbar-action"
            disabled={connecting || cardCount < 2}
            title={cardCount < 2 ? '选择至少两张卡片后创建分区' : '将选中的卡片放入同一分区'}
            onClick={onGroup}
          >
            <ToolbarIcon name="group" />
            <span>分区编组</span>
          </button>
          <button
            type="button"
            className={`selection-toolbar-action${connecting ? ' is-active' : ''}`}
            disabled={!canConnect}
            title={connectTitle}
            onClick={onConnect}
          >
            <ToolbarIcon name="connect" />
            <span>{connecting ? '连线中' : connectedPair ? '已连接' : '连线'}</span>
          </button>
          <button
            type="button"
            className="selection-toolbar-action"
            disabled={connecting || !canArrange}
            title={!canArrange ? '选择至少两个独立元素后自动排布' : '整齐排布选中的卡片和分区'}
            onClick={onArrange}
          >
            <ToolbarIcon name="arrange" />
            <span>自动排布</span>
          </button>
          <button
            type="button"
            className="selection-toolbar-action selection-toolbar-clear"
            title={connecting ? '取消连线（Esc）' : '取消选择（Esc）'}
            onClick={onClear}
          >
            <ToolbarIcon name="clear" />
            <span>{connecting ? '取消连线' : '取消选择'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
