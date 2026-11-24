import { useEffect, useState } from 'preact/hooks';
import type { SessionRecord, SetRecord } from '../../db/db';
import { targetLabel } from '../../features/plans/format';
import { buildPrefill, perSetIndex, summariseSets } from '../../features/training/progression';
import { currentExercise, exerciseForSet, lastPerformance, logSet, setSlotSkipped, unlogSet } from '../../features/training/session';
import type { SlotPrescription } from '../../features/training/types';
import { formatWeight, type WeightUnit } from '../../features/training/units';
import { Tag } from '../../ui/components';
import { formatClock } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { columnHeaders, columnLayout, SetRow, weightModeHint, type SetValues } from './SetRow';

const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

interface Props {
  session: SessionRecord;
  slot: SlotPrescription;
  sets: SetRecord[];
  unit: WeightUnit;
  expanded: boolean;
  progression: boolean;
  incrementKg?: number;
  separateSides: boolean;
  onToggle: () => void;
  onLogged: (restSec: number) => void;
  onSwap: () => void;
  onToggleSides: () => void;
}

export function SlotCard(p: Props) {
  const exerciseId = currentExercise(p.session, p.slot.slot);
  const ex = p.session.prescription.exercises[exerciseId] ?? { id: exerciseId, name: exerciseId, tracking: 'strength' as const };
  const planned = p.session.prescription.exercises[p.slot.plannedExerciseId];
  const swappedFrom = exerciseId !== p.slot.plannedExerciseId ? planned?.name : undefined;
  const skipped = (p.session.skippedSlots ?? []).includes(p.slot.slot);
  const [previous, setPrevious] = useState<SetRecord[] | null>(null);
  const [extraRows, setExtraRows] = useState(0);

  useEffect(() => {
    let alive = true;
    setPrevious(null);
    void lastPerformance(exerciseId, p.session.id).then((r) => alive && setPrevious(r));
    return () => {
      alive = false;
    };
  }, [exerciseId, p.session.id]);

  const sub = [...p.session.substitutions].reverse().find((s) => s.slot === p.slot.slot);
  const offset = sub && sub.performedExerciseId === exerciseId ? sub.fromSetIndex : 0;
  const increment = p.incrementKg ?? ex.weightIncrementKg ?? 2.5;
  const prefill = buildPrefill(previous ?? [], p.slot, { tracking: ex.tracking, weightIncrementKg: increment }, p.progression);
  const fmt = (kg: number) => formatWeight(kg, p.unit);
  const lastLine = previous?.length ? summariseSets(perSetIndex(previous), fmt) : undefined;

  const loggedIdx = new Set(p.sets.map((s) => s.setIndex));
  const maxLogged = p.sets.length ? Math.max(...p.sets.map((s) => s.setIndex)) + 1 : 0;
  const baseRows = Math.max(p.slot.sets + offset, maxLogged);
  const rowCount = baseRows + extraRows;
  const doneCount = loggedIdx.size;
  const target = targetLabel(p.slot, ex);
  const complete = doneCount >= p.slot.sets;
  const layout = columnLayout(ex, p.separateSides && !!ex.unilateral);
  const headers = columnHeaders(layout, p.unit, ex);
  // An added row can be removed again as long as it is the last one and not logged.
  const canRemoveRow = extraRows > 0 && !loggedIdx.has(rowCount - 1);

  async function log(i: number, v: SetValues) {
    const base = { slot: p.slot.slot, setIndex: i, exerciseId: exerciseForSet(p.session, p.slot.slot, i), weightKg: v.weightKg, durationSec: v.durationSec, distanceM: v.distanceM };
    if (v.repsLeft !== undefined || v.repsRight !== undefined) {
      await logSet(p.session.id, { ...base, side: 'left', reps: v.repsLeft });
      await logSet(p.session.id, { ...base, side: 'right', reps: v.repsRight });
    } else {
      await logSet(p.session.id, { ...base, side: 'both', reps: v.reps });
    }
    p.onLogged(p.slot.restSeconds);
  }

  async function unlog(i: number) {
    for (const s of p.sets.filter((x) => x.setIndex === i)) await unlogSet(s.id);
  }

  return (
    <section class={`slot card ${p.expanded ? 'open' : ''} ${complete ? 'complete' : ''} ${skipped ? 'skipped' : ''}`}>
      <button type="button" class="slot-head" onClick={p.onToggle} aria-expanded={p.expanded}>
        <span class="row-main">
          <span class="slot-title">
            {ex.name}
            {p.slot.optional && <span class="muted small"> · optional</span>}
          </span>
          <span class="row-detail num">{skipped ? 'Skipped' : `${p.slot.sets} × ${target}`}</span>
        </span>
        <span class={`slot-count num ${complete ? 'done' : ''}`}>{complete ? <Icon name="check" size={16} /> : `${doneCount}/${p.slot.sets}`}</span>
        {!p.expanded && <Icon name="chevron" size={18} class="row-chevron" />}
      </button>

      {p.expanded && !skipped && (
        <div class="slot-body">
          <div class="slot-meta">
            {swappedFrom && <Tag tone="acc">for {swappedFrom}</Tag>}
            {prefill.progressedByKg && (
              <Tag tone="lime">
                ↑ {fmt(prefill.progressedByKg)} {p.unit}
              </Tag>
            )}
            <span class="muted small">
              {[weightModeHint(ex, p.unit), p.slot.restSeconds ? `rest ${formatClock(p.slot.restSeconds)}` : ''].filter(Boolean).join(' · ')}
            </span>
          </div>
          {lastLine && <p class="small muted">Last session: <span class="num">{lastLine}</span></p>}
          {previous && !previous.length && ex.tracking === 'strength' && <p class="small muted">First session: enter the weight you use.</p>}
          {p.slot.notes && <p class="small">{p.slot.notes}</p>}
          {ex.notes && <p class="small muted">{ex.notes}</p>}

          <div class="sets">
            {headers.length > 0 && (
              <div class={`set-row set-head cols-${layout}`} aria-hidden="true">
                <span>Set</span>
                {headers.map((h) => (
                  <span key={h}>{h}</span>
                ))}
                <span />
              </div>
            )}
            {Array.from({ length: rowCount }, (_, i) => {
              const rowEx = p.session.prescription.exercises[exerciseForSet(p.session, p.slot.slot, i)] ?? ex;
              const historyRow = i >= offset ? prefill.rows[Math.min(i - offset, prefill.rows.length - 1)] : undefined;
              // Carry today's adjustments forward: if the previous set was logged with different values
              // than suggested (or there was no suggestion), the next set starts from what you just did.
              const prevLogged = perSetIndex(p.sets.filter((s) => s.setIndex === i - 1))[0];
              const prevSuggested = i - 1 >= offset ? prefill.rows[Math.min(i - 1 - offset, prefill.rows.length - 1)] : undefined;
              const changed =
                prevLogged &&
                (prevLogged.weightKg !== prevSuggested?.weightKg || prevLogged.reps !== prevSuggested?.reps || prevLogged.durationSec !== prevSuggested?.durationSec);
              const rowPrefill = changed && i - 1 >= offset ? { ...historyRow, ...stripUndefined(prevLogged) } : historyRow;
              return (
                <SetRow
                  key={`${i}-${rowEx.id}`}
                  index={i}
                  exercise={rowEx}
                  layout={rowEx.id === ex.id ? layout : columnLayout(rowEx, p.separateSides && !!rowEx.unilateral)}
                  logged={p.sets.filter((s) => s.setIndex === i)}
                  prefill={rowPrefill}
                  unit={p.unit}
                  onLog={(v) => void log(i, v)}
                  onUnlog={() => void unlog(i)}
                />
              );
            })}
          </div>

          <div class="slot-actions">
            <button type="button" class="chip" onClick={p.onSwap}>
              <Icon name="swap" size={16} /> Swap
            </button>
            <button type="button" class="chip" onClick={() => setExtraRows(extraRows + 1)}>
              <Icon name="plus" size={16} /> Set
            </button>
            {canRemoveRow && (
              <button type="button" class="chip" onClick={() => setExtraRows(extraRows - 1)}>
                <Icon name="minus" size={16} /> Set
              </button>
            )}
            {ex.unilateral && (
              <button type="button" class="chip" aria-pressed={p.separateSides} onClick={p.onToggleSides}>
                <Icon name="sides" size={16} /> {p.separateSides ? 'Per side' : 'Both sides'}
              </button>
            )}
            <button type="button" class="chip" onClick={() => void setSlotSkipped(p.session.id, p.slot.slot, true)}>
              <Icon name="skip" size={16} /> Skip
            </button>
          </div>
        </div>
      )}
      {p.expanded && skipped && (
        <div class="slot-body">
          <button type="button" class="chip" onClick={() => void setSlotSkipped(p.session.id, p.slot.slot, false)}>
            <Icon name="undo" size={16} /> Undo skip
          </button>
        </div>
      )}
    </section>
  );
}
