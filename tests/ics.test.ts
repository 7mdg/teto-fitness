import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, foldLine } from '../src/features/calendar/ics';

const now = new Date('2026-11-24T12:00:00Z');

describe('ics', () => {
  it('escapes special characters', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds long lines at 75 octets', () => {
    const folded = foldLine('DESCRIPTION:' + 'x'.repeat(200));
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe('DESCRIPTION:' + 'x'.repeat(200));
  });

  it('writes a recurring local event with alarms and exdates', () => {
    const ics = buildIcs({
      name: 'TETO Fitness',
      timezone: 'Europe/Brussels',
      now,
      events: [
        {
          uid: 'teto-recomp-12w.mon-upper-a.intro@teto-fitness',
          title: 'Upper A · TETO',
          description: 'Incline dumbbell press 2×8–12',
          startLocal: '2026-11-30T20:00',
          durationMinutes: 60,
          rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261220T225959Z',
          exdatesLocal: ['2026-12-07'],
          alarms: [{ minutesBefore: 1440 }, { minutesBefore: 30 }],
        },
      ],
    });
    expect(ics).toContain('DTSTART;TZID=Europe/Brussels:20261130T200000');
    expect(ics).toContain('DURATION:PT1H');
    expect(ics).toContain('EXDATE;TZID=Europe/Brussels:20261207T200000');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('writes UTC one-off events', () => {
    const ics = buildIcs({
      name: 'Test',
      timezone: 'Europe/Brussels',
      now,
      events: [{ uid: 'x@t', title: 'Now', startUtc: new Date('2026-11-24T13:15:00Z'), durationMinutes: 45, alarms: [{ minutesBefore: 0 }] }],
    });
    expect(ics).toContain('DTSTART:20261124T131500Z');
    expect(ics).toContain('DURATION:PT45M');
    expect(ics).toContain('TRIGGER:PT0M');
  });
});
