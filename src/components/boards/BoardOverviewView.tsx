import { useStore } from '../../store'
import type { Canvas } from '../../types'

interface CanvasOverviewStats {
  cardCount: number
  labelCount: number
  sectionCount: number
}

function getCanvasStats(canvas: Canvas): CanvasOverviewStats {
  return {
    cardCount: canvas.cards.length,
    labelCount: canvas.labels?.length ?? 0,
    sectionCount: canvas.sections?.length ?? 0,
  }
}

function getBoardStructureHint(stats: CanvasOverviewStats) {
  if (stats.sectionCount > 0) return `${stats.sectionCount} 个分组区域`
  if (stats.labelCount > 0) return `${stats.labelCount} 处结构标注`
  return '卡片优先'
}

function getBoardSupportCopy(stats: CanvasOverviewStats) {
  if (stats.cardCount === 0) {
    return '这是一张空白白板。进入后先写第一张卡片，等内容长出来后再决定要不要补结构。'
  }
  if (stats.sectionCount > 0) {
    return `已经开始按主题整理。接下来继续补卡片，比再加更多结构更重要。`
  }
  if (stats.labelCount > 0) {
    return '已经有一些结构标注。下一步更值得做的是继续把内容写进卡片。'
  }
  return '这张白板现在以卡片为主，适合直接继续写，不必先搭复杂结构。'
}

export default function BoardOverviewView() {
  const canvases = useStore((s) => s.canvases)
  const openCanvasDetail = useStore((s) => s.openCanvasDetail)
  const addCanvas = useStore((s) => s.addCanvas)

  const handleCreate = () => {
    const input = window.prompt('输入新白板名称：', `白板 ${canvases.length + 1}`)
    const name = input?.trim()
    if (!name) return
    addCanvas(name)
  }

  const handleOpenCanvas = (canvasId: string) => {
    openCanvasDetail(canvasId)
  }

  return (
    <main className="module-main board-overview-view">
      <div className="module-toolbar">
        <div>
          <h2 className="module-toolbar-title">笔记白板</h2>
          <p className="module-toolbar-subtitle">先按卡片规模选板，再进入白板继续写；结构工具留到你真正需要的时候再出现。</p>
        </div>
        <button className="module-primary-btn" onClick={handleCreate}>新建白板</button>
      </div>

      {canvases.length === 0 ? (
        <div className="module-empty-state">
          <h3>还没有白板</h3>
          <p>先创建一张白板，再用卡片把想法写出来。</p>
          <button className="module-primary-btn" onClick={handleCreate}>创建第一张白板</button>
        </div>
      ) : (
        <div className="board-overview-grid">
          {canvases.map((canvas) => {
            const stats = getCanvasStats(canvas)
            const structureHint = getBoardStructureHint(stats)
            const supportCopy = getBoardSupportCopy(stats)

            return (
              <article
                key={canvas.id}
                className="board-overview-card"
                role="button"
                tabIndex={0}
                onClick={() => handleOpenCanvas(canvas.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleOpenCanvas(canvas.id)
                  }
                }}
              >
                <div className="board-overview-header">
                  <div className="board-overview-title-group">
                    <h3 title={canvas.name}>{canvas.name}</h3>
                  </div>
                  <span className="board-overview-total-pill">{stats.cardCount > 0 ? `${stats.cardCount} 张卡片` : '空白白板'}</span>
                </div>

                <div className="board-overview-summary">
                  <div className="board-overview-primary">
                    <strong>{stats.cardCount}</strong>
                    <span>张卡片</span>
                  </div>
                  <p>{supportCopy}</p>
                  <div className="board-overview-meta">
                    <span>{structureHint}</span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
