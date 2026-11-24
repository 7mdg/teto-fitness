// Workout session engine. Every logged set is its own transaction, written the moment it is confirmed.
import Dexie from 'dexie';
import { db, type PlanRecord, type SessionRecord, type SetRecord, type TetoDB } from '../../db/db';
import type { Exercise, Phase } from '../plans/types';
import { effectiveSets } from '../plans/summary';
import type { Occurrence } from '../schedule/occurrences';
import { detectRecords, type LoggedSet } from './progression';
import type { Prescription, SlotPrescription } from './types';

const nowIso = () => new Date().toISOString();
export const slotKey = (workoutId: string, slot: number) => `${workoutId}#${slot}`;

/** Every exercise known on this device: all plans (active plan wins) plus custom exercises. */
export async function exerciseCatalog(database: TetoDB = db): Promise<Map<string, Exercise>> {
  const map = new Map<string, Exercise>();
  const plans = await database.plans.toArray();
  plans.sort((a, b) => (a.status === 'active' ? 1 : 0) - (b.status === 'active' ? 1 : 0));
  for (const p of plans) for (const e of p.json.exercises) map.set(e.id, e);
  for (const c of await database.customExercises.toArray()) if (!map.has(c.id)) map.set(c.id, c);
  return map;
}

export async function buildPrescription(
  record: PlanRecord,
  workoutId: string,
  phase: Phase | undefined,
  week: number | undefined,
  database: TetoDB = db,
): Promise<Prescription> {
  const plan = record.json;
  const workout = plan.workouts.find((w) => w.id === workoutId);
  if (!workout) throw new Error(`Workout ${workoutId} not found`);
  const catalog = await exerciseCatalog(database);
  const swaps = await database.overrides.where('planId').equals(record.id).filter((o) => o.kind === 'slotSwap').toArray();
  const swapFor = new Map(swaps.map((s) => [s.itemId, String(s.value)]));
  const exercises: Record<string, Exercise> = {};
  const remember = (id: string) => {
    const ex = catalog.get(id);
    if (ex) exercises[id] = ex;
  };

  const slots: SlotPrescription[] = workout.exercises.map((we, slot) => {
    const planned = plan.exercises.find((e) => e.id === we.exerciseId)!;
    const swapped = swapFor.get(slotKey(workoutId, slot));
    const exerciseId = swapped && catalog.has(swapped) ? swapped : we.exerciseId;
    const alternatives = [...new Set([...(planned.alternatives ?? []), ...(we.alternatives ?? []), ...(swapped ? [we.exerciseId] : [])])].filter(
      (id) => id !== exerciseId,
    );
    [we.exerciseId, exerciseId, ...alternatives].forEach(remember);
    return {
      slot,
      plannedExerciseId: we.exerciseId,
      exerciseId,
      sets: effectiveSets(we.sets, phase),
      repsMin: we.repsMin,
      repsMax: we.repsMax,
      durationSec: we.durationSec,
      distanceM: we.distanceM,
      restSeconds: we.restSeconds ?? catalog.get(exerciseId)?.defaultRestSeconds ?? planned.defaultRestSeconds ?? 90,
      optional: we.optional ?? false,
      notes: we.notes,
      alternatives,
    };
  });

  return { workoutId, workoutName: workout.name, phaseId: phase?.id, phaseName: phase?.name, week, slots, exercises };
}

export async function getActiveSession(database: TetoDB = db): Promise<SessionRecord | undefined> {
  return database.sessions.where('status').equals('active').first();
}

/** Starts a session, or returns the one already in progress (only one at a time). */
export async function startSession(
  record: PlanRecord,
  workoutId: string,
  opts: { occurrence?: Occurrence; date: string; phase?: Phase; week?: number },
  database: TetoDB = db,
): Promise<string> {
  const active = await getActiveSession(database);
  if (active) return active.id;
  const prescription = await buildPrescription(record, workoutId, opts.occurrence?.phase ?? opts.phase, opts.occurrence?.week ?? opts.week, database);
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    planId: record.id,
    planRevision: record.revision,
    workoutId,
    occurrenceKey: opts.occurrence?.key,
    scheduledDate: opts.occurrence?.date ?? opts.date,
    startedAt: nowIso(),
    status: 'active',
    prescription,
    substitutions: [],
    skippedSlots: [],
  };
  await database.sessions.add(session);
  return session.id;
}

