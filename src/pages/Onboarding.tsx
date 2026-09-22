import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { useAutoSync } from '../hooks/useAutoSync'
import { Button } from '../components/shared/Button'
import { ClaudeMark } from '../components/shared/ClaudeMark'
import { OpenClaudeButton } from '../components/shared/OpenClaudeButton'
import {
  buildOnboardingPrompt,
  parseAthleteBackground,
  type OnboardingBasics,
} from '../lib/onboarding'
import type { ExperienceLevel, AthleteBackground, ProgramConfig, UserProfile } from '../types'
import { getMonday, toLocalISODate } from '../lib/weekUtils'
import { DEFAULT_PROGRAM_LENGTH_WEEKS } from '../lib/programProgress'
import {
  ArrowRight, ChevronLeft, Copy, Check, ShieldAlert,
  Dumbbell, Footprints, Share, Smartphone, MoreVertical, Sparkles, ClipboardPaste, CalendarRange,
} from 'lucide-react'

type StepKey =
  | 'welcome' | 'basics' | 'experience' | 'length' | 'injuries'
  | 'prompt' | 'paste' | 'baseline' | 'install' | 'finish'

const LENGTH_OPTIONS = [4, 8, 12, 16] as const

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'New to structured training' },
  { value: 'returning', label: 'Returning', hint: 'Trained before, getting back into it' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Train consistently' },
  { value: 'advanced', label: 'Advanced', hint: 'Years of structured training' },
]

