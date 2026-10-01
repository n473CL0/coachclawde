import { useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '../shared/Button'
import { BottomSheet, SheetCloseButton } from '../shared/BottomSheet'
import type { Rating, WeekReflection } from '../../types'

interface CompleteFlowProps {
  sessionTitle: string
  isLastSessionOfWeek: boolean
  onComplete: (data: {
    feelings: Rating
    painNotes: string
    generalNotes: string
    weekReflection?: WeekReflection
  }) => void
  onDismiss: () => void
}

export function CompleteFlow({ sessionTitle, isLastSessionOfWeek, onComplete, onDismiss }: CompleteFlowProps) {
  const [feelings, setFeelings] = useState<Rating>(3)
  const [painNotes, setPainNotes] = useState('')
  const [generalNotes, setGeneralNotes] = useState('')
  const [step, setStep] = useState<'session' | 'week'>('session')

  // Week reflection fields
  const [weekEnergy, setWeekEnergy] = useState<Rating>(3)
  const [weekNotes, setWeekNotes] = useState('')
  const [nextWeekFocus, setNextWeekFocus] = useState('')

  function handleSessionContinue() {
    if (isLastSessionOfWeek) {
      setStep('week')
    } else {
      submit()
    }
  }

  function submit() {
    const weekReflection: WeekReflection | undefined = isLastSessionOfWeek
      ? {
          energyLevel: weekEnergy,
          overallNotes: weekNotes,
          nextWeekFocus,
        }
      : undefined

    onComplete({ feelings, painNotes, generalNotes, weekReflection })
  }

  const feelingLabels = ['', '💀 Terrible', '😓 Poor', '😐 OK', '💪 Good', '🔥 Great']

  return (
    // Typed notes shouldn't vanish on a stray tap, so only the ✕ dismisses it.
    <BottomSheet label={step === 'session' ? 'Session complete' : 'Week reflection'} onClose={onDismiss} dismissOnBackdrop={false}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 'session' ? (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div>
                <h3 className="text-lg font-bold text-[#f5f5f0]">Session Complete! 🎉</h3>
                <p className="text-sm text-[#6a6a6a] mt-0.5">{sessionTitle}</p>
              </div>
              <SheetCloseButton onClose={onDismiss} />
            </div>

            <div className="px-5 pt-4 pb-edge flex flex-col gap-5">
              {/* Feelings rating */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star size={15} className="text-[#d97756]" />
                  <p className="text-sm font-medium text-[#a8a29e]">How did it feel?</p>
                </div>
                <div className="flex gap-2">
                  {([1, 2, 3, 4, 5] as Rating[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setFeelings(r)}
                      className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                        feelings === r
                          ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                          : 'bg-[#1a1a1a] text-[#4a4a4a] hover:bg-[#2a2a2a]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#6a6a6a] text-center mt-2">{feelingLabels[feelings]}</p>
              </div>

              {/* Pain notes */}
              <div>
                <p className="text-sm font-medium text-[#a8a29e] mb-2">Any pain or discomfort?</p>
                <textarea
                  value={painNotes}
                  onChange={(e) => setPainNotes(e.target.value)}
                  placeholder="e.g. Left shoulder clicking on overhead movements, right knee aching on leg press"
                  rows={2}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-[#d97756]/50"
                />
              </div>

              {/* General notes */}
              <div>
                <p className="text-sm font-medium text-[#a8a29e] mb-2">Anything else to note?</p>
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="e.g. Felt strong on bench, could increase weight next session. Ran out of time for cooldown."
                  rows={2}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-[#d97756]/50"
                />
              </div>

              {isLastSessionOfWeek && (
                <div className="bg-[#d97756]/10 rounded-2xl border border-[#d97756]/20 px-4 py-3">
                  <p className="text-xs text-[#d97756] font-medium">
                    🏁 This is your last session of the week — you'll do a quick week reflection next.
                  </p>
                </div>
              )}

              <Button onClick={handleSessionContinue} fullWidth size="lg">
                {isLastSessionOfWeek ? 'Continue to Week Reflection →' : 'Save Session'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div>
                <h3 className="text-lg font-bold text-[#f5f5f0]">Week Reflection 📊</h3>
                <p className="text-sm text-[#6a6a6a] mt-0.5">Log your progress for the week</p>
              </div>
            </div>

            <div className="px-5 pt-4 pb-edge flex flex-col gap-5">
              {/* Week energy */}
              <div>
                <p className="text-sm font-medium text-[#a8a29e] mb-3">Overall week energy level?</p>
                <div className="flex gap-2">
                  {([1, 2, 3, 4, 5] as Rating[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setWeekEnergy(r)}
                      className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                        weekEnergy === r
                          ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                          : 'bg-[#1a1a1a] text-[#4a4a4a] hover:bg-[#2a2a2a]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Week notes */}
              <div>
                <p className="text-sm font-medium text-[#a8a29e] mb-2">Week summary</p>
                <textarea
                  value={weekNotes}
                  onChange={(e) => setWeekNotes(e.target.value)}
                  placeholder="How did the week go? What worked, what didn't?"
                  rows={3}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-[#d97756]/50"
                />
              </div>

              {/* Next week focus */}
              <div>
                <p className="text-sm font-medium text-[#a8a29e] mb-2">Focus for next week</p>
                <textarea
                  value={nextWeekFocus}
                  onChange={(e) => setNextWeekFocus(e.target.value)}
                  placeholder="e.g. Increase bench press weight, add morning cardio on Tuesday"
                  rows={2}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-[#d97756]/50"
                />
              </div>

              <Button onClick={submit} fullWidth size="lg">
                Complete Week 🏆
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
