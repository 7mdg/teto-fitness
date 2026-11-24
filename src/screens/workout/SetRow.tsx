import { useEffect, useState } from 'preact/hooks';
import type { SetRecord } from '../../db/db';
import type { Exercise } from '../../features/plans/types';
import type { PrefillRow } from '../../features/training/progression';
import { formatWeight, fromDisplay, parseDecimal, roundWeight, type WeightUnit } from '../../features/training/units';
import { Icon } from '../../ui/icons';

export interface SetValues {
  weightKg?: number;
  reps?: number;
  repsLeft?: number;
  repsRight?: number;
  durationSec?: number;
  distanceM?: number;
}

export type ColumnLayout = 'weight-reps' | 'weight-sides' | 'reps' | 'sides' | 'time' | 'cardio' | 'check';

export function columnLayout(ex: Exercise, separateSides: boolean): ColumnLayout {
  const t = ex.tracking;
  const weighted = t === 'strength' || (t === 'bodyweight' && (ex.weightMode === 'added' || ex.weightMode === 'assisted'));
  if (t === 'strength' || t === 'bodyweight') {
    if (weighted) return separateSides ? 'weight-sides' : 'weight-reps';
    return separateSides ? 'sides' : 'reps';
  }
  if (t === 'duration' || t === 'isometric') return 'time';
  if (t === 'cardio') return 'cardio';
  return 'check';
}

export function columnHeaders(layout: ColumnLayout, unit: WeightUnit, ex: Exercise): string[] {
  const w = ex.weightMode === 'added' ? `+${unit}` : ex.weightMode === 'assisted' ? `assist ${unit}` : unit;
  switch (layout) {
    case 'weight-reps':
      return [w, 'reps'];
    case 'weight-sides':
      return [w, 'L', 'R'];
    case 'reps':
      return ['reps'];
    case 'sides':
      return ['L', 'R'];
    case 'time':
      return ['sec'];
    case 'cardio':
      return ['min', 'km'];
    case 'check':
      return [];
  }
}

interface Props {
  index: number;
  exercise: Exercise;
  layout: ColumnLayout;
  logged: SetRecord[];
  prefill?: PrefillRow;
  unit: WeightUnit;
  onLog: (v: SetValues) => void;
  onUnlog: () => void;
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n));

export function SetRow(p: Props) {
  const isLogged = p.logged.length > 0;
  const both = p.logged.find((s) => s.side === 'both');
  const left = p.logged.find((s) => s.side === 'left');
  const right = p.logged.find((s) => s.side === 'right');
  const src = both ?? left ?? right;
  const cardio = p.layout === 'cardio';

  const init = () => {
    const sec = src?.durationSec ?? p.prefill?.durationSec;
    const dist = src?.distanceM ?? p.prefill?.distanceM;
    return {
      weight: formatWeight(src?.weightKg ?? p.prefill?.weightKg, p.unit),
      reps: str(both?.reps ?? p.prefill?.reps),
      repsL: str(left?.reps ?? p.prefill?.reps),
      repsR: str(right?.reps ?? p.prefill?.reps),
      // Cardio time is entered in minutes, holds in seconds.
      duration: sec === undefined ? '' : String(cardio ? Math.round((sec / 60) * 10) / 10 : sec),
      distanceKm: dist === undefined ? '' : String(dist / 1000),
    };
  };
  const [d, setD] = useState(init);
  const [invalid, setInvalid] = useState<string | null>(null);

  // Refresh the draft when the suggestion arrives or changes, unless this set is already logged.
  useEffect(() => {
    if (!isLogged) setD(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.prefill?.weightKg, p.prefill?.reps, p.prefill?.durationSec, p.prefill?.distanceM, p.exercise.id, p.unit, p.layout]);
  // Show the stored value once logged (normalises "22,5" to 22.5).
  useEffect(() => {
    if (isLogged) setD(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogged, src?.weightKg, src?.reps, p.unit]);

  function confirm() {
    if (isLogged) return p.onUnlog();
    const v: SetValues = {};
    const L = p.layout;
    if (L === 'weight-reps' || L === 'weight-sides') {
      const w = parseDecimal(d.weight);
      if (w === undefined && p.exercise.tracking === 'strength') return setInvalid('weight');
      if (w !== undefined) v.weightKg = roundWeight(fromDisplay(w, p.unit), 'kg');
    }
    if (L === 'weight-reps' || L === 'reps') {
      const r = parseDecimal(d.reps);
      if (r === undefined) return setInvalid('reps');
      v.reps = Math.round(r);
    }
    if (L === 'weight-sides' || L === 'sides') {
      const l = parseDecimal(d.repsL);
      const r = parseDecimal(d.repsR);
      if (l === undefined) return setInvalid('repsL');
      if (r === undefined) return setInvalid('repsR');
      v.repsLeft = Math.round(l);
      v.repsRight = Math.round(r);
    }
    if (L === 'time') {
      const s = parseDecimal(d.duration);
      if (s === undefined) return setInvalid('duration');
      v.durationSec = Math.round(s);
    }
    if (L === 'cardio') {
      const m = parseDecimal(d.duration);
      const km = parseDecimal(d.distanceKm);
      if (m === undefined && km === undefined) return setInvalid('duration');
      if (m !== undefined) v.durationSec = Math.round(m * 60);
      if (km !== undefined) v.distanceM = Math.round(km * 1000);
    }
    setInvalid(null);
    p.onLog(v);
  }

  const input = (key: keyof typeof d, label: string) => (
    <input
      class={`set-input num ${invalid === key ? 'invalid' : ''}`}
      inputMode="decimal"
      enterKeyHint="done"
      aria-label={`Set ${p.index + 1} ${label}`}
      placeholder="–"
      value={d[key]}
      disabled={isLogged}
      onInput={(e) => setD({ ...d, [key]: (e.target as HTMLInputElement).value })}
      onFocus={(e) => (e.target as HTMLInputElement).select()}
    />
  );

  const L = p.layout;
  return (
    <div class={`set-row cols-${L} ${isLogged ? 'logged' : ''}`}>
      <span class="set-n num">{p.index + 1}</span>
      {(L === 'weight-reps' || L === 'weight-sides') && input('weight', `weight in ${p.unit}`)}
      {(L === 'weight-reps' || L === 'reps') && input('reps', 'reps')}
      {(L === 'weight-sides' || L === 'sides') && input('repsL', 'left reps')}
      {(L === 'weight-sides' || L === 'sides') && input('repsR', 'right reps')}
      {L === 'time' && input('duration', 'seconds')}
      {L === 'cardio' && input('duration', 'minutes')}
      {L === 'cardio' && input('distanceKm', 'kilometres')}
      <button
        type="button"
        class={`check-btn ${isLogged ? 'on' : ''}`}
        aria-label={isLogged ? `Undo set ${p.index + 1}` : `Log set ${p.index + 1}`}
        aria-pressed={isLogged}
        onClick={confirm}
      >
        <Icon name="check" size={24} />
      </button>
    </div>
  );
}

export const weightModeHint = (ex: Exercise, unit: WeightUnit): string | undefined => {
  switch (ex.weightMode) {
    case 'per_dumbbell':
      return `${unit} per dumbbell`;
    case 'per_side':
      return `${unit} per side`;
    case 'added':
      return `added ${unit}`;
    case 'assisted':
      return `assistance ${unit}`;
    case 'total':
      return ex.equipment === 'barbell' ? `${unit} incl. bar` : undefined;
    default:
      return undefined;
  }
};
