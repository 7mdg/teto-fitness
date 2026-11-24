// Plan validation: size + JSON parse -> version gate -> JSON Schema (precompiled) -> cross-references.
// Every problem is reported with an exact path such as `workouts[1].exercises[3].exerciseId`.
import type { ErrorObject } from 'ajv';
import validateSchema from '../../generated/validate-plan.js';
import { SUPPORTED_SCHEMA_MAJOR, type Plan } from './types';

export const MAX_PLAN_BYTES = 2 * 1024 * 1024;

export interface PlanIssue {
  path: string;
  message: string;
}

export type PlanValidation = { ok: true; plan: Plan; warnings: PlanIssue[] } | { ok: false; errors: PlanIssue[] };

/** "/workouts/1/exercises/3/exerciseId" -> "workouts[1].exercises[3].exerciseId" */
export function toPath(pointer: string): string {
  if (!pointer) return '(root)';
  return pointer
    .split('/')
    .slice(1)
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((acc, seg) => (/^\d+$/.test(seg) ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg), '');
}

const join = (base: string, key: string) => (base === '(root)' ? key : `${base}.${key}`);

const PATTERN_HINTS: Record<string, string> = {
  '^[a-z0-9]+(-[a-z0-9]+)*$': 'must use lowercase letters, digits and single hyphens (e.g. "incline-dumbbell-press")',
  '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$': 'must be a date in the form YYYY-MM-DD',
  '^([01]\\d|2[0-3]):[0-5]\\d$': 'must be a 24-hour time in the form HH:MM',
  '^1\\.\\d+\\.\\d+$': 'must be a 1.x.y version such as "1.0.0"',
};

function describe(e: ErrorObject): PlanIssue {
  const path = toPath(e.instancePath);
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return { path: join(path, String(p.missingProperty)), message: 'is required' };
    case 'additionalProperties':
      return { path: join(path, String(p.additionalProperty)), message: 'is not a recognised property (check spelling)' };
    case 'enum':
      return { path, message: `must be one of: ${(p.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(', ')}` };
    case 'const':
      return { path, message: `must be ${JSON.stringify(p.allowedValue)}` };
    case 'pattern':
      return { path, message: PATTERN_HINTS[String(p.pattern)] ?? `does not match the expected format` };
    case 'type':
      return { path, message: `must be ${p.type === 'integer' ? 'a whole number' : `a ${String(p.type)}`}` };
    case 'minimum':
    case 'maximum':
    case 'exclusiveMinimum':
    case 'exclusiveMaximum':
      return { path, message: `must be ${e.message?.replace(/^must be /, '') ?? 'in range'}` };
    case 'minItems':
      return { path, message: `needs at least ${String(p.limit)} item(s)` };
    case 'maxItems':
      return { path, message: `has more than ${String(p.limit)} items` };
    case 'minLength':
      return { path, message: 'must not be empty' };
    case 'maxLength':
      return { path, message: `is longer than ${String(p.limit)} characters` };
    case 'uniqueItems':
      return { path, message: 'contains duplicates' };
    case 'oneOf':
      return path.includes('schedule.entries')
        ? { path, message: 'needs exactly one of "weekday" (recurring) or "date" (one-off)' }
        : { path, message: 'must be a number or an object with min and max' };
    default:
      return { path, message: e.message ?? 'is invalid' };
  }
}

