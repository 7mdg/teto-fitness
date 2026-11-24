import { useEffect, useRef, useState } from 'preact/hooks';

/** Current time, refreshed every `ms` and whenever the app becomes visible again. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    const onVis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms]);
  return now;
}

/** Keeps the screen on while `enabled`; re-acquires after returning to the app (iOS 18.4+). */
export function useWakeLock(enabled: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (lock.current && !lock.current.released)) return;
      try {
        lock.current = await navigator.wakeLock.request('screen');
      } catch {
        /* denied or unsupported: the app still works */
      }
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock.current?.release().catch(() => undefined);
      lock.current = null;
    };
  }, [enabled]);
}

let audio: AudioContext | null = null;
/** Must be called from a tap once, so iOS allows later sounds. */
export function unlockAudio() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback'; // plays through the silent switch where supported
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no audio */
  }
}

export function playRestDone() {
  if (!audio) return;
  const t = audio.currentTime;
  [880, 880, 1320].forEach((f, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.18);
    o.connect(g).connect(audio!.destination);
    o.start(t + i * 0.22);
    o.stop(t + i * 0.22 + 0.2);
  });
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
