// TypeScript mirror of public/schemas/teto-plan.v1.schema.json. Keep in sync.

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export const WEEKDAYS: readonly Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export type Tracking = 'strength' | 'bodyweight' | 'duration' | 'cardio' | 'isometric' | 'checkbox';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'smith' | 'other';
export type WeightMode = 'total' | 'per_dumbbell' | 'per_side' | 'added' | 'assisted';

export interface PlanMetadata {
  id: string;
  revision: number;
  name: string;
  author?: string;
  description?: string;
  createdAt?: string;
}

export interface PlanProfile {
  displayName?: string;
  heightCm?: number;
  initialWeightKg?: number;
  activityLevel?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';
  experience?: 'beginner' | 'returning_beginner' | 'intermediate' | 'advanced';
  notes?: string;
}

export interface Phase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  workingSetsCap?: number;
  targetRir?: number;
  notes?: string;
}

export interface Programme {
  durationWeeks?: number;
  startDate?: string;
  onCompletion?: 'continue' | 'stop';
  phases?: Phase[];
}

export interface Exercise {
  id: string;
  name: string;
  tracking: Tracking;
  equipment?: Equipment;
  category?: 'compound' | 'isolation';
  muscleGroups?: string[];
  weightMode?: WeightMode;
  defaultRestSeconds?: number;
  weightIncrementKg?: number;
  unilateral?: boolean;
  sideLogging?: 'combined' | 'separate';
  alternatives?: string[];
  notes?: string;
}

export interface WorkoutExercise {
  exerciseId: string;
  sets: number;
  repsMin?: number;
  repsMax?: number;
  durationSec?: number;
  distanceM?: number;
  restSeconds?: number;
  optional?: boolean;
  notes?: string;
  alternatives?: string[];
}

export interface Workout {
  id: string;
  name: string;
  focus?: string;
  estimatedDurationMinutes?: number | { min: number; max: number };
  exercises: WorkoutExercise[];
}

export interface ScheduleEntry {
  id: string;
  workoutId: string;
  weekday?: Weekday;
  date?: string;
  time: string;
  everyNWeeks?: number;
  weekOffset?: number;
  optional?: boolean;
}

export interface Schedule {
  timezone?: string;
  weekStartsOn?: Weekday;
  entries: ScheduleEntry[];
}

export interface Habit {
  id: string;
  name: string;
  type: 'checkbox' | 'duration' | 'count' | 'measurement';
  target?: { min?: number; max?: number; unit: 'min' | 'h' | 'count' | 'steps' | 'l' | 'km' };
  weekdays?: Weekday[];
  frequency?: 'daily' | 'weekly';
  scheduledTime?: string;
  measurementId?: string;
}

export interface MeasurementDef {
  id: string;
  name: string;
  unit: 'kg' | 'lb' | 'cm' | 'in' | '%';
  frequency?: 'daily' | 'weekly' | 'monthly';
  trend?: 'rolling7';
}

export interface Plan {
  $schema?: string;
  format: 'teto-plan';
  schemaVersion: string;
  metadata: PlanMetadata;
  profile?: PlanProfile;
  goals?: { primary?: string; priorities?: string[] };
  programme?: Programme;
  exercises: Exercise[];
  workouts: Workout[];
  schedule: Schedule;
  habits?: Habit[];
  measurements?: MeasurementDef[];
  reminders?: { workout?: { enabled?: boolean; offsetsMinutes?: number[] } };
  preferences?: { weightUnit?: 'kg' | 'lb'; progressionMethod?: 'double_progression' | 'none'; restTimerEnabled?: boolean };
  nutrition?: Record<string, unknown>;
}

export const SUPPORTED_SCHEMA_MAJOR = 1;
export const SCHEMA_VERSION = '1.0.0';
export const PLAN_DEFAULTS = {
  timezone: 'Europe/Brussels',
  weekStartsOn: 'monday' as Weekday,
  onCompletion: 'continue' as const,
};
