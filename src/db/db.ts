// IndexedDB schema (Dexie). See SPEC.md §5. Three layers: programme configuration, personal records, preferences.
// Migration rule: a new version only ever adds; it never drops data.
import Dexie, { type EntityTable } from 'dexie';
import type { Exercise, Plan, Weekday } from '../features/plans/types';
import type { PersonalRecord } from '../features/training/progression';
import type { Prescription, Substitution } from '../features/training/types';

// ---------- programme configuration ----------
export type PlanStatus = 'active' | 'inactive' | 'archived';
export interface PlanRecord {
  id: string;
  status: PlanStatus;
  revision: number;
  importedAt: string;
  activatedAt?: string;
  /** Activation start date (local override of programme.startDate). */
  startDate: string;
  json: Plan;
}
export interface PlanRevisionRecord {
  planId: string;
  revision: number;
  importedAt: string;
  json: Plan;
}

// ---------- personal records (written from phase 2 on) ----------
export interface SessionRecord {
  id: string;
  planId: string;
  planRevision: number;
  workoutId: string;
  occurrenceKey?: string;
  scheduledDate?: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'discarded';
  note?: string;
  prescription: Prescription;
  substitutions: Substitution[];
  skippedSlots?: number[];
  /** Rest timer end as epoch ms (survives reloads). */
  restEndsAt?: number;
  restTotalSec?: number;
  records?: PersonalRecord[];
}
export interface SetRecord {
  id: string;
  sessionId: string;
  exerciseId: string;
  slot: number;
  order: number;
  setIndex: number;
  kind: 'working' | 'warmup' | 'extra';
  side: 'both' | 'left' | 'right';
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  completed: boolean;
  loggedAt: string;
}
export interface CustomExerciseRecord extends Exercise {
  createdAt: string;
}
export interface MeasurementRecord {
  id: string;
  measurementId: string;
  value: number;
  unit: string;
  date: string;
  loggedAt: string;
}
export interface HabitLogRecord {
  habitId: string;
  date: string;
  done: boolean;
  value?: number;
  loggedAt: string;
}
export interface ScheduleOverrideRecord {
  id: string;
  planId: string;
  occurrenceKey: string;
  action: 'move' | 'skip';
  date?: string;
  time?: string;
}

// ---------- preferences ----------
export interface AppSettings {
  key: 'app';
  activePlanId?: string;
  weightUnit: 'kg' | 'lb';
  restTimerEnabled: boolean;
  sound: boolean;
  keepAwake: boolean;
}
export interface ProfileRecord {
  key: 'me';
  displayName?: string;
  heightCm?: number;
  initialWeightKg?: number;
  activityLevel?: string;
  experience?: string;
  goal?: string;
  priorities?: string[];
}
export interface OverrideRecord {
  planId: string;
  kind: 'habit' | 'exerciseIncrement' | 'restSeconds' | 'sideLogging' | 'slotSwap';
  itemId: string;
  value: unknown;
}
export interface ReminderPrefs {
  key: 'workout';
  offsets: { minutes: number; enabled: boolean }[];
  editedByUser: boolean;
}
export interface CalendarLink {
  key: 'feed';
  id: string;
  writeToken: string;
  createdAt: string;
  lastPushedAt?: string;
}
export interface MetaRecord {
  key: 'meta';
  installId: string;
  lastBackupAt?: string;
  persistGranted?: boolean;
}
export interface SnapshotRecord {
  id?: number;
  createdAt: string;
  reason: string;
  data: string;
}

export class TetoDB extends Dexie {
  plans!: EntityTable<PlanRecord, 'id'>;
  planRevisions!: Dexie.Table<PlanRevisionRecord, [string, number]>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  sets!: EntityTable<SetRecord, 'id'>;
  customExercises!: EntityTable<CustomExerciseRecord, 'id'>;
  measurements!: EntityTable<MeasurementRecord, 'id'>;
  habitLogs!: Dexie.Table<HabitLogRecord, [string, string]>;
  scheduleOverrides!: EntityTable<ScheduleOverrideRecord, 'id'>;
  settings!: EntityTable<AppSettings, 'key'>;
  profile!: EntityTable<ProfileRecord, 'key'>;
  overrides!: Dexie.Table<OverrideRecord, [string, string, string]>;
  reminderPrefs!: EntityTable<ReminderPrefs, 'key'>;
  calendarLink!: EntityTable<CalendarLink, 'key'>;
  meta!: EntityTable<MetaRecord, 'key'>;
  snapshots!: EntityTable<SnapshotRecord, 'id'>;

  constructor(name = 'teto-fitness') {
    super(name);
    this.version(1).stores({
      plans: 'id, status',
      planRevisions: '[planId+revision], planId',
      sessions: 'id, startedAt, status, [planId+workoutId], occurrenceKey',
      sets: 'id, sessionId, [exerciseId+loggedAt]',
      customExercises: 'id',
      measurements: 'id, [measurementId+date], date',
      habitLogs: '[habitId+date], date',
      scheduleOverrides: 'id, [planId+occurrenceKey]',
      settings: 'key',
      profile: 'key',
      overrides: '[planId+kind+itemId], planId',
      reminderPrefs: 'key',
      calendarLink: 'key',
      meta: 'key',
      snapshots: '++id, createdAt',
    });
  }
}

export const db = new TetoDB();

export const DEFAULT_SETTINGS: AppSettings = {
  key: 'app',
  weightUnit: 'kg',
  restTimerEnabled: true,
  sound: false,
  keepAwake: true,
};

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
}

export type { Weekday };
