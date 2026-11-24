import { useState } from 'preact/hooks';
import { resetTo } from '../../app/router';
import { db, DEFAULT_SETTINGS, getSettings } from '../../db/db';
import { useLive } from '../../db/live';
import { formatWeight } from '../../features/training/units';
import { Button, Card, Section } from '../../ui/components';
import { formatClock } from '../../ui/hooks';
import { Icon, Mark } from '../../ui/icons';

export function SummaryScreen({ sessionId }: { sessionId: string }) {
  const session = useLive(() => db.sessions.get(sessionId), [sessionId]);
  const sets = useLive(() => db.sets.where('sessionId').equals(sessionId).toArray(), [sessionId]);
  const settings = useLive(getSettings, []) ?? DEFAULT_SETTINGS;
  const [note, setNote] = useState<string | null>(null);
  if (!session || !sets) return <main class="screen" />;

  const duration = session.endedAt ? (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000 : 0;
  const setCount = new Set(sets.map((s) => `${s.slot}:${s.setIndex}`)).size;
  const exerciseCount = new Set(sets.map((s) => s.exerciseId)).size;
  const records = session.records ?? [];
  const name = (id: string) => session.prescription.exercises[id]?.name ?? id;
  const unit = settings.weightUnit;

  async function done() {
    if (note !== null) await db.sessions.update(sessionId, { note: note.trim() || undefined });
    resetTo({ name: 'home' });
  }

  return (
    <main class="screen has-actions">
      <div class="hero" style={{ paddingTop: '32px' }}>
        <Mark width={110} />
        <h1 class="h1">{session.prescription.workoutName} done</h1>
        <div class="facts" style={{ justifyContent: 'center' }}>
          <span>
            <b>{formatClock(duration)}</b>
          </span>
          <span>
            <b>{setCount}</b> {setCount === 1 ? 'set' : 'sets'}
          </span>
          <span>
            <b>{exerciseCount}</b> {exerciseCount === 1 ? 'exercise' : 'exercises'}
          </span>
        </div>
      </div>

      {records.length > 0 && (
        <Section title="Personal records">
          <Card class="flush">
            {records.map((r) => (
              <div class="row" key={r.exerciseId + r.kind}>
                <Icon name="trophy" size={20} style={{ color: 'var(--lime)', flex: 'none' }} />
                <span class="row-main">
                  <span class="row-title">{name(r.exerciseId)}</span>
                  <span class="row-detail">{r.kind === 'weight' ? 'Heaviest weight' : 'Best estimated 1RM'}</span>
                </span>
                <span class="row-trailing num">
                  <span style={{ color: 'var(--lime)' }}>
                    {formatWeight(r.valueKg, unit)} {unit}
                  </span>
                  <br />
                  <span class="small muted">was {formatWeight(r.previousKg, unit)}</span>
                </span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Note">
        <textarea
          class="input textarea"
          rows={3}
          placeholder="How did it go? (optional)"
          value={note ?? session.note ?? ''}
          onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        />
      </Section>

      <div class="sticky-actions">
        <div>
          <Button variant="primary" class="big" full onClick={() => void done()}>
            Done
          </Button>
        </div>
      </div>
    </main>
  );
}
