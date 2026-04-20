import type {
  AppData,
  AppSettings,
  JournalData,
  NotificationSettings,
  TrackAction,
  TrackCheckin,
  TrackCheckinEntry,
  TrackDuration,
  TrackMilestone,
  TrackRevision,
  TrackSystemData,
  UIState,
} from '../types'
import { getCurrentMonthKey, getTodayDateKey, parseDateKey, toDateKey } from './dateUtils'

export const APP_DATA_SCHEMA_VERSION = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeDateKey(value: unknown, fallback: string) {
  if (typeof value === 'string' && isDateKey(value)) return value
  if (typeof value === 'number' && Number.isFinite(value)) return toDateKey(value)
  return fallback
}

function normalizeTrackDuration(input?: Record<string, unknown>): TrackDuration {
  return {
    unit: input?.unit === 'year' ? 'year' : 'month',
    count: Math.max(1, Number(input?.count) || 1),
  }
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

function buildLegacyMilestoneDueDate(startDate: string, duration: TrackDuration, index: number, total: number) {
  if (total <= 1) return addDurationToDateKey(startDate, duration)
  const totalMonths = duration.unit === 'year' ? duration.count * 12 : duration.count
  const offsetMonths = Math.max(1, Math.round((totalMonths * (index + 1)) / total))
  const date = parseDateKey(startDate)
  date.setMonth(date.getMonth() + offsetMonths)
  return toDateKey(date)
}

function normalizeTrackAction(raw: unknown, index: number, trackId: string): TrackAction {
  const input = isRecord(raw) ? raw : {}
  const frequencyInput = isRecord(input.frequency) ? input.frequency : {}
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `track-action-${trackId}-${index + 1}`,
    title: typeof input.title === 'string' ? input.title.trim() : '',
    detail: typeof input.detail === 'string'
      ? input.detail.trim()
      : typeof input.description === 'string'
      ? input.description.trim()
      : '',
    frequency: {
      unit:
        frequencyInput.unit === 'workday' ||
        frequencyInput.unit === 'weekly' ||
        frequencyInput.unit === 'monthly'
          ? frequencyInput.unit
          : 'daily',
      targetCount: Math.max(1, Number(frequencyInput.targetCount) || 1),
    },
  }
}

function normalizeTrackMilestone(
  raw: unknown,
  index: number,
  trackId: string,
  startDate: string,
  targetDate: string,
): TrackMilestone {
  const input = isRecord(raw) ? raw : {}
  const fallbackDueDate = buildLegacyMilestoneDueDate(startDate, {
    unit: 'month',
    count: Math.max(1, index + 1),
  }, 0, 1)
  const dueDate = normalizeDateKey(input.dueDate, fallbackDueDate)
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `track-milestone-${trackId}-${index + 1}`,
    title: typeof input.title === 'string' ? input.title.trim() : '',
    dueDate: dueDate > targetDate ? targetDate : dueDate,
    definition: typeof input.definition === 'string' ? input.definition.trim() : '',
    achievedAt: typeof input.achievedAt === 'string' && isDateKey(input.achievedAt) ? input.achievedAt : undefined,
  }
}

function normalizeTrackRevision(raw: unknown, index: number): TrackRevision | null {
  const input = isRecord(raw) ? raw : {}
  const trackId = typeof input.trackId === 'string' ? input.trackId : ''
  if (!trackId) return null
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `track-revision-${trackId}-${index + 1}`,
    trackId,
    title: typeof input.title === 'string' ? input.title.trim() : '方案记录',
    summary: typeof input.summary === 'string' ? input.summary.trim() : '',
    reason: typeof input.reason === 'string' ? input.reason.trim() : '',
    effectiveFrom: normalizeDateKey(input.effectiveFrom, getTodayDateKey()),
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
  }
}

function normalizeTrackCheckinEntry(raw: unknown, index: number, checkinId: string): TrackCheckinEntry | null {
  const input = isRecord(raw) ? raw : {}
  const completedAt = typeof input.completedAt === 'number' && Number.isFinite(input.completedAt)
    ? input.completedAt
    : typeof input.completedAt === 'string' && !Number.isNaN(Date.parse(input.completedAt))
    ? Date.parse(input.completedAt)
    : null
  if (completedAt === null) return null
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `${checkinId}-entry-${index + 1}`,
    completedAt,
  }
}

function normalizeTrackCheckin(raw: unknown, index: number): TrackCheckin | null {
  const input = isRecord(raw) ? raw : {}
  const trackId = typeof input.trackId === 'string' ? input.trackId : ''
  const actionId = typeof input.actionId === 'string' ? input.actionId : ''
  if (!trackId || !actionId) return null
  const checkinId = typeof input.id === 'string' && input.id ? input.id : `track-checkin-${trackId}-${index + 1}`
  const entries = Array.isArray(input.entries)
    ? input.entries
        .map((entry, entryIndex) => normalizeTrackCheckinEntry(entry, entryIndex, checkinId))
        .filter((entry): entry is TrackCheckinEntry => !!entry)
        .sort((a, b) => a.completedAt - b.completedAt)
    : undefined
  const normalizedCount = Math.max(entries?.length ?? 0, Math.max(0, Number(input.count) || 0))
  return {
    id: checkinId,
    trackId,
    revisionId: typeof input.revisionId === 'string' ? input.revisionId : null,
    actionId,
    date: normalizeDateKey(input.date, getTodayDateKey()),
    count: normalizedCount,
    entries: entries?.length ? entries : undefined,
    note: typeof input.note === 'string' ? input.note : undefined,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
  }
}

