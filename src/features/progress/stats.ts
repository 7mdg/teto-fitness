// Series builders for the Progress charts. Pure functions.
import type { MeasurementRecord, SessionRecord, SetRecord } from '../../db/db';
import { addDays, daysBetween } from '../schedule/dates';
import { e1rm } from '../training/progression';

export interface Point {
  x: string; // YYYY-MM-DD
  y: number;
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** One point per session: best estimated 1RM, or heaviest weight, for an exercise. */
export function strengthSeries(exerciseId: string, sets: SetRecord[], sessions: SessionRecord[], metric: 'e1rm' | 'weight'): Point[] {
  const done = new Map(sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));
  const bySession = new Map<string, SetRecord[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || !done.has(s.sessionId) || s.weightKg === undefined || !s.reps) continue;
    bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  }
  return [...bySession.entries()]
    .map(([sid, list]) => ({
      x: localDate(done.get(sid)!.startedAt),
      y: Math.round(Math.max(...list.map((s) => (metric === 'e1rm' ? e1rm(s.weightKg!, s.reps!) : s.weightKg!))) * 10) / 10,
    }))
    .sort((a, b) => a.x.localeCompare(b.x));
}

export function measurementSeries(measurementId: string, records: MeasurementRecord[]): Point[] {
  return records
    .filter((r) => r.measurementId === measurementId)
    .map((r) => ({ x: r.date, y: r.value }))
    .sort((a, b) => a.x.localeCompare(b.x));
}

/** Trailing 7-day average at each measured date (days without a value are simply skipped). */
export function rolling7(points: Point[]): Point[] {
  return points.map((p) => {
    const from = addDays(p.x, -6);
    const win = points.filter((q) => daysBetween(from, q.x) >= 0 && daysBetween(q.x, p.x) >= 0);
    return { x: p.x, y: Math.round((win.reduce((s, q) => s + q.y, 0) / win.length) * 100) / 100 };
  });
}

/** Change from the first to the last value within the last `days` days. */
export function recentChange(points: Point[], days: number): number | undefined {
  if (points.length < 2) return undefined;
  const last = points[points.length - 1]!;
  const from = addDays(last.x, -days);
  const first = points.find((p) => daysBetween(from, p.x) >= 0);
  if (!first || first === last) return undefined;
  return Math.round((last.y - first.y) * 10) / 10;
}
