import type {
  AppData,
  Track,
  TrackAction,
  TrackCheckin,
  TrackMilestone,
  TrackReportPeriod,
  TrackSystemData,
} from '../types'
import {
  getDaysBetween,
  getDaysRemainingInclusive,
  getEndOfHalfYear,
  getEndOfMonth,
  getEndOfQuarter,
  getEndOfWeek,
  getEndOfYear,
  getStartOfHalfYear,
  getStartOfMonth,
  getStartOfQuarter,
  getStartOfWeek,
  getStartOfYear,
  isWorkday,
  parseDateKey,
  toDateKey,
} from './dateUtils'

export interface TrackMilestoneState {
  milestone: TrackMilestone
  status: 'achieved' | 'current' | 'dueSoon' | 'overdue' | 'upcoming'
  isCurrent: boolean
  daysRemaining: number
}

export interface TrackActionState {
  action: TrackAction
  todayCount: number
  periodCount: number
  targetCount: number
  periodStart: string
  periodEnd: string
  periodMet: boolean
  dueToday: boolean
  remainingCount: number
  remainingDays: number
  periodLogs: TrackActionLog[]
  todayLogs: TrackActionLog[]
  legacyPeriodCount: number
  legacyTodayCount: number
  isRestDay: boolean
}

export interface TrackActionLog {
  checkinId: string
  entryId: string
  date: string
  completedAt: number
}

export interface TrackFrequencyCompletionSummary {
  total: number
  completed: number
}

export interface TrackCompletionSummary {
  daily: TrackFrequencyCompletionSummary
  workday: TrackFrequencyCompletionSummary
  weekly: TrackFrequencyCompletionSummary
  monthly: TrackFrequencyCompletionSummary
}

export interface TrackDayStatus {
  track: Track
  actionStates: TrackActionState[]
  isOnTrack: boolean
  isRestOnlyDay: boolean
  riskActions: TrackActionState[]
  pendingActions: TrackActionState[]
  completionSummary: TrackCompletionSummary
  message: string
}

export interface TrackTodayFocusItem {
  track: Track
  actionState: TrackActionState
  dashboard: TrackDashboardSummary
  priority: 'urgent' | 'steady'
}

export interface TrackActionReport {
  actionId: string
  title: string
  actualCount: number
  expectedCount: number
  completionRate: number
  completedPeriods: number
  totalPeriods: number
}

export interface TrackDashboardSummary {
  targetDate: string
  elapsedDays: number
  totalDays: number
  remainingDays: number
  timeProgressRatio: number
  achievedMilestones: number
  totalMilestones: number
  remainingMilestones: number
  milestoneProgressRatio: number
  nextMilestone: TrackMilestone | null
}

export interface TrackReport {
  start: string
  end: string
  onTrackDays: number
  totalDays: number
  onTrackRatio: number
  currentStreak: number
  bestStreak: number
  actionReports: TrackActionReport[]
  dashboard: TrackDashboardSummary
  milestoneStates: TrackMilestoneState[]
  achievedMilestonesInRange: TrackMilestone[]
}

export function getTrackById(trackSystem: TrackSystemData, trackId: string | null) {
  if (!trackId) return null
  return trackSystem.tracks.find((track) => track.id === trackId) ?? null
}

export function getTrackFrequencyLabel(unit: TrackAction['frequency']['unit']) {
  if (unit === 'daily') return '每天'
  if (unit === 'workday') return '每个工作日'
  if (unit === 'weekly') return '每周'
  return '每月'
}

function isDailyLikeUnit(unit: TrackAction['frequency']['unit']) {
  return unit === 'daily' || unit === 'workday'
}

export function getTrackDurationLabel(track: Track) {
  return `${track.duration.count}${track.duration.unit === 'year' ? '年' : '个月'}`
}

export function getTrackTargetDate(track: Track) {
  const date = parseDateKey(track.startDate)
  if (track.duration.unit === 'year') {
    date.setFullYear(date.getFullYear() + track.duration.count)
  } else {
    date.setMonth(date.getMonth() + track.duration.count)
  }
  return toDateKey(date)
}

