import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { Button } from '../components/shared/Button'
import { ClawdeMark } from '../components/shared/ClawdeMark'
import { ChatFlow } from '../components/onboarding/ChatFlow'
import { ConfirmCard } from '../components/onboarding/ConfirmCard'
import { rewindTo, type FlowAnswers, type FlowValue } from '../lib/flow'
import { GOAL_FLOW, confirmationRows, mergeGoalUpdate, profilePatchFromGoal, toGoalProfile } from '../lib/goalFlow'
import type { UserProfile } from '../types'
import { markVersionSeen } from '../lib/appVersion'
import { isValidBirthDate } from '../lib/dateUtils'
import { toLocalISODate } from '../lib/weekUtils'
import { FixedLayer } from '../components/layout/FixedLayer'
import {
  ArrowRight, ChevronDown, ChevronLeft, ChevronUp, Check, Share, Smartphone, MoreVertical, Sparkles,
} from 'lucide-react'

type StepKey = 'chat' | 'about' | 'finish'
const STEPS: StepKey[] = ['chat', 'about', 'finish']

/**
 * First-run onboarding, in three screens:
 *  1. a chat with Clawde that walks the goal tree (lib/goalFlow) and ends on a
 *     "here's what I heard" card,
 *  2. "About you": name (required) and optional stats,
 *  3. a finish screen with install-to-home-screen tips.
 *
 * `?from=<node>` re-enters the tree at a node for an athlete who's already
 * onboarded ("my race moved", from a check-in): earlier answers are kept,
 * later ones become drafts, and saving skips the About/finish screens.
 */
