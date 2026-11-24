// Habits: which are due on a date, effective settings after local overrides, and logging.
import { db, type HabitLogRecord, type OverrideRecord, type TetoDB } from '../../db/db';
import type { Habit, Plan } from '../plans/types';
import { addDays, daysBetween, weekdayOf } from '../schedule/dates';

export interface HabitOverride {
  enabled?: boolean;
  target?: Habit['target'];
}

export interface EffectiveHabit extends Habit {
  enabled: boolean;
}

export function effectiveHabits(plan: Plan, overrides: Pick<OverrideRecord, 'kind' | 'itemId' | 'value'>[]): EffectiveHabit[] {
  const byId = new Map(overrides.filter((o) => o.kind === 'habit').map((o) => [o.itemId, o.value as HabitOverride]));
  return (plan.habits ?? []).map((h) => {
    const ov = byId.get(h.id) ?? {};
    return { ...h, target: ov.target ?? h.target, enabled: ov.enabled ?? true };
  });
}

/**
 * Due today? Listed weekdays win; otherwise daily habits are due every day and
 * weekly habits are shown every day of the week until completed once that week.
 */
export function isDue(h: Habit, date: string, weekStart: string, logs: Pick<HabitLogRecord, 'habitId' | 'date' | 'done'>[]): boolean {
  if (h.weekdays?.length) return h.weekdays.includes(weekdayOf(date));
  if (h.frequency === 'weekly') {
    const doneThisWeek = logs.some((l) => l.habitId === h.id && l.done && daysBetween(weekStart, l.date) >= 0 && daysBetween(l.date, addDays(weekStart, 6)) >= 0 && l.date !== date);
    return !doneThisWeek;
  }
  return true;
}

export async function setHabitDone(habitId: string, date: string, done: boolean, value?: number, database: TetoDB = db): Promise<void> {
  if (!done) {
    await database.habitLogs.delete([habitId, date]);
    return;
  }
  await database.habitLogs.put({ habitId, date, done: true, value, loggedAt: new Date().toISOString() });
}

/** Logs a measurement for a date (one per measurement per day; a new value replaces it) and completes linked habits. */
export async function logMeasurement(
  measurementId: string,
  value: number,
  unit: string,
  date: string,
  linkedHabitIds: string[],
  database: TetoDB = db,
): Promise<void> {
  await database.transaction('rw', [database.measurements, database.habitLogs], async () => {
    const existing = await database.measurements.where('[measurementId+date]').equals([measurementId, date]).first();
    await database.measurements.put({ id: existing?.id ?? crypto.randomUUID(), measurementId, value, unit, date, loggedAt: new Date().toISOString() });
    for (const habitId of linkedHabitIds) await database.habitLogs.put({ habitId, date, done: true, value, loggedAt: new Date().toISOString() });
  });
}

export async function setHabitOverride(planId: string, habitId: string, patch: HabitOverride, database: TetoDB = db): Promise<void> {
  const key: [string, string, string] = [planId, 'habit', habitId];
  const current = ((await database.overrides.get(key))?.value as HabitOverride | undefined) ?? {};
  await database.overrides.put({ planId, kind: 'habit', itemId: habitId, value: { ...current, ...patch } });
}
