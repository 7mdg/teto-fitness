import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TetoDB } from '../src/db/db';
import { effectiveHabits, isDue, logMeasurement, setHabitDone, setHabitOverride } from '../src/features/habits/habits';
import { diffPlans } from '../src/features/plans/diff';
import { importPlan, moveOccurrence, restoreOccurrence, skipOccurrence } from '../src/features/plans/repository';
import type { Plan } from '../src/features/plans/types';
import { occurrences } from '../src/features/schedule/occurrences';

const recomp = () => JSON.parse(readFileSync('public/examples/teto-recomp-12w.json', 'utf8')) as Plan;
let db: TetoDB;
let n = 0;
beforeEach(async () => {
  db = new TetoDB(`p3-${n++}`);
  await db.open();
});

describe('habits', () => {
  const plan = recomp();
  const habit = (id: string) => plan.habits!.find((h) => h.id === id)!;

  it('schedules weekday, daily and weekly habits', () => {
    const MON = '2026-11-30';
    expect(isDue(habit('lunch-walk'), MON, MON, [])).toBe(true);
    expect(isDue(habit('lunch-walk'), '2026-12-05', MON, [])).toBe(false); // Saturday
    expect(isDue(habit('sleep'), '2026-12-05', MON, [])).toBe(true);
    // weekly: shown until done once this week; still shown on the day it was done
    const logs = [{ habitId: 'waist-measurement', date: '2026-12-01', done: true }];
    expect(isDue(habit('waist-measurement'), '2026-12-01', MON, logs)).toBe(true);
    expect(isDue(habit('waist-measurement'), '2026-12-02', MON, logs)).toBe(false);
    expect(isDue(habit('waist-measurement'), '2026-12-07', '2026-12-07', logs)).toBe(true);
  });

  it('applies local overrides', async () => {
    await setHabitOverride('teto-recomp-12w', 'sleep', { enabled: false }, db);
    await setHabitOverride('teto-recomp-12w', 'sleep', { target: { min: 8, max: 9, unit: 'h' } }, db);
    const eff = effectiveHabits(plan, await db.overrides.toArray());
    const sleep = eff.find((h) => h.id === 'sleep')!;
    expect(sleep.enabled).toBe(false);
    expect(sleep.target).toEqual({ min: 8, max: 9, unit: 'h' });
  });

  it('logging a measurement completes its habit and replaces same-day values', async () => {
    await logMeasurement('bodyweight', 85.2, 'kg', '2026-11-30', ['morning-weigh-in'], db);
    await logMeasurement('bodyweight', 84.9, 'kg', '2026-11-30', ['morning-weigh-in'], db);
    expect((await db.measurements.toArray()).map((m) => m.value)).toEqual([84.9]);
    expect((await db.habitLogs.get(['morning-weigh-in', '2026-11-30']))?.done).toBe(true);
    await setHabitDone('morning-weigh-in', '2026-11-30', false, undefined, db);
    expect(await db.habitLogs.count()).toBe(0);
    expect(await db.measurements.count()).toBe(1); // the measurement itself is kept
  });
});

describe('plan diff', () => {
  it('reports no changes for an identical plan', () => {
    expect(diffPlans(recomp(), recomp())).toEqual([]);
  });

  it('summarises meaningful changes', () => {
    const b = recomp();
    b.metadata.revision = 2;
    b.workouts[0]!.exercises[1]!.exerciseId = 'dumbbell-bench-press';
    b.workouts[1]!.exercises[0]!.sets = 4;
    b.schedule.entries[3]!.weekday = 'saturday';
    b.habits = b.habits!.filter((h) => h.id !== 'sleep');
    const d = diffPlans(recomp(), b);
    expect(d).toContain('Upper A: Machine chest press → Dumbbell bench press');
    expect(d).toContain('Lower A: Leg press 3 × 8–12 → 4 × 8–12');
    expect(d).toContain('Lower B moved: Sun 11:00 → Sat 11:00');
    expect(d).toContain('Removed habit: Sleep');
  });
});

describe('schedule overrides and update pruning', () => {
  it('moves, skips and restores a session', async () => {
    const rec = await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    await moveOccurrence(rec.id, 'sun-lower-b@2026-12-06', '2026-12-05', '10:00', db);
    await skipOccurrence(rec.id, 'tue-lower-a@2026-12-01', db);
    const ov = await db.scheduleOverrides.toArray();
    const week = occurrences(rec.json, rec.startDate, '2026-11-30', '2026-12-06', ov);
    expect(week.map((o) => o.date)).toEqual(['2026-11-30', '2026-12-03', '2026-12-05']);
    await restoreOccurrence(rec.id, 'tue-lower-a@2026-12-01', db);
    expect(await db.scheduleOverrides.count()).toBe(1);
  });

  it('drops only stale overrides on update', async () => {
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    await db.overrides.bulkPut([
      { planId: 'teto-recomp-12w', kind: 'slotSwap', itemId: 'upper-a#1', value: 'dumbbell-bench-press' }, // slot changes -> stale
      { planId: 'teto-recomp-12w', kind: 'slotSwap', itemId: 'upper-a#2', value: 'machine-pulldown' }, // unchanged -> kept
      { planId: 'teto-recomp-12w', kind: 'habit', itemId: 'sleep', value: { enabled: false } }, // habit removed -> stale
    ]);
    await skipOccurrence('teto-recomp-12w', 'sun-lower-b@2026-12-06', db); // entry removed -> stale
    const b = recomp();
    b.metadata.revision = 2;
    b.workouts[0]!.exercises[1]!.exerciseId = 'smith-bench-press';
    b.habits = b.habits!.filter((h) => h.id !== 'sleep');
    b.schedule.entries = b.schedule.entries.filter((e) => e.id !== 'sun-lower-b');
    await importPlan(b, { mode: 'update', startDate: '2026-11-30' }, db);
    expect((await db.overrides.toArray()).map((o) => o.itemId)).toEqual(['upper-a#2']);
    expect(await db.scheduleOverrides.count()).toBe(0);
  });
});
