import { useState } from 'preact/hooks';
import { db, type PlanRecord } from '../../db/db';
import { useLive } from '../../db/live';
import { effectiveHabits, isDue, logMeasurement, setHabitDone, type EffectiveHabit } from '../../features/habits/habits';
import { habitTargetLabel } from '../../features/plans/format';
import { addDays } from '../../features/schedule/dates';
import { parseDecimal } from '../../features/training/units';
import { Button, Card, Dialog, Section } from '../../ui/components';
import { Icon } from '../../ui/icons';

const UNIT_LABEL: Record<string, string> = { min: 'minutes', h: 'hours', count: '', steps: 'steps', l: 'litres', km: 'km' };

export function HabitsSection({ record, today, weekStart }: { record: PlanRecord; today: string; weekStart: string }) {
  const plan = record.json;
  const overrides = useLive(() => db.overrides.where('planId').equals(record.id).toArray(), [record.id]);
  const logs = useLive(() => db.habitLogs.where('date').between(addDays(weekStart, -7), addDays(weekStart, 7), true, true).toArray(), [weekStart]);
  const [editing, setEditing] = useState<EffectiveHabit | null>(null);

  if (!plan.habits?.length || !overrides || !logs) return null;
  const due = effectiveHabits(plan, overrides).filter((h) => h.enabled && isDue(h, today, weekStart, logs));
  if (!due.length) return null;
  const logFor = (id: string) => logs.find((l) => l.habitId === id && l.date === today && l.done);
  const doneCount = due.filter((h) => logFor(h.id)).length;

  return (
    <Section title="Habits" action={<span class="muted small num">{doneCount}/{due.length}</span>}>
      <Card class="flush">
        {due.map((h) => {
          const log = logFor(h.id);
          const m = h.measurementId ? plan.measurements?.find((x) => x.id === h.measurementId) : undefined;
          const valueText = log?.value !== undefined ? `${log.value} ${m?.unit ?? (h.target ? (h.target.unit === 'count' ? '' : h.target.unit) : '')}`.trim() : '';
          return (
            <button
              type="button"
              class="row habit-row"
              key={h.id}
              onClick={() => (h.type === 'checkbox' ? void setHabitDone(h.id, today, !log) : setEditing(h))}
              aria-pressed={!!log}
            >
              <span class="row-main">
                <span class="row-title">{h.name}</span>
                <span class="row-detail">{[habitTargetLabel(h), h.scheduledTime, h.frequency === 'weekly' && !h.weekdays ? 'this week' : ''].filter(Boolean).join(' · ')}</span>
              </span>
              {valueText && <span class="row-trailing num">{valueText}</span>}
              <span class={`habit-check ${log ? 'on' : ''}`}>{log ? <Icon name="check" size={16} /> : null}</span>
            </button>
          );
        })}
      </Card>
      <HabitSheet record={record} habit={editing} today={today} onClose={() => setEditing(null)} done={!!(editing && logFor(editing.id))} />
    </Section>
  );
}

function HabitSheet({ record, habit, today, onClose, done }: { record: PlanRecord; habit: EffectiveHabit | null; today: string; onClose: () => void; done: boolean }) {
  const plan = record.json;
  const m = habit?.measurementId ? plan.measurements?.find((x) => x.id === habit.measurementId) : undefined;
  const last = useLive(async () => (m ? await db.measurements.where('[measurementId+date]').between([m.id, ''], [m.id, '￿']).last() : undefined), [m?.id]);
  const todayLog = useLive(async () => (habit ? await db.habitLogs.get([habit.id, today]) : undefined), [habit?.id, today]);
  const [text, setText] = useState<string | null>(null);
  if (!habit) return <Dialog open={false} title="" onClose={onClose} actions={null} />;

  const unit = m ? m.unit : UNIT_LABEL[habit.target?.unit ?? ''] ?? '';
  const initial = todayLog?.value ?? (m && last ? last.value : habit.target?.max ?? habit.target?.min);
  const value = text ?? (initial !== undefined ? String(initial) : '');
  const parsed = parseDecimal(value);

  async function save() {
    if (parsed === undefined || !habit) return;
    if (m) {
      const linked = (plan.habits ?? []).filter((h) => h.measurementId === m.id).map((h) => h.id);
      await logMeasurement(m.id, parsed, m.unit, today, linked);
    } else {
      await setHabitDone(habit.id, today, true, parsed);
    }
    setText(null);
    onClose();
  }

  return (
    <Dialog
      open
      title={habit.name}
      onClose={() => {
        setText(null);
        onClose();
      }}
      actions={
        <>
          <Button variant="primary" full disabled={parsed === undefined} onClick={() => void save()}>
            Save
          </Button>
          {done && (
            <Button
              full
              onClick={async () => {
                await setHabitDone(habit.id, today, false);
                setText(null);
                onClose();
              }}
            >
              Mark as not done
            </Button>
          )}
          <Button
            variant="ghost"
            full
            onClick={() => {
              setText(null);
              onClose();
            }}
          >
            Cancel
          </Button>
        </>
      }
    >
      <div class="big-input-wrap">
        <input
          class="big-input num"
          inputMode="decimal"
          aria-label={`${habit.name} value`}
          value={value}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
        />
        <span class="big-unit">{unit}</span>
      </div>
      {m && last && last.date !== today && <p class="small muted">Last: {last.value} {m.unit} on {last.date}</p>}
      {habit.target && !m && <p class="small muted">Target: {habitTargetLabel(habit)}</p>}
    </Dialog>
  );
}
