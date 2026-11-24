// Plan lifecycle against IndexedDB. Every write is one transaction: a failure leaves nothing half-done.
import { DEFAULT_SETTINGS, db, type PlanRecord, type TetoDB } from '../../db/db';
import type { Plan } from './types';

export type ImportMode = 'new' | 'update' | 'separate';

export class PlanConflictError extends Error {
  constructor(public existing: PlanRecord) {
    super(`A plan with id "${existing.id}" already exists`);
  }
}

const nowIso = () => new Date().toISOString();

/** Next free id for "Import as separate plan": base-2, base-3, … */
export async function separateId(base: string, database: TetoDB = db): Promise<string> {
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 64);
    if (!(await database.plans.get(candidate))) return candidate;
  }
  throw new Error('Too many copies of this plan');
}

export async function importPlan(
  input: Plan,
  opts: { mode: ImportMode; startDate: string },
  database: TetoDB = db,
): Promise<PlanRecord> {
  let plan = structuredClone(input);
  if (opts.mode === 'separate') {
    plan = { ...plan, metadata: { ...plan.metadata, id: await separateId(plan.metadata.id, database) } };
  }
  const id = plan.metadata.id;
  const ts = nowIso();

  return database.transaction(
    'rw',
    [database.plans, database.planRevisions, database.settings, database.profile, database.reminderPrefs, database.overrides, database.scheduleOverrides],
    async () => {
    const existing = await database.plans.get(id);
    if (existing && opts.mode === 'new') throw new PlanConflictError(existing);
    if (existing && opts.mode === 'update') await pruneStaleOverrides(existing.json, plan, database);

    await database.planRevisions.put({ planId: id, revision: plan.metadata.revision, importedAt: ts, json: plan });

    // Only one active plan.
    await database.plans.where('status').equals('active').modify({ status: 'inactive' });

    const record: PlanRecord = {
      id,
      status: 'active',
      revision: plan.metadata.revision,
      importedAt: ts,
      activatedAt: ts,
      startDate: opts.startDate,
      json: plan,
    };
    await database.plans.put(record);

    const settings = (await database.settings.get('app')) ?? {
      ...DEFAULT_SETTINGS,
      weightUnit: plan.preferences?.weightUnit ?? 'kg',
      restTimerEnabled: plan.preferences?.restTimerEnabled ?? true,
    };
    await database.settings.put({ ...settings, activePlanId: id });

    // Profile and reminders are seeded once; afterwards the user's own values win.
    if (!(await database.profile.get('me')) && plan.profile) {
      await database.profile.put({
        key: 'me',
        ...plan.profile,
        goal: plan.goals?.primary,
        priorities: plan.goals?.priorities,
      });
    }
    const prefs = await database.reminderPrefs.get('workout');
    if (!prefs || !prefs.editedByUser) {
      const offsets = plan.reminders?.workout?.offsetsMinutes ?? [];
      const enabled = plan.reminders?.workout?.enabled ?? true;
      await database.reminderPrefs.put({ key: 'workout', offsets: offsets.map((minutes) => ({ minutes, enabled })), editedByUser: false });
    }
    return record;
    },
  );
}

/**
 * After an update, local tweaks survive unless the thing they belong to changed (SPEC §7):
 * a permanent swap is dropped when its slot now holds a different exercise; habit tweaks and
 * moved/skipped sessions are dropped when their habit or schedule entry no longer exists.
 */
async function pruneStaleOverrides(oldPlan: Plan, newPlan: Plan, database: TetoDB) {
  const id = newPlan.metadata.id;
  const slotExercise = (p: Plan, workoutId: string, slot: number) => p.workouts.find((w) => w.id === workoutId)?.exercises[slot]?.exerciseId;
  const overrides = await database.overrides.where('planId').equals(id).toArray();
  for (const o of overrides) {
    let stale = false;
    if (o.kind === 'slotSwap') {
      const [workoutId, slotStr] = o.itemId.split('#') as [string, string];
      const before = slotExercise(oldPlan, workoutId, Number(slotStr));
      const after = slotExercise(newPlan, workoutId, Number(slotStr));
      stale = !after || before !== after;
    }
    if (o.kind === 'habit') stale = !(newPlan.habits ?? []).some((h) => h.id === o.itemId);
    if (stale) await database.overrides.delete([o.planId, o.kind, o.itemId]);
  }
  const entryIds = new Set(newPlan.schedule.entries.map((e) => e.id));
  const sched = await database.scheduleOverrides.where('[planId+occurrenceKey]').between([id, ''], [id, '￿']).toArray();
  for (const s of sched) if (!entryIds.has(s.occurrenceKey.split('@')[0]!)) await database.scheduleOverrides.delete(s.id);
}

