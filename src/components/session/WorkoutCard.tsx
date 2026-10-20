import { useMemo } from 'react'
import type { CardioType, WorkoutItem } from '../../types'
import type { RunZones } from '../../lib/zones'
import { flattenWorkout, howItWorks, totalSeconds, workoutNotation, workoutStrip, youllRecord } from '../../lib/workout'
import { WorkoutStrip } from './WorkoutStrip'
import { useUnits } from '../../store/useSettingsStore'
import { localize } from '../../lib/units'
import { EFFORT_COLOR, EFFORT_LABEL } from './effortStyle'

/**
 * The cardio session before it starts: a strip of the whole workout, the
 * one-line notation, how Run Mode works for it, and what the athlete records.
 */
export function WorkoutCard({ workout, modality, zones }: { workout: WorkoutItem[]; modality: CardioType; zones?: RunZones }) {
  const flat = useMemo(() => flattenWorkout(workout), [workout])
  const segments = workoutStrip(flat, modality, zones)
  const minutes = Math.round(totalSeconds(flat, modality, zones) / 60)
  const efforts = [...new Set(flat.map((f) => f.step.effort))]
  const units = useUnits()

  return (
    <div className="rounded-3xl bg-[#161616] border border-[#2a2a2a] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#d97756] uppercase tracking-widest font-semibold">The workout</p>
        <p className="text-xs text-[#6a6a6a]">≈ {minutes} min</p>
      </div>
      <WorkoutStrip segments={segments} />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {efforts.map((e) => (
          <span key={e} className="flex items-center gap-1.5 text-2xs text-[#6a6a6a]">
            <i className="w-2.5 h-2.5 rounded-sm" style={{ background: EFFORT_COLOR[e] }} />
            {EFFORT_LABEL[e]}
          </span>
        ))}
      </div>
      <p className="font-mono text-xs text-[#e5e5e0] leading-relaxed">{localize(workoutNotation(workout, modality, zones, units.distance), units)}</p>
      {!zones && modality === 'run' && (
        <p className="text-xs text-[#6a6a6a] leading-relaxed">
          Efforts are by feel for now. Add a recent race time in Program setup and I'll show your paces.
        </p>
      )}
      <p className="text-xs text-[#a8a29e] leading-relaxed"><b className="text-[#f5f5f0] font-semibold">How this works. </b>{localize(howItWorks(flat), units)}</p>
      <p className="text-xs text-[#a8a29e] leading-relaxed"><b className="text-[#f5f5f0] font-semibold">You'll record: </b>{youllRecord(flat)}</p>
    </div>
  )
}
