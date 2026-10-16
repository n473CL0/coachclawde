// Single source of truth for the Clawde crab mascot — a pixel-art crab
// wearing a sweatband. Shared by the in-app <ClawdeMark> component and the
// build-time app-icon generator (scripts/gen-icons.ts) so they never drift.
//
// Legend:
//   C body        D leg/shadow      E eye
//   B band cream  S band stripe     . transparent
const GRID = [
  '....C...C....',
  '....C...C....',
  '..CCCCCCCCC..',
  '.CCCCCCCCCCC.',
  'BBBBBBBBBBBBB',
  'SSSSSSSSSSSSS',
  'BBBBBBBBBBBBB',
  '.CCCECCCECCC.',
  '.CCCCCCCCCCC.',
  '.CCCCCCCCCCC.',
  '.D.D.D.D.D.D.',
  '.D.........D.',
]

export const CRAB_COLS = 13
export const CRAB_ROWS = GRID.length

export const CRAB_PALETTE: Record<string, string> = {
  C: '#d97756', // terracotta body
  D: '#bd5f38', // darker legs for depth
  E: '#2a1712', // eyes
  B: '#fbf7f0', // sweatband cream
  S: '#d97756', // sweatband stripe
}

export interface CrabCell {
  x: number
  y: number
  fill: string
}

/** Flatten the grid into the list of coloured pixel cells (unit coordinates). */
export function crabCells(): CrabCell[] {
  const cells: CrabCell[] = []
  GRID.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = CRAB_PALETTE[row[x]]
      if (fill) cells.push({ x, y, fill })
    }
  })
  return cells
}
