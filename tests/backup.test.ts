import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TetoDB } from '../src/db/db';
import { buildCsvFiles, checkBackup, createBackup, restoreBackup, restoreLatestSnapshot, toCsv } from '../src/features/backup/backup';
import { logMeasurement } from '../src/features/habits/habits';
import { importPlan } from '../src/features/plans/repository';
import type { Plan } from '../src/features/plans/types';
import { rolling7, recentChange } from '../src/features/progress/stats';
import { finishSession, logSet, startSession } from '../src/features/training/session';

const recomp = () => JSON.parse(readFileSync('public/examples/teto-recomp-12w.json', 'utf8')) as Plan;
let n = 0;
const fresh = async () => {
  const d = new TetoDB(`bk-${n++}`);
  await d.open();
  return d;
};

async function seed(db: TetoDB) {
  const plan = await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
  const s = await startSession(plan, 'upper-a', { date: '2026-11-30' }, db);
  await logSet(s, { slot: 0, setIndex: 0, side: 'both', exerciseId: 'incline-dumbbell-press', weightKg: 22.5, reps: 12 }, db);
  await finishSession(s, 'note, with "quotes"', db);
  await logMeasurement('bodyweight', 85.2, 'kg', '2026-11-30', ['morning-weigh-in'], db);
  return s;
}

let a: TetoDB;
beforeEach(async () => {
  a = await fresh();
});

describe('backup', () => {
  it('round-trips into an empty install (replace)', async () => {
    await seed(a);
    const text = JSON.stringify(await createBackup(a, '0.4.0'));
    const check = checkBackup(text);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.counts).toMatchObject({ workouts: 1, sets: 1, measurements: 1, plans: 1 });
    const b = await fresh();
    await restoreBackup(check.backup, 'replace', b);
    expect(await b.sets.count()).toBe(1);
    expect((await b.measurements.toArray())[0]?.value).toBe(85.2);
    expect((await b.settings.get('app'))?.activePlanId).toBe('teto-recomp-12w');
  });

  it('merges without duplicates and keeps newer rows', async () => {
    await seed(a);
    const backup = await createBackup(a);
    const b = await fresh();
    await seed(b); // different session ids, same plan id
    await b.measurements.clear();
    await logMeasurement('bodyweight', 84.0, 'kg', '2026-12-01', [], b);
    await restoreBackup(backup, 'merge', b);
    expect(await b.sessions.where('status').equals('completed').count()).toBe(2);
    expect(await b.measurements.count()).toBe(2);
    expect(await b.plans.where('status').equals('active').count()).toBe(1);
    // merging the same backup twice changes nothing
    await restoreBackup(backup, 'merge', b);
    expect(await b.sessions.count()).toBe(2);
  });

  it('can undo a restore from the automatic snapshot', async () => {
    await seed(a);
    const empty = await createBackup(await fresh());
    await restoreBackup(empty, 'replace', a);
    expect(await a.sets.count()).toBe(0);
    expect(await restoreLatestSnapshot(a)).toBe(true);
    expect(await a.sets.count()).toBe(1);
  });

  it('rejects wrong files with a clear message', () => {
    expect(checkBackup('{bad')).toEqual({ ok: false, error: 'This is not a valid JSON file.' });
    expect(checkBackup(JSON.stringify({ format: 'teto-plan' }))).toMatchObject({ ok: false, error: expect.stringContaining('Import plan') });
    expect(checkBackup(JSON.stringify({ format: 'teto-backup', schemaVersion: 99, data: {} }))).toMatchObject({ ok: false });
    expect(checkBackup(JSON.stringify({ format: 'teto-backup', schemaVersion: 1, data: { sets: 'x' } }))).toMatchObject({ ok: false });
  });
});

describe('csv', () => {
  it('escapes commas and quotes', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"']])).toBe('a,b\r\n"x,y","say ""hi"""\r\n');
  });

  it('exports sessions, sets, measurements and habits', async () => {
    await seed(a);
    const files = await buildCsvFiles(a);
    expect(files.map((f) => f.name)).toEqual(['teto-sessions.csv', 'teto-sets.csv', 'teto-measurements.csv', 'teto-habits.csv']);
    expect(files[1]!.text.split('\r\n')[1]).toContain(',incline-dumbbell-press,Incline dumbbell press,1,both,22.5,12,');
    expect(files[2]!.text).toContain('2026-11-30,bodyweight,85.2,kg');
    expect(files[0]!.text).toContain('"note, with ""quotes"""');
  });
});

describe('progress stats', () => {
  it('computes a trailing 7-day average and recent change', () => {
    const pts = [
      { x: '2026-11-30', y: 85 },
      { x: '2026-12-01', y: 84 },
      { x: '2026-12-08', y: 83 },
    ];
    expect(rolling7(pts).map((p) => p.y)).toEqual([85, 84.5, 83]);
    expect(recentChange(pts, 30)).toBe(-2);
  });
});
