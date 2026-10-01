import type { Effort } from '../../types'

/** Effort colours, cool to hot, shared by the workout strip and Run Mode. */
export const EFFORT_COLOR: Record<Effort, string> = {
  recovery: '#55504b',
  easy: '#4f8fd8',
  steady: '#3fa9a0',
  marathon: '#8fb84a',
  threshold: '#e2a23b',
  interval: '#d97756',
  repetition: '#e0564f',
  sprint: '#c43a6a',
}

export const EFFORT_LABEL: Record<Effort, string> = {
  recovery: 'Recovery',
  easy: 'Easy',
  steady: 'Steady',
  marathon: 'Marathon pace',
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Repetition',
  sprint: 'Sprint',
}
