import type { AppState, PlannedSession, RoutineItem, WeekPlan } from '../types'
import { normalizeSession, normalizeWorkout } from './workout'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAllData(state: Pick<AppState, 'profile' | 'weekPlans' | 'loggedSessions'>) {
  downloadJson('profile.json', state.profile)
  setTimeout(() => downloadJson('sessions.json', state.loggedSessions), 200)
  setTimeout(() => downloadJson('plans.json', state.weekPlans), 400)
}

export function exportSessions(loggedSessions: AppState['loggedSessions']) {
  downloadJson('sessions.json', loggedSessions)
}

/**
 * Warm-up / cool-down moves are a guided checklist, so a slightly-off shape
 * shouldn't lose them. Claude occasionally returns plain strings or a numeric
 * prescription: coerce those into RoutineItems, and drop entries without a name.
 */
function normalizeRoutine(items: unknown): RoutineItem[] | undefined {
  if (!Array.isArray(items)) return undefined
  const out = items.flatMap((item): RoutineItem[] => {
    if (typeof item === 'string') return item.trim() ? [{ name: item.trim() }] : []
    if (!item || typeof item !== 'object') return []
    const { name, prescription, notes } = item as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) return []
    return [{
      name: name.trim(),
      ...(prescription != null && String(prescription).trim() ? { prescription: String(prescription).trim() } : {}),
      ...(typeof notes === 'string' && notes.trim() ? { notes: notes.trim() } : {}),
    }]
  })
  return out.length ? out : undefined
}

export function importPlanFromJson(jsonString: string): WeekPlan {
  const data = JSON.parse(jsonString)
  if (!data.id || !data.weekStartDate || !Array.isArray(data.sessions)) {
    throw new Error('Invalid plan format: missing required fields (id, weekStartDate, sessions)')
  }
  if (data.sessions.length === 0) {
    throw new Error('Plan must have at least one session')
  }
  for (const s of data.sessions) {
    if (!s.id || !s.date || !s.type || !s.title) {
      throw new Error(`Session missing required fields: ${JSON.stringify(s).slice(0, 100)}`)
    }
    if (!['weights', 'cardio', 'active-recovery'].includes(s.type)) {
      throw new Error(`Invalid session type: ${s.type}`)
    }
    for (const key of ['warmupExercises', 'cooldownExercises'] as const) {
      const items = normalizeRoutine(s[key])
      if (items) s[key] = items
      else delete s[key]
    }
    // Structured workouts are validated; legacy `intervals` get a workout too.
    if ('workout' in s) {
      const workout = normalizeWorkout(s.workout)
      if (workout) s.workout = workout
      else delete s.workout
    }
  }
  data.sessions = (data.sessions as PlannedSession[]).map(normalizeSession)
  return data as WeekPlan
}
