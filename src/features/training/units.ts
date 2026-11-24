// Weights are stored in kg; conversion happens only for display and input (SPEC §5).
export type WeightUnit = 'kg' | 'lb';
const LB = 2.2046226218;

/** Accepts "22,5" and "22.5". Returns undefined for empty or invalid input. */
export function parseDecimal(input: string): number | undefined {
  const s = input.trim().replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const toDisplay = (kg: number, unit: WeightUnit) => (unit === 'kg' ? kg : kg * LB);
export const fromDisplay = (v: number, unit: WeightUnit) => (unit === 'kg' ? v : v / LB);

/** Rounds away float noise: 2 decimals for kg, 1 for lb. */
export function roundWeight(v: number, unit: WeightUnit): number {
  const f = unit === 'kg' ? 100 : 10;
  return Math.round(v * f) / f;
}

export function formatWeight(kg: number | undefined, unit: WeightUnit): string {
  if (kg === undefined) return '';
  const v = roundWeight(toDisplay(kg, unit), unit);
  return String(v);
}

/** Increment in the display unit: kg as given; lb rounded to a sensible plate step. */
export function displayIncrement(incKg: number, unit: WeightUnit): number {
  if (unit === 'kg') return incKg;
  const lb = incKg * LB;
  return lb >= 4 ? Math.round(lb / 2.5) * 2.5 : Math.max(1, Math.round(lb));
}
