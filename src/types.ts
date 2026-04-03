export interface Card {
  id: string
  title: string
  content: string
  x: number
  y: number
  width: number
  height?: number
}

export interface CanvasLabel {
  id: string
  text: string
  level: 0 | 1 | 2 | 3 | 4
  x: number
  y: number
  width: number
}

export interface Section {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface Connection {
  id: string
  fromCardId: string
  toCardId: string
}

export interface Canvas {
  id: string
  name: string
  cards: Card[]
  labels?: CanvasLabel[]
  sections?: Section[]
  connections?: Connection[]
}

export interface AppData {
  canvases: Canvas[]
  activeCanvasId: string | null
}

declare global {
  interface Window {
    electronAPI: {
      readData: () => Promise<AppData | null>
      writeData: (data: AppData) => Promise<boolean>
      getPlatform: () => Promise<string>
      winMinimize: () => void
      winMaximize: () => void
      winClose: () => void
    }
  }
}
