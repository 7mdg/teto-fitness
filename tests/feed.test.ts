import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PlanRecord } from '../src/db/db';
import { buildPlanEvents, buildPlanIcs, feedFingerprint, segments } from '../src/features/calendar/feed';
import type { Plan } from '../src/features/plans/types';

const recomp = () => JSON.parse(readFileSync('public/examples/teto-recomp-12w.json', 'utf8')) as Plan;
const home = () => JSON.parse(readFileSync('public/examples/full-body-3d-home.json', 'utf8')) as Plan;
const rec = (json: Plan, startDate = '2026-11-30'): PlanRecord => ({ id: json.metadata.id, status: 'active', revision: 1, importedAt: '', startDate, json });

describe('calendar feed', () => {
  it('splits the programme into phase segments; the last one continues', () => {
    expect(segments(recomp(), '2026-11-30')).toEqual([
      { phase: recomp().programme!.phases![0], from: '2026-11-30', to: '2026-12-20' },
      { phase: recomp().programme!.phases![1], from: '2026-12-21', to: undefined },
    ]);
  });

  it('creates one recurring event per entry per phase with phase-adjusted notes', () => {
    const ev = buildPlanEvents(rec(recomp()), [], [], [1440, 30]);
    expect(ev).toHaveLength(8);
    const introMon = ev.find((e) => e.uid === 'teto-recomp-12w.mon-upper-a.intro@teto-fitness')!;
    expect(introMon).toMatchObject({ startLocal: '2026-11-30T20:00', rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261220T215959Z', durationMinutes: 60 });
    expect(introMon.description).toContain('Incline dumbbell press: 2 × 8–12');
    const progSun = ev.find((e) => e.uid === 'teto-recomp-12w.sun-lower-b.progression@teto-fitness')!;
    expect(progSun).toMatchObject({ startLocal: '2026-12-27T11:00', rrule: 'FREQ=WEEKLY;BYDAY=SU' });
    expect(progSun.description).toContain('Leg press: 3 × 10–15');
    expect(introMon.alarms).toEqual([{ minutesBefore: 1440 }, { minutesBefore: 30 }]);
  });

  it('turns skips into EXDATEs and moves into EXDATE + a single event', () => {
    const ev = buildPlanEvents(
      rec(recomp()),
      [
        { occurrenceKey: 'tue-lower-a@2026-12-01', action: 'skip' },
        { occurrenceKey: 'sun-lower-b@2026-12-06', action: 'move', date: '2026-12-05', time: '10:00' },
      ],
      [],
      [30],
    );
    expect(ev.find((e) => e.uid === 'teto-recomp-12w.tue-lower-a.intro@teto-fitness')?.exdatesLocal).toEqual(['2026-12-01']);
    expect(ev.find((e) => e.uid === 'teto-recomp-12w.sun-lower-b.intro@teto-fitness')?.exdatesLocal).toEqual(['2026-12-06']);
    expect(ev.find((e) => e.uid === 'teto-recomp-12w.sun-lower-b.2026-12-06@teto-fitness')).toMatchObject({ startLocal: '2026-12-05T10:00' });
  });

  it('applies permanent swaps to the notes', () => {
    const ev = buildPlanEvents(rec(recomp()), [], [{ kind: 'slotSwap', itemId: 'upper-a#1', value: 'dumbbell-bench-press' }], []);
    expect(ev.find((e) => e.uid.includes('mon-upper-a.intro'))!.description).toContain('Dumbbell bench press: 2 × 8–12');
  });

  it('handles alternating weeks with INTERVAL=2 and the right first dates', () => {
    const ev = buildPlanEvents(rec(home()), [], [], []);
    expect(ev.find((e) => e.uid === 'full-body-3d-home.mon-a.all@teto-fitness')).toMatchObject({ startLocal: '2026-11-30T18:30', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' });
    expect(ev.find((e) => e.uid === 'full-body-3d-home.mon-b.all@teto-fitness')).toMatchObject({ startLocal: '2026-12-07T18:30' });
  });

  it('ends the series when the programme stops', () => {
    const p = recomp();
    p.programme!.onCompletion = 'stop';
    const ev = buildPlanEvents(rec(p), [], [], []);
    expect(ev.find((e) => e.uid.includes('mon-upper-a.progression'))!.rrule).toContain('UNTIL=20270221T215959Z');
  });

  it('produces a valid calendar and a stable fingerprint', () => {
    const a = buildPlanIcs(rec(recomp()), [], [], [1440, 30], new Date('2026-11-24T10:00:00Z'));
    const b = buildPlanIcs(rec(recomp()), [], [], [1440, 30], new Date('2026-11-25T10:00:00Z'));
    expect(a.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(a).toContain('DTSTART;TZID=Europe/Brussels:20261130T200000');
    expect(a.match(/BEGIN:VEVENT/g)).toHaveLength(8);
    expect(a.match(/BEGIN:VALARM/g)).toHaveLength(16);
    expect(feedFingerprint(a)).toBe(feedFingerprint(b));
    expect(feedFingerprint(a)).not.toBe(feedFingerprint(buildPlanIcs(rec(recomp()), [], [], [30])));
  });
});
