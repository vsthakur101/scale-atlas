import { DB_WRITE_COST, SPECS, nodeCost, type CompType, type Design, type LabNode } from './model';

/**
 * Steady-state traffic model.
 *
 * Requests enter at Users and are pushed through the design in column order (every
 * link points to a higher column, so this is a topological order). Each component
 * serves up to its capacity and drops the excess. Flows carry three kinds of work:
 *   r — synchronous reads, w — synchronous writes, a — asynchronous writes (after a queue).
 * Latency per component follows the queueing hockey stick: base × (1 + 3ρ²/(1−ρ)).
 * User-facing p99 is the slowest path that carries at least 1% of requests.
 */

interface Flow {
  r: number;
  w: number;
  a: number;
}

type Kind = 'r' | 'w' | 'a';

export interface NodeStat {
  /** utilisation 0..∞ */
  rho: number;
  /** effective instances after failures */
  live: number;
  down: boolean;
  in: Flow;
  dropped: number;
  p99: number;
  warnings: string[];
}

export interface EdgeStat {
  r: number;
  w: number;
  a: number;
}

export interface SimResult {
  nodes: Map<string, NodeStat>;
  edges: Map<string, EdgeStat>;
  offered: number;
  served: number;
  errorRate: number;
  p99: number;
  cost: number;
  /** jobs/s the async side falls behind by */
  backlog: number;
  /** share of writes that reach a database (sync or async) */
  persisted: number;
  /** components whose failure fails more than SPOF_THRESHOLD of requests */
  spofs: string[];
}

/** a component is a single point of failure if losing it adds this much error rate, or loses writes */
export const SPOF_THRESHOLD = 0.05;
const PRUNE = 0.002;

export const edgeKey = (from: string, to: string): string => `${from}>${to}`;

const zero = (): Flow => ({ r: 0, w: 0, a: 0 });
const total = (f: Flow): number => f.r + f.w + f.a;

/** Per-instance failure injected by Break mode or SPOF analysis. */
export type Failures = Map<string, 'down' | 'one'>;

function nodeP99(baseMs: number, rho: number): number {
  if (baseMs === 0) return 0;
  if (rho >= 0.97) return Math.min(2000, baseMs * 60);
  return baseMs * (1 + (3 * rho * rho) / (1 - rho));
}

