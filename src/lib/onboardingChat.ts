import type {
  CoachingStyle, ExperienceLevel, ProgramConfig, ProgramExerciseType, ProgramFacility,
  ProgramGoal, UserProfile,
} from '../types'
import {
  COACHING_OPTIONS, DAYS_PER_WEEK_OPTIONS, EXERCISE_OPTIONS, EXPERIENCE_OPTIONS,
  FACILITY_OPTIONS, LENGTH_OPTIONS, daysPerWeekLabel,
} from './programOptions'
import { getMonday, toLocalISODate } from './weekUtils'
import { DEFAULT_PROGRAM_LENGTH_WEEKS } from './programProgress'

/**
 * The scripted onboarding conversation. Onboarding used to round-trip through
 * an external chatbot to build the athlete's background; we already know what
 * we need to ask, so the app now asks it directly in a chat-style UI and turns
 * the answers into clean, readable profile fields that every future week-plan
 * prompt embeds.
 *
 * Pure data + helpers — the UI lives in `components/onboarding/ChatOnboarding`.
 */

/** single → the chosen value; multi → the chosen values; text/number → the text ('' = skipped). */
export type ChatAnswer = string | string[]
export type ChatAnswers = Partial<Record<QuestionId, ChatAnswer>>

export interface ChatOption {
  value: string
  label: string
  hint?: string
}

export type QuestionId =
  | 'goals' | 'experience' | 'history' | 'types' | 'sports' | 'frequency'
  | 'equipment' | 'hasInjuries' | 'injuries' | 'pushups' | 'run'
  | 'style' | 'length'

export interface ChatQuestion {
  id: QuestionId
  /** What Clawde says before asking — one entry per chat bubble. */
  coach: (answers: ChatAnswers) => string[]
  kind: 'single' | 'multi' | 'text' | 'number'
  options?: ChatOption[]
  /** Multi-choice: values pre-selected from earlier answers. */
  preselect?: (answers: ChatAnswers) => string[]
  /** Text/number questions that can be skipped. */
  optional?: boolean
  multiline?: boolean
  placeholder?: string
  /** Hide the question entirely given earlier answers. */
  skipIf?: (answers: ChatAnswers) => boolean
}

// --- goal mapping -----------------------------------------------------------

type GoalChoice = 'strength' | 'physique' | 'mobility' | 'fitness'

const GOAL_CHOICES: (ChatOption & { value: GoalChoice; programGoal?: ProgramGoal; line: string })[] = [
  { value: 'strength', label: 'Get stronger', programGoal: 'get-strong', line: 'Build strength' },
  { value: 'physique', label: 'Build my physique', programGoal: 'look-great', line: 'Build muscle and improve physique' },
  { value: 'mobility', label: 'Mobility & flexibility', line: 'Improve mobility and flexibility' },
  { value: 'fitness', label: 'General fitness', programGoal: 'get-fit', line: 'Improve general fitness and conditioning' },
]

const CARDIO_CHOICES = ['Running', 'Cycling', 'Swimming', 'Rowing', 'Walking', 'Hiking', 'Skipping']

// --- helpers ----------------------------------------------------------------

function list(a: ChatAnswers, id: QuestionId): string[] {
  const v = a[id]
  return Array.isArray(v) ? v : []
}

function text(a: ChatAnswers, id: QuestionId): string {
  const v = a[id]
  return typeof v === 'string' ? v.trim() : ''
}

const toOptions = (opts: readonly { value: string | number; label: string; hint?: string }[]): ChatOption[] =>
  opts.map((o) => ({ value: String(o.value), label: o.label, hint: o.hint }))

// --- the script -------------------------------------------------------------

