import { useMemo, useState } from 'react'
import RichEditor from '../RichEditor'
import { useJournalEntries, useSortedJournalEntries, useStore, useUIState } from '../../store'
import { addDays, addMonths, clampText, formatDateTitle, getMonthGrid, getRelativeDayLabel, isSameMonth, stripMarkdown } from '../../lib/dateUtils'

function CalendarPopover({
  monthKey,
  selectedDate,
  writtenDates,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: {
  monthKey: string
  selectedDate: string
  writtenDates: Set<string>
  onPrevMonth: () => void
  onNextMonth: () => void
  onSelectDate: (date: string) => void
}) {
  const grid = useMemo(() => getMonthGrid(monthKey), [monthKey])

  return (
    <div className="journal-calendar-popover">
      <div className="journal-calendar-header">
        <button onClick={onPrevMonth} title="上个月">‹</button>
        <strong>{monthKey.replace('-', ' / ')}</strong>
        <button onClick={onNextMonth} title="下个月">›</button>
      </div>
      <div className="journal-calendar-weekdays">
        {['一', '二', '三', '四', '五', '六', '日'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="journal-calendar-grid">
        {grid.map((cell) => (
          <button
            key={cell.dateKey}
            className={[
              'journal-calendar-day',
              cell.dateKey === selectedDate ? 'active' : '',
              cell.inCurrentMonth ? '' : 'muted',
              writtenDates.has(cell.dateKey) ? 'written' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelectDate(cell.dateKey)}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DailyJournalView() {
  const entriesByDate = useJournalEntries()
  const sortedEntries = useSortedJournalEntries()
  const uiState = useUIState()
  const setJournalViewMode = useStore((s) => s.setJournalViewMode)
  const setJournalSelectedDate = useStore((s) => s.setJournalSelectedDate)
  const setJournalCalendarMonth = useStore((s) => s.setJournalCalendarMonth)
  const upsertJournalEntry = useStore((s) => s.upsertJournalEntry)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const selectedDate = uiState.journalSelectedDate
  const entry = entriesByDate[selectedDate]
  const displayTitle = entry?.customTitle ?? ''
  const content = entry?.content ?? ''
  const writtenDates = useMemo(() => new Set(Object.keys(entriesByDate)), [entriesByDate])

  return (
    <main className="module-main journal-view">
      <div className="module-toolbar">
        <div>
          <h2 className="module-toolbar-title">每日记</h2>
          <p className="module-toolbar-subtitle">每天留一格，把想法、心得和进展自然记录下来。</p>
        </div>
        <div className="module-toolbar-actions">
          <div className="segmented-control">
            <button
              className={uiState.journalViewMode === 'detail' ? 'active' : ''}
              onClick={() => setJournalViewMode('detail')}
            >
              详情视图
            </button>
            <button
              className={uiState.journalViewMode === 'table' ? 'active' : ''}
              onClick={() => setJournalViewMode('table')}
            >
              表格视图
            </button>
          </div>
          <div className="journal-calendar-wrap">
            <button
              className="journal-calendar-btn"
              onClick={() => setCalendarOpen((value) => !value)}
              title="打开日历"
            >
              <span className="journal-calendar-month">{uiState.journalCalendarMonth.slice(5, 7)}</span>
              <span className="journal-calendar-daynum">{selectedDate.slice(8, 10)}</span>
            </button>
            {calendarOpen && (
              <CalendarPopover
                monthKey={uiState.journalCalendarMonth}
                selectedDate={selectedDate}
                writtenDates={writtenDates}
                onPrevMonth={() => setJournalCalendarMonth(addMonths(uiState.journalCalendarMonth, -1))}
                onNextMonth={() => setJournalCalendarMonth(addMonths(uiState.journalCalendarMonth, 1))}
                onSelectDate={(date) => {
                  setJournalSelectedDate(date)
                  if (!isSameMonth(date, uiState.journalCalendarMonth)) {
                    setJournalCalendarMonth(date.slice(0, 7))
                  }
                  setCalendarOpen(false)
                }}
              />
            )}
          </div>
        </div>
      </div>

      {uiState.journalViewMode === 'detail' ? (
        <div className="journal-detail-view">
          <div className="journal-detail-header">
            <div>
              <div className="journal-date-chip">{getRelativeDayLabel(selectedDate)}</div>
              <input
                className="journal-title-input"
                value={displayTitle}
                placeholder={formatDateTitle(selectedDate)}
                onChange={(event) => upsertJournalEntry(selectedDate, { customTitle: event.target.value, content })}
              />
            </div>
            <div className="journal-day-switcher">
              <button onClick={() => setJournalSelectedDate(addDays(selectedDate, -1))}>前一天</button>
              <button onClick={() => setJournalSelectedDate(addDays(selectedDate, 1))}>后一天</button>
            </div>
          </div>
          <div className="journal-editor-panel">
            <RichEditor
              key={selectedDate}
              content={content}
              onChange={(markdown) => upsertJournalEntry(selectedDate, { customTitle: displayTitle, content: markdown })}
            />
          </div>
        </div>
      ) : (
        <div className="journal-table-view">
          <div className="journal-table-head">
            <span>日期</span>
            <span>标题</span>
            <span>正文预览</span>
          </div>
          {sortedEntries.length === 0 ? (
            <div className="module-empty-state compact">
              <h3>还没有写下任何每日记</h3>
              <p>先从今天开始，留下一点想法就够了。</p>
            </div>
          ) : (
            sortedEntries.map((journalEntry) => {
              const preview = clampText(stripMarkdown(journalEntry.content || ''), 120) || '这一天还没有正文内容'
              return (
                <div key={journalEntry.date} className="journal-table-row">
                  <button onClick={() => setJournalSelectedDate(journalEntry.date)}>
                    {journalEntry.date}
                  </button>
                  <button onClick={() => setJournalSelectedDate(journalEntry.date)}>
                    {journalEntry.customTitle || formatDateTitle(journalEntry.date)}
                  </button>
                  <button
                    className="journal-preview-link"
                    onClick={() => {
                      setJournalSelectedDate(journalEntry.date)
                      setJournalViewMode('detail')
                    }}
                  >
                    {preview}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </main>
  )
}
