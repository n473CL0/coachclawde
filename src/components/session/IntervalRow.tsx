import { useState } from 'react'
import { Check } from 'lucide-react'
import type { CardioType, LoggedInterval } from '../../types'
import { DurationStepper } from '../shared/Stepper'
import {
  computeSplit,
  distanceToMeters,
  distanceUnit,
  formatClock,
  metersToDistance,
} from '../../lib/cardioUtils'

/** What a row needs to know about the planned piece. */
export interface IntervalRowSpec {
  label: string
  /** Short target lines, e.g. "Target: 800 m", "Pace: 4:45/km". */
  targets: string[]
  /** The plan already fixes the time (a time-ended rep). */
  knownSeconds?: number
  /** The plan already fixes the distance (a distance-ended rep). */
  knownMeters?: number
}

interface IntervalRowProps {
  spec: IntervalRowSpec
  repeatIndex: number
  cardioType: CardioType
  logged: LoggedInterval | undefined
  onUpdate: (updates: Partial<LoggedInterval>) => void
  /** Ticks the row, with the values shown (pre-filled ones included). */
  onComplete: (updates: Partial<LoggedInterval>) => void
}

/** "You record: …" — tells the athlete which number is theirs to enter. */
function recordHint(spec: Pick<IntervalRowSpec, 'knownSeconds' | 'knownMeters'>): string {
  if (spec.knownSeconds && spec.knownMeters) return 'Pre-filled from the plan. Adjust if it differed.'
  if (spec.knownSeconds) return 'Time is set by the plan. You record: distance, if you know it.'
  if (spec.knownMeters) return 'Distance is set by the plan. You record: your time.'
  return 'You record: distance and time.'
}

/**
 * One cardio piece. The number the plan already knows is pre-filled (the time
 * of a 3-minute rep, the distance of an 800 m rep), so the athlete only enters
 * the other one. Time uses min/sec steppers rather than free-text "mm:ss".
 */
export function IntervalRow({ spec, repeatIndex, cardioType, logged, onUpdate, onComplete }: IntervalRowProps) {
  const completed = logged?.completed ?? false
  const unit = distanceUnit(cardioType)

  const initialMeters = logged?.actualDistanceMeters ?? spec.knownMeters
  const [distText, setDistText] = useState(
    initialMeters != null ? String(Math.round(metersToDistance(cardioType, initialMeters) * 100) / 100) : ''
  )
  const [seconds, setSeconds] = useState<number>(logged?.actualSeconds ?? spec.knownSeconds ?? 0)

  const meters = distText !== '' && !Number.isNaN(Number(distText)) && Number(distText) > 0
    ? distanceToMeters(cardioType, Number(distText))
    : undefined
  const split = computeSplit(cardioType, meters, seconds || undefined)

  function values(nextMeters: number | undefined, nextSeconds: number): Partial<LoggedInterval> {
    return {
      actualDistanceMeters: nextMeters,
      actualSeconds: nextSeconds || undefined,
      actualTime: nextSeconds ? formatClock(nextSeconds) : undefined,
    }
  }

  return (
    <div
      className={`@container rounded-2xl [--nest-radius:1rem] [--nest-inset:1rem] px-4 py-3 transition-all ${
        completed
          ? 'bg-emerald-500/8 border border-emerald-500/15'
          : 'bg-[#1a1a1a] border border-[#2a2a2a]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-nested bg-[#2a2a2a] flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-[#6a6a6a]">{repeatIndex + 1}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${completed ? 'text-[#6a6a6a] line-through' : 'text-[#f5f5f0]'}`}>
            {spec.label}
          </p>
          {spec.targets.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
              {spec.targets.map((t) => <span key={t} className="text-xs text-[#4a4a4a]">{t}</span>)}
            </div>
          )}
        </div>

        <button
          onClick={() => onComplete({ ...values(meters, seconds), completed: true })}
          disabled={completed}
          aria-label={`Done: ${spec.label} ${repeatIndex + 1}`}
          className={`w-8 h-8 rounded-nested flex items-center justify-center transition-all shrink-0 ${
            completed
              ? 'bg-emerald-500 text-white'
              : 'bg-[#2a2a2a] text-[#4a4a4a] hover:bg-[#d97756]/20 hover:text-[#d97756] active:scale-90'
          }`}
        >
          <Check size={14} strokeWidth={2.5} />
        </button>
      </div>

      {!completed && <p className="text-2xs text-[#6a6a6a] mt-2">{recordHint(spec)}</p>}

      {/* Distance + time → split. At large text sizes the pieces wrap. */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mt-2">
        <div className="flex items-center gap-1 w-24">
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder="dist"
            aria-label={`Distance in ${unit}`}
            value={distText}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, '')
              setDistText(raw)
              const n = Number(raw)
              onUpdate(values(raw !== '' && n > 0 ? distanceToMeters(cardioType, n) : undefined, seconds))
            }}
            disabled={completed}
            className="w-full min-w-0 bg-[#111] border border-[#2a2a2a] rounded-nested px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40"
          />
          <span className="text-xs text-[#4a4a4a] shrink-0">{unit}</span>
        </div>
        <DurationStepper
          seconds={seconds}
          disabled={completed}
          onChange={(s) => {
            setSeconds(s)
            onUpdate(values(meters, s))
          }}
        />
        <div className="ml-auto text-right shrink-0">
          {split ? (
            <span className="text-xs font-semibold text-[#d97756] tabular-nums">{split}</span>
          ) : (
            <span className="text-xs text-[#3a3a3a]">split</span>
          )}
        </div>
      </div>
    </div>
  )
}
