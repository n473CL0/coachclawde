import { useEffect, useMemo, useState } from 'react'
import { WorkoutCard } from '../components/session/WorkoutCard'
import { RunMode, type RunResult } from '../components/session/RunMode'
import { flattenWorkout, initialLoggedIntervals, loggableSteps, stepLabel, type FlatStep } from '../lib/workout'
import { athleteZones } from '../lib/goalProfile'
import { resolveTarget, type RunZones } from '../lib/zones'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { PageHeader } from '../components/layout/PageHeader'
import { FixedLayer } from '../components/layout/FixedLayer'
import { Badge } from '../components/shared/Badge'
import { Button } from '../components/shared/Button'
import { ExerciseTile } from '../components/session/ExerciseTile'
import { IntervalRow } from '../components/session/IntervalRow'
import { RestTimerOverlay } from '../components/session/RestTimer'
import { CompleteFlow, type SessionCompleteData } from '../components/session/CompleteFlow'
import { QuickLogSheet } from '../components/session/QuickLogSheet'
import { useWakeLock } from '../hooks/useWakeLock'
import { buildQuickLog, type QuickLogInput } from '../lib/quickLog'
import { describeSubstitute } from '../lib/historySummary'
import { formatSessionDate } from '../lib/dateUtils'
import { RoutineCard } from '../components/session/RoutineCard'
import { useRestTimer } from '../hooks/useRestTimer'
import { useAutoSync } from '../hooks/useAutoSync'
import { formatDuration } from '../lib/dateUtils'
import { cardioLabel, inferCardioType } from '../lib/cardioUtils'
import { warmExerciseDb } from '../lib/exerciseGuide'
import type { CardioType, Intensity, LoggedExercise, LoggedInterval, LoggedSession, PlannedSession, WeekReflection } from '../types'
import type { IntervalRowSpec } from '../components/session/IntervalRow'
import { Dumbbell, Waves, Clock, CheckCircle2, AlertTriangle, Shuffle, Play } from 'lucide-react'
import { nanoid } from '../lib/nanoid'

function usePlannedSession(sessionId: string | undefined): PlannedSession | undefined {
  const { weekPlans } = useAppStore()
  return useMemo(
    () => weekPlans.flatMap((p) => p.sessions).find((s) => s.id === sessionId),
    [weekPlans, sessionId]
  )
}

