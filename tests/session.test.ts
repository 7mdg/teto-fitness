import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TetoDB, type PlanRecord } from '../src/db/db';
import { importPlan } from '../src/features/plans/repository';
import type { Plan } from '../src/features/plans/types';
import { occurrences } from '../src/features/schedule/occurrences';
import {
  createCustomExercise,
  currentExercise,
  discardSession,
  exerciseForSet,
  finishSession,
  getActiveSession,
  lastPerformance,
  logSet,
  startSession,
  swapExercise,
} from '../src/features/training/session';

const recomp = () => JSON.parse(readFileSync('public/examples/teto-recomp-12w.json', 'utf8')) as Plan;
let db: TetoDB;
let plan: PlanRecord;
let n = 0;

beforeEach(async () => {
  db = new TetoDB(`session-${n++}`);
  await db.open();
  plan = await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
});

const mondayOcc = () => occurrences(plan.json, plan.startDate, '2026-11-30', '2026-11-30')[0]!;

async function doSets(sessionId: string, slot: number, exerciseId: string, rows: [number, number][]) {
  for (const [i, [w, r]] of rows.entries()) await logSet(sessionId, { slot, setIndex: i, side: 'both', exerciseId, weightKg: w, reps: r }, db);
}

describe('session engine', () => {
  it('freezes a phase-capped prescription with exercise definitions', async () => {
    const id = await startSession(plan, 'upper-a', { occurrence: mondayOcc(), date: '2026-11-30' }, db);
    const s = (await db.sessions.get(id))!;
    expect(s.occurrenceKey).toBe('mon-upper-a@2026-11-30');
    expect(s.prescription.phaseId).toBe('intro');
    expect(s.prescription.slots.map((x) => x.sets)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(s.prescription.slots[0]).toMatchObject({ exerciseId: 'incline-dumbbell-press', restSeconds: 120, repsMin: 8, repsMax: 12 });
    expect(s.prescription.exercises['incline-chest-press']?.name).toBe('Incline chest press'); // alternative included
  });

  it('allows only one active session', async () => {
    const a = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
    const b = await startSession(plan, 'lower-a', { date: '2026-11-30' }, db);
    expect(b).toBe(a);
  });

  it('logs, finishes and prefills the next session from history', async () => {
    const s1 = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
    await doSets(s1, 0, 'incline-dumbbell-press', [[22, 12], [22, 12]]);
    expect(await lastPerformance('incline-dumbbell-press', undefined, db)).toEqual([]); // not completed yet
    await finishSession(s1, 'felt good', db);
    const last = await lastPerformance('incline-dumbbell-press', undefined, db);
    expect(last.map((x) => [x.weightKg, x.reps])).toEqual([[22, 12], [22, 12]]);
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it('detects PRs only against earlier sessions', async () => {
    const s1 = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
    await doSets(s1, 0, 'incline-dumbbell-press', [[22, 10]]);
    expect((await finishSession(s1, undefined, db)).records).toEqual([]);
    const s2 = await startSession(plan, 'upper-a', { date: '2026-12-07' }, db);
    await doSets(s2, 0, 'incline-dumbbell-press', [[24, 9]]);
    const done = await finishSession(s2, undefined, db);
    expect(done.records?.map((r) => r.kind)).toEqual(['weight', 'e1rm']);
  });

  it('swaps mid-exercise: earlier sets keep the original exercise, history stays separate', async () => {
    const id = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
    await doSets(id, 1, 'machine-chest-press', [[50, 10]]);
    const alt = (await db.sessions.get(id))!.prescription.exercises['dumbbell-bench-press']!;
    await swapExercise(id, 1, alt, { always: false }, db);
    const s = (await db.sessions.get(id))!;
    expect(currentExercise(s, 1)).toBe('dumbbell-bench-press');
    expect(exerciseForSet(s, 1, 0)).toBe('machine-chest-press');
    expect(exerciseForSet(s, 1, 1)).toBe('dumbbell-bench-press');
    expect(s.substitutions).toEqual([{ slot: 1, plannedExerciseId: 'machine-chest-press', performedExerciseId: 'dumbbell-bench-press', fromSetIndex: 1 }]);
    expect(await db.overrides.count()).toBe(0); // session only
  });

  it('"always use this" persists for future sessions and can be reverted', async () => {
    const id = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
    const alt = (await db.sessions.get(id))!.prescription.exercises['dumbbell-bench-press']!;
    await swapExercise(id, 1, alt, { always: true }, db);
    await discardSession(id, db);
    const next = await startSession(plan, 'upper-a', { date: '2026-12-07' }, db);
    const s = (await db.sessions.get(next))!;
    expect(s.prescription.slots[1]).toMatchObject({ plannedExerciseId: 'machine-chest-press', exerciseId: 'dumbbell-bench-press' });
    expect(s.prescription.slots[1]!.alternatives).toContain('machine-chest-press');
    const original = s.prescription.exercises['machine-chest-press']!;
    await swapExercise(next, 1, original, { always: true }, db);
    expect(await db.overrides.count()).toBe(0);
  });

  it('creates unique custom exercises usable in swaps', async () => {
    const a = await createCustomExercise({ name: 'Cable Press (Hammer)', tracking: 'strength', equipment: 'cable', weightMode: 'total', weightIncrementKg: 2.5 }, db);
    const b = await createCustomExercise({ name: 'Cable press hammer', tracking: 'strength', weightMode: 'total' }, db);
    expect(a.id).toBe('custom-cable-press-hammer');
    expect(b.id).toBe('custom-cable-press-hammer-2');
  });

  it('discarding removes the sets', async () => {
    const id = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
    await doSets(id, 0, 'incline-dumbbell-press', [[22, 10]]);
    await discardSession(id, db);
    expect(await db.sets.count()).toBe(0);
    expect((await db.sessions.get(id))?.status).toBe('discarded');
  });
});
