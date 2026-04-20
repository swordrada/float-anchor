import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSelectedTrack, useStore, useTrackSystem, useTracks, useUIState } from '../../store'
import {
  buildTrackReport,
  getTrackDashboard,
  getTrackDayStatus,
  getTrackDurationLabel,
  getTrackFrequencyLabel,
  getTrackMilestoneStates,
  getTrackProgressLabel,
  getTrackTodayFocusItems,
  type TrackActionState,
  type TrackCompletionSummary,
  type TrackMilestoneState,
} from '../../lib/trackUtils'
import { formatDateTitle, getTodayDateKey, parseDateKey, toDateKey } from '../../lib/dateUtils'
import type { Track, TrackAction, TrackDuration, TrackMilestone, TrackReportPeriod } from '../../types'
import StarTrackLogo from './StarTrackLogo'

const TRACK_COLORS = ['#4a90d9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6']

interface TrackFormState {
  title: string
  summary: string
  startDate: string
  durationUnit: TrackDuration['unit']
  durationCount: number
  color: string
  milestones: Array<{
    id: string
    title: string
    dueDate: string
    definition: string
    achievedAt?: string
  }>
  actions: Array<{
    id: string
    title: string
    detail: string
    frequencyUnit: TrackAction['frequency']['unit']
    targetCount: number
  }>
}

function addDurationToDateKey(startDate: string, duration: TrackDuration) {
  const date = parseDateKey(startDate)
  if (duration.unit === 'year') {
    date.setFullYear(date.getFullYear() + duration.count)
  } else {
    date.setMonth(date.getMonth() + duration.count)
  }
  return toDateKey(date)
}

function createMilestoneForm(targetDate: string, index = 0): TrackFormState['milestones'][number] {
  return {
    id: `draft-milestone-${Date.now()}-${index}`,
    title: '',
    dueDate: targetDate,
    definition: '',
    achievedAt: undefined,
  }
}

function createActionForm(index = 0): TrackFormState['actions'][number] {
  return {
    id: `draft-action-${Date.now()}-${index}`,
    title: '',
    detail: '',
    frequencyUnit: 'daily',
    targetCount: 1,
  }
}

function createTrackForm(track?: Track): TrackFormState {
  const startDate = track?.startDate ?? getTodayDateKey()
  const duration = track?.duration ?? { unit: 'month' as const, count: 6 }
  const targetDate = addDurationToDateKey(startDate, duration)

  return {
    title: track?.title ?? '',
    summary: track?.summary ?? '',
    startDate,
    durationUnit: duration.unit,
    durationCount: duration.count,
    color: track?.color ?? TRACK_COLORS[0],
    milestones: track?.milestones.length
      ? track.milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          dueDate: milestone.dueDate,
          definition: milestone.definition,
          achievedAt: milestone.achievedAt,
        }))
      : [createMilestoneForm(targetDate)],
    actions: track?.actions.length
      ? track.actions.map((action) => ({
          id: action.id,
          title: action.title,
          detail: action.detail,
          frequencyUnit: action.frequency.unit,
          targetCount: action.frequency.targetCount,
        }))
      : [createActionForm()],
  }
}

