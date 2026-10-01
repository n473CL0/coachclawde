import type { LoggedSession, WeekPlan } from '../types'

/**
 * Week-scoped session ids.
 *
 * A logged session points at its planned session by `plannedSessionId`, and
 * Claude names sessions like "session-mon-upper". Those names repeat week to
 * week, so a new week's session could look "already done" (matched by an old
 * week's log) and vanish from Home, while the week count still included it.
 *
 * Every session id is therefore suffixed with its plan's week
 * ("session-mon-upper--2026-10-05"), and duplicates within a week get a
 * counter. Stored plans and logs are re-linked the same way when they're read,
 * so existing history stays attached. Deterministic and idempotent: running it
 * again changes nothing, so local and synced copies always agree.
 */

const SEP = '--'

export function isWeekScoped(id: string, weekStartDate: string): boolean {
  return id.endsWith(`${SEP}${weekStartDate}`) || new RegExp(`${SEP}${weekStartDate}-\\d+$`).test(id)
}

/** Scopes every session id in a plan to its week. Returns the same plan when nothing changes. */
export function scopeSessionIds(plan: WeekPlan): WeekPlan {
  const seen = new Set<string>()
  let changed = false
  const sessions = plan.sessions.map((s) => {
    let id = isWeekScoped(s.id, plan.weekStartDate) ? s.id : `${s.id}${SEP}${plan.weekStartDate}`
    if (seen.has(id)) {
      let n = 2
      while (seen.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    seen.add(id)
    if (id === s.id) return s
    changed = true
    return { ...s, id }
  })
  return changed ? { ...plan, sessions } : plan
}

/**
 * Scopes all plans and points every log at its session's new id: by the
 * log's plan when it has one, else by the old id and the session date.
 */
export function scopePlansAndLogs(
  plans: WeekPlan[],
  logs: LoggedSession[],
): { plans: WeekPlan[]; logs: LoggedSession[] } {
  const byPlan = new Map<string, string>()
  const byDate = new Map<string, string>()
  const out = plans.map((plan) => {
    const scoped = scopeSessionIds(plan)
    plan.sessions.forEach((s, i) => {
      const next = scoped.sessions[i].id
      if (next === s.id) return
      byPlan.set(`${plan.id}|${s.id}`, next)
      if (!byDate.has(`${s.id}|${s.date}`)) byDate.set(`${s.id}|${s.date}`, next)
    })
    return scoped
  })
  if (!byPlan.size) return { plans: out, logs }
  let changed = false
  const relinked = logs.map((log) => {
    const next = byPlan.get(`${log.weekPlanId}|${log.plannedSessionId}`) ?? byDate.get(`${log.plannedSessionId}|${log.date}`)
    if (!next) return log
    changed = true
    return { ...log, plannedSessionId: next }
  })
  return { plans: out, logs: changed ? relinked : logs }
}
