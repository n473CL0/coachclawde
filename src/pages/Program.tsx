import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardSection } from '../components/shared/Card'
import { Badge } from '../components/shared/Badge'
import { Reveal } from '../components/shared/Reveal'
import { getMonday, addDays, toLocalISODate } from '../lib/weekUtils'
import { SlidersHorizontal, ChevronDown, Dumbbell, Waves, Star } from 'lucide-react'
import { format, parseISO, startOfWeek, isSameWeek } from 'date-fns'
import type { LoggedSession } from '../types'

const WEIGHTS_COLOR = '#d97756'
const CARDIO_COLOR = '#60a5fa'

export function Program() {
  const navigate = useNavigate()
  const profile = useAppStore((s) => s.profile)
  const lengthWeeks = profile.program?.lengthWeeks ?? 12

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <PageHeader
        title="Your program"
        subtitle={`Your ${lengthWeeks}-week training, week by week`}
        backTo="/progress"
        right={
          <button
            onClick={() => navigate('/program/edit')}
            aria-label="Edit program"
            className="w-9 h-9 flex items-center justify-center rounded-2xl bg-[#1a1a1a] text-[#6a6a6a] hover:text-[#f5f5f0] transition-colors"
          >
            <SlidersHorizontal size={18} />
          </button>
        }
      />

      <div className="flex flex-col gap-6 px-4 pt-4 pb-32">
        <Reveal>
          <ProgramBarChart />
        </Reveal>
        <ProgramHistory />
      </div>
    </div>
  )
}

interface WeekBucket {
  weekStart: Date
  weights: number
  cardio: number
}

