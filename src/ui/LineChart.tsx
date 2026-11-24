// Minimal time-series chart: one value line (optionally a context dot series behind it),
// recessive grid, touch crosshair + tooltip, and a values table for accessibility.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Point } from '../features/progress/stats';
import { formatShort, parseDate } from '../features/schedule/dates';

interface Props {
  /** Main series, drawn as a 2px line with 8px markers. */
  line: Point[];
  lineLabel: string;
  /** Optional context series drawn as muted dots (e.g. daily weigh-ins behind a 7-day average). */
  dots?: Point[];
  dotsLabel?: string;
  unit: string;
  height?: number;
  format?: (v: number) => string;
}

const LINE = '#7FD6CB';
const DOT = '#6E8287';

export function LineChart({ line, lineLabel, dots, dotsLabel, unit, height = 180, format = (v) => String(v) }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = [...line, ...(dots ?? [])];
  if (all.length === 0) return <p class="small muted">No data yet.</p>;

  const pad = { l: 40, r: 12, t: 12, b: 22 };
  const xs = all.map((p) => parseDate(p.x));
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  if (x0 === x1) {
    x0 -= 3 * 86_400_000;
    x1 += 3 * 86_400_000;
  }
  const ys = all.map((p) => p.y);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const span = y1 - y0 || Math.max(1, Math.abs(y1) * 0.05);
  y0 -= span * 0.15;
  y1 += span * 0.15;
  const sx = (d: string) => pad.l + ((parseDate(d) - x0) / (x1 - x0)) * (width - pad.l - pad.r);
  const sy = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (height - pad.t - pad.b);
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  const path = line.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  const pick = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    line.forEach((p, i) => {
      const d = Math.abs(sx(p.x) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(line.length ? best : null);
  };

  const h = hover !== null ? line[hover] : undefined;
  const dotSameDay = h && dots ? dots.find((d) => d.x === h.x) : undefined;
  const tipLeft = h ? Math.min(Math.max(sx(h.x) - 70, 0), width - 140) : 0;

  return (
    <div class="chart">
      {dots && (
        <div class="chart-legend small">
          <span>
            <i style={{ background: DOT }} class="lg-dot" /> {dotsLabel}
          </span>
          <span>
            <i style={{ background: LINE }} class="lg-line" /> {lineLabel}
          </span>
        </div>
      )}
      <div
        ref={wrap}
        class="chart-plot"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={height} role="img" aria-label={`${lineLabel} chart, ${line.length} points`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,.07)" />
              <text x={pad.l - 6} y={sy(t) + 4} text-anchor="end" class="chart-axis">
                {format(Math.round(t * 10) / 10)}
              </text>
            </g>
          ))}
          <text x={pad.l} y={height - 6} class="chart-axis">
            {formatShort(all.reduce((a, b) => (a.x < b.x ? a : b)).x)}
          </text>
          <text x={width - pad.r} y={height - 6} text-anchor="end" class="chart-axis">
            {formatShort(all.reduce((a, b) => (a.x > b.x ? a : b)).x)}
          </text>
          {dots?.map((p) => (
            <circle key={`d${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r={3} fill={DOT} />
          ))}
          {line.length > 1 && <path d={path} fill="none" stroke={LINE} stroke-width={2} stroke-linejoin="round" stroke-linecap="round" />}
          {line.map((p, i) => (
            <circle key={`l${p.x}`} cx={sx(p.x)} cy={sy(p.y)} r={hover === i ? 5.5 : 4} fill={LINE} stroke="#111E25" stroke-width={2} />
          ))}
          {h && <line x1={sx(h.x)} x2={sx(h.x)} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3" />}
        </svg>
        {h && (
          <div class="chart-tip" style={{ left: `${tipLeft}px` }}>
            <span class="muted">{formatShort(h.x)}</span>
            <b class="num">
              {format(h.y)} {unit}
            </b>
            {dotSameDay && dotsLabel && (
              <span class="muted num">
                {dotsLabel}: {format(dotSameDay.y)}
              </span>
            )}
          </div>
        )}
      </div>
      <details class="chart-table">
        <summary class="small muted">Values</summary>
        <table class="small num">
          <tbody>
            {[...line].reverse().map((p) => (
              <tr key={p.x}>
                <td>{formatShort(p.x)}</td>
                <td>
                  {format(p.y)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
