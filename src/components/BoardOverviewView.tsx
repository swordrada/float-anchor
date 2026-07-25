import { useStore } from '../store'
import type { Canvas } from '../types'

function getStructureSummary(canvas: Canvas) {
  const cards = canvas.cards.length
  const sections = canvas.sections?.length ?? 0
  const labels = canvas.labels?.length ?? 0

  if (cards === 0) return '空白白板'
  if (sections > 0) return `${cards} 张卡片 · ${sections} 个分区`
  if (labels > 0) return `${cards} 张卡片 · ${labels} 个标题`
  return `${cards} 张卡片`
}

export default function BoardOverviewView() {
  const canvases = useStore((s) => s.canvases)
  const setActiveCanvas = useStore((s) => s.setActiveCanvas)
  const addCanvas = useStore((s) => s.addCanvas)

  const createCanvas = () => {
    const name = window.prompt('输入新白板名称：', `白板 ${canvases.length + 1}`)?.trim()
    if (name) addCanvas(name)
  }

  return (
    <main className="board-overview-main">
      <header className="board-overview-toolbar">
        <div>
          <h2>笔记白板</h2>
          <p>从名称和内容规模快速找到要继续整理的白板。</p>
        </div>
        <button className="board-overview-create" onClick={createCanvas}>新建白板</button>
      </header>

      <section className="board-overview-grid" aria-label="白板总览">
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            className="board-overview-card"
            onClick={() => setActiveCanvas(canvas.id)}
          >
            <span className="board-overview-card-name" title={canvas.name}>{canvas.name}</span>
            <span className="board-overview-card-summary">{getStructureSummary(canvas)}</span>
            <span className="board-overview-card-action">打开白板 →</span>
          </button>
        ))}
      </section>
    </main>
  )
}
