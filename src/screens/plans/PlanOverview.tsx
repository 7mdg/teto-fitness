import type { PlanRecord } from '../../db/db';
import { entryWhen, estimatedLabel, habitDaysLabel, habitTargetLabel, orderedEntries, prescriptionLabel } from '../../features/plans/format';
import { effectiveSets, planTimezone, programmePosition, type ProgrammePosition } from '../../features/plans/summary';
import { formatShort, todayIn } from '../../features/schedule/dates';
import { Card, Section } from '../../ui/components';
import { Icon } from '../../ui/icons';

function statusLine(pos: ProgrammePosition, startDate: string, weeks?: number): string {
  switch (pos.status) {
    case 'before':
      return `Starts ${formatShort(startDate)} · in ${pos.daysUntilStart} day${pos.daysUntilStart === 1 ? '' : 's'}`;
    case 'running':
      return `Week ${pos.week}${weeks ? ` of ${weeks}` : ''}${pos.phase ? ` · ${pos.phase.name}` : ''}`;
    case 'continuing':
      return `Week ${pos.week} · continuing${pos.phase ? ` ${pos.phase.name}` : ''}`;
    case 'finished':
      return 'Programme finished';
  }
}

/** Read-only view of a plan. Phase 2 replaces the home screen with Today; this stays as plan detail. */
export function PlanOverview({ record }: { record: PlanRecord }) {
  const plan = record.json;
  const today = todayIn(planTimezone(plan));
  const pos = programmePosition(plan, record.startDate, today);
  // Before the start, show the volume of the first phase (what you will actually do first).
  const phase = pos.phase ?? (pos.status === 'before' ? plan.programme?.phases?.find((ph) => ph.startWeek === 1) : undefined);
  const exById = new Map(plan.exercises.map((e) => [e.id, e]));

  return (
    <>
      <div class="stack">
        <h1 class="h1">{plan.metadata.name}</h1>
        <p class="lead">{statusLine(pos, record.startDate, plan.programme?.durationWeeks)}</p>
      </div>

      <Section title="Schedule">
        <Card class="flush">
          {orderedEntries(plan).map((e) => (
            <div class="row" key={e.id}>
              <span class="row-main">
                <span class="row-title">{plan.workouts.find((w) => w.id === e.workoutId)?.name}</span>
              </span>
              <span class="row-trailing num">{entryWhen(e)}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title={phase?.workingSetsCap ? `Workouts · ${phase.name}: ${phase.workingSetsCap} working sets` : 'Workouts'}>
        <div class="stack">
          {plan.workouts.map((w) => (
            <details class="workout card" key={w.id}>
              <summary>
                <span class="row-main">
                  <span class="row-title">{w.name}</span>
                  <span class="row-detail">
                    {[w.focus, `${w.exercises.length} exercises`, estimatedLabel(w)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Icon name="chevron" size={18} class="row-chevron" />
              </summary>
              <div class="ex-list">
                {w.exercises.map((we, i) => {
                  const ex = exById.get(we.exerciseId);
                  const sets = effectiveSets(we.sets, phase);
                  return (
                    <div class="ex-line" key={`${we.exerciseId}-${i}`}>
                      <span>
                        {ex?.name ?? we.exerciseId}
                        {we.optional && <span class="muted small"> · optional</span>}
                      </span>
                      <span class="num">{prescriptionLabel(sets, we, ex)}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </Section>

      {plan.habits && plan.habits.length > 0 && (
        <Section title="Habits">
          <Card class="flush">
            {plan.habits.map((h) => (
              <div class="row" key={h.id}>
                <span class="row-main">
                  <span class="row-title">{h.name}</span>
                  <span class="row-detail">{habitDaysLabel(h)}</span>
                </span>
                <span class="row-trailing num">{habitTargetLabel(h)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {plan.measurements && plan.measurements.length > 0 && (
        <Section title="Measurements">
          <Card class="flush">
            {plan.measurements.map((m) => (
              <div class="row" key={m.id}>
                <span class="row-main">
                  <span class="row-title">{m.name}</span>
                  <span class="row-detail">{m.frequency ? m.frequency[0]!.toUpperCase() + m.frequency.slice(1) : ''}</span>
                </span>
                <span class="row-trailing">{m.unit}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}
