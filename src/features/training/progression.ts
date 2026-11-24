// Prefill, double progression and personal records. Pure functions (SPEC §8.3).
import type { Exercise } from '../plans/types';

export interface LoggedSet {
  setIndex: number;
  side: 'both' | 'left' | 'right';
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

export interface SlotTarget {
  sets: number;
  repsMin?: number;
  repsMax?: number;
  durationSec?: number;
  distanceM?: number;
}

export interface PrefillRow {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

export interface Prefill {
  rows: PrefillRow[];
  /** Weight added versus last time, when double progression triggers. */
  progressedByKg?: number;
}

/** Collapse per-side sets to one row per set index (the weaker side counts for progression). */
export function perSetIndex(sets: LoggedSet[]): PrefillRow[] {
  const byIdx = new Map<number, LoggedSet[]>();
  for (const s of sets) byIdx.set(s.setIndex, [...(byIdx.get(s.setIndex) ?? []), s]);
  return [...byIdx.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => ({
      weightKg: group.find((g) => g.weightKg !== undefined)?.weightKg,
      reps: group.every((g) => g.reps !== undefined) ? Math.min(...group.map((g) => g.reps!)) : undefined,
      durationSec: group[0]?.durationSec,
      distanceM: group[0]?.distanceM,
    }));
}

/**
 * Builds today's prefilled rows from the last session of the same exercise.
 * Double progression: if every working set reached repsMax last time, add one increment and aim for repsMin.
 */
export function buildPrefill(previous: LoggedSet[], target: SlotTarget, exercise: Pick<Exercise, 'tracking' | 'weightIncrementKg'>, progression = true): Prefill {
  const last = perSetIndex(previous);
  const rows: PrefillRow[] = [];
  if (last.length === 0) {
    for (let i = 0; i < target.sets; i++) rows.push({ durationSec: target.durationSec, distanceM: target.distanceM });
    return { rows };
  }

  const usesWeight = exercise.tracking === 'strength' && last.some((r) => r.weightKg !== undefined);
  const inc = exercise.weightIncrementKg;
  const reachedTop =
    progression &&
    usesWeight &&
    !!inc &&
    target.repsMax !== undefined &&
    last.length >= target.sets &&
    last.slice(0, target.sets).every((r) => (r.reps ?? 0) >= target.repsMax!);

  if (reachedTop) {
    const base = Math.max(...last.slice(0, target.sets).map((r) => r.weightKg ?? 0));
    const next = Math.round((base + inc!) * 100) / 100;
    for (let i = 0; i < target.sets; i++) rows.push({ weightKg: next, reps: target.repsMin ?? target.repsMax });
    return { rows, progressedByKg: inc };
  }

  for (let i = 0; i < target.sets; i++) {
    const src = last[Math.min(i, last.length - 1)]!;
    rows.push({ weightKg: src.weightKg, reps: src.reps, durationSec: src.durationSec ?? target.durationSec, distanceM: src.distanceM ?? target.distanceM });
  }
  return { rows };
}

/** Epley estimated one-rep max. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export interface PersonalRecord {
  exerciseId: string;
  kind: 'weight' | 'e1rm';
  valueKg: number;
  previousKg: number;
}

/** PRs only count against earlier history; the first time an exercise is done sets the baseline. */
export function detectRecords(exerciseId: string, current: LoggedSet[], history: LoggedSet[]): PersonalRecord[] {
  const weighted = (sets: LoggedSet[]) => sets.filter((s) => s.weightKg !== undefined && (s.reps ?? 0) > 0);
  const cur = weighted(current);
  const prev = weighted(history);
  if (!cur.length || !prev.length) return [];
  const out: PersonalRecord[] = [];
  const maxW = (s: LoggedSet[]) => Math.max(...s.map((x) => x.weightKg!));
  const maxE = (s: LoggedSet[]) => Math.max(...s.map((x) => e1rm(x.weightKg!, x.reps!)));
  if (maxW(cur) > maxW(prev)) out.push({ exerciseId, kind: 'weight', valueKg: maxW(cur), previousKg: maxW(prev) });
  if (maxE(cur) > maxE(prev) + 0.01) out.push({ exerciseId, kind: 'e1rm', valueKg: Math.round(maxE(cur) * 10) / 10, previousKg: Math.round(maxE(prev) * 10) / 10 });
  return out;
}

/** "22 × 12, 12, 11" or "40 s, 40 s" — compact last-performance line. */
export function summariseSets(rows: PrefillRow[], fmtWeight: (kg: number) => string): string {
  if (!rows.length) return '';
  const weights = rows.map((r) => r.weightKg);
  const sameWeight = weights.every((w) => w === weights[0]);
  const part = (r: PrefillRow) =>
    r.reps !== undefined ? String(r.reps) : r.durationSec !== undefined ? `${r.durationSec} s` : r.distanceM !== undefined ? `${r.distanceM} m` : '✓';
  if (sameWeight && weights[0] !== undefined) return `${fmtWeight(weights[0])} × ${rows.map(part).join(', ')}`;
  return rows.map((r) => (r.weightKg !== undefined ? `${fmtWeight(r.weightKg)}×${part(r)}` : part(r))).join(', ');
}
