import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Pause, Play, Plus, SkipForward, Trash2, Volume2, X } from 'lucide-react'
import type { CardioType, LoggedInterval, LoggedStep, SessionOutcome } from '../../types'
import { FixedLayer } from '../layout/FixedLayer'
import { Button } from '../shared/Button'
import { ClaudeMark } from '../shared/ClaudeMark'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { DurationStepper } from '../shared/Stepper'
import { WorkoutStrip } from './WorkoutStrip'
import { RpePicker } from './QuickLogSheet'
import { EFFORT_COLOR, EFFORT_LABEL } from './effortStyle'
import { combine, playEarcon, scheduleEarcon, unlockAudio, type CueHandle } from '../../lib/audioCues'
import { planCues, stepDuration } from '../../lib/runEngine'
import {
  expectedSeconds, formatStepDuration, loggableSteps, runLogToIntervals, stepLabel, stepPosition,
  workoutStrip, type FlatStep,
} from '../../lib/workout'
import { describeDistance, resolveTarget, type RunZones } from '../../lib/zones'
import { computeSplit, distanceToMeters, distanceUnit, formatClock, metersToDistance } from '../../lib/cardioUtils'
import { useWakeLock } from '../../hooks/useWakeLock'
import { markRunTourSeen, runTourSeen } from '../../lib/tutorials'

export interface RunResult {
  loggedSteps: LoggedStep[]
  loggedIntervals: LoggedInterval[]
  rpe?: number
  outcome: SessionOutcome
  painNotes?: string
  generalNotes?: string
}

type Phase = 'check' | 'tour' | 'running' | 'paused' | 'review'

/**
 * Run Mode: plays a structured workout. It times every step, plays a tone at
 * each change (scheduled on the audio clock, see lib/runEngine), takes LAP
 * for distance reps, keeps the screen on, and ends with a pre-filled review
 * so saving is one tap (or discarding, which closes without saving).
 * Screen-on only: cues with the phone locked are a later phase. The first
 * interval session gets Clawde's tour of LAP and Lock before the clock starts.
 */
