import type { AppState } from '../types'

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

export function importPlanFromJson(jsonString: string) {
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
  }
  return data
}
