import type { LoggedSession, PlannedSession, SessionType } from '../types'
import { nanoid } from './nanoid'

/**
 * Quick log: "Did something else?" on a planned session, or "Log a session"
 * with no plan at all. Either way it becomes a real `LoggedSession` with a
 * `substitute` record, so history (and the plan prompt) reads what actually
 * happened instead of a session that didn't.
 */

export interface QuickActivity {
  value: string
  label: string
  type: SessionType
}

export const QUICK_ACTIVITIES: QuickActivity[] = [
  { value: 'Run', label: 'Run', type: 'cardio' },
  { value: 'Bike', label: 'Bike', type: 'cardio' },
  { value: 'Row', label: 'Row', type: 'cardio' },
  { value: 'Swim', label: 'Swim', type: 'cardio' },
  { value: 'Walk', label: 'Walk', type: 'cardio' },
  { value: 'Gym session', label: 'Gym', type: 'weights' },
  { value: 'Class', label: 'Class', type: 'cardio' },
  { value: 'Sport', label: 'Sport', type: 'cardio' },
  { value: 'Yoga / mobility', label: 'Yoga', type: 'active-recovery' },
]

/** Activities where a distance makes sense, so the sheet offers the field. */
export const DISTANCE_ACTIVITIES = new Set(['Run', 'Bike', 'Row', 'Swim', 'Walk'])

export interface QuickLogInput {
  activity: string
  minutes: number
  distanceKm?: number
  rpe?: number
  notes?: string
  /** Local ISO date the activity happened. */
  date: string
}

export function activityType(activity: string): SessionType {
  return QUICK_ACTIVITIES.find((a) => a.value === activity)?.type ?? 'cardio'
}

/** Prefix for the `plannedSessionId` of a session logged without a plan. */
export const UNPLANNED_PREFIX = 'unplanned-'

export function isUnplanned(log: LoggedSession): boolean {
  return log.plannedSessionId.startsWith(UNPLANNED_PREFIX)
}

/**
 * Builds the logged session. With `planned` it's a swap for that session (and
 * replaces any in-progress log of it, keeping its id); without, a standalone
 * log.
 */
export function buildQuickLog(
  input: QuickLogInput,
  opts: { planned?: PlannedSession; weekPlanId?: string; existing?: LoggedSession; now?: Date } = {},
): LoggedSession {
  const now = (opts.now ?? new Date()).toISOString()
  const { planned, existing } = opts
  const id = existing?.id ?? nanoid()
  const substitute = {
    activity: input.activity.trim() || 'Activity',
    minutes: Math.max(1, Math.round(input.minutes)),
    ...(input.distanceKm && input.distanceKm > 0 ? { distanceMeters: Math.round(input.distanceKm * 1000) } : {}),
  }
  const notes = input.notes?.trim() || undefined
  if (planned) {
    return {
      ...(existing ?? {}),
      id,
      plannedSessionId: planned.id,
      weekPlanId: opts.weekPlanId ?? existing?.weekPlanId ?? '',
      date: planned.date,
      type: planned.type,
      title: planned.title,
      focus: planned.focus,
      startedAt: existing?.startedAt ?? now,
      completedAt: now,
      status: 'complete',
      outcome: 'substituted',
      substitute,
      rpe: input.rpe,
      generalNotes: notes,
    }
  }
  return {
    id,
    plannedSessionId: `${UNPLANNED_PREFIX}${id}`,
    weekPlanId: '',
    date: input.date,
    type: activityType(input.activity),
    title: substitute.activity,
    focus: 'Logged without a plan',
    startedAt: now,
    completedAt: now,
    status: 'complete',
    substitute,
    rpe: input.rpe,
    generalNotes: notes,
  }
}
