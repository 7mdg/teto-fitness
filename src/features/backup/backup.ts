// Full backup / restore and CSV export (SPEC §10).
import type { Table } from 'dexie';
import { db, type TetoDB } from '../../db/db';

export const BACKUP_FORMAT = 'teto-backup';
export const BACKUP_SCHEMA = 1;

/** Tables included in a backup (snapshots are local safety copies and are never exported). */
export const BACKUP_TABLES = [
  'plans',
  'planRevisions',
  'sessions',
  'sets',
  'customExercises',
  'measurements',
  'habitLogs',
  'scheduleOverrides',
  'settings',
  'profile',
  'overrides',
  'reminderPrefs',
  'calendarLink',
  'meta',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  data: Record<BackupTable, unknown[]>;
}

const table = (database: TetoDB, name: BackupTable) => (database as unknown as Record<string, Table>)[name]!;

export async function createBackup(database: TetoDB = db, appVersion = '0'): Promise<BackupFile> {
  const data = {} as Record<BackupTable, unknown[]>;
  await database.transaction('r', BACKUP_TABLES.map((t) => table(database, t)), async () => {
    for (const t of BACKUP_TABLES) data[t] = await table(database, t).toArray();
  });
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA, exportedAt: new Date().toISOString(), appVersion, data };
}

export async function markBackedUp(database: TetoDB = db) {
  const meta = (await database.meta.get('meta')) ?? { key: 'meta' as const, installId: crypto.randomUUID() };
  await database.meta.put({ ...meta, lastBackupAt: new Date().toISOString() });
}

export type BackupCheck = { ok: true; backup: BackupFile; counts: Record<string, number> } | { ok: false; error: string };

export function checkBackup(text: string): BackupCheck {
  if (text.length > 50 * 1024 * 1024) return { ok: false, error: 'File is larger than 50 MB.' };
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a valid JSON file.' };
  }
  const b = obj as Partial<BackupFile>;
  if (!b || typeof b !== 'object') return { ok: false, error: 'This is not a TETO backup.' };
  if (b.format !== BACKUP_FORMAT) {
    return { ok: false, error: (b as { format?: string }).format === 'teto-plan' ? 'This is a plan file. Use Import plan instead.' : 'This is not a TETO backup.' };
  }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > BACKUP_SCHEMA) return { ok: false, error: 'This backup was made by a newer app version. Update the app first.' };
  if (!b.data || typeof b.data !== 'object') return { ok: false, error: 'The backup has no data section.' };
  for (const t of BACKUP_TABLES) {
    const rows = (b.data as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) return { ok: false, error: `"${t}" in the backup is not a list.` };
    if (Array.isArray(rows) && rows.some((r) => !r || typeof r !== 'object')) return { ok: false, error: `"${t}" contains invalid rows.` };
  }
  const data = Object.fromEntries(BACKUP_TABLES.map((t) => [t, ((b.data as Record<string, unknown[]>)[t] ?? []) as unknown[]])) as Record<BackupTable, unknown[]>;
  const counts = { workouts: data.sessions.filter((s) => (s as { status?: string }).status === 'completed').length, sets: data.sets.length, measurements: data.measurements.length, plans: data.plans.length };
  return { ok: true, backup: { ...(b as BackupFile), data }, counts };
}

const stamp = (r: Record<string, unknown>) => String(r.loggedAt ?? r.endedAt ?? r.startedAt ?? r.importedAt ?? r.createdAt ?? '');

/**
 * Restores a backup. A local snapshot is taken first (last 3 kept), so a restore can be undone.
 * replace: the backup becomes the whole database. merge: rows are added by key; when both sides
 * have a row, the newer timestamp wins; single-value settings on this phone are kept.
 */
