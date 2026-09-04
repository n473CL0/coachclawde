import { useEffect, useRef, useState } from 'react'
import { Check, Play, Square } from 'lucide-react'
import type { LoggedSet, PlannedSet } from '../../types'
import { secondsToDisplay } from '../../lib/dateUtils'

interface SetRowProps {
  setIndex: number
  plannedSet: PlannedSet
  loggedSet: LoggedSet | undefined
  onUpdate: (updates: Partial<LoggedSet>) => void
  onComplete: (payload?: Partial<LoggedSet>) => void
}

export function SetRow(props: SetRowProps) {
  const timed = props.plannedSet.durationSeconds != null
  return timed ? <TimedSetRow {...props} /> : <RepSetRow {...props} />
}

/** Standard reps × weight set. */
function RepSetRow({ setIndex, plannedSet, loggedSet, onUpdate, onComplete }: SetRowProps) {
  const completed = loggedSet?.completed ?? false
  const skipped = loggedSet?.skipped ?? false

  // Keep the raw typed text locally so partial decimals (e.g. "60.") survive —
  // parsing straight to Number on every keystroke would drop the trailing dot.
  const [repsText, setRepsText] = useState(loggedSet?.actualReps?.toString() ?? '')
  const [weightText, setWeightText] = useState(loggedSet?.weightKg?.toString() ?? '')

  return (
    <div className={rowClass(completed, skipped)}>
      <span className="text-xs text-[#4a4a4a] w-6 shrink-0 font-medium">#{setIndex + 1}</span>

      {/* Target */}
      <div className="text-xs text-[#6a6a6a] shrink-0 w-16">
        {plannedSet.reps} reps
        {plannedSet.suggestedWeightKg && (
          <span className="block text-[#4a4a4a]">~{plannedSet.suggestedWeightKg}kg</span>
        )}
      </div>

      {/* Actual reps */}
      <input
        type="text"
        inputMode="numeric"
        placeholder={plannedSet.reps}
        value={repsText}
        onChange={(e) => {
          const raw = e.target.value
          setRepsText(raw)
          const n = Number(raw)
          onUpdate({ actualReps: raw === '' || Number.isNaN(n) ? undefined : n })
        }}
        disabled={completed}
        className="w-14 bg-[#111] border border-[#2a2a2a] rounded-xl px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40"
      />

      {/* Actual weight */}
      <div className="flex items-center flex-1 gap-1">
        <input
          type="text"
          inputMode="decimal"
          placeholder="kg"
          value={weightText}
          onChange={(e) => {
            // Allow digits and a single decimal point only.
            const raw = e.target.value.replace(/[^0-9.]/g, '')
            setWeightText(raw)
            const n = Number(raw)
            onUpdate({ weightKg: raw === '' || Number.isNaN(n) ? undefined : n })
          }}
          disabled={completed}
          className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40"
        />
        <span className="text-xs text-[#4a4a4a] shrink-0">kg</span>
      </div>

      <CompleteButton completed={completed} onClick={() => onComplete()} />
    </div>
  )
}

/** Timed hold (e.g. plank): a stopwatch you stop when you're done. */
function TimedSetRow({ setIndex, plannedSet, loggedSet, onComplete }: SetRowProps) {
  const completed = loggedSet?.completed ?? false
  const skipped = loggedSet?.skipped ?? false
  const target = plannedSet.durationSeconds ?? 0

  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (startRef.current != null) setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => clearInterval(id)
  }, [running])

  function start() {
    startRef.current = Date.now()
    setElapsed(0)
    setRunning(true)
  }

  function stop() {
    const seconds = startRef.current != null ? Math.round((Date.now() - startRef.current) / 1000) : elapsed
    setRunning(false)
    startRef.current = null
    // Record the time and complete in one go so the rest timer kicks in.
    onComplete({ actualSeconds: seconds, completed: true })
  }

  return (
    <div className={rowClass(completed, skipped)}>
      <span className="text-xs text-[#4a4a4a] w-6 shrink-0 font-medium">#{setIndex + 1}</span>

      {/* Target hold — no reps, no weight */}
      <div className="text-xs text-[#6a6a6a] shrink-0 w-16">
        {secondsToDisplay(target)} hold
      </div>

      {/* Live stopwatch / recorded time */}
      <div className="flex-1 text-center">
        {completed ? (
          <span className="text-sm font-semibold text-emerald-400 tabular-nums">
            {secondsToDisplay(loggedSet?.actualSeconds ?? target)}
          </span>
        ) : running ? (
          <span className="text-base font-bold text-[#d97756] tabular-nums">{secondsToDisplay(elapsed)}</span>
        ) : (
          <span className="text-xs text-[#4a4a4a]">Tap start to begin</span>
        )}
      </div>

      {/* Start / Stop */}
      {completed ? (
        <CompleteButton completed onClick={() => {}} />
      ) : running ? (
        <button
          onClick={stop}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#d97756] text-white text-xs font-semibold transition-all active:scale-95 shrink-0"
        >
          <Square size={13} strokeWidth={2.5} fill="currentColor" />
          Stop
        </button>
      ) : (
        <button
          onClick={start}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#2a2a2a] text-[#d97756] text-xs font-semibold transition-all hover:bg-[#d97756]/20 active:scale-95 shrink-0"
        >
          <Play size={13} strokeWidth={2.5} fill="currentColor" />
          Start
        </button>
      )}
    </div>
  )
}

function rowClass(completed: boolean, skipped: boolean): string {
  return `flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-all ${
    completed
      ? 'bg-emerald-500/8 border border-emerald-500/15'
      : skipped
      ? 'bg-[#1a1a1a] opacity-50'
      : 'bg-[#1a1a1a] border border-[#2a2a2a]'
  }`
}

function CompleteButton({ completed, onClick }: { completed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={completed}
      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
        completed
          ? 'bg-emerald-500 text-white'
          : 'bg-[#2a2a2a] text-[#4a4a4a] hover:bg-[#d97756]/20 hover:text-[#d97756] active:scale-90'
      }`}
    >
      <Check size={14} strokeWidth={2.5} />
    </button>
  )
}
