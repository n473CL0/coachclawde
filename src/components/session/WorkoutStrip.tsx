import type { StripSegment } from '../../lib/workout'
import { EFFORT_COLOR } from './effortStyle'

/**
 * The whole session as one bar: segment width ∝ expected duration, colour by
 * effort, so the shape is readable at a glance. `progress` (0–1) draws a
 * cursor, for Run Mode.
 */
export function WorkoutStrip({ segments, progress, height = 'h-3.5' }: { segments: StripSegment[]; progress?: number; height?: string }) {
  return (
    <div className={`relative flex gap-0.5 ${height} rounded-md overflow-visible`} aria-hidden>
      {segments.map((s) => (
        <span
          key={s.path}
          className="block h-full first:rounded-l-md last:rounded-r-md"
          style={{ flex: `${Math.max(s.seconds, 1)} 0 0`, background: EFFORT_COLOR[s.effort], opacity: s.role === 'recover' ? 0.7 : 1 }}
        />
      ))}
      {progress != null && (
        <i
          className="absolute -top-1 -bottom-1 w-[3px] rounded-sm bg-white shadow-[0_0_0_1px_#000] transition-[left] duration-200 ease-linear"
          style={{ left: `calc(${Math.min(1, Math.max(0, progress)) * 100}% - 1px)` }}
        />
      )}
    </div>
  )
}
