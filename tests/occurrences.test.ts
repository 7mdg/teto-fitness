import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Plan } from '../src/features/plans/types';
import { nextOccurrence, occurrences } from '../src/features/schedule/occurrences';

const recomp = () => JSON.parse(readFileSync('public/examples/teto-recomp-12w.json', 'utf8')) as Plan;
const home = () => JSON.parse(readFileSync('public/examples/full-body-3d-home.json', 'utf8')) as Plan;
const START = '2026-11-30';

describe('occurrences', () => {
  it('generates the first week of the recomp plan', () => {
    const occ = occurrences(recomp(), START, '2026-11-30', '2026-12-06');
    expect(occ.map((o) => `${o.date} ${o.time} ${o.workoutId}`)).toEqual([
      '2026-11-30 20:00 upper-a',
      '2026-12-01 20:00 lower-a',
      '2026-12-03 20:00 upper-b',
      '2026-12-06 11:00 lower-b',
    ]);
    expect(occ.every((o) => o.week === 1 && o.phase?.id === 'intro')).toBe(true);
    expect(occ[0]!.key).toBe('mon-upper-a@2026-11-30');
  });

  it('produces nothing before the start date', () => {
    expect(occurrences(recomp(), START, '2026-11-23', '2026-11-29')).toEqual([]);
  });

  it('switches phase in week 4 and keeps going after week 12 (continue)', () => {
    expect(occurrences(recomp(), START, '2026-12-21', '2026-12-21')[0]!.phase?.id).toBe('progression');
    const after = occurrences(recomp(), START, '2027-02-22', '2027-02-28');
    expect(after).toHaveLength(4);
    expect(after[0]!.week).toBe(13);
  });

  it('stops after the programme when onCompletion is stop', () => {
    const p = recomp();
    p.programme!.onCompletion = 'stop';
    expect(occurrences(p, START, '2027-02-22', '2027-02-28')).toEqual([]);
  });

  it('alternates A/B weeks', () => {
    const w1 = occurrences(home(), START, '2026-11-30', '2026-12-06').map((o) => o.workoutId);
    const w2 = occurrences(home(), START, '2026-12-07', '2026-12-13').map((o) => o.workoutId);
    expect(w1).toEqual(['full-a', 'full-b', 'full-a']);
    expect(w2).toEqual(['full-b', 'full-a', 'full-b']);
  });

  it('keeps times correct across the DST change', () => {
    const occ = occurrences(recomp(), '2027-03-22', '2027-03-28', '2027-03-29');
    expect(occ.map((o) => `${o.date} ${o.time}`)).toEqual(['2027-03-28 11:00', '2027-03-29 20:00']);
  });

  it('applies skip and move overrides with stable keys', () => {
    const occ = occurrences(recomp(), START, '2026-11-30', '2026-12-06', [
      { occurrenceKey: 'tue-lower-a@2026-12-01', action: 'skip' },
      { occurrenceKey: 'sun-lower-b@2026-12-06', action: 'move', date: '2026-12-05', time: '10:00' },
    ]);
    expect(occ.map((o) => `${o.key} ${o.date} ${o.time}`)).toEqual([
      'mon-upper-a@2026-11-30 2026-11-30 20:00',
      'thu-upper-b@2026-12-03 2026-12-03 20:00',
      'sun-lower-b@2026-12-06 2026-12-05 10:00',
    ]);
  });

  it('finds the next session', () => {
    expect(nextOccurrence(recomp(), START, '2026-12-01')?.workoutId).toBe('upper-b');
    expect(nextOccurrence(recomp(), START, '2026-11-24')?.date).toBe('2026-11-30');
  });
});
