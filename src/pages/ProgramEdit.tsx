import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardSection } from '../components/shared/Card'
import { SyncIndicator } from '../components/shared/SyncIndicator'
import { BottomSheet, SheetCloseButton } from '../components/shared/BottomSheet'
import { DEFAULT_PROFILE } from '../lib/profileData'
import { PRIMARY_SPORTS, OTHER_SPORTS, sportIcon } from '../lib/sports'
import { Check, Plus } from 'lucide-react'
import {
  GOAL_OPTIONS, EXERCISE_OPTIONS, FACILITY_OPTIONS, COACHING_OPTIONS,
  LENGTH_OPTIONS, DAYS_PER_WEEK_OPTIONS, daysPerWeekLabel,
} from '../lib/programOptions'
import type { GoalProfile, ProgramConfig, RunsWith } from '../types'
import { TimeInput } from '../components/shared/TimeInput'
import { goalOrLegacy, resultSource, zonesLine } from '../lib/goalProfile'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function ProgramEdit() {
  const { profile, setProfile } = useAppStore()
  const { sync } = useAutoSync()

  const program = profile.program ?? DEFAULT_PROFILE.program!
  const cardioOn = program.exerciseTypes.includes('cardio')

  // Changes save to the store immediately; the cloud push is debounced so a
  // burst of taps results in a single write. A pending push is flushed when
  // leaving the page.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushProgram = useCallback(() => {
    void sync('profile')
  }, [sync])

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null
      pushProgram()
    }, 1200)
  }, [pushProgram])

  useEffect(() => () => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current)
      syncTimer.current = null
      pushProgram()
    }
  }, [pushProgram])

  function update(patch: Partial<ProgramConfig>) {
    // Days a week also lives in the goal profile; keep the two in step.
    const goal = profile.goal && patch.daysPerWeek
      ? { ...profile.goal, constraints: { ...profile.goal.constraints, daysPerWeek: patch.daysPerWeek } }
      : profile.goal
    setProfile({ program: { ...program, ...patch }, goal })
    scheduleSync()
  }

  function updateGoal(fn: (g: GoalProfile) => GoalProfile) {
    const g = fn(goalOrLegacy(profile))
    setProfile({ goal: { ...g, updatedAt: new Date().toISOString() } })
    scheduleSync()
  }

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <PageHeader
        title="Program setup"
        subtitle="Changes save automatically"
        backTo="/program"
        right={<SyncIndicator />}
      />

      <div className="flex flex-col gap-5 px-4 pt-4 pb-tabbar">
        <Card>
          <CardSection className="flex flex-col gap-5">
            <ChipGroup
              label="Goals"
              options={GOAL_OPTIONS}
              selected={program.goals}
              onToggle={(v) => update({ goals: toggle(program.goals, v) })}
            />
            <ChipGroup
              label="Training types"
              options={EXERCISE_OPTIONS}
              selected={program.exerciseTypes}
              onToggle={(v) => update({ exerciseTypes: toggle(program.exerciseTypes, v) })}
            />
            <ChipGroup
              label="Available facilities"
              options={FACILITY_OPTIONS}
              selected={program.facilities}
              onToggle={(v) => update({ facilities: toggle(program.facilities, v) })}
            />
            <CardioPicker
              disabled={!cardioOn}
              sports={program.sports}
              onChange={(sports) => update({ sports })}
            />
            <ChipGroup
              label="Coaching style"
              options={COACHING_OPTIONS}
              selected={[program.coachingStyle]}
              onToggle={(v) => update({ coachingStyle: v })}
            />
            <DaysPerWeekGroup
              value={program.daysPerWeek}
              onChange={(daysPerWeek) => update({ daysPerWeek })}
            />
            <LengthGroup
              value={program.lengthWeeks ?? 12}
              onChange={(lengthWeeks) => update({ lengthWeeks })}
            />
          </CardSection>
        </Card>

        {cardioOn && <PacesCard goal={profile.goal} onChange={updateGoal} zonesText={zonesLine(profile)} source={resultSource(profile)} />}
      </div>
    </div>
  )
}