export function Onboarding() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const profile = useAppStore((s) => s.profile)
  const setProfile = useAppStore((s) => s.setProfile)
  const { sync } = useAutoSync()

  // About you — pre-filled when an existing athlete re-onboards (new stores
  // carry placeholder defaults, so only trust the profile once onboarded).
  const known = profile.onboarded ? profile : null
  const from = params.get('from')
  const why = params.get('why')
  const stored = (known?.goal?.origin === 'onboarding' ? known.goal.answers : undefined) as FlowAnswers | undefined
  // Re-entry: at a node of a stored tree, or (for a pre-v1.0.2 athlete) at a branch.
  const atNode = !!(from && stored && GOAL_FLOW.nodes[from])
  const atBranch = !!(known && why && ['event', 'fitness', 'physique', 'strength', 'sport', 'tracker'].includes(why))
  const reentry = atNode || atBranch

  const [step, setStep] = useState<StepKey>('chat')
  const [answers, setAnswers] = useState<FlowAnswers>(() => (atNode ? rewindTo(GOAL_FLOW, stored!, from!) : atBranch ? { why: why! } : {}))
  const [anythingElse, setAnythingElse] = useState('')
  const [name, setName] = useState(known?.name ?? '')
  const [birthDate, setBirthDate] = useState(known?.birthDate ?? '')
  const [sex, setSex] = useState<'male' | 'female' | undefined>(known?.sex)
  const [heightCm, setHeightCm] = useState(known?.heightCm ? String(known.heightCm) : '')
  const [weightKg, setWeightKg] = useState(known?.weightKg ? String(known.weightKg) : '')

  const [finishing, setFinishing] = useState(false)
  // Fixed for the whole chat so reflections don't shift under the athlete.
  const [now] = useState(() => new Date())
  const ctx = useMemo(() => ({ now, weightKg: Number(weightKg) > 0 ? Number(weightKg) : undefined }), [now, weightKg])
  const goal = useMemo(() => toGoalProfile(answers, ctx), [answers, ctx])

  const stepIndex = STEPS.indexOf(step)

  function handleAnswer(id: string, answer: FlowValue) {
    setAnswers((a) => ({ ...a, [id]: answer }))
  }

  function buildPatch(): Partial<UserProfile> {
    const merged = mergeGoalUpdate(known?.goal, goal)
    return profilePatchFromGoal(merged, {
      now,
      coachingStyle: known?.program?.coachingStyle,
      anythingElse: anythingElse || undefined,
    })
  }

  /** Re-entry: the athlete has a profile already, so save straight away. */
  function handleSaveUpdate() {
    const patch = buildPatch()
    // A goal update keeps the block running unless the date changed it.
    if (atNode && known?.program?.startDate && patch.program && !from?.startsWith('ev.') && !from?.startsWith('phy.') && from !== 'why') {
      patch.program = { ...patch.program, startDate: known.program.startDate, lengthWeeks: known.program.lengthWeeks }
    }
    // Injuries are safety-critical: anything no longer listed moves to the
    // injury history rather than vanishing.
    const removed = (known?.injuries ?? []).filter((i) => !(patch.injuries ?? []).includes(i))
    if (removed.length && patch.goal) {
      patch.goal = { ...patch.goal, health: { ...patch.goal.health, pastInjuries: [...new Set([...(patch.goal.health.pastInjuries ?? []), ...removed])] } }
    }
    setProfile(patch)
    void sync('profile')
    navigate('/', { replace: true })
  }

  function handleFinish() {
    const patch: Partial<UserProfile> = {
      ...buildPatch(),
      name: name.trim() || 'Athlete',
      birthDate: isValidBirthDate(birthDate) ? birthDate : undefined,
      heightCm: Number(heightCm) > 0 ? Number(heightCm) : 0,
      weightKg: Number(weightKg) > 0 ? Number(weightKg) : 0,
      onboarded: true,
    }
    if (sex) patch.sex = sex
    // Onboarding doesn't ask about diet (it's a check-in question). Keep a
    // re-onboarding athlete's notes, but start new athletes clean.
    if (!profile.onboarded) patch.dietaryNotes = []

    setProfile(patch)
    void sync('profile')
    // Release notes are for testers who've seen an earlier build — don't greet
    // a brand-new athlete with a changelog.
    if (!profile.onboarded) markVersionSeen()

    // Play the flight, then drop the athlete on the home screen.
    setFinishing(true)
    setTimeout(() => navigate('/', { replace: true }), 950)
  }

  if (finishing) return <FlightToHome name={name} />

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      {/* Progress */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] px-5 pt-safe pb-2">
        <div className="flex gap-1.5 pt-4">
          {(reentry ? ['chat'] : STEPS).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= stepIndex ? 'bg-[#d97756]' : 'bg-[#222]'
              }`}
            />
          ))}
        </div>
      </div>

      {step === 'chat' ? (
        <ChatFlow
          flow={GOAL_FLOW}
          answers={answers}
          ctx={ctx}
          initialDrafts={atNode ? stored : known?.injuries.length ? { 'health.injury': known.injuries.join('\n') } : undefined}
          onAnswer={handleAnswer}
          onRewind={(id) => setAnswers((a) => rewindTo(GOAL_FLOW, a, id))}
          endLines={["Here's what I heard. Tap a line to change it."]}
          endContent={
            <ConfirmCard
              rows={confirmationRows(goal, ctx)}
              onEdit={(id) => setAnswers((a) => rewindTo(GOAL_FLOW, a, id))}
              anythingElse={anythingElse}
              onAnythingElse={setAnythingElse}
            />
          }
          endAction={
            <Button size="lg" fullWidth onClick={reentry ? handleSaveUpdate : () => setStep('about')}>
              {reentry ? 'Save my goal' : 'Looks right'} <ArrowRight size={18} />
            </Button>
          }
        />
      ) : (
        <>
          <div key={step} className="flex-1 flex flex-col px-5 pt-6 pb-6 fade-in">
            {step === 'about' && (
              <AboutStep
                name={name} setName={setName}
                birthDate={birthDate} setBirthDate={setBirthDate}
                sex={sex} setSex={setSex}
                heightCm={heightCm} setHeightCm={setHeightCm}
                weightKg={weightKg} setWeightKg={setWeightKg}
                showWeight={goal.pursuit === 'physique'}
              />
            )}
            {step === 'finish' && <FinishStep name={name} />}
          </div>

          {/* Footer nav */}
          <div className="px-5 pb-edge">
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => setStep(STEPS[stepIndex - 1])} aria-label="Back">
                <ChevronLeft size={18} />
                Back
              </Button>
              <div className="flex-1" />
              {step === 'about' ? (
                <Button onClick={() => setStep('finish')} disabled={!name.trim()}>
                  Next <ArrowRight size={18} />
                </Button>
              ) : (
                <Button onClick={handleFinish}>
                  <Sparkles size={18} />
                  Enter Coach Clawde
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// --- steps ------------------------------------------------------------------

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-[#f5f5f0] leading-tight">{title}</h1>
      {subtitle && <p className="text-sm text-[#6a6a6a] mt-2 leading-relaxed">{subtitle}</p>}
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-base text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 transition-colors"
    />
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-[#a8a29e] mb-2">{children}</p>
}

function AboutStep({
  name, setName, birthDate, setBirthDate, sex, setSex, heightCm, setHeightCm, weightKg, setWeightKg, showWeight,
}: {
  name: string; setName: (v: string) => void
  birthDate: string; setBirthDate: (v: string) => void
  sex: 'male' | 'female' | undefined; setSex: (v: 'male' | 'female' | undefined) => void
  heightCm: string; setHeightCm: (v: string) => void
  weightKg: string; setWeightKg: (v: string) => void
  /** Physique goals track body weight, so it's shown up front. */
  showWeight: boolean
}) {
  const [more, setMore] = useState(!!(heightCm || sex))
  const weightField = (
    <div>
      <FieldLabel>Weight (kg) <span className="text-[#4a4a4a]">opt.</span></FieldLabel>
      <TextInput
        value={weightKg}
        onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder="75"
        inputMode="decimal"
      />
    </div>
  )
  return (
    <div>
      <StepHeading title="A bit about you" subtitle="Only your name is required. The rest helps Clawde pitch your weights and pacing." />
      <div className="flex flex-col gap-5">
        <div>
          <FieldLabel>What should I call you? *</FieldLabel>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            autoCapitalize="words"
          />
        </div>

        <div>
          <FieldLabel>Date of birth <span className="text-[#4a4a4a]">(optional)</span></FieldLabel>
          <TextInput
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            min="1900-01-01"
            max={toLocalISODate(new Date())}
            style={{ colorScheme: 'dark' }}
          />
        </div>

        {showWeight && weightField}

        <button
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="flex items-center gap-2 text-sm text-[#a8a29e] self-start py-1"
        >
          More about you {more ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {more && (
          <div className="flex flex-col gap-5 fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Height (cm) <span className="text-[#4a4a4a]">opt.</span></FieldLabel>
                <TextInput
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="180"
                  inputMode="decimal"
                />
              </div>
              {!showWeight && weightField}
            </div>

            <div>
              <FieldLabel>Sex <span className="text-[#4a4a4a]">(optional)</span></FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {([['male', 'Male'], ['female', 'Female'], ['skip', 'Prefer not to say']] as const).map(
                  ([value, label]) => {
                    const active = value === 'skip' ? sex === undefined : sex === value
                    return (
                      <button
                        key={value}
                        onClick={() => setSex(value === 'skip' ? undefined : value)}
                        aria-pressed={active}
                        className={`px-2 py-2.5 rounded-2xl text-xs font-medium transition-all duration-150 ${
                          active
                            ? 'bg-[#d97756] text-white shadow-lg shadow-[#d97756]/20'
                            : 'bg-[#1a1a1a] text-[#6a6a6a] border border-[#2a2a2a] hover:text-[#a8a29e]'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  }
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FinishStep({ name }: { name: string }) {
  const first = name.trim().split(' ')[0]
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 py-6">
        <div className="relative">
          <div className="absolute inset-0 -m-4 rounded-full bg-[#d97756]/15 blur-2xl" aria-hidden />
          <ClawdeMark size={104} cheer sweat className="relative" />
        </div>
        <h1 className="text-3xl font-bold text-[#f5f5f0]">
          You're all set{first ? `, ${first}` : ''}!
        </h1>
        <p className="text-sm text-[#6a6a6a] leading-relaxed max-w-xs">
          Your profile's ready. Head to the home screen and plan your first week.
          I'll have a personalised plan waiting.
        </p>
      </div>
      <InstallTips />
    </div>
  )
}

