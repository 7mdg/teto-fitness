// Turns the active plan into an iCalendar feed (SPEC §9): one recurring event per schedule entry per
// phase, EXDATEs for skipped/moved sessions, single events for moved and one-off sessions, alarms from
// the user's reminder settings. Recurrence rules mean the feed stays correct without refreshes.
import type { OverrideRecord, PlanRecord, ScheduleOverrideRecord } from '../../db/db';
import { estimatedLabel, prescriptionLabel } from '../plans/format';
import { effectiveSets, planTimezone } from '../plans/summary';
import type { Phase, Plan, ScheduleEntry } from '../plans/types';
import { addDays, daysBetween, formatDate, parseDate, programmeWeek, weekdayOf } from '../schedule/dates';
import { buildIcs, type IcsEvent } from './ics';

const BYDAY: Record<string, string> = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };

interface Segment {
  phase?: Phase;
  from: string; // first day (inclusive)
  to?: string; // last day (inclusive); undefined = open-ended
}

/** Date ranges of the programme, one per phase (or one open range without phases). */
export function segments(plan: Plan, startDate: string): Segment[] {
  const weeks = plan.programme?.durationWeeks;
  const stop = plan.programme?.onCompletion === 'stop';
  const phases = [...(plan.programme?.phases ?? [])].sort((a, b) => a.startWeek - b.startWeek);
  const weekStart = (w: number) => addDays(startDate, (w - 1) * 7);
  const end = weeks ? addDays(startDate, weeks * 7 - 1) : undefined;
  if (!phases.length) return [{ from: startDate, to: stop ? end : undefined }];
  const out: Segment[] = [];
  // Weeks before the first phase (unusual) count as a phase-less segment.
  if (phases[0]!.startWeek > 1) out.push({ from: startDate, to: addDays(weekStart(phases[0]!.startWeek), -1) });
  phases.forEach((ph, i) => {
    const last = i === phases.length - 1;
    out.push({ phase: ph, from: weekStart(ph.startWeek), to: last ? (stop ? end : undefined) : addDays(weekStart(ph.endWeek + 1), -1) });
  });
  return out;
}

/** First date on/after `from` (and ≤ `to`) on which a weekly entry occurs. */
function firstOccurrence(entry: ScheduleEntry, startDate: string, from: string, to?: string): string | undefined {
  const every = entry.everyNWeeks ?? 1;
  for (let i = 0; i < 7 * every; i++) {
    const d = addDays(from, i);
    if (to && daysBetween(d, to) < 0) return undefined;
    if (weekdayOf(d) !== entry.weekday) continue;
    if ((programmeWeek(startDate, d) - 1) % every === (entry.weekOffset ?? 0)) return d;
  }
  return undefined;
}

function durationMinutes(plan: Plan, workoutId: string): number {
  const d = plan.workouts.find((w) => w.id === workoutId)?.estimatedDurationMinutes;
  if (!d) return 60;
  return typeof d === 'number' ? d : d.max;
}

function description(plan: Plan, workoutId: string, phase: Phase | undefined, swaps: Map<string, string>): string {
  const w = plan.workouts.find((x) => x.id === workoutId);
  if (!w) return '';
  const ex = (id: string) => plan.exercises.find((e) => e.id === id);
  const lines = w.exercises.map((we, slot) => {
    const id = swaps.get(`${workoutId}#${slot}`) ?? we.exerciseId;
    const def = ex(id) ?? ex(we.exerciseId);
    return `${def?.name ?? id}: ${prescriptionLabel(effectiveSets(we.sets, phase), we, def)}${we.optional ? ' (optional)' : ''}`;
  });
  const head = [phase?.name, estimatedLabel(w)].filter(Boolean).join(' · ');
  return [head, ...lines].filter(Boolean).join('\n');
}

/** UNTIL for a local end date: just before local midnight, expressed in UTC (safe for CET and CEST). */
const untilUtc = (date: string) => `${date.replace(/-/g, '')}T215959Z`;

