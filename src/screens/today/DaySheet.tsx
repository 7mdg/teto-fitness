import { useEffect, useState } from 'preact/hooks';
import type { PlanRecord, ScheduleOverrideRecord } from '../../db/db';
import { moveOccurrence, restoreOccurrence, skipOccurrence } from '../../features/plans/repository';
import { formatLong } from '../../features/schedule/dates';
import type { Occurrence } from '../../features/schedule/occurrences';
import { Button, Dialog, Tag } from '../../ui/components';

interface Props {
  record: PlanRecord;
  date: string | null;
  week: Occurrence[];
  overrides: ScheduleOverrideRecord[];
  doneKeys: Set<string>;
  onClose: () => void;
}

/** Tap a day in the week strip: move or skip its sessions, or restore one you changed. */
export function DaySheet({ record, date, week, overrides, doneKeys, onClose }: Props) {
  const [moving, setMoving] = useState<Occurrence | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  useEffect(() => setMoving(null), [date]);

  if (!date) return <Dialog open={false} title="" onClose={onClose} actions={null} />;
  const name = (id: string) => record.json.workouts.find((w) => w.id === id)?.name ?? id;
  const sessions = week.filter((o) => o.date === date);
  const skipped = overrides.filter((o) => o.action === 'skip' && o.occurrenceKey.endsWith(`@${date}`));
  const entryName = (key: string) => {
    const entry = record.json.schedule.entries.find((e) => e.id === key.split('@')[0]);
    return entry ? name(entry.workoutId) : key;
  };

  if (moving) {
    return (
      <Dialog
        open
        title={`Move ${name(moving.workoutId)}`}
        onClose={onClose}
        actions={
          <>
            <Button
              variant="primary"
              full
              disabled={!newDate || !newTime}
              onClick={async () => {
                await moveOccurrence(record.id, moving.key, newDate, newTime);
                onClose();
              }}
            >
              Move
            </Button>
            <Button variant="ghost" full onClick={() => setMoving(null)}>
              Back
            </Button>
          </>
        }
      >
        <div class="field">
          <label for="mv-date">Date</label>
          <input id="mv-date" class="input num" type="date" value={newDate} onInput={(e) => setNewDate((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field">
          <label for="mv-time">Time</label>
          <input id="mv-time" class="input num" type="time" value={newTime} onInput={(e) => setNewTime((e.target as HTMLInputElement).value)} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title={formatLong(date).replace(/ \d{4}$/, '')}
      onClose={onClose}
      actions={
        <Button variant="ghost" full onClick={onClose}>
          Close
        </Button>
      }
    >
      {sessions.length === 0 && skipped.length === 0 && <p>Rest day. Nothing scheduled.</p>}
      {sessions.map((o) => (
        <div class="day-session" key={o.key}>
          <div class="inline">
            <b style={{ color: 'var(--ink)' }}>{name(o.workoutId)}</b>
            <span class="num">{o.time}</span>
            {o.moved && <Tag tone="acc">moved</Tag>}
            {doneKeys.has(o.key) && <Tag tone="lime">done</Tag>}
          </div>
          {!doneKeys.has(o.key) && (
            <div class="inline">
              <Button
                onClick={() => {
                  setNewDate(o.date);
                  setNewTime(o.time);
                  setMoving(o);
                }}
              >
                Move
              </Button>
              <Button
                onClick={async () => {
                  await skipOccurrence(record.id, o.key);
                  onClose();
                }}
              >
                Skip
              </Button>
              {o.moved && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await restoreOccurrence(record.id, o.key);
                    onClose();
                  }}
                >
                  Restore
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      {skipped.map((s) => (
        <div class="day-session" key={s.id}>
          <div class="inline">
            <span style={{ textDecoration: 'line-through' }}>{entryName(s.occurrenceKey)}</span>
            <Tag>skipped</Tag>
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              await restoreOccurrence(record.id, s.occurrenceKey);
              onClose();
            }}
          >
            Restore
          </Button>
        </div>
      ))}
    </Dialog>
  );
}