export function simulate(design: Design, failures: Failures = new Map(), analyseSpofs = true): SimResult {
  const byId = new Map(design.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, string[]>();
  for (const e of design.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const order = [...design.nodes].sort((a, b) => SPECS[a.type].column - SPECS[b.type].column);

  const inbound = new Map<string, Flow>(design.nodes.map((n) => [n.id, zero()]));
  const stats = new Map<string, NodeStat>();
  const edges = new Map<string, EdgeStat>();
  // routing shares per node & kind, relative to what the node served
  const routes = new Map<string, Record<Kind, { to: string; share: number }[]>>();

  const reads = (design.traffic.rps * design.traffic.readPct) / 100;
  const writes = design.traffic.rps - reads;
  const clients = design.nodes.filter((n) => n.type === 'client');
  for (const c of clients) inbound.set(c.id, { r: reads / clients.length, w: writes / clients.length, a: 0 });

  let droppedSync = 0;
  let droppedAsync = 0;
  let backlog = 0;
  let persistedWrites = 0;

  const liveOf = (n: LabNode): { live: number; down: boolean } => {
    const f = failures.get(n.id);
    if (!f) return { live: n.count, down: false };
    if (n.type === 'db' && n.standby) return { live: 1, down: false }; // standby takes over
    const live = f === 'down' ? 0 : n.count - 1;
    return { live, down: live <= 0 };
  };
  const capOf = (n: LabNode, live: number) => SPECS[n.type].cap * live;
  const isUp = (id: string) => {
    const n = byId.get(id);
    return !!n && !liveOf(n).down;
  };

  const send = (from: string, to: string, f: Flow) => {
    if (total(f) <= 0) return;
    const cur = inbound.get(to)!;
    inbound.set(to, { r: cur.r + f.r, w: cur.w + f.w, a: cur.a + f.a });
    const k = edgeKey(from, to);
    const e = edges.get(k) ?? { r: 0, w: 0, a: 0 };
    edges.set(k, { r: e.r + f.r, w: e.w + f.w, a: e.a + f.a });
  };

  /** split by capacity across up targets */
  const weights = (ids: string[]): { id: string; w: number }[] => {
    const up = ids.filter(isUp);
    const caps = up.map((id) => {
      const n = byId.get(id)!;
      return { id, c: capOf(n, liveOf(n).live) };
    });
    const sum = caps.reduce((s, x) => s + x.c, 0) || 1;
    return caps.map((x) => ({ id: x.id, w: x.c / sum }));
  };

  for (const n of order) {
    const spec = SPECS[n.type];
    const fin = inbound.get(n.id)!;
    const { live, down } = liveOf(n);
    const warnings: string[] = [];
    const targets = out.get(n.id) ?? [];
    const route: Record<Kind, { to: string; share: number }[]> = { r: [], w: [], a: [] };
    routes.set(n.id, route);

    if (down) {
      droppedSync += fin.r + fin.w;
      droppedAsync += fin.a;
      stats.set(n.id, { rho: 0, live: 0, down: true, in: fin, dropped: total(fin), p99: 0, warnings: ['down'] });
      continue;
    }

    // multiple app instances without a balancer in front: only one is reachable
    let effLive = live;
    if (n.type === 'app' && live > 1) {
      const feeders = design.edges.filter((e) => e.to === n.id).map((e) => byId.get(e.from)?.type);
      if (feeders.some((t) => t === 'client' || t === 'cdn')) {
        effLive = 1;
        warnings.push('only 1 instance reachable — add a load balancer');
      }
    }

    const cap = capOf(n, effLive);
    let ops = fin.r + fin.w + fin.a;
    if (n.type === 'db') ops = fin.r + (fin.w + fin.a) * DB_WRITE_COST;
    const rho = cap === Infinity ? 0 : ops / cap;
    const s = rho > 1 ? 1 / rho : 1;
    const served: Flow = { r: fin.r * s, w: fin.w * s, a: fin.a * s };
    let dropped = total(fin) * (1 - s);
    droppedSync += (fin.r + fin.w) * (1 - s);
    droppedAsync += fin.a * (1 - s);
    if (rho > 1) warnings.push(`overloaded: ${Math.round(rho * 100)}% of capacity`);

    const fwd = (ids: string[], f: Flow, kinds: Kind[]) => {
      const ws = weights(ids);
      if (!ws.length) return false;
      for (const { id, w } of ws) {
        send(n.id, id, { r: f.r * w, w: f.w * w, a: f.a * w });
        for (const k of kinds) {
          const base = k === 'r' ? served.r : k === 'w' ? served.w : served.a;
          const amount = k === 'r' ? f.r : k === 'w' ? f.w : f.a;
          if (base > 0 && amount > 0) route[k].push({ to: id, share: (amount * w) / base });
        }
      }
      return true;
    };
    const dropAll = (f: Flow, why: string) => {
      if (total(f) <= 0) return;
      droppedSync += f.r + f.w;
      droppedAsync += f.a;
      dropped += total(f);
      warnings.push(why);
    };
    const ofType = (...types: CompType[]) => targets.filter((id) => types.includes(byId.get(id)!.type));

    switch (n.type) {
      case 'client':
        if (!fwd(targets, served, ['r', 'w'])) dropAll(served, 'no route — connect users to something');
        break;
      case 'cdn': {
        const pass: Flow = { r: served.r * (1 - spec.hit!), w: served.w, a: 0 };
        if (!fwd(targets, pass, ['r', 'w'])) dropAll(pass, 'nothing behind the CDN');
        break;
      }
      case 'lb':
        if (!fwd(targets, served, ['r', 'w'])) dropAll(served, targets.length ? 'no healthy app instances' : 'no app servers behind it');
        break;
      case 'app': {
        const caches = ofType('cache');
        const stores = ofType('db', 'replica');
        const queues = ofType('queue');
        const dbs = ofType('db');
        // reads: cache first; fall back to stores if every cache is down
        const readVia = caches.some(isUp) ? caches : stores;
        if (served.r > 0 && readVia.length && !fwd(readVia, { r: served.r, w: 0, a: 0 }, ['r'])) dropAll({ r: served.r, w: 0, a: 0 }, 'read path is down');
        // writes: queue first, then the primary
        const writeVia = queues.some(isUp) ? queues : dbs;
        if (served.w > 0) {
          if (writeVia.length) {
            if (!fwd(writeVia, { r: 0, w: served.w, a: 0 }, ['w'])) dropAll({ r: 0, w: served.w, a: 0 }, 'write path is down');
          } else if (ofType('replica').length) {
            dropAll({ r: 0, w: served.w, a: 0 }, 'writes have nowhere to go — replicas are read-only');
          }
        }
        break;
      }
      case 'cache': {
        const miss: Flow = { r: served.r * (1 - spec.hit!), w: 0, a: 0 };
        if (miss.r > 0 && !fwd(targets, miss, ['r'])) dropAll(miss, targets.length ? 'everything behind the cache is down' : 'misses have nowhere to go');
        break;
      }
      case 'queue': {
        const workers = ofType('worker').filter(isUp);
        const drain = workers.reduce((sum, id) => {
          const w = byId.get(id)!;
          return sum + capOf(w, liveOf(w).live);
        }, 0);
        const outRate = Math.min(served.w, drain);
        backlog += served.w - outRate;
        if (served.w - outRate > 0.5) warnings.push(`backlog growing by ${Math.round(served.w - outRate)} jobs/s`);
        if (outRate > 0) fwd(workers, { r: 0, w: 0, a: outRate }, []);
        break;
      }
      case 'worker':
        if (served.a > 0 && !fwd(targets, { r: 0, w: 0, a: served.a }, [])) {
          droppedAsync += served.a;
          backlog += served.a;
          warnings.push(targets.length ? 'database is down — jobs failing' : 'jobs have nowhere to go');
        }
        break;
      case 'db':
        persistedWrites += served.w + served.a;
        break;
      case 'replica':
        if (fin.w + fin.a > 0) warnings.push('receiving writes — replicas are read-only');
        break;
    }
    stats.set(n.id, { rho, live: effLive, down: false, in: fin, dropped, p99: nodeP99(spec.baseMs, rho), warnings });
  }

  // ── latency: enumerate weighted paths for user reads and writes ──
  const paths: { w: number; ms: number }[] = [];
  const walk = (id: string, kind: 'r' | 'w', weight: number, ms: number) => {
    const st = stats.get(id);
    if (!st || st.down) return;
    const here = ms + st.p99;
    const node = byId.get(id)!;
    const r = routes.get(id)?.[kind] ?? [];
    // writes stop at the queue (acknowledged), reads stop at hits / stores
    const routed = node.type === 'queue' ? 0 : r.reduce((sum, x) => sum + x.share, 0);
    if (1 - routed > 1e-6) paths.push({ w: weight * (1 - routed), ms: here });
    if (node.type === 'queue') return;
    for (const { to, share } of r) if (weight * share > PRUNE) walk(to, kind, weight * share, here);
  };
  const offered = design.traffic.rps;
  if (offered > 0) {
    for (const c of clients) {
      walk(c.id, 'r', design.traffic.readPct / 100 / clients.length, 0);
      walk(c.id, 'w', (1 - design.traffic.readPct / 100) / clients.length, 0);
    }
  }
  paths.sort((a, b) => b.ms - a.ms);
  const totalW = paths.reduce((s, p) => s + p.w, 0) || 1;
  let acc = 0;
  let p99 = 0;
  for (const p of paths) {
    acc += p.w / totalW;
    if (acc >= 0.01) {
      p99 = p.ms;
      break;
    }
  }

  const served = Math.max(0, offered - droppedSync);
  const result: SimResult = {
    nodes: stats,
    edges,
    offered,
    served,
    errorRate: offered > 0 ? droppedSync / offered : 0,
    p99,
    cost: design.nodes.reduce((s, n) => s + nodeCost(n), 0),
    backlog: backlog + droppedAsync,
    persisted: writes > 0 ? Math.min(1, persistedWrites / writes) : 1,
    spofs: [],
  };

  if (analyseSpofs && offered > 0) {
    for (const n of design.nodes) {
      if (n.type === 'client') continue;
      const f: Failures = new Map(failures);
      f.set(n.id, n.count > 1 ? 'one' : 'down');
      const r = simulate(design, f, false);
      const losesWrites = result.persisted > 0.99 && r.persisted < 0.5;
      if (r.errorRate - result.errorRate > SPOF_THRESHOLD || losesWrites) result.spofs.push(n.id);
    }
  }
  return result;
}
