import { useState } from 'preact/hooks';
import { back } from '../../app/router';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { planTimezone } from '../../features/plans/summary';
import { WEEKDAYS } from '../../features/plans/types';
import { addDays, nextWeekday, parseDate, todayIn } from '../../features/schedule/dates';
import { occurrences } from '../../features/schedule/occurrences';
import { TopBar } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { DaySheet } from './DaySheet';

const monthStart = (d: string) => `${d.slice(0, 8)}01`;
const shiftMonth = (first: string, n: number) => {
  const dt = new Date(parseDate(first));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
};
const monthTitle = (first: string) => new Date(parseDate(first)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A whole month of planned and finished workouts. Tap a day to move or skip sessions. */
export function MonthScreen() {
  const record = useLive(() => db.plans.where('status').equals('active').first(), []);
  const today = record ? todayIn(planTimezone(record.json)) : '';
  const [first, setFirst] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const month = first ?? (today ? monthStart(today) : '');
  const weekStart = record?.json.schedule.weekStartsOn ?? 'monday';
  const gridStart = month ? nextWeekday(addDays(month, -6), weekStart) : '';
  const gridEnd = month ? addDays(gridStart, 41) : '';

  const overrides = useLive(async () => (record ? await db.scheduleOverrides.where('[planId+occurrenceKey]').between([record.id, ''], [record.id, '￿']).toArray() : []), [record?.id]);
  const sessions = useLive(
    async () => (gridStart ? await db.sessions.where('startedAt').between(new Date(parseDate(addDays(gridStart, -1))).toISOString(), new Date(parseDate(addDays(gridEnd, 2))).toISOString()).filter((s) => s.status === 'completed').toArray() : []),
    [gridStart],
  );

  if (!record || !overrides || !sessions) return <main class="screen"><TopBar onBack={back} /></main>;
  const plan = record.json;
  const occ = occurrences(plan, record.startDate, gridStart, gridEnd, overrides);
  const doneKeys = new Set(sessions.filter((s) => s.occurrenceKey).map((s) => s.occurrenceKey!));
  const extraDone = sessions.filter((s) => !s.occurrenceKey);
  const name = (id: string) => plan.workouts.find((w) => w.id === id)?.name ?? id;
  const order = [...WEEKDAYS.slice(WEEKDAYS.indexOf(weekStart)), ...WEEKDAYS.slice(0, WEEKDAYS.indexOf(weekStart))];
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Drop a trailing week that belongs entirely to the next month.
  const firstNextRow = days.findIndex((d, i) => i % 7 === 0 && d.slice(0, 7) > month.slice(0, 7));
  const trimmed = firstNextRow > 0 ? days.slice(0, firstNextRow) : days;

  return (
    <main class="screen">
      <TopBar
        title={monthTitle(month)}
        onBack={back}
        right={
          <span class="inline" style={{ gap: '0' }}>
            <button type="button" class="icon-btn" aria-label="Previous month" onClick={() => setFirst(shiftMonth(month, -1))}>
              <Icon name="back" size={20} />
            </button>
            <button type="button" class="icon-btn" aria-label="Next month" onClick={() => setFirst(shiftMonth(month, 1))}>
              <Icon name="chevron" size={20} />
            </button>
          </span>
        }
      />
      <div class="month">
        {order.map((w) => (
          <span key={w} class="month-head">
            {w.slice(0, 1).toUpperCase()}
          </span>
        ))}
        {trimmed.map((d) => {
          const items = occ.filter((o) => o.date === d);
          const extra = extraDone.filter((s) => s.scheduledDate === d);
          const out = d.slice(0, 7) !== month.slice(0, 7);
          return (
            <button type="button" key={d} class={`mday ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`} onClick={() => setDay(d)}>
              <span class="mday-num num">{Number(d.slice(8))}</span>
              {items.map((o) => {
                const done = doneKeys.has(o.key);
                const missed = !done && d < today;
                return (
                  <span key={o.key} class={`mday-item ${done ? 'done' : missed ? 'missed' : 'planned'} ${o.moved ? 'moved' : ''}`}>
                    {name(o.workoutId)}
                  </span>
                );
              })}
              {extra.map((s) => (
                <span key={s.id} class="mday-item done">
                  {s.prescription.workoutName}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <div class="legend small">
        <span><i class="lg planned" /> planned</span>
        <span><i class="lg done" /> done</span>
        <span><i class="lg missed" /> missed</span>
        <span><i class="lg moved" /> moved</span>
      </div>
      <DaySheet record={record} date={day} week={occ} overrides={overrides} doneKeys={doneKeys} onClose={() => setDay(null)} />
    </main>
  );
}
