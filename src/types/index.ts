export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
export type SessionType = 'weights' | 'cardio' | 'active-recovery';
export type Intensity = 'easy' | 'moderate' | 'hard';
export type Rating = 1 | 2 | 3 | 4 | 5;
/** Cardio modality — drives which split/pace units are shown and recorded. */
export type CardioType = 'run' | 'row' | 'bike' | 'swim' | 'other';

/** High-level training goals the athlete selects for their program. */
export type ProgramGoal = 'get-fit' | 'get-strong' | 'look-great';
/** Kinds of training the program should include. */
export type ProgramExerciseType = 'weights' | 'cardio' | 'mobility';
/** Equipment / spaces the athlete has access to. */
export type ProgramFacility = 'yoga-mat' | 'weights-at-home' | 'full-gym';
/** How Claude should pitch its coaching voice. */
export type CoachingStyle = 'supportive' | 'balanced' | 'intense';
/** The athlete's self-rated training experience, captured during onboarding. */
export type ExperienceLevel = 'beginner' | 'returning' | 'intermediate' | 'advanced';

/**
 * The athlete's standing program preferences. Embedded in the generated plan
 * prompt so Claude can apply them. Optional on `UserProfile` so profiles synced
 * before this feature still load.
 */
export interface ProgramConfig {
  goals: ProgramGoal[];
  exerciseTypes: ProgramExerciseType[];
  facilities: ProgramFacility[];
  /** Cardio sports the athlete wants to train. Only relevant when `cardio` is in `exerciseTypes`. */
  sports: string[];
  coachingStyle: CoachingStyle;
  /** How many weeks this program runs before the athlete is prompted to re-onboard. */
  lengthWeeks?: number;
  /** Local-ISO date (a Monday) the current program began; drives week progression. */
  startDate?: string;
}

export interface UserProfile {
  name: string;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  programWeek: number;
  injuries: string[];
  goals: string[];
  fitnessBackground: string;
  gymAccess: boolean;
  dietaryNotes: string[];
  program?: ProgramConfig;
  /** Self-rated training experience, set during onboarding. */
  experienceLevel?: ExperienceLevel;
  /**
   * Whether the athlete has completed first-run onboarding. Absent/false means
   * the onboarding slideshow is shown before the app. Set true on completion.
   */
  onboarded?: boolean;
  updatedAt: string;
}

/**
 * The "personalised workout background" JSON the athlete pastes back during
 * onboarding — Claude expands the basics they entered into a structured profile
 * the app merges in. Every field is optional so a partial paste still imports.
 */
export interface AthleteBackground {
  injuries?: string[];
  goals?: string[];
  fitnessBackground?: string;
  dietaryNotes?: string[];
  program?: Partial<ProgramConfig>;
}

export interface PlannedSet {
  reps: string;
  rpe?: number;
  restSeconds: number;
  suggestedWeightKg?: number;
  /**
   * When set, this is a timed hold (e.g. plank) rather than a rep-counted set.
   * The app shows a stopwatch instead of a reps/weight row, and `reps` is
   * ignored for display.
   */
  durationSeconds?: number;
}

export interface PlannedExercise {
  id: string;
  name: string;
  sets: PlannedSet[];
  coachNotes?: string;
  shoulderSafe?: boolean;
}

export interface PlannedInterval {
  label: string;
  repeats: number;
  targetPace?: string;
  targetDuration?: string;
  /** Optional target distance for the piece, e.g. "5km" or "2000m". */
  targetDistance?: string;
  restSeconds: number;
  notes?: string;
}

export interface PlannedSession {
  id: string;
  date: string;
  dayOfWeek: DayOfWeek;
  type: SessionType;
  title: string;
  focus: string;
  estimatedMinutes: number;
  intensity: Intensity;
  exercises?: PlannedExercise[];
  intervals?: PlannedInterval[];
  /**
   * For cardio sessions that could be done as more than one modality. When
   * present (and length > 1) the athlete picks which one at session start,
   * which drives the split/pace units. The first entry is the default.
   */
  cardioOptions?: CardioType[];
  warmup?: string;
  cooldown?: string;
}

export interface WeekPlan {
  id: string;
  weekStartDate: string;
  availableDays: DayOfWeek[];
  userNotes: string;
  sessions: PlannedSession[];
  createdAt: string;
  isLastWeek?: boolean;
}

export interface LoggedSet {
  setIndex: number;
  targetReps: string;
  actualReps?: number;
  weightKg?: number;
  /** Recorded hold time in seconds for timed sets (e.g. plank). */
  actualSeconds?: number;
  completed: boolean;
  skipped: boolean;
  restCompletedAt?: string;
}

export interface LoggedExercise {
  plannedExerciseId: string;
  name: string;
  sets: LoggedSet[];
}

export interface LoggedInterval {
  label: string;
  repeatIndex: number;
  targetPace?: string;
  targetDuration?: string;
  actualTime?: string;
  /** Distance covered, in metres — combined with actualSeconds to derive a split. */
  actualDistanceMeters?: number;
  /** Elapsed time in seconds — combined with actualDistanceMeters to derive a split. */
  actualSeconds?: number;
  completed: boolean;
}

export interface WeekReflection {
  energyLevel: Rating;
  overallNotes: string;
  nextWeekFocus: string;
}

export interface LoggedSession {
  id: string;
  plannedSessionId: string;
  weekPlanId: string;
  date: string;
  type: SessionType;
  title: string;
  focus: string;
  startedAt: string;
  completedAt?: string;
  status: 'in-progress' | 'complete' | 'skipped';
  /** Chosen cardio modality when the session offered a choice. */
  cardioType?: CardioType;
  loggedExercises?: LoggedExercise[];
  loggedIntervals?: LoggedInterval[];
  feelings?: Rating;
  painNotes?: string;
  generalNotes?: string;
  weekReflection?: WeekReflection;
}

export interface TimerState {
  isActive: boolean;
  endTime: number | null;
  durationSeconds: number;
  label: string;
}

export interface AppState {
  profile: UserProfile;
  weekPlans: WeekPlan[];
  loggedSessions: LoggedSession[];
  activeSessionId: string | null;
  timer: TimerState;
}
