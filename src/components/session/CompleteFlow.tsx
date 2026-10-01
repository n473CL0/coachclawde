import { useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '../shared/Button'
import { BottomSheet, SheetCloseButton } from '../shared/BottomSheet'
import type { Rating, SessionOutcome, WeekReflection } from '../../types'

export interface SessionCompleteData {
  feelings: Rating
  painNotes: string
  generalNotes: string
  outcome: SessionOutcome
}

interface CompleteFlowProps {
  sessionTitle: string
  isLastSessionOfWeek: boolean
  /** Saves the session. The sheet stays open if there's a week invitation to show. */
  onSave: (data: SessionCompleteData) => void
  /** Optional week reflection, only if the athlete accepts the invitation. */
  onReflect: (reflection: WeekReflection) => void
  /** Close the sheet after saving (navigates away). */
  onFinish: () => void
  onDismiss: () => void
}

/**
 * Saving a session. On the last session of the week the sheet then *invites*
 * a short reflection: it's optional, never a forced extra step.
 */
export function CompleteFlow({ sessionTitle, isLastSessionOfWeek, onSave, onReflect, onFinish, onDismiss }: CompleteFlowProps) {
  const [feelings, setFeelings] = useState<Rating>(3)
  const [painNotes, setPainNotes] = useState('')
  const [generalNotes, setGeneralNotes] = useState('')
  const [outcome, setOutcome] = useState<SessionOutcome>('as-planned')
  const [step, setStep] = useState<'session' | 'invite' | 'week'>('session')

  // Week reflection fields
  const [weekEnergy, setWeekEnergy] = useState<Rating>(3)
  const [weekNotes, setWeekNotes] = useState('')
  const [nextWeekFocus, setNextWeekFocus] = useState('')

  function handleSave() {
    onSave({ feelings, painNotes, generalNotes, outcome })
    if (isLastSessionOfWeek) setStep('invite')
    else onFinish()
  }

  function submitReflection() {
    onReflect({ energyLevel: weekEnergy, overallNotes: weekNotes, nextWeekFocus })
    onFinish()
  }

  const feelingLabels = ['', '💀 Terrible', '😓 Poor', '😐 OK', '💪 Good', '🔥 Great']

  return (
    // Typed notes shouldn't vanish on a stray tap, so only the ✕ dismisses it.
    <BottomSheet label={step === 'session' ? 'Session complete' : 'Week reflection'} onClose={step === 'session' ? onDismiss : onFinish} dismissOnBackdrop={false}>
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

              {/* Did it go to plan? */}
              <div>
                <p className="text-sm font-medium text-[#a8a29e] mb-2">Did it go to plan?</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['as-planned', 'As planned'], ['modified', 'Changed it']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setOutcome(v)}
                      aria-pressed={outcome === v}
                      className={`py-2.5 rounded-2xl text-sm font-medium transition-all ${
                        outcome === v ? 'bg-[#d97756] text-white' : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {outcome === 'modified' && (
                  <p className="text-xs text-[#6a6a6a] mt-2">Say what changed in the note below. Claude reads it when planning next week.</p>
                )}
              </div>

              <Button onClick={handleSave} fullWidth size="lg">
                Save Session
              </Button>
            </div>
          </>
        ) : step === 'invite' ? (
          <div className="px-5 pt-6 pb-edge flex flex-col items-center text-center gap-4">
            <p className="text-4xl" aria-hidden>🎉</p>
            <div>
              <h3 className="text-lg font-bold text-[#f5f5f0]">That's your week done</h3>
              <p className="text-sm text-[#6a6a6a] mt-1 leading-relaxed">
                Session saved. Got a minute to reflect on the week? It goes straight into next week's plan. Totally optional.
              </p>
            </div>
            <Button onClick={() => setStep('week')} fullWidth size="lg">
              Reflect on the week
            </Button>
            <Button variant="ghost" onClick={onFinish} fullWidth>
              Not now
            </Button>
          </div>
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

              <Button onClick={submitReflection} fullWidth size="lg">
                Save reflection
              </Button>
              <Button variant="ghost" onClick={onFinish} fullWidth>
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
