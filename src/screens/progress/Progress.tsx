import { useState } from 'preact/hooks';
import { back, navigate } from '../../app/router';
import { db, DEFAULT_SETTINGS, getSettings, type SessionRecord, type SetRecord } from '../../db/db';
import { useLive } from '../../db/live';
import { formatShort } from '../../features/schedule/dates';
import { e1rm, perSetIndex, summariseSets } from '../../features/training/progression';
import { formatWeight, type WeightUnit } from '../../features/training/units';
import { Card, Row, Section, Tag, TopBar } from '../../ui/components';
import { formatClock } from '../../ui/hooks';

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
  const [tab, setTab] = useState<'history' | 'exercises'>('history');
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
      </div>
      {!sessions || !sets ? null : sessions.length === 0 ? (
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
  if (!sessions || !sets) return <main class="screen" />;
  const mine = sets.filter((s) => s.exerciseId === id);
  const bySession = sessions.filter((s) => mine.some((x) => x.sessionId === s.id));
  return (
    <main class="screen">
      <TopBar onBack={back} />
      <h1 class="h1">{exerciseName(sessions, id)}</h1>
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
      <p class="muted small">Charts arrive in a later update.</p>
    </main>
  );
}
