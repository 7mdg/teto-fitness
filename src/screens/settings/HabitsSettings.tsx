import { back } from '../../app/router';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { effectiveHabits, setHabitOverride } from '../../features/habits/habits';
import { habitDaysLabel } from '../../features/plans/format';
import { parseDecimal } from '../../features/training/units';
import { Card, Section, Toggle, TopBar } from '../../ui/components';

/** Turn habits on/off and adjust targets. Stored as local overrides: the plan file is untouched. */
export function HabitsSettings() {
  const record = useLive(() => db.plans.where('status').equals('active').first(), []);
  const overrides = useLive(async () => (record ? await db.overrides.where('planId').equals(record.id).toArray() : []), [record?.id]);
  if (!record || !overrides) return <main class="screen"><TopBar title="Habits" onBack={back} /></main>;
  const habits = effectiveHabits(record.json, overrides);

  return (
    <main class="screen">
      <TopBar title="Habits" onBack={back} />
      {habits.length === 0 ? (
        <p class="lead">Your active plan has no habits.</p>
      ) : (
        <Section title={record.json.metadata.name}>
          <Card class="flush">
            {habits.map((h) => (
              <div key={h.id}>
                <Toggle label={h.name} detail={habitDaysLabel(h)} checked={h.enabled} onChange={(v) => void setHabitOverride(record.id, h.id, { enabled: v })} />
                {h.enabled && h.target && h.type !== 'measurement' && (
                  <div class="row target-row">
                    <span class="row-detail">Target</span>
                    <input
                      class="input num target-input"
                      inputMode="decimal"
                      aria-label={`${h.name} minimum`}
                      value={h.target.min ?? ''}
                      onChange={(e) => void setHabitOverride(record.id, h.id, { target: { ...h.target!, min: parseDecimal((e.target as HTMLInputElement).value) } })}
                    />
                    <span class="muted">–</span>
                    <input
                      class="input num target-input"
                      inputMode="decimal"
                      aria-label={`${h.name} maximum`}
                      value={h.target.max ?? ''}
                      onChange={(e) => void setHabitOverride(record.id, h.id, { target: { ...h.target!, max: parseDecimal((e.target as HTMLInputElement).value) } })}
                    />
                    <span class="muted small">{h.target.unit}</span>
                  </div>
                )}
              </div>
            ))}
          </Card>
        </Section>
      )}
      <p class="muted small">Changes stay on this phone and survive plan updates.</p>
    </main>
  );
}
