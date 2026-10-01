import { Minus, Plus } from 'lucide-react'

/**
 * A − value + stepper: big tap targets instead of a free-text box, for sweaty
 * hands mid-session. `format` renders the value; the buttons clamp to
 * [min, max].
 */
export function Stepper({
  value, onChange, step = 1, min = 0, max = Number.POSITIVE_INFINITY, format = String, label, disabled, size = 'md',
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  format?: (v: number) => string
  /** Accessible name, e.g. "Minutes". */
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const btn = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))
  return (
    <div className={`flex items-center gap-1 ${disabled ? 'opacity-40 pointer-events-none' : ''}`} role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={disabled || value <= min}
        aria-label={`${label}: less`}
        className={`${btn} shrink-0 rounded-nested bg-[#2a2a2a] text-[#a8a29e] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30`}
      >
        <Minus size={14} />
      </button>
      <span className="min-w-[2.75rem] text-center text-base font-semibold text-[#f5f5f0] tabular-nums" aria-live="polite">
        {format(value)}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={disabled || value >= max}
        aria-label={`${label}: more`}
        className={`${btn} shrink-0 rounded-nested bg-[#2a2a2a] text-[#a8a29e] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30`}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

/**
 * Minutes and seconds as two steppers, replacing free-text "mm:ss" (where
 * "2:15" could be 2 min 15 s or 2 h 15 min). Seconds step by 5 and roll over
 * into minutes.
 */
export function DurationStepper({
  seconds, onChange, disabled, secondStep = 5,
}: {
  seconds: number
  onChange: (s: number) => void
  disabled?: boolean
  secondStep?: number
}) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Stepper
        label="Minutes"
        size="sm"
        value={m}
        min={0}
        max={600}
        onChange={(v) => onChange(v * 60 + s)}
        format={(v) => `${v}m`}
        disabled={disabled}
      />
      <Stepper
        label="Seconds"
        size="sm"
        value={s}
        step={secondStep}
        min={-secondStep}
        max={60}
        onChange={(v) => onChange(Math.max(0, m * 60 + v))}
        format={(v) => `${String(Math.max(0, Math.min(59, v))).padStart(2, '0')}s`}
        disabled={disabled}
      />
    </div>
  )
}
