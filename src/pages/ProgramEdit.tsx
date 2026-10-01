import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardSection } from '../components/shared/Card'
import { SyncIndicator } from '../components/shared/SyncIndicator'
import { DEFAULT_PROFILE } from '../lib/profileData'
import { PRIMARY_SPORTS, OTHER_SPORTS, sportIcon } from '../lib/sports'
import { Check, Plus, X } from 'lucide-react'
import {
  GOAL_OPTIONS, EXERCISE_OPTIONS, FACILITY_OPTIONS, COACHING_OPTIONS,
  LENGTH_OPTIONS, DAYS_PER_WEEK_OPTIONS, daysPerWeekLabel,
} from '../lib/programOptions'
import type { ProgramConfig } from '../types'

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
    setProfile({ program: { ...program, ...patch } })
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col" onClick={onClose}>
      <div
        className="mt-auto bg-[#111] rounded-t-3xl border-t border-[#2a2a2a] flex flex-col slide-up max-h-[85svh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-[#f5f5f0]">Add a sport</h3>
          <button onClick={onClose} className="text-[#4a4a4a] hover:text-[#f5f5f0]">
            <X size={20} />
          </button>
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
      </div>
    </div>
  )
}
