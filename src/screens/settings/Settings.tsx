import { navigate } from '../../app/router';
import { db, DEFAULT_SETTINGS, getSettings, type AppSettings } from '../../db/db';
import { useLive } from '../../db/live';
import { SCHEMA_VERSION } from '../../features/plans/types';
import { Card, Row, Section, Tag, Toggle, TopBar } from '../../ui/components';
import { playRestDone, unlockAudio } from '../../ui/hooks';
import { chooseFileAndPreview, EXAMPLES, previewExample } from '../onboarding/loadPlan';

const ORDER = { active: 0, inactive: 1, archived: 2 } as const;

export function SettingsScreen() {
  const plans = useLive(() => db.plans.toArray(), []);
  const meta = useLive(() => db.meta.get('meta'), []);
  const sorted = [...(plans ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.json.metadata.name.localeCompare(b.json.metadata.name));

  const settings = useLive(getSettings, []) ?? DEFAULT_SETTINGS;
  const save = (patch: Partial<AppSettings>) => void db.settings.put({ ...settings, ...patch });

  return (
    <main class="screen has-tabs">
      <TopBar title="Settings" />

      <Section title="Workout">
        <Card class="flush">
          <Toggle label="Rest timer" detail="Starts after each logged set" checked={settings.restTimerEnabled} onChange={(v) => save({ restTimerEnabled: v })} />
          <Toggle
            label="Sound when rest ends"
            detail="Tries to play even with the ringer off. The timer always turns lime."
            checked={settings.sound}
            onChange={(v) => {
              if (v) unlockAudio();
              save({ sound: v });
              if (v) setTimeout(playRestDone, 150);
            }}
          />
          <Toggle label="Keep screen on" detail="During a workout" checked={settings.keepAwake} onChange={(v) => save({ keepAwake: v })} />
          <div class="row">
            <span class="row-main">
              <span class="row-title">Weight unit</span>
            </span>
            <div class="seg" style={{ width: '128px' }} role="group" aria-label="Weight unit">
              <button type="button" aria-pressed={settings.weightUnit === 'kg'} onClick={() => save({ weightUnit: 'kg' })}>
                kg
              </button>
              <button type="button" aria-pressed={settings.weightUnit === 'lb'} onClick={() => save({ weightUnit: 'lb' })}>
                lb
              </button>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Plans">
        <Card class="flush">
          {sorted.map((p) => (
            <Row
              key={p.id}
              title={p.json.metadata.name}
              detail={`rev ${p.revision}`}
              trailing={p.status !== 'inactive' ? <Tag tone={p.status === 'active' ? 'acc' : 'mut'}>{p.status}</Tag> : undefined}
              chevron
              onClick={() => navigate({ name: 'plan', id: p.id })}
            />
          ))}
          <Row title="Import plan" detail="From Files or iCloud Drive" chevron onClick={() => void chooseFileAndPreview()} />
        </Card>
      </Section>

      <Section title="Example plans">
        <Card class="flush">
          {EXAMPLES.map((ex) => (
            <Row key={ex.file} title={ex.name} detail={ex.detail} chevron onClick={() => void previewExample(ex.file)} />
          ))}
        </Card>
      </Section>

      <Section title="About">
        <Card class="flush">
          <Row title="Version" trailing={<span class="num">{__APP_VERSION__}</span>} />
          <Row title="Plan format" trailing={<span class="num">{SCHEMA_VERSION}</span>} />
          <Row
            title="Persistent storage"
            detail={
              meta?.persistGranted
                ? 'iOS will not clear data on its own. Deleting the app still removes it.'
                : 'iOS may clear data when storage runs low. Keep a backup.'
            }
            trailing={meta?.persistGranted ? <Tag tone="lime">granted</Tag> : <Tag>not granted</Tag>}
          />
          <Row title="Device check" detail="Test what this iPhone supports" chevron onClick={() => navigate({ name: 'device-check' })} />
        </Card>
      </Section>
    </main>
  );
}