export function Onboarding() {
  const navigate = useNavigate()
  const setProfile = useAppStore((s) => s.setProfile)
  const { sync } = useAutoSync()

  const [step, setStep] = useState<StepKey>('welcome')

  // Basics
  const [name, setName] = useState('')
  const [sex, setSex] = useState<'male' | 'female' | undefined>(undefined)
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null)
  const [lengthWeeks, setLengthWeeks] = useState<number>(DEFAULT_PROGRAM_LENGTH_WEEKS)
  const [injuriesText, setInjuriesText] = useState('')

  // Claude round-trip
  const [copied, setCopied] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parseError, setParseError] = useState('')
  const [background, setBackground] = useState<AthleteBackground | null>(null)

  // Baseline
  const [pushups, setPushups] = useState('')
  const [run, setRun] = useState('')

  const [finishing, setFinishing] = useState(false)

  const basics: OnboardingBasics | null = useMemo(() => {
    if (!experienceLevel) return null
    return {
      name,
      sex,
      heightCm: Number(heightCm) || undefined,
      weightKg: Number(weightKg) || undefined,
      experienceLevel,
      injuriesText,
    }
  }, [name, sex, heightCm, weightKg, experienceLevel, injuriesText])

  const promptText = useMemo(
    () => (basics ? buildOnboardingPrompt(basics) : ''),
    [basics]
  )

  // Which baseline questions to ask — driven by the training emphasis Claude
  // returned. Default to asking both until we know otherwise.
  const types = background?.program?.exerciseTypes
  const hasTypes = !!types && types.length > 0
  const asksWeights = hasTypes ? types!.includes('weights') : true
  const asksCardio = hasTypes ? types!.includes('cardio') : true
  const includeBaseline = asksWeights || asksCardio

  const steps = useMemo<StepKey[]>(() => {
    const base: StepKey[] = ['welcome', 'basics', 'experience', 'length', 'injuries', 'prompt', 'paste']
    if (includeBaseline) base.push('baseline')
    base.push('install', 'finish')
    return base
  }, [includeBaseline])

  const stepIndex = steps.indexOf(step)

  // Auto-copy the prompt when the athlete lands on the prompt step.
  useEffect(() => {
    if (step !== 'prompt' || !promptText) return
    navigator.clipboard.writeText(promptText).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2500) },
      () => setCopied(false)
    )
  }, [step, promptText])

  function go(delta: number) {
    const next = steps[stepIndex + delta]
    if (next) setStep(next)
  }

  function handlePasteNext() {
    try {
      const bg = parseAthleteBackground(pasteText)
      setBackground(bg)
      setParseError('')
      // Recompute step list with the new emphasis, then advance.
      const withBaseline = bg.program?.exerciseTypes?.length
        ? bg.program.exerciseTypes.some((t) => t === 'weights' || t === 'cardio')
        : true
      setStep(withBaseline ? 'baseline' : 'install')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not read that JSON.')
    }
  }

  function handleFinish() {
    const patch: Partial<UserProfile> = {
      name: name.trim() || 'Athlete',
      experienceLevel: experienceLevel ?? undefined,
      heightCm: Number(heightCm) > 0 ? Number(heightCm) : 0,
      weightKg: Number(weightKg) > 0 ? Number(weightKg) : 0,
      programWeek: 1,
      onboarded: true,
    }
    if (sex) patch.sex = sex

    const bg = background
    // Injuries are safety-critical: prefer Claude's structured list, but never
    // drop what the athlete typed if Claude returned none.
    patch.injuries = bg?.injuries?.length
      ? bg.injuries
      : injuriesText.trim()
        ? [injuriesText.trim()]
        : []
    if (bg?.goals) patch.goals = bg.goals
    if (bg?.dietaryNotes) patch.dietaryNotes = bg.dietaryNotes

    // Always build the program so the chosen length + a fresh start date are
    // stored — these drive week progression and the "program complete" prompt.
    const program: ProgramConfig = {
      goals: bg?.program?.goals ?? [],
      exerciseTypes: bg?.program?.exerciseTypes ?? [],
      facilities: bg?.program?.facilities ?? [],
      sports: bg?.program?.sports ?? [],
      coachingStyle: bg?.program?.coachingStyle ?? 'balanced',
      lengthWeeks,
      startDate: toLocalISODate(getMonday(new Date())),
    }
    patch.program = program
    patch.gymAccess =
      program.facilities.includes('full-gym') || program.facilities.includes('weights-at-home')

    // Fold the baseline answers into the fitness narrative so they flow into
    // every future plan prompt.
    const baseline: string[] = []
    if (pushups.trim()) baseline.push(`Max press-ups in one set: ${pushups.trim()}.`)
    if (run.trim()) baseline.push(`Furthest run in the past year: ${run.trim()}.`)
    patch.fitnessBackground = [bg?.fitnessBackground ?? '', baseline.join(' ')]
      .filter(Boolean)
      .join('\n\n')
      .trim()

    setProfile(patch)
    void sync('profile')

    // Play the flight, then drop the athlete on the home screen.
    setFinishing(true)
    setTimeout(() => navigate('/', { replace: true }), 950)
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* manual copy fallback */ }
  }

  // Per-step "can advance" gate for the footer Next button.
  const canNext =
    step === 'basics' ? name.trim().length > 0 :
    step === 'experience' ? experienceLevel !== null :
    true

  if (finishing) return <FlightToHome name={name} />

  return (
    <div className="flex flex-col min-h-svh bg-[#0a0a0a]">
      {/* Progress */}
      <div className="px-5 pt-safe">
        <div className="flex gap-1.5 pt-4">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= stepIndex ? 'bg-[#d97756]' : 'bg-[#222]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step body */}
      <div key={step} className="flex-1 flex flex-col px-5 pt-8 pb-6 fade-in">
        {step === 'welcome' && <WelcomeStep />}
        {step === 'basics' && (
          <BasicsStep
            name={name} setName={setName}
            sex={sex} setSex={setSex}
            heightCm={heightCm} setHeightCm={setHeightCm}
            weightKg={weightKg} setWeightKg={setWeightKg}
          />
        )}
        {step === 'experience' && (
          <ExperienceStep value={experienceLevel} onChange={setExperienceLevel} />
        )}
        {step === 'length' && (
          <LengthStep value={lengthWeeks} onChange={setLengthWeeks} />
        )}
        {step === 'injuries' && (
          <InjuriesStep value={injuriesText} onChange={setInjuriesText} />
        )}
        {step === 'prompt' && (
          <PromptStep
            promptText={promptText}
            copied={copied}
            onCopy={copyPrompt}
          />
        )}
        {step === 'paste' && (
          <PasteStep
            value={pasteText}
            onChange={(v) => { setPasteText(v); setParseError('') }}
            error={parseError}
          />
        )}
        {step === 'baseline' && (
          <BaselineStep
            asksWeights={asksWeights} asksCardio={asksCardio}
            pushups={pushups} setPushups={setPushups}
            run={run} setRun={setRun}
          />
        )}
        {step === 'install' && <InstallStep />}
        {step === 'finish' && <FinishStep name={name} />}
      </div>

      {/* Footer nav */}
      <div className="px-5 pb-safe">
        {step === 'finish' ? (
          <div className="pb-5">
            <Button size="lg" onClick={handleFinish} fullWidth>
              <Sparkles size={18} />
              Enter Coach Claude
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 pb-5">
            {stepIndex > 0 && (
              <Button variant="ghost" onClick={() => go(-1)} aria-label="Back">
                <ChevronLeft size={18} />
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step === 'paste' ? (
              <Button onClick={handlePasteNext} disabled={!pasteText.trim()}>
                Continue <ArrowRight size={18} />
              </Button>
            ) : (
              <Button onClick={() => go(1)} disabled={!canNext}>
                {step === 'welcome' ? 'Get started' : 'Next'}
                <ArrowRight size={18} />
              </Button>
            )}
          </div>
        )}
      </div>
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

function WelcomeStep() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
      <div className="relative">
        <div className="absolute inset-0 -m-4 rounded-full bg-[#d97756]/15 blur-2xl" aria-hidden />
        <ClaudeMark size={104} sweat className="relative" />
      </div>
      <h1 className="text-3xl font-bold text-[#f5f5f0]">Welcome to Coach Claude</h1>
      <p className="text-sm text-[#6a6a6a] leading-relaxed max-w-xs">
        I'm Clawde — your training partner. Let's spend two minutes setting up a
        plan that fits you, your goals and your body.
      </p>
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d97756]/50 transition-colors"
    />
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-[#a8a29e] mb-2">{children}</p>
}

function BasicsStep({
  name, setName, sex, setSex, heightCm, setHeightCm, weightKg, setWeightKg,
}: {
  name: string; setName: (v: string) => void
  sex: 'male' | 'female' | undefined; setSex: (v: 'male' | 'female' | undefined) => void
  heightCm: string; setHeightCm: (v: string) => void
  weightKg: string; setWeightKg: (v: string) => void
}) {
  return (
    <div>
      <StepHeading title="First, the basics" subtitle="Only your name is required — the rest helps Claude tailor weights and pacing." />
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
          <div>
            <FieldLabel>Weight (kg) <span className="text-[#4a4a4a]">opt.</span></FieldLabel>
            <TextInput
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="75"
              inputMode="decimal"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ExperienceStep({
  value, onChange,
}: { value: ExperienceLevel | null; onChange: (v: ExperienceLevel) => void }) {
  return (
    <div>
      <StepHeading title="How much training experience do you have?" subtitle="This sets how hard and how technical your first plans start out." />
      <div className="flex flex-col gap-2.5">
        {EXPERIENCE_OPTIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={`flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl border transition-all duration-150 ${
                active
                  ? 'bg-[#d97756]/12 border-[#d97756]/50'
                  : 'bg-[#161616] border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}
            >
              <div className="flex-1">
                <p className={`text-sm font-semibold ${active ? 'text-[#f5f5f0]' : 'text-[#e5e5e0]'}`}>{opt.label}</p>
                <p className="text-xs text-[#6a6a6a] mt-0.5">{opt.hint}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                active ? 'border-[#d97756] bg-[#d97756]' : 'border-[#3a3a3a]'
              }`}>
                {active && <Check size={12} className="text-white" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LengthStep({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <StepHeading
        title="How long should your program run?"
        subtitle="Pick a block to commit to. When it's done, Coach Claude will check in and help you set up the next one."
      />
      <div className="grid grid-cols-2 gap-3">
        {LENGTH_OPTIONS.map((weeks) => {
          const active = value === weeks
          return (
            <button
              key={weeks}
              onClick={() => onChange(weeks)}
              aria-pressed={active}
              className={`flex flex-col items-center justify-center gap-1 py-6 rounded-2xl border transition-all duration-150 ${
                active
                  ? 'bg-[#d97756]/12 border-[#d97756]/50'
                  : 'bg-[#161616] border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}
            >
              <span className={`text-3xl font-bold ${active ? 'text-[#d97756]' : 'text-[#f5f5f0]'}`}>{weeks}</span>
              <span className="text-xs text-[#6a6a6a]">weeks</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-[#6a6a6a] px-1">
        <CalendarRange size={14} className="text-[#d97756] shrink-0" />
        You can change this any time in Program setup.
      </div>
    </div>
  )
}

function InjuriesStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeading title="Any injuries or niggles?" subtitle="Tell me anything that affects how you train so Claude can program around it safely." />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Right shoulder dislocated last year — avoid overhead pressing. Occasional knee pain on deep squats."
        rows={4}
        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-sm text-[#f5f5f0] placeholder-[#3a3a3a] resize-none focus:outline-none focus:border-[#d97756]/50 transition-colors"
      />
      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
        <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          <span className="font-semibold">Coach Claude isn't medical advice.</span> If you have a
          serious, recent or unresolved injury, get it assessed and cleared by a qualified
          professional (physio or doctor) before starting a rehab or training program — and stop
          and seek help if anything causes sharp or worsening pain.
        </p>
      </div>
    </div>
  )
}

function PromptStep({
  promptText, copied, onCopy,
}: {
  promptText: string; copied: boolean; onCopy: () => void
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <StepHeading
        title="Let's build your background"
        subtitle="Copy this prompt and paste it into Claude (or your favourite AI agent). It'll ask a few questions, then hand you back a personalised setup."
      />
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] p-4 mb-3">
        <pre className="text-xs text-[#a8a29e] whitespace-pre-wrap font-mono leading-relaxed">
          {promptText}
        </pre>
      </div>
      <div className="flex flex-col gap-2">
        <OpenClaudeButton text={promptText} />
        <Button variant="ghost" onClick={onCopy} fullWidth>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied to clipboard' : 'Copy prompt again'}
        </Button>
      </div>
    </div>
  )
}

function PasteStep({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error: string }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <StepHeading
        title="Paste your background"
        subtitle="Once Claude replies, paste the JSON block it gives you here."
      />
      <div className="flex items-center gap-2 text-xs text-[#6a6a6a] mb-2">
        <ClipboardPaste size={14} className="text-[#d97756]" />
        Paste the block between ```json and ```
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='{ "injuries": [...], "goals": [...], "program": { ... } }'
        rows={9}
        className="flex-1 w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-xs text-[#f5f5f0] placeholder-[#2a2a2a] resize-none focus:outline-none focus:border-[#d97756]/50 font-mono"
      />
      {error && (
        <div className="mt-3 flex items-start gap-2 text-red-400 bg-red-500/10 rounded-xl p-3">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}

function BaselineStep({
  asksWeights, asksCardio, pushups, setPushups, run, setRun,
}: {
  asksWeights: boolean; asksCardio: boolean
  pushups: string; setPushups: (v: string) => void
  run: string; setRun: (v: string) => void
}) {
  return (
    <div>
      <StepHeading title="Last couple of things" subtitle="A quick baseline so your first sessions land at the right level." />
      <div className="flex flex-col gap-4">
        {asksWeights && (
          <div className="rounded-2xl bg-[#161616] border border-[#2a2a2a] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="claude-pushup" style={{ transformOrigin: '50% 80%' }}>
                <ClaudeMark size={44} idle={false} />
              </div>
              <div className="flex items-center gap-1.5 text-[#d97756]">
                <Dumbbell size={15} />
                <span className="text-sm font-semibold">Strength</span>
              </div>
            </div>
            <FieldLabel>How many press-ups can you do in one set?</FieldLabel>
            <TextInput
              value={pushups}
              onChange={(e) => setPushups(e.target.value)}
              placeholder="e.g. 20"
              inputMode="numeric"
            />
          </div>
        )}
        {asksCardio && (
          <div className="rounded-2xl bg-[#161616] border border-[#2a2a2a] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="claude-run">
                <ClaudeMark size={44} idle={false} sweat />
              </div>
              <div className="flex items-center gap-1.5 text-[#d97756]">
                <Footprints size={15} />
                <span className="text-sm font-semibold">Cardio</span>
              </div>
            </div>
            <FieldLabel>What's the furthest you've run in the past year?</FieldLabel>
            <TextInput
              value={run}
              onChange={(e) => setRun(e.target.value)}
              placeholder="e.g. 10 km, or a half marathon"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function InstallStep() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isAndroid = /android/i.test(ua)
  const installed =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches

  return (
    <div>
      <StepHeading
        title="Add Coach Claude to your home screen"
        subtitle="Install it like an app for full-screen, offline-ready access — no app store needed."
      />

      {installed ? (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
          <Check size={18} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-200/90">You're already running the installed app. Nice.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
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
      highlight ? 'bg-[#d97756]/8 border-[#d97756]/30' : 'bg-[#161616] border-[#2a2a2a]'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-[#1a1a1a] flex items-center justify-center">{icon}</div>
        <p className="text-sm font-semibold text-[#f5f5f0]">{platform}</p>
        {highlight && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-[#d97756]">You</span>}
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#d97756]/15 text-[#d97756] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-sm text-[#a8a29e] leading-snug">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FinishStep({ name }: { name: string }) {
  const first = name.trim().split(' ')[0]
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
      <div className="relative">
        <div className="absolute inset-0 -m-4 rounded-full bg-[#d97756]/15 blur-2xl" aria-hidden />
        <ClaudeMark size={104} cheer sweat className="relative" />
      </div>
      <h1 className="text-3xl font-bold text-[#f5f5f0]">
        You're all set{first ? `, ${first}` : ''}!
      </h1>
      <p className="text-sm text-[#6a6a6a] leading-relaxed max-w-xs">
        Your profile's ready. Head to the home screen and plan your first week —
        I'll have a personalised plan waiting.
      </p>
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
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] overflow-hidden">
      <p
        className="absolute left-0 right-0 text-center text-sm text-[#6a6a6a] transition-opacity duration-300"
        style={{ top: '58%', opacity: landed ? 0 : 1 }}
      >
        See you in there{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}…
      </p>
      <div
        className="claude-flight absolute"
        style={{
          left: '50%',
          top: landed ? '64px' : '42vh',
          transform: `translate(-50%, 0) scale(${landed ? 0.72 : 1.2})`,
          opacity: landed ? 0 : 1,
        }}
      >
        <ClaudeMark size={96} sweat />
      </div>
    </div>
  )
}
