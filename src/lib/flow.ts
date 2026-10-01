/**
 * A deterministic chat flow as data. Onboarding (lib/goalFlow) and check-ins
 * (lib/checkIn) are both graphs of nodes with explicit edges; the chat UI
 * (components/onboarding/ChatFlow) renders whichever flow it's given.
 *
 * No AI anywhere: the same answers always give the same questions. Because
 * it's pure data, every path can be enumerated in tests, which is how the
 * "never more than 10 questions" promise is enforced.
 */

/**
 * single → the chosen value (an option with an inline input is
 * "value:payload"); multi → the chosen values; text/number/date → the text
 * ('' = skipped); days/compound → a record of field values.
 */
export type FlowValue = string | string[] | Record<string, string>
export type FlowAnswers = Record<string, FlowValue | undefined>

export const END = 'end'

export interface ChatOption {
  value: string
  label: string
  hint?: string
  /** Choosing this option reveals an inline input; the answer is "value:payload". */
  input?: 'duration' | 'date' | 'text'
  /** For a duration input: show an hours box (half marathon and up). */
  hours?: boolean
  placeholder?: string
}

export interface CompoundField {
  key: string
  label: string
  kind: 'chips' | 'duration' | 'lift'
  options?: ChatOption[]
  /** Pre-selected chip value. */
  initial?: string
  /** Duration: include an hours box. Function of the chips chosen so far. */
  hours?: (values: Record<string, string>) => boolean
  /** A field that may be left empty. */
  optional?: boolean
}

/** Anything the reflections need that isn't an answer (deterministic in tests). */
export interface FlowContext {
  now: Date
  /** Body weight, when known, for the fat-loss reflection. */
  weightKg?: number
}

export type NodeKind = 'single' | 'multi' | 'text' | 'number' | 'date' | 'days' | 'compound'

export interface FlowNode {
  id: string
  kind: NodeKind
  /** What Clawde says before asking: one entry per bubble. Reflections live here. */
  coach: (a: FlowAnswers, ctx: FlowContext) => string[]
  options?: ChatOption[] | ((a: FlowAnswers) => ChatOption[])
  /** multi: values pre-selected from earlier answers (one tap to confirm). */
  preselect?: (a: FlowAnswers) => string[]
  /** multi: an option that clears the others ("All good"). */
  exclusive?: string
  /** multi: most options that can be picked. */
  max?: number
  /** text/date/compound: a chip that skips the input with `skip.value`. */
  skip?: { value: string; label: string }
  /** text/number: may be sent empty. */
  optional?: boolean
  multiline?: boolean
  placeholder?: string
  fields?: CompoundField[] | ((a: FlowAnswers) => CompoundField[])
  /** Representative answers for non-choice kinds, for path enumeration. */
  samples?: FlowValue[]
  /** How the answer reads back in the athlete's bubble (defaults from options). */
  label?: (v: FlowValue, a: FlowAnswers) => string
  /** The explicit edge: next node id, or END. */
  next: (a: FlowAnswers) => string
}

export interface Flow {
  start: string
  nodes: Record<string, FlowNode>
}

export function optionsOf(node: FlowNode, a: FlowAnswers): ChatOption[] {
  return typeof node.options === 'function' ? node.options(a) : node.options ?? []
}

export function fieldsOf(node: FlowNode, a: FlowAnswers): CompoundField[] {
  return typeof node.fields === 'function' ? node.fields(a) : node.fields ?? []
}

/** Pure: the path answered so far and the next unanswered node (or END). */
export function walk(flow: Flow, answers: FlowAnswers): { path: string[]; next: string } {
  const path: string[] = []
  const seen = new Set<string>()
  let id = flow.start
  while (id !== END && answers[id] !== undefined) {
    if (seen.has(id)) throw new Error(`Cycle in flow at "${id}"`)
    const node = flow.nodes[id]
    if (!node) throw new Error(`Unknown node "${id}"`)
    seen.add(id)
    path.push(id)
    id = node.next(answers)
  }
  return { path, next: id }
}

/** Keeps only the answers on the current path. Off-path answers never leak into a profile. */
export function scopedAnswers(flow: Flow, answers: FlowAnswers): FlowAnswers {
  const out: FlowAnswers = {}
  for (const id of walk(flow, answers).path) out[id] = answers[id]
  return out
}

/** Drops the answer to `id` and everything after it on the path, to re-answer from there. */
export function rewindTo(flow: Flow, answers: FlowAnswers, id: string): FlowAnswers {
  const kept: FlowAnswers = {}
  for (const p of walk(flow, answers).path) {
    if (p === id) break
    kept[p] = answers[p]
  }
  return kept
}

/** Splits an inline-input answer "value:payload". */
export function splitInline(v: FlowValue | undefined): { value: string; payload: string } {
  if (typeof v !== 'string') return { value: '', payload: '' }
  const i = v.indexOf(':')
  return i < 0 ? { value: v, payload: '' } : { value: v.slice(0, i), payload: v.slice(i + 1) }
}

/** Candidate answers for one node, used to walk every branch. */
function candidates(node: FlowNode, a: FlowAnswers): FlowValue[] {
  const opts = optionsOf(node, a)
  const out: FlowValue[] = []
  if (node.kind === 'single') {
    for (const o of opts) {
      if (!o.input) out.push(o.value)
      else out.push(`${o.value}:${o.input === 'duration' ? '3600' : o.input === 'date' ? '2027-03-21' : 'x'}`)
    }
  } else if (node.kind === 'multi') {
    for (const o of opts) out.push([o.value])
    if (opts.length > 1 && !node.exclusive) out.push(opts.map((o) => o.value).slice(0, node.max ?? opts.length))
  }
  if (node.samples) out.push(...node.samples)
  if (node.skip) out.push(node.skip.value)
  if (!out.length) out.push(node.kind === 'days' || node.kind === 'compound' ? {} : 'x')
  return out
}

/**
 * Every distinct question sequence through the flow. Throws on a cycle or a
 * dangling edge, so a broken graph fails its tests.
 */
export function enumeratePaths(flow: Flow, limit = 50): string[][] {
  const results = new Map<string, string[]>()
  const go = (id: string, answers: FlowAnswers, path: string[]) => {
    if (id === END) {
      results.set(path.join('>'), path)
      return
    }
    if (path.includes(id)) throw new Error(`Cycle in flow at "${id}" via ${path.join(' → ')}`)
    if (path.length > limit) throw new Error('Runaway path')
    const node = flow.nodes[id]
    if (!node) throw new Error(`Edge to unknown node "${id}" after ${path.join(' → ')}`)
    for (const c of candidates(node, answers)) {
      const next = { ...answers, [id]: c }
      go(node.next(next), next, [...path, id])
    }
  }
  go(flow.start, {}, [])
  return [...results.values()]
}

/** How an answer reads back in the athlete's chat bubble. */
export function answerLabel(node: FlowNode, v: FlowValue, a: FlowAnswers): string {
  if (node.label) return node.label(v, a)
  const opts = optionsOf(node, a)
  if (Array.isArray(v)) {
    const labels = v.map((x) => opts.find((o) => o.value === x)?.label ?? x)
    return labels.length ? labels.join(', ') : 'None'
  }
  if (typeof v !== 'string') return Object.values(v).filter(Boolean).join(' · ') || 'None'
  if (node.skip && v === node.skip.value) return node.skip.label
  const { value, payload } = splitInline(v)
  const opt = opts.find((o) => o.value === v) ?? opts.find((o) => o.value === value && o.input)
  if (opt) return opt.input && payload ? `${opt.label}: ${payload}` : opt.label
  return v.trim() || 'Skipped'
}
