import { useState } from 'preact/hooks';
import { back, navigate } from '../../app/router';
import { db, DEFAULT_SETTINGS, getSettings, type SessionRecord, type SetRecord } from '../../db/db';
import { useLive } from '../../db/live';
import { formatShort } from '../../features/schedule/dates';
import { e1rm, perSetIndex, summariseSets } from '../../features/training/progression';
import { formatWeight, type WeightUnit } from '../../features/training/units';
import { logMeasurement } from '../../features/habits/habits';
import { measurementSeries, recentChange, rolling7, strengthSeries } from '../../features/progress/stats';
import { parseDecimal } from '../../features/training/units';
import { Button, Card, Dialog, Row, Section, Tag, TopBar } from '../../ui/components';
import { formatClock } from '../../ui/hooks';
import { LineChart } from '../../ui/LineChart';

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const durationOf = (s: SessionRecord) => (s.endedAt ? formatClock((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000) : '');
const exerciseName = (sessions: SessionRecord[], id: string) => {
  for (const s of sessions) if (s.prescription.exercises[id]) return s.prescription.exercises[id]!.name;
  return id;
};

function useHistory() {
  const sessions = useLive(() => db.sessions.where('status').equals('completed').reverse().sortBy('startedAt'), []);
  const sets = useLive(async () => {
    const ids = new Set((await db.sessions.where('status').equals('completed').primaryKeys()) as string[]);
    return (await db.sets.toArray()).filter((s) => ids.has(s.sessionId));
  }, []);
  return { sessions, sets };
}

export function ProgressScreen() {
  const [tab, setTab] = useState<'history' | 'exercises' | 'body'>('history');
  const { sessions, sets } = useHistory();
  const unit = (useLive(getSettings, []) ?? DEFAULT_SETTINGS).weightUnit;

  return (
    <main class="screen has-tabs">
      <TopBar title="Progress" />
      <div class="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
          History
        </button>
        <button type="button" aria-pressed={tab === 'exercises'} onClick={() => setTab('exercises')}>
          Exercises
        </button>
        <button type="button" aria-pressed={tab === 'body'} onClick={() => setTab('body')}>
          Body
        </button>
      </div>
      {tab === 'body' ? (
        <BodyProgress />
      ) : !sessions || !sets ? null : sessions.length === 0 ? (
        <p class="lead">Completed workouts appear here.</p>
      ) : tab === 'history' ? (
        <Card class="flush">
          {sessions.map((s) => {
            const n = new Set(sets.filter((x) => x.sessionId === s.id).map((x) => `${x.slot}:${x.setIndex}`)).size;
            return (
              <Row
                key={s.id}
                title={s.prescription.workoutName}
                detail={`${formatShort(localDate(s.startedAt))} · ${durationOf(s)} · ${n} sets`}
                trailing={s.records?.length ? <Tag tone="lime">PR</Tag> : undefined}
                chevron
                onClick={() => navigate({ name: 'session', id: s.id })}
              />
            );
          })}
        </Card>
      ) : (
        <ExerciseList sessions={sessions} sets={sets} unit={unit} />
      )}
    </main>
  );
}

function ExerciseList({ sessions, sets, unit }: { sessions: SessionRecord[]; sets: SetRecord[]; unit: WeightUnit }) {
  const byEx = new Map<string, SetRecord[]>();
  for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  const rows = [...byEx.entries()]
    .map(([id, list]) => {
      const last = list.reduce((a, b) => (a.loggedAt > b.loggedAt ? a : b));
      const best = list.filter((x) => x.weightKg !== undefined && x.reps).reduce<SetRecord | undefined>((a, b) => (!a || e1rm(b.weightKg!, b.reps!) > e1rm(a.weightKg!, a.reps!) ? b : a), undefined);
      return { id, name: exerciseName(sessions, id), last: last.loggedAt, best };
    })
    .sort((a, b) => b.last.localeCompare(a.last));
  return (
    <Card class="flush">
      {rows.map((r) => (
        <Row
          key={r.id}
          title={r.name}
          detail={`Last ${formatShort(localDate(r.last))}${r.best ? ` · best ${formatWeight(r.best.weightKg, unit)} × ${r.best.reps}` : ''}`}
          chevron
          onClick={() => navigate({ name: 'exercise', id: r.id })}
        />
      ))}
    </Card>
  );
}

function setLines(list: SetRecord[], unit: WeightUnit) {
  return summariseSets(perSetIndex(list), (kg) => formatWeight(kg, unit));
}

export function SessionDetail({ id }: { id: string }) {
  const session = useLive(() => db.sessions.get(id), [id]);
  const sets = useLive(() => db.sets.where('sessionId').equals(id).toArray(), [id]);
  const unit = (useLive(getSettings, []) ?? DEFAULT_SETTINGS).weightUnit;
  if (!session || !sets) return <main class="screen" />;
  const p = session.prescription;
  const groups = new Map<string, SetRecord[]>();
  for (const s of [...sets].sort((a, b) => a.order - b.order)) {
    const key = `${s.slot}|${s.exerciseId}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return (
    <main class="screen">
      <TopBar onBack={back} />
      <div class="stack">
        <h1 class="h1">{p.workoutName}</h1>
        <p class="lead">
          {formatShort(localDate(session.startedAt))} · {durationOf(session)}
          {p.phaseName ? ` · ${p.phaseName}` : ''}
        </p>
      </div>
      <Card class="flush">
        {[...groups.entries()].map(([key, list]) => {
          const [slotStr, exId] = key.split('|') as [string, string];
          const planned = p.slots[Number(slotStr)]?.plannedExerciseId;
          return (
            <Row
              key={key}
              title={p.exercises[exId]?.name ?? exId}
              detail={planned && planned !== exId ? `for ${p.exercises[planned]?.name ?? planned}` : undefined}
              trailing={<span class="num">{setLines(list, unit)}</span>}
            />
          );
        })}
      </Card>
      {session.note && (
        <Section title="Note">
          <Card>
            <p>{session.note}</p>
          </Card>
        </Section>
      )}
    </main>
  );
}

export function ExerciseHistory({ id }: { id: string }) {
  const { sessions, sets } = useHistory();
  const unit = (useLive(getSettings, []) ?? DEFAULT_SETTINGS).weightUnit;
  const [metric, setMetric] = useState<'e1rm' | 'weight'>('e1rm');
  if (!sessions || !sets) return <main class="screen" />;
  const mine = sets.filter((s) => s.exerciseId === id);
  const bySession = sessions.filter((s) => mine.some((x) => x.sessionId === s.id));
  const series = strengthSeries(id, sets, sessions, metric).map((p) => ({ ...p, y: Number(formatWeight(p.y, unit)) }));
  return (
    <main class="screen">
      <TopBar onBack={back} />
      <h1 class="h1">{exerciseName(sessions, id)}</h1>
      {series.length > 0 && (
        <Card class="stack">
          <div class="seg" role="group" aria-label="Metric">
            <button type="button" aria-pressed={metric === 'e1rm'} onClick={() => setMetric('e1rm')}>
              Estimated 1RM
            </button>
            <button type="button" aria-pressed={metric === 'weight'} onClick={() => setMetric('weight')}>
              Heaviest set
            </button>
          </div>
          <LineChart line={series} lineLabel={metric === 'e1rm' ? 'Estimated 1RM' : 'Heaviest set'} unit={unit} />
        </Card>
      )}
      <Card class="flush">
        {bySession.map((s) => (
          <Row
            key={s.id}
            title={<span class="num">{setLines(mine.filter((x) => x.sessionId === s.id), unit)}</span>}
            detail={`${formatShort(localDate(s.startedAt))} · ${s.prescription.workoutName}`}
            onClick={() => navigate({ name: 'session', id: s.id })}
            chevron
          />
        ))}
      </Card>
    </main>
  );
}

function BodyProgress() {
  const plan = useLive(() => db.plans.where('status').equals('active').first(), []);
  const records = useLive(() => db.measurements.toArray(), []);
  const profile = useLive(() => db.profile.get('me'), []);
  const [logging, setLogging] = useState<{ id: string; name: string; unit: string } | null>(null);
  if (!records) return null;
  const defs = [...(plan?.json.measurements ?? [])];
  for (const r of records) if (!defs.some((d) => d.id === r.measurementId)) defs.push({ id: r.measurementId, name: r.measurementId, unit: r.unit as 'kg' });
  if (!defs.length) return <p class="lead">Your plan has no measurements. Add them to the plan file to track body weight or circumferences.</p>;

  return (
    <div class="stack">
      {defs.map((m) => {
        const pts = measurementSeries(m.id, records);
        const last = pts[pts.length - 1];
        const change = recentChange(pts, 30);
        const avg = m.trend === 'rolling7' ? rolling7(pts) : undefined;
        return (
          <Card class="stack" key={m.id}>
            <div class="inline" style={{ justifyContent: 'space-between' }}>
              <div>
                <p class="muted small">{m.name}</p>
                <p>
                  <span class="stat-big num">{last ? last.y : '–'}</span> <span class="muted">{m.unit}</span>
                </p>
                {last && (
                  <p class="delta">
                    {formatShort(last.x)}
                    {change !== undefined ? ` · ${change > 0 ? '+' : ''}${change} ${m.unit} in 30 days` : ''}
                  </p>
                )}
              </div>
              <Button variant="primary" onClick={() => setLogging({ id: m.id, name: m.name, unit: m.unit })}>
                Log
              </Button>
            </div>
            {pts.length > 1 &&
              (avg ? (
                <LineChart line={avg} lineLabel="7-day average" dots={pts} dotsLabel="Daily" unit={m.unit} />
              ) : (
                <LineChart line={pts} lineLabel={m.name} unit={m.unit} />
              ))}
          </Card>
        );
      })}
      {profile?.heightCm && <p class="muted small">Height {profile.heightCm} cm (from your profile)</p>}
      <MeasureSheet target={logging} habits={plan?.json.habits ?? []} onClose={() => setLogging(null)} />
    </div>
  );
}

function MeasureSheet({ target, habits, onClose }: { target: { id: string; name: string; unit: string } | null; habits: { id: string; measurementId?: string }[]; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => localDate(new Date().toISOString()));
  if (!target) return <Dialog open={false} title="" onClose={onClose} actions={null} />;
  const parsed = parseDecimal(value);
  const close = () => {
    setValue('');
    onClose();
  };
  return (
    <Dialog
      open
      title={target.name}
      onClose={close}
      actions={
        <>
          <Button
            variant="primary"
            full
            disabled={parsed === undefined}
            onClick={async () => {
              const linked = habits.filter((h) => h.measurementId === target.id).map((h) => h.id);
              await logMeasurement(target.id, parsed!, target.unit, date, linked);
              close();
            }}
          >
            Save
          </Button>
          <Button variant="ghost" full onClick={close}>
            Cancel
          </Button>
        </>
      }
    >
      <div class="big-input-wrap">
        <input class="big-input num" inputMode="decimal" aria-label={`${target.name} value`} value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
        <span class="big-unit">{target.unit}</span>
      </div>
      <div class="field">
        <label for="m-date">Date</label>
        <input id="m-date" class="input num" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </div>
    </Dialog>
  );
}
