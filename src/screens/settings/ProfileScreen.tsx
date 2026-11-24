import { back } from '../../app/router';
import { db, type ProfileRecord } from '../../db/db';
import { useLive } from '../../db/live';
import { parseDecimal } from '../../features/training/units';
import { Card, Section, TopBar } from '../../ui/components';

const ACTIVITY = [
  ['', '–'],
  ['sedentary', 'Sedentary'],
  ['lightly_active', 'Lightly active'],
  ['moderately_active', 'Moderately active'],
  ['very_active', 'Very active'],
] as const;
const EXPERIENCE = [
  ['', '–'],
  ['beginner', 'Beginner'],
  ['returning_beginner', 'Returning beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
] as const;
const GOALS = [
  ['', '–'],
  ['muscle_gain', 'Muscle gain'],
  ['fat_loss', 'Fat loss'],
  ['body_recomposition', 'Body recomposition'],
  ['strength', 'Strength'],
  ['general_fitness', 'General fitness'],
  ['endurance', 'Endurance'],
  ['mobility', 'Mobility'],
  ['other', 'Other'],
] as const;

/** Optional profile. Seeded once from a plan, then yours to edit; never overwritten by plan updates. */
export function ProfileScreen() {
  const profile = useLive(() => db.profile.get('me'), []);
  const latestWeight = useLive(() => db.measurements.where('[measurementId+date]').between(['bodyweight', ''], ['bodyweight', '￿']).last(), []);
  const p: ProfileRecord = profile ?? { key: 'me' };
  const save = (patch: Partial<ProfileRecord>) => void db.profile.put({ ...p, ...patch });

  const select = (id: string, label: string, value: string | undefined, options: readonly (readonly [string, string])[], key: keyof ProfileRecord) => (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} class="input" value={value ?? ''} onChange={(e) => save({ [key]: (e.target as HTMLSelectElement).value || undefined })}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <main class="screen">
      <TopBar title="Profile" onBack={back} />
      <p class="muted small">Optional. Stays on this phone and is left out of plan files you share.</p>
      <Section title="Body">
        <Card class="stack">
          <div class="field">
            <label for="p-name">Name</label>
            <input id="p-name" class="input" value={p.displayName ?? ''} onChange={(e) => save({ displayName: (e.target as HTMLInputElement).value.trim() || undefined })} />
          </div>
          <div class="field">
            <label for="p-height">Height (cm)</label>
            <input id="p-height" class="input num" inputMode="decimal" value={p.heightCm ?? ''} onChange={(e) => save({ heightCm: parseDecimal((e.target as HTMLInputElement).value) })} />
          </div>
          <div class="field">
            <label for="p-start">Starting weight (kg, approximate)</label>
            <input id="p-start" class="input num" inputMode="decimal" value={p.initialWeightKg ?? ''} onChange={(e) => save({ initialWeightKg: parseDecimal((e.target as HTMLInputElement).value) })} />
          </div>
          <p class="small muted">
            Current weight: {latestWeight ? `${latestWeight.value} kg (${latestWeight.date})` : 'log a weigh-in to see it here'}
          </p>
        </Card>
      </Section>
      <Section title="Training">
        <Card class="stack">
          {select('p-goal', 'Goal', p.goal, GOALS, 'goal')}
          {select('p-exp', 'Experience', p.experience, EXPERIENCE, 'experience')}
          {select('p-act', 'Activity outside training', p.activityLevel, ACTIVITY, 'activityLevel')}
          <div class="field">
            <label for="p-prio">Priorities (comma separated)</label>
            <input
              id="p-prio"
              class="input"
              value={(p.priorities ?? []).join(', ')}
              onChange={(e) =>
                save({
                  priorities: (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </Card>
      </Section>
    </main>
  );
}
