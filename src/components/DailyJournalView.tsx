import { useMemo } from 'react'
import RichEditor from './RichEditor'
import { useStore } from '../store'
import { addDays, formatDateTitle, stripMarkdown } from '../lib/dateUtils'

export default function DailyJournalView() {
  const journal = useStore((s) => s.journal)
  const selectedDate = useStore((s) => s.journalSelectedDate)
  const viewMode = useStore((s) => s.journalViewMode)
  const setSelectedDate = useStore((s) => s.setJournalSelectedDate)
  const setViewMode = useStore((s) => s.setJournalViewMode)
  const saveEntry = useStore((s) => s.upsertJournalEntry)
  const entry = journal.entriesByDate[selectedDate]
  const sortedEntries = useMemo(
    () => Object.values(journal.entriesByDate).sort((a, b) => b.date.localeCompare(a.date)),
    [journal.entriesByDate],
  )

  return (
    <main className="journal-main">
      <header className="journal-toolbar">
        <div>
          <h2>每日记</h2>
          <p>每天留下一点想法、心得和进展。</p>
        </div>
        <div className="journal-toolbar-actions">
          <button className={viewMode === 'detail' ? 'active' : ''} onClick={() => setViewMode('detail')}>详情</button>
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>历史</button>
        </div>
      </header>

      {viewMode === 'detail' ? (
        <section className="journal-detail">
          <div className="journal-detail-header">
            <div>
              <div className="journal-date-label">{formatDateTitle(selectedDate)}</div>
              <input
                className="journal-title-input"
                value={entry?.customTitle ?? ''}
                placeholder={formatDateTitle(selectedDate)}
                onChange={(event) => saveEntry(selectedDate, { customTitle: event.target.value, content: entry?.content ?? '' })}
              />
            </div>
            <div className="journal-day-actions">
              <button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>前一天</button>
              <button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>后一天</button>
            </div>
          </div>
          <div className="journal-editor-panel">
            <RichEditor
              key={selectedDate}
              content={entry?.content ?? ''}
              onChange={(content) => saveEntry(selectedDate, { customTitle: entry?.customTitle ?? '', content })}
            />
          </div>
        </section>
      ) : (
        <section className="journal-history">
          {sortedEntries.length === 0 ? (
            <div className="journal-empty">还没有每日记。从今天开始，写一点就够了。</div>
          ) : sortedEntries.map((item) => (
            <button
              key={item.date}
              className="journal-history-row"
              onClick={() => { setSelectedDate(item.date); setViewMode('detail') }}
            >
              <span>{item.date}</span>
              <strong>{item.customTitle || formatDateTitle(item.date)}</strong>
              <small>{stripMarkdown(item.content).slice(0, 120) || '这一天还没有正文内容'}</small>
            </button>
          ))}
        </section>
      )}
    </main>
  )
}