function DaysPerWeekGroup({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#a8a29e] mb-2.5">Days per week</p>
      <div className="grid grid-cols-5 gap-2">
        {DAYS_PER_WEEK_OPTIONS.map((days) => {
          const active = value === days
          return (
            <button
              key={days}
              onClick={() => onChange(days)}
              aria-pressed={active}
              className={`px-2 py-2.5 rounded-2xl text-sm font-medium text-center transition-all duration-150 ${
                active
                  ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                  : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
              }`}
            >
              {daysPerWeekLabel(days)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LengthGroup({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#a8a29e] mb-2.5">Program length</p>
      <div className="grid grid-cols-4 gap-2">
        {LENGTH_OPTIONS.map((weeks) => {
          const active = value === weeks
          return (
            <button
              key={weeks}
              onClick={() => onChange(weeks)}
              aria-pressed={active}
              className={`px-2 py-2.5 rounded-2xl text-sm font-medium text-center transition-all duration-150 ${
                active
                  ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                  : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
              }`}
            >
              {weeks}w
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChipGroup<T extends string>({
  label, options, selected, onToggle,
}: {
  label: string
  options: { value: T; label: string }[]
  selected: T[]
  onToggle: (value: T) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[#a8a29e] mb-2.5">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              aria-pressed={active}
              className={`px-2 py-2.5 rounded-2xl text-sm font-medium text-center transition-all duration-150 ${
                active
                  ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                  : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CardioPicker({
  disabled, sports, onChange,
}: {
  disabled: boolean
  sports: string[]
  onChange: (sports: string[]) => void
}) {
  const [showModal, setShowModal] = useState(false)

  function toggleSport(s: string) {
    onChange(toggle(sports, s))
  }

  // "Other" sports the athlete has already added — shown as their own pills so
  // they stay visible without opening the modal.
  const extraSelected = sports.filter((s) => !PRIMARY_SPORTS.includes(s as typeof PRIMARY_SPORTS[number]))

  return (
    <div className={disabled ? 'opacity-40 pointer-events-none select-none' : ''}>
      <p className="text-xs font-medium text-[#a8a29e] mb-2.5">
        Cardio sports {disabled && <span className="text-[#4a4a4a]">— enable Cardio above</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {PRIMARY_SPORTS.map((s) => (
          <SportPill key={s} sport={s} active={sports.includes(s)} onClick={() => toggleSport(s)} />
        ))}
        {extraSelected.map((s) => (
          <SportPill key={s} sport={s} active onClick={() => toggleSport(s)} />
        ))}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 pl-3 pr-3.5 py-2 rounded-2xl text-sm font-medium bg-[#1a1a1a] text-[#a8a29e] border border-[#2a2a2a] hover:text-[#f5f5f0] transition-colors"
        >
          <Plus size={15} />
          Other
        </button>
      </div>

      {showModal && (
        <SportsModal selected={sports} onToggle={toggleSport} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}

function SportPill({ sport, active, onClick }: { sport: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 pl-3 pr-3.5 py-2 rounded-2xl text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
          : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
      }`}
    >
      {createElement(sportIcon(sport), { size: 15 })}
      {sport}
    </button>
  )
}

function SportsModal({
  selected, onToggle, onClose,
}: {
  selected: string[]
  onToggle: (sport: string) => void
  onClose: () => void
}) {
  return (
    <BottomSheet label="Add a sport" onClose={onClose}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-[#f5f5f0]">Add a sport</h3>
        <SheetCloseButton onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-edge">
        {OTHER_SPORTS.map((s) => {
          const active = selected.includes(s)
          return (
            <button
              key={s}
              onClick={() => onToggle(s)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[#1a1a1a] transition-colors text-left"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                active ? 'bg-[#d97756]/15 text-[#d97756]' : 'bg-[#1a1a1a] text-[#6a6a6a]'
              }`}>
                {createElement(sportIcon(s), { size: 18 })}
              </div>
              <span className={`flex-1 text-sm font-medium ${active ? 'text-[#f5f5f0]' : 'text-[#a8a29e]'}`}>{s}</span>
              {active && <Check size={18} className="text-[#d97756] shrink-0" />}
            </button>
          )
        })}
      </div>
  </BottomSheet>
  )
}

const RESULT_DISTANCES: { meters: number; label: string; hours: boolean }[] = [
  { meters: 5000, label: '5K', hours: false },
  { meters: 10000, label: '10K', hours: false },
  { meters: 21097.5, label: 'Half', hours: true },
  { meters: 42195, label: 'Marathon', hours: true },
]

const RUNS_WITH: { value: RunsWith; label: string }[] = [
  { value: 'phone', label: 'Just my phone' },
  { value: 'watch', label: 'GPS watch' },
  { value: 'track', label: 'A track' },
  { value: 'treadmill', label: 'Treadmill' },
]

/**
 * A recent race or timed run sets the athlete's pace zones; "runs with" decides
 * whether plans may use distance reps (only with a watch, track or treadmill).
 */
function PacesCard({
  goal, onChange, zonesText, source,
}: {
  goal: GoalProfile | undefined
  onChange: (fn: (g: GoalProfile) => GoalProfile) => void
  zonesText: string
  source: string | null
}) {
  const result = goal?.starting.recentResult
  const [meters, setMeters] = useState(result?.meters ?? 5000)
  const [seconds, setSeconds] = useState(result?.seconds ?? 0)
  const dist = RESULT_DISTANCES.find((d) => d.meters === meters) ?? RESULT_DISTANCES[0]
  const runsWith = goal?.constraints.runsWith ?? []

  function saveResult(m: number, s: number) {
    if (s < 60) return
    onChange((g) => ({
      ...g,
      starting: { ...g.starting, recentResult: { meters: m, seconds: s } },
      zoneOffsetPct: 0,
    }))
  }

  return (
    <Card>
      <CardSection className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-[#a8a29e]">Recent race or timed run</p>
          <p className="text-xs text-[#6a6a6a] mt-1">Sets your pace zones for runs. Use something from the last couple of months.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RESULT_DISTANCES.map((d) => (
            <button
              key={d.label}
              onClick={() => { setMeters(d.meters); saveResult(d.meters, seconds) }}
              aria-pressed={meters === d.meters}
              className={`px-3.5 py-2 rounded-2xl text-sm font-medium ${meters === d.meters ? 'bg-[#d97756] text-white' : 'bg-[#1a1a1a] text-[#a8a29e] border border-[#2a2a2a]'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <TimeInput
          key={dist.label}
          seconds={seconds}
          showHours={dist.hours}
          label="Finishing time"
          onChange={(s) => { setSeconds(s); saveResult(meters, s) }}
        />
        <p className="text-xs text-[#6a6a6a] leading-relaxed">{source ? zonesText : 'No result yet: runs are set by feel.'}</p>

        <div className="border-t border-[#2a2a2a] pt-4">
          <p className="text-sm font-medium text-[#a8a29e]">What do you run with?</p>
          <p className="text-xs text-[#6a6a6a] mt-1 mb-3">With just a phone, reps are set by time: a phone can't tell you when you've run 800 m.</p>
          <div className="flex flex-wrap gap-2">
            {RUNS_WITH.map((o) => {
              const on = runsWith.includes(o.value)
              return (
                <button
                  key={o.value}
                  aria-pressed={on}
                  onClick={() => onChange((g) => {
                    const cur = g.constraints.runsWith ?? []
                    const next = on ? cur.filter((x) => x !== o.value) : [...cur, o.value]
                    return { ...g, constraints: { ...g.constraints, runsWith: next }, deferred: g.deferred.filter((d) => d !== 'runs-with') }
                  })}
                  className={`px-3.5 py-2 rounded-2xl text-sm font-medium ${on ? 'bg-[#d97756] text-white' : 'bg-[#1a1a1a] text-[#a8a29e] border border-[#2a2a2a]'}`}
                >
                  {on && <Check size={13} className="inline -mt-0.5 mr-1" />}{o.label}
                </button>
              )
            })}
          </div>
        </div>
      </CardSection>
    </Card>
  )
}
