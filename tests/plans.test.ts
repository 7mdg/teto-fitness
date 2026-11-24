import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultStartDate, effectiveSets, programmePosition, summarisePlan } from '../src/features/plans/summary';
import type { Plan } from '../src/features/plans/types';
import { levenshtein, toPath, validatePlanData, validatePlanText } from '../src/features/plans/validate';

const load = (name: string) => readFileSync(`public/examples/${name}`, 'utf8');
const recomp = () => JSON.parse(load('teto-recomp-12w.json')) as Plan;

function expectError(data: unknown, path: string, contains?: string) {
  const r = validatePlanData(data);
  expect(r.ok, `expected failure at ${path}`).toBe(false);
  if (r.ok) return;
  const hit = r.errors.find((e) => e.path === path);
  expect(hit, `no error at ${path}; got ${JSON.stringify(r.errors)}`).toBeDefined();
  if (contains) expect(hit!.message).toContain(contains);
}

describe('example plans', () => {
  for (const file of ['teto-recomp-12w.json', 'full-body-3d-home.json']) {
    it(`${file} is valid`, () => {
      const r = validatePlanText(load(file));
      if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2));
      expect(r.warnings).toEqual([]);
    });
  }

  it('example plans contain no profile (public repo)', () => {
    expect(recomp().profile).toBeUndefined();
  });

  it('summarises the recomp plan', () => {
    const s = summarisePlan(recomp());
    expect(s).toMatchObject({ weeks: 12, workoutsPerWeek: 4, workoutCount: 4, exerciseCount: 18, habitCount: 4, measurementCount: 4 });
    expect(s.alternativeCount).toBe(22);
  });

  it('counts alternating weeks as 3 per week', () => {
    expect(summarisePlan(JSON.parse(load('full-body-3d-home.json')) as Plan).workoutsPerWeek).toBe(3);
  });
});

describe('validation errors', () => {
  it('rejects non-JSON and wrong format with a hint for backups', () => {
    const bad = validatePlanText('{nope');
    expect(bad.ok).toBe(false);
    expectError({ format: 'teto-backup' }, 'format', 'Restore backup');
  });

  it('rejects a newer major schema version', () => {
    const p = { ...recomp(), schemaVersion: '2.0.0' };
    expectError(p, 'schemaVersion', 'newer than this app supports');
  });

  it('reports a missing required field with its path', () => {
    const p = recomp() as unknown as Record<string, unknown>;
    delete (p.metadata as Record<string, unknown>).revision;
    expectError(p, 'metadata.revision', 'required');
  });

  it('reports unknown properties', () => {
    const p = recomp();
    (p.workouts[0] as unknown as Record<string, unknown>).colour = 'red';
    expectError(p, 'workouts[0].colour', 'not a recognised property');
  });

  it('reports a bad slug and a bad time format', () => {
    const p = recomp();
    p.schedule.entries[0]!.time = '8pm';
    expectError(p, 'schedule.entries[0].time', 'HH:MM');
    const q = recomp();
    q.exercises[0]!.id = 'Incline Press';
    expectError(q, 'exercises[0].id', 'lowercase');
  });

  it('requires weightMode for strength exercises', () => {
    const p = recomp();
    delete p.exercises[0]!.weightMode;
    expectError(p, 'exercises[0].weightMode', 'required');
  });

  it('requires exactly one of weekday/date', () => {
    const p = recomp();
    p.schedule.entries[0]!.date = '2026-12-01';
    expectError(p, 'schedule.entries[0]', 'exactly one');
  });

  it('suggests the closest exercise id for a typo', () => {
    const p = recomp();
    p.workouts[1]!.exercises[3]!.exerciseId = 'seated-leg-crul';
    expectError(p, 'workouts[1].exercises[3].exerciseId', 'Did you mean "seated-leg-curl"?');
  });

  it('checks alternatives, workout refs, measurements, duplicates, phases and reps', () => {
    const a = recomp();
    a.exercises[0]!.alternatives = ['incline-dumbbell-press'];
    expectError(a, 'exercises[0].alternatives[0]', 'its own alternative');

    const b = recomp();
    b.schedule.entries[0]!.workoutId = 'upper-c';
    expectError(b, 'schedule.entries[0].workoutId', 'does not match any workout');

    const c = recomp();
    c.habits![2]!.measurementId = 'weight';
    expectError(c, 'habits[2].measurementId', 'does not match any measurement');

    const d = recomp();
    d.exercises[1]!.id = d.exercises[0]!.id;
    expectError(d, 'exercises[1].id', 'more than once');

    const e = recomp();
    e.programme!.phases![1]!.startWeek = 3;
    expectError(e, 'programme.phases[0]', 'overlaps');

    const f = recomp();
    f.programme!.phases![1]!.endWeek = 13;
    expectError(f, 'programme.phases[1].endWeek', 'beyond durationWeeks');

    const g = recomp();
    g.workouts[0]!.exercises[0]!.repsMin = 15;
    expectError(g, 'workouts[0].exercises[0].repsMin', 'greater than repsMax');
  });

  it('rejects files over 2 MB before parsing', () => {
    const r = validatePlanText(' '.repeat(2 * 1024 * 1024 + 1));
    expect(r.ok).toBe(false);
  });
});

describe('helpers', () => {
  it('formats JSON pointers as readable paths', () => {
    expect(toPath('/workouts/1/exercises/3/exerciseId')).toBe('workouts[1].exercises[3].exerciseId');
    expect(toPath('')).toBe('(root)');
  });

  it('computes edit distance', () => {
    expect(levenshtein('pec-dek', 'pec-deck')).toBe(1);
  });

  it('defaults the start date to the plan date, else the next week start', () => {
    expect(defaultStartDate(recomp(), '2026-11-24')).toBe('2026-11-30');
    expect(defaultStartDate(recomp(), '2026-12-02')).toBe('2026-12-07'); // plan date in the past -> next Monday
    expect(defaultStartDate(recomp(), '2026-12-07')).toBe('2026-12-07'); // today is Monday
  });

  it('finds the programme week and phase, including after the end', () => {
    const p = recomp();
    expect(programmePosition(p, '2026-11-30', '2026-11-24')).toMatchObject({ status: 'before', daysUntilStart: 6 });
    expect(programmePosition(p, '2026-11-30', '2026-12-20').phase?.id).toBe('intro'); // week 3 (Sun)
    expect(programmePosition(p, '2026-11-30', '2026-12-21')).toMatchObject({ week: 4, status: 'running' });
    expect(programmePosition(p, '2026-11-30', '2026-12-21').phase?.id).toBe('progression');
    expect(programmePosition(p, '2026-11-30', '2027-03-01')).toMatchObject({ status: 'continuing', week: 14 });
  });

  it('caps sets in the intro phase', () => {
    const intro = recomp().programme!.phases![0];
    expect(effectiveSets(3, intro)).toBe(2);
    expect(effectiveSets(2, intro)).toBe(2);
    expect(effectiveSets(3, undefined)).toBe(3);
  });
});