function schemaIssues(errors: ErrorObject[]): PlanIssue[] {
  // Drop noise produced by oneOf/if branches; keep one message per path+message.
  const filtered = errors.filter((e) => !(e.keyword === 'if') && !/\/oneOf\/\d+\//.test(e.schemaPath));
  const seen = new Set<string>();
  const out: PlanIssue[] = [];
  for (const e of filtered) {
    const issue = describe(e);
    const key = `${issue.path}|${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(issue);
    }
  }
  return out.slice(0, 25);
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function suggest(value: string, candidates: Iterable<string>): string {
  let best = '';
  let bestD = 3;
  for (const c of candidates) {
    const d = levenshtein(value, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? ` Did you mean "${best}"?` : '';
}

function uniqueIds<T extends { id: string }>(items: T[] | undefined, path: string, out: PlanIssue[]): Set<string> {
  const ids = new Set<string>();
  (items ?? []).forEach((item, i) => {
    if (ids.has(item.id)) out.push({ path: `${path}[${i}].id`, message: `"${item.id}" is used more than once` });
    ids.add(item.id);
  });
  return ids;
}

/** Cross-reference and logic checks the schema cannot express. */
export function semanticIssues(plan: Plan): { errors: PlanIssue[]; warnings: PlanIssue[] } {
  const errors: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];

  const exerciseIds = uniqueIds(plan.exercises, 'exercises', errors);
  const workoutIds = uniqueIds(plan.workouts, 'workouts', errors);
  uniqueIds(plan.schedule.entries, 'schedule.entries', errors);
  uniqueIds(plan.habits, 'habits', errors);
  const measurementIds = uniqueIds(plan.measurements, 'measurements', errors);
  uniqueIds(plan.programme?.phases, 'programme.phases', errors);
  const exercisesById = new Map(plan.exercises.map((e) => [e.id, e]));

  const refExercise = (id: string, path: string) => {
    if (!exerciseIds.has(id)) errors.push({ path, message: `"${id}" does not match any exercise.${suggest(id, exerciseIds)}` });
  };

  plan.exercises.forEach((ex, i) => {
    ex.alternatives?.forEach((alt, j) => {
      const path = `exercises[${i}].alternatives[${j}]`;
      if (alt === ex.id) errors.push({ path, message: 'an exercise cannot be its own alternative' });
      else refExercise(alt, path);
    });
    if (ex.sideLogging === 'separate' && !ex.unilateral) {
      warnings.push({ path: `exercises[${i}].sideLogging`, message: 'per-side logging only applies to unilateral exercises' });
    }
  });

  plan.workouts.forEach((w, i) => {
    w.exercises.forEach((we, j) => {
      const base = `workouts[${i}].exercises[${j}]`;
      refExercise(we.exerciseId, `${base}.exerciseId`);
      we.alternatives?.forEach((alt, k) => refExercise(alt, `${base}.alternatives[${k}]`));
      if (we.repsMin !== undefined && we.repsMax !== undefined && we.repsMin > we.repsMax) {
        errors.push({ path: `${base}.repsMin`, message: `(${we.repsMin}) must not be greater than repsMax (${we.repsMax})` });
      }
      const ex = exercisesById.get(we.exerciseId);
      if (!ex) return;
      if ((ex.tracking === 'strength' || ex.tracking === 'bodyweight') && we.repsMin === undefined && we.repsMax === undefined) {
        errors.push({ path: `${base}.repsMin`, message: `is required for ${ex.tracking} exercises (set repsMin and/or repsMax)` });
      }
      if ((ex.tracking === 'duration' || ex.tracking === 'isometric') && we.durationSec === undefined) {
        errors.push({ path: `${base}.durationSec`, message: `is required for ${ex.tracking} exercises` });
      }
      if (ex.tracking === 'cardio' && we.durationSec === undefined && we.distanceM === undefined) {
        errors.push({ path: `${base}.durationSec`, message: 'cardio exercises need durationSec and/or distanceM' });
      }
    });
    const d = w.estimatedDurationMinutes;
    if (d && typeof d === 'object' && d.min > d.max) {
      errors.push({ path: `workouts[${i}].estimatedDurationMinutes.min`, message: 'must not be greater than max' });
    }
  });

  const duration = plan.programme?.durationWeeks;
  const start = plan.programme?.startDate;
  plan.schedule.entries.forEach((en, i) => {
    const base = `schedule.entries[${i}]`;
    if (!workoutIds.has(en.workoutId)) {
      errors.push({ path: `${base}.workoutId`, message: `"${en.workoutId}" does not match any workout.${suggest(en.workoutId, workoutIds)}` });
    }
    const every = en.everyNWeeks ?? 1;
    if ((en.weekOffset ?? 0) >= every) {
      errors.push({ path: `${base}.weekOffset`, message: `must be smaller than everyNWeeks (${every})` });
    }
    if (en.date && start && duration) {
      const days = Math.round((Date.parse(en.date) - Date.parse(start)) / 86_400_000);
      if (days < 0 || days >= duration * 7) warnings.push({ path: `${base}.date`, message: 'falls outside the programme dates' });
    }
  });

  const phases = plan.programme?.phases ?? [];
  phases.forEach((ph, i) => {
    const base = `programme.phases[${i}]`;
    if (ph.startWeek > ph.endWeek) errors.push({ path: `${base}.startWeek`, message: 'must not be after endWeek' });
    if (duration && ph.endWeek > duration) errors.push({ path: `${base}.endWeek`, message: `is beyond durationWeeks (${duration})` });
    phases.forEach((other, j) => {
      if (j > i && ph.startWeek <= other.endWeek && other.startWeek <= ph.endWeek) {
        errors.push({ path: `${base}`, message: `overlaps with programme.phases[${j}] ("${other.id}")` });
      }
    });
  });

  plan.habits?.forEach((h, i) => {
    if (h.measurementId && !measurementIds.has(h.measurementId)) {
      errors.push({ path: `habits[${i}].measurementId`, message: `"${h.measurementId}" does not match any measurement.${suggest(h.measurementId, measurementIds)}` });
    }
    if (h.target?.min !== undefined && h.target.max !== undefined && h.target.min > h.target.max) {
      errors.push({ path: `habits[${i}].target.min`, message: 'must not be greater than max' });
    }
  });

  if (plan.workouts.length > 0 && plan.schedule.entries.length === 0) {
    warnings.push({ path: 'schedule.entries', message: 'is empty: workouts can be started manually but nothing is scheduled' });
  }

  return { errors, warnings };
}

export function validatePlanText(text: string): PlanValidation {
  if (new TextEncoder().encode(text).length > MAX_PLAN_BYTES) {
    return { ok: false, errors: [{ path: '(file)', message: 'is larger than 2 MB, which is far beyond any plan' }] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '(file)', message: `is not valid JSON: ${(e as Error).message}` }] };
  }
  return validatePlanData(data);
}

export function validatePlanData(data: unknown): PlanValidation {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: [{ path: '(root)', message: 'must be a JSON object' }] };
  }
  const root = data as Record<string, unknown>;
  if (root.format !== undefined && root.format !== 'teto-plan') {
    const hint = root.format === 'teto-backup' ? ' This looks like a backup file: use Restore backup instead.' : '';
    return { ok: false, errors: [{ path: 'format', message: `must be "teto-plan".${hint}` }] };
  }
  const major = typeof root.schemaVersion === 'string' ? Number(root.schemaVersion.split('.')[0]) : NaN;
  if (major > SUPPORTED_SCHEMA_MAJOR) {
    return {
      ok: false,
      errors: [{ path: 'schemaVersion', message: `"${String(root.schemaVersion)}" is newer than this app supports (${SUPPORTED_SCHEMA_MAJOR}.x). Update the app first.` }],
    };
  }
  if (!validateSchema(data)) {
    return { ok: false, errors: schemaIssues(validateSchema.errors ?? []) };
  }
  const plan = data as Plan;
  const { errors, warnings } = semanticIssues(plan);
  return errors.length ? { ok: false, errors } : { ok: true, plan, warnings };
}
