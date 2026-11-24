// Turns a plan's schedule into concrete dated sessions. Pure and fully tested (SPEC §11).
import type { ScheduleOverrideRecord } from '../../db/db';
import type { Phase, Plan } from '../plans/types';
import { programmePosition } from '../plans/summary';
import { addDays, daysBetween, programmeWeek, weekdayOf } from './dates';

export interface Occurrence {
  /** `<entryId>@<YYYY-MM-DD>` — stable even if other entries change. Uses the original date for moved sessions. */
  key: string;
  entryId: string;
  date: string;
  time: string;
  workoutId: string;
  week: number;
  phase?: Phase;
  optional: boolean;
  moved: boolean;
}

/** Raw occurrences of the plan between `from` and `to` (inclusive), before overrides. */
function rawOccurrences(plan: Plan, startDate: string, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const stop = plan.programme?.onCompletion === 'stop';
  const duration = plan.programme?.durationWeeks;
  const first = daysBetween(startDate, from) < 0 ? startDate : from;
  for (let d = first; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
    const week = programmeWeek(startDate, d);
    if (week === 0) continue;
    if (stop && duration && week > duration) break;
    const weekday = weekdayOf(d);
    for (const e of plan.schedule.entries) {
      const matches = e.date ? e.date === d : e.weekday === weekday && (week - 1) % (e.everyNWeeks ?? 1) === (e.weekOffset ?? 0);
      if (!matches) continue;
      out.push({
        key: `${e.id}@${d}`,
        entryId: e.id,
        date: d,
        time: e.time,
        workoutId: e.workoutId,
        week,
        phase: programmePosition(plan, startDate, d).phase,
        optional: e.optional ?? false,
        moved: false,
      });
    }
  }
  return out;
}

export function occurrences(
  plan: Plan,
  startDate: string,
  from: string,
  to: string,
  overrides: Pick<ScheduleOverrideRecord, 'occurrenceKey' | 'action' | 'date' | 'time'>[] = [],
): Occurrence[] {
  const byKey = new Map(overrides.map((o) => [o.occurrenceKey, o]));
  // Look a little wider so sessions moved into the window from outside it are included.
  const result: Occurrence[] = [];
  for (const occ of rawOccurrences(plan, startDate, addDays(from, -28), addDays(to, 28))) {
    const ov = byKey.get(occ.key);
    if (ov?.action === 'skip') continue;
    const placed = ov?.action === 'move' ? { ...occ, date: ov.date ?? occ.date, time: ov.time ?? occ.time, moved: true } : occ;
    if (daysBetween(from, placed.date) >= 0 && daysBetween(placed.date, to) >= 0) result.push(placed);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** The next occurrence strictly after `date` (or on `date` after `afterTime`). */
export function nextOccurrence(plan: Plan, startDate: string, date: string, overrides: Parameters<typeof occurrences>[4] = []): Occurrence | undefined {
  return occurrences(plan, startDate, addDays(date, 1), addDays(date, 70), overrides)[0];
}
