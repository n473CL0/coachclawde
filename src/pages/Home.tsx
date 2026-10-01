import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { toLocalISODate } from '../lib/weekUtils'
import { Card, CardSection } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { Badge } from '../components/shared/Badge'
import { ClaudeMark } from '../components/shared/ClaudeMark'
import { Reveal } from '../components/shared/Reveal'
import { useScrollDirection } from '../hooks/useScrollDirection'
import { getProgramProgress } from '../lib/programProgress'
import { Calendar, ChevronRight, Dumbbell, Waves, Zap, CheckCircle, CalendarPlus, Trophy, Sparkles } from 'lucide-react'
import { getWeekday, formatDuration } from '../lib/dateUtils'
import { format } from 'date-fns'
import type { Intensity, PlannedSession, SessionType } from '../types'

export function Home() {
  const navigate = useNavigate()
  const { getCurrentWeekPlan, loggedSessions, profile } = useAppStore()
  const plan = getCurrentWeekPlan()
  const { bump } = useScrollDirection()

  const today = toLocalISODate(new Date())

  // Greet by first name, but degrade gracefully if no name is set so the
  // header never shows a dangling "Afternoon, ".
  const firstName = (profile.name ?? '').trim().split(' ')[0]

  const isSessionLogged = (sessionId: string) =>
    loggedSessions.some((ls) => ls.plannedSessionId === sessionId && ls.status === 'complete')

  // Completed sessions live in History only. Home shows what's still to do:
  // the next workout, the rest of the week ahead, and anything missed.
  const pending = (plan?.sessions ?? []).filter((s) => !isSessionLogged(s.id))
  const upcoming = pending
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const missed = pending
    .filter((s) => s.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const nextSession = upcoming[0]
  const futureSessions = upcoming.slice(1)

  const weekDone = plan != null && pending.length === 0
  const program = getProgramProgress(profile)

  return (
    <div className="flex flex-col pb-tabbar min-h-svh bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-4 pt-safe">
        {/* Top bar with plan action */}
        <div className="flex items-center justify-end pt-2 h-9">
          <button
            onClick={() => navigate('/plan')}
            aria-label="Plan your week"
            className="w-9 h-9 flex items-center justify-center rounded-2xl bg-[#1a1a1a] text-[#6a6a6a] hover:text-[#f5f5f0] transition-colors"
          >
            <CalendarPlus size={18} />
          </button>
        </div>

        {/* Centered greeting hero — Clawde, seamless on the background */}
        <div className="flex flex-col items-center text-center pt-2 pb-5">
          <div className="relative mb-3">
            <div
              className="absolute inset-0 -m-3 rounded-full bg-[#d97756]/15 blur-2xl"
              aria-hidden
            />
            <ClaudeMark size={68} cheer={bump} sweat={bump} className="relative" />
          </div>
          <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium">
            {format(new Date(), 'EEEE, dd MMM')}
          </p>
          <h1 className="text-2xl font-bold text-[#f5f5f0] mt-1">
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4">
        {program.isComplete && (
          <ProgramCompleteBanner length={program.length} onRestart={() => navigate('/onboarding')} />
        )}

        {!plan ? (
          <NoPlanCTA onPlan={() => navigate('/plan')} />
        ) : weekDone ? (
          <WeekCompleteBanner onPlan={() => navigate('/plan')} />
        ) : (
          <>
            {nextSession && (
              <NextSessionCard
                session={nextSession}
                onClick={() => navigate(`/session/${nextSession.id}`)}
              />
            )}

            {futureSessions.length > 0 && (
              <div>
                <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium mb-3 px-1">
                  This week
                </p>
                <div className="flex flex-col gap-2">
                  {futureSessions.map((s, i) => (
                    <Reveal key={s.id} index={i}>
                      <UpcomingTile
                        session={s}
                        onClick={() => navigate(`/session/${s.id}`)}
                      />
                    </Reveal>
                  ))}
                </div>
              </div>
            )}

            {missed.length > 0 && (
              <div>
                <p className="text-xs text-amber-500/80 uppercase tracking-widest font-medium mb-3 px-1">
                  Missed
                </p>
                <div className="flex flex-col gap-2">
                  {missed.map((s, i) => (
                    <Reveal key={s.id} index={i}>
                      <UpcomingTile
                        session={s}
                        missed
                        onClick={() => navigate(`/session/${s.id}`)}
                      />
                    </Reveal>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Week stats pill */}
        {plan && (
          <Reveal>
            <div className="flex items-center justify-between bg-[#161616] rounded-2xl px-4 py-3 border border-[#2a2a2a]">
              <span className="text-sm text-[#6a6a6a]">Week {program.week} of {program.length}</span>
              <span className="text-sm font-medium text-[#f5f5f0]">
                {plan.sessions.filter((s) => isSessionLogged(s.id)).length}/{plan.sessions.length} sessions
              </span>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  )
}

function NoPlanCTA({ onPlan }: { onPlan: () => void }) {
  return (
    <div className="fade-in">
      <div className="rounded-3xl bg-gradient-to-br from-[#d97756]/10 to-[#1a1a1a] border border-[#d97756]/20 p-6 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-3xl bg-[#d97756]/15 flex items-center justify-center">
          <Calendar size={28} className="text-[#d97756]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f5f5f0]">Plan Your Week</h2>
          <p className="text-sm text-[#6a6a6a] mt-1 leading-relaxed">
            Select your available training days, add any notes, and let Claude create your personalised workout plan.
          </p>
        </div>
        <Button onClick={onPlan} size="lg" fullWidth>
          <Calendar size={18} />
          Plan This Week
        </Button>
      </div>
    </div>
  )
}

function WeekCompleteBanner({ onPlan }: { onPlan: () => void }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-500/10 to-[#1a1a1a] border border-emerald-500/20 p-6 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-3xl bg-emerald-500/15 flex items-center justify-center">
        <CheckCircle size={28} className="text-emerald-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-[#f5f5f0]">Week complete!</h2>
        <p className="text-sm text-[#6a6a6a] mt-1">All sessions done. Plan your next week to keep the momentum.</p>
      </div>
      <Button onClick={onPlan} size="lg" fullWidth>
        <Calendar size={18} />
        Plan Next Week
      </Button>
    </div>
  )
}

function ProgramCompleteBanner({ length, onRestart }: { length: number; onRestart: () => void }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#d97756]/15 to-[#1a1a1a] border border-[#d97756]/30 p-6 flex flex-col items-center text-center gap-4 fade-in">
      <div className="w-14 h-14 rounded-3xl bg-[#d97756]/15 flex items-center justify-center">
        <Trophy size={28} className="text-[#d97756]" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-[#f5f5f0]">Program complete! 🎉</h2>
        <p className="text-sm text-[#6a6a6a] mt-1 leading-relaxed">
          You've finished your {length}-week block. Let's set up your next one — reassess your
          goals and where you're at, and Coach Claude will build a fresh program.
        </p>
      </div>
      <Button onClick={onRestart} size="lg" fullWidth>
        <Sparkles size={18} />
        Start a new program
      </Button>
    </div>
  )
}

function NextSessionCard({ session, onClick }: { session: PlannedSession; onClick: () => void }) {
  return (
    <Card accent glow onClick={onClick} className="fade-in">
      <div className="bg-gradient-to-br from-[#d97756]/8 to-transparent">
        <CardSection>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#d97756]/15 flex items-center justify-center">
                <SessionIcon type={session.type} size={16} className="text-[#d97756]" />
              </div>
              <span className="text-sm font-medium text-[#d97756]">
                {getWeekday(session.date)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge label={session.intensity} variant={session.intensity as Intensity} />
              <ChevronRight size={16} className="text-[#4a4a4a]" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-[#f5f5f0] leading-tight">{session.title}</h2>
          <p className="text-sm text-[#6a6a6a] mt-1">{session.focus}</p>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#2a2a2a]">
            <StatPill label={formatDuration(session.estimatedMinutes)} icon="⏱" />
            {session.exercises && <StatPill label={`${session.exercises.length} exercises`} icon="💪" />}
            {session.intervals && <StatPill label={`${session.intervals.length} intervals`} icon="🚣" />}
          </div>
        </CardSection>
      </div>
    </Card>
  )
}

function UpcomingTile({ session, missed = false, onClick }: { session: PlannedSession; missed?: boolean; onClick: () => void }) {
  return (
    <Card onClick={onClick}>
      <CardSection className="flex items-center gap-3 py-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
          missed ? 'bg-amber-500/15' : 'bg-[#2a2a2a]'
        }`}>
          <SessionIcon type={session.type} size={18} className={missed ? 'text-amber-500' : 'text-[#6a6a6a]'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#f5f5f0] truncate">{session.title}</p>
          <p className="text-xs text-[#6a6a6a] mt-0.5">
            {missed && <span className="text-amber-500/80">Missed · </span>}
            {getWeekday(session.date)} · {formatDuration(session.estimatedMinutes)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge label={session.intensity} variant={session.intensity as Intensity} />
          <ChevronRight size={14} className="text-[#3a3a3a]" />
        </div>
      </CardSection>
    </Card>
  )
}

function StatPill({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <span className="text-xs text-[#6a6a6a]">{label}</span>
    </div>
  )
}

function SessionIcon({ type, size, className }: { type: SessionType; size: number; className?: string }) {
  switch (type) {
    case 'weights': return <Dumbbell size={size} className={className} />
    case 'cardio': return <Waves size={size} className={className} />
    default: return <Zap size={size} className={className} />
  }
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}