/** Exercise performed in a slot for a given set index (accounts for mid-exercise swaps). */
export function exerciseForSet(session: SessionRecord, slot: number, setIndex: number): string {
  const subs = session.substitutions.filter((s) => s.slot === slot && setIndex >= s.fromSetIndex);
  return subs.length ? subs[subs.length - 1]!.performedExerciseId : session.prescription.slots[slot]!.exerciseId;
}

/** Exercise currently shown for a slot (the latest swap, else the prescription). */
export function currentExercise(session: SessionRecord, slot: number): string {
  const subs = session.substitutions.filter((s) => s.slot === slot);
  return subs.length ? subs[subs.length - 1]!.performedExerciseId : session.prescription.slots[slot]!.exerciseId;
}

export const setId = (sessionId: string, slot: number, setIndex: number, side: SetRecord['side']) => `${sessionId}:${slot}:${setIndex}:${side}`;

export async function logSet(
  sessionId: string,
  input: Omit<SetRecord, 'id' | 'sessionId' | 'loggedAt' | 'completed' | 'order' | 'kind'> & { kind?: SetRecord['kind'] },
  database: TetoDB = db,
): Promise<SetRecord> {
  const rec: SetRecord = {
    ...input,
    id: setId(sessionId, input.slot, input.setIndex, input.side),
    sessionId,
    kind: input.kind ?? 'working',
    order: input.slot * 100 + input.setIndex,
    completed: true,
    loggedAt: nowIso(),
  };
  await database.sets.put(rec);
  return rec;
}

export async function unlogSet(id: string, database: TetoDB = db): Promise<void> {
  await database.sets.delete(id);
}

export async function setRest(sessionId: string, seconds: number | null, database: TetoDB = db): Promise<void> {
  await database.sessions.update(sessionId, seconds ? { restEndsAt: Date.now() + seconds * 1000, restTotalSec: seconds } : { restEndsAt: undefined, restTotalSec: undefined });
}

export async function adjustRest(sessionId: string, deltaSec: number, database: TetoDB = db): Promise<void> {
  const s = await database.sessions.get(sessionId);
  if (!s?.restEndsAt) return;
  await database.sessions.update(sessionId, { restEndsAt: Math.max(Date.now(), s.restEndsAt + deltaSec * 1000), restTotalSec: Math.max(0, (s.restTotalSec ?? 0) + deltaSec) });
}

export async function swapExercise(
  sessionId: string,
  slot: number,
  exercise: Exercise,
  opts: { always: boolean },
  database: TetoDB = db,
): Promise<void> {
  await database.transaction('rw', [database.sessions, database.sets, database.overrides], async () => {
    const s = await database.sessions.get(sessionId);
    if (!s) throw new Error('Session not found');
    const logged = await database.sets.where('sessionId').equals(sessionId).filter((x) => x.slot === slot).toArray();
    const fromSetIndex = logged.length ? Math.max(...logged.map((x) => x.setIndex)) + 1 : 0;
    const planned = s.prescription.slots[slot]!.plannedExerciseId;
    // Swapping back to the slot's own exercise before anything was logged simply removes the swap.
    const subs = s.substitutions.filter((x) => !(x.slot === slot && x.fromSetIndex === fromSetIndex));
    if (exercise.id !== s.prescription.slots[slot]!.exerciseId || subs.some((x) => x.slot === slot)) {
      subs.push({ slot, plannedExerciseId: planned, performedExerciseId: exercise.id, fromSetIndex });
    }
    await database.sessions.update(sessionId, {
      substitutions: subs,
      prescription: { ...s.prescription, exercises: { ...s.prescription.exercises, [exercise.id]: exercise } },
    });
    if (opts.always) {
      const key = slotKey(s.workoutId, slot);
      if (exercise.id === planned) await database.overrides.delete([s.planId, 'slotSwap', key]);
      else await database.overrides.put({ planId: s.planId, kind: 'slotSwap', itemId: key, value: exercise.id });
    }
  });
}

