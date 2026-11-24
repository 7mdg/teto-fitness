import { useMemo, useState } from 'preact/hooks';
import { back, resetTo, showToast } from '../../app/router';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { diffPlans } from '../../features/plans/diff';
import { entryWhen, orderedEntries } from '../../features/plans/format';
import { importPlan, requestPersistence, type ImportMode } from '../../features/plans/repository';
import { defaultStartDate, summarisePlan } from '../../features/plans/summary';
import { validatePlanText, type PlanIssue } from '../../features/plans/validate';
import { formatLong, weekdayOf } from '../../features/schedule/dates';
import { Button, Card, Section, Tag, TopBar } from '../../ui/components';
import { Icon } from '../../ui/icons';
import { chooseFileAndPreview } from '../onboarding/loadPlan';

function IssueList({ issues, warn }: { issues: PlanIssue[]; warn?: boolean }) {
  return (
    <ul class={`issues ${warn ? 'warn' : ''}`}>
      {issues.map((i) => (
        <li key={i.path + i.message}>
          <code>{i.path}</code>
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

function ChangeList({ changes }: { changes: string[] }) {
  const [all, setAll] = useState(false);
  if (!changes.length) return <p class="small">No changes to workouts, schedule, phases or habits.</p>;
  const shown = all ? changes : changes.slice(0, 8);
  return (
    <div class="stack" style={{ gap: '6px' }}>
      <ul class="changes">
        {shown.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {changes.length > shown.length && (
        <Button variant="ghost" onClick={() => setAll(true)}>
          {changes.length - shown.length} more
        </Button>
      )}
    </div>
  );
}

export function ImportPreview(props: { text: string; source: string }) {
  const result = useMemo(() => validatePlanText(props.text), [props.text]);
  const plan = result.ok ? result.plan : undefined;
  const existing = useLive(() => (plan ? db.plans.get(plan.metadata.id) : undefined), [plan?.metadata.id]);
  const [startDate, setStartDate] = useState(() => (plan ? defaultStartDate(plan) : ''));
  const [choice, setChoice] = useState<'update' | 'separate'>('update');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!result.ok) {
    return (
      <main class="screen">
        <TopBar title="Import plan" onBack={back} />
        <div class="stack">
          <div class="inline">
            <Tag tone="danger">Not imported</Tag>
            <span class="muted small">{props.source}</span>
          </div>
          <h1 class="h1">This plan needs fixing</h1>
          <p class="lead">
            {result.errors.length === 1 ? '1 problem was' : `${result.errors.length} problems were`} found. Nothing was changed. Fix these
            in the file (or ask the AI that made it), then import again.
          </p>
        </div>
        <Card>
          <IssueList issues={result.errors} />
        </Card>
        <Button full icon="file" onClick={() => void chooseFileAndPreview()}>
          Choose another file
        </Button>
      </main>
    );
  }

  const p = plan!;
  const s = summarisePlan(p);
  const mode: ImportMode = existing ? choice : 'new';
  const sameRevision = existing && existing.revision === p.metadata.revision;
  const usesWeekday = startDate && p.schedule.weekStartsOn && weekdayOf(startDate) !== p.schedule.weekStartsOn;

  async function activate() {
    setBusy(true);
    setFailure(null);
    try {
      await importPlan(p, { mode, startDate });
      void requestPersistence();
      showToast(mode === 'update' ? 'Plan updated' : 'Plan activated');
      resetTo({ name: 'home' });
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main class="screen has-actions">
      <TopBar title="Import plan" onBack={back} />

      <div class="stack">
        <div class="inline">
          <Tag tone="acc">Valid plan</Tag>
          <span class="muted small num">rev {p.metadata.revision}</span>
        </div>
        <h1 class="h1">{p.metadata.name}</h1>
        {p.metadata.description && <p class="lead">{p.metadata.description}</p>}
        <div class="facts">
          {s.weeks && (
            <span>
              <b>{s.weeks}</b> weeks
            </span>
          )}
          <span>
            <b>{s.workoutsPerWeek}</b> workouts/week
          </span>
          <span>
            <b>{s.exerciseCount}</b> exercises
            {s.alternativeCount > 0 && <span class="muted"> +{s.alternativeCount} alternatives</span>}
          </span>
          {s.habitCount > 0 && (
            <span>
              <b>{s.habitCount}</b> habits
            </span>
          )}
          {s.measurementCount > 0 && (
            <span>
              <b>{s.measurementCount}</b> measurements
            </span>
          )}
        </div>
      </div>

      {existing && (
        <Section title="Already on this phone">
          <Card class="stack">
            <p class="small">
              You have <b>{existing.json.metadata.name}</b> (rev {existing.revision}).
              {sameRevision ? ' This file has the same revision.' : ` This file is rev ${p.metadata.revision}.`}
            </p>
            <div class="seg" role="group" aria-label="Import mode">
              <button type="button" aria-pressed={choice === 'update'} onClick={() => setChoice('update')}>
                Update existing
              </button>
              <button type="button" aria-pressed={choice === 'separate'} onClick={() => setChoice('separate')}>
                Keep both
              </button>
            </div>
            {choice === 'update' && <ChangeList changes={diffPlans(existing.json, p)} />}
            <p class="muted small">
              {choice === 'update' ? 'Your training history is preserved.' : 'Imported as a separate plan with its own id.'}
            </p>
          </Card>
        </Section>
      )}

      <Section title="Start date">
        <Card class="stack">
          <div class="field">
            <label for="start-date">Week 1 starts</label>
            <input
              id="start-date"
              class="input num"
              type="date"
              value={startDate}
              onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
            />
          </div>
          {startDate && <p class="muted small">{formatLong(startDate)}{usesWeekday ? ` · not a ${p.schedule.weekStartsOn}` : ''}</p>}
        </Card>
      </Section>

      {s.phases.length > 0 && (
        <Section title="Phases">
          <Card class="flush">
            {s.phases.map((ph) => (
              <div class="row" key={ph.id}>
                <span class="row-main">
                  <span class="row-title">{ph.name}</span>
                  <span class="row-detail">{ph.workingSetsCap ? `${ph.workingSetsCap} working sets per exercise` : 'Full volume'}</span>
                </span>
                <span class="row-trailing num">
                  Wk {ph.startWeek}–{ph.endWeek}
                </span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Schedule">
        <Card class="flush">
          {orderedEntries(p).map((e) => (
            <div class="row" key={e.id}>
              <span class="row-main">
                <span class="row-title">{p.workouts.find((w) => w.id === e.workoutId)?.name}</span>
              </span>
              <span class="row-trailing num">{entryWhen(e)}</span>
            </div>
          ))}
        </Card>
      </Section>

      {result.warnings.length > 0 && (
        <Section title="Notes">
          <Card>
            <IssueList issues={result.warnings} warn />
          </Card>
        </Section>
      )}

      {failure && (
        <p class="small" style={{ color: 'var(--danger)' }}>
          <Icon name="alert" size={16} style={{ verticalAlign: '-3px' }} /> {failure}
        </p>
      )}

      <div class="sticky-actions">
        <div>
          <Button variant="primary" class="big" full disabled={busy || !startDate} onClick={() => void activate()}>
            {mode === 'update' ? 'Apply update' : 'Activate plan'}
          </Button>
        </div>
      </div>
    </main>
  );
}
