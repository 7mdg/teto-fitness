import { weekdayShort } from '../schedule/dates';
import { WEEKDAYS, type Exercise, type Habit, type Plan, type ScheduleEntry, type Workout, type WorkoutExercise } from './types';

export function durationLabel(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** "8–12" | "40 s" | "15 min" | "2 km" | "done" */
export function targetLabel(we: WorkoutExercise, ex?: Exercise): string {
  const t = ex?.tracking;
  if (t === 'duration' || t === 'isometric') return we.durationSec ? durationLabel(we.durationSec) : '';
  if (t === 'cardio') {
    const parts = [we.distanceM ? `${we.distanceM >= 1000 ? `${we.distanceM / 1000} km` : `${we.distanceM} m`}` : '', we.durationSec ? durationLabel(we.durationSec) : ''];
    return parts.filter(Boolean).join(' · ');
  }
  if (t === 'checkbox') return 'done';
  if (we.repsMin && we.repsMax && we.repsMin !== we.repsMax) return `${we.repsMin}–${we.repsMax}`;
  return String(we.repsMin ?? we.repsMax ?? '');
}

export function prescriptionLabel(sets: number, we: WorkoutExercise, ex?: Exercise): string {
  const target = targetLabel(we, ex);
  return target ? `${sets} × ${target}` : `${sets} sets`;
}

export function estimatedLabel(w: Workout): string | undefined {
  const d = w.estimatedDurationMinutes;
  if (!d) return undefined;
  return typeof d === 'number' ? `${d} min` : `${d.min}–${d.max} min`;
}

const UNIT: Record<string, string> = { min: 'min', h: 'h', count: '', steps: 'steps', l: 'l', km: 'km' };
export function habitTargetLabel(h: Habit): string {
  if (!h.target) return '';
  const { min, max, unit } = h.target;
  const u = UNIT[unit] ?? unit;
  const n = (v: number) => v.toLocaleString('en-GB');
  if (min !== undefined && max !== undefined) return `${n(min)}–${n(max)} ${u}`.trim();
  if (min !== undefined) return `${n(min)}+ ${u}`.trim();
  if (max !== undefined) return `≤ ${n(max)} ${u}`.trim();
  return '';
}

export function habitDaysLabel(h: Habit): string {
  if (h.weekdays?.length) {
    const days = h.weekdays;
    const weekdaysOnly = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    if (days.length === 7) return 'Daily';
    if (days.length === 5 && weekdaysOnly.every((d) => days.includes(d as never))) return 'Mon–Fri';
    return days.map(weekdayShort).join(', ');
  }
  return h.frequency === 'weekly' ? 'Weekly' : 'Daily';
}

/** Weekly entries ordered from the plan's week start, then one-off dates. */
export function orderedEntries(plan: Plan): ScheduleEntry[] {
  const start = WEEKDAYS.indexOf(plan.schedule.weekStartsOn ?? 'monday');
  const rank = (e: ScheduleEntry) => (e.weekday ? (WEEKDAYS.indexOf(e.weekday) - start + 7) % 7 : 7);
  return [...plan.schedule.entries].sort((a, b) => rank(a) - rank(b) || a.time.localeCompare(b.time) || (a.weekOffset ?? 0) - (b.weekOffset ?? 0));
}

export function entryWhen(e: ScheduleEntry): string {
  const every = e.everyNWeeks ?? 1;
  const cycle = every > 1 ? ` · week ${String.fromCharCode(65 + (e.weekOffset ?? 0))} of ${every}` : '';
  return e.weekday ? `${weekdayShort(e.weekday)} ${e.time}${cycle}` : `${e.date} ${e.time}`;
}
