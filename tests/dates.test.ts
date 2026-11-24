import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, nextWeekday, programmeWeek, todayIn, weekdayOf } from '../src/features/schedule/dates';

describe('dates', () => {
  it('adds days across DST changes without drifting', () => {
    expect(addDays('2027-03-27', 1)).toBe('2027-03-28'); // DST starts in Brussels
    expect(addDays('2027-03-28', 1)).toBe('2027-03-29');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // DST ended 25 Oct 2026
    expect(daysBetween('2026-11-30', '2027-02-21')).toBe(83);
  });

  it('knows weekdays', () => {
    expect(weekdayOf('2026-11-30')).toBe('monday');
    expect(weekdayOf('2026-12-06')).toBe('sunday');
    expect(nextWeekday('2026-11-24', 'monday')).toBe('2026-11-30');
    expect(nextWeekday('2026-11-30', 'monday')).toBe('2026-11-30');
  });

  it('computes programme weeks', () => {
    expect(programmeWeek('2026-11-30', '2026-11-29')).toBe(0);
    expect(programmeWeek('2026-11-30', '2026-11-30')).toBe(1);
    expect(programmeWeek('2026-11-30', '2026-12-06')).toBe(1);
    expect(programmeWeek('2026-11-30', '2026-12-07')).toBe(2);
  });

  it('gets today in a timezone', () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Brussels
    expect(todayIn('Europe/Brussels', new Date('2026-11-30T23:30:00Z'))).toBe('2026-12-01');
    expect(todayIn('America/New_York', new Date('2026-11-30T23:30:00Z'))).toBe('2026-11-30');
  });
});
