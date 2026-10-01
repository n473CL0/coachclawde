import { useEffect, useState } from 'react'
import { CirclePlay, Info, LoaderCircle, SearchX, WifiOff } from 'lucide-react'
import {
  exerciseImageUrl,
  findExercise,
  isExerciseDbLoaded,
  loadExerciseDb,
  youtubeSearchUrl,
  type ExerciseDbEntry,
} from '../../lib/exerciseGuide'
import { BottomSheet, SheetCloseButton } from '../shared/BottomSheet'

type GuideState =
  | { status: 'loading' }
  | { status: 'ready'; match: ExerciseDbEntry | null }
  | { status: 'offline' }

interface MovementGuideProps {
  /** The exercise name as written in the plan. */
  name: string
  /** Coach notes / cues from the plan, shown alongside the guide. */
  notes?: string
  onClose: () => void
}

/**
 * Bottom sheet explaining how to do an exercise: start/end photos, muscles and
 * step-by-step instructions from free-exercise-db, plus a YouTube search as a
 * backup (always offered, since a library match is only a best guess).
 */
export function MovementGuide({ name, notes, onClose }: MovementGuideProps) {
  const [state, setState] = useState<GuideState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadExerciseDb().then(
      (db) => { if (!cancelled) setState({ status: 'ready', match: findExercise(db, name) }) },
      () => { if (!cancelled) setState({ status: 'offline' }) },
    )
    return () => { cancelled = true }
  }, [name])

  // Skip the spinner flash when the library is already in memory.
  const loading = state.status === 'loading' && !isExerciseDbLoaded()
  const match = state.status === 'ready' ? state.match : null

  return (
    <BottomSheet label={`How to do ${name}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <p className="text-2xs font-semibold text-[#d97756] uppercase tracking-widest">Movement guide</p>
          <h3 className="text-lg font-bold text-[#f5f5f0] leading-tight mt-0.5">{name}</h3>
          {match && match.name.toLowerCase() !== name.toLowerCase() && (
            <p className="text-xs text-[#6a6a6a] mt-1">Closest match: {match.name}</p>
          )}
        </div>
        <SheetCloseButton onClose={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
        {notes && (
          <div className="flex items-start gap-2 bg-[#d97756]/8 rounded-2xl px-3 py-2.5">
            <Info size={13} className="text-[#d97756] mt-0.5 shrink-0" />
            <p className="text-xs text-[#d97756]/90">{notes}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#6a6a6a]">
            <LoaderCircle size={16} className="animate-spin" />
            Loading guide…
          </div>
        )}

        {state.status === 'offline' && (
          <EmptyState icon={<WifiOff size={20} />} text="Couldn't load the exercise library. Check your connection, or try the video search below." />
        )}

        {state.status === 'ready' && !match && (
          <EmptyState icon={<SearchX size={20} />} text="No written guide for this one yet. The video search below should have you covered." />
        )}

        {match && <GuideBody entry={match} />}
      </div>

      <div className="px-5 pt-3 pb-safe border-t border-[#1a1a1a]">
        <a
          href={youtubeSearchUrl(name)}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-[#2e2e2e] text-[#f5f5f0] font-medium transition-all active:scale-95"
        >
          <CirclePlay size={18} className="text-[#ef4444]" />
          Watch videos on YouTube
        </a>
      </div>
    </BottomSheet>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4 text-[#6a6a6a]">
      {icon}
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  )
}

function GuideBody({ entry }: { entry: ExerciseDbEntry }) {
  const tags = [
    ...entry.primaryMuscles,
    entry.equipment && entry.equipment !== 'other' ? entry.equipment : null,
    entry.level,
  ].filter((t): t is string => !!t)

  return (
    <>
      {entry.images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {entry.images.slice(0, 2).map((img, i) => (
            <figure key={img} className="relative rounded-2xl overflow-hidden bg-[#1a1a1a] aspect-[4/3]">
              <img
                src={exerciseImageUrl(img)}
                alt={`${entry.name}, ${i === 0 ? 'start' : 'finish'} position`}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
              <figcaption className="absolute bottom-1.5 left-1.5 text-2xs font-semibold uppercase tracking-wide bg-black/60 text-white/90 rounded-md px-1.5 py-0.5">
                {i === 0 ? 'Start' : 'Finish'}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="text-[11px] capitalize text-[#a8a29e] bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-2.5 py-1">
              {t}
            </span>
          ))}
        </div>
      )}

      {entry.instructions.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {entry.instructions.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#d97756]/15 text-[#d97756] text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-[#a8a29e] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
