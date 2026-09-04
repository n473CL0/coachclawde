import { useAppStore } from '../store/useAppStore'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardSection } from '../components/shared/Card'
import { Reveal } from '../components/shared/Reveal'
import { WeightPRCard, CardioPRCard } from '../components/progress/PRCards'
import { Trophy } from 'lucide-react'
import { computeWeightPRs, computeCardioPRs } from '../lib/prComputations'

export function BestEfforts() {
  const { loggedSessions } = useAppStore()

  const completed = loggedSessions.filter((s) => s.status === 'complete')
  const weightPRs = computeWeightPRs(completed.filter((s) => s.type === 'weights'))
  const cardioPRs = computeCardioPRs(completed.filter((s) => s.type === 'cardio'))

  const empty = weightPRs.length === 0 && cardioPRs.length === 0

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <PageHeader
        title="Best efforts"
        subtitle={empty ? undefined : `${weightPRs.length + cardioPRs.length} personal bests`}
        backTo="/progress"
      />

      <div className="flex flex-col gap-4 px-4 pt-4 pb-32">
        {empty ? (
          <Card>
            <CardSection className="flex items-center gap-3 py-5">
              <div className="w-10 h-10 rounded-2xl bg-[#d97756]/15 flex items-center justify-center shrink-0">
                <Trophy size={18} className="text-[#d97756]" />
              </div>
              <p className="text-sm text-[#6a6a6a]">
                Log some sessions and your personal bests for each lift and cardio piece will show up here.
              </p>
            </CardSection>
          </Card>
        ) : (
          <>
            {weightPRs.length > 0 && (
              <Reveal>
                <WeightPRCard prs={weightPRs} />
              </Reveal>
            )}
            {cardioPRs.length > 0 && (
              <Reveal index={1}>
                <CardioPRCard prs={cardioPRs} />
              </Reveal>
            )}
          </>
        )}
      </div>
    </div>
  )
}
