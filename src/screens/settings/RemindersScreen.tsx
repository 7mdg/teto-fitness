import { useState } from 'preact/hooks';
import { back, showToast } from '../../app/router';
import { db } from '../../db/db';
import { useLive } from '../../db/live';
import { calendarAvailable, createFeed, currentIcs, pushFeed, removeFeed, resetFeed, webcalUrl } from '../../features/calendar/sync';
import { shareFile } from '../../utils/files';
import { Button, Card, Dialog, Section, Toggle, TopBar } from '../../ui/components';
import { Icon } from '../../ui/icons';

export function offsetLabel(min: number): string {
  if (min === 0) return 'At start time';
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'} before`;
  if (min % 60 === 0) return `${min / 60} h before`;
  if (min > 60) return `${Math.floor(min / 60)} h ${min % 60} min before`;
  return `${min} min before`;
}

/** Workout reminders via a subscribed calendar (SPEC §9). The app works fully without it. */
export function RemindersScreen() {
  const link = useLive(() => db.calendarLink.get('feed'), []);
  const prefs = useLive(() => db.reminderPrefs.get('workout'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'reset' | 'remove' | 'file'>(null);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'min' | 'h' | 'd'>('h');
  const offsets = [...(prefs?.offsets ?? [])].sort((a, b) => b.minutes - a.minutes);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'You are offline. Try again when you have a connection.');
    } finally {
      setBusy(false);
    }
  }

  async function saveOffsets(next: { minutes: number; enabled: boolean }[]) {
    await db.reminderPrefs.put({ key: 'workout', offsets: next, editedByUser: true });
  }

  function addCustom() {
    const n = Number(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    const minutes = Math.round(unit === 'min' ? n : unit === 'h' ? n * 60 : n * 1440);
    if (minutes > 20160 || offsets.some((o) => o.minutes === minutes)) return;
    void saveOffsets([...offsets, { minutes, enabled: true }]);
    setAmount('');
  }

  const subscribe = (id: string) => {
    window.location.href = webcalUrl(id);
  };

  return (
    <main class="screen">
      <TopBar title="Reminders" onBack={back} />

      <Section title="Calendar">
        <Card class="stack">
          {!calendarAvailable() ? (
            <p class="small">Calendar sync is not configured for this app build.</p>
          ) : link ? (
            <>
              <div class="inline">
                <Icon name="calendar" size={18} style={{ color: 'var(--lime)' }} />
                <span>Calendar link active</span>
              </div>
              <p class="small muted">
                Workouts, moves and skips update by themselves.
                {link.lastPushedAt ? ` Last update ${new Date(link.lastPushedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}
              </p>
              <Button full onClick={() => subscribe(link.id)}>
                Subscribe again on this phone
              </Button>
              <Button variant="ghost" full disabled={busy} onClick={() => void run(() => pushFeed(db, true).then(() => showToast('Calendar updated')))}>
                Update now
              </Button>
            </>
          ) : (
            <>
              <p class="small">
                Adds your workouts to Apple Calendar with alerts. The calendar keeps itself up to date when your plan or schedule changes, with nothing to delete by hand.
              </p>
              <Button
                variant="primary"
                full
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const id = await createFeed();
                    subscribe(id);
                  })
                }
              >
                Add to Calendar
              </Button>
            </>
          )}
          {error && <p class="small" style={{ color: 'var(--danger)' }}>{error}</p>}
        </Card>
        <p class="muted small">When iOS asks, tap Subscribe. In the next screen make sure <b>Remove Alerts</b> is off, or the alerts won't ring.</p>
      </Section>

      <Section title="Alerts">
        <Card class="flush">
          {offsets.map((o) => (
            <div class="offset-row" key={o.minutes}>
              <Toggle label={offsetLabel(o.minutes)} checked={o.enabled} onChange={(v) => void saveOffsets(offsets.map((x) => (x.minutes === o.minutes ? { ...x, enabled: v } : x)))} />
              <button type="button" class="icon-btn remove-offset" aria-label={`Remove ${offsetLabel(o.minutes)}`} onClick={() => void saveOffsets(offsets.filter((x) => x.minutes !== o.minutes))}>
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
          <div class="row add-offset">
            <input class="input num" inputMode="decimal" placeholder="0" aria-label="Amount" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
            <div class="seg" role="group" aria-label="Unit">
              {(['min', 'h', 'd'] as const).map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {u === 'd' ? 'days' : u}
                </button>
              ))}
            </div>
            <Button variant="primary" disabled={!amount} onClick={addCustom}>
              Add
            </Button>
          </div>
        </Card>
        <p class="muted small">Your alert choices are kept when you import a plan update.</p>
      </Section>

      <Section title="More">
        <Card class="flush">
          <button type="button" class="row" onClick={() => setDialog('file')}>
            <span class="row-main">
              <span class="row-title">Export calendar file</span>
              <span class="row-detail">One-time copy; doesn't update</span>
            </span>
            <Icon name="chevron" size={18} class="row-chevron" />
          </button>
          {link && (
            <>
              <button type="button" class="row" onClick={() => setDialog('reset')}>
                <span class="row-main">
                  <span class="row-title">Reset link</span>
                  <span class="row-detail">If you shared the link by accident</span>
                </span>
                <Icon name="chevron" size={18} class="row-chevron" />
              </button>
              <button type="button" class="row" onClick={() => setDialog('remove')}>
                <span class="row-main">
                  <span class="row-title" style={{ color: 'var(--danger)' }}>Remove calendar</span>
                </span>
              </button>
            </>
          )}
        </Card>
      </Section>

      <Dialog
        open={dialog === 'file'}
        title="Export calendar file"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button
              variant="primary"
              full
              onClick={async () => {
                setDialog(null);
                await shareFile('teto-workouts.ics', 'text/calendar', await currentIcs());
              }}
            >
              Export
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p>Choose Save to Files, then open the file in Files to add it to Calendar. This copy won't change when your plan does; the calendar link above does.</p>
      </Dialog>
      <Dialog
        open={dialog === 'reset'}
        title="Reset calendar link?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button
              variant="primary"
              full
              onClick={() => {
                setDialog(null);
                void run(async () => subscribe(await resetFeed()));
              }}
            >
              Reset and subscribe
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p>The old link stops working and its events disappear on the next refresh. Afterwards, delete the old "TETO Fitness" subscription in Settings → Calendar → Accounts.</p>
      </Dialog>
      <Dialog
        open={dialog === 'remove'}
        title="Remove calendar?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button
              variant="danger"
              full
              onClick={() => {
                setDialog(null);
                void run(async () => {
                  await removeFeed();
                  showToast('Calendar removed');
                });
              }}
            >
              Remove
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p>Events disappear from your calendar on its next refresh. You can also delete the subscription in Settings → Calendar → Accounts.</p>
      </Dialog>
    </main>
  );
}
