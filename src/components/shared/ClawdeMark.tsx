import { crabCells } from '../../lib/crabArt'

interface ClawdeMarkProps {
  size?: number
  className?: string
  /** Gentle idle breathing/bob animation */
  idle?: boolean
  /** Playful bounce + sweat flick — fire this on scroll-up */
  cheer?: boolean
  /** Show the dripping sweat bead */
  sweat?: boolean
}

// Each pixel cell is CELL units wide, giving a ~104×96 coordinate space so the
// shared bob/cheer/sweat keyframes (tuned for a ~100-unit canvas) read right.
const CELL = 8
const BLEED = 0.4 // tiny overlap so adjacent cells never show a seam when scaled
const CELLS = crabCells()

/**
 * Clawde the crab — the Claude Code mascot, now in a sweatband. Rendered as
 * crisp pixel rects so it stays sharp at any size and matches the home-screen
 * app icon generated from the same grid.
 */
export function ClawdeMark({ size = 40, className = '', idle = true, cheer = false, sweat = false }: ClawdeMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-6 -6 116 110"
      fill="none"
      role="img"
      aria-label="Clawde the crab, ready to train"
      className={`overflow-visible ${className}`}
    >
      <g
        className={`${idle ? 'clawde-bob' : ''} ${cheer ? 'clawde-cheer' : ''}`}
        style={{ transformOrigin: '52px 48px' }}
      >
        {CELLS.map((c, i) => (
          <rect
            key={i}
            x={c.x * CELL - BLEED / 2}
            y={c.y * CELL - BLEED / 2}
            width={CELL + BLEED}
            height={CELL + BLEED}
            fill={c.fill}
          />
        ))}
      </g>

      {/* A bead of sweat that drips off the band's right tip */}
      {sweat && (
        <g className="clawde-sweat" style={{ transformOrigin: '100px 52px' }}>
          <rect x="96" y="50" width="8" height="9" fill="#7cc5ff" />
          <rect x="97.6" y="51.6" width="2.6" height="2.6" fill="#bfe2ff" />
        </g>
      )}
    </svg>
  )
}
