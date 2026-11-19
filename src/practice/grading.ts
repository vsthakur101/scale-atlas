import type { Drill, Grade } from './types';

/**
 * Parse a human-typed number: "4,096,000", "4.1M", "2k", "1e6", "18%", "600 GB".
 * Returns NaN when nothing numeric is present.
 */
export function parseNumber(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/[,_\s]/g, '');
  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([kmbt])?/);
  if (!m) return NaN;
  const base = Number(m[1]);
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2] as 'k' | 'm' | 'b' | 't'] ?? 1;
  return base * mult;
}

/** Ratio grading: estimation is about the order of magnitude, not the digits. */
export function gradeEstimate(guess: number, answer: number): Grade {
  if (!Number.isFinite(guess) || guess <= 0) return 'wrong';
  const ratio = Math.max(guess / answer, answer / guess);
  if (ratio <= 2) return 'right';
  if (ratio <= 10) return 'close';
  return 'wrong';
}

export const SCORE: Record<Grade, number> = { right: 1, close: 0.5, wrong: 0 };

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e4) return Math.round(n).toLocaleString('en-US');
  return Number(n.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Stable shuffle so an option's letter doesn't change between visits. */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = items.map((v, i) => ({ v, k: Math.imul(h ^ (i + 1) * 2654435761, 2246822519) >>> 0 }));
  out.sort((a, b) => a.k - b.k);
  return out.map((x) => x.v);
}

export function drillKindLabel(d: Drill): string {
  return d.kind === 'spot' ? 'Spot it' : d.kind === 'choice' ? 'Choose' : 'Estimate';
}
