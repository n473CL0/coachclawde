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
  /** Roughly how many days a week the athlete wants to train (from onboarding). */
  daysPerWeek?: number;
}

// --- Goal profile ------------------------------------------------------------

export type Pursuit = 'event' | 'fitness' | 'physique' | 'strength' | 'sport' | 'tracker';
export type EventKind = '5k' | '10k' | 'half' | 'marathon' | 'trail' | 'tri' | 'sportive' | 'hyrox' | 'other';
export type HealthFlag = 'injury' | 'condition' | 'pregnancy' | 'cardiac';
/** What the athlete can measure a rep with. Until one beyond 'phone' is known, reps are set by time. */
export type RunsWith = 'phone' | 'watch' | 'track' | 'treadmill';
export type DeferredId = 'runs-with' | 'coaching-tone' | 'nutrition' | 'focus-areas' | 'long-run-day';
export type InjuryStatus = 'active' | 'improving' | 'worse';

export interface FixedDay {
  day: DayOfWeek;
  kind: 'training' | 'match';
}

export interface RecentResult {
  meters: number;
  seconds: number;
  /** Local ISO date it was run, when known. */
  date?: string;
}

/**
 * Why the athlete is here and where they're starting from. Onboarding creates
 * it, check-ins update it, the plan prompt embeds it and Run Mode uses its
 * zones. The legacy `ProgramConfig`/profile fields are derived from it.
 *
 * Health is special-category data: only flags are stored, never diagnoses.
 * Injuries stay verbatim in `UserProfile.injuries` (safety-critical).
 */
export interface GoalProfile {
  version: 1;
  /** 'onboarding' = built by the goal tree; 'legacy' = mapped best-effort from a pre-v1.1 profile. */
  origin: 'onboarding' | 'legacy';
  pursuit: Pursuit;
  /** One plain sentence, shown on the confirmation card and sent to Claude. */
  statement: string;
  event?: {
    kind: EventKind;
    name?: string;
    /** Local ISO date; absent = "no date yet". */
    date?: string;
    aim: 'get-round' | 'finish-strong' | 'time';
    targetSeconds?: number;
  };
  physique?: { change: 'lose-fat' | 'build-muscle' | 'recomp'; byDate?: string };
  strength?: {
    kind: 'all-round' | 'lifts' | 'bodyweight' | 'job-or-sport';
    lifts?: { name: string; kg: number; reps: number }[];
  };
  sport?: { name: string; season: 'off' | 'pre' | 'in' | 'none'; fixed: FixedDay[]; wants: string[] };
  tracker?: { source: 'coach' | 'app-or-book' | 'self'; intake: 'convert' | 'log'; involvement: 'silent' | 'light' | 'check-ins' };
  starting: {
    /** Derived from the facts below, never asked. */
    level: ExperienceLevel;
    activity?: 'sitting' | 'light' | '1-2x' | '3x+';
    runKmPerWeek?: [number, number];
    /** Hours a week, for non-running endurance events. */
    trainingHoursPerWeek?: [number, number];
    lifting?: 'none' | 'on-off' | 'under-1y' | '1y+';
    /** A recent race or timed run → pace zones. */
    recentResult?: RecentResult;
  };
  constraints: {
    daysPerWeek: number;
    sessionMinutes: number;
    facilities: ProgramFacility[];
    /** Strength work alongside an event. */
    strengthWork?: boolean;
    runsWith?: RunsWith[];
    longRunDay?: DayOfWeek;
  };
  health: {
    flags: HealthFlag[];
    /** Medical flag raised: keep everything conservative until cleared. */
    conservative?: boolean;
    /** Athlete said a GP/physio has already cleared them. */
    cleared?: boolean;
    /** Per-injury status from check-ins, keyed by the injury line. */
    injuryStatus?: Record<string, InjuryStatus>;
    /** Injuries marked "gone" at a check-in. */
    pastInjuries?: string[];
  };
  /** Questions deliberately not asked yet; one rides along with each check-in. */
  deferred: DeferredId[];
  /** Deferred questions already answered at a check-in (so re-onboarding doesn't re-queue them). */
  askedDeferred?: DeferredId[];
  /** Nudge to pace zones from check-ins (C5), in %; + = faster. */
  zoneOffsetPct?: number;
  /** "Don't suggest check-ins" (Settings). */
  checkInsOff?: boolean;
  /** A pre-v1.1 athlete has done the three-question upgrade check-in. */
  migrated?: boolean;
  /** The onboarding answers, so the tree can be re-entered at any node. */
  answers?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  name: string;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  /**
   * Local-ISO date of birth (yyyy-mm-dd), from onboarding or Settings. Optional
   * for older profiles. Use `ageFromBirthDate` for the age.
   */
  birthDate?: string;
  programWeek: number;
  injuries: string[];
  goals: string[];
  fitnessBackground: string;
  gymAccess: boolean;
  dietaryNotes: string[];
  program?: ProgramConfig;
  /** Self-rated training experience, set during onboarding. */
  experienceLevel?: ExperienceLevel;
  /** Why they're here and where they start from. Absent on profiles onboarded before v1.1. */
  goal?: GoalProfile;
  /**
   * Whether the athlete has completed first-run onboarding. Absent/false means
   * the in-app onboarding chat is shown before the app. Set true on completion.
   */
  onboarded?: boolean;
  updatedAt: string;
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
  /** Legacy (pre-multi-user) flag from the original athlete's plans. Kept so
   *  old plans still type-check; no longer requested in the prompt. */
  shoulderSafe?: boolean;
}