export const QUESTIONS: ChatQuestion[] = [
  {
    id: 'goals',
    kind: 'multi',
    options: GOAL_CHOICES.map(({ value, label }) => ({ value, label })),
    coach: () => [
      "Hey! I'm Clawde, your Coach Claude training partner. 🦀",
      "I'll ask a few quick questions so every plan I write fits you. Tap an answer to reply. You can tap any answer to change it later.",
      'First up: what are you training for? Pick as many as you like.',
    ],
  },
  {
    id: 'experience',
    kind: 'single',
    options: toOptions(EXPERIENCE_OPTIONS),
    coach: () => ['Nice. How much training experience do you have?'],
  },
  {
    id: 'history',
    kind: 'text',
    optional: true,
    multiline: true,
    placeholder: 'e.g. Played rugby at school, ran a half marathon last year',
    coach: () => [
      "Tell me a bit about your training history: sports you've played, what you do now, anything you're proud of.",
    ],
  },
  {
    id: 'types',
    kind: 'multi',
    options: toOptions(EXERCISE_OPTIONS),
    preselect: (a) => {
      const goals = list(a, 'goals')
      const pre: ProgramExerciseType[] = []
      if (goals.includes('strength') || goals.includes('physique')) pre.push('weights')
      if (goals.includes('fitness')) pre.push('cardio')
      if (goals.includes('mobility')) pre.push('mobility')
      return pre
    },
    coach: () => ['What kind of training do you want in your plan?'],
  },
  {
    id: 'sports',
    kind: 'multi',
    options: CARDIO_CHOICES.map((s) => ({ value: s, label: s })),
    skipIf: (a) => !list(a, 'types').includes('cardio'),
    coach: () => ['Which kinds of cardio do you enjoy?'],
  },
  {
    id: 'frequency',
    kind: 'single',
    options: DAYS_PER_WEEK_OPTIONS.map((d) => ({ value: String(d), label: `${daysPerWeekLabel(d)} days` })),
    coach: () => ['Roughly how many days a week do you want to train?'],
  },
  {
    id: 'equipment',
    kind: 'multi',
    options: toOptions(FACILITY_OPTIONS),
    coach: () => ['What equipment do you have access to?'],
  },
  {
    id: 'hasInjuries',
    kind: 'single',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No, all good' },
    ],
    coach: () => ['Any injuries or niggles I should know about?'],
  },
  {
    id: 'injuries',
    kind: 'text',
    multiline: true,
    placeholder: 'e.g. Right shoulder dislocated last year: overhead pressing hurts. Knee aches on deep squats.',
    skipIf: (a) => a.hasInjuries !== 'yes',
    coach: () => [
      "Thanks for telling me. Quick note: Coach Claude isn't medical advice. If an injury is serious, recent or unresolved, get it assessed and cleared by a physio or doctor first. And stop if anything causes sharp or worsening pain.",
      "Describe what's going on and how it behaves day to day. I'll program around it. Put each issue on its own line.",
    ],
  },
  {
    id: 'pushups',
    kind: 'number',
    optional: true,
    placeholder: 'e.g. 20',
    skipIf: (a) => !list(a, 'types').includes('weights'),
    coach: () => ["Quick baseline so your first sessions land right: how many press-ups can you do in one set?"],
  },
  {
    id: 'run',
    kind: 'text',
    optional: true,
    placeholder: 'e.g. 10 km, or a half marathon',
    skipIf: (a) => !list(a, 'types').includes('cardio'),
    coach: (a) => [
      list(a, 'types').includes('weights')
        ? "And what's the furthest you've run in the past year?"
        : "Quick baseline so your first sessions land right: what's the furthest you've run in the past year?",
    ],
  },
  {
    id: 'style',
    kind: 'single',
    options: toOptions(COACHING_OPTIONS),
    coach: () => ['How do you like to be coached?'],
  },
  {
    id: 'length',
    kind: 'single',
    options: LENGTH_OPTIONS.map((w) => ({
      value: String(w),
      label: `${w} weeks`,
      hint: w === DEFAULT_PROGRAM_LENGTH_WEEKS ? 'Recommended' : undefined,
    })),
    coach: () => [
      'Last one. How long should this program block run? When it ends, I\'ll check in and we\'ll set up the next one.',
    ],
  },
]

/** The questions that apply given the answers so far, in order. */
export function activeQuestions(answers: ChatAnswers): ChatQuestion[] {
  return QUESTIONS.filter((q) => !q.skipIf?.(answers))
}

/** The next question still waiting for an answer, or null when the chat is done. */
export function nextQuestion(answers: ChatAnswers): ChatQuestion | null {
  return activeQuestions(answers).find((q) => answers[q.id] === undefined) ?? null
}

