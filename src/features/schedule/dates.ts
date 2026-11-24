// Calendar-date helpers on "YYYY-MM-DD" strings. Arithmetic is done in UTC so DST never shifts a date.
import { WEEKDAYS, type Weekday } from '../plans/types';

const DAY = 86_400_000;

export function parseDate(d: string): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const addDays = (d: string, n: number) => formatDate(parseDate(d) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((parseDate(to) - parseDate(from)) / DAY);

/** Monday = 0 … Sunday = 6 */
export function weekdayIndex(d: string): number {
  return (new Date(parseDate(d)).getUTCDay() + 6) % 7;
}
export const weekdayOf = (d: string): Weekday => WEEKDAYS[weekdayIndex(d)]!;

/** Today's date in an IANA timezone, e.g. todayIn('Europe/Brussels') -> "2026-11-24". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** First date >= from that falls on the given weekday. */
export function nextWeekday(from: string, day: Weekday): string {
  const diff = (WEEKDAYS.indexOf(day) - weekdayIndex(from) + 7) % 7;
  return addDays(from, diff);
}

/** 1-based programme week for a date, or 0 before the start. */
export function programmeWeek(startDate: string, date: string): number {
  const diff = daysBetween(startDate, date);
  return diff < 0 ? 0 : Math.floor(diff / 7) + 1;
}

const LOCALE = 'en-GB';
export function formatShort(d: string): string {
  return new Date(parseDate(d)).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function formatLong(d: string): string {
  return new Date(parseDate(d)).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
export const weekdayShort = (w: Weekday) => w.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
