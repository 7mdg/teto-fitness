import { useEffect, useRef } from 'preact/hooks';
import type { SessionRecord } from '../../db/db';
import { adjustRest, setRest } from '../../features/training/session';
import { formatClock, playRestDone } from '../../ui/hooks';

/** Sticky rest timer. Signals visually first (the ringer is usually off); sound is optional. */
export function RestBar({ session, now, sound }: { session: SessionRecord; now: number; sound: boolean }) {
  const playedFor = useRef<number | undefined>(undefined);
  const end = session.restEndsAt;
  const remaining = end ? (end - now) / 1000 : undefined;

  useEffect(() => {
    if (end === undefined || remaining === undefined) return;
    if (remaining <= 0 && playedFor.current !== end) {
      playedFor.current = end;
      if (sound && remaining > -5) playRestDone();
    }
    if (remaining < -30) void setRest(session.id, null);
  }, [end, remaining, sound, session.id]);

  if (end === undefined || remaining === undefined) return null;
  const done = remaining <= 0;
  const total = session.restTotalSec || 1;
  const pct = done ? 100 : Math.min(100, Math.max(0, 100 - (remaining / total) * 100));

  return (
    <div class={`restbar ${done ? 'done' : ''}`} role="timer" aria-live={done ? 'assertive' : 'off'}>
      <div class="restbar-inner">
        <div class="rest-progress" style={{ width: `${pct}%` }} />
        <div class="rest-main">
          <span class="rest-label">{done ? 'Rest done' : 'Rest'}</span>
          <span class="rest-time num">{done ? 'Go' : formatClock(remaining)}</span>
        </div>
        {done ? (
          <button type="button" class="rest-btn" onClick={() => void setRest(session.id, null)}>
            Dismiss
          </button>
        ) : (
          <div class="rest-btns">
            <button type="button" class="rest-btn num" aria-label="15 seconds less" onClick={() => void adjustRest(session.id, -15)}>
              −15
            </button>
            <button type="button" class="rest-btn num" aria-label="15 seconds more" onClick={() => void adjustRest(session.id, 15)}>
              +15
            </button>
            <button type="button" class="rest-btn" onClick={() => void setRest(session.id, null)}>
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
