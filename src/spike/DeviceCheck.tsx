// Phase 0 — iPhone capability check. Temporary screen; replaced by the real app in phase 1.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { buildIcs } from '../features/calendar/ics';
import './spike.css';

type Status = 'pass' | 'fail' | 'wait' | 'info';
type Results = Record<string, { status: Status; detail: string }>;

const BASE = import.meta.env.BASE_URL;
const CAL_API = (import.meta.env.VITE_CAL_API ?? '').replace(/\/$/, '');

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const iosVersion = () => {
  const m = /OS (\d+)[_.](\d+)/.exec(navigator.userAgent);
  return m ? `iOS ${m[1]}.${m[2]}` : 'not iOS';
};

// ---------- tiny IndexedDB helper (spike only; real app uses Dexie) ----------
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('teto-fitness-spike', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

// ---------- sound ----------
let audio: AudioContext | null = null;
const unlockAudio = () => {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
};
const beep = () => {
  if (!audio) return;
  const t = audio.currentTime;
  for (const [i, f] of [880, 880, 1320].entries()) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.25);
    g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.25 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 0.2);
    o.connect(g).connect(audio.destination);
    o.start(t + i * 0.25);
    o.stop(t + i * 0.25 + 0.22);
  }
};

// ---------- share / download ----------
async function shareFile(name: string, type: string, text: string): Promise<string> {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared via Share sheet';
    } catch (e) {
      return `share cancelled/failed: ${(e as Error).name}`;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'canShare(files) unavailable — used download fallback';
}

function testEventIcs(minutesFromNow: number, label: string): string {
  const start = new Date(Date.now() + minutesFromNow * 60_000);
  start.setSeconds(0, 0);
  return buildIcs({
    name: 'TETO test',
    timezone: 'Europe/Brussels',
    events: [
      {
        uid: `spike-${label}@teto-fitness`,
        title: `TETO test · ${label}`,
        description: 'Phase 0 test event. Safe to delete.',
        startUtc: start,
        durationMinutes: 30,
        sequence: Math.floor(Date.now() / 1000),
        alarms: [{ minutesBefore: 5 }, { minutesBefore: 2 }, { minutesBefore: 0 }],
      },
    ],
  });
}

// ---------- UI pieces ----------
function Row(props: { title: string; status: Status; detail: string; children?: ComponentChildren; help?: string }) {
  const mark = { pass: '✓', fail: '✕', wait: '…', info: 'i' }[props.status];
  return (
    <section class="row">
      <header>
        <span class={`mark ${props.status}`} aria-label={props.status}>{mark}</span>
        <h2>{props.title}</h2>
      </header>
      <p class="detail">{props.detail}</p>
      {props.help && <p class="help">{props.help}</p>}
      {props.children && <div class="actions">{props.children}</div>}
    </section>
  );
}

