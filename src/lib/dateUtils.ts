export function toDateKey(input: Date | string | number) {
  const date = input instanceof Date ? input : new Date(input)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getTodayDateKey() {
  return toDateKey(new Date())
}

export function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return toDateKey(date)
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addMonths(monthKey: string, amount: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  date.setMonth(date.getMonth() + amount)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthGrid(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(firstDay)
  gridStart.setDate(firstDay.getDate() - mondayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      dateKey: toDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month - 1,
    }
  })
}

export function formatDateTitle(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${year}/${month}/${day}`
}

export function formatJournalDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export function getRelativeDayLabel(dateKey: string) {
  const today = getTodayDateKey()
  if (dateKey === today) return '今天'
  if (dateKey === addDays(today, -1)) return '昨天'
  if (dateKey === addDays(today, 1)) return '明天'
  return ''
}

export function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[#>*_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
