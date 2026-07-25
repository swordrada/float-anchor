export function toDateKey(input: Date | string | number) {
  const date = input instanceof Date ? input : new Date(input)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getTodayDateKey() {
  return toDateKey(new Date())
}

export function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return toDateKey(date)
}

export function formatDateTitle(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${year}/${month}/${day}`
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