export function buildPlanEvents(
  record: PlanRecord,
  scheduleOverrides: Pick<ScheduleOverrideRecord, 'occurrenceKey' | 'action' | 'date' | 'time'>[],
  overrides: Pick<OverrideRecord, 'kind' | 'itemId' | 'value'>[],
  alarmsMinutes: number[],
): IcsEvent[] {
  const plan = record.json;
  const swaps = new Map(overrides.filter((o) => o.kind === 'slotSwap').map((o) => [o.itemId, String(o.value)]));
  const alarms = [...new Set(alarmsMinutes)].sort((a, b) => b - a).map((minutesBefore) => ({ minutesBefore }));
  const sequence = Math.floor(Date.now() / 1000);
  const name = (id: string) => plan.workouts.find((w) => w.id === id)?.name ?? id;
  const events: IcsEvent[] = [];
  const segs = segments(plan, record.startDate);
  const phaseAt = (date: string) => segs.find((s) => daysBetween(s.from, date) >= 0 && (!s.to || daysBetween(date, s.to) >= 0))?.phase;
  const changedDates = new Map<string, string[]>(); // entryId -> original dates that are skipped/moved

  for (const o of scheduleOverrides) {
    const [entryId, date] = o.occurrenceKey.split('@') as [string, string];
    changedDates.set(entryId, [...(changedDates.get(entryId) ?? []), date]);
    if (o.action === 'move' && o.date) {
      const entry = plan.schedule.entries.find((e) => e.id === entryId);
      if (!entry) continue;
      const phase = phaseAt(o.date);
      events.push({
        uid: `${plan.metadata.id}.${o.occurrenceKey.replace('@', '.')}@teto-fitness`,
        title: `${name(entry.workoutId)} · TETO`,
        description: description(plan, entry.workoutId, phase, swaps),
        startLocal: `${o.date}T${o.time ?? entry.time}`,
        durationMinutes: durationMinutes(plan, entry.workoutId),
        alarms,
        sequence,
      });
    }
  }

  for (const entry of plan.schedule.entries) {
    const base = {
      title: `${name(entry.workoutId)} · TETO`,
      durationMinutes: durationMinutes(plan, entry.workoutId),
      alarms,
      sequence,
    };
    if (entry.date) {
      if ((changedDates.get(entry.id) ?? []).includes(entry.date)) continue;
      if (daysBetween(record.startDate, entry.date) < 0) continue;
      events.push({ ...base, uid: `${plan.metadata.id}.${entry.id}@teto-fitness`, description: description(plan, entry.workoutId, phaseAt(entry.date), swaps), startLocal: `${entry.date}T${entry.time}` });
      continue;
    }
    for (const seg of segs) {
      const first = firstOccurrence(entry, record.startDate, seg.from, seg.to);
      if (!first) continue;
      const every = entry.everyNWeeks ?? 1;
      const rrule = [`FREQ=WEEKLY`, every > 1 ? `INTERVAL=${every}` : '', `BYDAY=${BYDAY[entry.weekday!]}`, seg.to ? `UNTIL=${untilUtc(seg.to)}` : ''].filter(Boolean).join(';');
      const exdates = (changedDates.get(entry.id) ?? []).filter((d) => daysBetween(seg.from, d) >= 0 && (!seg.to || daysBetween(d, seg.to) >= 0));
      events.push({
        ...base,
        uid: `${plan.metadata.id}.${entry.id}.${seg.phase?.id ?? 'all'}@teto-fitness`,
        description: description(plan, entry.workoutId, seg.phase, swaps),
        startLocal: `${first}T${entry.time}`,
        rrule,
        exdatesLocal: exdates,
      });
    }
  }
  return events;
}

export function buildPlanIcs(
  record: PlanRecord,
  scheduleOverrides: Parameters<typeof buildPlanEvents>[1],
  overrides: Parameters<typeof buildPlanEvents>[2],
  alarmsMinutes: number[],
  now?: Date,
): string {
  return buildIcs({
    name: 'TETO Fitness',
    timezone: planTimezone(record.json),
    events: buildPlanEvents(record, scheduleOverrides, overrides, alarmsMinutes),
    now,
  });
}

/** Content fingerprint that ignores DTSTAMP/SEQUENCE, to skip pushes when nothing changed. */
export function feedFingerprint(ics: string): string {
  const body = ics.replace(/^(DTSTAMP|SEQUENCE):.*$/gm, '');
  let h = 0;
  for (let i = 0; i < body.length; i++) h = (Math.imul(31, h) + body.charCodeAt(i)) | 0;
  return `${body.length}:${h >>> 0}`;
}

export { formatDate, parseDate };
