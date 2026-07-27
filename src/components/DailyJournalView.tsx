import { useEffect, useMemo, useState } from 'react'
import RichEditor from './RichEditor'
import { useStore } from '../store'
import {
  addDays,
  addMonths,
  formatJournalDate,
  getMonthGrid,
  getRelativeDayLabel,
  getTodayDateKey,
  parseDateKey,
  stripMarkdown,
} from '../lib/dateUtils'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function isRecordedEntry(entry: { customTitle?: string; content: string } | undefined) {
  return Boolean(entry?.customTitle?.trim() || entry?.content.trim())
}

function CalendarIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

export default function DailyJournalView() {
  const journal = useStore((s) => s.journal)
  const selectedDate = useStore((s) => s.journalSelectedDate)
  const viewMode = useStore((s) => s.journalViewMode)
  const setSelectedDate = useStore((s) => s.setJournalSelectedDate)
  const setViewMode = useStore((s) => s.setJournalViewMode)
  const saveEntry = useStore((s) => s.upsertJournalEntry)
  const [visibleMonth, setVisibleMonth] = useState(selectedDate.slice(0, 7))

  const entry = journal.entriesByDate[selectedDate]
  const hasEntry = isRecordedEntry(entry)
  const today = getTodayDateKey()
  const relativeLabel = getRelativeDayLabel(selectedDate)
  const writtenDates = useMemo(
    () => new Set(Object.values(journal.entriesByDate).filter(isRecordedEntry).map((item) => item.date)),
    [journal.entriesByDate],
  )
  const monthGrid = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth])
  const currentMonthWrittenCount = useMemo(
    () => Object.values(journal.entriesByDate)
      .filter((item) => item.date.startsWith(visibleMonth) && isRecordedEntry(item)).length,
    [journal.entriesByDate, visibleMonth],
  )
  const sortedEntries = useMemo(
    () => Object.values(journal.entriesByDate).sort((a, b) => b.date.localeCompare(a.date)),
    [journal.entriesByDate],
  )

  useEffect(() => {
    setVisibleMonth(selectedDate.slice(0, 7))
  }, [selectedDate])

  const selectDate = (date: string) => {
    setSelectedDate(date)
    setVisibleMonth(date.slice(0, 7))
  }

  const shiftSelectedDay = (amount: number) => {
    selectDate(addDays(selectedDate, amount))
  }

  return (
    <main className="journal-main">
      <header className="journal-toolbar">
        <div className="journal-toolbar-brand">
          <span className="journal-brand-icon"><CalendarIcon /></span>
          <div>
            <h2>每日记</h2>
            <p>日积跬步，水滴石穿。</p>
          </div>
        </div>
        <div className="journal-toolbar-right">
          <button className="journal-today-button" onClick={() => selectDate(today)}>回到今天</button>
          <div className="journal-view-switch" aria-label="每日记视图">
            <button className={viewMode === 'detail' ? 'active' : ''} onClick={() => setViewMode('detail')}>写作</button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>回顾</button>
          </div>
        </div>
      </header>

      <div className="journal-workspace">
        <aside className="journal-calendar-panel">
          <div className="journal-calendar-heading">
            <button
              className="journal-month-nav"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
              aria-label="上个月"
            >
              ‹
            </button>
            <strong>{visibleMonth.replace('-', ' 年 ')} 月</strong>
            <button
              className="journal-month-nav"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
              aria-label="下个月"
            >
              ›
            </button>
          </div>
          <div className="journal-calendar-weekdays">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="journal-calendar-grid">
            {monthGrid.map((cell) => {
              const written = writtenDates.has(cell.dateKey)
              return (
                <button
                  key={cell.dateKey}
                  className={[
                    'journal-calendar-day',
                    cell.inCurrentMonth ? '' : 'outside',
                    cell.dateKey === today ? 'today' : '',
                    cell.dateKey === selectedDate ? 'selected' : '',
                    written ? 'written' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectDate(cell.dateKey)}
                  aria-label={`${cell.dateKey}${written ? '，已记录' : '，未记录'}`}
                >
                  <span>{cell.day}</span>
                  {written && <i aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          <div className="journal-calendar-summary">
            <span><i /> 有记录</span>
            <strong>本月已写 {currentMonthWrittenCount} 天</strong>
          </div>
          <div className="journal-calendar-tip">
            随手记下，步履不停。
          </div>
        </aside>

        {viewMode === 'detail' ? (
          <section className="journal-writing-shell">
            <div className="journal-writing-header">
              <div className="journal-date-meta">
                <span>{relativeLabel || '每日记录'}</span>
                <div>
                  <time dateTime={selectedDate}>{formatJournalDate(selectedDate)}</time>
                  <small>{hasEntry ? '已记录' : '尚未记录'}</small>
                </div>
              </div>
              <div className="journal-day-actions">
                <button onClick={() => shiftSelectedDay(-1)} aria-label="前一天">←</button>
                <button onClick={() => shiftSelectedDay(1)} aria-label="后一天">→</button>
              </div>
            </div>
            <input
              className="journal-title-input"
              value={entry?.customTitle ?? ''}
              placeholder="给今天起个标题（可选）"
              onChange={(event) => saveEntry(selectedDate, { customTitle: event.target.value })}
            />
            <div className="journal-editor-panel">
              <RichEditor
                key={selectedDate}
                content={entry?.content ?? ''}
                placeholder="从此刻开始，写下今天发生的事、一个想法，或此刻的心情…"
                onChange={(content) => saveEntry(selectedDate, { content })}
              />
            </div>
            <div className="journal-writing-footer">
              <span>{hasEntry ? '已自动保存' : '开始输入后会自动保存'}</span>
              <span>{stripMarkdown(entry?.content ?? '').length} 字</span>
            </div>
          </section>
        ) : (
          <section className="journal-history">
            <div className="journal-history-heading">
              <div>
                <span>记录回顾</span>
                <h3>已经写下的日子</h3>
              </div>
              <strong>{sortedEntries.length} 天</strong>
            </div>
            {sortedEntries.length === 0 ? (
              <div className="journal-empty">
                <CalendarIcon />
                <strong>还没有留下记录</strong>
                <span>从今天开始写一点，未来就多一个可以回来的地方。</span>
                <button onClick={() => setViewMode('detail')}>写下今天</button>
              </div>
            ) : (
              <div className="journal-history-list">
                {sortedEntries.map((item) => {
                  const date = parseDateKey(item.date)
                  const preview = stripMarkdown(item.content)
                  return (
                    <button
                      key={item.date}
                      className="journal-history-row"
                      onClick={() => { selectDate(item.date); setViewMode('detail') }}
                    >
                      <span className="journal-history-date">
                        <strong>{String(date.getDate()).padStart(2, '0')}</strong>
                        <small>{date.getMonth() + 1} 月 · {WEEKDAYS[(date.getDay() + 6) % 7]}</small>
                      </span>
                      <span className="journal-history-copy">
                        <strong>{item.customTitle || '这一天的记录'}</strong>
                        <small>{preview.slice(0, 140) || '只有标题，还没有正文内容'}</small>
                      </span>
                      <span className="journal-history-arrow">→</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
