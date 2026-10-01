import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { CardioType, LoggedInterval, PlannedInterval } from '../../types'
import {
  computeSplit,
  distanceToMeters,
  distanceUnit,
  metersToDistance,
  parseDurationToSeconds,
} from '../../lib/cardioUtils'

interface IntervalRowProps {
  interval: PlannedInterval
  repeatIndex: number
  cardioType: CardioType
  logged: LoggedInterval | undefined
  onUpdate: (updates: Partial<LoggedInterval>) => void
  onComplete: () => void
}

export function IntervalRow({ interval, repeatIndex, cardioType, logged, onUpdate, onComplete }: IntervalRowProps) {
  const completed = logged?.completed ?? false
  const unit = distanceUnit(cardioType)

  const [distText, setDistText] = useState(
    logged?.actualDistanceMeters != null
      ? String(Math.round(metersToDistance(cardioType, logged.actualDistanceMeters) * 100) / 100)
      : ''
  )
  const [timeText, setTimeText] = useState(logged?.actualTime ?? '')
  const timeRef = useRef<HTMLInputElement>(null)

  function push(nextDist: string, nextTime: string) {
    const distVal = Number(nextDist)
    const meters = nextDist !== '' && !Number.isNaN(distVal) ? distanceToMeters(cardioType, distVal) : undefined
    const seconds = parseDurationToSeconds(nextTime) ?? undefined
    onUpdate({
      actualDistanceMeters: meters,
      actualSeconds: seconds,
      actualTime: nextTime.trim() || undefined,
    })
  }

  const liveMeters = distText !== '' && !Number.isNaN(Number(distText))
    ? distanceToMeters(cardioType, Number(distText))
    : undefined
  const liveSeconds = parseDurationToSeconds(timeText) ?? undefined
  const split = computeSplit(cardioType, liveMeters, liveSeconds)

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
            {interval.label}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
            {interval.targetDistance && (
              <span className="text-xs text-[#4a4a4a]">Target: {interval.targetDistance}</span>
            )}
            {interval.targetPace && (
              <span className="text-xs text-[#4a4a4a]">Pace: {interval.targetPace}</span>
            )}
            {interval.targetDuration && (
              <span className="text-xs text-[#4a4a4a]">Time: {interval.targetDuration}</span>
            )}
          </div>
        </div>

        <button
          onClick={onComplete}
          disabled={completed}
          className={`w-8 h-8 rounded-nested flex items-center justify-center transition-all shrink-0 ${
            completed
              ? 'bg-emerald-500 text-white'
              : 'bg-[#2a2a2a] text-[#4a4a4a] hover:bg-[#d97756]/20 hover:text-[#d97756] active:scale-90'
          }`}
        >
          <Check size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Distance + time → split. At large text sizes the split drops to its
          own line so the two inputs keep a usable width. */}
      <div className="flex items-center @max-[17rem]:flex-wrap gap-2 mt-3">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            onKeyDown={(e) => { if (e.key === 'Enter') timeRef.current?.focus() }}
            placeholder="dist"
            value={distText}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, '')
              setDistText(raw)
              push(raw, timeText)
            }}
            disabled={completed}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-nested px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40"
          />
          <span className="text-xs text-[#4a4a4a] shrink-0">{unit}</span>
        </div>
        <input
          type="text"
          ref={timeRef}
          inputMode="text"
          enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="mm:ss"
          value={timeText}
          onChange={(e) => {
            const raw = e.target.value
            setTimeText(raw)
            push(distText, raw)
          }}
          disabled={completed}
          className="w-20 @max-[17rem]:w-auto @max-[17rem]:flex-1 min-w-0 bg-[#111] border border-[#2a2a2a] rounded-nested px-2 py-1.5 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 disabled:opacity-40 font-mono"
        />
        <div className="w-20 text-right shrink-0 @max-[17rem]:w-auto @max-[17rem]:basis-full @max-[17rem]:text-left">
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