export function RunMode({
  title, flat, modality, zones, onSave, onDiscard, onClose,
}: {
  title: string
  flat: FlatStep[]
  modality: CardioType
  zones?: RunZones
  onSave: (result: RunResult) => void
  /** Leave from the review without saving anything. */
  onDiscard: () => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('check')
  const [idx, setIdx] = useState(0)
  const [, setTick] = useState(0)
  const [locked, setLocked] = useState(false)
  const [records, setRecords] = useState<LoggedStep[]>([])
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  // Intervals are where LAP and Lock matter, so that's when the tour shows.
  const [tourFirst] = useState(() => flat.some((f) => f.rep) && !runTourSeen())

  // Timing lives in refs: performance.now() milliseconds.
  const idxRef = useRef(0)
  const stepStart = useRef(0)
  const cycleStart = useRef(0)
  const sessionStart = useRef(0)
  const pausedTotal = useRef(0)
  const pauseAt = useRef<number | null>(null)
  const extra = useRef(0)
  const plannedThrough = useRef(-1)
  const cues = useRef<CueHandle | null>(null)
  const recs = useRef<LoggedStep[]>([])

  useWakeLock(phase === 'running' || phase === 'paused')

  const segments = useMemo(() => workoutStrip(flat, modality, zones), [flat, modality, zones])
  const total = useMemo(() => segments.reduce((t, s) => t + s.seconds, 0), [segments])

  const nowMs = () => pauseAt.current ?? performance.now()
  const elapsed = () => (nowMs() - stepStart.current) / 1000

  const currentDuration = useCallback(
    (i: number) => {
      const f = flat[i]
      if (!f) return null
      // For a cycle rest, the cycle clock as of this step's start.
      const cycleAtStepStart = (stepStart.current - cycleStart.current) / 1000
      return stepDuration(f, { extraSeconds: extra.current, cycleElapsed: cycleAtStepStart })
    },
    [flat],
  )

  const replan = useCallback(() => {
    cues.current?.cancel()
    const now = pauseAt.current ?? performance.now()
    const { cues: planned, throughIndex } = planCues(flat, idxRef.current, (now - stepStart.current) / 1000, {
      modality, zones, extraSeconds: extra.current, cycleElapsed: (now - cycleStart.current) / 1000,
    })
    cues.current = combine(planned.map((c) => scheduleEarcon(c.earcon, c.delay)))
    plannedThrough.current = throughIndex
  }, [flat, modality, zones])

  const finish = useCallback(() => {
    // A step that ended on its own timer already had the chord queued.
    if (recs.current.at(-1)?.endedBy !== 'time') {
      cues.current?.cancel()
      playEarcon('done')
    }
    setRecords([...recs.current])
    setPhase('review')
  }, [])

  /** Ends the current step and moves on. `at` is when it ended (ms). */
  const advance = useCallback(
    (endedBy: LoggedStep['endedBy'], at: number) => {
      const i = idxRef.current
      const f = flat[i]
      if (!f) return
      const seconds = Math.max(0, (at - stepStart.current) / 1000)
      recs.current.push({
        path: f.path,
        role: f.step.role,
        startedAt: new Date(Date.now() - (performance.now() - stepStart.current)).toISOString(),
        seconds: Math.round(seconds * 10) / 10,
        ...(endedBy === 'lap' && f.step.end.by === 'distance' ? { meters: f.step.end.meters } : {}),
        endedBy,
      })
      const next = i + 1
      idxRef.current = next
      stepStart.current = at
      extra.current = 0
      if (flat[next]?.cycleStart) cycleStart.current = at
      setIdx(next)
      if (next >= flat.length) {
        finish()
        return
      }
      // Timed steps already had their cues queued; re-plan after a tap or
      // once we pass the last planned step.
      if (endedBy !== 'time' || next > plannedThrough.current) replan()
    },
    [flat, finish, replan],
  )

  // The display clock, and ending timed steps. Each step's end is chained from
  // its start (not from when the timer noticed), so the clock never drifts
  // from the audio cues even when this interval is throttled.
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      let guard = 0
      while (idxRef.current < flat.length && guard++ < flat.length) {
        const d = currentDuration(idxRef.current)
        if (d == null || elapsed() < d) break
        advance('time', stepStart.current + d * 1000)
      }
      setTick((t) => t + 1)
    }, 200)
    return () => clearInterval(id)
    // elapsed reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, flat.length, advance, currentDuration])

  useEffect(() => () => cues.current?.cancel(), [])

  const step = flat[idx]
  const lapStep = !!step && step.step.end.by !== 'time'

  function start() {
    unlockAudio()
    const t = performance.now()
    sessionStart.current = t
    stepStart.current = t
    cycleStart.current = t
    pauseAt.current = null
    pausedTotal.current = 0
    idxRef.current = 0
    recs.current = []
    setIdx(0)
    setPhase('running')
    replan()
  }

  /** Shows the first step, clock frozen, with Clawde's tour over it. */
  function beginTour() {
    const t = performance.now()
    sessionStart.current = t
    stepStart.current = t
    cycleStart.current = t
    pauseAt.current = t
    idxRef.current = 0
    setIdx(0)
    setTourStep(0)
    setPhase('tour')
  }

  function endTour() {
    markRunTourSeen()
    start()
  }

  const lap = useCallback(() => {
    if (phase !== 'running' || !lapStep) return
    advance('lap', performance.now())
  }, [phase, lapStep, advance])

  function skip() {
    if (phase === 'paused') resume()
    advance('skip', performance.now())
  }

  function pause() {
    pauseAt.current = performance.now()
    cues.current?.cancel()
    setPhase('paused')
  }

  function resume() {
    if (pauseAt.current == null) return
    const delta = performance.now() - pauseAt.current
    pauseAt.current = null
    stepStart.current += delta
    cycleStart.current += delta
    pausedTotal.current += delta
    unlockAudio()
    setPhase('running')
    replan()
  }

  function plus30() {
    extra.current += 30
    replan()
  }

  function endNow() {
    setConfirmEnd(false)
    if (pauseAt.current != null) resume()
    cues.current?.cancel()
    const i = idxRef.current
    if (i < flat.length && elapsed() > 5) {
      recs.current.push({
        path: flat[i].path, role: flat[i].step.role, startedAt: new Date().toISOString(),
        seconds: Math.round(elapsed()), endedBy: 'skip',
      })
    }
    setRecords([...recs.current])
    setPhase('review')
  }

  // Keyboard LAP (Space or L) for desktop and Bluetooth keyboards.
  useEffect(() => {
    if (phase !== 'running') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key.toLowerCase() === 'l') {
        e.preventDefault()
        lap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, lap])

  if (phase === 'review') {
    return (
      <Shell>
        <RunReview flat={flat} records={records} modality={modality} zones={zones} title={title} onSave={onSave} onDiscard={onDiscard} />
      </Shell>
    )
  }

  if (phase === 'check') {
    return (
      <Shell>
        <div className="flex-1 flex flex-col px-5 pt-safe pb-edge">
          <div className="flex justify-end pt-3">
            <CloseButton onClick={onClose} />
          </div>
          <div className="flex-1 flex flex-col justify-center gap-5">
            <div>
              <p className="text-xs text-[#d97756] uppercase tracking-widest font-semibold">Run Mode</p>
              <h2 className="text-2xl font-bold text-[#f5f5f0] mt-1">{title}</h2>
            </div>
            <div className="rounded-3xl bg-[#161616] border border-[#2a2a2a] p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-[#f5f5f0]">Sound check</p>
              <p className="text-sm text-[#a8a29e] leading-relaxed">
                Tap below. You should hear a rising three-note tone: that's <b className="text-[#f5f5f0]">Go</b>.
                Falling means recover, and three pips mean a change is coming.
              </p>
              <Button variant="secondary" onClick={() => { unlockAudio(); playEarcon('go') }}>
                <Volume2 size={18} /> Play the Go tone
              </Button>
              <p className="text-xs text-[#6a6a6a] leading-relaxed">
                Can't hear it? Turn the volume up. On iPhone, Silent mode mutes the cues, so flip the switch off.
                Your music keeps playing; cues sound over it.
              </p>
            </div>
            <p className="text-xs text-[#6a6a6a] leading-relaxed">
              The screen stays on while Run Mode is open. Keep the app in front: cues stop if you lock the phone or
              switch apps, so use the <b className="text-[#a8a29e]">Lock</b> button in Run Mode instead.
            </p>
            {!tourFirst && (
              <button onClick={beginTour} className="self-start text-xs font-semibold text-[#d97756] hover:text-[#e58a6b] -my-1 py-1">
                Show me how LAP and Lock work
              </button>
            )}
          </div>
          <Button size="lg" fullWidth onClick={tourFirst ? beginTour : start}>
            <Play size={18} /> Start
          </Button>
        </div>
      </Shell>
    )
  }

  if (!step) return null

  const d = currentDuration(idx)
  const e = Math.max(0, elapsed())
  const clock = d != null ? formatClock(Math.ceil(Math.max(0, d - e))) : formatClock(Math.floor(e))
  const exp = expectedSeconds(step, modality, zones)
  const doneSeconds = segments.slice(0, idx).reduce((t, s) => t + s.seconds, 0) + Math.min(e, exp)
  const sessionClock = formatClock(Math.max(0, (nowMs() - sessionStart.current - pausedTotal.current) / 1000))
  const next = flat[idx + 1]
  const color = EFFORT_COLOR[step.step.effort]
  const meters = step.step.end.by === 'distance' ? step.step.end.meters : undefined
  const demoLap = phase === 'tour' && tourStep === 0
  const showLap = lapStep || demoLap
  const target = step.step.target
    ? { primary: step.step.target, secondary: undefined as string | undefined }
    : resolveTarget(step.step.effort, modality, zones, meters)

  return (
    <Shell>
      <div className="flex-1 flex flex-col px-5 pt-safe pb-edge gap-2 min-h-0">
        <div className="h-1.5 rounded-full mt-3 shrink-0" style={{ background: color }} />
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#a8a29e] tabular-nums">
          <span>{stepPosition(step)}</span>
          <span className="flex items-center gap-3">
            {sessionClock}
            <button onClick={() => setConfirmEnd(true)} aria-label="End session" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-[#6a6a6a] hover:text-[#f5f5f0]">
              <X size={18} />
            </button>
          </span>
        </div>

        <h2 className="text-3xl font-extrabold uppercase leading-tight text-[#f5f5f0]">
          {step.step.role === 'recover'
            ? `${d != null ? formatStepDuration(Math.round(d)) : ''} ${step.step.recovery ?? 'rest'}`.trim()
            : meters ? describeDistance(meters)
              : step.step.end.by === 'time' ? `${formatStepDuration(step.step.end.seconds)} ${step.step.effort}`
                : 'Until LAP'}
        </h2>
        <p className="text-sm text-[#a8a29e]">
          <span style={{ color }} className="font-semibold">{EFFORT_LABEL[step.step.effort]}</span>
          {step.step.role !== 'recover' && <> · {target.primary}{target.secondary ? ` · ${target.secondary}` : ''}</>}
        </p>
        {step.step.cue && <p className="text-sm text-[#e5e5e0]">“{step.step.cue}”</p>}

        <p className={`text-7xl short:text-6xl font-bold text-center tabular-nums tracking-tight my-2 ${phase === 'paused' ? 'text-[#6a6a6a]' : 'text-[#f5f5f0]'}`} aria-live="off">
          {clock}
        </p>
        {phase === 'paused' && <p className="text-center text-xs uppercase tracking-widest text-[#d97756] -mt-2">Paused</p>}

        <p className="text-sm text-[#e5e5e0] flex gap-2">
          <b className="text-2xs tracking-widest text-[#6a6a6a] pt-0.5">NEXT</b>
          {next ? stepLabel(next) : 'Finish'}
        </p>
        <WorkoutStrip segments={segments} progress={total ? doneSeconds / total : 0} />

        <button
          onClick={lap}
          disabled={!lapStep || phase !== 'running'}
          className={`mt-auto shrink-0 h-28 short:h-20 rounded-3xl font-extrabold transition-transform active:scale-[0.98] ${
            showLap
              ? 'bg-[#d97756] text-white text-3xl tracking-[0.14em] shadow-lg shadow-[#d97756]/25'
              : 'bg-[#161616] text-[#6a6a6a] text-sm tracking-normal font-semibold border border-[#2a2a2a]'
          } ${demoLap ? 'relative z-40 ring-4 ring-[#d97756]/40 ring-offset-4 ring-offset-[#0a0a0a]' : ''}`}
        >
          {showLap ? 'LAP' : 'Ends by itself · no tap needed'}
        </button>

        <div className="flex justify-around shrink-0">
          {phase === 'paused' ? (
            <Tool onClick={resume} icon={<Play size={16} />} label="Resume" />
          ) : (
            <Tool onClick={pause} icon={<Pause size={16} />} label="Pause" />
          )}
          <Tool onClick={skip} icon={<SkipForward size={16} />} label="Skip" />
          {step.step.role === 'recover' && d != null && phase === 'running' && (
            <Tool onClick={plus30} icon={<Plus size={16} />} label="30 s" />
          )}
          <Tool onClick={() => setLocked(true)} icon={<Lock size={16} />} label="Lock" highlight={phase === 'tour' && tourStep === 1} />
        </div>
      </div>

      {locked && <PocketScreen onUnlock={() => setLocked(false)} />}

      {phase === 'tour' && (
        <RunTour step={tourStep} onStep={setTourStep} onDone={endTour} />
      )}

      {confirmEnd && (
        <div className="absolute inset-0 z-10 bg-black/80 flex items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-3xl bg-[#111] border border-[#2a2a2a] p-5 flex flex-col gap-3">
            <p className="text-base font-semibold text-[#f5f5f0]">End the session here?</p>
            <p className="text-sm text-[#a8a29e]">You'll review what you've done so far before saving.</p>
            <Button onClick={endNow} fullWidth>End and review</Button>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)} fullWidth>Keep going</Button>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <FixedLayer>
      <div className="absolute inset-0 z-50 bg-[#0a0a0a] flex flex-col overflow-y-auto" role="dialog" aria-modal="true" aria-label="Run Mode">
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col relative min-h-0">{children}</div>
      </div>
    </FixedLayer>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Close Run Mode" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-[#6a6a6a] hover:text-[#f5f5f0] hover:bg-[#1a1a1a]">
      <X size={20} />
    </button>
  )
}

