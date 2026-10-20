import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardSection } from '../components/shared/Card'
import { Badge } from '../components/shared/Badge'
import { ChevronRight, Dumbbell, Waves, Star, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { useAutoSync } from '../hooks/useAutoSync'
import { ClawdeMark } from '../components/shared/ClawdeMark'
import { formatSessionDate, formatDuration } from '../lib/dateUtils'
import type { Intensity, LoggedSession } from '../types'
import { useUnits } from '../store/useSettingsStore'
import { localize } from '../lib/units'
import { format, parseISO, startOfWeek, isSameWeek } from 'date-fns'

export function History() {
  const navigate = useNavigate()
  const { loggedSessions, weekPlans } = useAppStore()
  const { removeSession } = useAutoSync()
  const [toDelete, setToDelete] = useState<LoggedSession | null>(null)
  const units = useUnits()

  const completed = [...loggedSessions]
    .filter((s) => s.status === 'complete')
    .sort((a, b) => new Date(b.completedAt || b.date).getTime() - new Date(a.completedAt || a.date).getTime())

  // Group by week
  const grouped = groupByWeek(completed)

  function getPlanned(session: (typeof completed)[0]) {
    return weekPlans.flatMap((p) => p.sessions).find((s) => s.id === session.plannedSessionId)
  }

  if (completed.length === 0) {
    return (
      <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
        <PageHeader title="History" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pb-tabbar">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#241712] to-[#141414] ring-1 ring-[#d97756]/25 flex items-center justify-center">
            <ClawdeMark size={48} sweat />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[#f5f5f0]">No sessions yet</p>
            <p className="text-sm text-[#6a6a6a] mt-1">Complete your first session — Clawde's warmed up and waiting.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <PageHeader title="History" subtitle={`${completed.length} session${completed.length !== 1 ? 's' : ''} completed`} />

      <div className="flex flex-col gap-6 px-4 pt-4 pb-tabbar">
        {grouped.map(({ weekLabel, sessions }) => (
          <div key={weekLabel}>
            <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">{weekLabel}</p>
            <div className="grid grid-cols-1 gap-2 @3xl/app:grid-cols-2">
              {sessions.map((session) => {
                const planned = getPlanned(session)
                return (
                  <Card
                    key={session.id}
                    onClick={() => navigate(`/session/${session.plannedSessionId}`)}
                  >
                    <CardSection className="flex items-center gap-3 py-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        session.type === 'weights' ? 'bg-[#d97756]/15' : 'bg-blue-500/15'
                      }`}>
                        {session.type === 'weights'
                          ? <Dumbbell size={18} className="text-[#d97756]" />
                          : <Waves size={18} className="text-blue-400" />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#f5f5f0] truncate">{localize(session.title, units)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[#6a6a6a]">{formatSessionDate(session.date)}</span>
                          {planned && (
                            <Badge label={planned.intensity} variant={planned.intensity as Intensity} />
                          )}
                          {session.feelings && (
                            <div className="flex items-center gap-0.5">
                              <Star size={10} className="text-[#d97756] fill-[#d97756]" />
                              <span className="text-xs text-[#6a6a6a]">{session.feelings}/5</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {planned && <span className="text-xs text-[#4a4a4a]">{formatDuration(planned.estimatedMinutes)}</span>}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setToDelete(session) }}
                          aria-label={`Delete ${session.title}`}
                          className="p-2 -m-1 rounded-xl text-[#4a4a4a] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                        <ChevronRight size={14} className="text-[#3a3a3a]" />
                      </div>
                    </CardSection>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {toDelete && (
        <ConfirmDialog
          icon={<Trash2 size={20} />}
          title="Delete this session?"
          confirmLabel="Delete"
          onConfirm={() => { void removeSession(toDelete.id); setToDelete(null) }}
          onCancel={() => setToDelete(null)}
        >
          {toDelete.title} on {formatSessionDate(toDelete.date)} will be removed from your history and progress. This can't be undone.
        </ConfirmDialog>
      )}
    </div>
  )
}

function groupByWeek(sessions: ReturnType<typeof useAppStore.getState>['loggedSessions']) {
  const groups: { weekLabel: string; weekStart: Date; sessions: typeof sessions }[] = []

  for (const session of sessions) {
    const date = parseISO(session.date)
    const weekStart = startOfWeek(date, { weekStartsOn: 1 })

    let group = groups.find((g) => isSameWeek(g.weekStart, weekStart, { weekStartsOn: 1 }))
    if (!group) {
      const isThisWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 })
      group = {
        weekLabel: isThisWeek ? 'This week' : `Week of ${format(weekStart, 'dd MMM yyyy')}`,
        weekStart,
        sessions: [],
      }
      groups.push(group)
    }
    group.sessions.push(session)
  }

  return groups
}
