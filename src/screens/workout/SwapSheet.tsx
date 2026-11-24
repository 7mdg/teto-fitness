import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SessionRecord } from '../../db/db';
import type { Equipment, Exercise, WeightMode } from '../../features/plans/types';
import { perSetIndex, summariseSets } from '../../features/training/progression';
import { createCustomExercise, currentExercise, exerciseCatalog, lastPerformance, swapExercise } from '../../features/training/session';
import { formatWeight, parseDecimal, type WeightUnit } from '../../features/training/units';
import { Button, Dialog, Row } from '../../ui/components';
import { Icon } from '../../ui/icons';

interface Props {
  session: SessionRecord;
  slot: number | null;
  unit: WeightUnit;
  onClose: () => void;
}

const EQUIPMENT: Equipment[] = ['machine', 'cable', 'dumbbell', 'barbell', 'smith', 'bodyweight', 'kettlebell', 'band', 'other'];
const MODES: { v: WeightMode; l: string }[] = [
  { v: 'total', l: 'Total / stack' },
  { v: 'per_dumbbell', l: 'Per dumbbell' },
  { v: 'per_side', l: 'Per side' },
  { v: 'added', l: 'Added to bodyweight' },
];

export function SwapSheet({ session, slot, unit, onClose }: Props) {
  const [step, setStep] = useState<'list' | 'search' | 'create'>('list');
  const [always, setAlways] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Map<string, Exercise>>(new Map());
  const [lastLines, setLastLines] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', equipment: 'machine' as Equipment, weightMode: 'total' as WeightMode, increment: '2.5', unilateral: false });
  const open = slot !== null;
  const sp = slot !== null ? session.prescription.slots[slot] : undefined;
  const currentId = slot !== null ? currentExercise(session, slot) : '';
  const current = session.prescription.exercises[currentId];

  useEffect(() => {
    if (!open) return;
    setStep('list');
    setAlways(false);
    setQuery('');
    void exerciseCatalog().then((c) => {
      for (const [id, ex] of Object.entries(session.prescription.exercises)) if (!c.has(id)) c.set(id, ex);
      setCatalog(c);
    });
  }, [open, slot]);

  const alternatives = useMemo(() => {
    if (!sp) return [];
    const ids = [...new Set([sp.plannedExerciseId, sp.exerciseId, ...sp.alternatives])].filter((id) => id !== currentId);
    return ids.map((id) => session.prescription.exercises[id] ?? catalog.get(id)).filter((e): e is Exercise => !!e);
  }, [sp, currentId, catalog, session.prescription.exercises]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void Promise.all(
      alternatives.map(async (ex) => {
        const sets = await lastPerformance(ex.id, session.id);
        return [ex.id, sets.length ? summariseSets(perSetIndex(sets), (kg) => formatWeight(kg, unit)) : ''] as const;
      }),
    ).then((pairs) => alive && setLastLines(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [open, alternatives.map((a) => a.id).join(',')]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const muscles = new Set(current?.muscleGroups ?? []);
    return [...catalog.values()]
      .filter((e) => e.id !== currentId && (!q || e.name.toLowerCase().includes(q)))
      .map((e) => ({ e, score: (e.muscleGroups ?? []).filter((m) => muscles.has(m)).length }))
      .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
      .slice(0, 40)
      .map((x) => x.e);
  }, [catalog, query, currentId, current]);

  async function choose(ex: Exercise) {
    if (slot === null) return;
    await swapExercise(session.id, slot, ex, { always });
    onClose();
  }

  async function create() {
    if (!form.name.trim()) return;
    const bodyweight = form.equipment === 'bodyweight';
    const ex = await createCustomExercise({
      name: form.name.trim(),
      tracking: bodyweight ? 'bodyweight' : 'strength',
      equipment: form.equipment,
      category: current?.category,
      muscleGroups: current?.muscleGroups,
      weightMode: bodyweight ? 'added' : form.weightMode,
      weightIncrementKg: parseDecimal(form.increment) ?? 2.5,
      unilateral: form.unilateral || undefined,
      defaultRestSeconds: sp?.restSeconds,
    });
    await choose(ex);
  }

  const workoutName = session.prescription.workoutName;

  return (
    <Dialog
      open={open}
      title={step === 'create' ? 'New exercise' : `Swap ${current?.name ?? ''}`}
      onClose={onClose}
      actions={
        <Button variant="ghost" full onClick={step === 'list' ? onClose : () => setStep('list')}>
          {step === 'list' ? 'Cancel' : 'Back'}
        </Button>
      }
    >
      {step === 'list' && (
        <>
          {alternatives.length > 0 && (
            <div class="card flush sheet-list">
              {alternatives.map((ex) => (
                <Row key={ex.id} title={ex.name} detail={lastLines[ex.id] ? `Last ${lastLines[ex.id]}` : ex.equipment} chevron onClick={() => void choose(ex)} />
              ))}
            </div>
          )}
          <div class="card flush">
            <Row title={<span class="inline"><Icon name="search" size={16} /> Other exercise</span>} chevron onClick={() => setStep('search')} />
            <Row title={<span class="inline"><Icon name="plus" size={16} /> Create exercise</span>} chevron onClick={() => setStep('create')} />
          </div>
          <label class="check-line">
            <input type="checkbox" checked={always} onChange={(e) => setAlways((e.target as HTMLInputElement).checked)} />
            <span>Always use this in {workoutName}</span>
          </label>
        </>
      )}

      {step === 'search' && (
        <>
          <input class="input" type="search" placeholder="Search exercises" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
          <div class="card flush sheet-list">
            {searchResults.map((ex) => (
              <Row key={ex.id} title={ex.name} detail={[ex.equipment, ex.muscleGroups?.slice(0, 2).join(', ')].filter(Boolean).join(' · ')} onClick={() => void choose(ex)} />
            ))}
            {searchResults.length === 0 && <p class="small muted" style={{ padding: '12px 16px' }}>No match. Create it instead.</p>}
          </div>
          <label class="check-line">
            <input type="checkbox" checked={always} onChange={(e) => setAlways((e.target as HTMLInputElement).checked)} />
            <span>Always use this in {workoutName}</span>
          </label>
        </>
      )}

      {step === 'create' && (
        <div class="stack">
          <div class="field">
            <label for="cx-name">Name</label>
            <input id="cx-name" class="input" value={form.name} onInput={(e) => setForm({ ...form, name: (e.target as HTMLInputElement).value })} />
          </div>
          <div class="field">
            <label for="cx-eq">Equipment</label>
            <select id="cx-eq" class="input" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: (e.target as HTMLSelectElement).value as Equipment })}>
              {EQUIPMENT.map((e) => (
                <option key={e} value={e}>
                  {e[0]!.toUpperCase() + e.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {form.equipment !== 'bodyweight' && (
            <div class="field">
              <label for="cx-mode">Weight is logged as</label>
              <select id="cx-mode" class="input" value={form.weightMode} onChange={(e) => setForm({ ...form, weightMode: (e.target as HTMLSelectElement).value as WeightMode })}>
                {MODES.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div class="field">
            <label for="cx-inc">Weight step (kg)</label>
            <input id="cx-inc" class="input num" inputMode="decimal" value={form.increment} onInput={(e) => setForm({ ...form, increment: (e.target as HTMLInputElement).value })} />
          </div>
          <label class="check-line">
            <input type="checkbox" checked={form.unilateral} onChange={(e) => setForm({ ...form, unilateral: (e.target as HTMLInputElement).checked })} />
            <span>One side at a time</span>
          </label>
          <label class="check-line">
            <input type="checkbox" checked={always} onChange={(e) => setAlways((e.target as HTMLInputElement).checked)} />
            <span>Always use this in {workoutName}</span>
          </label>
          <Button variant="primary" full disabled={!form.name.trim()} onClick={() => void create()}>
            Create and use
          </Button>
        </div>
      )}
    </Dialog>
  );
}
