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
          <Toggle
            label="Countdown rest timer"
            detail={settings.restCountdown ? 'Counts down the plan’s rest after each set' : 'Off: shows time since your last set'}
            checked={!!settings.restCountdown}
            onChange={(v) => save({ restCountdown: v })}
          />
          {settings.restCountdown && (
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
          )}
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
          <Row title="Plan generator" detail="Make or change a plan with ChatGPT or Claude" chevron onClick={() => navigate({ name: 'generator' })} />
        </Card>
      </Section>

      <Section title="You">
        <Card class="flush">
          <Row title="Profile" detail="Height, starting weight, goal" chevron onClick={() => navigate({ name: 'profile' })} />
          {sorted.some((p) => p.status === 'active' && p.json.habits?.length) && (
            <Row title="Habits" detail="Turn on or off, adjust targets" chevron onClick={() => navigate({ name: 'habits' })} />
          )}
          <Row
            title="Backup & export"
            detail={meta?.lastBackupAt ? `Last backup ${new Date(meta.lastBackupAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'No backup yet'}
            chevron
            onClick={() => navigate({ name: 'data' })}
          />
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
          <Row title="Device check" detail="Test what this iPhone supports" chevron onClick={() => navigate({ name: 'device-check' })} />
        </Card>
      </Section>
    </main>
  );
}