export async function restoreBackup(backup: BackupFile, mode: 'merge' | 'replace', database: TetoDB = db): Promise<void> {
  await snapshot('before restore', database);
  const tables = BACKUP_TABLES.map((t) => table(database, t));
  await database.transaction('rw', tables, async () => {
    for (const t of BACKUP_TABLES) {
      const tb = table(database, t);
      const rows = backup.data[t] as Record<string, unknown>[];
      if (mode === 'replace') {
        await tb.clear();
        if (rows.length) await tb.bulkPut(rows);
        continue;
      }
      const singleton = ['settings', 'profile', 'reminderPrefs', 'calendarLink', 'meta'].includes(t);
      for (const row of rows) {
        const kp = tb.schema.primKey.keyPath;
        const key = Array.isArray(kp) ? kp.map((p) => row[p]) : row[kp as string];
        if (key === undefined) continue;
        const existing = (await tb.get(key)) as Record<string, unknown> | undefined;
        if (!existing) await tb.put(row);
        else if (!singleton && stamp(row) > stamp(existing)) await tb.put(row);
      }
    }
    // Never end up with two active plans after a merge.
    const active = await database.plans.where('status').equals('active').toArray();
    if (active.length > 1) {
      const keep = active.sort((a, b) => (b.activatedAt ?? '').localeCompare(a.activatedAt ?? ''))[0]!;
      for (const p of active) if (p.id !== keep.id) await database.plans.update(p.id, { status: 'inactive' });
      const s = await database.settings.get('app');
      if (s) await database.settings.put({ ...s, activePlanId: keep.id });
    }
  });
}

export async function snapshot(reason: string, database: TetoDB = db): Promise<void> {
  const data = JSON.stringify(await createBackup(database));
  await database.snapshots.add({ createdAt: new Date().toISOString(), reason, data });
  const all = await database.snapshots.orderBy('createdAt').primaryKeys();
  for (const id of all.slice(0, Math.max(0, all.length - 3))) await database.snapshots.delete(id);
}

export async function restoreLatestSnapshot(database: TetoDB = db): Promise<boolean> {
  const last = await database.snapshots.orderBy('createdAt').last();
  if (!last) return false;
  const check = checkBackup(last.data);
  if (!check.ok) return false;
  const tables = BACKUP_TABLES.map((t) => table(database, t));
  await database.transaction('rw', tables, async () => {
    for (const t of BACKUP_TABLES) {
      await table(database, t).clear();
      const rows = check.backup.data[t];
      if (rows.length) await table(database, t).bulkPut(rows);
    }
  });
  await database.snapshots.delete(last.id!);
  return true;
}

// ---------- CSV ----------
const csvCell = (v: unknown) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function buildCsvFiles(database: TetoDB = db): Promise<{ name: string; text: string }[]> {
  const sessions = (await database.sessions.where('status').equals('completed').toArray()).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const sets = (await database.sets.toArray()).filter((s) => byId.has(s.sessionId)).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const exName = (sid: string, id: string) => byId.get(sid)?.prescription.exercises[id]?.name ?? id;

  const sessionsCsv = toCsv(
    ['session_id', 'date', 'workout', 'plan_id', 'plan_revision', 'phase', 'started_at', 'duration_min', 'sets', 'note'],
    sessions.map((s) => [
      s.id,
      localDate(s.startedAt),
      s.prescription.workoutName,
      s.planId,
      s.planRevision,
      s.prescription.phaseName ?? '',
      s.startedAt,
      s.endedAt ? Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 6000) / 10 : '',
      new Set(sets.filter((x) => x.sessionId === s.id).map((x) => `${x.slot}:${x.setIndex}`)).size,
      s.note ?? '',
    ]),
  );
  const setsCsv = toCsv(
    ['session_id', 'date', 'workout', 'exercise_id', 'exercise', 'set', 'side', 'weight_kg', 'reps', 'duration_s', 'distance_m', 'logged_at'],
    sets.map((x) => [
      x.sessionId,
      localDate(byId.get(x.sessionId)!.startedAt),
      byId.get(x.sessionId)!.prescription.workoutName,
      x.exerciseId,
      exName(x.sessionId, x.exerciseId),
      x.setIndex + 1,
      x.side,
      x.weightKg,
      x.reps,
      x.durationSec,
      x.distanceM,
      x.loggedAt,
    ]),
  );
  const measurements = (await database.measurements.toArray()).sort((a, b) => a.date.localeCompare(b.date));
  const measurementsCsv = toCsv(['date', 'measurement', 'value', 'unit'], measurements.map((m) => [m.date, m.measurementId, m.value, m.unit]));
  const habits = (await database.habitLogs.toArray()).sort((a, b) => a.date.localeCompare(b.date));
  const habitsCsv = toCsv(['date', 'habit', 'done', 'value'], habits.map((h) => [h.date, h.habitId, h.done ? 1 : 0, h.value]));
  return [
    { name: 'teto-sessions.csv', text: sessionsCsv },
    { name: 'teto-sets.csv', text: setsCsv },
    { name: 'teto-measurements.csv', text: measurementsCsv },
    { name: 'teto-habits.csv', text: habitsCsv },
  ];
}