export function getReportRange(period: TrackReportPeriod, anchorDateKey: string) {
  if (period === 'week') return { start: getStartOfWeek(anchorDateKey), end: getEndOfWeek(anchorDateKey) }
  if (period === 'month') return { start: getStartOfMonth(anchorDateKey), end: getEndOfMonth(anchorDateKey) }
  if (period === 'quarter') return { start: getStartOfQuarter(anchorDateKey), end: getEndOfQuarter(anchorDateKey) }
  if (period === 'halfYear') return { start: getStartOfHalfYear(anchorDateKey), end: getEndOfHalfYear(anchorDateKey) }
  return { start: getStartOfYear(anchorDateKey), end: getEndOfYear(anchorDateKey) }
}

function getActionPeriodRange(action: TrackAction, dateKey: string) {
  if (isDailyLikeUnit(action.frequency.unit)) return { start: dateKey, end: dateKey }
  if (action.frequency.unit === 'weekly') return { start: getStartOfWeek(dateKey), end: getEndOfWeek(dateKey) }
  return { start: getStartOfMonth(dateKey), end: getEndOfMonth(dateKey) }
}

function getPeriodStartKey(unit: TrackAction['frequency']['unit'], dateKey: string) {
  if (isDailyLikeUnit(unit)) return dateKey
  if (unit === 'weekly') return getStartOfWeek(dateKey)
  return getStartOfMonth(dateKey)
}

function getPeriodEndKey(unit: TrackAction['frequency']['unit'], dateKey: string) {
  if (isDailyLikeUnit(unit)) return dateKey
  if (unit === 'weekly') return getEndOfWeek(dateKey)
  return getEndOfMonth(dateKey)
}

export function getTrackCheckinCount(checkin: TrackCheckin) {
  return Math.max(checkin.count, checkin.entries?.length ?? 0)
}

function getActionCheckinsInRange(
  checkins: TrackCheckin[],
  trackId: string,
  actionId: string,
  startDateKey: string,
  endDateKey: string,
) {
  return checkins
    .filter((checkin) =>
      checkin.trackId === trackId &&
      checkin.actionId === actionId &&
      checkin.date >= startDateKey &&
      checkin.date <= endDateKey,
    )
    .sort((a, b) => {
      if (a.date === b.date) return a.createdAt - b.createdAt
      return a.date.localeCompare(b.date)
    })
}

export function getTrackActionLogsInRange(
  checkins: TrackCheckin[],
  trackId: string,
  actionId: string,
  startDateKey: string,
  endDateKey: string,
): TrackActionLog[] {
  return getActionCheckinsInRange(checkins, trackId, actionId, startDateKey, endDateKey)
    .flatMap((checkin) => (checkin.entries ?? []).map((entry) => ({
      checkinId: checkin.id,
      entryId: entry.id,
      date: checkin.date,
      completedAt: entry.completedAt,
    })))
    .sort((a, b) => a.completedAt - b.completedAt)
}

function sumCheckinsForDate(checkins: TrackCheckin[], trackId: string, actionId: string, dateKey: string) {
  return checkins
    .filter((checkin) => checkin.trackId === trackId && checkin.actionId === actionId && checkin.date === dateKey)
    .reduce((sum, checkin) => sum + getTrackCheckinCount(checkin), 0)
}

function sumCheckinsInRange(checkins: TrackCheckin[], trackId: string, actionId: string, startDateKey: string, endDateKey: string) {
  return getActionCheckinsInRange(checkins, trackId, actionId, startDateKey, endDateKey)
    .reduce((sum, checkin) => sum + getTrackCheckinCount(checkin), 0)
}

function countExpectedPeriods(startDateKey: string, endDateKey: string, unit: TrackAction['frequency']['unit']) {
  if (unit === 'daily') return getDaysBetween(startDateKey, endDateKey).length
  if (unit === 'workday') return getDaysBetween(startDateKey, endDateKey).filter(isWorkday).length
  const seen = new Set<string>()
  for (const dateKey of getDaysBetween(startDateKey, endDateKey)) {
    seen.add(getPeriodStartKey(unit, dateKey))
  }
  return seen.size
}

function countCompletedPeriods(trackSystem: TrackSystemData, track: Track, action: TrackAction, startDateKey: string, endDateKey: string) {
  const periods = new Set<string>()
  for (const dateKey of getDaysBetween(startDateKey, endDateKey)) {
    if (action.frequency.unit === 'workday' && !isWorkday(dateKey)) continue
    periods.add(getPeriodStartKey(action.frequency.unit, dateKey))
  }
  return Array.from(periods).filter((periodStart) => {
    const periodEnd = getPeriodEndKey(action.frequency.unit, periodStart)
    return sumCheckinsInRange(trackSystem.checkins, track.id, action.id, periodStart, periodEnd) >= action.frequency.targetCount
  }).length
}

