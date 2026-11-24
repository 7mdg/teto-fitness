import { useEffect, useState } from 'preact/hooks';
import type { SetRecord } from '../../db/db';
import type { Exercise } from '../../features/plans/types';
import type { PrefillRow } from '../../features/training/progression';
import { displayIncrement, formatWeight, fromDisplay, parseDecimal, roundWeight, toDisplay, type WeightUnit } from '../../features/training/units';
import { Icon } from '../../ui/icons';

export interface SetValues {
  weightKg?: number;
  reps?: number;
  repsLeft?: number;
  repsRight?: number;
  durationSec?: number;
  distanceM?: number;
}

interface Props {
  index: number;
  exercise: Exercise;
  logged: SetRecord[];
  prefill?: PrefillRow;
  unit: WeightUnit;
  incrementKg: number;
  separateSides: boolean;
  onLog: (v: SetValues) => void;
  onUnlog: () => void;
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n));

export function SetRow(p: Props) {
  const t = p.exercise.tracking;
  const showWeight = t === 'strength' || (t === 'bodyweight' && (p.exercise.weightMode === 'added' || p.exercise.weightMode === 'assisted'));
  const isLogged = p.logged.length > 0;
  const both = p.logged.find((s) => s.side === 'both');
  const left = p.logged.find((s) => s.side === 'left');
  const right = p.logged.find((s) => s.side === 'right');
  const src = both ?? left ?? right;

  const init = () => ({
    weight: formatWeight(src?.weightKg ?? p.prefill?.weightKg, p.unit),
    reps: str(both?.reps ?? p.prefill?.reps),
    repsL: str(left?.reps ?? p.prefill?.reps),
    repsR: str(right?.reps ?? p.prefill?.reps),
    // Cardio time is entered in minutes, holds in seconds.
    duration: (() => {
      const sec = src?.durationSec ?? p.prefill?.durationSec;
      return sec === undefined ? '' : String(t === 'cardio' ? Math.round((sec / 60) * 10) / 10 : sec);
    })(),
    distanceKm: src?.distanceM !== undefined || p.prefill?.distanceM !== undefined ? str(((src?.distanceM ?? p.prefill?.distanceM)! / 1000)) : '',
  });
  const [d, setD] = useState(init);
  const [invalid, setInvalid] = useState<string | null>(null);
  // Refresh the draft when the prefill arrives or the exercise changes, unless the user is editing.
  useEffect(() => {
    if (!isLogged) setD(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.prefill?.weightKg, p.prefill?.reps, p.prefill?.durationSec, p.prefill?.distanceM, p.exercise.id, p.unit]);

  // Show the stored value once logged (normalises "22,5" to 22.5 and reflects unit changes).
  useEffect(() => {
    if (isLogged) setD(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogged, src?.weightKg, src?.reps, p.unit]);

  const step = displayIncrement(p.incrementKg, p.unit);
  const bump = (dir: 1 | -1) => {
    const cur = parseDecimal(d.weight) ?? 0;
    const next = Math.max(0, roundWeight(cur + dir * step, p.unit));
    setD({ ...d, weight: String(next) });
  };

  function confirm() {
    if (isLogged) return p.onUnlog();
    const w = parseDecimal(d.weight);
    const v: SetValues = {};
    if (showWeight) {
      if (w === undefined && t === 'strength') return setInvalid('weight');
      if (w !== undefined) v.weightKg = roundWeight(fromDisplay(w, p.unit), 'kg');
    }
    if (t === 'strength' || t === 'bodyweight') {
      if (p.separateSides) {
        const l = parseDecimal(d.repsL);
        const r = parseDecimal(d.repsR);
        if (l === undefined || r === undefined) return setInvalid('reps');
        v.repsLeft = Math.round(l);
        v.repsRight = Math.round(r);
      } else {
        const r = parseDecimal(d.reps);
        if (r === undefined) return setInvalid('reps');
        v.reps = Math.round(r);
      }
    }
    if (t === 'duration' || t === 'isometric') {
      const s = parseDecimal(d.duration);
      if (s === undefined) return setInvalid('duration');
      v.durationSec = Math.round(s);
    }
    if (t === 'cardio') {
      const s = parseDecimal(d.duration);
      const km = parseDecimal(d.distanceKm);
      if (s === undefined && km === undefined) return setInvalid('duration');
      if (s !== undefined) v.durationSec = Math.round(s * 60);
      if (km !== undefined) v.distanceM = Math.round(km * 1000);
    }
    setInvalid(null);
    p.onLog(v);
  }

  const input = (key: keyof typeof d, label: string, opts: { wide?: boolean; invalidKey?: string } = {}) => (
    <input
      class={`set-input num ${opts.wide ? 'wide' : ''} ${invalid === (opts.invalidKey ?? key) ? 'invalid' : ''}`}
      inputMode="decimal"
      enterKeyHint="done"
      aria-label={label}
      placeholder="–"
      value={d[key]}
      disabled={isLogged}
      onInput={(e) => setD({ ...d, [key]: (e.target as HTMLInputElement).value })}
      onFocus={(e) => (e.target as HTMLInputElement).select()}
    />
  );

  return (
    <div class={`set-row ${isLogged ? 'logged' : ''} ${p.separateSides ? 'per-side' : ''}`}>
      <span class="set-n num">{p.index + 1}</span>
      {showWeight && (
        <span class="weight-group">
          <button type="button" class="step" aria-label="Less weight" disabled={isLogged} onClick={() => bump(-1)}>
            <Icon name="minus" size={16} />
          </button>
          {input('weight', `Set ${p.index + 1} weight in ${p.unit}`)}
          <button type="button" class="step" aria-label="More weight" disabled={isLogged} onClick={() => bump(1)}>
            <Icon name="plus" size={16} />
          </button>
        </span>
      )}
      {(t === 'strength' || t === 'bodyweight') &&
        (p.separateSides ? (
          <span class="sides">
            <span class="side-label">L</span>
            {input('repsL', `Set ${p.index + 1} left reps`, { invalidKey: 'reps' })}
            <span class="side-label">R</span>
            {input('repsR', `Set ${p.index + 1} right reps`, { invalidKey: 'reps' })}
          </span>
        ) : (
          <span class="reps-group">
            {showWeight && <span class="times">×</span>}
            {input('reps', `Set ${p.index + 1} reps`)}
            {!showWeight && <span class="unit-label">reps</span>}
          </span>
        ))}
      {(t === 'duration' || t === 'isometric') && (
        <span class="reps-group">
          {input('duration', `Set ${p.index + 1} seconds`, { wide: true })}
          <span class="unit-label">s</span>
        </span>
      )}
      {t === 'cardio' && (
        <span class="reps-group">
          {input('duration', 'Minutes', { invalidKey: 'duration' })}
          <span class="unit-label">min</span>
          {input('distanceKm', 'Kilometres')}
          <span class="unit-label">km</span>
        </span>
      )}
      <button
        type="button"
        class={`check-btn ${isLogged ? 'on' : ''}`}
        aria-label={isLogged ? `Undo set ${p.index + 1}` : `Log set ${p.index + 1}`}
        aria-pressed={isLogged}
        onClick={confirm}
      >
        <Icon name="check" size={22} />
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

export { toDisplay };
