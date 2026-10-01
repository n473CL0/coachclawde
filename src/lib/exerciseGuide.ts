/**
 * Movement guides from free-exercise-db (https://github.com/yuhonas/free-exercise-db,
 * public domain): ~870 exercises with step-by-step instructions and start/end
 * photos. The dataset (~1 MB) is fetched lazily from jsDelivr the first time a
 * session opens and cached by the service worker (see `vite.config.ts`), so
 * guides keep working offline in the gym.
 *
 * Plans are written by Claude, so names won't always match the library
 * exactly — `findExercise` does a forgiving token match and returns null when
 * nothing is close; the UI then falls back to a YouTube search.
 */

export const EXERCISE_DB_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main'

export interface ExerciseDbEntry {
  id: string
  name: string
  force: string | null
  level: string
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

interface IndexedEntry {
  entry: ExerciseDbEntry
  key: string
  tokens: Set<string>
}

let dbPromise: Promise<IndexedEntry[]> | null = null
let dbCache: IndexedEntry[] | null = null
const matchCache = new Map<string, ExerciseDbEntry | null>()

/** Fetches (once) and indexes the exercise library. Retries after a failure. */
export function loadExerciseDb(): Promise<IndexedEntry[]> {
  if (!dbPromise) {
    dbPromise = fetch(`${EXERCISE_DB_BASE}/dist/exercises.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Exercise library unavailable (${res.status})`)
        return res.json() as Promise<ExerciseDbEntry[]>
      })
      .then((entries) => {
        dbCache = entries.map((entry) => {
          const tokens = tokenize(entry.name)
          return { entry, key: [...tokens].join(' '), tokens: new Set(tokens) }
        })
        return dbCache
      })
      .catch((e) => {
        dbPromise = null
        throw e
      })
  }
  return dbPromise
}

/** Starts the download in the background so guides are ready (and cached) mid-session. */
export function warmExerciseDb(): void {
  loadExerciseDb().catch(() => { /* the guide shows its own offline state */ })
}

/** True once the library is loaded, so a guide can render without a loading flash. */
export function isExerciseDbLoaded(): boolean {
  return dbCache !== null
}

export function exerciseImageUrl(path: string): string {
  return `${EXERCISE_DB_BASE}/exercises/${path}`
}

export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`
}

// --- matching ---------------------------------------------------------------

const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell', dbs: 'dumbbell', dumbell: 'dumbbell',
  bb: 'barbell', kb: 'kettlebell',
  rdl: 'romanian deadlift', sldl: 'stiff leg deadlift',
  ohp: 'overhead press', bw: 'bodyweight',
  // Joined / regional spellings the library writes as separate words
  pushup: 'push up', pullup: 'pull up', chinup: 'chin up', situp: 'sit up',
  pressup: 'push up', stepup: 'step up',
  fly: 'flye',
}

/**
 * Common plan names → the library's name for that movement. Applied to the
 * planned name only (after tokenising), so e.g. "Lat Pulldown" finds
 * "Wide-Grip Lat Pulldown".
 */
const PHRASE_ALIASES: [string, string][] = [
  ['lat pulldown', 'wide grip lat pulldown'],
  ['hamstring curl', 'lying leg curl'],
  ['farmer carry', 'farmer walk'],
  ['bicep curl', 'dumbbell bicep curl'],
  ['kettlebell swing', 'one arm kettlebell swing'],
  ['lateral raise', 'side lateral raise'],
  ['side plank', 'side bridge'],
  ['calf raise', 'standing calf raise'],
  ['chest flye', 'dumbbell flye'],
  ['pec deck', 'butterfly'],
]

/** Words that add nothing to identifying the movement. */
const STOPWORDS = new Set(['s', 'a', 'an', 'the', 'with', 'on', 'to', 'and', 'of', 'for', 'each', 'x'])

/** Modifiers dropped only on a second, looser pass. */
const MODIFIERS = new Set([
  'alternating', 'alternate', 'slow', 'tempo', 'paused', 'pause', 'light', 'heavy', 'assisted',
  'banded', 'weighted', 'controlled', 'dynamic', 'bodyweight', 'single', 'double', 'bilateral',
  'unilateral', 'modified', 'kneeling', 'standing', 'seated', 'lying', 'supported', 'split',
])

function singular(word: string): string {
  if (word.length <= 2 || word.endsWith('ss') || word.endsWith('us')) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

function tokenize(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/['’]/g, '')
    .replace(/press[\s-]?ups?\b/g, 'push up')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    const expanded = ABBREVIATIONS[w] ?? ABBREVIATIONS[singular(w)] ?? singular(w)
    for (const t of expanded.split(' ')) {
      if (!STOPWORDS.has(t)) out.push(t)
    }
  }
  return out
}

/** Tokens for a planned name, with common phrasings mapped to the library's. */
function queryTokens(name: string): string[] {
  let key = ` ${tokenize(name).join(' ')} `
  for (const [from, to] of PHRASE_ALIASES) {
    if (key.includes(` ${from} `) && !key.includes(` ${to} `)) key = key.replace(` ${from} `, ` ${to} `)
  }
  return key.trim().split(' ').filter(Boolean)
}

function score(query: Set<string>, candidate: Set<string>): number {
  let shared = 0
  for (const t of query) if (candidate.has(t)) shared++
  if (shared === 0) return 0
  const union = query.size + candidate.size - shared
  let s = shared / union
  // The library entry is a more general form of what was asked for
  // ("Dumbbell Bench Press" for "Flat Dumbbell Bench Press"). One-word
  // entries don't qualify — "Plank" is not a guide for "Side Plank".
  if (shared === candidate.size && candidate.size >= 2) s += 0.15
  return s
}

function bestMatch(db: IndexedEntry[], tokens: string[]): { entry: ExerciseDbEntry; score: number } | null {
  if (tokens.length === 0) return null
  const key = tokens.join(' ')
  const query = new Set(tokens)
  let best: { entry: ExerciseDbEntry; score: number } | null = null
  for (const e of db) {
    if (e.key === key) return { entry: e.entry, score: 2 }
    const s = score(query, e.tokens)
    // Ties go to the shorter (more canonical) name.
    if (!best || s > best.score || (s === best.score && e.entry.name.length < best.entry.name.length)) {
      best = { entry: e.entry, score: s }
    }
  }
  return best
}

const THRESHOLD = 0.55

/** The library exercise that best matches a planned exercise name, or null. */
export function findExercise(db: IndexedEntry[], name: string): ExerciseDbEntry | null {
  const cacheKey = name.trim().toLowerCase()
  if (matchCache.has(cacheKey)) return matchCache.get(cacheKey)!

  const tokens = queryTokens(name)
  let match = bestMatch(db, tokens)
  if (!match || match.score < THRESHOLD) {
    const loose = tokens.filter((t) => !MODIFIERS.has(t))
    if (loose.length && loose.length < tokens.length) {
      const second = bestMatch(db, loose)
      if (second && (!match || second.score > match.score)) match = second
    }
  }
  const result = match && match.score >= THRESHOLD ? match.entry : null
  matchCache.set(cacheKey, result)
  return result
}