function normalizeMilestones(milestones: TrackFormState['milestones']) {
  return milestones
    .map((milestone, index) => ({
      id: milestone.id || `track-milestone-${Date.now()}-${index}`,
      title: milestone.title.trim(),
      dueDate: milestone.dueDate,
      definition: milestone.definition.trim(),
      achievedAt: milestone.achievedAt,
    }))
    .filter((milestone) => milestone.title)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function normalizeActions(actions: TrackFormState['actions']): TrackAction[] {
  return actions
    .map((action, index) => ({
      id: action.id || `track-action-${Date.now()}-${index}`,
      title: action.title.trim(),
      detail: action.detail.trim(),
      frequency: {
        unit: action.frequencyUnit,
        targetCount: Math.max(1, Number(action.targetCount) || 1),
      },
    }))
    .filter((action) => action.title)
}

function getMilestoneStatusLabel(state: TrackMilestoneState) {
  if (state.milestone.achievedAt) return '已达成'
  if (state.status === 'overdue') return '已延期'
  if (state.isCurrent) return '当前阶段'
  if (state.status === 'dueSoon') return '临近节点'
  return '待达成'
}

function getActionWindowLabel(actionState: TrackActionState) {
  return `${actionState.periodStart} - ${actionState.periodEnd}`
}

function getActionHint(state: TrackActionState) {
  if (state.isRestDay) return '今天是非工作日，这个工作日动作今日无须推进，不会进入待办或拉低在轨状态'
  if (state.periodMet) return '本周期已按要求完成'
  if (state.dueToday) return '今天最好推进一次，避免脱轨'
  return '当前还有缓冲，继续稳定累积'
}

function getGoalRatio(track: Track, today: string) {
  const dashboard = getTrackDashboard(track, today)
  return dashboard.totalMilestones > 0 ? dashboard.milestoneProgressRatio : dashboard.timeProgressRatio
}

function getReportLabel(period: TrackReportPeriod) {
  if (period === 'week') return '周报'
  if (period === 'month') return '月报'
  if (period === 'quarter') return '季报'
  if (period === 'halfYear') return '半年报'
  return '年报'
}

function formatTrackLogTime(timestamp: number) {
  const date = new Date(timestamp)
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${hour}:${minute}`
}

function getActionPeriodLabel(unit: TrackAction['frequency']['unit']) {
  if (unit === 'daily' || unit === 'workday') return '今日'
  if (unit === 'weekly') return '本周'
  return '本月'
}

function getActionProgressHeadline(state: TrackActionState) {
  if (state.isRestDay) return '今日无须推进'
  const periodLabel = getActionPeriodLabel(state.action.frequency.unit)
  return `${periodLabel} ${state.periodCount} / ${state.targetCount}`
}

function getActionExecutionLabel(state: TrackActionState) {
  if (state.isRestDay) {
    return '今日无须推进'
  }
  if (state.action.frequency.unit === 'daily' || state.action.frequency.unit === 'workday') {
    return `今天已完成 ${state.todayCount} 次`
  }
  if (state.action.frequency.unit === 'weekly') {
    return `今天贡献 ${state.todayCount} 次，本周共 ${state.periodCount} 次`
  }
  return `今天贡献 ${state.todayCount} 次，本月共 ${state.periodCount} 次`
}

function getActionLogHeading(state: TrackActionState) {
  if (state.action.frequency.unit === 'daily' || state.action.frequency.unit === 'workday') return '今日完成时间'
  if (state.action.frequency.unit === 'weekly') return '本周完成记录'
  return '本月完成记录'
}

function formatActionLogLabel(state: TrackActionState, completedAt: number, date: string) {
  const time = formatTrackLogTime(completedAt)
  if (state.action.frequency.unit === 'daily' || state.action.frequency.unit === 'workday') return time
  return `${date.slice(5)} ${time}`
}

function getCompletionSummaryLabel(summary: TrackCompletionSummary['daily'], unit: TrackAction['frequency']['unit']) {
  const unitLabel = getTrackFrequencyLabel(unit)
  if (summary.total === 0) return `未设置${unitLabel}动作`
  if (summary.completed >= summary.total) return `${unitLabel}动作已全部完成`
  return `${unitLabel}动作 ${summary.completed} / ${summary.total} 完成`
}

function getRoutineCompletionSummary(summary: TrackCompletionSummary) {
  return {
    total: summary.daily.total + summary.workday.total,
    completed: summary.daily.completed + summary.workday.completed,
  }
}

function getRoutineSummaryLabel(summary: TrackCompletionSummary, options?: { preferRestLabel?: boolean }) {
  const routine = getRoutineCompletionSummary(summary)
  if (routine.total === 0) {
    return options?.preferRestLabel && summary.workday.total === 0 && summary.daily.total === 0
      ? '今天没有需要执行的日常动作'
      : '今天没有需要执行的日常动作'
  }
  if (routine.completed >= routine.total) return '日常动作已全部完成'
  return `日常动作 ${routine.completed} / ${routine.total} 完成`
}

function ProgressRing({
  ratio,
  color,
  value,
  label,
  hint,
  compact = false,
}: {
  ratio: number
  color: string
  value: string
  label: string
  hint?: string
  compact?: boolean
}) {
  const style = {
    '--track-ring-angle': `${Math.max(0, Math.min(1, ratio)) * 360}deg`,
    '--track-ring-color': color,
  } as CSSProperties

  return (
    <div className={`track-progress-ring ${compact ? 'compact' : ''}`} style={style}>
      <div className="track-progress-ring-inner">
        <strong>{value}</strong>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  )
}

function CelebrationOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="track-celebration">
      {Array.from({ length: 16 }, (_, index) => (
        <span key={index} style={{ left: `${(index % 8) * 12 + 6}%`, animationDelay: `${(index % 4) * 0.08}s` }} />
      ))}
    </div>
  )
}

function TrackDeleteModal({
  track,
  cloudEnabled,
  onClose,
  onConfirm,
}: {
  track: Track
  cloudEnabled: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const isMatched = confirmText === track.title

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="track-delete-modal">
        <div className="track-delete-header">
          <div>
            <span className="track-editor-kicker danger">危险操作</span>
            <h3>删除星轨「{track.title}」</h3>
            <p>删除后不可恢复，相关阶段成果、原子动作和全部执行记录都会一起删除。</p>
          </div>
          <button onClick={onClose}>取消</button>
        </div>

        <div className="track-delete-warning">
          <strong>删除前请再次确认：</strong>
          <p>
            {cloudEnabled
              ? '当前已连接坚果云，本次删除会随着本地同步一起删除云端对应内容，删除后无法从云端找回。'
              : '当前未连接坚果云，但本地删除后同样无法恢复。'}
          </p>
        </div>

        <div className="track-delete-confirm">
          <label htmlFor="track-delete-confirm-input">
            请输入当前星轨标题以确认删除
          </label>
          <div className="track-delete-confirm-target">{track.title}</div>
          <input
            id="track-delete-confirm-input"
            className="track-delete-input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="请完整输入上方标题"
          />
        </div>

        <div className="track-delete-actions">
          <button onClick={onClose}>我再想想</button>
          <button className="danger-btn" disabled={!isMatched} onClick={onConfirm}>
            永久删除这条星轨
          </button>
        </div>
      </div>
    </div>
  )
}

function TrackEditorModal({
  track,
  onClose,
}: {
  track?: Track | null
  onClose: () => void
}) {
  const saveTrack = useStore((s) => s.saveTrack)
  const [form, setForm] = useState<TrackFormState>(() => createTrackForm(track ?? undefined))

  const targetDate = useMemo(() => addDurationToDateKey(form.startDate, {
    unit: form.durationUnit,
    count: Math.max(1, Number(form.durationCount) || 1),
  }), [form.durationCount, form.durationUnit, form.startDate])

  const updateMilestone = (milestoneId: string, patch: Partial<TrackFormState['milestones'][number]>) => {
    setForm((prev) => ({
      ...prev,
      milestones: prev.milestones.map((milestone) => milestone.id === milestoneId ? { ...milestone, ...patch } : milestone),
    }))
  }

  const updateAction = (actionId: string, patch: Partial<TrackFormState['actions'][number]>) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.map((action) => action.id === actionId ? { ...action, ...patch } : action),
    }))
  }

  const handleSave = () => {
    const duration = {
      unit: form.durationUnit,
      count: Math.max(1, Number(form.durationCount) || 1),
    } satisfies TrackDuration
    const milestones = normalizeMilestones(form.milestones)
    const actions = normalizeActions(form.actions)

    if (!form.title.trim()) {
      window.alert('请先写清楚终极目标名称。')
      return
    }
    if (!form.summary.trim()) {
      window.alert('请补充终极目标简介，说明你为什么要做这件事。')
      return
    }
    if (milestones.length === 0) {
      window.alert('至少要拆出一个阶段性成果。')
      return
    }
    if (milestones.some((milestone) => !milestone.definition)) {
      window.alert('请为每个阶段成果写明“达成标志”，否则系统无法判断这一阶段长什么样。')
      return
    }
    if (milestones.some((milestone) => milestone.dueDate < form.startDate || milestone.dueDate > targetDate)) {
      window.alert('阶段成果的达成时间需要落在整条星轨周期内。')
      return
    }
    if (actions.length === 0) {
      window.alert('至少配置一个原子动作，让用户知道每天/每周到底该做什么。')
      return
    }

    saveTrack({
      trackId: track?.id,
      title: form.title,
      summary: form.summary,
      startDate: form.startDate,
      duration,
      color: form.color,
      milestones,
      actions,
    })

    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="track-editor-modal">
        <div className="track-editor-header">
          <div>
            <h3>{track ? '重构星轨' : '新建星轨'}</h3>
            <p>先确定终极目标，再拆阶段成果，最后落到每天/每周真正要做的原子动作。</p>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>

        <div className="track-editor-section">
          <div className="track-editor-section-head">
            <div>
              <span className="track-editor-kicker">第一类</span>
              <h4>终极目标</h4>
              <p>这里决定方向。用户需要知道自己最终要成为谁，以及这条路预计走多久。</p>
            </div>
            <div className="track-editor-inline-note">
              <strong>预计终点</strong>
              <span>{targetDate}</span>
            </div>
          </div>
          <div className="track-editor-goal-grid">
            <label>
              终极目标名称
              <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            </label>
            <label className="wide">
              目标简介
              <textarea value={form.summary} onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))} />
            </label>
            <label>
              开始日期
              <input type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value || getTodayDateKey() }))} />
            </label>
            <label>
              预计用时
              <div className="track-editor-inline-fields">
                <input
                  type="number"
                  min="1"
                  value={form.durationCount}
                  onChange={(event) => setForm((prev) => ({ ...prev, durationCount: Number(event.target.value) || 1 }))}
                />
                <select value={form.durationUnit} onChange={(event) => setForm((prev) => ({ ...prev, durationUnit: event.target.value as TrackDuration['unit'] }))}>
                  <option value="month">个月</option>
                  <option value="year">年</option>
                </select>
              </div>
            </label>
            <label>
              主题色
              <div className="track-color-picker">
                {TRACK_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={form.color === color ? 'active' : ''}
                    style={{ background: color }}
                    onClick={() => setForm((prev) => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </label>
          </div>
        </div>

        <div className="track-editor-section">
          <div className="track-editor-section-head">
            <div>
              <span className="track-editor-kicker">第二类</span>
              <h4>阶段性成果</h4>
              <p>阶段成果不是任务，而是中继站。要写清楚何时达成、达成后长什么样。</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, milestones: [...prev.milestones, createMilestoneForm(targetDate, prev.milestones.length)] }))}
            >
              添加阶段
            </button>
          </div>

          <div className="track-editor-stack">
            {form.milestones.map((milestone, index) => (
              <div key={milestone.id} className="track-editor-row-card">
                <div className="track-editor-row-header">
                  <strong>阶段 {index + 1}</strong>
                  {form.milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, milestones: prev.milestones.filter((item) => item.id !== milestone.id) }))}
                    >
                      删除
                    </button>
                  )}
                </div>
                <div className="track-editor-row-grid milestone">
                  <label>
                    阶段成果
                    <input value={milestone.title} onChange={(event) => updateMilestone(milestone.id, { title: event.target.value })} />
                  </label>
                  <label>
                    预期达成时间
                    <input type="date" value={milestone.dueDate} onChange={(event) => updateMilestone(milestone.id, { dueDate: event.target.value })} />
                  </label>
                  <label className="wide">
                    达成标志
                    <textarea value={milestone.definition} onChange={(event) => updateMilestone(milestone.id, { definition: event.target.value })} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="track-editor-section">
          <div className="track-editor-section-head">
            <div>
              <span className="track-editor-kicker">第三类</span>
              <h4>原子动作</h4>
              <p>动作要足够小，小到用户不用每天再思考，只需要照着做并持续复利。</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, actions: [...prev.actions, createActionForm(prev.actions.length)] }))}
            >
              添加动作
            </button>
          </div>

          <div className="track-editor-stack">
            {form.actions.map((action, index) => (
              <div key={action.id} className="track-editor-row-card">
                <div className="track-editor-row-header">
                  <strong>动作 {index + 1}</strong>
                  {form.actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, actions: prev.actions.filter((item) => item.id !== action.id) }))}
                    >
                      删除
                    </button>
                  )}
                </div>
                <div className="track-editor-row-grid action">
                  <label>
                    动作名称
                    <input value={action.title} onChange={(event) => updateAction(action.id, { title: event.target.value })} />
                  </label>
                  <label>
                    频率
                    <select value={action.frequencyUnit} onChange={(event) => updateAction(action.id, { frequencyUnit: event.target.value as TrackAction['frequency']['unit'] })}>
                      <option value="daily">每天</option>
                      <option value="workday">每个工作日</option>
                      <option value="weekly">每周</option>
                      <option value="monthly">每月</option>
                    </select>
                  </label>
                  <label>
                    周期目标次数
                    <input type="number" min="1" value={action.targetCount} onChange={(event) => updateAction(action.id, { targetCount: Number(event.target.value) || 1 })} />
                  </label>
                  <label className="wide">
                    动作说明
                    <textarea value={action.detail} onChange={(event) => updateAction(action.id, { detail: event.target.value })} />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="track-editor-system-note">
            鼓励文案、脱轨提醒和统计结论将由系统自动生成，用户不需要手动配置。
          </div>
        </div>

        <div className="track-editor-footer">
          <button onClick={onClose}>取消</button>
          <button className="module-primary-btn" onClick={handleSave}>保存星轨</button>
        </div>
      </div>
    </div>
  )
}

function TrackOverviewScreen({
  trackSystem,
  activeTracks,
  archivedTracks,
  today,
  onCreate,
  onOpenTrack,
  onEditTrack,
  onArchiveTrack,
  onRestoreTrack,
  onDeleteTrack,
}: {
  trackSystem: ReturnType<typeof useTrackSystem>
  activeTracks: Track[]
  archivedTracks: Track[]
  today: string
  onCreate: () => void
  onOpenTrack: (trackId: string) => void
  onEditTrack: (track: Track) => void
  onArchiveTrack: (track: Track) => void
  onRestoreTrack: (track: Track) => void
  onDeleteTrack: (track: Track) => void
}) {
  const activeTrackSnapshots = activeTracks.map((track) => ({
    track,
    dayStatus: getTrackDayStatus(trackSystem, track, today),
    dashboard: getTrackDashboard(track, today),
    progress: getTrackProgressLabel(trackSystem, track, today),
  }))
  const focusItems = getTrackTodayFocusItems(trackSystem, activeTracks, today)
  const onTrackCount = activeTrackSnapshots.filter((item) => item.dayStatus.isOnTrack).length
  const urgentFocusCount = focusItems.filter((item) => item.priority === 'urgent').length
  const routineSummary = activeTrackSnapshots.reduce((acc, item) => {
    const routine = getRoutineCompletionSummary(item.dayStatus.completionSummary)
    return {
      total: acc.total + routine.total,
      completed: acc.completed + routine.completed,
    }
  }, { total: 0, completed: 0 })
  const weeklySummary = activeTrackSnapshots.reduce((acc, item) => ({
    total: acc.total + item.dayStatus.completionSummary.weekly.total,
    completed: acc.completed + item.dayStatus.completionSummary.weekly.completed,
  }), { total: 0, completed: 0 })

  return (
    <main className="module-main track-view">
      <div className="module-toolbar">
        <div>
          <h2 className="module-toolbar-title">星轨</h2>
          <p className="module-toolbar-subtitle">先看今天真正该推进什么，再看统计和阶段位置。星轨不是展示愿望，而是把长期目标拆成今天能执行的动作。</p>
        </div>
        <button className="module-primary-btn" onClick={onCreate}>新建星轨</button>
      </div>

      {activeTracks.length === 0 ? (
        <>
          <section className="track-brand-hero">
            <div className="track-brand-hero-main">
              <StarTrackLogo variant="hero" showWordmark showNewBadge />
              <div className="track-brand-hero-copy">
                <span className="track-card-kicker">星轨系统</span>
                <h3>让长期目标不再只停留在“想做”</h3>
                <p>星轨会把终极目标拆成阶段推进节奏，再把每一天真正要做的事稳定摆在你面前，让努力有结构，也有反馈。</p>
                <div className="track-brand-tag-row">
                  <span>终极目标</span>
                  <span>阶段成果</span>
                  <span>原子动作</span>
                  <span>执行反馈</span>
                </div>
              </div>
            </div>

            <div className="track-brand-hero-stats">
              <div>
                <span>运行中星轨</span>
                <strong>{activeTracks.length}</strong>
              </div>
              <div>
                <span>已归档星轨</span>
                <strong>{archivedTracks.length}</strong>
              </div>
              <div>
                <span>今日系统状态</span>
                <strong>待启动</strong>
              </div>
            </div>
          </section>

          <div className="module-empty-state">
            <h3>还没有星轨</h3>
            <p>先定义一条真正想长期复利的主线，再把它拆到阶段成果和原子动作。</p>
            <button className="module-primary-btn" onClick={onCreate}>创建第一条星轨</button>
          </div>
        </>
      ) : (
        <>
          <section className="track-focus-shell">
            <div className="track-focus-primary">
              <div className="track-section-head track-focus-head">
                <div>
                  <span className="track-card-kicker">今日聚焦</span>
                  <h3>{formatDateTitle(today)}，先把今天真正该做的事摆出来</h3>
                  <p>先处理今天会影响节奏的 daily / workday / weekly 动作，再回头看长期统计。统计和阶段位置继续保留，但不再挡住执行入口。</p>
                </div>
              </div>

              <div className="track-focus-kpis">
                <div>
                  <span>今天优先处理</span>
                  <strong>{focusItems.length} 项</strong>
                  <small>{urgentFocusCount > 0 ? `${urgentFocusCount} 项今天必须补上` : '今天没有强风险项'}</small>
                </div>
                <div>
                  <span>日常动作</span>
                  <strong>{routineSummary.total > 0 ? `${routineSummary.completed} / ${routineSummary.total}` : '休息中'}</strong>
                  <small>{routineSummary.total > 0 ? `日常动作 ${routineSummary.completed} / ${routineSummary.total} 完成` : '今天没有需要执行的日常动作'}</small>
                </div>
                <div>
                  <span>每周动作</span>
                  <strong>{weeklySummary.completed} / {weeklySummary.total}</strong>
                  <small>{getCompletionSummaryLabel(weeklySummary, 'weekly')}</small>
                </div>
              </div>

              {focusItems.length > 0 ? (
                <div className="track-focus-list">
                  {focusItems.map((item) => (
                    <article key={`${item.track.id}-${item.actionState.action.id}`} className={`track-focus-item ${item.priority}`}>
                      <div className="track-focus-item-top">
                        <div className="track-focus-item-copy">
                          <div className="track-focus-item-meta">
                            <span className="track-focus-track-chip">
                              <span className="track-dot" style={{ background: item.track.color }} />
                              {item.track.title}
                            </span>
                            <span className={`track-state-pill ${item.priority === 'urgent' ? 'negative' : 'neutral'}`}>
                              {item.priority === 'urgent' ? '今天必须推进' : '可均匀推进'}
                            </span>
                          </div>
                          <div className="track-action-title-row">
                            <h4>{item.actionState.action.title}</h4>
                            <span className={`track-frequency-pill ${item.actionState.action.frequency.unit}`}>{getTrackFrequencyLabel(item.actionState.action.frequency.unit)}</span>
                          </div>
                          <p>{item.actionState.action.detail || '这是今天真正要落地的原子动作。把它做掉，长期目标才会继续前进。'}</p>
                        </div>
                        <button className="module-primary-btn" onClick={() => onOpenTrack(item.track.id)}>进入处理</button>
                      </div>

                      <div className="track-focus-item-metrics">
                        <div>
                          <span>当前周期</span>
                          <strong>{getActionProgressHeadline(item.actionState)}</strong>
                          <small>{item.actionState.remainingCount > 0 ? `还差 ${item.actionState.remainingCount} 次` : '本周期已达标'}</small>
                        </div>
                        <div>
                          <span>下一阶段</span>
                          <strong>{item.dashboard.nextMilestone ? item.dashboard.nextMilestone.title : '阶段成果已全部达成'}</strong>
                          <small>{item.dashboard.nextMilestone ? `${item.dashboard.nextMilestone.dueDate} 前完成` : '现在只需要稳定执行'}</small>
                        </div>
                        <div>
                          <span>今天定位</span>
                          <strong>{item.priority === 'urgent' ? '优先补齐' : '保持推进'}</strong>
                          <small>{item.actionState.dueToday ? '今天不做就会拖慢当前周期' : '今天做一小步也会继续复利'}</small>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="track-focus-empty positive">
                  <strong>{activeTrackSnapshots.some((item) => item.dayStatus.isRestOnlyDay) ? '今天是非工作日，今日无须推进' : '今天的关键动作都已经在轨'}</strong>
                  <p>
                    {activeTrackSnapshots.some((item) => item.dayStatus.isRestOnlyDay)
                      ? '工作日动作会在下一个工作日继续；今天不需要被系统催着执行。'
                      : '你不需要再临时决定今天做什么了。接下来只要按当前节奏稳定推进，阶段成果会自然往前走。'}
                  </p>
                </div>
              )}
            </div>

            <aside className="track-focus-side">
              <section className="track-panel track-focus-side-card">
                <div className="track-section-head">
                  <div>
                    <h3>执行概览</h3>
                    <p>把统计安排在侧边，让它服务执行，而不是抢走执行的注意力。</p>
                  </div>
                </div>
                <div className="track-brand-hero-stats track-brand-hero-stats-compact">
                  <div>
                    <span>运行中星轨</span>
                    <strong>{activeTracks.length}</strong>
                  </div>
                  <div>
                    <span>今日在轨</span>
                    <strong>{onTrackCount} / {activeTracks.length}</strong>
                  </div>
                  <div>
                    <span>已归档</span>
                    <strong>{archivedTracks.length}</strong>
                  </div>
                </div>
                <div className="track-focus-summary-list">
                  {activeTrackSnapshots.map(({ track, dayStatus, dashboard }) => (
                    <div key={track.id} className="track-focus-summary-item">
                      <div className="track-focus-summary-head">
                        <div className="track-focus-summary-title">
                          <span className="track-dot" style={{ background: track.color }} />
                          <strong>{track.title}</strong>
                        </div>
                        <span className={`track-state-pill ${dayStatus.isOnTrack ? 'positive' : 'negative'}`}>
                          {dayStatus.isOnTrack ? '在轨' : '需补'}
                        </span>
                      </div>
                      <div className="track-focus-summary-metrics">
                        <span>{getRoutineSummaryLabel(dayStatus.completionSummary)}</span>
                        <span>{getCompletionSummaryLabel(dayStatus.completionSummary.weekly, 'weekly')}</span>
                        <span>{dashboard.nextMilestone ? `下一阶段：${dashboard.nextMilestone.title}` : '阶段成果已全部达成'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="track-panel track-focus-side-card">
                <div className="track-section-head">
                  <div>
                    <h3>阶段焦点</h3>
                    <p>阶段成果不再挤占主区，但依然要让你知道“现在推进的是哪一段”。</p>
                  </div>
                </div>
                <div className="track-stage-focus-list">
                  {activeTrackSnapshots.map(({ track, dashboard }) => (
                    <div key={track.id} className="track-stage-focus-item">
                      <div className="track-focus-summary-title">
                        <span className="track-dot" style={{ background: track.color }} />
                        <strong>{track.title}</strong>
                      </div>
                      <p>{dashboard.nextMilestone ? dashboard.nextMilestone.definition || '请补充这个阶段的达成标志，让阶段成果更具体。' : '所有阶段成果都已达成，继续保持执行系统稳定。'}</p>
                      <small>{dashboard.nextMilestone ? `${dashboard.nextMilestone.dueDate} 前拿到「${dashboard.nextMilestone.title}」` : '当前重心转为维持动作系统'}</small>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>

          <section className="track-brand-hero track-brand-hero-secondary">
            <div className="track-brand-hero-main">
              <StarTrackLogo variant="hero" showWordmark />
              <div className="track-brand-hero-copy">
                <span className="track-card-kicker">系统化推进</span>
                <h3>保证执行，才能在轨道里肆意飞行。</h3>
                <p>每一个「原子操作」都是你能在星轨系统中继续飞行的动力，让动力转化为复利奇迹。</p>
              </div>
            </div>
          </section>

          <div className="track-overview-grid">
            {activeTrackSnapshots.map(({ track, dayStatus, dashboard, progress }) => {
              const routine = getRoutineCompletionSummary(dayStatus.completionSummary)
              return (
              <article key={track.id} className="track-card" style={{ borderTopColor: track.color }}>
                <div className="track-card-top">
                  <div className="track-card-copy">
                    <span className="track-card-kicker">终极目标</span>
                    <h3>{track.title}</h3>
                    <p>{track.summary}</p>
                  </div>
                  <ProgressRing
                    compact
                    ratio={getGoalRatio(track, today)}
                    color={track.color}
                    value={`${Math.round(getGoalRatio(track, today) * 100)}%`}
                    label="总进度"
                    hint={dashboard.totalMilestones > 0 ? `${dashboard.achievedMilestones}/${dashboard.totalMilestones} 阶段已达成` : `${dashboard.remainingDays} 天剩余`}
                  />
                </div>

                <div className="track-card-status-row">
                  <span className={`track-state-pill ${dayStatus.isOnTrack ? 'positive' : 'negative'}`}>
                    {dayStatus.isOnTrack ? '在轨' : '脱轨风险'}
                  </span>
                  <span className="track-card-status-note">距离终点还有 {dashboard.remainingDays} 天</span>
                </div>

                <div className="track-next-stage-card">
                  <strong>{dashboard.nextMilestone ? `下一阶段：${dashboard.nextMilestone.title}` : '阶段成果已全部达成'}</strong>
                  <p>
                    {dashboard.nextMilestone
                      ? `${dashboard.nextMilestone.dueDate} 前拿到这个结果${dashboard.nextMilestone.definition ? ` · ${dashboard.nextMilestone.definition}` : ''}`
                      : '接下来只需要把原子动作系统持续稳定地跑下去。'}
                  </p>
                </div>

                <div className="track-overview-metrics">
                  <div>
                    <span>日常动作</span>
                    <strong>{routine.total > 0 ? `${routine.completed} / ${routine.total}` : '休息中'}</strong>
                  </div>
                  <div>
                    <span>每周动作</span>
                    <strong>{dayStatus.completionSummary.weekly.completed} / {dayStatus.completionSummary.weekly.total}</strong>
                  </div>
                  <div>
                    <span>本月</span>
                    <strong>{progress.month}%</strong>
                  </div>
                  <div>
                    <span>剩余阶段</span>
                    <strong>{dashboard.remainingMilestones}</strong>
                  </div>
                </div>

                <div className={`track-card-feedback ${dayStatus.isOnTrack ? 'positive' : 'negative'}`}>
                  {dayStatus.message}
                </div>

                <div className="track-card-actions">
                  <button onClick={() => onOpenTrack(track.id)}>进入星轨</button>
                  <button onClick={() => onEditTrack(track)}>编辑</button>
                  <button onClick={() => onArchiveTrack(track)}>归档</button>
                  <button className="danger-btn" onClick={() => onDeleteTrack(track)}>删除</button>
                </div>
              </article>
            )})}
          </div>
        </>
      )}

      {archivedTracks.length > 0 && (
        <section className="track-archive-section">
          <h3>已归档星轨</h3>
          <div className="track-overview-grid">
            {archivedTracks.map((track) => (
              <article key={track.id} className="track-card archived" style={{ borderTopColor: track.color }}>
                <div className="track-card-top">
                  <div className="track-card-copy">
                    <span className="track-card-kicker">已归档</span>
                    <h3>{track.title}</h3>
                    <p>{track.summary}</p>
                  </div>
                  <ProgressRing
                    compact
                    ratio={getGoalRatio(track, today)}
                    color={track.color}
                    value={`${Math.round(getGoalRatio(track, today) * 100)}%`}
                    label="保留进度"
                  />
                </div>
                <div className="track-card-actions">
                  <button onClick={() => onRestoreTrack(track)}>恢复</button>
                  <button onClick={() => onEditTrack(track)}>编辑</button>
                  <button className="danger-btn" onClick={() => onDeleteTrack(track)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function TrackReportsScreen({
  selectedTrack,
  report,
  trackReportPeriod,
  onBack,
  onSetPeriod,
}: {
  selectedTrack: Track
  report: ReturnType<typeof buildTrackReport>
  trackReportPeriod: TrackReportPeriod
  onBack: () => void
  onSetPeriod: (period: TrackReportPeriod) => void
}) {
  return (
    <main className="module-main track-view">
      <div className="module-toolbar">
        <div>
          <button className="module-back-btn" onClick={onBack}>返回星轨详情</button>
          <h2 className="module-toolbar-title">{selectedTrack.title} · 统计仪表盘</h2>
          <p className="module-toolbar-subtitle">{report.start} - {report.end} · {getReportLabel(trackReportPeriod)}</p>
        </div>
        <div className="segmented-control">
          {[
            ['week', '周报'],
            ['month', '月报'],
            ['quarter', '季报'],
            ['year', '年报'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={trackReportPeriod === key ? 'active' : ''}
              onClick={() => onSetPeriod(key as TrackReportPeriod)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="track-report-hero-grid">
        <section className="track-panel track-hero-card">
          <div className="track-hero-card-title">
            <span>终局距离</span>
            <strong>{report.dashboard.remainingDays} 天</strong>
          </div>
          <ProgressRing
            ratio={report.dashboard.totalMilestones > 0 ? report.dashboard.milestoneProgressRatio : report.dashboard.timeProgressRatio}
            color={selectedTrack.color}
            value={`${Math.round((report.dashboard.totalMilestones > 0 ? report.dashboard.milestoneProgressRatio : report.dashboard.timeProgressRatio) * 100)}%`}
            label="总进度"
            hint={report.dashboard.totalMilestones > 0 ? `${report.dashboard.achievedMilestones}/${report.dashboard.totalMilestones} 阶段` : selectedTrack.summary}
          />
        </section>

        <section className="track-report-card">
          <span>本期在轨率</span>
          <strong>{Math.round(report.onTrackRatio * 100)}%</strong>
          <small>{report.onTrackDays} / {report.totalDays} 天在轨</small>
        </section>
        <section className="track-report-card">
          <span>连续在轨</span>
          <strong>{report.currentStreak} 天</strong>
          <small>最佳记录 {report.bestStreak} 天</small>
        </section>
        <section className="track-report-card">
          <span>阶段成果</span>
          <strong>{report.achievedMilestonesInRange.length}</strong>
          <small>本期新增达成</small>
        </section>
      </div>

      <div className="track-report-layout">
        <section className="track-panel">
          <div className="track-section-head">
            <div>
              <h3>动作完成率</h3>
              <p>看清哪些动作真正撑起了你的结构化进步，哪些动作还在拖后腿。</p>
            </div>
          </div>
          <div className="track-report-table">
            {report.actionReports.map((item) => (
              <div key={item.actionId} className="track-report-action-card">
                <div className="track-report-action-head">
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.actualCount} / {item.expectedCount} 次</span>
                  </div>
                  <strong>{Math.round(item.completionRate * 100)}%</strong>
                </div>
                <div className="track-report-progress-bar">
                  <span style={{ width: `${Math.min(100, Math.round(item.completionRate * 100))}%` }} />
                </div>
                <small>{item.completedPeriods} / {item.totalPeriods} 个周期按要求完成</small>
              </div>
            ))}
          </div>
        </section>

        <section className="track-panel">
          <div className="track-section-head">
            <div>
              <h3>阶段成果时间线</h3>
              <p>终极目标是抽象的，阶段成果会让你知道自己已经走到了哪里。</p>
            </div>
          </div>
          <div className="track-milestone-list report">
            {report.milestoneStates.map((state) => (
              <div key={state.milestone.id} className={`track-milestone-item ${state.status}`}>
                <div className="track-milestone-marker" />
                <div className="track-milestone-body">
                  <div className="track-milestone-head">
                    <div>
                      <strong>{state.milestone.title}</strong>
                      <p>{state.milestone.definition || '阶段结果已设定，继续按系统推进。'}</p>
                    </div>
                    <div className="track-milestone-meta">
                      <span className={`track-milestone-pill ${state.status}`}>{getMilestoneStatusLabel(state)}</span>
                      <small>{state.milestone.achievedAt ? `达成于 ${state.milestone.achievedAt}` : `计划于 ${state.milestone.dueDate}`}</small>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {report.milestoneStates.length === 0 && (
              <p className="track-muted-text">还没有阶段成果，建议补充中继站，系统才能告诉你距离终点还有多远。</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function TrackDetailScreen({
  selectedTrack,
  today,
  dayStatus,
  celebrating,
  weekReport,
  monthReport,
  onBack,
  onOpenReports,
  onEditTrack,
  onArchiveTrack,
  onRestoreTrack,
  onDeleteTrack,
  onToggleMilestone,
  onAddActionEntry,
  onRemoveActionEntry,
}: {
  selectedTrack: Track
  today: string
  dayStatus: ReturnType<typeof getTrackDayStatus>
  celebrating: boolean
  weekReport: ReturnType<typeof buildTrackReport>
  monthReport: ReturnType<typeof buildTrackReport>
  onBack: () => void
  onOpenReports: () => void
  onEditTrack: (track: Track) => void
  onArchiveTrack: (track: Track) => void
  onRestoreTrack: (track: Track) => void
  onDeleteTrack: (track: Track) => void
  onToggleMilestone: (milestoneId: string, achieved: boolean) => void
  onAddActionEntry: (actionId: string) => void
  onRemoveActionEntry: (actionId: string, date: string, entryId: string) => void
}) {
  const dashboard = getTrackDashboard(selectedTrack, today)
  const milestoneStates = getTrackMilestoneStates(selectedTrack, today)
  const isArchived = selectedTrack.status === 'archived'

  return (
    <main className="module-main track-view">
      <CelebrationOverlay visible={celebrating} />

      <div className="module-toolbar">
        <div>
          <button className="module-back-btn" onClick={onBack}>返回星轨总览</button>
          <h2 className="module-toolbar-title">{selectedTrack.title}</h2>
          <p className="module-toolbar-subtitle">{selectedTrack.summary}</p>
        </div>
        <div className="module-toolbar-actions">
          <button onClick={onOpenReports}>查看统计</button>
          <button onClick={() => onEditTrack(selectedTrack)}>编辑星轨</button>
          {isArchived ? (
            <button onClick={() => onRestoreTrack(selectedTrack)}>恢复星轨</button>
          ) : (
            <button onClick={() => onArchiveTrack(selectedTrack)}>归档</button>
          )}
          <button className="danger-btn" onClick={() => onDeleteTrack(selectedTrack)}>删除</button>
        </div>
      </div>

      <div className="track-detail-shell">
        <section className="track-panel track-detail-main-panel">
          <div className="track-section-head">
            <div>
              <span className="track-card-kicker">今日执行</span>
              <h3>{formatDateTitle(today)}，从每一件「原子习惯」入手。</h3>
              <p>日积跬步，终成千里。</p>
            </div>
            <div className="track-detail-main-head-actions">
              <span className={`track-state-pill ${dayStatus.isOnTrack ? 'positive' : 'negative'}`}>
                {dayStatus.isRestOnlyDay ? '今日无须推进' : dayStatus.isOnTrack ? '正在正确的路上' : '当前有脱轨风险'}
              </span>
            </div>
          </div>

          {isArchived ? (
            <div className="track-feedback-banner neutral">
              这条星轨已归档，统计和执行记录仍然保留；恢复后即可继续记录原子动作。
            </div>
          ) : (
            <div className={`track-feedback-banner ${dayStatus.isOnTrack ? 'positive' : 'negative'}`}>
              {dayStatus.message}
            </div>
          )}

          {dayStatus.actionStates.length > 0 ? (
            <div className="track-action-list track-action-list-detailed">
              {dayStatus.actionStates.map((state) => {
                const isActionDisabled = isArchived || state.isRestDay
                const progressRatio = state.isRestDay ? 1 : Math.min(1, state.periodCount / Math.max(1, state.targetCount))
                return (
                  <div key={state.action.id} className={`track-action-card ${state.isRestDay ? 'rest' : state.periodMet ? 'done' : ''} ${state.dueToday && !state.periodMet ? 'risk' : ''}`}>
                    <div className="track-action-top">
                      <div className="track-action-primary">
                        <div className="track-action-title-row">
                          <h4>{state.action.title}</h4>
                          <span className={`track-frequency-pill ${state.action.frequency.unit}`}>{getTrackFrequencyLabel(state.action.frequency.unit)}</span>
                        </div>
                        <p>{state.action.detail || '这是你通往目标的具体实事。做了，就会留下真实记录，也会让长期目标继续向前。'}</p>
                      </div>
                      <span className={`track-action-urgency ${state.isRestDay ? 'rest' : state.periodMet ? 'done' : state.dueToday ? 'urgent' : 'steady'}`}>
                        {state.isRestDay ? '今日无须推进' : state.periodMet ? '本周期已达标' : state.dueToday ? '今天需要推进' : '可均匀推进'}
                      </span>
                    </div>

                    <div className="track-action-metrics-grid">
                      <div className="track-action-cell metric">
                        <span>周期要求</span>
                        <strong>{getTrackFrequencyLabel(state.action.frequency.unit)} {state.targetCount} 次</strong>
                        <small>{getActionWindowLabel(state)}</small>
                      </div>

                      <div className="track-action-cell metric">
                        <span>{getActionPeriodLabel(state.action.frequency.unit)}进度</span>
                        <strong>{getActionProgressHeadline(state)}</strong>
                        <small>{state.isRestDay ? '今天是非工作日，工作日任务会在下一个工作日继续' : state.remainingCount > 0 ? `还差 ${state.remainingCount} 次` : '本周期已完成'}</small>
                      </div>

                      <div className="track-action-cell metric">
                        <span>执行记录</span>
                        <strong>{getActionExecutionLabel(state)}</strong>
                        <small>{state.isRestDay ? '非工作日不会要求完成，也不会进入今日待办' : state.periodLogs.length > 0 ? `已记录 ${state.periodLogs.length} 条精确时间` : '每次点击完成后会在下方留下时间'}</small>
                      </div>
                    </div>

                    <div className="track-action-footer">
                      <small className="track-action-note">{getActionHint(state)}</small>
                      <div className="track-action-controls">
                        <button className="module-primary-btn" disabled={isActionDisabled} onClick={() => onAddActionEntry(state.action.id)}>
                          {state.isRestDay ? '今日无须推进' : '完成一次'}
                        </button>
                      </div>
                    </div>

                    <div className="track-action-progress-bar">
                      <span style={{ width: `${Math.round(progressRatio * 100)}%` }} />
                    </div>

                    <div className="track-action-log-section">
                      <div className="track-action-log-head">
                        <strong>{getActionLogHeading(state)}</strong>
                        <small>{state.isRestDay ? '这是工作日任务，非工作日会自动休息，今日无须推进' : state.periodLogs.length > 0 ? '撤销某次完成时，只回退这一条记录' : '完成后会立即在这里显示精确时间'}</small>
                      </div>

                      {state.periodLogs.length > 0 ? (
                        <div className="track-action-log-list">
                          {state.periodLogs.map((log) => (
                            <div key={log.entryId} className="track-action-log-chip">
                              <span>{formatActionLogLabel(state, log.completedAt, log.date)}</span>
                              {!isArchived && (
                                <button onClick={() => onRemoveActionEntry(state.action.id, log.date, log.entryId)}>撤销</button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="track-muted-text">{state.isRestDay ? '今天是非工作日，这个工作日动作今日无须推进。' : '当前周期还没有精确时间记录。'}</p>
                      )}

                      {state.legacyPeriodCount > 0 && (
                        <div className="track-action-log-legacy">
                          另有 {state.legacyPeriodCount} 次旧记录未带具体时间，因此只参与统计，不显示为时间点。
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="track-focus-empty">
              <strong>这条星轨还没有原子动作</strong>
              <p>建议先补上 daily / workday / weekly 原子动作。没有执行动作，系统就无法判断你今天到底该做什么。</p>
            </div>
          )}

          <div className="track-detail-summary-strip">
            <div>
              <span>日常动作</span>
              <strong>{(() => {
                const routine = getRoutineCompletionSummary(dayStatus.completionSummary)
                return routine.total > 0 ? `${routine.completed} / ${routine.total}` : '休息中'
              })()}</strong>
              <small>{getRoutineSummaryLabel(dayStatus.completionSummary)}</small>
            </div>
            <div>
              <span>每周动作</span>
              <strong>{dayStatus.completionSummary.weekly.completed} / {dayStatus.completionSummary.weekly.total}</strong>
              <small>{getCompletionSummaryLabel(dayStatus.completionSummary.weekly, 'weekly')}</small>
            </div>
            <div>
              <span>本周在轨率</span>
              <strong>{Math.round(weekReport.onTrackRatio * 100)}%</strong>
              <small>{weekReport.onTrackDays} / {weekReport.totalDays} 天在轨</small>
            </div>
            <div>
              <span>本月在轨率</span>
              <strong>{Math.round(monthReport.onTrackRatio * 100)}%</strong>
              <small>{monthReport.onTrackDays} / {monthReport.totalDays} 天在轨</small>
            </div>
          </div>
        </section>

        <aside className="track-detail-aside">
          <section className="track-panel track-hero-card track-hero-card-primary">
            <div className="track-hero-brand-stamp">
              <StarTrackLogo variant="stamp" subtle />
            </div>
            <div className="track-hero-card-title">
              <span>终极目标</span>
              <strong>{selectedTrack.title}</strong>
            </div>
            <div className="track-hero-card-body primary">
              <ProgressRing
                ratio={dashboard.totalMilestones > 0 ? dashboard.milestoneProgressRatio : dashboard.timeProgressRatio}
                color={selectedTrack.color}
                value={`${Math.round((dashboard.totalMilestones > 0 ? dashboard.milestoneProgressRatio : dashboard.timeProgressRatio) * 100)}%`}
                label="总进度"
                hint={`周期 ${getTrackDurationLabel(selectedTrack)}`}
              />
              <div className="track-hero-copy">
                <p>{selectedTrack.summary}</p>
              </div>
            </div>
            <div className="track-hero-stat-list track-hero-stat-list-compact">
              <div>
                <span>开始日期</span>
                <strong>{selectedTrack.startDate}</strong>
              </div>
              <div>
                <span>终点日期</span>
                <strong>{dashboard.targetDate}</strong>
              </div>
              <div>
                <span>剩余时间</span>
                <strong>{dashboard.remainingDays}天</strong>
              </div>
            </div>
          </section>

          <section className="track-panel track-detail-side-card">
            <div className="track-section-head">
              <div>
                <h3>当前阶段</h3>
                <p>阶段成果退到侧边，但你仍然需要随时知道现在在推进哪一段。</p>
              </div>
            </div>
            <div className="track-stage-focus">
              {dashboard.nextMilestone ? (
                <>
                  <strong className="track-side-card-title">{dashboard.nextMilestone.title}</strong>
                  <p>{dashboard.nextMilestone.definition || '请补充这个阶段的达成标志，让目标更具体。'}</p>
                  <div className="track-stage-meta">
                    <span>目标时间：{dashboard.nextMilestone.dueDate}</span>
                    <span>剩余阶段：{dashboard.remainingMilestones}</span>
                  </div>
                  {!isArchived && (
                    <button className="module-primary-btn" onClick={() => onToggleMilestone(dashboard.nextMilestone!.id, true)}>
                      标记这一阶段已达成
                    </button>
                  )}
                </>
              ) : (
                <p>所有阶段成果都已达成，接下来保持执行系统的稳定运行即可。</p>
              )}
            </div>
          </section>

          <section className="track-panel track-detail-side-card">
            <div className="track-section-head">
              <div>
                <h3>执行状态</h3>
                <p>这里保留统计，但统计只服务于你判断节奏，不再占据主视线。</p>
              </div>
            </div>
            <div className={`track-feedback-banner ${dayStatus.isOnTrack ? 'positive' : 'negative'}`}>
              {dayStatus.message}
            </div>
            <div className="track-hero-stat-list">
              <div>
                <span>今日状态</span>
                <strong>{dayStatus.isOnTrack ? '在轨' : `${dayStatus.riskActions.length} 项需补`}</strong>
              </div>
              <div>
                <span>本周执行</span>
                <strong>{Math.round(weekReport.onTrackRatio * 100)}%</strong>
              </div>
              <div>
                <span>本月执行</span>
                <strong>{Math.round(monthReport.onTrackRatio * 100)}%</strong>
              </div>
            </div>
          </section>

          <section className="track-panel track-detail-side-card">
            <div className="track-section-head">
              <div>
                <h3>阶段成果时间线</h3>
                <p>这不是“做了什么”，而是“已经走到了哪里”。</p>
              </div>
            </div>

            <div className="track-milestone-list compact">
              {milestoneStates.map((state, index) => (
                <div key={state.milestone.id} className={`track-milestone-item ${state.status}`}>
                  <div className="track-milestone-marker" />
                  <div className="track-milestone-body">
                    <div className="track-milestone-head">
                      <div className="track-milestone-main">
                        <small>阶段 {index + 1}</small>
                        <strong>{state.milestone.title}</strong>
                      </div>
                      <span className={`track-milestone-pill ${state.status}`}>{getMilestoneStatusLabel(state)}</span>
                    </div>
                    <p className="track-milestone-definition">{state.milestone.definition}</p>
                    <div className="track-milestone-footer">
                      <div className="track-milestone-date-row">
                        <span>{state.milestone.achievedAt ? `达成于 ${state.milestone.achievedAt}` : `截止 ${state.milestone.dueDate}`}</span>
                        <span>
                          {state.milestone.achievedAt
                            ? '已完成'
                            : state.status === 'overdue'
                            ? '已延期'
                            : state.daysRemaining > 0
                            ? `剩余 ${state.daysRemaining} 天`
                            : '待推进'}
                        </span>
                      </div>
                      {!isArchived && (
                        <div className="track-milestone-actions">
                          {state.milestone.achievedAt ? (
                            <button onClick={() => onToggleMilestone(state.milestone.id, false)}>撤销达成</button>
                          ) : (
                            <button onClick={() => onToggleMilestone(state.milestone.id, true)}>标记达成</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {milestoneStates.length === 0 && (
                <p className="track-muted-text">还没有阶段成果。建议先补齐中继站，否则用户会感觉目标太远、没有阶段感。</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}

export default function TrackSystemView() {
  const tracks = useTracks()
  const trackSystem = useTrackSystem()
  const uiState = useUIState()
  const selectedTrack = useSelectedTrack()
  const webdavEnabled = useStore((s) => !!s.settings.webdav?.server)
  const setSelectedTrackId = useStore((s) => s.setSelectedTrackId)
  const setTrackViewMode = useStore((s) => s.setTrackViewMode)
  const setTrackReportPeriod = useStore((s) => s.setTrackReportPeriod)
  const addTrackActionEntry = useStore((s) => s.addTrackActionEntry)
  const removeTrackActionEntry = useStore((s) => s.removeTrackActionEntry)
  const toggleTrackMilestone = useStore((s) => s.toggleTrackMilestone)
  const deleteTrack = useStore((s) => s.deleteTrack)
  const archiveTrack = useStore((s) => s.archiveTrack)
  const restoreTrack = useStore((s) => s.restoreTrack)
  const [editorTrack, setEditorTrack] = useState<Track | null | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Track | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const previousOnTrack = useRef(false)

  const today = getTodayDateKey()
  const activeTracks = useMemo(() => tracks.filter((track) => track.status === 'active'), [tracks])
  const archivedTracks = useMemo(() => tracks.filter((track) => track.status === 'archived'), [tracks])
  const dayStatus = selectedTrack ? getTrackDayStatus(trackSystem, selectedTrack, today) : null
  const report = selectedTrack ? buildTrackReport(trackSystem, selectedTrack, uiState.trackReportPeriod, today) : null
  const weekReport = selectedTrack ? buildTrackReport(trackSystem, selectedTrack, 'week', today) : null
  const monthReport = selectedTrack ? buildTrackReport(trackSystem, selectedTrack, 'month', today) : null

  useEffect(() => {
    if (!dayStatus) return
    if (dayStatus.isOnTrack && !previousOnTrack.current) {
      setCelebrating(true)
      const timer = window.setTimeout(() => setCelebrating(false), 1800)
      previousOnTrack.current = dayStatus.isOnTrack
      return () => window.clearTimeout(timer)
    }
    previousOnTrack.current = dayStatus.isOnTrack
    return undefined
  }, [dayStatus?.isOnTrack])

  const openTrack = (trackId: string) => {
    setSelectedTrackId(trackId)
    setTrackViewMode('detail')
  }

  const handleArchive = (track: Track) => {
    if (!window.confirm(`确定归档「${track.title}」吗？`)) return
    archiveTrack(track.id)
    if (selectedTrack?.id === track.id) {
      setSelectedTrackId(null)
    }
  }

  const handleRestore = (track: Track) => {
    restoreTrack(track.id)
  }

  const handleDelete = (track: Track) => {
    setDeleteTarget(track)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    deleteTrack(deleteTarget.id)
    setDeleteTarget(null)
  }

  const content = !selectedTrack || uiState.trackViewMode === 'overview'
    ? (
      <TrackOverviewScreen
        trackSystem={trackSystem}
        activeTracks={activeTracks}
        archivedTracks={archivedTracks}
        today={today}
        onCreate={() => setEditorTrack(null)}
        onOpenTrack={openTrack}
        onEditTrack={(track) => setEditorTrack(track)}
        onArchiveTrack={handleArchive}
        onRestoreTrack={handleRestore}
        onDeleteTrack={handleDelete}
      />
    )
    : uiState.trackViewMode === 'reports' && report
    ? (
      <TrackReportsScreen
        selectedTrack={selectedTrack}
        report={report}
        trackReportPeriod={uiState.trackReportPeriod}
        onBack={() => setTrackViewMode('detail')}
        onSetPeriod={setTrackReportPeriod}
      />
    )
    : dayStatus && weekReport && monthReport
    ? (
      <TrackDetailScreen
        selectedTrack={selectedTrack}
        today={today}
        dayStatus={dayStatus}
        celebrating={celebrating}
        weekReport={weekReport}
        monthReport={monthReport}
        onBack={() => setSelectedTrackId(null)}
        onOpenReports={() => setTrackViewMode('reports')}
        onEditTrack={(track) => setEditorTrack(track)}
        onArchiveTrack={handleArchive}
        onRestoreTrack={handleRestore}
        onDeleteTrack={handleDelete}
        onToggleMilestone={(milestoneId, achieved) => toggleTrackMilestone({
          trackId: selectedTrack.id,
          milestoneId,
          achieved,
          date: today,
        })}
        onAddActionEntry={(actionId) => addTrackActionEntry({
          trackId: selectedTrack.id,
          actionId,
          date: today,
          completedAt: Date.now(),
        })}
        onRemoveActionEntry={(actionId, date, entryId) => removeTrackActionEntry({
          trackId: selectedTrack.id,
          actionId,
          date,
          entryId,
        })}
      />
    )
    : null

  return (
    <>
      {content}
      {editorTrack !== undefined && <TrackEditorModal track={editorTrack ?? undefined} onClose={() => setEditorTrack(undefined)} />}
      {deleteTarget && (
        <TrackDeleteModal
          track={deleteTarget}
          cloudEnabled={webdavEnabled}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