/** Collapsible "add to home screen" instructions for the athlete's platform. */
function InstallTips() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  // iPadOS Safari reports a Mac user agent; a touch-capable "Mac" is an iPad.
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (typeof navigator !== 'undefined' && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isAndroid = /android/i.test(ua)
  const installed =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches
  const [open, setOpen] = useState(false)

  if (installed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
        <Check size={18} className="text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-200/90">You're already running the installed app. Nice.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#161616] border border-[#2a2a2a]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <div className="w-8 h-8 rounded-xl bg-[#1a1a1a] flex items-center justify-center shrink-0">
          <Smartphone size={16} className="text-[#d97756]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#f5f5f0]">Add Coach Clawde to your home screen</p>
          <p className="text-xs text-[#6a6a6a]">Full-screen and offline-ready. No app store needed.</p>
        </div>
        {open ? <ChevronUp size={16} className="text-[#4a4a4a]" /> : <ChevronDown size={16} className="text-[#4a4a4a]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 fade-in">
          {!isAndroid && (
            <InstallCard
              icon={<Share size={18} className="text-[#d97756]" />}
              platform="iPhone & iPad (Safari)"
              highlight={isIOS}
              steps={[
                'Tap the Share button in the toolbar',
                "Scroll down and tap 'Add to Home Screen'",
                "Tap 'Add' in the top corner",
              ]}
            />
          )}
          {!isIOS && (
            <InstallCard
              icon={<MoreVertical size={18} className="text-[#d97756]" />}
              platform="Android (Chrome)"
              highlight={isAndroid}
              steps={[
                'Tap the ⋮ menu, top-right',
                "Tap 'Add to Home screen' or 'Install app'",
                "Confirm with 'Add' / 'Install'",
              ]}
            />
          )}
          {!isIOS && !isAndroid && (
            <p className="text-xs text-[#6a6a6a] px-1">
              On desktop, look for the <Smartphone size={12} className="inline -mt-0.5" /> install
              icon in your browser's address bar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function InstallCard({
  icon, platform, steps, highlight,
}: { icon: React.ReactNode; platform: string; steps: string[]; highlight: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      highlight ? 'bg-[#d97756]/8 border-[#d97756]/30' : 'bg-[#111] border-[#2a2a2a]'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-[#1a1a1a] flex items-center justify-center">{icon}</div>
        <p className="text-sm font-semibold text-[#f5f5f0]">{platform}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#d97756]/15 text-[#d97756] text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-sm text-[#a8a29e] leading-snug">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The closing flourish — Clawde flies from the centre of the finish screen up to
 * the spot it lives in on the home header, then we navigate home.
 */
function FlightToHome({ name }: { name: string }) {
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setLanded(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <FixedLayer>
      <div className="absolute inset-0 z-50 bg-[#0a0a0a] overflow-hidden">
        <p
          className="absolute left-0 right-0 text-center text-sm text-[#6a6a6a] transition-opacity duration-300"
          style={{ top: '58%', opacity: landed ? 0 : 1 }}
        >
          See you in there{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}…
        </p>
        <div
          className="clawde-flight absolute"
          style={{
            // Landing point tracks Home's mascot: below the status bar, and
            // centred in the content column (offset by the sidebar on iPad).
            left: 'var(--flight-x)',
            top: landed ? 'var(--flight-landing-y)' : '42vh',
            transform: `translate(-50%, 0) scale(${landed ? 0.72 : 1.2})`,
            opacity: landed ? 0 : 1,
          }}
        >
          <ClawdeMark size={96} sweat />
        </div>
      </div>
    </FixedLayer>
  )
}
