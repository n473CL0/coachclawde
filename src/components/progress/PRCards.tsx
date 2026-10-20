import { Dumbbell, Waves } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card, CardSection } from '../shared/Card'
import type { WeightPR, CardioPR } from '../../lib/prComputations'
import { useUnits } from '../../store/useSettingsStore'
import { formatWeight, localize } from '../../lib/units'

/** Card listing the heaviest set logged per lift. Pass `limit` for a preview. */
export function WeightPRCard({ prs, limit }: { prs: WeightPR[]; limit?: number }) {
  const shown = limit ? prs.slice(0, limit) : prs
  const units = useUnits()
  return (
    <Card>
      <CardSection>
        <div className="flex items-center gap-2 mb-3">
          <Dumbbell size={15} className="text-blue-400" />
          <p className="text-sm font-semibold text-[#f5f5f0]">Lifting PRs</p>
        </div>
        <div className="flex flex-col">
          {shown.map((pr, i) => (
            <div
              key={pr.name}
              className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-[#2a2a2a]' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#f5f5f0] truncate">{pr.name}</p>
                <p className="text-xs text-[#4a4a4a] mt-0.5">{format(parseISO(pr.date), 'dd MMM yyyy')}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-[#d97756]">{formatWeight(pr.weightKg, units.weight)}</p>
                <p className="text-xs text-[#6a6a6a]">× {pr.reps} reps</p>
              </div>
            </div>
          ))}
        </div>
      </CardSection>
    </Card>
  )
}

/** Card listing the fastest time logged per cardio piece. Pass `limit` for a preview. */
export function CardioPRCard({ prs, limit }: { prs: CardioPR[]; limit?: number }) {
  const shown = limit ? prs.slice(0, limit) : prs
  const units = useUnits()
  return (
    <Card>
      <CardSection>
        <div className="flex items-center gap-2 mb-3">
          <Waves size={15} className="text-emerald-400" />
          <p className="text-sm font-semibold text-[#f5f5f0]">Cardio bests</p>
        </div>
        <div className="flex flex-col">
          {shown.map((pr, i) => (
            <div
              key={pr.label}
              className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-[#2a2a2a]' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#f5f5f0] truncate">{localize(pr.label, units)}</p>
                <p className="text-xs text-[#4a4a4a] mt-0.5">{format(parseISO(pr.date), 'dd MMM yyyy')}</p>
              </div>
              <p className="text-sm font-bold text-emerald-400 shrink-0">{pr.time}</p>
            </div>
          ))}
        </div>
      </CardSection>
    </Card>
  )
}