function Tool({ onClick, icon, label, highlight }: { onClick: () => void; icon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-sm py-2.5 px-3 rounded-xl hover:bg-[#1a1a1a] ${
        highlight ? 'relative z-40 bg-[#1a1a1a] text-[#f5f5f0] ring-2 ring-[#d97756]' : 'text-[#a8a29e] hover:text-[#f5f5f0]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

const TOUR = [
  {
    title: 'This is your LAP button',
    body: 'When a rep ends at a distance it turns orange, like now. Tap it as you pass the mark and I\'ll start the next step. Timed reps end by themselves: just listen for the tone.',
    tip: 'Got a keyboard? Space or L works too.',
  },
  {
    title: 'Don\'t lock your phone. Tap Lock.',
    body: 'If the phone locks or you switch apps, my tones stop. Lock blacks out the screen and ignores pocket taps instead, so your music keeps playing and my tones play over it.',
    tip: 'Slide the bar along to unlock when you need me.',
  },
]

/**
 * Clawde's first-interval tour, over the frozen first step. The highlighted
 * control is lifted above the dimmed backdrop (z-40 over this z-30 layer).
 */
function RunTour({ step, onStep, onDone }: { step: number; onStep: (n: number) => void; onDone: () => void }) {
  const s = TOUR[step]
  const last = step === TOUR.length - 1
  return (
    <div className="absolute inset-0 z-30 bg-black/70 px-5 pt-safe" role="dialog" aria-modal="true" aria-label="How Run Mode works">
      <div className="mt-6 rounded-3xl bg-[#161616] border border-[#2a2a2a] p-4 flex flex-col gap-3 fade-in" key={step}>
        <div className="flex items-start gap-3">
          <ClaudeMark size={44} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-2xs font-semibold text-[#d97756] uppercase tracking-widest">
              Clawde's tip · {step + 1} of {TOUR.length}
            </p>
            <p className="text-base font-semibold text-[#f5f5f0] mt-0.5 leading-snug">{s.title}</p>
          </div>
        </div>
        <p className="text-sm text-[#e5e5e0] leading-relaxed">{s.body}</p>
        <p className="text-xs text-[#6a6a6a] leading-relaxed">{s.tip}</p>
        <div className="flex gap-2 pt-1">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => onStep(step - 1)} fullWidth>Back</Button>
          ) : (
            <Button variant="ghost" onClick={onDone} fullWidth>Skip</Button>
          )}
          <Button onClick={last ? onDone : () => onStep(step + 1)} fullWidth>
            {last ? <><Play size={16} /> Start</> : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * A black screen (cheap on OLED) that ignores touches, for running with the
 * phone in a pocket. The screen stays on and cues keep playing. Slide to unlock.
 */
function PocketScreen({ onUnlock }: { onUnlock: () => void }) {
  const [v, setV] = useState(0)
  return (
    <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-end gap-3 px-8 pb-edge" style={{ touchAction: 'none' }}>
      <p className="text-xs text-[#3a3a3a] text-center">Pocket screen: touches are ignored. Cues keep coming.</p>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        aria-label="Slide to unlock"
        onChange={(e) => {
          const n = Number(e.target.value)
          setV(n)
          if (n >= 96) onUnlock()
        }}
        onPointerUp={() => setV(0)}
        className="w-full accent-[#333]"
      />
      <p className="text-xs text-[#3a3a3a] mb-4">Slide to unlock</p>
    </div>
  )
}

// --- review --------------------------------------------------------------------

/**
 * After Run Mode: every rep pre-filled from what was timed. Saving is one
 * tap; editing is only for what changed (min/sec steppers, not free text).
 */
function RunReview({
  flat, records, modality, zones, title, onSave, onDiscard,
}: {
  flat: FlatStep[]
  records: LoggedStep[]
  modality: CardioType
  zones?: RunZones
  title: string
  onSave: (r: RunResult) => void
  onDiscard: () => void
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [rows, setRows] = useState<LoggedInterval[]>(() => runLogToIntervals(flat, records))
  const [rpe, setRpe] = useState<number | undefined>()
  const [outcome, setOutcome] = useState<SessionOutcome>('as-planned')
  const [pain, setPain] = useState('')
  const [notes, setNotes] = useState('')
  const loggable = useMemo(() => loggableSteps(flat), [flat])
  const unit = distanceUnit(modality)
  const minutes = Math.round(records.reduce((t, r) => t + r.seconds, 0) / 60)

  function update(i: number, patch: Partial<LoggedInterval>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-safe pb-edge gap-4">
      <div className="pt-4 px-1">
        <p className="text-xs text-[#d97756] uppercase tracking-widest font-semibold">Session complete · {minutes} min</p>
        <h2 className="text-2xl font-bold text-[#f5f5f0] mt-1">Check and save</h2>
        <p className="text-sm text-[#6a6a6a] mt-0.5">{title}. Everything's filled in from the timer; fix only what changed.</p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const f = loggable[i]
          const planMeters = f?.step.end.by === 'distance' ? f.step.end.meters : undefined
          const t = f ? resolveTarget(f.step.effort, modality, zones, planMeters) : null
          const split = computeSplit(modality, row.actualDistanceMeters, row.actualSeconds)
          return (
            <div key={row.stepPath ?? i} className={`rounded-2xl border px-4 py-3 [--nest-radius:1rem] ${row.completed ? 'bg-[#161616] border-[#2a2a2a]' : 'bg-[#111] border-[#1f1f1f] opacity-70'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[#f5f5f0]">
                  {f ? stepLabel(f) : row.label}{f?.rep ? ` · ${f.rep.index}/${f.rep.of}` : ''}
                </p>
                <p className="text-xs text-[#6a6a6a] text-right">
                  {f?.step.target ?? (planMeters && t?.secondary ? t.secondary : f?.step.end.by === 'time' ? formatClock(f.step.end.seconds) : '')}
                </p>
              </div>
              {!row.completed && <p className="text-2xs text-[#6a6a6a] mt-0.5">Skipped. Add a time if you did it.</p>}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mt-2">
                <DurationStepper
                  seconds={row.actualSeconds ?? 0}
                  onChange={(s) => update(i, { actualSeconds: s || undefined, actualTime: s ? formatClock(s) : undefined, completed: s > 0 })}
                />
                <div className="flex items-center gap-1 w-24">
                  <input
                    inputMode="decimal"
                    placeholder="dist"
                    aria-label={`Distance in ${unit}`}
                    defaultValue={row.actualDistanceMeters ? String(Math.round(metersToDistance(modality, row.actualDistanceMeters) * 100) / 100) : ''}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ''))
                      update(i, { actualDistanceMeters: n > 0 ? distanceToMeters(modality, n) : undefined })
                    }}
                    className="w-full min-w-0 bg-[#0a0a0a] border border-[#2a2a2a] rounded-nested px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50"
                  />
                  <span className="text-xs text-[#4a4a4a]">{unit}</span>
                </div>
                {split && <span className="ml-auto text-xs font-semibold text-[#d97756] tabular-nums">{split}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-3xl bg-[#161616] border border-[#2a2a2a] p-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-[#a8a29e] mb-2">How hard was it overall? (1–10)</p>
          <RpePicker value={rpe} onChange={setRpe} />
        </div>
        <div>
          <p className="text-sm font-medium text-[#a8a29e] mb-2">Did it go to plan?</p>
          <div className="grid grid-cols-2 gap-2">
            {([['as-planned', 'As planned'], ['modified', 'Changed it']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setOutcome(v)}
                aria-pressed={outcome === v}
                className={`py-2.5 rounded-2xl text-sm font-medium ${outcome === v ? 'bg-[#d97756] text-white' : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={pain}
          onChange={(e) => setPain(e.target.value)}
          rows={1}
          placeholder="Any pain or discomfort? (optional)"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#4a4a4a] resize-none focus:outline-none focus:border-[#d97756]/50"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={1}
          placeholder={outcome === 'modified' ? 'What changed? (Claude reads this)' : 'Anything else? (optional)'}
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#4a4a4a] resize-none focus:outline-none focus:border-[#d97756]/50"
        />
      </div>

      <Button
        size="lg"
        fullWidth
        onClick={() => onSave({
          loggedSteps: records,
          loggedIntervals: rows,
          rpe,
          outcome,
          painNotes: pain.trim() || undefined,
          generalNotes: notes.trim() || undefined,
        })}
      >
        Save session
      </Button>
      <Button variant="ghost" fullWidth onClick={() => setConfirmDiscard(true)} className="-mt-2">
        Don't save
      </Button>

      {confirmDiscard && (
        <ConfirmDialog
          icon={<Trash2 size={18} />}
          title="Discard this run?"
          confirmLabel="Discard"
          cancelLabel="Keep it"
          onConfirm={onDiscard}
          onCancel={() => setConfirmDiscard(false)}
        >
          Nothing from this run will be saved, and the session stays open to do again.
        </ConfirmDialog>
      )}
    </div>
  )
}
