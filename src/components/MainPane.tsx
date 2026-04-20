import CanvasView from './CanvasView'
import BoardOverviewView from './boards/BoardOverviewView'
import DailyJournalView from './journal/DailyJournalView'
import TrackSystemView from './tracks/TrackSystemView'
import { useMainView, useStore, useUIState } from '../store'

export default function MainPane() {
  const mainView = useMainView()
  const uiState = useUIState()
  const activeCanvasId = useStore((s) => s.activeCanvasId)

  if (mainView === 'journal') {
    return <DailyJournalView />
  }

  if (mainView === 'tracks') {
    return <TrackSystemView />
  }

  if (uiState.boardViewMode === 'overview' || !activeCanvasId) {
    return <BoardOverviewView />
  }

  return <CanvasView />
}
