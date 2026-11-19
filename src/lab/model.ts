import type { IconName } from '../engine/icons';
import type { NodeKind, Tone } from '../types';

/**
 * Design Lab model: a design is a set of components and directed links, plus the
 * traffic hitting it. Component specs are deliberately round numbers — the point is
 * the shape of the behaviour, not a benchmark.
 */

export type CompType = 'client' | 'cdn' | 'lb' | 'app' | 'cache' | 'queue' | 'worker' | 'db' | 'replica';

export interface CompSpec {
  type: CompType;
  name: string;
  short: string;
  icon: IconName;
  tone: Tone;
  kind: NodeKind;
  /** layout column; every allowed link goes to a higher column, so designs can't cycle */
  column: number;
  /** capacity per instance, in operations per second */
  cap: number;
  /** service time at low load, ms */
  baseMs: number;
  /** $ per instance per month */
  cost: number;
  maxCount: number;
  /** read hit ratio for caching tiers */
  hit?: number;
  blurb: string;
  targets: CompType[];
}

/** Writes cost the database this many read-equivalents (index updates, WAL, fsync). */
export const DB_WRITE_COST = 2;

export const SPECS: Record<CompType, CompSpec> = {
  client: { type: 'client', name: 'Users', short: 'Users', icon: 'users', tone: 'green', kind: 'crowd', column: 0, cap: Infinity, baseMs: 0, cost: 0, maxCount: 1, blurb: 'Where traffic comes from.', targets: ['cdn', 'lb', 'app'] },
  cdn: { type: 'cdn', name: 'CDN', short: 'CDN', icon: 'globe', tone: 'teal', kind: 'block', column: 1, cap: 10_000_000, baseMs: 15, cost: 300, maxCount: 1, hit: 0.6, blurb: 'Serves ~60% of reads (static, cacheable) from the edge. Writes pass through.', targets: ['lb', 'app'] },
  lb: { type: 'lb', name: 'Load balancer', short: 'LB', icon: 'route', tone: 'orange', kind: 'block', column: 2, cap: 50_000, baseMs: 1, cost: 30, maxCount: 2, blurb: 'Spreads requests over every healthy app instance. One instance is a single point of failure.', targets: ['app'] },
  app: { type: 'app', name: 'App servers', short: 'App', icon: 'server', tone: 'blue', kind: 'block', column: 3, cap: 800, baseMs: 25, cost: 70, maxCount: 30, blurb: '800 req/s per instance. More than one instance needs a load balancer in front.', targets: ['cache', 'queue', 'db', 'replica'] },
  cache: { type: 'cache', name: 'Cache', short: 'Cache', icon: 'bolt', tone: 'green', kind: 'block', column: 4, cap: 50_000, baseMs: 1, cost: 120, maxCount: 3, hit: 0.9, blurb: 'Answers 90% of reads from memory; misses go to the database or replicas behind it.', targets: ['db', 'replica'] },
  queue: { type: 'queue', name: 'Queue', short: 'Queue', icon: 'queue', tone: 'yellow', kind: 'block', column: 4, cap: 100_000, baseMs: 3, cost: 60, maxCount: 1, blurb: 'Acknowledges writes in ~3 ms and lets workers apply them asynchronously.', targets: ['worker'] },
  worker: { type: 'worker', name: 'Workers', short: 'Workers', icon: 'cpu', tone: 'purple', kind: 'block', column: 5, cap: 500, baseMs: 30, cost: 50, maxCount: 30, blurb: '500 jobs/s per instance. If the queue fills faster than they drain, a backlog grows.', targets: ['db'] },
  db: { type: 'db', name: 'Database', short: 'DB', icon: 'db', tone: 'purple', kind: 'db', column: 6, cap: 5_000, baseMs: 8, cost: 500, maxCount: 1, blurb: '5,000 ops/s; a write costs 2 ops. Add a hot standby to survive its failure.', targets: [] },
  replica: { type: 'replica', name: 'Read replicas', short: 'Replica', icon: 'db', tone: 'grey', kind: 'db', column: 6, cap: 5_000, baseMs: 8, cost: 400, maxCount: 5, blurb: '5,000 reads/s per replica. Can’t take writes.', targets: [] },
};

export const PALETTE: CompType[] = ['cdn', 'lb', 'app', 'cache', 'queue', 'worker', 'db', 'replica'];

export interface LabNode {
  id: string;
  type: CompType;
  count: number;
  /** databases only: a synchronous hot standby that takes over on failure */
  standby?: boolean;
}

export interface LabEdge {
  from: string;
  to: string;
}

export interface Traffic {
  rps: number;
  /** 0–100 */
  readPct: number;
}

export interface Design {
  nodes: LabNode[];
  edges: LabEdge[];
  traffic: Traffic;
}

export const canLink = (from: CompType, to: CompType): boolean => SPECS[from].targets.includes(to);

export function nodeCost(n: LabNode): number {
  const s = SPECS[n.type];
  return s.cost * n.count + (n.type === 'db' && n.standby ? s.cost : 0);
}

let seq = 0;
export function newId(type: CompType, existing: LabNode[]): string {
  let id: string;
  do id = `${type}${++seq}`;
  while (existing.some((n) => n.id === id));
  return id;
}

export const cloneDesign = (d: Design): Design => JSON.parse(JSON.stringify(d)) as Design;

/** Compact, URL-safe encoding for share links. */
export function encodeDesign(d: Design): string {
  const compact = {
    n: d.nodes.map((x) => [x.id, x.type, x.count, x.standby ? 1 : 0]),
    e: d.edges.map((x) => [x.from, x.to]),
    t: [d.traffic.rps, d.traffic.readPct],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDesign(code: string): Design | null {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const c = JSON.parse(json) as { n: [string, CompType, number, number][]; e: [string, string][]; t: [number, number] };
    const nodes = c.n
      .filter(([, type]) => type in SPECS)
      .map(([id, type, count, sb]) => ({ id: String(id), type, count: clampCount(type, Number(count)), standby: type === 'db' && !!sb }));
    const ids = new Set(nodes.map((n) => n.id));
    const typeOf = new Map(nodes.map((n) => [n.id, n.type] as const));
    const edges = c.e
      .filter(([a, b]) => ids.has(a) && ids.has(b) && canLink(typeOf.get(a)!, typeOf.get(b)!))
      .map(([from, to]) => ({ from, to }));
    return { nodes, edges, traffic: { rps: clampRps(Number(c.t[0])), readPct: Math.max(0, Math.min(100, Number(c.t[1]) || 0)) } };
  } catch {
    return null;
  }
}

export const clampCount = (type: CompType, n: number): number => Math.max(1, Math.min(SPECS[type].maxCount, Math.round(n) || 1));
export const clampRps = (n: number): number => Math.max(10, Math.min(100_000, Math.round(n) || 10));
