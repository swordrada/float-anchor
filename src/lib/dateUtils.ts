export function padDate(value: number) {
  return String(value).padStart(2, '0')
}

export function toDateKey(input: Date | string | number) {
  const date = input instanceof Date ? input : new Date(input)
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`
}

export function toMonthKey(input: Date | string | number) {
  const date = input instanceof Date ? input : new Date(input)
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}`
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, (month || 1) - 1, 1)
}

export function getTodayDateKey() {
  return toDateKey(new Date())
}

export function getCurrentMonthKey() {
  return toMonthKey(new Date())
}

export function formatDateTitle(dateKey: string) {
  const date = parseDateKey(dateKey)
  return `${date.getFullYear()}/${padDate(date.getMonth() + 1)}/${padDate(date.getDate())}`
}

export function formatDateLabel(dateKey: string) {
  const date = parseDateKey(dateKey)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
}

export function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + amount)
  return toDateKey(date)
}

export function addMonths(monthKey: string, amount: number) {
  const date = parseMonthKey(monthKey)
  date.setMonth(date.getMonth() + amount)
  return toMonthKey(date)
}

export function isSameMonth(dateKey: string, monthKey: string) {
  return dateKey.startsWith(monthKey)
}

export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[#>*_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trim()}...`
}

export function getMonthGrid(monthKey: string) {
  const monthStart = parseMonthKey(monthKey)
  const firstDay = new Date(monthStart)
  const offset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(firstDay)
  gridStart.setDate(firstDay.getDate() - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart)
    current.setDate(gridStart.getDate() + index)
    return {
      dateKey: toDateKey(current),
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === monthStart.getMonth(),
    }
  })
}

export function getDaysBetween(startDateKey: string, endDateKey: string) {
  const start = parseDateKey(startDateKey)
  const end = parseDateKey(endDateKey)
  const days: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    days.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function isWorkday(dateKey: string) {
  const day = parseDateKey(dateKey).getDay()
  return day !== 0 && day !== 6
}

export function getStartOfWeek(dateKey: string) {
  const date = parseDateKey(dateKey)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return toDateKey(date)
}

export function getEndOfWeek(dateKey: string) {
  return addDays(getStartOfWeek(dateKey), 6)
}

export function getStartOfMonth(dateKey: string) {
  const date = parseDateKey(dateKey)
  date.setDate(1)
  return toDateKey(date)
}

export function getEndOfMonth(dateKey: string) {
  const date = parseDateKey(dateKey)
  date.setMonth(date.getMonth() + 1, 0)
  return toDateKey(date)
}

export function getStartOfQuarter(dateKey: string) {
  const date = parseDateKey(dateKey)
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3
  return toDateKey(new Date(date.getFullYear(), quarterStartMonth, 1))
}

export function getEndOfQuarter(dateKey: string) {
  const start = parseDateKey(getStartOfQuarter(dateKey))
  return toDateKey(new Date(start.getFullYear(), start.getMonth() + 3, 0))
}

export function getStartOfHalfYear(dateKey: string) {
  const date = parseDateKey(dateKey)
  const halfYearMonth = date.getMonth() < 6 ? 0 : 6
  return toDateKey(new Date(date.getFullYear(), halfYearMonth, 1))
}

export function getEndOfHalfYear(dateKey: string) {
  const start = parseDateKey(getStartOfHalfYear(dateKey))
  return toDateKey(new Date(start.getFullYear(), start.getMonth() + 6, 0))
}

export function getStartOfYear(dateKey: string) {
  const date = parseDateKey(dateKey)
  return toDateKey(new Date(date.getFullYear(), 0, 1))
}

export function getEndOfYear(dateKey: string) {
  const date = parseDateKey(dateKey)
  return toDateKey(new Date(date.getFullYear(), 11, 31))
}

export function getDaysRemainingInclusive(startDateKey: string, endDateKey: string) {
  const start = parseDateKey(startDateKey)
  const end = parseDateKey(endDateKey)
  const diff = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(diff / 86_400_000) + 1)
}

export function getRelativeDayLabel(dateKey: string) {
  const today = getTodayDateKey()
  if (dateKey === today) return '今天'
  if (dateKey === addDays(today, -1)) return '昨天'
  if (dateKey === addDays(today, 1)) return '明天'
  return formatDateLabel(dateKey)
}
