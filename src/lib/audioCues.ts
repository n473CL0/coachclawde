/**
 * Sound and vibration cues for the rest timer and Run Mode.
 *
 * Tones only, generated with Web Audio. We deliberately don't use
 * `speechSynthesis`: on iPhone it takes an exclusive audio session and stops
 * the athlete's music. Tones are scheduled on the AudioContext clock
 * (`start(when)`), so they fire on time even when the page's JS timers are
 * throttled.
 *
 * Where supported (Safari 17+), `navigator.audioSession.type = 'transient'`
 * makes the session mixable: music keeps playing or ducks briefly under a cue.
 * On iPhone, Silent mode mutes Web Audio; Run Mode's sound check says so.
 *
 * Earcons have distinct contours so they can be told apart over traffic:
 * Go = rising, Recover = falling, pips = race-start style, done = a chord.
 * Triangle waves at 0.5–1.1 kHz carry better outdoors than sines.
 */

export type Earcon = 'go' | 'goLast' | 'recover' | 'start' | 'pip' | 'pipLong' | 'half' | 'headsUp' | 'remind' | 'done' | 'restOver'

interface AudioSessionLike { type: string }
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

/** The shared AudioContext, created on first use. Null where Web Audio is missing. */
export function audioContext(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
  if (!AC) return null
  try {
    const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
    if (session) session.type = 'transient'
  } catch {
    // Not supported: the browser's default session is used.
  }
  ctx = new AC()
  return ctx
}

/**
 * Call from a tap handler: iOS only lets audio start inside a user gesture,
 * so this "unlocks" the context for cues scheduled later.
 */
export function unlockAudio(): void {
  const c = audioContext()
  if (c && c.state !== 'running') void c.resume().catch(() => {})
}

/** A set of scheduled tones that can be cancelled together. */
export interface CueHandle {
  cancel: () => void
}

function tone(c: AudioContext, out: OscillatorNode[], freq: number, at: number, dur: number, gain = 0.22) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'triangle'
  o.frequency.value = freq
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.012)
  g.gain.setValueAtTime(gain, at + Math.max(0.02, dur - 0.04))
  g.gain.linearRampToValueAtTime(0, at + dur)
  o.connect(g).connect(c.destination)
  o.start(at)
  o.stop(at + dur + 0.02)
  out.push(o)
}

const SHAPES: Record<Earcon, (c: AudioContext, o: OscillatorNode[], t: number) => void> = {
  go: (c, o, t) => { tone(c, o, 660, t, 0.12); tone(c, o, 880, t + 0.14, 0.12); tone(c, o, 1100, t + 0.28, 0.26) },
  goLast: (c, o, t) => { tone(c, o, 660, t, 0.1); tone(c, o, 880, t + 0.12, 0.1); tone(c, o, 1100, t + 0.24, 0.1); tone(c, o, 1320, t + 0.36, 0.3) },
  recover: (c, o, t) => { tone(c, o, 880, t, 0.12); tone(c, o, 660, t + 0.14, 0.12); tone(c, o, 520, t + 0.28, 0.26) },
  start: (c, o, t) => { tone(c, o, 740, t, 0.14); tone(c, o, 740, t + 0.2, 0.14) },
  pip: (c, o, t) => tone(c, o, 1000, t, 0.09, 0.2),
  pipLong: (c, o, t) => tone(c, o, 1000, t, 0.45, 0.22),
  half: (c, o, t) => tone(c, o, 740, t, 0.22, 0.14),
  headsUp: (c, o, t) => { tone(c, o, 600, t, 0.1, 0.14); tone(c, o, 600, t + 0.16, 0.1, 0.14) },
  remind: (c, o, t) => { tone(c, o, 880, t, 0.1, 0.16); tone(c, o, 880, t + 0.16, 0.1, 0.16); tone(c, o, 880, t + 0.32, 0.1, 0.16) },
  done: (c, o, t) => { for (const f of [523, 659, 784]) tone(c, o, f, t, 0.7, 0.1); tone(c, o, 1046, t + 0.18, 0.7, 0.09) },
  restOver: (c, o, t) => { tone(c, o, 880, t, 0.14); tone(c, o, 1100, t + 0.18, 0.3) },
}

/** Android vibration patterns per earcon (ms). iPhone web apps can't vibrate. */
const VIBRATION: Partial<Record<Earcon, number[]>> = {
  go: [400],
  goLast: [400, 100, 400],
  recover: [120, 80, 120],
  pip: [60],
  pipLong: [250],
  restOver: [300, 100, 300],
  remind: [100, 80, 100, 80, 100],
  done: [200, 100, 200, 100, 400],
}

/**
 * Schedules `earcon` to play `delaySeconds` from now on the audio clock.
 * Returns a handle that cancels it (and its vibration) if it hasn't played.
 */
export function scheduleEarcon(earcon: Earcon, delaySeconds = 0, opts: { vibrate?: boolean } = {}): CueHandle {
  const c = audioContext()
  const nodes: OscillatorNode[] = []
  if (c) SHAPES[earcon](c, nodes, c.currentTime + Math.max(0.02, delaySeconds))
  let timer: ReturnType<typeof setTimeout> | undefined
  const pattern = VIBRATION[earcon]
  if (opts.vibrate !== false && pattern && canVibrate()) {
    timer = setTimeout(() => vibrate(pattern), Math.max(0, delaySeconds * 1000))
  }
  return {
    cancel: () => {
      if (timer) clearTimeout(timer)
      for (const n of nodes) {
        try { n.stop() } catch { /* already stopped */ }
      }
    },
  }
}

/** Plays an earcon right now. */
export function playEarcon(earcon: Earcon): void {
  scheduleEarcon(earcon, 0)
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function vibrate(pattern: number[]): void {
  try { navigator.vibrate?.(pattern) } catch { /* ignore */ }
}

/** Groups handles so a whole step's cues can be cancelled at once. */
export function combine(handles: CueHandle[]): CueHandle {
  return { cancel: () => handles.forEach((h) => h.cancel()) }
}
