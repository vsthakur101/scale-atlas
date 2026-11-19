import type { CalcId } from './types';

/** A live calculator: numeric inputs in, labelled results out. */
export interface Calc {
  title: string;
  inputs: { key: string; label: string; value: number; unit?: string; step?: number; min?: number }[];
  /** extra free-text input, e.g. a list of availabilities */
  text?: { key: string; label: string; value: string };
  compute: (v: Record<string, number>, text: string) => { label: string; value: string; strong?: boolean }[];
}

const num = (n: number, digits = 2): string => {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (a >= 100) return Math.round(n).toLocaleString('en-US');
  return Number(n.toFixed(digits)).toString();
};

const duration = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 120) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  if (seconds < 7200) return `${(seconds / 60).toFixed(seconds < 600 ? 1 : 0)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
};

const bytes = (b: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let i = 0;
  let v = b;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

const YEAR = 365 * 86400;

export const CALCS: Record<CalcId, Calc> = {
  'per-second': {
    title: 'Per day → per second',
    inputs: [
      { key: 'daily', label: 'Events per day', value: 50_000_000 },
      { key: 'peak', label: 'Peak factor', value: 3, unit: '×', step: 0.5, min: 1 },
    ],
    compute: ({ daily = 0, peak = 1 }) => [
      { label: 'Average', value: `${num(daily / 86400)} /s`, strong: true },
      { label: 'Peak', value: `${num((daily / 86400) * peak)} /s` },
      { label: 'Per month', value: num(daily * 30) },
    ],
  },
  nines: {
    title: 'Availability → downtime',
    inputs: [{ key: 'pct', label: 'Availability', value: 99.9, unit: '%', step: 0.01, min: 0 }],
    compute: ({ pct = 0 }) => {
      const down = Math.max(0, 1 - pct / 100);
      return [
        { label: 'Per year', value: duration(down * YEAR), strong: true },
        { label: 'Per month', value: duration((down * YEAR) / 12) },
        { label: 'Per week', value: duration(down * 7 * 86400) },
        { label: 'Per day', value: duration(down * 86400) },
      ];
    },
  },
  littles: {
    title: 'Little’s Law: in flight',
    inputs: [
      { key: 'rate', label: 'Arrival rate', value: 2000, unit: 'req/s' },
      { key: 'ms', label: 'Time in system', value: 50, unit: 'ms' },
    ],
    compute: ({ rate = 0, ms = 0 }) => [
      { label: 'Concurrent requests (L = λW)', value: num((rate * ms) / 1000, 1), strong: true },
      { label: 'Pool size at 70% target', value: num(Math.ceil((rate * ms) / 1000 / 0.7), 0) },
    ],
  },
  fanout: {
    title: 'Fan-out tail amplification',
    inputs: [
      { key: 'n', label: 'Parallel calls', value: 20, step: 1, min: 1 },
      { key: 'p', label: 'Each is slow', value: 1, unit: '%', step: 0.1, min: 0 },
    ],
    compute: ({ n = 1, p = 0 }) => {
      const hit = 1 - Math.pow(1 - p / 100, n);
      return [
        { label: 'Requests that wait on a slow call', value: `${num(hit * 100, 1)}%`, strong: true },
        { label: 'Effective percentile per call to keep that at 1%', value: `p${num(100 * Math.pow(0.99, 1 / n), 3)}` },
      ];
    },
  },
  cache: {
    title: 'Cache effectiveness',
    inputs: [
      { key: 'hit', label: 'Hit rate', value: 95, unit: '%', step: 1, min: 0 },
      { key: 'hitMs', label: 'Hit latency', value: 1, unit: 'ms', step: 0.5, min: 0 },
      { key: 'dbMs', label: 'Backend latency', value: 20, unit: 'ms', step: 1, min: 0 },
      { key: 'rps', label: 'Reads', value: 10_000, unit: '/s' },
    ],
    compute: ({ hit = 0, hitMs = 0, dbMs = 0, rps = 0 }) => {
      const h = Math.min(1, Math.max(0, hit / 100));
      return [
        { label: 'Average read latency', value: `${num(h * hitMs + (1 - h) * (hitMs + dbMs), 2)} ms`, strong: true },
        { label: 'Backend reads', value: `${num(rps * (1 - h))} /s` },
        { label: 'Backend load reduction', value: `${num(h > 0.9999 ? Infinity : 1 / (1 - h), 1)}×` },
      ];
    },
  },
  chain: {
    title: 'Availability of a chain',
    inputs: [{ key: 'copies', label: 'Redundant copies of each', value: 1, step: 1, min: 1 }],
    text: { key: 'list', label: 'Component availabilities (%)', value: '99.99, 99.9, 99.95' },
    compute: ({ copies = 1 }, text) => {
      const parts = text
        .split(/[,\s]+/)
        .map(Number)
        .filter((x) => x > 0 && x <= 100);
      if (!parts.length) return [{ label: 'Overall', value: '—', strong: true }];
      const k = Math.max(1, Math.round(copies));
      const overall = parts.reduce((acc, a) => acc * (1 - Math.pow(1 - a / 100, k)), 1);
      return [
        { label: 'Overall availability', value: `${(overall * 100).toFixed(overall > 0.9999 ? 5 : 3)}%`, strong: true },
        { label: 'Downtime per year', value: duration((1 - overall) * YEAR) },
        { label: 'Components in series', value: String(parts.length) },
      ];
    },
  },
  storage: {
    title: 'Storage growth',
    inputs: [
      { key: 'perDay', label: 'New records per day', value: 2_000_000 },
      { key: 'size', label: 'Bytes per record', value: 2_000_000, unit: 'B' },
      { key: 'rf', label: 'Copies (replication)', value: 3, step: 0.5, min: 1 },
      { key: 'years', label: 'Years', value: 1, step: 1, min: 1 },
    ],
    compute: ({ perDay = 0, size = 0, rf = 1, years = 1 }) => [
      { label: 'Raw per day', value: bytes(perDay * size) },
      { label: 'Raw total', value: bytes(perDay * size * 365 * years) },
      { label: 'With copies', value: bytes(perDay * size * 365 * years * rf), strong: true },
    ],
  },
  bandwidth: {
    title: 'Bandwidth',
    inputs: [
      { key: 'rps', label: 'Responses per second', value: 2_000 },
      { key: 'kb', label: 'Average response', value: 200, unit: 'KB' },
    ],
    compute: ({ rps = 0, kb = 0 }) => {
      const bps = rps * kb * 1000 * 8;
      return [
        { label: 'Egress', value: bps >= 1e9 ? `${(bps / 1e9).toFixed(1)} Gbps` : `${Math.round(bps / 1e6)} Mbps`, strong: true },
        { label: 'Per month', value: bytes((bps / 8) * 30 * 86400) },
      ];
    },
  },
};
