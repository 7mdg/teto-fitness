// Keeps the subscribed calendar (Cloudflare Worker) in step with the active plan (SPEC §9).
// The app builds the calendar text; the Worker only stores and serves it.
import { liveQuery } from 'dexie';
import { db, type TetoDB } from '../../db/db';
import { buildPlanIcs, feedFingerprint } from './feed';

const API = (import.meta.env.VITE_CAL_API ?? '').replace(/\/$/, '');
export const calendarAvailable = () => !!API;
export const feedUrl = (id: string) => `${API}/c/${id}.ics`;
export const webcalUrl = (id: string) => feedUrl(id).replace(/^https?:/, 'webcal:');

let lastPushed = '';

/** Builds the current calendar text, or an empty calendar when no plan is active. */
export async function currentIcs(database: TetoDB = db): Promise<string> {
  const record = await database.plans.where('status').equals('active').first();
  if (!record) return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TETO//TETO Fitness//EN\r\nX-WR-CALNAME:TETO Fitness\r\nEND:VCALENDAR\r\n';
  const sched = await database.scheduleOverrides.where('[planId+occurrenceKey]').between([record.id, ''], [record.id, '￿']).toArray();
  const overrides = await database.overrides.where('planId').equals(record.id).toArray();
  const prefs = await database.reminderPrefs.get('workout');
  const alarms = (prefs?.offsets ?? []).filter((o) => o.enabled).map((o) => o.minutes);
  return buildPlanIcs(record, sched, overrides, alarms);
}

export async function createFeed(database: TetoDB = db): Promise<string> {
  const res = await fetch(`${API}/api/feeds`, { method: 'POST' });
  if (!res.ok) throw new Error(`Could not create the calendar link (HTTP ${res.status})`);
  const { id, writeToken } = (await res.json()) as { id: string; writeToken: string };
  await database.calendarLink.put({ key: 'feed', id, writeToken, createdAt: new Date().toISOString() });
  lastPushed = '';
  await pushFeed(database, true);
  return id;
}

export async function pushFeed(database: TetoDB = db, force = false): Promise<boolean> {
  const link = await database.calendarLink.get('feed');
  if (!link || !API) return false;
  const ics = await currentIcs(database);
  const fp = feedFingerprint(ics);
  if (!force && fp === lastPushed) return true;
  const res = await fetch(`${API}/api/feeds/${link.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${link.writeToken}`, 'Content-Type': 'text/calendar' },
    body: ics,
  });
  if (!res.ok) throw new Error(`Calendar update failed (HTTP ${res.status})`);
  lastPushed = fp;
  await database.calendarLink.update('feed', { lastPushedAt: new Date().toISOString() });
  return true;
}

/** Revoked links serve an empty calendar, so subscribed devices drop the events on their next refresh. */
export async function removeFeed(database: TetoDB = db): Promise<void> {
  const link = await database.calendarLink.get('feed');
  if (!link) return;
  await fetch(`${API}/api/feeds/${link.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${link.writeToken}` } }).catch(() => undefined);
  await database.calendarLink.delete('feed');
  lastPushed = '';
}

export async function resetFeed(database: TetoDB = db): Promise<string> {
  await removeFeed(database);
  return createFeed(database);
}

/**
 * Watches everything that affects the calendar and pushes changes (debounced).
 * Offline or failed pushes retry when the connection returns or the app is reopened.
 */
export function startCalendarSync(database: TetoDB = db): () => void {
  if (!API) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void pushFeed(database).catch(() => undefined), 1500);
  };
  const sub = liveQuery(async () => {
    // Touch every input of the feed so liveQuery re-runs when any of them changes.
    const link = await database.calendarLink.get('feed');
    if (!link) return null;
    return currentIcs(database);
  }).subscribe({ next: (v) => v && schedule(), error: () => undefined });
  const onOnline = () => schedule();
  const onVisible = () => document.visibilityState === 'visible' && schedule();
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    sub.unsubscribe();
    clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
