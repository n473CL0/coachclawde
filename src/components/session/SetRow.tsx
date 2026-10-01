import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Play, Square, TriangleAlert } from 'lucide-react'
import type { LoggedSet, PlannedSet } from '../../types'
import { secondsToDisplay } from '../../lib/dateUtils'
import { ConfirmDialog } from '../shared/ConfirmDialog'

interface SetRowProps {
  setIndex: number
  plannedSet: PlannedSet
  loggedSet: LoggedSet | undefined
  onUpdate: (updates: Partial<LoggedSet>) => void
  onComplete: (payload?: Partial<LoggedSet>) => void
  /** Reopen a completed set so its reps/weight/time can be corrected. */
  onUncomplete: () => void
}

export function SetRow(props: SetRowProps) {
  const timed = props.plannedSet.durationSeconds != null
  return timed ? <TimedSetRow {...props} /> : <RepSetRow {...props} />
}

/** Standard reps × weight set. */
function RepSetRow({ setIndex, plannedSet, loggedSet, onUpdate, onComplete, onUncomplete }: SetRowProps) {
  const completed = loggedSet?.completed ?? false
  const skipped = loggedSet?.skipped ?? false
  const [confirm, setConfirm] = useState<'empty' | 'edit' | null>(null)

  // Keep the raw typed text locally so partial decimals (e.g. "60.") survive —
  // parsing straight to Number on every keystroke would drop the trailing dot.
  const [repsText, setRepsText] = useState(loggedSet?.actualReps?.toString() ?? '')
  const [weightText, setWeightText] = useState(loggedSet?.weightKg?.toString() ?? '')
  const weightRef = useRef<HTMLInputElement>(null)

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
      <RowBreak />

      {/* Actual reps */}
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="next"
        onKeyDown={(e) => { if (e.key === 'Enter') weightRef.current?.focus() }}
        placeholder={plannedSet.reps}
        value={repsText}
        onChange={(e) => {
          const raw = e.target.value
          setRepsText(raw)
          const n = Number(raw)
          onUpdate({ actualReps: raw === '' || Number.isNaN(n) ? undefined : n })
        }}
        disabled={completed}
        className="w-14 @max-[17rem]:w-11 @max-[17rem]:px-1 bg-[#111] border border-[#2a2a2a] rounded-nested px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40"
      />

      {/* Actual weight */}
      <div className="flex items-center flex-1 min-w-0 @max-[17rem]:basis-0 gap-1">
        <input
          type="text"
          ref={weightRef}
          inputMode="decimal"
          enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
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
          className="w-full bg-[#111] border border-[#2a2a2a] rounded-nested px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40"
        />
        <span className="text-xs text-[#4a4a4a] shrink-0">kg</span>
      </div>

      <CompleteButton
        completed={completed}
        onClick={() => {
          // An empty-reps tick is usually a mis-tap; ticking a done set means
          // the athlete wants to fix it. Both ask first.
          if (completed) setConfirm('edit')
          else if (repsText.trim() === '') setConfirm('empty')
          else onComplete()
        }}
      />

      {confirm === 'empty' && (
        <ConfirmDialog
          icon={<TriangleAlert size={20} />}
          title="No reps entered"
          confirmLabel="Mark done"
          onConfirm={() => { setConfirm(null); onComplete() }}
          onCancel={() => setConfirm(null)}
        >
          You haven't entered any reps for set {setIndex + 1}. Mark it done anyway?
        </ConfirmDialog>
      )}
      {confirm === 'edit' && (
        <EditSetDialog
          setIndex={setIndex}
          onConfirm={() => { setConfirm(null); onUncomplete() }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

/** Timed hold (e.g. plank): a stopwatch you stop when you're done. */
function TimedSetRow({ setIndex, plannedSet, loggedSet, onComplete, onUncomplete }: SetRowProps) {
  const completed = loggedSet?.completed ?? false
  const skipped = loggedSet?.skipped ?? false
  const target = plannedSet.durationSeconds ?? 0
  const [confirmEdit, setConfirmEdit] = useState(false)

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
      <RowBreak />

      {/* Live stopwatch / recorded time */}
      <div className="flex-1 min-w-0 @max-[17rem]:basis-0 text-center">
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
        <CompleteButton completed onClick={() => setConfirmEdit(true)} />
      ) : running ? (
        <button
          onClick={stop}
          className="flex items-center gap-1.5 h-8 px-3 rounded-nested bg-[#d97756] text-white text-xs font-semibold transition-all active:scale-95 shrink-0"
        >
          <Square size={13} strokeWidth={2.5} fill="currentColor" />
          Stop
        </button>
      ) : (
        <button
          onClick={start}
          className="flex items-center gap-1.5 h-8 px-3 rounded-nested bg-[#2a2a2a] text-[#d97756] text-xs font-semibold transition-all hover:bg-[#d97756]/20 active:scale-95 shrink-0"
        >
          <Play size={13} strokeWidth={2.5} fill="currentColor" />
          Start
        </button>
      )}

      {confirmEdit && (
        <EditSetDialog
          setIndex={setIndex}
          timed
          onConfirm={() => { setConfirmEdit(false); setElapsed(0); onUncomplete() }}
          onCancel={() => setConfirmEdit(false)}
        />
      )}
    </div>
  )
}

function EditSetDialog({
  setIndex, timed, onConfirm, onCancel,
}: { setIndex: number; timed?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      icon={<Pencil size={20} />}
      title={`Edit set ${setIndex + 1}?`}
      confirmLabel="Reopen set"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {timed
        ? 'This reopens the set so you can redo the hold.'
        : 'This reopens the set so you can fix the reps or weight, then tick it again.'}
    </ConfirmDialog>
  )
}

function rowClass(completed: boolean, skipped: boolean): string {
  // Rows sit 1rem inside a 2rem-radius tile, so their corners are 1rem
  // (concentric). They then declare their own radius/inset so the inputs and
  // tick ~0.625rem inside pick up the remainder via rounded-nested.
  return `flex items-center @max-[17rem]:flex-wrap gap-2 rounded-2xl [--nest-radius:1rem] [--nest-inset:0.625rem] px-3 py-2.5 transition-all ${
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
      aria-label={completed ? 'Edit completed set' : 'Complete set'}
      className={`w-8 h-8 rounded-nested flex items-center justify-center transition-all shrink-0 ${
        completed
          ? 'bg-emerald-500 text-white active:scale-90'
          : 'bg-[#2a2a2a] text-[#4a4a4a] hover:bg-[#d97756]/20 hover:text-[#d97756] active:scale-90'
      }`}
    >
      <Check size="0.875em" strokeWidth={2.5} />
    </button>
  )
}

/**
 * Line break used when large text leaves the row too narrow for one line
 * (the set list is a size container; 17rem tracks the text size, so this only
 * kicks in when the athlete's text setting is large). The set number and
 * target sit on the first line, the inputs and tick on the second.
 */
function RowBreak() {
  return <span aria-hidden className="hidden @max-[17rem]:block basis-full h-0" />
}
