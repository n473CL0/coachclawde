import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, Calendar, Check, Shuffle, Target } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { ChatFlow } from '../components/onboarding/ChatFlow'
import { QuickLogSheet } from '../components/session/QuickLogSheet'
import { Button } from '../components/shared/Button'
import { rewindTo, type FlowAnswers, type FlowValue } from '../lib/flow'
import { applyCheckIn, buildCheckIn, buildCheckInFlow, computeFacts, describeAction } from '../lib/checkIn'
import { applyMigration, buildMigrationFlow } from '../lib/migrationFlow'
import { reviewedWeekStart } from '../lib/checkInTriggers'
import { buildQuickLog, type QuickLogInput } from '../lib/quickLog'
import type { CheckInTrigger } from '../types'
import { nanoid } from '../lib/nanoid'

const TRIGGERS: CheckInTrigger[] = ['week-complete', 'week-end', 'planner', 'milestone', 'reactive', 'migration']

/**
 * A check-in: a ~60-second chat with Clawde on the same engine as onboarding.
 * `?trigger=` says why it was offered and `?week=` which week it reviews.
 * Nothing is saved until the athlete taps through the summary, so backing
 * out is always free.
 */
export function CheckIn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const store = useAppStore()
  const { profile, weekPlans, loggedSessions, checkIns, saveCheckIn, setProfile, dismissCheckIn, addLoggedSession } = store
  const { sync, syncSession } = useAutoSync()

  const [now] = useState(() => new Date())
  const trigger = (TRIGGERS.find((t) => t === params.get('trigger')) ?? 'week-end') as CheckInTrigger
  const weekStart = params.get('week') ?? reviewedWeekStart(now)
  const dismissKey = params.get('key')
  const migration = trigger === 'migration'

  // Facts are fixed when the chat opens, so questions don't shift under the athlete.
  const [facts] = useState(() => computeFacts({
    profile, plan: weekPlans.find((p) => p.weekStartDate === weekStart), loggedSessions, checkIns, weekStart, trigger, now,
  }))
  const flow = useMemo(() => (migration ? buildMigrationFlow(profile) : buildCheckInFlow(facts)), [migration, profile, facts])

  const [answers, setAnswers] = useState<FlowAnswers>({})
  const [showLog, setShowLog] = useState(false)
  const [logged, setLogged] = useState(false)
  const [id] = useState(() => nanoid())

  const checkIn = migration ? null : buildCheckIn(facts, answers, now, id)
  const migrationResult = migration ? applyMigration(profile, answers, now) : null
  const reopen = checkIn?.actions.find((a) => a.kind === 'reopen-goal')
  // The app, not the plan, owns referral advice: said once, when a niggle gets worse.
  const worse = checkIn?.actions.some((a) => a.kind === 'injury-status' && a.status === 'worse')
  const wantsLog = checkIn?.actions.some((a) => a.kind === 'log-swap') && !logged

  function save() {
    if (migrationResult) {
      setProfile(migrationResult.patch)
      void sync('profile')
      dismissCheckIn('migration')
      return
    }
    if (!checkIn) return
    saveCheckIn(checkIn)
    setProfile(applyCheckIn(useAppStore.getState().profile, checkIn, now))
    void sync('checkIns')
    void sync('profile')
    // One invitation per week: this week's is used up.
    dismissCheckIn(`week:${weekStart}`)
    if (dismissKey) dismissCheckIn(dismissKey)
  }

  function finish(to: string) {
    save()
    navigate(to, { replace: true })
  }

  function handleQuickLog(input: QuickLogInput) {
    const log = buildQuickLog(input)
    addLoggedSession(log)
    void syncSession(log.id)
    setShowLog(false)
    setLogged(true)
  }

  /** Re-enter the goal tree: at the node when there's a stored tree, else at the branch. */
  function goalHref(node: string): string {
    if (profile.goal?.origin === 'onboarding') return `/onboarding?from=${node}`
    return node === 'why' ? '/onboarding' : `/onboarding?why=${profile.goal?.pursuit ?? 'fitness'}`
  }

  const lines = migrationResult
    ? [
        'Goal upgraded: your plans now know where you’re starting from.',
        ...(migrationResult.patch.injuries ? [`Injuries: ${migrationResult.patch.injuries.join('; ') || 'all clear'}`] : []),
        ...(migrationResult.patch.goal?.health.conservative ? ['Conservative until your GP or physio clears you'] : []),
        ...(migrationResult.reopen ? ['Next: tell me about the date'] : []),
      ]
    : checkIn!.actions.length
      ? checkIn!.actions.map((a) => describeAction(a, facts))
      : ['No changes: keep progressing as planned.']

  const endAction = migration ? (
    migrationResult?.reopen ? (
      <Button size="lg" fullWidth onClick={() => finish(`/onboarding?why=${migrationResult.reopen}`)}>
        <Target size={18} /> {migrationResult.reopen === 'event' ? 'Set up my event' : 'Add my date'}
      </Button>
    ) : (
      <Button size="lg" fullWidth onClick={() => finish('/')}><Check size={18} /> Done</Button>
    )
  ) : (
    <div className="flex flex-col gap-2">
      {wantsLog && (
        <Button variant="secondary" fullWidth onClick={() => setShowLog(true)}>
          <Shuffle size={16} /> Log what you did instead
        </Button>
      )}
      {reopen && reopen.kind === 'reopen-goal' && (
        <Button variant="secondary" fullWidth onClick={() => finish(goalHref(reopen.node))}>
          <Target size={16} /> Update my goal
        </Button>
      )}
      {trigger === 'reactive' ? (
        <Button size="lg" fullWidth onClick={() => finish('/')}><Check size={18} /> Done</Button>
      ) : (
        <>
          <Button size="lg" fullWidth onClick={() => finish('/plan')}><Calendar size={18} /> Plan next week</Button>
          <Button variant="ghost" fullWidth onClick={() => finish('/')}>Done for now</Button>
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-xl px-4 pt-safe pb-2 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="pt-2">
          <p className="text-base font-semibold text-[#f5f5f0]">{migration ? 'Upgrade your goal' : trigger === 'reactive' ? 'Quick question' : 'Check-in'}</p>
          <p className="text-xs text-[#6a6a6a]">{migration ? 'Three questions' : 'About a minute · skip any time'}</p>
        </div>
        <button onClick={() => navigate(-1)} aria-label="Close check-in" className="w-11 h-11 -mr-2 mt-1 flex items-center justify-center rounded-full text-[#6a6a6a] hover:text-[#f5f5f0]">
          <X size={20} />
        </button>
      </div>

      <ChatFlow
        flow={flow}
        answers={answers}
        ctx={{ now }}
        onAnswer={(qid: string, v: FlowValue) => setAnswers((a) => ({ ...a, [qid]: v }))}
        onRewind={(qid) => setAnswers((a) => rewindTo(flow, a, qid))}
        endLines={[migration ? 'Thanks! Here’s what I’ll use from now on:' : trigger === 'reactive' ? 'Got it:' : 'Got it. Here’s what changes next week:']}
        endContent={
          <div className="ml-10 rounded-3xl bg-[#141414] border border-[#d97756]/40 p-4 flex flex-col gap-2">
            {lines.map((l) => (
              <p key={l} className="text-sm text-[#e5e5e0] leading-snug flex gap-2">
                <span className="text-[#d97756]">→</span>
                <span>{l}</span>
              </p>
            ))}
            {worse && (
              <p className="text-xs text-[#a8a29e] leading-snug">
                If it isn’t settling in a week or two, it’s worth getting it checked by a GP or physio.
              </p>
            )}
          </div>
        }
        endAction={endAction}
      />

      {showLog && <QuickLogSheet onSave={handleQuickLog} onClose={() => setShowLog(false)} />}
    </div>
  )
}
