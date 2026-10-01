import { useState } from 'react'
import { ChevronDown, ChevronUp, CircleQuestionMark } from 'lucide-react'
import type { RoutineItem } from '../../types'
import { MovementGuide } from './MovementGuide'

interface RoutineCardProps {
  /** e.g. "Warmup" / "Cooldown" */
  title: string
  /** The brief one-line summary from the plan. */
  summary?: string
  /** The detailed moves. Older plans don't have these; the card then shows just the summary. */
  items?: RoutineItem[]
}

/**
 * Warm-up / cool-down card: the brief summary up front, expandable to the full
 * list of moves, each with a movement guide.
 */
export function RoutineCard({ title, summary, items }: RoutineCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [guide, setGuide] = useState<RoutineItem | null>(null)
  const moves = items ?? []
  if (!summary && moves.length === 0) return null

  return (
    <div className="bg-[#1a1a1a] rounded-3xl border border-[#2a2a2a] overflow-hidden [--nest-radius:1.5rem] [--nest-inset:0.75rem]">
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-widest mb-1">{title}</p>
        {summary && <p className="text-sm text-[#a8a29e]">{summary}</p>}
      </div>

      {moves.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-[#2a2a2a] text-xs font-medium text-[#d97756] hover:bg-[#d97756]/5 transition-colors"
          >
            {expanded ? 'Hide' : 'Show'} full {title.toLowerCase()} · {moves.length} moves
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {expanded && (
            <ol className="px-3 pb-3 flex flex-col gap-1.5 fade-in">
              {moves.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 bg-[#161616] border border-[#2a2a2a] rounded-nested pl-3 pr-1.5 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#d97756]/15 text-[#d97756] text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-[#f5f5f0] leading-snug">{item.name}</p>
                      {item.prescription && (
                        <span className="text-xs text-[#a8a29e] shrink-0 tabular-nums">{item.prescription}</span>
                      )}
                    </div>
                    {item.notes && <p className="text-xs text-[#6a6a6a] mt-0.5 leading-relaxed">{item.notes}</p>}
                  </div>
                  <button
                    onClick={() => setGuide(item)}
                    aria-label={`How to do ${item.name}`}
                    className="w-8 h-8 -my-1 rounded-xl flex items-center justify-center text-[#6a6a6a] hover:text-[#d97756] hover:bg-[#d97756]/10 transition-colors shrink-0"
                  >
                    <CircleQuestionMark size={17} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {guide && <MovementGuide name={guide.name} notes={guide.notes} onClose={() => setGuide(null)} />}
    </div>
  )
}
