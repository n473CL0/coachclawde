import { useState } from 'react'
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
import { Calendar, ChevronRight, Dumbbell, Waves, Zap, CheckCircle, CalendarPlus, Trophy, Sparkles, Plus, MessageCircle, X } from 'lucide-react'
import { homeInvitation, type HomeInvitation } from '../lib/checkInTriggers'
import { QuickLogSheet } from '../components/session/QuickLogSheet'
import { buildQuickLog, type QuickLogInput } from '../lib/quickLog'
import { useAutoSync } from '../hooks/useAutoSync'
import { getWeekday, formatDuration } from '../lib/dateUtils'
import { format } from 'date-fns'
import type { Intensity, PlannedSession, SessionType } from '../types'

export function Home() {
  const navigate = useNavigate()
  const { getCurrentWeekPlan, loggedSessions, profile, addLoggedSession, weekPlans, checkIns, checkInDismissed, dismissCheckIn } = useAppStore()
  const invite = homeInvitation({ profile, weekPlans, loggedSessions, checkIns, dismissed: checkInDismissed }, new Date())
  const tracker = profile.goal?.tracker
  const plan = getCurrentWeekPlan()
  const { bump } = useScrollDirection()
  const { syncSession } = useAutoSync()
  const [showLog, setShowLog] = useState(false)

  function handleQuickLog(input: QuickLogInput) {
    const log = buildQuickLog(input)
    addLoggedSession(log)
    setShowLog(false)
    void syncSession(log.id)
  }

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
        <div className="flex items-center justify-end gap-2 pt-2 h-9">
          <button
            onClick={() => setShowLog(true)}
            aria-label="Log a session"
            className="h-9 px-3 flex items-center gap-1.5 rounded-2xl bg-[#1a1a1a] text-[#6a6a6a] hover:text-[#f5f5f0] transition-colors text-xs font-medium"
          >
            <Plus size={16} />
            Log a session
          </button>
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
        {program.isComplete && !(invite?.kind === 'milestone' && invite.key.startsWith('milestone:block-end')) && (
          <ProgramCompleteBanner length={program.length} onRestart={() => navigate('/check-in?trigger=milestone')} />
        )}

        {invite && (
          <InvitationCard
            invite={invite}
            onOpen={() => navigate(`/check-in?trigger=${invite.trigger}&week=${invite.weekStart}&key=${encodeURIComponent(invite.key)}`)}
            onDismiss={() => dismissCheckIn(invite.key)}
          />
        )}

        {!plan ? (
          tracker?.intake === 'log'
            ? <TrackerLogCTA onLog={() => setShowLog(true)} onConvert={() => navigate('/plan')} />
            : <NoPlanCTA tracker={!!tracker} onPlan={() => navigate('/plan')} />
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
                <div className="grid gap-2 @3xl/app:grid-cols-2">
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
                <div className="grid gap-2 @3xl/app:grid-cols-2">
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

      {showLog && <QuickLogSheet onSave={handleQuickLog} onClose={() => setShowLog(false)} />}
    </div>
  )
}

/** A suggested check-in (or the tracker's weekly summary). Never blocks anything. */
function InvitationCard({ invite, onOpen, onDismiss }: { invite: HomeInvitation; onOpen: () => void; onDismiss: () => void }) {
  const summary = invite.kind === 'summary'
  return (
    <div className="fade-in rounded-3xl bg-[#161616] border border-[#d97756]/30 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0">
        {summary ? <CheckCircle size={18} className="text-[#d97756]" /> : <MessageCircle size={18} className="text-[#d97756]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#f5f5f0]">{invite.title}</p>
        <p className="text-sm text-[#a8a29e] mt-0.5 leading-relaxed">{invite.text}</p>
        {!summary && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={onOpen}>{invite.kind === 'migration' ? 'Let’s go' : 'Check in'}</Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>Not now</Button>
          </div>
        )}
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="w-9 h-9 -mr-1 -mt-1 flex items-center justify-center rounded-full text-[#4a4a4a] hover:text-[#a8a29e] shrink-0">
        <X size={16} />
      </button>
    </div>
  )
}

/** Tracker athletes who log as they go: logging is the main action. */
function TrackerLogCTA({ onLog, onConvert }: { onLog: () => void; onConvert: () => void }) {
  return (
    <div className="fade-in rounded-3xl bg-gradient-to-br from-[#d97756]/10 to-[#1a1a1a] border border-[#d97756]/20 p-6 flex flex-col items-center text-center gap-4">
      <div>
        <h2 className="text-xl font-bold text-[#f5f5f0]">Your plan, your way</h2>
        <p className="text-sm text-[#6a6a6a] mt-1 leading-relaxed">Log each session as you do it. I'll keep score and send a short weekly summary.</p>
      </div>
      <Button onClick={onLog} size="lg" fullWidth><Plus size={18} /> Log a session</Button>
      <button onClick={onConvert} className="text-xs text-[#6a6a6a] hover:text-[#a8a29e]">or paste your plan and convert it</button>
    </div>
  )
}

function NoPlanCTA({ onPlan, tracker }: { onPlan: () => void; tracker?: boolean }) {
  return (
    <div className="fade-in">
      <div className="rounded-3xl bg-gradient-to-br from-[#d97756]/10 to-[#1a1a1a] border border-[#d97756]/20 p-6 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-3xl bg-[#d97756]/15 flex items-center justify-center">
          <Calendar size={28} className="text-[#d97756]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f5f5f0]">{tracker ? 'Bring in your plan' : 'Plan Your Week'}</h2>
          <p className="text-sm text-[#6a6a6a] mt-1 leading-relaxed">
            {tracker
              ? 'Paste this week of your plan and Claude converts it for the app, so you can log it here.'
              : 'Select your available training days, add any notes, and let Claude create your personalised workout plan.'}
          </p>
        </div>
        <Button onClick={onPlan} size="lg" fullWidth>
          <Calendar size={18} />
          {tracker ? 'Convert my plan' : 'Plan This Week'}
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
          You've finished your {length}-week block. A quick check-in on how it went, then your
          next block starts. No need to set everything up again.
        </p>
      </div>
      <Button onClick={onRestart} size="lg" fullWidth>
        <Sparkles size={18} />
        Check in & start the next block
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
            {session.type === 'cardio' && !!session.workout?.length && <StatPill label="Run Mode ready" icon="🏃" />}
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