export async function setSlotSkipped(sessionId: string, slot: number, skipped: boolean, database: TetoDB = db): Promise<void> {
  const s = await database.sessions.get(sessionId);
  if (!s) return;
  const set = new Set(s.skippedSlots ?? []);
  if (skipped) set.add(slot);
  else set.delete(slot);
  await database.sessions.update(sessionId, { skippedSlots: [...set] });
}

/** Sets of the most recent completed session that included this exercise. */
export async function lastPerformance(exerciseId: string, excludeSessionId?: string, database: TetoDB = db): Promise<SetRecord[]> {
  const candidates = await database.sets
    .where('[exerciseId+loggedAt]')
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .reverse()
    .toArray();
  const statusCache = new Map<string, string | undefined>();
  for (const c of candidates) {
    if (c.sessionId === excludeSessionId || c.kind === 'warmup') continue;
    if (!statusCache.has(c.sessionId)) statusCache.set(c.sessionId, (await database.sessions.get(c.sessionId))?.status);
    if (statusCache.get(c.sessionId) === 'completed') {
      return candidates.filter((x) => x.sessionId === c.sessionId && x.kind !== 'warmup').sort((a, b) => a.setIndex - b.setIndex);
    }
  }
  return [];
}

const toLogged = (s: SetRecord): LoggedSet => ({ setIndex: s.setIndex, side: s.side, weightKg: s.weightKg, reps: s.reps, durationSec: s.durationSec, distanceM: s.distanceM });

export async function finishSession(sessionId: string, note: string | undefined, database: TetoDB = db): Promise<SessionRecord> {
  return database.transaction('rw', [database.sessions, database.sets], async () => {
    const s = await database.sessions.get(sessionId);
    if (!s) throw new Error('Session not found');
    const mine = await database.sets.where('sessionId').equals(sessionId).toArray();
    const completedIds = new Set((await database.sessions.where('status').equals('completed').primaryKeys()) as string[]);
    const records = [];
    for (const exerciseId of new Set(mine.map((x) => x.exerciseId))) {
      const history = (
        await database.sets.where('[exerciseId+loggedAt]').between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey]).toArray()
      ).filter((x) => completedIds.has(x.sessionId));
      records.push(...detectRecords(exerciseId, mine.filter((x) => x.exerciseId === exerciseId).map(toLogged), history.map(toLogged)));
    }
    const done: Partial<SessionRecord> = { status: 'completed', endedAt: nowIso(), note: note?.trim() || undefined, records, restEndsAt: undefined, restTotalSec: undefined };
    await database.sessions.update(sessionId, done);
    return { ...s, ...done } as SessionRecord;
  });
}

/** Discarding removes the session's sets: they never become history. */
export async function discardSession(sessionId: string, database: TetoDB = db): Promise<void> {
  await database.transaction('rw', [database.sessions, database.sets], async () => {
    await database.sets.where('sessionId').equals(sessionId).delete();
    await database.sessions.update(sessionId, { status: 'discarded', endedAt: nowIso(), restEndsAt: undefined });
  });
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'exercise';

export async function createCustomExercise(def: Omit<Exercise, 'id'>, database: TetoDB = db): Promise<Exercise> {
  const base = `custom-${slugify(def.name)}`;
  let id = base;
  for (let n = 2; await database.customExercises.get(id); n++) id = `${base}-${n}`;
  const ex: Exercise = { ...def, id };
  await database.customExercises.put({ ...ex, createdAt: nowIso() });
  return ex;
}