export function DeviceCheck() {
  const [r, setR] = useState<Results>({});
  const set = (key: string, status: Status, detail: string) =>
    setR((prev) => ({ ...prev, [key]: { status, detail } }));
  const get = (key: string) => r[key] ?? { status: 'wait' as Status, detail: 'Not run yet' };

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // ---- passive checks on load ----
  useEffect(() => {
    const standalone = isStandalone();
    set('install', standalone ? 'pass' : 'fail', standalone ? 'Running from the Home Screen' : 'Running in a browser tab');

    void (async () => {
      try {
        const prev = (await idb<{ count: number; first: string } | undefined>('readonly', (s) => s.get('opens'))) ?? {
          count: 0,
          first: new Date().toISOString(),
        };
        const next = { count: prev.count + 1, first: prev.first };
        await idb('readwrite', (s) => s.put(next, 'opens'));
        set('idb', next.count > 1 ? 'pass' : 'info', `Opened ${next.count}× since ${new Date(next.first).toLocaleString()}`);
      } catch (e) {
        set('idb', 'fail', `IndexedDB error: ${(e as Error).message}`);
      }
    })();

    void refreshStorage();
    void refreshOffline();
  }, []);

  useEffect(() => {
    if (offlineReady) void refreshOffline();
  }, [offlineReady]);

  async function refreshStorage() {
    if (!navigator.storage?.estimate) return set('storage', 'fail', 'Storage API unavailable');
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    const est = await navigator.storage.estimate();
    const mb = (n?: number) => (n ? `${(n / 1e6).toFixed(1)} MB` : '?');
    set('storage', persisted ? 'pass' : 'info', `Persistent: ${persisted ? 'yes' : 'no'} · used ${mb(est.usage)} of ${mb(est.quota)}`);
  }

  async function refreshOffline() {
    const controlled = !!navigator.serviceWorker?.controller;
    const cacheNames = 'caches' in window ? await caches.keys() : [];
    set(
      'offline',
      controlled && cacheNames.length ? 'pass' : 'info',
      `Service worker ${controlled ? 'active' : 'not controlling yet'} · ${cacheNames.length} cache(s) · ${navigator.onLine ? 'online' : 'offline now'}`,
    );
  }

  // ---- wake lock ----
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const wantWake = useRef(false);
  async function acquireWake() {
    try {
      wakeRef.current = await navigator.wakeLock.request('screen');
      wakeRef.current.addEventListener('release', () => {
        if (wantWake.current) set('wake', 'info', 'Released by the system — will re-acquire when visible');
      });
      set('wake', 'pass', 'Screen wake lock active — leave the phone untouched and check it stays on');
    } catch (e) {
      set('wake', 'fail', `Wake lock failed: ${(e as Error).name} ${(e as Error).message}`);
    }
  }
  async function toggleWake() {
    if (!('wakeLock' in navigator)) return set('wake', 'fail', 'Wake Lock API not available');
    if (wantWake.current) {
      wantWake.current = false;
      await wakeRef.current?.release();
      wakeRef.current = null;
      return set('wake', 'info', 'Released');
    }
    wantWake.current = true;
    await acquireWake();
  }
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && wantWake.current && (!wakeRef.current || wakeRef.current.released)) {
        void acquireWake();
      }
      if (document.visibilityState === 'visible') void refreshTimer();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ---- rest timer (timestamp based) ----
  const [timerEnd, setTimerEnd] = useState<number | null>(() => Number(localStorage.getItem('spike-timer-end')) || null);
  const [now, setNow] = useState(Date.now());
  const beeped = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (timerEnd && now >= timerEnd && !beeped.current) {
      beeped.current = true;
      const late = Math.round((now - timerEnd) / 1000);
      beep();
      set('timer', 'pass', late > 2 ? `Finished (you came back ${late}s after it ended — remaining time stayed correct)` : 'Finished on time — did you hear the beep?');
    }
  }, [now, timerEnd]);
  function startTimer(seconds: number) {
    unlockAudio();
    beeped.current = false;
    const end = Date.now() + seconds * 1000;
    localStorage.setItem('spike-timer-end', String(end));
    setTimerEnd(end);
    set('timer', 'info', `Running ${seconds}s — try locking the phone and coming back`);
  }
  async function refreshTimer() {
    setNow(Date.now());
  }
  const remaining = timerEnd ? Math.max(0, Math.ceil((timerEnd - now) / 1000)) : 0;

  // ---- file import ----
  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const keys = json && typeof json === 'object' ? Object.keys(json).slice(0, 6).join(', ') : typeof json;
      set('import', 'pass', `Read "${file.name}" (${file.size} bytes) · keys: ${keys}`);
    } catch (err) {
      set('import', 'fail', `Could not parse "${file.name}": ${(err as Error).message}`);
    }
  }

  // ---- worker calendar ----
  const [feed, setFeed] = useState<{ id: string; token: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('spike-feed') ?? 'null') as { id: string; token: string } | null;
    } catch {
      return null;
    }
  });
  const feedUrl = feed ? `${CAL_API}/c/${feed.id}.ics` : '';
  async function createFeed() {
    try {
      const res = await fetch(`${CAL_API}/api/feeds`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const f = (await res.json()) as { id: string; writeToken: string };
      const next = { id: f.id, token: f.writeToken };
      localStorage.setItem('spike-feed', JSON.stringify(next));
      setFeed(next);
      await pushFeed(next, 20);
    } catch (e) {
      set('worker', 'fail', `Create failed: ${(e as Error).message}`);
    }
  }
  async function pushFeed(f = feed, minutes = 15) {
    if (!f) return;
    try {
      const res = await fetch(`${CAL_API}/api/feeds/${f.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${f.token}`, 'Content-Type': 'text/calendar' },
        body: testEventIcs(minutes, 'live feed'),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const at = new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      set('worker', 'info', `Feed updated: test event at ${at}, alerts 5 min, 2 min and at start. Watch when Calendar picks it up.`);
    } catch (e) {
      set('worker', 'fail', `Update failed: ${(e as Error).message}`);
    }
  }
  async function revokeFeed() {
    if (!feed) return;
    await fetch(`${CAL_API}/api/feeds/${feed.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${feed.token}` } }).catch(() => undefined);
    localStorage.removeItem('spike-feed');
    setFeed(null);
    set('worker', 'info', 'Link revoked. Check whether the events disappear from Calendar.');
  }

  // ---- report ----
  async function copyReport() {
    const lines = [
      `TETO Fitness device check · v${__APP_VERSION__} · built ${__BUILD_TIME__}`,
      `${iosVersion()} · ${isStandalone() ? 'standalone' : 'browser tab'} · ${new Date().toISOString()}`,
      ...Object.entries(r).map(([k, v]) => `${v.status.toUpperCase().padEnd(4)} ${k}: ${v.detail}`),
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      set('report', 'pass', 'Copied — paste it into the chat');
    } catch {
      set('report', 'info', await shareFile('teto-device-check.txt', 'text/plain', text));
    }
  }

  const staticFeed = `webcal://${location.host}${BASE}spike/test.ics`;

  return (
    <main class="spike">
      <div class="brand">
        <b>T.E.T.O.</b>
        <span>Fitness · device check</span>
      </div>
      <p class="meta num">
        v{__APP_VERSION__} · {iosVersion()} · {isStandalone() ? 'standalone' : 'browser'}
      </p>

      {needRefresh && (
        <div class="banner">
          <span>New version available</span>
          <button class="btn primary" onClick={() => void updateServiceWorker(true)}>Update</button>
        </div>
      )}

      <Row title="1 · Home Screen install" {...get('install')}
        help="In Safari: Share → Add to Home Screen, then open TETO from the icon and run the checks there." />

      <Row title="2 · Offline" {...get('offline')}
        help="After this shows active: turn on Airplane mode, close the app fully, reopen it from the icon.">
        <button class="btn" onClick={() => void refreshOffline()}>Recheck</button>
      </Row>

      <Row title="3 · Data survives reopen" {...get('idb')}
        help="Close the app (swipe it away) and reopen. The counter must go up." />

      <Row title="4 · Persistent storage" {...get('storage')}>
        <button class="btn" onClick={async () => { await navigator.storage?.persist?.(); await refreshStorage(); }}>Request persistence</button>
      </Row>

      <Row title="5 · Keep screen awake" {...get('wake')}
        help="Turn it on, put the phone down for 2+ minutes. Then switch apps and come back: it should re-activate.">
        <button class="btn" onClick={() => void toggleWake()}>{wantWake.current ? 'Release' : 'Keep awake'}</button>
      </Row>

      <Row title="6 · Rest timer + sound" {...get('timer')}
        help="Start 30s, lock the phone, unlock after ~45s: it should show finished. Then run 10s with the app open and listen for the beep (ringer on).">
        <span class="timer num">{timerEnd ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '–:––'}</span>
        <button class="btn" onClick={() => startTimer(10)}>10 s</button>
        <button class="btn" onClick={() => startTimer(30)}>30 s</button>
      </Row>

      <Row title="7 · Import a file" {...get('import')}
        help="Pick any .json file from Files or iCloud Drive (e.g. the one exported in step 8).">
        <label class="btn">
          Choose file
          <input type="file" accept=".json,application/json" onChange={(e) => void onFile(e)} hidden />
        </label>
      </Row>

      <Row title="8 · Export via Share sheet" {...get('share')}
        help="Should open the Share sheet with 'Save to Files'.">
        <button class="btn" onClick={async () => {
          const res = await shareFile('teto-test-backup.json', 'application/json', JSON.stringify({ format: 'teto-backup', test: true, at: new Date().toISOString() }, null, 2));
          set('share', res.startsWith('shared') ? 'pass' : 'info', res);
        }}>Export test file</button>
      </Row>

      <Row title="9 · Calendar subscription (static test feed)" {...get('calStatic')}
        help="Tap Subscribe. In the subscription screen make sure 'Remove Alerts' is OFF. Expect daily 'TETO test · rev 1' events at 12:00 and 21:00 with 3 alerts (30, 10, 5 min) — check how many alerts iOS keeps.">
        <a class="btn primary" href={staticFeed} onClick={() => set('calStatic', 'info', 'Subscribe link opened — report what Calendar showed')}>Subscribe</a>
        <a class="btn" href={`${BASE}spike/test.ics`} target="_blank" rel="noopener">Open in Safari</a>
      </Row>

      <Row title="10 · Calendar file (one-time import fallback)" {...get('calFile')}
        help="Creates an event 10 minutes from now with alerts at 5 min, 2 min and start. Share it to Calendar or save then open.">
        <button class="btn" onClick={async () => set('calFile', 'info', await shareFile('teto-test.ics', 'text/calendar', testEventIcs(10, 'file')))}>Export .ics</button>
      </Row>

      <Row title="11 · Live calendar via Cloudflare" {...(CAL_API ? get('worker') : { status: 'wait' as Status, detail: 'Worker not deployed yet — added after Cloudflare setup' })}
        help={feed ? `Feed: ${feedUrl}` : undefined}>
        {CAL_API && !feed && <button class="btn primary" onClick={() => void createFeed()}>Create test feed</button>}
        {feed && <a class="btn primary" href={feedUrl.replace(/^https?:/, 'webcal:')}>Subscribe</a>}
        {feed && <button class="btn" onClick={() => void pushFeed()}>Move event to +15 min</button>}
        {feed && <button class="btn" onClick={() => void revokeFeed()}>Revoke</button>}
      </Row>

      <div class="report">
        <button class="btn primary wide" onClick={() => void copyReport()}>Copy report</button>
        {r.report && <p class="detail">{r.report.detail}</p>}
      </div>
    </main>
  );
}
