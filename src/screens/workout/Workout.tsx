import { useState } from 'preact/hooks';
import { back, resetTo } from '../../app/router';
import { db, DEFAULT_SETTINGS, getSettings } from '../../db/db';
import { useLive } from '../../db/live';
import { currentExercise, discardSession, finishSession, setRest } from '../../features/training/session';
import { Button, Dialog, TopBar } from '../../ui/components';
import { formatClock, useNow, useWakeLock } from '../../ui/hooks';
import { RestBar } from './RestBar';
import { SlotCard } from './SlotCard';
import { SwapSheet } from './SwapSheet';

const GLOBAL = '_global';

export function WorkoutScreen({ sessionId }: { sessionId: string }) {
  const session = useLive(() => db.sessions.get(sessionId), [sessionId]);
  const sets = useLive(() => db.sets.where('sessionId').equals(sessionId).toArray(), [sessionId]);
  const settings = useLive(getSettings, []) ?? DEFAULT_SETTINGS;
  const prefs = useLive(() => db.overrides.where('planId').equals(GLOBAL).toArray(), []);
  const plan = useLive(() => (session ? db.plans.get(session.planId) : undefined), [session?.planId]);
  const now = useNow(250);
  const [open, setOpen] = useState<number | null | undefined>(undefined);
  const [swapSlot, setSwapSlot] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | 'finish' | 'discard'>(null);
  const [busy, setBusy] = useState(false);

  useWakeLock(settings.keepAwake && session?.status === 'active');

  if (!session || !sets) return <main class="screen" />;
  if (session.status !== 'active') {
    return (
      <main class="screen">
        <TopBar onBack={back} />
        <p class="lead">This workout is already {session.status}.</p>
      </main>
    );
  }

  const p = session.prescription;
  const skipped = new Set(session.skippedSlots ?? []);
  const doneIn = (slot: number) => new Set(sets.filter((s) => s.slot === slot).map((s) => s.setIndex)).size;
  const firstOpen = p.slots.find((s) => !skipped.has(s.slot) && doneIn(s.slot) < s.sets && !s.optional)?.slot ?? null;
  const expanded = open === undefined ? firstOpen : open;
  const pref = (kind: string, exerciseId: string) => prefs?.find((o) => o.kind === kind && o.itemId === exerciseId)?.value;
  const logged = new Set(sets.map((s) => `${s.slot}:${s.setIndex}`)).size;
  const planned = p.slots.filter((s) => !skipped.has(s.slot) && !s.optional).reduce((n, s) => n + s.sets, 0);
  const missing = p.slots.filter((s) => !skipped.has(s.slot) && !s.optional).reduce((n, s) => n + Math.max(0, s.sets - doneIn(s.slot)), 0);
  const progression = plan?.json.preferences?.progressionMethod !== 'none';

  async function onLogged(slot: number, restSec: number) {
    if (settings.restTimerEnabled && restSec > 0) await setRest(session!.id, restSec);
    // Move on when an exercise is complete.
    const sp = p.slots[slot]!;
    if (doneIn(slot) + 1 >= sp.sets) {
      const next = p.slots.find((s) => s.slot > slot && !skipped.has(s.slot) && doneIn(s.slot) < s.sets);
      if (next) setOpen(next.slot);
    }
  }

  async function toggleSides(exerciseId: string, current: boolean) {
    await db.overrides.put({ planId: GLOBAL, kind: 'sideLogging', itemId: exerciseId, value: current ? 'combined' : 'separate' });
  }

  async function finish() {
    setBusy(true);
    await finishSession(session!.id, undefined);
    resetTo({ name: 'summary', sessionId: session!.id });
  }

  const meta = [p.week ? `Week ${p.week}` : '', p.phaseName, `${logged}/${planned} sets`].filter(Boolean).join(' · ');

  return (
    <main class="screen workout-screen">
      <TopBar title={p.workoutName} onBack={back} right={<span class="num muted small">{formatClock((now - Date.parse(session.startedAt)) / 1000)}</span>} />
      <p class="muted small num" style={{ marginTop: '-12px' }}>{meta}</p>

      <div class="stack">
        {p.slots.map((sp) => {
          const exId = currentExercise(session, sp.slot);
          const sidePref = pref('sideLogging', exId);
          const exDef = p.exercises[exId];
          const separate = sidePref ? sidePref === 'separate' : exDef?.sideLogging === 'separate';
          return (
            <SlotCard
              key={sp.slot}
              session={session}
              slot={sp}
              sets={sets.filter((s) => s.slot === sp.slot)}
              unit={settings.weightUnit}
              expanded={expanded === sp.slot}
              progression={progression}
              incrementKg={pref('exerciseIncrement', exId) as number | undefined}
              separateSides={separate}
              onToggle={() => setOpen(expanded === sp.slot ? null : sp.slot)}
              onLogged={(rest) => void onLogged(sp.slot, rest)}
              onSwap={() => setSwapSlot(sp.slot)}
              onToggleSides={() => void toggleSides(exId, separate)}
            />
          );
        })}
      </div>

      <div class="stack" style={{ marginTop: '8px' }}>
        <Button variant="primary" class="big" full onClick={() => setDialog('finish')}>
          Finish workout
        </Button>
        <Button variant="ghost" full onClick={() => setDialog('discard')}>
          Discard workout
        </Button>
      </div>

      <RestBar session={session} now={now} sound={settings.sound} />
      <SwapSheet session={session} slot={swapSlot} unit={settings.weightUnit} onClose={() => setSwapSlot(null)} />

      <Dialog
        open={dialog === 'finish'}
        title="Finish workout?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button variant="primary" full disabled={busy} onClick={() => void finish()}>
              Finish
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Keep going
            </Button>
          </>
        }
      >
        <p>
          {logged} set{logged === 1 ? '' : 's'} logged.
          {missing > 0 ? ` ${missing} planned set${missing === 1 ? ' is' : 's are'} not logged and won't be saved.` : ''}
        </p>
      </Dialog>

      <Dialog
        open={dialog === 'discard'}
        title="Discard this workout?"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button
              variant="danger"
              full
              onClick={async () => {
                await discardSession(session.id);
                resetTo({ name: 'home' });
              }}
            >
              Discard workout
            </Button>
            <Button variant="ghost" full onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p>The {logged} logged set{logged === 1 ? '' : 's'} will be deleted and won't count as history.</p>
      </Dialog>
    </main>
  );
}
