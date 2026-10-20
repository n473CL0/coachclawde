import { useState } from 'react'
import { BottomSheet, SheetCloseButton } from '../shared/BottomSheet'
import { Button } from '../shared/Button'
import { Stepper } from '../shared/Stepper'
import { DISTANCE_ACTIVITIES, QUICK_ACTIVITIES, type QuickLogInput } from '../../lib/quickLog'
import { toLocalISODate } from '../../lib/weekUtils'
import { useUnits } from '../../store/useSettingsStore'
import { fromDistance } from '../../lib/units'

const RPE_HINTS: Record<number, string> = {
  1: 'Very easy', 2: 'Easy', 3: 'Comfortable', 4: 'Steady', 5: 'Working',
  6: 'Hard-ish', 7: 'Hard', 8: 'Very hard', 9: 'Nearly max', 10: 'All out',
}

/** One-tap 1–10 effort (session RPE) picker. */
export function RpePicker({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="grid grid-cols-10 gap-1" role="group" aria-label="Effort, 1 to 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
              value === n ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20' : 'bg-[#1a1a1a] text-[#6a6a6a] hover:bg-[#2a2a2a]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#6a6a6a] text-center mt-2 h-4">{value ? RPE_HINTS[value] : 'How hard was it overall?'}</p>
    </div>
  )
}

/**
 * "Did something else?" / "Log a session". A swap is logged against the
 * planned session; a standalone log also asks which day.
 */
export function QuickLogSheet({
  plannedTitle, defaultMinutes = 45, onSave, onClose,
}: {
  /** Set when logging a swap for a planned session. */
  plannedTitle?: string
  defaultMinutes?: number
  onSave: (input: QuickLogInput) => void
  onClose: () => void
}) {
  const [activity, setActivity] = useState('')
  const [custom, setCustom] = useState('')
  const [minutes, setMinutes] = useState(defaultMinutes)
  const [distance, setDistance] = useState('')
  const distanceUnit = useUnits().distance
  const [rpe, setRpe] = useState<number | undefined>()
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(toLocalISODate(new Date()))

  const isOther = activity === '__other'
  const name = isOther ? custom.trim() : activity
  const showDistance = DISTANCE_ACTIVITIES.has(activity) || isOther

  function save() {
    if (!name) return
    const km = fromDistance(Number(distance), distanceUnit)
    onSave({
      activity: name,
      minutes,
      distanceKm: showDistance && km > 0 ? km : undefined,
      rpe,
      notes,
      date,
    })
  }

  const field = 'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50'

  return (
    <BottomSheet label={plannedTitle ? 'Did something else' : 'Log a session'} onClose={onClose} dismissOnBackdrop={false}>
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div>
          <h3 className="text-lg font-bold text-[#f5f5f0]">{plannedTitle ? 'Did something else?' : 'Log a session'}</h3>
          <p className="text-sm text-[#6a6a6a] mt-0.5">
            {plannedTitle ? `Instead of ${plannedTitle}. It counts, and Clawde will see it.` : 'Anything you did outside the plan.'}
          </p>
        </div>
        <SheetCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium text-[#a8a29e] mb-2">What did you do?</p>
          <div className="flex flex-wrap gap-2">
            {[...QUICK_ACTIVITIES, { value: '__other', label: 'Other' }].map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setActivity(a.value)}
                aria-pressed={activity === a.value}
                className={`px-3.5 py-2 rounded-2xl text-sm font-medium transition-all ${
                  activity === a.value ? 'bg-[#d97756] text-white' : 'bg-[#1a1a1a] text-[#a8a29e] border border-[#2a2a2a]'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          {isOther && (
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Spin class" className={`${field} mt-2`} autoFocus />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium text-[#a8a29e]">How long?</p>
          <Stepper label="Minutes" value={minutes} step={5} min={5} max={600} onChange={setMinutes} format={(v) => `${v} min`} />
        </div>

        {showDistance && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#a8a29e]">Distance <span className="text-[#4a4a4a]">(optional)</span></p>
            <div className="flex items-center gap-1.5 w-32">
              <input
                value={distance}
                onChange={(e) => setDistance(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-base text-center text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50"
              />
              <span className="text-xs text-[#6a6a6a]">{distanceUnit}</span>
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-[#a8a29e] mb-2">Effort</p>
          <RpePicker value={rpe} onChange={setRpe} />
        </div>

        {!plannedTitle && (
          <div>
            <p className="text-sm font-medium text-[#a8a29e] mb-2">When?</p>
            <input
              type="date"
              value={date}
              max={toLocalISODate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className={field}
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-[#a8a29e] mb-2">Note <span className="text-[#4a4a4a]">(optional)</span></p>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Gym was packed, went for a ride instead" className={`${field} resize-none`} />
        </div>
      </div>
      <div className="px-5 pb-edge pt-3">
        <Button fullWidth size="lg" onClick={save} disabled={!name || !date}>
          Save
        </Button>
      </div>
    </BottomSheet>
  )
}
