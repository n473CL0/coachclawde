import { useState } from 'react'
import { ChevronDown, ChevronUp, CircleQuestionMark, Info } from 'lucide-react'
import type { LoggedExercise, PlannedExercise } from '../../types'
import { SetRow } from './SetRow'
import { MovementGuide } from './MovementGuide'
import { formatRestTime } from '../../lib/dateUtils'

interface ExerciseTileProps {
  planned: PlannedExercise
  logged: LoggedExercise
  onUpdateSet: (setIndex: number, updates: Partial<LoggedExercise['sets'][0]>) => void
  onSetComplete: (setIndex: number, payload?: Partial<LoggedExercise['sets'][0]>) => void
  onSetUncomplete: (setIndex: number) => void
  isActive: boolean
  onActivate: () => void
}

export function ExerciseTile({ planned, logged, onUpdateSet, onSetComplete, onSetUncomplete, isActive, onActivate }: ExerciseTileProps) {
  const [expanded, setExpanded] = useState(isActive)
  const [showGuide, setShowGuide] = useState(false)

  const completedSets = logged.sets.filter((s) => s.completed).length
  const totalSets = planned.sets.length
  const allDone = completedSets === totalSets

  return (
    <div
      className={`rounded-[2rem] border overflow-hidden transition-all duration-200 ${
        isActive
          ? 'border-[#d97756]/40 bg-gradient-to-br from-[#d97756]/5 to-[#161616]'
          : allDone
          ? 'border-emerald-500/20 bg-[#161616]'
          : 'border-[#2a2a2a] bg-[#161616]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center pr-2">
        <button
          className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-4 text-left"
          onClick={() => { setExpanded((e) => !e); onActivate() }}
        >
          {/* Set progress indicator */}
          <div className="flex gap-1 shrink-0">
            {planned.sets.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  logged.sets[i]?.completed ? 'bg-emerald-400' : isActive ? 'bg-[#d97756]/40' : 'bg-[#2a2a2a]'
                }`}
              />
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm leading-tight ${allDone ? 'text-[#6a6a6a] line-through' : 'text-[#f5f5f0]'}`}>
              {planned.name}
            </p>
            <p className="text-xs text-[#4a4a4a] mt-0.5">
              {completedSets}/{totalSets} sets · rest {formatRestTime(planned.sets[0]?.restSeconds ?? 90)}
            </p>
          </div>

          {expanded ? <ChevronUp size={16} className="text-[#4a4a4a] shrink-0" /> : <ChevronDown size={16} className="text-[#4a4a4a] shrink-0" />}
        </button>

        <button
          onClick={() => setShowGuide(true)}
          aria-label={`How to do ${planned.name}`}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[#6a6a6a] hover:text-[#d97756] hover:bg-[#d97756]/10 transition-colors shrink-0"
        >
          <CircleQuestionMark size={18} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2 [--nest-radius:2rem] [--nest-inset:1rem]">
          {/* Coach notes */}
          {planned.coachNotes && (
            <div className="flex items-start gap-2 bg-[#d97756]/8 rounded-nested px-3 py-2.5 mb-1">
              <Info size={13} className="text-[#d97756] mt-0.5 shrink-0" />
              <p className="text-xs text-[#d97756]/90">{planned.coachNotes}</p>
            </div>
          )}

          {/* Set rows */}
          {/* Size container: set rows reflow to two lines when text is large. */}
          <div className="@container flex flex-col gap-1.5">
            {planned.sets.map((plannedSet, i) => (
              <SetRow
                key={i}
                setIndex={i}
                plannedSet={plannedSet}
                loggedSet={logged.sets[i]}
                onUpdate={(updates) => onUpdateSet(i, updates)}
                onComplete={(payload) => onSetComplete(i, payload)}
                onUncomplete={() => onSetUncomplete(i)}
              />
            ))}
          </div>
        </div>
      )}

      {showGuide && (
        <MovementGuide name={planned.name} notes={planned.coachNotes} onClose={() => setShowGuide(false)} />
      )}
    </div>
  )
}
