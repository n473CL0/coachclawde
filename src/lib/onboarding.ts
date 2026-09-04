import type {
  AthleteBackground,
  CoachingStyle,
  ExperienceLevel,
  ProgramConfig,
  ProgramExerciseType,
  ProgramFacility,
  ProgramGoal,
} from '../types'

/** The basics the athlete enters in-app before the Claude round-trip. */
export interface OnboardingBasics {
  name: string
  sex?: 'male' | 'female'
  heightCm?: number
  weightKg?: number
  experienceLevel: ExperienceLevel
  /** Free-text injuries / health notes — safety-critical context for Claude. */
  injuriesText: string
}

const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  beginner: 'Beginner — new to structured training',
  returning: 'Returning — trained before, getting back into it',
  intermediate: 'Intermediate — trains consistently',
  advanced: 'Advanced — experienced, structured training for years',
}

/**
 * Builds the onboarding prompt the athlete pastes into any AI chatbot. It is
 * fully SELF-CONTAINED — it embeds the JSON schema, the allowed values and the
 * key safety guidance inline — because the average user pastes it into Claude,
 * ChatGPT or similar with no connection to this repo, so it can't reference
 * `CLAUDE.md`. The assistant expands the basics into a structured "Athlete
 * Background" JSON which the app then merges into the profile.
 */
export function buildOnboardingPrompt(basics: OnboardingBasics): string {
  const bits: string[] = [`- Name: ${basics.name.trim() || 'Athlete'}`]
  if (basics.sex) bits.push(`- Sex: ${basics.sex}`)
  if (basics.heightCm) bits.push(`- Height: ${basics.heightCm}cm`)
  if (basics.weightKg) bits.push(`- Weight: ${basics.weightKg}kg`)
  bits.push(`- Experience: ${EXPERIENCE_LABEL[basics.experienceLevel]}`)
  bits.push(`- Injuries / health notes: ${basics.injuriesText.trim() || 'None reported'}`)

  return `You are helping me set up a personalised profile for Coach Claude, a workout-tracking app. I'll paste your answer back into the app, so follow these instructions exactly.

## About me
${bits.join('\n')}

## What I need from you
First, ask me a few friendly follow-up questions to get to know me — my training goals, what equipment or gym access I have, what kinds of training I enjoy, any dietary needs, and how any injuries behave day to day. Once you have enough, output my profile.

## How to format your answer
Output a SINGLE \`\`\`json code block (and nothing else before it) that exactly matches this schema, then a short, friendly plain-English summary after it:

\`\`\`json
{
  "injuries": ["string"],
  "goals": ["string"],
  "fitnessBackground": "string",
  "dietaryNotes": ["string"],
  "program": {
    "goals": ["get-fit" | "get-strong" | "look-great"],
    "exerciseTypes": ["weights" | "cardio" | "mobility"],
    "facilities": ["yoga-mat" | "weights-at-home" | "full-gym"],
    "sports": ["string"],
    "coachingStyle": "supportive" | "balanced" | "intense"
  }
}
\`\`\`

Field notes:
- "injuries": expand my notes above into clear, specific, safety-critical items. Never omit anything I mentioned.
- "goals": my training goals, in plain language.
- "fitnessBackground": a short narrative — my history, current level and any relevant context.
- "dietaryNotes": e.g. ["Gluten-free"]. Use [] if none.
- "program.goals": one or more of the three values shown. Pick what fits my aims.
- "program.exerciseTypes": one or more of "weights", "cardio", "mobility" — only the kinds of training I want.
- "program.facilities": where/what I can train with, from the values shown.
- "program.sports": my preferred cardio types as free text, e.g. ["Running", "Rowing"]. Only relevant if "cardio" is in exerciseTypes; otherwise [].
- "program.coachingStyle": how I want you to coach me.
- Use only the exact string values shown for the enum fields. Every field is optional — include as much as you reasonably can — but keep the structure.

## Safety (important)
- Treat anything I mention about injuries or health as safety-critical: capture it clearly in "injuries" and let it shape my goals and program, using your own judgement about which movements, ranges and loads to favour or avoid for me specifically. Don't assume injuries I haven't mentioned.
- This is general fitness guidance, not medical advice. If I describe a serious, recent or unresolved injury, note in "fitnessBackground" that I should get it assessed and cleared by a qualified professional before training around it.`
}

// --- parsing the pasted-back background ------------------------------------

const GOALS: ProgramGoal[] = ['get-fit', 'get-strong', 'look-great']
const TYPES: ProgramExerciseType[] = ['weights', 'cardio', 'mobility']
const FACILITIES: ProgramFacility[] = ['yoga-mat', 'weights-at-home', 'full-gym']
const STYLES: CoachingStyle[] = ['supportive', 'balanced', 'intense']

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

function keepKnown<T extends string>(value: unknown, allowed: T[]): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is T => allowed.includes(v as T))
}

/**
 * Pulls the JSON object out of whatever Claude pasted back. Tolerates a
 * surrounding ```json fence or leading/trailing prose by grabbing the first
 * balanced `{ … }` block.
 */
function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : raw).trim()
  if (candidate.startsWith('{')) return candidate
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Couldn't find a JSON object in what you pasted.")
  }
  return candidate.slice(start, end + 1)
}

/**
 * Parses the pasted Athlete Background into a clean, validated object. Lenient
 * by design — unknown fields are dropped and enum values are filtered — so a
 * slightly-off paste still imports rather than throwing.
 */
export function parseAthleteBackground(raw: string): AthleteBackground {
  if (!raw.trim()) throw new Error('Paste the JSON block from Claude first.')

  let data: unknown
  try {
    data = JSON.parse(extractJsonObject(raw))
  } catch (e) {
    throw new Error(
      e instanceof Error && e.message.startsWith("Couldn't")
        ? e.message
        : "That doesn't look like valid JSON — copy the whole block Claude gave you.",
      { cause: e }
    )
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Expected a JSON object describing your background.')
  }

  const obj = data as Record<string, unknown>
  const bg: AthleteBackground = {}

  const injuries = asStringArray(obj.injuries)
  if (injuries) bg.injuries = injuries
  const goals = asStringArray(obj.goals)
  if (goals) bg.goals = goals
  if (typeof obj.fitnessBackground === 'string') bg.fitnessBackground = obj.fitnessBackground.trim()
  const diet = asStringArray(obj.dietaryNotes)
  if (diet) bg.dietaryNotes = diet

  if (obj.program && typeof obj.program === 'object' && !Array.isArray(obj.program)) {
    const p = obj.program as Record<string, unknown>
    const program: Partial<ProgramConfig> = {
      goals: keepKnown(p.goals, GOALS),
      exerciseTypes: keepKnown(p.exerciseTypes, TYPES),
      facilities: keepKnown(p.facilities, FACILITIES),
      sports: asStringArray(p.sports) ?? [],
      coachingStyle: STYLES.includes(p.coachingStyle as CoachingStyle)
        ? (p.coachingStyle as CoachingStyle)
        : 'balanced',
    }
    bg.program = program
  }

  return bg
}
