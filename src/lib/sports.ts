import {
  Footprints, WavesLadder, Bike, Sailboat, PersonStanding, TentTree,
  Mountain, MountainSnow, Goal, Volleyball, Activity,
  type LucideIcon,
} from 'lucide-react'

/**
 * The three headline cardio modalities. These get their own always-visible
 * icon pills in the program editor; everything else lives behind "Other".
 */
export const PRIMARY_SPORTS = ['Running', 'Swimming', 'Cycling'] as const

/** Everything the athlete can pick from the "Other" sports modal. */
export const OTHER_SPORTS = [
  'Rowing', 'Walking', 'Hiking', 'Climbing', 'Skiing', 'Boxing',
  'Football', 'Basketball', 'Volleyball', 'Tennis', 'Badminton', 'Squash',
  'Rugby', 'Skipping',
] as const

export const ALL_SPORTS = [...PRIMARY_SPORTS, ...OTHER_SPORTS]

// Only sports lucide can represent honestly get a specific icon. Ball, racket
// and combat sports (Boxing, Basketball, Tennis, Badminton, Squash, Rugby,
// Skipping) have no matching glyph, so they fall back to a neutral activity
// mark rather than a misleading one.
const ICONS: Record<string, LucideIcon> = {
  Running: Footprints,
  Walking: PersonStanding,
  Swimming: WavesLadder,
  Cycling: Bike,
  Rowing: Sailboat,
  Hiking: TentTree,
  Climbing: Mountain,
  Skiing: MountainSnow,
  Football: Goal,
  Volleyball: Volleyball,
}

/** Icon for a sport, falling back to a generic activity glyph. */
export function sportIcon(sport: string): LucideIcon {
  return ICONS[sport] ?? Activity
}