function mergeTrackCheckins(checkins: TrackCheckin[]) {
  const merged = new Map<string, TrackCheckin>()
  for (const checkin of checkins) {
    const key = `${checkin.trackId}::${checkin.actionId}::${checkin.date}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, checkin)
      continue
    }
    const mergedEntries = [...(current.entries ?? []), ...(checkin.entries ?? [])]
      .sort((a, b) => a.completedAt - b.completedAt)
    merged.set(key, {
      ...current,
      count: current.count + checkin.count,
      entries: mergedEntries.length ? mergedEntries : undefined,
      note: current.note ?? checkin.note,
      createdAt: Math.min(current.createdAt, checkin.createdAt),
      updatedAt: Math.max(current.updatedAt, checkin.updatedAt),
    })
  }
  return Array.from(merged.values()).map((checkin) => ({
    ...checkin,
    count: Math.max(checkin.count, checkin.entries?.length ?? 0),
  }))
}

function getLegacyTrackRevisions(trackId: string, rawRevisions: unknown[]) {
  return rawRevisions
    .map((revision, index) => ({ raw: revision, normalized: normalizeTrackRevision(revision, index) }))
    .filter((item): item is { raw: Record<string, unknown>; normalized: TrackRevision } =>
      isRecord(item.raw) && !!item.normalized && item.normalized.trackId === trackId,
    )
    .sort((a, b) => {
      if (a.normalized.effectiveFrom === b.normalized.effectiveFrom) {
        return a.normalized.createdAt - b.normalized.createdAt
      }
      return a.normalized.effectiveFrom.localeCompare(b.normalized.effectiveFrom)
    })
}

function normalizeTrack(raw: unknown, index: number, rawRevisions: unknown[]): TrackSystemData['tracks'][number] {
  const input = isRecord(raw) ? raw : {}
  const trackId = typeof input.id === 'string' && input.id ? input.id : `track-${index + 1}`
  const duration = normalizeTrackDuration(isRecord(input.duration) ? input.duration : undefined)
  const legacyRevisions = getLegacyTrackRevisions(trackId, rawRevisions)
  const latestLegacyRevision = legacyRevisions[legacyRevisions.length - 1]
  const fallbackStartDate = normalizeDateKey(
    latestLegacyRevision?.normalized.effectiveFrom,
    typeof input.createdAt === 'number' ? toDateKey(input.createdAt) : getTodayDateKey(),
  )
  const startDate = normalizeDateKey(input.startDate, fallbackStartDate)
  const targetDate = addDurationToDateKey(startDate, duration)

  const rawActions = Array.isArray(input.actions)
    ? input.actions
    : Array.isArray((latestLegacyRevision?.raw as Record<string, unknown> | undefined)?.actions)
    ? ((latestLegacyRevision?.raw as Record<string, unknown>).actions as unknown[])
    : []

  const rawMilestones = Array.isArray(input.milestones)
    ? input.milestones
    : Array.isArray(input.coreGoals)
    ? input.coreGoals.map((goal, goalIndex, goals) => ({
        title: typeof goal === 'string' ? goal : '',
        dueDate: buildLegacyMilestoneDueDate(startDate, duration, goalIndex, goals.length),
        definition: '',
      }))
    : []

  return {
    id: trackId,
    title: typeof input.title === 'string' ? input.title.trim() : '',
    summary: typeof input.summary === 'string' ? input.summary.trim() : '',
    duration,
    startDate,
    status: input.status === 'archived' ? 'archived' : 'active',
    color: typeof input.color === 'string' && input.color ? input.color : '#4a90d9',
    milestones: rawMilestones
      .map((milestone, milestoneIndex) => normalizeTrackMilestone(milestone, milestoneIndex, trackId, startDate, targetDate))
      .filter((milestone) => milestone.title),
    actions: rawActions
      .map((action, actionIndex) => normalizeTrackAction(action, actionIndex, trackId))
      .filter((action) => action.title),
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
  }
}

function normalizeTrackSystem(raw: Record<string, unknown>): TrackSystemData {
  const rawTracks = Array.isArray(raw.tracks) ? raw.tracks : []
  const rawRevisions = Array.isArray(raw.revisions) ? raw.revisions : []
  const rawCheckins = Array.isArray(raw.checkins) ? raw.checkins : []
  return {
    tracks: rawTracks.map((track, index) => normalizeTrack(track, index, rawRevisions)).filter((track) => track.title),
    revisions: rawRevisions
      .map((revision, index) => normalizeTrackRevision(revision, index))
      .filter((revision): revision is TrackRevision => !!revision),
    checkins: mergeTrackCheckins(
      rawCheckins
        .map((checkin, index) => normalizeTrackCheckin(checkin, index))
        .filter((checkin): checkin is TrackCheckin => !!checkin && checkin.count > 0),
    ),
  }
}

export function getDefaultNotificationSettings(): NotificationSettings {
  return {
    enabled: false,
    runInBackground: true,
    launchAtLogin: false,
    quietHours: {
      enabled: false,
      start: '23:00',
      end: '08:00',
    },
  }
}

export function getDefaultAppSettings(): AppSettings {
  return {
    theme: 'light',
    notifications: getDefaultNotificationSettings(),
  }
}

export function createEmptyJournalData(): JournalData {
  return {
    entriesByDate: {},
  }
}

export function createEmptyTrackSystemData(): TrackSystemData {
  return {
    tracks: [],
    revisions: [],
    checkins: [],
  }
}

export function createDefaultUIState(): UIState {
  return {
    boardViewMode: 'overview',
    journalViewMode: 'detail',
    journalSelectedDate: getTodayDateKey(),
    journalCalendarMonth: getCurrentMonthKey(),
    selectedTrackId: null,
    trackViewMode: 'overview',
    trackReportPeriod: 'week',
  }
}

export function normalizeAppSettings(raw: unknown): AppSettings {
  const input = isRecord(raw) ? raw : {}
  const notificationsInput = isRecord(input.notifications) ? input.notifications : {}
  const quietHoursInput = isRecord(notificationsInput.quietHours) ? notificationsInput.quietHours : {}
  const defaults = getDefaultNotificationSettings()

  return {
    theme: input.theme === 'dark' ? 'dark' : 'light',
    webdav: isRecord(input.webdav)
      ? {
          server: typeof input.webdav.server === 'string' ? input.webdav.server : '',
          username: typeof input.webdav.username === 'string' ? input.webdav.username : '',
          password: typeof input.webdav.password === 'string' ? input.webdav.password : '',
        }
      : undefined,
    notifications: {
      enabled: notificationsInput.enabled === true,
      runInBackground: notificationsInput.runInBackground !== false,
      launchAtLogin: notificationsInput.launchAtLogin === true,
      quietHours: {
        enabled: quietHoursInput.enabled === true,
        start: typeof quietHoursInput.start === 'string' ? quietHoursInput.start : defaults.quietHours.start,
        end: typeof quietHoursInput.end === 'string' ? quietHoursInput.end : defaults.quietHours.end,
      },
    },
  }
}

export function normalizeAppData(raw: unknown): AppData {
  const input = isRecord(raw) ? raw : {}
  const uiInput = isRecord(input.uiState) ? input.uiState : {}
  const journalInput = isRecord(input.journal) ? input.journal : {}
  const trackInput = isRecord(input.trackSystem) ? input.trackSystem : {}
  const defaults = createDefaultUIState()

  return {
    schemaVersion: typeof input.schemaVersion === 'number' ? input.schemaVersion : APP_DATA_SCHEMA_VERSION,
    canvases: Array.isArray(input.canvases) ? input.canvases as AppData['canvases'] : [],
    activeCanvasId: typeof input.activeCanvasId === 'string' ? input.activeCanvasId : null,
    mainView: input.mainView === 'journal' || input.mainView === 'tracks' ? input.mainView : 'boards',
    journal: {
      entriesByDate: isRecord(journalInput.entriesByDate)
        ? journalInput.entriesByDate as JournalData['entriesByDate']
        : createEmptyJournalData().entriesByDate,
    },
    trackSystem: normalizeTrackSystem(trackInput),
    uiState: {
      boardViewMode: uiInput.boardViewMode === 'canvas' ? 'canvas' : defaults.boardViewMode,
      journalViewMode: uiInput.journalViewMode === 'table' ? 'table' : defaults.journalViewMode,
      journalSelectedDate: typeof uiInput.journalSelectedDate === 'string' ? uiInput.journalSelectedDate : defaults.journalSelectedDate,
      journalCalendarMonth: typeof uiInput.journalCalendarMonth === 'string' ? uiInput.journalCalendarMonth : defaults.journalCalendarMonth,
      selectedTrackId: typeof uiInput.selectedTrackId === 'string' ? uiInput.selectedTrackId : null,
      trackViewMode: uiInput.trackViewMode === 'detail' || uiInput.trackViewMode === 'reports'
        ? uiInput.trackViewMode
        : defaults.trackViewMode,
      trackReportPeriod:
        uiInput.trackReportPeriod === 'week' ||
        uiInput.trackReportPeriod === 'month' ||
        uiInput.trackReportPeriod === 'quarter' ||
        uiInput.trackReportPeriod === 'halfYear' ||
        uiInput.trackReportPeriod === 'year'
          ? uiInput.trackReportPeriod
          : defaults.trackReportPeriod,
    },
    _syncTimestamp: typeof input._syncTimestamp === 'number' ? input._syncTimestamp : undefined,
  }
}