export function Session() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const planned = usePlannedSession(id)

  // Return to wherever we came from (History, Home, Program history, …) instead
  // of a fixed route. `location.key === 'default'` means this is the first entry
  // in the history stack (e.g. a deep link), so fall back to Home.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'))
  const { weekPlans, loggedSessions, addLoggedSession, updateLoggedSession, setActiveSession, profile } = useAppStore()
  const zones = athleteZones(profile)
  // The cardio workout as the ordered steps Run Mode plays; manual rows are
  // the non-recovery steps (legacy plans were converted on read).
  const flat = useMemo(() => (planned?.workout ? flattenWorkout(planned.workout) : []), [planned])
  const rows = useMemo(() => loggableSteps(flat), [flat])
  const [showRun, setShowRun] = useState(false)
  const { startTimer } = useRestTimer()
  const { syncSession } = useAutoSync()
  const [activeExerciseIdx, setActiveExerciseIdx] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [showQuickLog, setShowQuickLog] = useState(false)
  // Run Mode saves the session itself, then may show only the week invitation.
  const [showInvite, setShowInvite] = useState(false)

  const existingLog = loggedSessions.find((ls) => ls.plannedSessionId === id)
  const [loggedSession, setLoggedSession] = useState<LoggedSession | null>(existingLog ?? null)

  // Cardio modality — chosen by the athlete when the session offers options,
  // otherwise inferred from the title/focus. Drives the split/pace units.
  const cardioChoices = planned?.cardioOptions?.length ? planned.cardioOptions : undefined
  const [cardioType, setCardioTypeState] = useState<CardioType>(
    existingLog?.cardioType
      ?? cardioChoices?.[0]
      ?? inferCardioType(`${planned?.title ?? ''} ${planned?.focus ?? ''}`)
  )
  function setCardioType(t: CardioType) {
    setCardioTypeState(t)
    if (loggedSession) {
      setLoggedSession({ ...loggedSession, cardioType: t })
      updateLoggedSession(loggedSession.id, { cardioType: t })
    }
  }

  const weekPlan = weekPlans.find((p) => p.sessions.some((s) => s.id === id))

  // Determine if this is the last session of the week
  const isLastSession = useMemo(() => {
    if (!weekPlan || !id) return false
    const completedIds = loggedSessions.filter((ls) => ls.status === 'complete').map((ls) => ls.plannedSessionId)
    const remaining = weekPlan.sessions.filter((s) => s.id !== id && !completedIds.includes(s.id))
    return remaining.length === 0
  }, [weekPlan, id, loggedSessions])

  // Keep the screen on while a workout is being logged.
  useWakeLock(!!loggedSession && loggedSession.status !== 'complete' && !showRun)

  useEffect(() => {
    if (id) setActiveSession(id)
    return () => setActiveSession(null)
  }, [id, setActiveSession])

  // Fetch the movement-guide library now, while there's likely signal, so the
  // help buttons work (from the service-worker cache) mid-workout.
  useEffect(() => {
    if (planned?.type !== 'cardio') warmExerciseDb()
  }, [planned?.type])

  if (!planned && existingLog?.substitute) {
    return <LoggedActivityView log={existingLog} onBack={goBack} />
  }

  if (!planned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-svh gap-4 px-4">
        <AlertTriangle size={40} className="text-[#4a4a4a]" />
        <p className="text-[#6a6a6a] text-center">Session not found. It may belong to a different week's plan.</p>
        <Button variant="secondary" onClick={() => navigate('/')}>Back to home</Button>
      </div>
    )
  }

  // Initialize log if not started yet
  function startSession(): LoggedSession | null {
    if (!planned) return null
    const initial: LoggedSession = {
      id: nanoid(),
      plannedSessionId: planned.id,
      weekPlanId: weekPlan?.id ?? '',
      date: planned.date,
      type: planned.type,
      title: planned.title,
      focus: planned.focus,
      startedAt: new Date().toISOString(),
      status: 'in-progress',
      cardioType: planned.type === 'cardio' ? cardioType : undefined,
      loggedExercises: planned.exercises?.map((ex) => ({
        plannedExerciseId: ex.id,
        name: ex.name,
        sets: ex.sets.map((_, i) => ({
          setIndex: i,
          targetReps: ex.sets[i].reps,
          completed: false,
          skipped: false,
        })),
      })),
      loggedIntervals: flat.length ? initialLoggedIntervals(flat) : undefined,
    }
    addLoggedSession(initial)
    setLoggedSession(initial)
    return initial
  }

  function openRunMode() {
    if (!loggedSession) startSession()
    setShowRun(true)
  }

  /** Run Mode finished: store what it timed and complete the session. */
  function handleRunSave(result: RunResult) {
    const log = loggedSession ?? useAppStore.getState().loggedSessions.find((ls) => ls.plannedSessionId === id)
    if (!log) return
    const updates: Partial<LoggedSession> = {
      status: 'complete',
      completedAt: new Date().toISOString(),
      cardioType,
      loggedSteps: result.loggedSteps,
      loggedIntervals: result.loggedIntervals,
      rpe: result.rpe,
      outcome: result.outcome,
      painNotes: result.painNotes,
      generalNotes: result.generalNotes,
    }
    updateLoggedSession(log.id, updates)
    setLoggedSession({ ...log, ...updates })
    syncSession(log.id)
    setShowRun(false)
    // The last session of the week still gets its (optional) invitation.
    if (isLastSession) setShowInvite(true)
    else navigate('/')
  }

  function updateExerciseSet(exerciseIdx: number, setIndex: number, updates: Partial<LoggedExercise['sets'][0]>) {
    if (!loggedSession) return
    const exercises = loggedSession.loggedExercises?.map((ex, i) => {
      if (i !== exerciseIdx) return ex
      return {
        ...ex,
        sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, ...updates } : s)),
      }
    })
    const updated = { ...loggedSession, loggedExercises: exercises }
    setLoggedSession(updated)
    updateLoggedSession(loggedSession.id, { loggedExercises: exercises })
  }

  function completeSet(exerciseIdx: number, setIndex: number, payload?: Partial<LoggedExercise['sets'][0]>) {
    if (!loggedSession || !planned?.exercises) return
    updateExerciseSet(exerciseIdx, setIndex, { completed: true, ...payload })
    // Persist progress to the backend on each completed set so a closed/evicted
    // browser doesn't lose the workout. We push only this one session (not the
    // whole table) and only on completion (not per keystroke) to keep writes
    // tiny — see useAutoSync. Fire-and-forget.
    syncSession(loggedSession.id)
    // Re-ticking a corrected set on an already-finished session shouldn't
    // kick off a rest timer.
    if (existingLog?.status === 'complete') return
    const exercise = planned.exercises[exerciseIdx]
    const restSeconds = exercise?.sets[setIndex]?.restSeconds ?? 90
    if (restSeconds > 0) {
      // On the final set of an exercise, point the rest timer at what's coming
      // up next instead of the set just finished.
      const isLastSet = setIndex === exercise.sets.length - 1
      const nextExercise = planned.exercises[exerciseIdx + 1]
      const label = isLastSet
        ? nextExercise
          ? `Up next: ${nextExercise.name}`
          : 'Last set — finish up'
        : `Up next: ${exercise.name} · set ${setIndex + 2}`
      startTimer(restSeconds, label)
    }
  }

  /** Reopens a completed set so a mistyped rep count or weight can be fixed. */
  function uncompleteSet(exerciseIdx: number, setIndex: number) {
    if (!loggedSession) return
    updateExerciseSet(exerciseIdx, setIndex, { completed: false, actualSeconds: undefined })
    syncSession(loggedSession.id)
  }

  function updateInterval(intervalIdx: number, updates: Partial<LoggedInterval>) {
    if (!loggedSession) return
    const intervals = loggedSession.loggedIntervals?.map((iv, i) =>
      i === intervalIdx ? { ...iv, ...updates } : iv
    )
    const updated = { ...loggedSession, loggedIntervals: intervals }
    setLoggedSession(updated)
    updateLoggedSession(loggedSession.id, { loggedIntervals: intervals })
  }

  function completeInterval(rowIdx: number, updates: Partial<LoggedInterval>) {
    if (!loggedSession) return
    updateInterval(rowIdx, { ...updates, completed: true })
    // Persist progress on each completed interval (see completeSet).
    syncSession(loggedSession.id)
    // Rest timer for the recovery that follows this step in the workout.
    const at = flat.indexOf(rows[rowIdx])
    const rest = flat[at + 1]
    if (existingLog?.status !== 'complete' && rest?.step.role === 'recover' && rest.step.end.by === 'time' && rest.step.end.seconds > 0) {
      const next = flat[at + 2]
      startTimer(rest.step.end.seconds, next ? `Up next: ${stepLabel(next)}` : 'Last one done')
    }
  }

  function handleSessionSave(data: SessionCompleteData) {
    if (!loggedSession) return
    const updates: Partial<LoggedSession> = {
      status: 'complete',
      completedAt: new Date().toISOString(),
      feelings: data.feelings,
      painNotes: data.painNotes || undefined,
      generalNotes: data.generalNotes || undefined,
      outcome: data.outcome,
    }
    updateLoggedSession(loggedSession.id, updates)
    // Push just the finished session in the background — don't await so
    // navigation is instant.
    syncSession(loggedSession.id)
  }

  function handleReflection(weekReflection: WeekReflection) {
    if (!loggedSession) return
    updateLoggedSession(loggedSession.id, { weekReflection })
    syncSession(loggedSession.id)
  }

  function finishAndLeave() {
    setShowComplete(false)
    navigate('/')
  }

  /** "Did something else?" — replaces this session's log with the swap. */
  function handleQuickLog(input: QuickLogInput) {
    if (!planned) return
    const current = useAppStore.getState().loggedSessions.find((ls) => ls.plannedSessionId === planned.id)
    const log = buildQuickLog(input, { planned, weekPlanId: weekPlan?.id, existing: current })
    if (current) updateLoggedSession(current.id, log)
    else addLoggedSession(log)
    setShowQuickLog(false)
    syncSession(log.id)
    navigate('/')
  }

  const isAlreadyComplete = existingLog?.status === 'complete'
  const totalExercises = planned.exercises?.length ?? 0
  const completedExercises = loggedSession?.loggedExercises?.filter((ex) =>
    ex.sets.every((s) => s.completed || s.skipped)
  ).length ?? 0

  const totalIntervals = loggedSession?.loggedIntervals?.length ?? 0
  const completedIntervals = loggedSession?.loggedIntervals?.filter((iv) => iv.completed).length ?? 0

  const progressPercent = planned.type === 'weights'
    ? totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0
    : totalIntervals > 0 ? Math.round((completedIntervals / totalIntervals) * 100) : 0

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <PageHeader
        title={planned.title}
        subtitle={planned.focus}
        onBack={goBack}
        right={<Badge label={planned.intensity} variant={planned.intensity as Intensity} />}
      />

      {/* Progress bar */}
      {loggedSession && (
        <div className="h-1 bg-[#1a1a1a]">
          <div
            className="h-full bg-[#d97756] transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-action-bar">
        {/* Session meta */}
        <div className="px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-[#6a6a6a]">
            <Clock size={13} />
            {formatDuration(planned.estimatedMinutes)}
          </div>
          {planned.type === 'weights' && planned.exercises && (
            <div className="flex items-center gap-1.5 text-xs text-[#6a6a6a]">
              <Dumbbell size={13} />
              {planned.exercises.length} exercises
            </div>
          )}
          {planned.type === 'cardio' && rows.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[#6a6a6a]">
              <Waves size={13} />
              {rows.length} {rows.length === 1 ? 'step' : 'steps'}
            </div>
          )}
          {loggedSession && (
            <span className="ml-auto text-xs font-medium text-[#d97756]">
              {progressPercent}% done
            </span>
          )}
        </div>

        {/* Warmup */}
        {(!!planned.warmup || !!planned.warmupExercises?.length) && (
          <div className="mx-4 mb-4">
            <RoutineCard title="Warmup" summary={planned.warmup} items={planned.warmupExercises} />
          </div>
        )}

        {!loggedSession && !isAlreadyComplete && !(planned.type === 'cardio' && flat.length > 0) && (
          <div className="px-4 py-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-[#d97756]/15 flex items-center justify-center">
              {planned.type === 'weights' ? <Dumbbell size={28} className="text-[#d97756]" /> : <Waves size={28} className="text-[#d97756]" />}
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#f5f5f0]">Ready to train?</p>
              <p className="text-sm text-[#6a6a6a] mt-1">This will start logging your session.</p>
            </div>
            <Button onClick={startSession} size="lg">
              Start Session
            </Button>
            <DidSomethingElse onClick={() => setShowQuickLog(true)} />
          </div>
        )}

        {isAlreadyComplete && (
          <div className="mx-4 mb-4 flex items-center gap-3 bg-emerald-500/10 rounded-2xl px-4 py-3 border border-emerald-500/20">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Session complete</p>
              {existingLog?.feelings && <p className="text-xs text-[#6a6a6a] mt-0.5">Felt {['', 'terrible', 'poor', 'ok', 'good', 'great'][existingLog.feelings]}</p>}
              {existingLog?.substitute && <p className="text-xs text-[#a8a29e] mt-0.5">Did something else: {describeSubstitute(existingLog.substitute)}</p>}
            </div>
          </div>
        )}

        {/* Weights session */}
        {planned.type === 'weights' && loggedSession?.loggedExercises && (
          <div className="px-4 flex flex-col gap-3">
            <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1">Exercises</p>
            {planned.exercises?.map((ex, i) => (
              <ExerciseTile
                key={ex.id}
                planned={ex}
                logged={loggedSession.loggedExercises![i]}
                onUpdateSet={(setIdx, updates) => updateExerciseSet(i, setIdx, updates)}
                onSetComplete={(setIdx, payload) => completeSet(i, setIdx, payload)}
                onSetUncomplete={(setIdx) => uncompleteSet(i, setIdx)}
                isActive={i === activeExerciseIdx}
                onActivate={() => setActiveExerciseIdx(i)}
              />
            ))}
          </div>
        )}

        {/* Cardio session */}
        {planned.type === 'cardio' && (
          <div className="px-4 flex flex-col gap-4">
            {cardioChoices && cardioChoices.length > 1 && (
              <div>
                <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-2">Cardio type</p>
                <div className="flex gap-2 flex-wrap">
                  {cardioChoices.map((type) => (
                    <button
                      key={type}
                      onClick={() => setCardioType(type)}
                      className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
                        cardioType === type
                          ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/25'
                          : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
                      }`}
                    >
                      {cardioLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {flat.length > 0 && <WorkoutCard workout={planned.workout!} modality={cardioType} zones={zones} />}

            {!isAlreadyComplete && flat.length > 0 && (
              <div className="flex flex-col gap-2">
                <Button size="lg" fullWidth onClick={openRunMode}>
                  <Play size={18} />
                  {loggedSession ? 'Open Run Mode' : 'Start Run Mode'}
                </Button>
                {!loggedSession && (
                  <Button variant="secondary" fullWidth onClick={startSession}>
                    Log it by hand instead
                  </Button>
                )}
                {!loggedSession && (
                  <div className="flex justify-center"><DidSomethingElse onClick={() => setShowQuickLog(true)} /></div>
                )}
              </div>
            )}

            {loggedSession && rows.length > 0 && (
              <div>
                <p className="text-xs text-[#4a4a4a] uppercase tracking-widest font-medium px-1 mb-2">Log by hand</p>
                <div className="flex flex-col gap-2">
                  {rows.map((f, i) => (
                    <IntervalRow
                      key={f.path}
                      spec={stepSpec(f, cardioType, zones)}
                      repeatIndex={f.rep ? f.rep.index - 1 : i}
                      cardioType={cardioType}
                      logged={loggedSession.loggedIntervals?.[i]}
                      onUpdate={(updates) => updateInterval(i, updates)}
                      onComplete={(updates) => completeInterval(i, updates)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cooldown */}
        {(!!planned.cooldown || !!planned.cooldownExercises?.length) && loggedSession && (
          <div className="mx-4 mt-4">
            <RoutineCard title="Cooldown" summary={planned.cooldown} items={planned.cooldownExercises} />
          </div>
        )}

        {loggedSession && !isAlreadyComplete && (
          <div className="flex justify-center mt-4">
            <DidSomethingElse onClick={() => setShowQuickLog(true)} />
          </div>
        )}
      </div>

      {/* Bottom action */}
      {loggedSession && !isAlreadyComplete && (
        <FixedLayer>
          <div className="absolute bottom-0 inset-x-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-[#1a1a1a] px-safe pb-safe pt-3">
            {/* Match the content column so the button doesn't stretch across
                landscape phones and iPads (or under the landscape notch). */}
            <div className="max-w-md @3xl/app:max-w-xl @5xl/app:max-w-2xl mx-auto">
              <Button onClick={() => setShowComplete(true)} fullWidth size="lg">
                <CheckCircle2 size={18} />
                Complete Session
              </Button>
            </div>
          </div>
        </FixedLayer>
      )}

      {/* Rest timer overlay */}
      <RestTimerOverlay />

      {/* Complete flow modal */}
      {showComplete && (
        <CompleteFlow
          sessionTitle={planned.title}
          isLastSessionOfWeek={isLastSession}
          onSave={handleSessionSave}
          onReflect={handleReflection}
          onFinish={finishAndLeave}
          onDismiss={() => setShowComplete(false)}
        />
      )}

      {(showInvite) && (
        <CompleteFlow
          sessionTitle={planned.title}
          isLastSessionOfWeek
          initialStep="invite"
          onSave={() => {}}
          onReflect={handleReflection}
          onFinish={finishAndLeave}
          onDismiss={finishAndLeave}
        />
      )}

      {showRun && flat.length > 0 && (
        <RunMode
          title={planned.title}
          flat={flat}
          modality={cardioType}
          zones={zones}
          onSave={handleRunSave}
          onClose={() => setShowRun(false)}
        />
      )}

      {showQuickLog && (
        <QuickLogSheet
          plannedTitle={planned.title}
          defaultMinutes={planned.estimatedMinutes || 45}
          onSave={handleQuickLog}
          onClose={() => setShowQuickLog(false)}
        />
      )}
    </div>
  )
}

/** A workout step as an interval-row spec, pre-filling what the plan fixes. */
function stepSpec(f: FlatStep, modality: CardioType, zones: RunZones | undefined): IntervalRowSpec {
  const { end, effort, target } = f.step
  const meters = end.by === 'distance' ? end.meters : undefined
  const t = target ? { primary: target, secondary: undefined } : resolveTarget(effort, modality, zones, meters)
  return {
    label: stepLabel(f),
    targets: [t.primary, t.secondary].filter((x): x is string => !!x),
    knownMeters: meters,
    knownSeconds: end.by === 'time' ? end.seconds : undefined,
  }
}

function DidSomethingElse({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-[#6a6a6a] hover:text-[#a8a29e] py-2 px-3 rounded-xl"
    >
      <Shuffle size={14} />
      Did something else?
    </button>
  )
}

/** A session logged with no plan behind it ("Log a session"). */
function LoggedActivityView({ log, onBack }: { log: LoggedSession; onBack: () => void }) {
  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <PageHeader title={log.title} subtitle={formatSessionDate(log.date)} onBack={onBack} />
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 bg-emerald-500/10 rounded-2xl px-4 py-3 border border-emerald-500/20">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Logged</p>
            <p className="text-xs text-[#a8a29e] mt-0.5">
              {describeSubstitute(log.substitute!)}{log.rpe ? ` · effort ${log.rpe}/10` : ''}
            </p>
          </div>
        </div>
        {log.generalNotes && <p className="text-sm text-[#a8a29e] px-1">{log.generalNotes}</p>}
      </div>
    </div>
  )
}
