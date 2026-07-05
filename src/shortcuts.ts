export const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

export interface ShortcutDef {
  id: string
  label: string
  mac: string
  win: string
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'card', label: '新建卡片', mac: 'C', win: 'C' },
  { id: 'text', label: '新建文本', mac: 'T', win: 'T' },
  { id: 'section', label: '新建分区', mac: 'R', win: 'R' },
  { id: 'arrange', label: '自动排布选中', mac: 'L', win: 'L' },
  { id: 'compactSection', label: '分区最佳大小（选中分区）', mac: 'F', win: 'F' },
  { id: 'selectAll', label: '全选', mac: '⌘A', win: 'Ctrl+A' },
  { id: 'edit', label: '编辑选中（单选时）', mac: '⏎', win: 'Enter' },
  { id: 'delete', label: '删除选中', mac: '⌫', win: 'Del' },
  { id: 'nudge', label: '微移选中（⇧ 大步）', mac: '方向键', win: '方向键' },
  { id: 'zoomIn', label: '放大', mac: '⌘+', win: 'Ctrl +' },
  { id: 'zoomOut', label: '缩小', mac: '⌘-', win: 'Ctrl -' },
  { id: 'zoomReset', label: '缩放复位', mac: '⌘0', win: 'Ctrl 0' },
  { id: 'deselect', label: '取消选择 / 退出连线', mac: 'Esc', win: 'Esc' },
]

export function scKey(id: string): string {
  const s = SHORTCUTS.find((x) => x.id === id)
  return s ? (IS_MAC ? s.mac : s.win) : ''
}
