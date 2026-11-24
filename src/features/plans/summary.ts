import { nextWeekday, parseDate, programmeWeek, todayIn } from '../schedule/dates';
import { PLAN_DEFAULTS, type Phase, type Plan } from './types';

export interface PlanSummary {
  name: string;
  revision: number;
  weeks?: number;
  workoutsPerWeek: number;
  workoutCount: number;
  exerciseCount: number;
  alternativeCount: number;
  habitCount: number;
  measurementCount: number;
  phases: Phase[];
  hasProfile: boolean;
}

export function summarisePlan(plan: Plan): PlanSummary {
  const used = new Set(plan.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  const perWeek = plan.schedule.entries
    .filter((e) => e.weekday && !e.optional)
    .reduce((sum, e) => sum + 1 / (e.everyNWeeks ?? 1), 0);
  return {
    name: plan.metadata.name,
    revision: plan.metadata.revision,
    weeks: plan.programme?.durationWeeks,
    workoutsPerWeek: Math.round(perWeek * 10) / 10,
    workoutCount: plan.workouts.length,
    exerciseCount: used.size,
    alternativeCount: plan.exercises.length - used.size,
    habitCount: plan.habits?.length ?? 0,
    measurementCount: plan.measurements?.length ?? 0,
    phases: plan.programme?.phases ?? [],
    hasProfile: !!plan.profile && Object.keys(plan.profile).length > 0,
  };
}

export const planTimezone = (plan: Plan) => plan.schedule.timezone ?? PLAN_DEFAULTS.timezone;

/**
 * Default start date offered at activation (SPEC §7): the plan's startDate unless missing or in the past,
 * otherwise the next week-start day (today if today is one), so week 1 is always a full week.
 */
export function defaultStartDate(plan: Plan, today = todayIn(planTimezone(plan))): string {
  const given = plan.programme?.startDate;
  if (given && parseDate(given) >= parseDate(today)) return given;
  return nextWeekday(today, plan.schedule.weekStartsOn ?? PLAN_DEFAULTS.weekStartsOn);
}

export interface ProgrammePosition {
  status: 'before' | 'running' | 'continuing' | 'finished';
  week: number;
  phase?: Phase;
  daysUntilStart: number;
}

export function programmePosition(plan: Plan, startDate: string, today: string): ProgrammePosition {
  const week = programmeWeek(startDate, today);
  const daysUntilStart = Math.max(0, Math.round((parseDate(startDate) - parseDate(today)) / 86_400_000));
  if (week === 0) return { status: 'before', week: 0, daysUntilStart };
  const phases = plan.programme?.phases ?? [];
  const duration = plan.programme?.durationWeeks;
  if (duration && week > duration) {
    if ((plan.programme?.onCompletion ?? 'continue') === 'stop') return { status: 'finished', week, daysUntilStart: 0 };
    const last = [...phases].sort((a, b) => b.endWeek - a.endWeek)[0];
    return { status: 'continuing', week, phase: last, daysUntilStart: 0 };
  }
  return { status: 'running', week, phase: phases.find((p) => week >= p.startWeek && week <= p.endWeek), daysUntilStart: 0 };
}

/** Effective working sets for a prescription in a phase. */
export const effectiveSets = (sets: number, phase?: Phase) => (phase?.workingSetsCap ? Math.min(sets, phase.workingSetsCap) : sets);
