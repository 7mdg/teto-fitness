import type { Exercise } from '../plans/types';

/** One exercise position in a workout, frozen at session start (SPEC §5: prescription snapshot). */
export interface SlotPrescription {
  slot: number;
  /** Exercise the plan prescribes for this slot. */
  plannedExerciseId: string;
  /** Exercise used at session start (differs from planned when a permanent swap is set). */
  exerciseId: string;
  sets: number;
  repsMin?: number;
  repsMax?: number;
  durationSec?: number;
  distanceM?: number;
  restSeconds: number;
  optional: boolean;
  notes?: string;
  alternatives: string[];
}

export interface Prescription {
  workoutId: string;
  workoutName: string;
  phaseId?: string;
  phaseName?: string;
  week?: number;
  slots: SlotPrescription[];
  /** Definitions of every exercise this session can show, so history survives plan deletion. */
  exercises: Record<string, Exercise>;
}

export interface Substitution {
  slot: number;
  plannedExerciseId: string;
  performedExerciseId: string;
  /** Sets with setIndex >= this belong to the substitute. */
  fromSetIndex: number;
}