export function getTrackMilestoneStates(track: Track, anchorDateKey: string): TrackMilestoneState[] {
  const milestones = [...track.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const nextMilestoneId = milestones.find((milestone) => !milestone.achievedAt)?.id
  return milestones.map((milestone) => {
    const isCurrent = !milestone.achievedAt && milestone.id === nextMilestoneId
    const daysRemaining = milestone.achievedAt
      ? 0
      : milestone.dueDate >= anchorDateKey
      ? getDaysRemainingInclusive(anchorDateKey, milestone.dueDate)
      : 0

    let status: TrackMilestoneState['status'] = 'upcoming'
    if (milestone.achievedAt) {
      status = 'achieved'
    } else if (milestone.dueDate < anchorDateKey) {
      status = 'overdue'
    } else if (daysRemaining <= 7) {
      status = 'dueSoon'
    } else if (isCurrent) {
      status = 'current'
    }

    return {
      milestone,
      status,
      isCurrent,
      daysRemaining,
    }
  })
}

export function getTrackDashboard(track: Track, anchorDateKey: string): TrackDashboardSummary {
  const targetDate = getTrackTargetDate(track)
  const totalDays = Math.max(1, getDaysBetween(track.startDate, targetDate).length)
  const elapsedDays =
    anchorDateKey < track.startDate
      ? 0
      : getDaysBetween(track.startDate, anchorDateKey > targetDate ? targetDate : anchorDateKey).length
  const remainingDays = anchorDateKey > targetDate ? 0 : getDaysRemainingInclusive(anchorDateKey, targetDate)
  const achievedMilestones = track.milestones.filter((milestone) => !!milestone.achievedAt).length
  const totalMilestones = track.milestones.length
  const nextMilestone = [...track.milestones]
    .filter((milestone) => !milestone.achievedAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null

  return {
    targetDate,
    elapsedDays,
    totalDays,
    remainingDays,
    timeProgressRatio: Math.min(1, elapsedDays / totalDays),
    achievedMilestones,
    totalMilestones,
    remainingMilestones: Math.max(0, totalMilestones - achievedMilestones),
    milestoneProgressRatio: totalMilestones > 0 ? achievedMilestones / totalMilestones : 0,
    nextMilestone,
  }
}

function buildTrackMessage(
  track: Track,
  status: Pick<TrackDayStatus, 'isOnTrack' | 'isRestOnlyDay' | 'riskActions' | 'pendingActions'>,
  nextMilestone: TrackMilestone | null,
) {
  if (status.isRestOnlyDay) {
    if (nextMilestone) {
      return `今天是非工作日，今日无须推进；下一个工作日继续朝「${nextMilestone.title}」稳定前进。`
    }
    return '今天是非工作日，今日无须推进；工作日动作会在下一个工作日继续。'
  }
  if (status.isOnTrack) {
    if (nextMilestone) {
      return `你现在不是在临时决定要不要努力，而是在稳定推进「${nextMilestone.title}」。`
    }
    return `你的执行系统正在稳定运转，继续保持，终极目标会被一点点吃下来。`
  }

  const focusActions = status.riskActions.length > 0 ? status.riskActions : status.pendingActions
  const firstAction = focusActions[0]?.action
  if (!firstAction) {
    return `今天先把星轨重新拉稳，避免节奏继续往后滑。`
  }
  if (nextMilestone) {
    return `先补上「${firstAction.title}」，这样你才能继续朝「${nextMilestone.title}」推进。`
  }
  return `先补上「${firstAction.title}」，把今天重新拉回正轨。`
}

export function getTrackCompletionSummary(trackSystem: TrackSystemData, track: Track, dateKey: string): TrackCompletionSummary {
  const summary: TrackCompletionSummary = {
    daily: { total: 0, completed: 0 },
    workday: { total: 0, completed: 0 },
    weekly: { total: 0, completed: 0 },
    monthly: { total: 0, completed: 0 },
  }

  for (const action of track.actions) {
    const state = getTrackActionState(trackSystem, track, action, dateKey)
    const bucket = summary[action.frequency.unit]
    if (action.frequency.unit === 'workday' && state.isRestDay) {
      continue
    }
    bucket.total += 1
    if (state.periodMet) {
      bucket.completed += 1
    }
  }

  return summary
}

export function getTrackActionState(trackSystem: TrackSystemData, track: Track, action: TrackAction, dateKey: string): TrackActionState {
  const { start, end } = getActionPeriodRange(action, dateKey)
  const periodCount = sumCheckinsInRange(trackSystem.checkins, track.id, action.id, start, end)
  const todayCount = sumCheckinsForDate(trackSystem.checkins, track.id, action.id, dateKey)
  const periodLogs = getTrackActionLogsInRange(trackSystem.checkins, track.id, action.id, start, end)
  const todayLogs = getTrackActionLogsInRange(trackSystem.checkins, track.id, action.id, dateKey, dateKey)
  const isRestDay = action.frequency.unit === 'workday' && !isWorkday(dateKey)
  const periodMet = isRestDay ? true : periodCount >= action.frequency.targetCount
  const remainingCount = isRestDay ? 0 : Math.max(0, action.frequency.targetCount - periodCount)
  const remainingDays = isRestDay ? 0 : isDailyLikeUnit(action.frequency.unit) ? 1 : getDaysRemainingInclusive(dateKey, end)

  let dueToday = isDailyLikeUnit(action.frequency.unit) && !isRestDay
  if (!isDailyLikeUnit(action.frequency.unit) && !periodMet) {
    dueToday = remainingCount >= remainingDays
  }

  return {
    action,
    todayCount,
    periodCount,
    targetCount: action.frequency.targetCount,
    periodStart: start,
    periodEnd: end,
    periodMet,
    dueToday,
    remainingCount,
    remainingDays,
    periodLogs,
    todayLogs,
    legacyPeriodCount: Math.max(0, periodCount - periodLogs.length),
    legacyTodayCount: Math.max(0, todayCount - todayLogs.length),
    isRestDay,
  }
}

export function getTrackDayStatus(trackSystem: TrackSystemData, track: Track, dateKey: string): TrackDayStatus {
  const actionStates = track.actions.map((action) => getTrackActionState(trackSystem, track, action, dateKey))
  const pendingActions = actionStates.filter((state) => !state.periodMet)
  const riskActions = actionStates.filter((state) => !state.periodMet && state.dueToday)
  const hasRestDayActions = actionStates.some((state) => state.isRestDay)
  const hasPendingNonRestActions = actionStates.some((state) => !state.isRestDay && !state.periodMet)
  const isRestOnlyDay = hasRestDayActions && !hasPendingNonRestActions && riskActions.length === 0
  const dashboard = getTrackDashboard(track, dateKey)
  const isOnTrack = track.actions.length > 0 && riskActions.length === 0

  return {
    track,
    actionStates,
    isOnTrack,
    isRestOnlyDay,
    riskActions,
    pendingActions,
    completionSummary: getTrackCompletionSummary(trackSystem, track, dateKey),
    message: buildTrackMessage(track, { isOnTrack, isRestOnlyDay, riskActions, pendingActions }, dashboard.nextMilestone),
  }
}

export function getTrackTodayFocusItems(trackSystem: TrackSystemData, tracks: Track[], dateKey: string): TrackTodayFocusItem[] {
  const pendingItems = tracks
    .filter((track) => track.status === 'active')
    .flatMap((track) => {
      const dashboard = getTrackDashboard(track, dateKey)
      return track.actions.map((action) => {
        const actionState = getTrackActionState(trackSystem, track, action, dateKey)
        return {
          track,
          actionState,
          dashboard,
          priority: !actionState.periodMet && actionState.dueToday ? 'urgent' : 'steady',
        } satisfies TrackTodayFocusItem
      })
    })
    .filter((item) => !item.actionState.periodMet)
  const prioritizedItems = pendingItems.some((item) => item.actionState.dueToday)
    ? pendingItems.filter((item) => item.actionState.dueToday)
    : pendingItems

  return prioritizedItems.sort((a, b) => {
      const priorityRankA = a.priority === 'urgent' ? 0 : 1
      const priorityRankB = b.priority === 'urgent' ? 0 : 1
      if (priorityRankA !== priorityRankB) return priorityRankA - priorityRankB
      const frequencyRank = { daily: 0, workday: 0, weekly: 1, monthly: 2 }
      if (frequencyRank[a.actionState.action.frequency.unit] !== frequencyRank[b.actionState.action.frequency.unit]) {
        return frequencyRank[a.actionState.action.frequency.unit] - frequencyRank[b.actionState.action.frequency.unit]
      }
      if (a.actionState.remainingCount !== b.actionState.remainingCount) {
        return b.actionState.remainingCount - a.actionState.remainingCount
      }
      return a.track.title.localeCompare(b.track.title, 'zh-Hans-CN')
    })
}

export function buildTrackReport(trackSystem: TrackSystemData, track: Track, period: TrackReportPeriod, anchorDateKey: string): TrackReport {
  const range = getReportRange(period, anchorDateKey)
  const days = getDaysBetween(range.start, range.end)
  const statuses = days.map((dateKey) => getTrackDayStatus(trackSystem, track, dateKey))
  const onTrackDays = statuses.filter((status) => status.isOnTrack).length

  let currentStreak = 0
  for (let index = statuses.length - 1; index >= 0; index -= 1) {
    if (!statuses[index].isOnTrack) break
    currentStreak += 1
  }

  let bestStreak = 0
  let tempStreak = 0
  for (const status of statuses) {
    if (status.isOnTrack) {
      tempStreak += 1
      bestStreak = Math.max(bestStreak, tempStreak)
    } else {
      tempStreak = 0
    }
  }

  const actionReports = track.actions.map((action) => {
    const actualCount = sumCheckinsInRange(trackSystem.checkins, track.id, action.id, range.start, range.end)
    const totalPeriods = countExpectedPeriods(range.start, range.end, action.frequency.unit)
    const expectedCount = totalPeriods * action.frequency.targetCount
    const completedPeriods = countCompletedPeriods(trackSystem, track, action, range.start, range.end)
    return {
      actionId: action.id,
      title: action.title,
      actualCount,
      expectedCount,
      completionRate: expectedCount > 0 ? actualCount / expectedCount : 0,
      completedPeriods,
      totalPeriods,
    }
  })

  return {
    start: range.start,
    end: range.end,
    onTrackDays,
    totalDays: days.length,
    onTrackRatio: days.length > 0 ? onTrackDays / days.length : 0,
    currentStreak,
    bestStreak,
    actionReports: actionReports.sort((a, b) => a.completionRate - b.completionRate),
    dashboard: getTrackDashboard(track, anchorDateKey),
    milestoneStates: getTrackMilestoneStates(track, anchorDateKey),
    achievedMilestonesInRange: track.milestones.filter((milestone) =>
      !!milestone.achievedAt && milestone.achievedAt >= range.start && milestone.achievedAt <= range.end,
    ),
  }
}

export function getTrackProgressLabel(trackSystem: TrackSystemData, track: Track, anchorDateKey: string) {
  const week = buildTrackReport(trackSystem, track, 'week', anchorDateKey)
  const month = buildTrackReport(trackSystem, track, 'month', anchorDateKey)
  const year = buildTrackReport(trackSystem, track, 'year', anchorDateKey)
  return {
    week: Math.round(week.onTrackRatio * 100),
    month: Math.round(month.onTrackRatio * 100),
    year: Math.round(year.onTrackRatio * 100),
  }
}

export interface TrackReminderCandidate {
  trackId: string
  trackTitle: string
  date: string
  summary: string
  detail: string
}

export function getTrackReminderCandidates(appData: AppData, dateKey: string) {
  const reminders: TrackReminderCandidate[] = []
  for (const track of appData.trackSystem.tracks) {
    if (track.status !== 'active') continue
    const status = getTrackDayStatus(appData.trackSystem, track, dateKey)
    if (status.riskActions.length === 0) continue
    const firstAction = status.riskActions[0]
    const nextMilestone = getTrackDashboard(track, dateKey).nextMilestone
    reminders.push({
      trackId: track.id,
      trackTitle: track.title,
      date: dateKey,
      summary: `「${track.title}」当前有脱轨风险`,
      detail: nextMilestone
        ? `今天优先补上「${firstAction.action.title}」，这样才能继续朝「${nextMilestone.title}」推进。`
        : `今天优先补上「${firstAction.action.title}」，把节奏重新拉回正轨。`,
    })
  }
  return reminders
}
