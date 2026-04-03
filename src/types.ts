export interface Card {
  id: string
  title: string
  content: string
  x: number
  y: number
  width: number
  height?: number
}

export interface Canvas {
  id: string
  name: string
  cards: Card[]
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