/** Stacked bars (weights + cardio) across the 12-week program window. */
function ProgramBarChart() {
  const { loggedSessions } = useAppStore()

  const weeks = useMemo<WeekBucket[]>(() => {
    const completed = loggedSessions.filter((s) => s.status === 'complete')
    // Twelve Mondays ending with the current week.
    const start = addDays(getMonday(new Date()), -7 * 11)
    const buckets: WeekBucket[] = Array.from({ length: 12 }, (_, i) => ({
      weekStart: addDays(start, i * 7),
      weights: 0,
      cardio: 0,
    }))
    for (const s of completed) {
      const ws = toLocalISODate(getMonday(parseISO(s.completedAt ?? s.date)))
      const b = buckets.find((x) => toLocalISODate(x.weekStart) === ws)
      if (!b) continue
      if (s.type === 'cardio') b.cardio += 1
      else b.weights += 1
    }
    return buckets
  }, [loggedSessions])

  const max = Math.max(1, ...weeks.map((w) => w.weights + w.cardio))
  const todayWeek = toLocalISODate(getMonday(new Date()))
  const CHART_H = 112

  return (
    <Card>
      <CardSection className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#f5f5f0]">Sessions by week</p>
          <div className="flex items-center gap-3">
            <LegendDot color={WEIGHTS_COLOR} label="Weights" />
            <LegendDot color={CARDIO_COLOR} label="Cardio" />
          </div>
        </div>

        <div className="flex items-end justify-between gap-1" style={{ height: CHART_H }}>
          {weeks.map((w) => {
            const total = w.weights + w.cardio
            const isCurrent = toLocalISODate(w.weekStart) === todayWeek
            return (
              <div key={w.weekStart.toISOString()} className="flex-1 flex flex-col justify-end items-center h-full">
                {total > 0 ? (
                  <div
                    className="w-full max-w-[20px] rounded-md overflow-hidden flex flex-col"
                    style={{ height: `${(total / max) * (CHART_H - 8)}px` }}
                    title={`Week of ${format(w.weekStart, 'dd MMM')}: ${w.weights} weights, ${w.cardio} cardio`}
                  >
                    {w.cardio > 0 && (
                      <div style={{ flexGrow: w.cardio, backgroundColor: CARDIO_COLOR }} />
                    )}
                    {w.weights > 0 && (
                      <div style={{ flexGrow: w.weights, backgroundColor: WEIGHTS_COLOR }} />
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-[20px] h-1 rounded-full bg-[#1f1f1f]" />
                )}
                <span className={`text-[9px] mt-1.5 ${isCurrent ? 'text-[#d97756] font-semibold' : 'text-[#4a4a4a]'}`}>
                  {format(w.weekStart, 'd/M')}
                </span>
              </div>
            )
          })}
        </div>
      </CardSection>
    </Card>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#6a6a6a]">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

interface WeekGroup {
  key: string
  label: string
  weekStart: Date
  sessions: LoggedSession[]
}

function ProgramHistory() {
  const navigate = useNavigate()
  const { loggedSessions } = useAppStore()
  const [open, setOpen] = useState<string | null>(null)

  const weeks = useMemo<WeekGroup[]>(() => {
    const completed = [...loggedSessions]
      .filter((s) => s.status === 'complete')
      .sort((a, b) => new Date(b.completedAt || b.date).getTime() - new Date(a.completedAt || a.date).getTime())

    const groups: WeekGroup[] = []
    for (const s of completed) {
      const weekStart = startOfWeek(parseISO(s.completedAt ?? s.date), { weekStartsOn: 1 })
      let g = groups.find((x) => isSameWeek(x.weekStart, weekStart, { weekStartsOn: 1 }))
      if (!g) {
        const isThisWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 })
        g = {
          key: weekStart.toISOString(),
          label: isThisWeek ? 'This week' : `Week of ${format(weekStart, 'dd MMM yyyy')}`,
          weekStart,
          sessions: [],
        }
        groups.push(g)
      }
      g.sessions.push(s)
    }
    return groups
  }, [loggedSessions])

  if (weeks.length === 0) {
    return (
      <div>
        <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">Week by week</p>
        <Card>
          <CardSection className="py-5">
            <p className="text-sm text-[#6a6a6a]">Complete some sessions and your week-by-week breakdown will appear here.</p>
          </CardSection>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-3">Week by week</p>
      <div className="flex flex-col gap-2">
        {weeks.map((w, i) => {
          const feels = w.sessions.map((s) => s.feelings).filter((f): f is NonNullable<typeof f> => f != null)
          const avgFeel = feels.length ? (feels.reduce((a, b) => a + b, 0) / feels.length).toFixed(1) : null
          const isOpen = open === w.key
          return (
            <Reveal key={w.key} index={i}>
              <Card>
                <button onClick={() => setOpen(isOpen ? null : w.key)} className="w-full text-left">
                  <CardSection className="flex items-center gap-3 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#f5f5f0]">{w.label}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-[#6a6a6a]">
                          {w.sessions.length} session{w.sessions.length !== 1 ? 's' : ''}
                        </span>
                        {avgFeel && (
                          <span className="flex items-center gap-1 text-xs text-[#6a6a6a]">
                            <Star size={11} className="text-[#d97756] fill-[#d97756]" />
                            {avgFeel}/5 avg feel
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-[#4a4a4a] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </CardSection>
                </button>

                {isOpen && (
                  <div className="border-t border-[#2a2a2a] px-3 py-2 flex flex-col gap-1">
                    {w.sessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => navigate(`/session/${s.plannedSessionId}`)}
                        className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-[#1a1a1a] transition-colors text-left"
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          s.type === 'weights' ? 'bg-[#d97756]/15' : 'bg-blue-500/15'
                        }`}>
                          {s.type === 'weights'
                            ? <Dumbbell size={15} className="text-[#d97756]" />
                            : <Waves size={15} className="text-blue-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#f5f5f0] truncate">{s.title}</p>
                          <p className="text-xs text-[#6a6a6a] mt-0.5">{format(parseISO(s.date), 'EEE dd MMM')}</p>
                        </div>
                        {s.feelings && (
                          <Badge label={`${s.feelings}/5`} variant="accent" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </Reveal>
          )
        })}
      </div>
    </div>
  )
}
