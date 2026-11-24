import type { SessionRecord, SetRecord } from '../../db/db';
import { formatWeight, type WeightUnit } from '../../features/training/units';
import { formatClock } from '../../ui/hooks';

/** Counts up from the last logged set: a reference for rest without a countdown to watch. */
export function SinceBar({ session, sets, now, unit }: { session: SessionRecord; sets: SetRecord[]; now: number; unit: WeightUnit }) {
  if (!sets.length) return null;
  const last = sets.reduce((a, b) => (a.loggedAt > b.loggedAt ? a : b));
  const elapsed = (now - Date.parse(last.loggedAt)) / 1000;
  const name = session.prescription.exercises[last.exerciseId]?.name ?? last.exerciseId;
  const sameSet = sets.filter((s) => s.slot === last.slot && s.setIndex === last.setIndex);
  const reps = sameSet.length > 1 ? sameSet.map((s) => s.reps).join('/') : last.reps;
  const what =
    last.weightKg !== undefined
      ? `${formatWeight(last.weightKg, unit)} × ${reps}`
      : reps !== undefined
        ? `${reps} reps`
        : last.durationSec !== undefined
          ? formatClock(last.durationSec)
          : '';
  return (
    <div class="sincebar" role="status">
      <div class="sincebar-inner">
        <span class="since-time num">{formatClock(elapsed)}</span>
        <span class="since-main">
          <span class="since-label">since last set</span>
          <span class="since-what">
            {name} · set {last.setIndex + 1}
            {what ? ` · ${what}` : ''}
          </span>
        </span>
      </div>
    </div>
  );
}
