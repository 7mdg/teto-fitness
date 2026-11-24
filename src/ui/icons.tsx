// 1.8px stroke icons (SPEC §4). Decorative unless a label is given.
import type { JSX } from 'preact';

const paths = {
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  plusSquare: 'M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, label, ...rest }: { name: IconName; size?: number; label?: string } & JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width={1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** The TETO moustache mark. */
export function Mark({ width = 120 }: { width?: number }) {
  return (
    <svg viewBox="30 222 552 164" width={width} height={(width * 164) / 552} aria-hidden="true">
      <defs>
        <linearGradient id="teto-mark" x1="306" y1="238" x2="306" y2="376" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#F2F6F5" />
          <stop offset="1" stop-color="#7FD6CB" />
        </linearGradient>
      </defs>
      <path
        fill="url(#teto-mark)"
        d="M306 262 C330 237 369 230 403 246 C436 264 465 292 493 301 C512 307 531 300 534 283 C540 260 516 248 495 263 C504 235 534 240 552 258 C576 282 574 315 553 336 C520 370 462 380 412 370 C370 363 335 346 306 323 C277 346 242 363 200 370 C150 380 92 370 59 336 C38 315 36 282 60 258 C78 240 108 235 117 263 C96 248 72 260 78 283 C81 300 100 307 119 301 C147 292 176 264 209 246 C243 230 282 237 306 262 Z"
      />
    </svg>
  );
}
