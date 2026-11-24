import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { TetoDB } from '../src/db/db';
import {
  activatePlan,
  archivePlan,
  deletePlan,
  exportPlanJson,
  importPlan,
  PlanConflictError,
} from '../src/features/plans/repository';
import type { Plan } from '../src/features/plans/types';

const recomp = () => JSON.parse(readFileSync('public/examples/teto-recomp-12w.json', 'utf8')) as Plan;
const home = () => JSON.parse(readFileSync('public/examples/full-body-3d-home.json', 'utf8')) as Plan;

let db: TetoDB;
let n = 0;
beforeEach(async () => {
  db = new TetoDB(`test-${n++}`);
  await db.open();
});

describe('plan repository', () => {
  it('imports, activates and seeds settings and reminders', async () => {
    const rec = await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    expect(rec.status).toBe('active');
    expect((await db.settings.get('app'))?.activePlanId).toBe('teto-recomp-12w');
    expect((await db.reminderPrefs.get('workout'))?.offsets).toEqual([
      { minutes: 1440, enabled: true },
      { minutes: 30, enabled: true },
    ]);
    expect(await db.planRevisions.count()).toBe(1);
    expect(await db.profile.get('me')).toBeUndefined(); // example has no profile
  });

  it('refuses a silent overwrite of an existing plan id', async () => {
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    await expect(importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db)).rejects.toBeInstanceOf(PlanConflictError);
    expect(await db.plans.count()).toBe(1);
  });

  it('updates in place and keeps every revision', async () => {
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    const r2 = recomp();
    r2.metadata.revision = 2;
    await importPlan(r2, { mode: 'update', startDate: '2026-11-30' }, db);
    expect((await db.plans.get('teto-recomp-12w'))?.revision).toBe(2);
    expect(await db.planRevisions.where('planId').equals('teto-recomp-12w').count()).toBe(2);
  });

  it('imports as a separate plan with a new id', async () => {
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    const copy = await importPlan(recomp(), { mode: 'separate', startDate: '2026-12-07' }, db);
    expect(copy.id).toBe('teto-recomp-12w-2');
    expect(copy.json.metadata.id).toBe('teto-recomp-12w-2');
    expect(await db.plans.count()).toBe(2);
  });

  it('keeps exactly one active plan when switching', async () => {
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    await importPlan(home(), { mode: 'new', startDate: '2026-11-30' }, db);
    expect(await db.plans.where('status').equals('active').count()).toBe(1);
    await activatePlan('teto-recomp-12w', '2026-12-07', db);
    const active = await db.plans.where('status').equals('active').toArray();
    expect(active.map((p) => [p.id, p.startDate])).toEqual([['teto-recomp-12w', '2026-12-07']]);
  });

  it('does not overwrite reminders the user edited', async () => {
    await db.reminderPrefs.put({ key: 'workout', offsets: [{ minutes: 90, enabled: true }], editedByUser: true });
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    expect((await db.reminderPrefs.get('workout'))?.offsets).toEqual([{ minutes: 90, enabled: true }]);
  });

  it('seeds the profile once and never overwrites it', async () => {
    const withProfile = recomp();
    withProfile.profile = { heightCm: 180 };
    await importPlan(withProfile, { mode: 'new', startDate: '2026-11-30' }, db);
    await db.profile.update('me', { heightCm: 181 });
    const again = recomp();
    again.metadata.revision = 2;
    again.profile = { heightCm: 170 };
    await importPlan(again, { mode: 'update', startDate: '2026-11-30' }, db);
    expect((await db.profile.get('me'))?.heightCm).toBe(181);
  });

  it('archives and deletes configuration without touching history', async () => {
    await importPlan(recomp(), { mode: 'new', startDate: '2026-11-30' }, db);
    await db.measurements.put({ id: 'm1', measurementId: 'bodyweight', value: 84.2, unit: 'kg', date: '2026-11-30', loggedAt: 'x' });
    await archivePlan('teto-recomp-12w', db);
    expect((await db.settings.get('app'))?.activePlanId).toBeUndefined();
    await deletePlan('teto-recomp-12w', db);
    expect(await db.plans.count()).toBe(0);
    expect(await db.planRevisions.count()).toBe(0);
    expect(await db.measurements.count()).toBe(1);
  });

  it('exports without the profile when asked', () => {
    const p = recomp();
    p.profile = { heightCm: 180 };
    expect(JSON.parse(exportPlanJson(p, { includeProfile: false })).profile).toBeUndefined();
    expect(JSON.parse(exportPlanJson(p, { includeProfile: true })).profile).toEqual({ heightCm: 180 });
  });
});
