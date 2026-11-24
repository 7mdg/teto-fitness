import { describe, expect, it } from 'vitest';
import { buildPrefill, detectRecords, e1rm, perSetIndex, summariseSets, type LoggedSet } from '../src/features/training/progression';
import { displayIncrement, formatWeight, fromDisplay, parseDecimal } from '../src/features/training/units';

const strength = { tracking: 'strength' as const, weightIncrementKg: 2 };
const set = (i: number, w: number, r: number, side: LoggedSet['side'] = 'both'): LoggedSet => ({ setIndex: i, side, weightKg: w, reps: r });

describe('prefill and double progression', () => {
  it('leaves weight empty on the first session', () => {
    const p = buildPrefill([], { sets: 2, repsMin: 8, repsMax: 12 }, strength);
    expect(p.rows).toEqual([{}, {}].map(() => ({ durationSec: undefined, distanceM: undefined })));
    expect(p.progressedByKg).toBeUndefined();
  });

  it('repeats last time when the top of the range was not reached', () => {
    const p = buildPrefill([set(0, 22, 12), set(1, 22, 11)], { sets: 2, repsMin: 8, repsMax: 12 }, strength);
    expect(p.rows.map((r) => [r.weightKg, r.reps])).toEqual([[22, 12], [22, 11]]);
    expect(p.progressedByKg).toBeUndefined();
  });

  it('adds one increment and resets reps to repsMin when every set hit repsMax', () => {
    const p = buildPrefill([set(0, 22, 12), set(1, 22, 12)], { sets: 2, repsMin: 8, repsMax: 12 }, strength);
    expect(p.rows.map((r) => [r.weightKg, r.reps])).toEqual([[24, 8], [24, 8]]);
    expect(p.progressedByKg).toBe(2);
  });

  it('does not progress when more sets are prescribed than were done (phase change 2 -> 3)', () => {
    const p = buildPrefill([set(0, 22, 12), set(1, 22, 12)], { sets: 3, repsMin: 8, repsMax: 12 }, strength);
    expect(p.progressedByKg).toBeUndefined();
    expect(p.rows).toHaveLength(3);
    expect(p.rows[2]).toMatchObject({ weightKg: 22, reps: 12 });
  });

  it('uses the weaker side for per-side sets', () => {
    const rows = perSetIndex([set(0, 10, 15, 'left'), set(0, 10, 13, 'right')]);
    expect(rows).toEqual([{ weightKg: 10, reps: 13, durationSec: undefined, distanceM: undefined }]);
  });

  it('can be switched off', () => {
    const p = buildPrefill([set(0, 22, 12), set(1, 22, 12)], { sets: 2, repsMin: 8, repsMax: 12 }, strength, false);
    expect(p.progressedByKg).toBeUndefined();
  });
});

describe('records', () => {
  it('computes Epley e1RM', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(Math.round(e1rm(100, 10) * 10) / 10).toBe(133.3);
  });

  it('only reports PRs against earlier history', () => {
    expect(detectRecords('x', [set(0, 30, 8)], [])).toEqual([]);
    const prs = detectRecords('x', [set(0, 30, 8)], [set(0, 28, 10)]);
    expect(prs.map((p) => p.kind)).toEqual(['weight', 'e1rm']);
    expect(detectRecords('x', [set(0, 28, 9)], [set(0, 28, 10)])).toEqual([]);
  });
});

describe('formatting and units', () => {
  it('summarises sets compactly', () => {
    expect(summariseSets([{ weightKg: 22, reps: 12 }, { weightKg: 22, reps: 11 }], String)).toBe('22 × 12, 11');
    expect(summariseSets([{ weightKg: 22, reps: 12 }, { weightKg: 24, reps: 8 }], String)).toBe('22×12, 24×8');
    expect(summariseSets([{ durationSec: 40 }], String)).toBe('40 s');
  });

  it('parses decimals with comma or dot', () => {
    expect(parseDecimal('22,5')).toBe(22.5);
    expect(parseDecimal('23.75')).toBe(23.75);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('abc')).toBeUndefined();
    expect(parseDecimal('-2')).toBeUndefined();
  });

  it('converts kg and lb losslessly for storage', () => {
    expect(formatWeight(22.5, 'kg')).toBe('22.5');
    expect(formatWeight(20, 'lb')).toBe('44.1');
    expect(Math.round(fromDisplay(44.1, 'lb') * 10) / 10).toBe(20);
    expect(displayIncrement(2.5, 'lb')).toBe(5);
    expect(displayIncrement(1, 'lb')).toBe(2);
  });
});
