// Minimal RFC 5545 writer. Pure functions, no dependencies.

export interface IcsAlarm {
  /** Minutes before the event start. 0 = at start. */
  minutesBefore: number;
}

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  /** Local wall-clock start in the calendar timezone, e.g. "2026-11-30T20:00". Ignored if startUtc is set. */
  startLocal?: string;
  /** Absolute start instant (used for one-off test events). */
  startUtc?: Date;
  durationMinutes: number;
  /** e.g. "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270221T225959Z" */
  rrule?: string;
  /** Local dates (YYYY-MM-DD) to exclude from the series, at the same time as startLocal. */
  exdatesLocal?: string[];
  alarms?: IcsAlarm[];
  /** Increase whenever the event changes. */
  sequence?: number;
}

export interface IcsCalendar {
  name: string;
  /** Europe/Brussels gets a full VTIMEZONE; any other zone falls back to floating local times. */
  timezone: string;
  events: IcsEvent[];
  /** Used for DTSTAMP; injectable for tests. */
  now?: Date;
}

const VTIMEZONE_BRUSSELS = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Brussels',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line to max 75 octets (UTF-8), continuation lines start with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (curLen + len > limit) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** "2026-11-30T20:00" -> "20261130T200000" */
export function formatLocal(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Invalid local date-time: ${local}`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`;
}

function durationValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`;
}

function alarmTrigger(minutesBefore: number): string {
  if (minutesBefore === 0) return 'PT0M';
  const d = Math.floor(minutesBefore / 1440);
  const rest = minutesBefore % 1440;
  const h = Math.floor(rest / 60);
  const m = rest % 60;
  let v = '-P';
  if (d) v += `${d}D`;
  if (h || m) v += 'T' + (h ? `${h}H` : '') + (m ? `${m}M` : '');
  return v;
}

export function buildIcs(cal: IcsCalendar): string {
  const stamp = formatUtc(cal.now ?? new Date());
  const zoned = cal.timezone === 'Europe/Brussels';
  const tzParam = zoned ? `;TZID=${cal.timezone}` : '';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TETO//TETO Fitness//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    `X-WR-TIMEZONE:${cal.timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...(zoned ? VTIMEZONE_BRUSSELS : []),
  ];

  for (const ev of cal.events) {
    lines.push('BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${stamp}`, `SEQUENCE:${ev.sequence ?? 0}`);
    if (ev.startUtc) {
      lines.push(`DTSTART:${formatUtc(ev.startUtc)}`);
    } else if (ev.startLocal) {
      lines.push(`DTSTART${tzParam}:${formatLocal(ev.startLocal)}`);
    } else {
      throw new Error(`Event ${ev.uid} has no start`);
    }
    lines.push(`DURATION:${durationValue(ev.durationMinutes)}`);
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
    if (ev.exdatesLocal?.length && ev.startLocal) {
      const time = ev.startLocal.slice(10); // "T20:00"
      const values = ev.exdatesLocal.map((d) => formatLocal(d + time)).join(',');
      lines.push(`EXDATE${tzParam}:${values}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    for (const a of ev.alarms ?? []) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(ev.title)}`,
        `TRIGGER:${alarmTrigger(a.minutesBefore)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