// --- Structured workouts (cardio) -------------------------------------------

/** Effort words Claude picks; the app resolves them to paces/splits/feel. */
export type Effort = 'recovery' | 'easy' | 'steady' | 'marathon' | 'threshold' | 'interval' | 'repetition' | 'sprint';
export type StepRole = 'warmup' | 'work' | 'recover' | 'steady' | 'cooldown';
/** What ends a step: a time, a distance (athlete presses LAP), or the athlete. */
export type StepEnd =
  | { by: 'time'; seconds: number }
  | { by: 'distance'; meters: number }
  | { by: 'lap' };

export interface WorkoutStep {
  kind: 'step';
  role: StepRole;
  end: StepEnd;
  effort: Effort;
  /** Explicit target overriding the computed one, e.g. "rate 20" or "4:10/km". */
  target?: string;
  /** How to recover, for `recover` steps. */
  recovery?: 'stand' | 'walk' | 'jog';
  /** Short coach cue, e.g. "Relaxed shoulders". */
  cue?: string;
  /** Free-text label kept from a converted legacy interval. */
  label?: string;
}

export interface RepeatBlock {
  kind: 'repeat';
  times: number;
  /** Nests at most 2 deep: 2 × (4 × 400 m). */
  steps: WorkoutItem[];
  /** Send-off cycle: each repetition starts every N seconds (swim "on 1:45", EMOM). */
  everySeconds?: number;
  /** Drop the recovery after the final repetition. */
  skipLastRecovery?: boolean;
}

export type WorkoutItem = WorkoutStep | RepeatBlock;

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

/**
 * One move in a detailed warm-up or cool-down. Not logged — it's a guided
 * checklist shown when the athlete expands the warm-up/cool-down card.
 */
export interface RoutineItem {
  name: string;
  /** e.g. "10 each side", "60s", "2 × 8". */
  prescription?: string;
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
  /** Legacy cardio format. Converted to `workout` on import and when read. */
  intervals?: PlannedInterval[];
  /** Structured cardio workout: what Run Mode times and cues. */
  workout?: WorkoutItem[];
  /**
   * For cardio sessions that could be done as more than one modality. When
   * present (and length > 1) the athlete picks which one at session start,
   * which drives the split/pace units. The first entry is the default.
   */
  cardioOptions?: CardioType[];
  /** Brief one-line warm-up summary. */
  warmup?: string;
  /** Brief one-line cool-down summary. */
  cooldown?: string;
  /** Detailed warm-up moves, shown when the warm-up card is expanded. */
  warmupExercises?: RoutineItem[];
  /** Detailed cool-down moves, shown when the cool-down card is expanded. */
  cooldownExercises?: RoutineItem[];
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
  /** The workout step this row logs (see `LoggedStep.path`). Absent on legacy logs. */
  stepPath?: string;
}

/** One step as Run Mode timed it. */
export interface LoggedStep {
  /** Position in the workout, e.g. "1.3.0" = item 1, repetition 3, step 0. */
  path: string;
  role: StepRole;
  startedAt: string;
  seconds: number;
  meters?: number;
  endedBy: 'time' | 'lap' | 'skip';
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
  /** Session RPE, 1–10 (Borg CR-10). Times minutes gives the session load. */
  rpe?: number;
  /** How the session went against the plan. Absent on older logs. */
  outcome?: SessionOutcome;
  /** What was done instead, when `outcome` is 'substituted' (or a session logged with no plan). */
  substitute?: SubstituteActivity;
  /** Every step as Run Mode timed it. */
  loggedSteps?: LoggedStep[];
}

export type SessionOutcome = 'as-planned' | 'modified' | 'substituted';

/** A quick-logged activity: "Did something else?" or "Log a session". */
export interface SubstituteActivity {
  activity: string;
  minutes: number;
  distanceMeters?: number;
  notes?: string;
}

// --- Check-ins ---------------------------------------------------------------

export type CheckInTrigger = 'week-complete' | 'week-end' | 'planner' | 'milestone' | 'reactive' | 'migration';

/** What a check-in answer does. Applied by the app and summarised for Claude. */
export type CheckInAction =
  | { kind: 'session-minutes'; value: number }
  | { kind: 'fewer-days' }
  | { kind: 'lighter-week' }
  | { kind: 'intensity'; value: 'up' | 'down' }
  | { kind: 'injury-status'; injury: string; status: InjuryStatus | 'gone'; fromPainNote?: boolean }
  | { kind: 'zone-offset'; value: number }
  | { kind: 'planner-notes'; value: string }
  | { kind: 'deferred'; id: DeferredId; value: string[] }
  | { kind: 'reopen-goal'; node: string }
  | { kind: 'event-result'; seconds?: number; outcome: 'finished' | 'dnf' | 'dns' }
  | { kind: 'log-swap' }
  | { kind: 'new-block' };

export interface CheckIn {
  id: string;
  /** Monday of the week being reviewed. */
  weekStartDate: string;
  createdAt: string;
  trigger: CheckInTrigger;
  answers: Record<string, unknown>;
  actions: CheckInAction[];
  /** Plain English, one line per action (≤ 6), embedded in the next prompt. */
  summary: string;
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
  checkIns: CheckIn[];
  activeSessionId: string | null;
  timer: TimerState;
}
