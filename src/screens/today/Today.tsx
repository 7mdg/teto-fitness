import { useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { db, type PlanRecord, type SessionRecord } from '../../db/db';
import { useLive } from '../../db/live';
import { estimatedLabel } from '../../features/plans/format';
import { planTimezone, programmePosition } from '../../features/plans/summary';
import { addDays, formatLong, formatShort, nextWeekday, parseDate, todayIn, weekdayOf } from '../../features/schedule/dates';
import { nextOccurrence, occurrences, type Occurrence } from '../../features/schedule/occurrences';
import { startSession } from '../../features/training/session';
import { Button, Card, Dialog, Row, Section, Tag, TopBar } from '../../ui/components';
import { formatClock, unlockAudio, useNow } from '../../ui/hooks';
import { Icon } from '../../ui/icons';

type DayState = 'done' | 'missed' | 'planned' | 'rest';

export function Today({ record }: { record: PlanRecord }) {
  const plan = record.json;
  const now = useNow(30_000);
  const today = todayIn(planTimezone(plan), new Date(now));
  const weekStart = nextWeekday(addDays(today, -6), plan.schedule.weekStartsOn ?? 'monday');
  const weekEnd = addDays(weekStart, 6);

  const overrides = useLive(() => db.scheduleOverrides.where('[planId+occurrenceKey]').between([record.id, ''], [record.id, '￿']).toArray(), [record.id]);
  const sessions = useLive(
    () => db.sessions.where('startedAt').aboveOrEqual(new Date(parseDate(addDays(weekStart, -1))).toISOString()).filter((s) => s.status !== 'discarded').toArray(),
    [weekStart],
  );
  const active = useLive(() => db.sessions.where('status').equals('active').first(), []);
  const [picker, setPicker] = useState(false);

  if (!overrides || !sessions) return <main class="screen has-tabs" />;

  const week = occurrences(plan, record.startDate, weekStart, weekEnd, overrides);
  const doneKeys = new Set(sessions.filter((s) => s.status === 'completed' && s.occurrenceKey).map((s) => s.occurrenceKey!));
  const todays = week.filter((o) => o.date === today);
  const pending = todays.find((o) => !doneKeys.has(o.key));
  const next = nextOccurrence(plan, record.startDate, today, overrides);
  const pos = programmePosition(plan, record.startDate, today);
  const firstPhase = plan.programme?.phases?.find((p) => p.startWeek === 1);

  async function start(o: Occurrence | undefined, workoutId: string) {
    unlockAudio();
    const id = await startSession(record, workoutId, {
      occurrence: o,
      date: today,
      phase: pos.phase ?? (pos.status === 'before' ? firstPhase : undefined),
      week: pos.week || 1,
    });
    navigate({ name: 'workout', sessionId: id });
  }

  const workoutName = (id: string) => plan.workouts.find((w) => w.id === id)?.name ?? id;
  const workout = (id: string) => plan.workouts.find((w) => w.id === id);

  const dayState = (date: string): DayState => {
    const occ = week.filter((o) => o.date === date && !o.optional);
    if (!occ.length) return sessions.some((s) => s.status === 'completed' && s.scheduledDate === date) ? 'done' : 'rest';
    if (occ.every((o) => doneKeys.has(o.key))) return 'done';
    return date < today ? 'missed' : 'planned';
  };

  const headline =
    pos.status === 'before'
      ? `Starts ${formatShort(record.startDate)}`
      : `Week ${pos.week}${plan.programme?.durationWeeks && pos.status === 'running' ? ` / ${plan.programme.durationWeeks}` : ''}${pos.phase ? ` · ${pos.phase.name}` : ''}`;

  return (
    <main class="screen has-tabs">
      <TopBar brand />
      <div class="stack" style={{ gap: '4px' }}>
        <p class="muted small">{formatLong(today).replace(/ \d{4}$/, '')}</p>
        <h1 class="h1">{headline}</h1>
      </div>

      {active && <ResumeCard session={active} />}

      {!active && pending && (
        <WorkoutCard
          label={`Today · ${pending.time}`}
          name={workoutName(pending.workoutId)}
          detail={[workout(pending.workoutId)?.focus, `${workout(pending.workoutId)?.exercises.length} exercises`, estimatedLabel(workout(pending.workoutId)!)]
            .filter(Boolean)
            .join(' · ')}
          optional={pending.optional}
          onStart={() => void start(pending, pending.workoutId)}
        />
      )}

      {!active && !pending && (
        <Card class="stack">
          {todays.length > 0 ? (
            <div class="inline">
              <Tag tone="lime">Done</Tag>
              <span>{todays.map((o) => workoutName(o.workoutId)).join(', ')}</span>
            </div>
          ) : (
            <p class="lead" style={{ color: 'var(--ink)' }}>{pos.status === 'before' ? 'Not started yet' : 'Rest day'}</p>
          )}
          {next && (
            <p class="muted">
              Next: <span style={{ color: 'var(--ink)' }}>{workoutName(next.workoutId)}</span> · {formatShort(next.date)} {next.time}
            </p>
          )}
        </Card>
      )}

      <WeekStrip start={weekStart} today={today} state={dayState} />

      {!active && (
        <Button variant="ghost" full onClick={() => setPicker(true)}>
          {pending ? 'Do a different workout' : 'Start a workout anyway'}
        </Button>
      )}

      <Dialog
        open={picker}
        title="Start a workout"
        onClose={() => setPicker(false)}
        actions={
          <Button variant="ghost" full onClick={() => setPicker(false)}>
            Cancel
          </Button>
        }
      >
        <div class="card flush">
          {plan.workouts.map((w) => (
            <Row
              key={w.id}
              title={w.name}
              detail={[w.focus, estimatedLabel(w)].filter(Boolean).join(' · ')}
              chevron
              onClick={() => {
                setPicker(false);
                void start(pending?.workoutId === w.id ? pending : undefined, w.id);
              }}
            />
          ))}
        </div>
        {pos.status === 'before' && <p class="small">Before the start date this counts as a practice session; its sets still prefill your first real one.</p>}
      </Dialog>
    </main>
  );
}

function WorkoutCard(props: { label: string; name: string; detail: string; optional: boolean; onStart: () => void }) {
  return (
    <Card class="stack today-card">
      <div class="inline">
        <span class="muted small">{props.label}</span>
        {props.optional && <Tag>optional</Tag>}
      </div>
      <div>
        <h2 class="h2">{props.name}</h2>
        <p class="muted small">{props.detail}</p>
      </div>
      <Button variant="primary" class="big" full icon="play" onClick={props.onStart}>
        Start {props.name}
      </Button>
    </Card>
  );
}

function ResumeCard({ session }: { session: SessionRecord }) {
  const now = useNow(1000);
  const sets = useLive(() => db.sets.where('sessionId').equals(session.id).count(), [session.id]);
  const total = session.prescription.slots.reduce((n, s) => n + s.sets, 0);
  return (
    <Card class="stack today-card">
      <div class="inline">
        <Tag tone="acc">In progress</Tag>
        <span class="muted small num">{formatClock((now - Date.parse(session.startedAt)) / 1000)}</span>
      </div>
      <div>
        <h2 class="h2">{session.prescription.workoutName}</h2>
        <p class="muted small">
          {sets ?? 0} of {total} sets logged
        </p>
      </div>
      <Button variant="primary" class="big" full onClick={() => navigate({ name: 'workout', sessionId: session.id })}>
        Resume
      </Button>
    </Card>
  );
}

function WeekStrip(props: { start: string; today: string; state: (d: string) => DayState }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(props.start, i));
  return (
    <Section title="This week">
      <div class="week">
        {days.map((d) => {
          const st = props.state(d);
          return (
            <div key={d} class={`day ${st} ${d === props.today ? 'today' : ''}`} aria-label={`${formatShort(d)}: ${st}`}>
              <span class="day-name">{weekdayOf(d).slice(0, 1).toUpperCase()}</span>
              <span class="day-num num">{Number(d.slice(8))}</span>
              <span class="day-dot">{st === 'done' ? <Icon name="check" size={12} /> : null}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
