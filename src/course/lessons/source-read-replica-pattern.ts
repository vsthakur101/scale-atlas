import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => crowd('app', -18, 0, 10, 'application servers', extra);
const router = (extra: Partial<SceneNode> = {}) => box('router', -9, 0, 'Read/write router', 'purple', 'route', { size: [1.5, 1.5], height: 26, ...extra });
const primary = (extra: Partial<SceneNode> = {}) => db('primary', 2, -7, 'Primary (accepts writes)', { size: [1.8, 1.8], ...extra });
const r1 = (extra: Partial<SceneNode> = {}) => db('r1', 12, -3, 'Replica 1', { size: [1.4, 1.4], ...extra });
const r2 = (extra: Partial<SceneNode> = {}) => db('r2', 12, 4, 'Replica 2', { size: [1.4, 1.4], ...extra });
const r3 = (extra: Partial<SceneNode> = {}) => db('r3', 12, 11, 'Replica 3', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);
const fmtP = (p: number): string => (p >= 0.9995 ? '100%' : p < 0.001 ? `${(p * 100).toFixed(2)}%` : `${(p * 100).toFixed(1)}%`);

const lesson: Lesson = {
  slug: 'source-read-replica-pattern',
  title: 'Read Replicas: Replication Lag as a Queue, and Read-Your-Writes',
  blurb: 'Scale reads by streaming the write log to copies — then model the lag as a queue: steady-state delay, what a write burst does to it, the chance a user reads stale data, and the routing techniques that keep their own writes visible.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'lag', label: 'Steady-state replication lag', icon: 'clock' },
    { key: 'burst', label: 'Lag at the end of a write burst', icon: 'alert' },
    { key: 'stale', label: 'Chance a read right after a write is stale (steady → burst)', icon: 'search' },
    { key: 'reps', label: 'Replicas for the read load (primary egress)', icon: 'layers' },
  ],
  goals: [
    { text: 'Why replicas help reads but not writes', step: 1 },
    { text: 'How a replica stays current: the log stream', step: 2 },
    { text: 'Lag is a queue: steady state and bursts', step: 3 },
    { text: 'Read-your-writes and routing strategies', step: 4 },
    { text: 'Failure handling, promotion and capacity', step: 5 },
  ],
  legend: ['request', 'write', 'response', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'wal', label: 'Write-log volume on the primary', min: 0.1, max: 500, step: 0.1, default: 20, unit: ' MB/s', description: 'WAL / binlog bytes generated.' },
      { key: 'apply', label: 'Replica apply capacity', min: 1, max: 1000, step: 1, default: 60, unit: ' MB/s', description: 'Rate a replica can replay the log.' },
      { key: 'chunk', label: 'Log shipped in chunks of', min: 0.01, max: 16, step: 0.01, default: 1, unit: ' MB', description: 'Replication batch size.' },
      { key: 'net', label: 'Network delay primary → replica', min: 0, max: 200, step: 1, default: 2, unit: ' ms', description: 'One-way delay.' },
      { key: 'bx', label: 'Burst write multiple', min: 1, max: 10, step: 0.1, default: 3.5, unit: '×', description: 'Write volume during a burst relative to normal.' },
      { key: 'bt', label: 'Burst duration', min: 1, max: 3600, step: 1, default: 120, unit: ' s', description: 'How long the burst lasts (a batch job, a migration, a sale).' },
      { key: 'think', label: 'Typical time before a user reads their write', min: 0.1, max: 60, step: 0.1, default: 2, unit: ' s', description: 'Mean delay between a write and the next read of it (exponential).' },
      { key: 'rqps', label: 'Read queries per second', min: 100, max: 1000000, step: 100, default: 40000, unit: '/s', description: 'Total read load.' },
      { key: 'rcap', label: 'Reads per replica', min: 500, max: 100000, step: 500, default: 8000, unit: '/s', description: 'Sustainable read rate of one replica.' },
    ],
    calculate: (input, step) => {
      const wal = Math.max(0.01, input.wal ?? 20);
      const apply = Math.max(0.01, input.apply ?? 60);
      const chunk = Math.max(0.001, input.chunk ?? 1);
      const net = Math.max(0, (input.net ?? 2) / 1000);
      const bx = Math.max(1, input.bx ?? 3.5);
      const bt = Math.max(0, input.bt ?? 120);
      const think = Math.max(0.01, input.think ?? 2);
      const rqps = Math.max(1, input.rqps ?? 40000);
      const rcap = Math.max(1, input.rcap ?? 8000);
      // Replay of log chunks as an M/M/1 queue: arrivals = wal/chunk per second, service rate = apply/chunk.
      const mu = apply / chunk;
      const lam = wal / chunk;
      const steady = lam < mu ? 1 / (mu - lam) + net : Infinity;
      const burstRate = wal * bx;
      const backlog = Math.max(0, (burstRate - apply) * bt);
      const lagEnd = Number.isFinite(steady) ? (burstRate <= apply ? 1 / Math.max(1e-9, mu - burstRate / chunk) + net : backlog / apply + net) : backlog / apply + net;
      const pSteady = Number.isFinite(steady) ? 1 - Math.exp(-steady / think) : 1;
      const pBurst = 1 - Math.exp(-lagEnd / think);
      const reps = Math.max(1, Math.ceil(rqps / rcap));
      return {
        lag: step < 3 ? { v: '—' } : { v: Number.isFinite(steady) ? `${fmtT(steady)} (ρ = ${(lam / mu).toFixed(2)})` : 'unbounded: replica can’t keep up', tone: Number.isFinite(steady) && steady < 0.1 ? 'good' : Number.isFinite(steady) && steady < 1 ? 'warn' : 'bad' },
        burst: step < 3 ? { v: '—' } : { v: burstRate > apply ? `${fmtT(lagEnd)} (${fmtN(backlog)} MB backlog)` : fmtT(lagEnd), tone: lagEnd < 1 ? 'good' : lagEnd < 10 ? 'warn' : 'bad' },
        stale: step < 4 ? { v: '—' } : { v: `${fmtP(pSteady)} → ${fmtP(pBurst)}`, tone: pSteady < 0.02 ? 'good' : 'warn' },
        reps: step < 5 ? { v: '—' } : { v: `${reps} replicas · ${fmtN(wal * reps)} MB/s egress from the primary`, tone: wal * reps < 125 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Most workloads read far more than they write',
      body: [
        'Typical applications read 10–100× more than they write, and reads are the part that is easy to copy. A <b>read replica</b> is a full copy of the database that continuously receives the primary’s changes and serves <b>read-only</b> queries. Add replicas, spread reads across them, and read capacity grows nearly linearly — without changing the schema or the data model, which is why it is the first scaling step after tuning and caching (see the Staged PostgreSQL lesson).',
        'It does <b>not</b> scale writes: every replica must apply every write, so each one carries the write load too, and the primary is still a single writer. And replicas are <b>asynchronously</b> updated (usually), which introduces the central complication of the pattern — a replica shows the database as it was <i>a moment ago</i>. This lesson models that moment.',
      ],
      scene: { nodes: [app(), router({ tag: pill('writes → primary · reads → replicas', 'route') }), primary(), r1(), r2()], links: [link('app', 'router'), link('router', 'primary'), link('router', 'r1'), link('router', 'r2'), link('primary', 'r1', { style: 'dashed' }), link('primary', 'r2', { style: 'dashed' })], flows: [flow(['app', 'router', 'primary'], { kind: 'write', rate: 1 }), flow(['router', 'r1'], { rate: 1.8, back: true }), flow(['router', 'r2'], { rate: 1.8, back: true })] },
    },
    {
      short: 'Stream',
      kind: 'technique',
      title: 'How a replica stays current',
      body: [
        'The primary already writes every change to its <b>write-ahead log</b> (PostgreSQL WAL, MySQL binlog — see the ACID lesson). Replication streams that log: the replica connects, asks for changes after its last known position (<b>LSN</b> or <b>GTID</b>), receives them over the network and <b>replays</b> them in order against its own copy. <b>Physical</b> replication ships byte-level page changes (identical copy, same major version); <b>logical</b> replication ships row-level changes (can filter tables, cross versions, feed other systems — see the Change Data Capture lesson).',
        'Modes: <b>asynchronous</b> (the primary commits without waiting — fast, but a primary crash can lose unreplicated commits), <b>semi-synchronous / synchronous</b> (commit waits for at least one replica to receive or apply — no loss, higher write latency, availability coupling). Replay is often <b>single-threaded</b> per replica in simple setups, so a replica’s <b>apply capacity</b>, not the network, usually limits it; parallel apply and per-table workers raise that ceiling.',
      ],
      changes: [{ text: 'Replicas replay the primary’s log from their last LSN', tone: 'info' }, { text: 'Async: fast but can lose commits; sync: no loss, slower writes', tone: 'info' }, { text: 'Single-threaded apply caps replica throughput', tone: 'bad' }],
      scene: { nodes: [primary({ tag: pill('WAL: LSN 0/5F3A…', 'list') }), r1({ tag: pill('applies in order', 'refresh') }), r2(), r3()], links: [link('primary', 'r1'), link('primary', 'r2'), link('primary', 'r3')], flows: [flow(['primary', 'r1'], { kind: 'write', rate: 1.6 }), flow(['primary', 'r2'], { kind: 'write', rate: 1.6 }), flow(['primary', 'r3'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Lag',
      kind: 'insight',
      title: 'Lag is a queue: steady state, then a burst',
      body: [
        'Treat the log as a stream of 1 MB chunks arriving at the replica’s apply queue. With 20 MB/s of log and a replica that applies 60 MB/s, utilisation is ρ = 20/60 = 0.33 and the queue has a stable mean delay (M/M/1: <code>W = 1/(μ − λ)</code> = 1/(60 − 20) = <b>25 ms</b>, plus 2 ms network = <b>27 ms</b>). Lag stays small while ρ is well below 1 and <b>explodes as ρ → 1</b>: at 55 MB/s of writes the same replica sees W = 200 ms; at 59 MB/s, 1 s; above 60 MB/s it falls behind <i>indefinitely</i>.',
        'Bursts do exactly that. A batch job or migration at 3.5× the normal rate pushes 70 MB/s at a replica that applies 60: the backlog grows by 10 MB/s, so after 120 s it holds <b>1,200 MB</b>, and the replica is <b>20 seconds</b> behind (1,200 ÷ 60) — then recovers only as fast as spare capacity allows (60 − 20 = 40 MB/s → 30 s more). Other lag causes: a long-running query on the replica that blocks replay (a conflict with the log), a big transaction applied as one unit, a slow disk, and network loss.',
      ],
      changes: [{ text: 'W = 1/(μ − λ): 25 ms at ρ = 0.33, unbounded at ρ ≥ 1', tone: 'info' }, { text: '3.5× burst for 120 s → 1.2 GB backlog → 20 s lag', tone: 'bad' }],
      concepts: [{ term: 'Replication lag', def: 'The delay between a commit on the primary and its visibility on a replica, set by how fast the replica can drain the stream of changes.' }],
      scene: { nodes: [primary({ tag: pill('70 MB/s burst', 'bolt', 'warn') }), r1({ state: 'hot', tag: pill('applies 60 MB/s → 20 s behind', 'alert', 'warn') }), r2()], links: [link('primary', 'r1'), link('primary', 'r2', { style: 'dashed' })], flows: [flow(['primary', 'r1'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'RYW',
      kind: 'problem',
      title: 'Read-your-writes: the user who just saved something',
      body: [
        'A user posts a comment (write → primary), the page reloads (read → replica) and <b>the comment isn’t there</b>. If users re-read their own write after an exponential delay averaging 2 s, the chance the replica hasn’t caught up is <code>1 − e^(−lag/2 s)</code>: <b>1.3%</b> at 27 ms — still thousands of confused users a day at scale — and effectively <b>100%</b> during the 20 s burst lag. Monotonic reads fail too: two consecutive reads hitting different replicas can show data going <i>backwards</i>.',
        'Techniques, from simple to precise: <b>read from the primary</b> for a short window after a user’s write (sticky window of a few seconds, or per-session flag); <b>route by freshness</b> (reads that must be fresh — checkout, account settings — go to the primary); <b>LSN/GTID tokens</b> (the write returns its commit position, the client sends it with the next read, and the router picks a replica whose replayed position is ≥ token, or waits briefly — causal consistency); <b>session-sticky replica</b> for monotonic reads; <b>synchronous replication</b> for specific writes; and <b>client-side optimism</b> (show the new comment locally). See the Consistency Patterns lesson.',
      ],
      changes: [{ text: '1.3% of read-after-write calls stale at 27 ms; ~100% during a burst', tone: 'bad' }, { text: 'Sticky primary window, freshness routing, LSN tokens', tone: 'good' }, { text: 'Sticky replica per session for monotonic reads', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('write, then read', 'user') }), router({ tag: pill('token: LSN ≥ 0/5F3A', 'key', 'good') }), primary({ tag: pill('commit at LSN 0/5F3A', 'check') }), r1({ tag: pill('at 0/5F30 — stale', 'alert', 'warn') }), r2({ tag: pill('at 0/5F3B — fresh', 'check', 'good') })], links: [link('app', 'router'), link('router', 'primary'), link('router', 'r1', { style: 'dashed' }), link('router', 'r2')], flows: [flow(['app', 'router', 'primary'], { kind: 'write', rate: 1.2 }), flow(['router', 'r2'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Operate',
      kind: 'tradeoff',
      title: 'Capacity, failure handling and promotion',
      body: [
        'Sizing: 40,000 reads/s at 8,000 per replica needs <b>5 replicas</b> — with 20 MB/s of log that is <b>100 MB/s</b> of egress from the primary, a hidden cost that grows linearly with replicas (cascading replication — replicas feeding replicas — flattens it at the price of added lag). Replicas also need the <b>same hardware class</b> as the primary if they might be promoted, and enough headroom that ρ stays low.',
        'Operations: the router must <b>remove replicas whose lag exceeds a threshold</b> (or fall back to the primary) so a lagging node doesn’t serve stale data silently, health-check replicas, and keep a <b>delayed replica</b> (e.g. 1 hour behind) as protection against a bad <code>DELETE</code>. On primary failure, <b>promote</b> the most caught-up replica (automated via Patroni, orchestrators or cloud failover), repoint the others, and accept that async replication can lose the last unreplicated commits — a data-loss window equal to the lag at failure (see the High Availability and Disaster Recovery lessons). Figures here are first-order queueing model outputs.',
      ],
      changes: [{ text: '5 replicas × 20 MB/s = 100 MB/s egress from the primary', tone: 'info' }, { text: 'Eject lagging replicas; delayed replica for mistakes', tone: 'good' }, { text: 'Failover loses unreplicated commits (lag at failure)', tone: 'bad' }],
      scene: { nodes: [router(), primary({ state: 'hot', tag: pill('failed', 'x', 'bad') }), r1({ tag: pill('promote: most caught up', 'check', 'good') }), r2({ tag: pill('repoint', 'refresh') }), r3({ tag: pill('delayed 1 h', 'clock') })], links: [link('router', 'r1'), link('router', 'r2'), link('r1', 'r2', { style: 'dashed' }), link('r1', 'r3', { style: 'dashed' })], flows: [flow(['router', 'r1'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Cheap read scale, paid for in staleness',
      body: [
        'Read replicas replay the primary’s <b>log stream</b>. Lag is a queue: ~27 ms at ρ = 0.33, unbounded at ρ ≥ 1, and a 3.5× burst for two minutes yields 20 s of lag. Stale reads after your own write follow directly (<code>1 − e^(−lag/think)</code>).',
        'Use sticky or token-based routing for read-your-writes, eject lagging replicas, watch primary egress, and plan promotion.',
      ],
      scene: { nodes: [app(), router(), primary(), r1(), r2(), r3()], links: [link('app', 'router'), link('router', 'primary'), link('router', 'r1'), link('router', 'r2'), link('router', 'r3')], flows: [flow(['app', 'router', 'r1'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
