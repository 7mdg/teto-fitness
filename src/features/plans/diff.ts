// Summarises meaningful differences between two plan revisions (SPEC §7 update flow).
import { prescriptionLabel } from './format';
import type { Plan } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function diffPlans(oldPlan: Plan, newPlan: Plan): string[] {
  const out: string[] = [];
  const exName = (p: Plan, id: string) => p.exercises.find((e) => e.id === id)?.name ?? id;

  if (oldPlan.metadata.name !== newPlan.metadata.name) out.push(`Renamed to "${newPlan.metadata.name}"`);
  const od = oldPlan.programme?.durationWeeks;
  const nd = newPlan.programme?.durationWeeks;
  if (od !== nd) out.push(`Duration: ${od ?? '–'} → ${nd ?? '–'} weeks`);

  // Workouts
  const oldW = new Map(oldPlan.workouts.map((w) => [w.id, w]));
  const newW = new Map(newPlan.workouts.map((w) => [w.id, w]));
  for (const w of newPlan.workouts) if (!oldW.has(w.id)) out.push(`New workout: ${w.name}`);
  for (const w of oldPlan.workouts) if (!newW.has(w.id)) out.push(`Removed workout: ${w.name}`);
  for (const nw of newPlan.workouts) {
    const ow = oldW.get(nw.id);
    if (!ow) continue;
    if (ow.name !== nw.name) out.push(`${ow.name} renamed to ${nw.name}`);
    const oldIds = ow.exercises.map((e) => e.exerciseId);
    const newIds = nw.exercises.map((e) => e.exerciseId);
    const added = newIds.filter((id) => !oldIds.includes(id));
    const removed = oldIds.filter((id) => !newIds.includes(id));
    if (added.length === 1 && removed.length === 1) {
      out.push(`${nw.name}: ${exName(oldPlan, removed[0]!)} → ${exName(newPlan, added[0]!)}`);
    } else {
      for (const id of added) out.push(`${nw.name}: added ${exName(newPlan, id)}`);
      for (const id of removed) out.push(`${nw.name}: removed ${exName(oldPlan, id)}`);
    }
    for (const ne of nw.exercises) {
      const oe = ow.exercises.find((e) => e.exerciseId === ne.exerciseId);
      if (!oe) continue;
      const ex = newPlan.exercises.find((e) => e.id === ne.exerciseId);
      const a = prescriptionLabel(oe.sets, oe, ex);
      const b = prescriptionLabel(ne.sets, ne, ex);
      if (a !== b) out.push(`${nw.name}: ${exName(newPlan, ne.exerciseId)} ${a} → ${b}`);
    }
    const kept = newIds.filter((id) => oldIds.includes(id));
    const oldOrder = oldIds.filter((id) => kept.includes(id));
    if (kept.join() !== oldOrder.join()) out.push(`${nw.name}: exercise order changed`);
  }

  // Schedule
  const wName = (p: Plan, id: string) => p.workouts.find((w) => w.id === id)?.name ?? id;
  const when = (e: Plan['schedule']['entries'][number]) => `${e.weekday ? cap(e.weekday.slice(0, 3)) : e.date} ${e.time}`;
  const oldE = new Map(oldPlan.schedule.entries.map((e) => [e.id, e]));
  const newE = new Map(newPlan.schedule.entries.map((e) => [e.id, e]));
  for (const e of newPlan.schedule.entries) {
    const o = oldE.get(e.id);
    if (!o) out.push(`Scheduled: ${wName(newPlan, e.workoutId)} ${when(e)}`);
    else if (when(o) !== when(e) || o.workoutId !== e.workoutId || (o.everyNWeeks ?? 1) !== (e.everyNWeeks ?? 1)) {
      out.push(`${wName(newPlan, e.workoutId)} moved: ${when(o)} → ${when(e)}`);
    }
  }
  for (const e of oldPlan.schedule.entries) if (!newE.has(e.id)) out.push(`Unscheduled: ${wName(oldPlan, e.workoutId)} ${when(e)}`);

  // Phases
  const ph = (p: Plan) => (p.programme?.phases ?? []).map((x) => `${x.name} wk ${x.startWeek}–${x.endWeek}${x.workingSetsCap ? ` (${x.workingSetsCap} sets)` : ''}`).join(', ');
  if (ph(oldPlan) !== ph(newPlan)) out.push(`Phases: ${ph(newPlan) || 'none'}`);

  // Habits and measurements
  const ids = <T extends { id: string; name: string }>(a: T[] = [], b: T[] = [], label: string) => {
    for (const x of b) if (!a.some((y) => y.id === x.id)) out.push(`New ${label}: ${x.name}`);
    for (const x of a) if (!b.some((y) => y.id === x.id)) out.push(`Removed ${label}: ${x.name}`);
  };
  ids(oldPlan.habits, newPlan.habits, 'habit');
  ids(oldPlan.measurements, newPlan.measurements, 'measurement');

  const r = (p: Plan) => (p.reminders?.workout?.offsetsMinutes ?? []).join(',');
  if (r(oldPlan) !== r(newPlan)) out.push('Suggested reminders changed (your own reminder settings are kept)');

  // New alternatives are useful to know about but not worth one line each.
  const newAlts = newPlan.exercises.filter((e) => !oldPlan.exercises.some((o) => o.id === e.id)).length;
  if (newAlts > 0 && out.length === 0) out.push(`${newAlts} new exercise${newAlts === 1 ? '' : 's'} in the library`);

  return out;
}