/** Drops the answer to `id` and everything asked after it (to re-answer from there). */
export function rewindTo(answers: ChatAnswers, id: QuestionId): ChatAnswers {
  const idx = QUESTIONS.findIndex((q) => q.id === id)
  const kept: ChatAnswers = {}
  for (const q of QUESTIONS.slice(0, idx)) {
    if (answers[q.id] !== undefined) kept[q.id] = answers[q.id]
  }
  return kept
}

/** How the athlete's answer reads back in their chat bubble. */
export function answerLabel(q: ChatQuestion, answer: ChatAnswer): string {
  if (Array.isArray(answer)) {
    const labels = answer.map((v) => q.options?.find((o) => o.value === v)?.label ?? v)
    return labels.length ? labels.join(', ') : 'None'
  }
  if (q.options) return q.options.find((o) => o.value === answer)?.label ?? answer
  return answer.trim() || 'Skipped'
}

// --- answers → profile ------------------------------------------------------

const EXPERIENCE_SENTENCE: Record<ExperienceLevel, string> = {
  beginner: 'beginner (new to structured training).',
  returning: 'returning (has trained before, getting back into it).',
  intermediate: 'intermediate (trains consistently).',
  advanced: 'advanced (years of structured training).',
}

/** Ends a free-text answer with a full stop so the narrative reads cleanly. */
function sentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`
}

function splitLines(value: string, pattern: RegExp): string[] {
  return value.split(pattern).map((s) => s.trim()).filter(Boolean)
}

/**
 * Turns the chat answers into the profile fields future plan prompts embed.
 * Only answers to questions that still apply are used, and every field is set
 * explicitly so nothing from an earlier profile (or the defaults) leaks
 * through.
 */
export function answersToProfile(answers: ChatAnswers): Partial<UserProfile> {
  const active = new Set(activeQuestions(answers).map((q) => q.id))
  const get = (id: QuestionId) => (active.has(id) ? answers[id] : undefined)
  const scoped: ChatAnswers = {}
  for (const q of QUESTIONS) if (get(q.id) !== undefined) scoped[q.id] = get(q.id)

  const goalChoices = GOAL_CHOICES.filter((g) => list(scoped, 'goals').includes(g.value))
  const experience = text(scoped, 'experience') as ExperienceLevel | ''
  const days = Number(text(scoped, 'frequency')) || undefined
  const types = list(scoped, 'types') as ProgramExerciseType[]
  const facilities = list(scoped, 'equipment') as ProgramFacility[]
  const style = (text(scoped, 'style') || 'balanced') as CoachingStyle
  const lengthWeeks = Number(text(scoped, 'length')) || DEFAULT_PROGRAM_LENGTH_WEEKS

  const background: string[] = []
  if (experience) background.push(`Experience: ${EXPERIENCE_SENTENCE[experience]}`)
  if (text(scoped, 'history')) background.push(`Training history: ${sentence(text(scoped, 'history'))}`)
  if (days) background.push(`Wants to train about ${daysPerWeekLabel(days)} days a week.`)
  if (text(scoped, 'pushups')) background.push(`Max press-ups in one set: ${text(scoped, 'pushups')}.`)
  if (text(scoped, 'run')) background.push(`Furthest run in the past year: ${sentence(text(scoped, 'run'))}`)

  const program: ProgramConfig = {
    goals: goalChoices.flatMap((g) => (g.programGoal ? [g.programGoal] : [])),
    exerciseTypes: types,
    facilities,
    sports: list(scoped, 'sports'),
    coachingStyle: style,
    lengthWeeks,
    startDate: toLocalISODate(getMonday(new Date())),
    daysPerWeek: days,
  }

  return {
    goals: goalChoices.map((g) => g.line),
    experienceLevel: experience || undefined,
    fitnessBackground: background.join(' '),
    // Safety-critical: kept verbatim, one item per line the athlete wrote.
    injuries: splitLines(text(scoped, 'injuries'), /\n+/),
    program,
    gymAccess: facilities.includes('full-gym') || facilities.includes('weights-at-home'),
    programWeek: 1,
  }
}