export async function moveOccurrence(planId: string, occurrenceKey: string, date: string, time: string, database: TetoDB = db) {
  await putScheduleOverride(planId, occurrenceKey, { action: 'move', date, time }, database);
}
export async function skipOccurrence(planId: string, occurrenceKey: string, database: TetoDB = db) {
  await putScheduleOverride(planId, occurrenceKey, { action: 'skip' }, database);
}
export async function restoreOccurrence(planId: string, occurrenceKey: string, database: TetoDB = db) {
  await database.scheduleOverrides.where('[planId+occurrenceKey]').equals([planId, occurrenceKey]).delete();
}
async function putScheduleOverride(planId: string, occurrenceKey: string, change: { action: 'move' | 'skip'; date?: string; time?: string }, database: TetoDB) {
  await database.transaction('rw', database.scheduleOverrides, async () => {
    await database.scheduleOverrides.where('[planId+occurrenceKey]').equals([planId, occurrenceKey]).delete();
    await database.scheduleOverrides.put({ id: `${planId}:${occurrenceKey}`, planId, occurrenceKey, ...change });
  });
}

export async function activatePlan(id: string, startDate?: string, database: TetoDB = db): Promise<void> {
  await database.transaction('rw', [database.plans, database.settings], async () => {
    const rec = await database.plans.get(id);
    if (!rec) throw new Error('Plan not found');
    await database.plans.where('status').equals('active').modify({ status: 'inactive' });
    await database.plans.update(id, { status: 'active', activatedAt: nowIso(), ...(startDate ? { startDate } : {}) });
    const settings = (await database.settings.get('app')) ?? DEFAULT_SETTINGS;
    await database.settings.put({ ...settings, activePlanId: id });
  });
}

export async function setStartDate(id: string, startDate: string, database: TetoDB = db): Promise<void> {
  await database.plans.update(id, { startDate });
}

export async function archivePlan(id: string, database: TetoDB = db): Promise<void> {
  await database.transaction('rw', [database.plans, database.settings], async () => {
    await database.plans.update(id, { status: 'archived' });
    const settings = await database.settings.get('app');
    if (settings?.activePlanId === id) await database.settings.put({ ...settings, activePlanId: undefined });
  });
}

/** Deletes the plan configuration only. Training history, measurements and habits are kept (SPEC §5). */
export async function deletePlan(id: string, database: TetoDB = db): Promise<void> {
  await database.transaction('rw', [database.plans, database.planRevisions, database.overrides, database.settings], async () => {
    await database.plans.delete(id);
    await database.planRevisions.where('planId').equals(id).delete();
    await database.overrides.where('planId').equals(id).delete();
    const settings = await database.settings.get('app');
    if (settings?.activePlanId === id) await database.settings.put({ ...settings, activePlanId: undefined });
  });
}

export function exportPlanJson(plan: Plan, opts: { includeProfile: boolean }): string {
  const copy: Plan = structuredClone(plan);
  if (!opts.includeProfile) delete copy.profile;
  return JSON.stringify(copy, null, 2) + '\n';
}

export async function requestPersistence(database: TetoDB = db): Promise<boolean> {
  const granted = (await navigator.storage?.persist?.().catch(() => false)) ?? false;
  const meta = (await database.meta.get('meta')) ?? { key: 'meta' as const, installId: crypto.randomUUID() };
  await database.meta.put({ ...meta, persistGranted: granted });
  return granted;
}
