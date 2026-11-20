import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => crowd('app', -18, 0, 10, 'live application traffic', extra);
const old = (extra: Partial<SceneNode> = {}) => db('old', -6, -6, 'Old database (source of truth)', { size: [2, 2], ...extra });
const neu = (extra: Partial<SceneNode> = {}) => db('neu', 12, -6, 'New database', { size: [2, 2], ...extra });
const cdc = (extra: Partial<SceneNode> = {}) => box('cdc', 3, 4, 'Change log (CDC / dual write)', 'purple', 'queue', { size: [1.5, 1.5], height: 24, ...extra });
const bf = (extra: Partial<SceneNode> = {}) => box('bf', 3, -12, 'Backfill workers (key ranges)', 'orange', 'copy', { size: [1.5, 1.5], height: 24, ...extra });
const ver = (extra: Partial<SceneNode> = {}) => box('ver', 12, 6, 'Verifier (sample + compare)', 'green', 'check', { size: [1.4, 1.4], height: 22, ...extra });
const router = (extra: Partial<SceneNode> = {}) => box('router', -9, 6, 'Read/write switch (flag)', 'teal', 'route', { size: [1.3, 1.3], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
const fmtMB = (mb: number): string => (mb >= 1e6 ? `${(mb / 1e6).toFixed(1)} TB` : mb >= 1e3 ? `${(mb / 1e3).toFixed(0)} GB` : `${Math.round(mb)} MB`);

const lesson: Lesson = {
  slug: 'academy-tumblr-shares-database-migration-strategy-with-60-billion-rows',
  title: 'Live Data Migration: Backfill, Change Capture, Verification and Cutover',
  blurb: 'Moving tens of billions of rows between databases without downtime: the phases, the arithmetic of backfill time and change backlog, statistical verification, and a cutover that can be reversed.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'vol', label: 'Data to copy', icon: 'disk' },
    { key: 'bf', label: 'Backfill duration', icon: 'timer' },
    { key: 'log', label: 'Change backlog accumulated during backfill', icon: 'queue' },
    { key: 'catch', label: 'Time to drain the backlog', icon: 'refresh' },
    { key: 'sample', label: 'Rows to verify to bound the mismatch rate', icon: 'search' },
  ],
  goals: [
    { text: 'Why this is hard: size, liveness, correctness', step: 1 },
    { text: 'Capture changes first, then backfill', step: 2 },
    { text: 'Catch up: drain the backlog', step: 3 },
    { text: 'Verify with shadow reads and sampling', step: 4 },
    { text: 'Cut over gradually, with a way back', step: 5 },
  ],
  legend: ['request', 'write', 'response', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rows', label: 'Rows to migrate', min: 1000000, max: 1000000000000, step: 1000000, default: 60000000000, unit: '', description: 'Total rows across tables.' },
      { key: 'rb', label: 'Bytes per row (incl. indexes)', min: 20, max: 5000, step: 10, default: 200, unit: ' B', description: 'Average stored size per row.' },
      { key: 'workers', label: 'Parallel backfill workers', min: 1, max: 500, step: 1, default: 32, unit: '', description: 'Concurrent copy streams.' },
      { key: 'wmb', label: 'Throughput per worker', min: 1, max: 200, step: 1, default: 25, unit: ' MB/s', description: 'Copy rate of one worker.' },
      { key: 'thr', label: 'Throttle (share of capacity allowed)', min: 5, max: 100, step: 5, default: 50, unit: '%', description: 'Cap to protect production.' },
      { key: 'wr', label: 'Live row changes per second', min: 10, max: 1000000, step: 10, default: 50000, unit: '/s', description: 'Inserts, updates and deletes on the source.' },
      { key: 'rep', label: 'Change-apply speed on the new database', min: 1, max: 1000, step: 1, default: 100, unit: ' MB/s', description: 'Rate the change log can be replayed.' },
      { key: 'p', label: 'Mismatch rate you want to rule out', min: 0.000000001, max: 0.01, step: 0.000000001, default: 0.000001, unit: '', description: 'e.g. 1e-6 = one bad row in a million.' },
      { key: 'conf', label: 'Confidence', min: 90, max: 99.999, step: 0.001, default: 99, unit: '%', description: 'Probability the sample would reveal that mismatch rate.' },
    ],
    calculate: (input, step) => {
      const rows = Math.max(1, input.rows ?? 6e10);
      const rb = Math.max(1, input.rb ?? 200);
      const workers = Math.max(1, input.workers ?? 32);
      const wmb = Math.max(0.1, input.wmb ?? 25);
      const thr = Math.min(1, Math.max(0.01, (input.thr ?? 50) / 100));
      const wr = Math.max(0, input.wr ?? 5e4);
      const rep = Math.max(0.1, input.rep ?? 100);
      const p = Math.min(0.5, Math.max(1e-12, input.p ?? 1e-6));
      const conf = Math.min(0.999999, Math.max(0.5, (input.conf ?? 99) / 100));
      const mb = (rows * rb) / 1e6;
      const rate = workers * wmb * thr;
      const secs = mb / rate;
      const logRate = (wr * rb) / 1e6;
      const backlog = logRate * secs;
      const drain = rep > logRate ? backlog / (rep - logRate) : Infinity;
      // Independent random sample: probability of missing a mismatch rate p in n draws is (1-p)^n.
      const n = Math.ceil(Math.log(1 - conf) / Math.log(1 - p));
      return {
        vol: step < 1 ? { v: '—' } : { v: `${fmtMB(mb)} (${fmtN(rows)} rows × ${rb} B)` },
        bf: step < 2 ? { v: '—' } : { v: `${fmtT(secs)} at ${fmtN(rate)} MB/s`, tone: secs < 86400 ? 'good' : secs < 86400 * 7 ? 'warn' : 'bad' },
        log: step < 2 ? { v: '—' } : { v: `${fmtMB(backlog)} of changes (${logRate.toFixed(1)} MB/s)`, tone: backlog < 1e6 ? 'good' : 'warn' },
        catch: step < 3 ? { v: '—' } : { v: Number.isFinite(drain) ? `${fmtT(drain)} (apply ${rep} MB/s − incoming ${logRate.toFixed(1)} MB/s)` : 'never: apply speed ≤ change rate', tone: Number.isFinite(drain) && drain < 7200 ? 'good' : 'bad' },
        sample: step < 4 ? { v: '—' } : { v: `${fmtN(n)} rows (${((n / rows) * 100).toFixed(4)}% of the data)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'A big, live, must-be-correct move',
      body: [
        'Reasons to migrate a database are usually unavoidable — an end-of-life engine, a sharding scheme that no longer fits, a move between data centres or clouds, a schema that must change. The constraints are what make it hard. <b>Size</b>: 60 billion rows at ~200 bytes is <b>12 TB</b> that cannot be copied in a weekend maintenance window at any sane throughput. <b>Liveness</b>: the source keeps taking 50,000 changes a second throughout, so any copy is stale the moment it is taken. <b>Correctness</b>: a silent mismatch in 0.0001% of rows is 60,000 wrong records nobody notices until a customer does.',
        'So the strategy is never “stop, copy, start”. It is a sequence of <b>reversible, observable phases</b> in which the old system stays the source of truth until the new one has been proven: <b>capture changes</b>, <b>backfill</b> history, <b>catch up</b>, <b>verify</b> in shadow, <b>cut over</b> gradually, keep a <b>way back</b>, then <b>clean up</b>. The rest of the lesson puts numbers on each.',
      ],
      scene: { nodes: [app({ tag: pill('50,000 changes/s', 'activity') }), old({ tag: pill('12 TB · 60B rows', 'db') }), neu({ tag: pill('empty', 'box') })], links: [link('app', 'old'), link('old', 'neu', { style: 'dashed' })], flows: [flow(['app', 'old'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Capture',
      kind: 'technique',
      title: 'Capture changes first, then backfill history',
      body: [
        '<b>Order matters</b>: start capturing changes <i>before</i> copying history, or the rows modified during the copy are lost. Two ways: <b>change data capture</b> from the source’s log (binlog/WAL — see the CDC lesson), non-invasive and complete; or <b>application-level dual writes</b> (the app writes to both stores), simpler to start but with a classic flaw — two writes aren’t atomic, so a failure between them makes the stores diverge silently; use a transactional outbox or treat the old store as authoritative and the new as best-effort until verified.',
        'The <b>backfill</b> copies existing rows in <b>key ranges</b> (so work is resumable and parallel), reading from a replica where possible and throttled to protect production. With 32 workers at 25 MB/s and a 50% throttle: 400 MB/s, so 12,000,000 MB ÷ 400 = <b>30,000 s ≈ 8.3 hours</b>. Writes into the new database must be <b>idempotent upserts keyed by primary key with a version or timestamp</b> so a backfilled (older) row can never overwrite a newer one applied from the change log, and deletes need tombstones so a copied row isn’t resurrected.',
      ],
      changes: [{ text: 'Start change capture before the backfill', tone: 'good' }, { text: 'Backfill by key range, resumable, throttled: 12 TB ≈ 8.3 h', tone: 'info' }, { text: 'Idempotent versioned upserts; tombstones for deletes', tone: 'good' }],
      scene: { nodes: [app(), old(), bf({ tag: pill('32 workers × 25 MB/s × 50%', 'gauge') }), cdc({ tag: pill('every change logged', 'list') }), neu()], links: [link('app', 'old'), link('old', 'bf'), link('bf', 'neu'), link('old', 'cdc'), link('cdc', 'neu', { style: 'dashed' })], flows: [flow(['old', 'bf', 'neu'], { kind: 'write', rate: 2.4 }), flow(['old', 'cdc'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Catch up',
      kind: 'technique',
      title: 'Catch up: drain the change backlog',
      body: [
        'While the backfill ran, changes piled up in the log: 50,000 rows/s × 200 B = 10 MB/s × 30,000 s = <b>300 GB</b> to replay. The new database applies them at, say, 100 MB/s while new changes keep arriving at 10 MB/s, so the backlog drains at the <b>difference</b> (90 MB/s): <b>3,333 s ≈ 56 minutes</b>. If apply speed were ≤ the incoming rate, the backlog would never drain — the replay path (often a single-threaded consumer, or secondary-index maintenance on the target) must out-run production by a safe margin; parallelise by key to keep per-key ordering.',
        'When lag falls to seconds the new database is a <b>live, near-real-time copy</b>. Monitor <b>replication lag</b> continuously from here to the end of the migration; it is the number that decides when a cutover is safe, and a flapping lag graph means the apply path needs work. Also schedule the long pole carefully: do the backfill during low-traffic hours or throttle dynamically on source latency, and keep the log retention longer than the backfill plus a margin.',
      ],
      changes: [{ text: '10 MB/s × 30,000 s = 300 GB of changes to replay', tone: 'info' }, { text: 'Drain rate = apply − incoming = 90 MB/s → ~56 min', tone: 'info' }, { text: 'Apply ≤ incoming → never catches up', tone: 'bad' }],
      scene: { nodes: [old(), cdc({ tag: pill('backlog 300 GB → 0', 'queue', 'warn') }), neu({ tag: pill('lag: minutes → seconds', 'clock') })], links: [link('old', 'cdc'), link('cdc', 'neu')], flows: [flow(['cdc', 'neu'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Verify',
      kind: 'technique',
      title: 'Verify: shadow reads, checksums and sampling',
      body: [
        'Never trust the copy; prove it. <b>Shadow reads</b>: for a fraction of production reads, also query the new database, compare the results in the background and log mismatches (the user still sees the old answer). <b>Row-level checks</b>: compare checksums per key range (a hash of each range’s rows computed on both sides — drill into ranges that differ), and run <b>full-table counts and aggregates</b>. For huge tables, <b>statistical sampling</b> bounds the error: to be 99% sure that a mismatch rate of one in a million would have shown up, draw <code>n = ln(1 − 0.99) / ln(1 − 10⁻⁶)</code> ≈ <b>4.6 million random rows</b> — just 0.0077% of 60 billion — and find zero mismatches.',
        'Expect and categorise differences: replication lag (rows changed between the two reads — re-check after a delay), <b>data-type and encoding differences</b> (timestamps, floats, character sets, NULL vs empty), ordering and collation (sorts differ), and real bugs. Fix the cause (transform code, apply ordering), re-run, and keep a dashboard of mismatch counts trending to zero. Verification also covers <b>behaviour</b>, not just data: replay a sample of production <b>queries</b> against the new database to compare latency and plans before it serves traffic.',
      ],
      changes: [{ text: 'Shadow reads compare old vs new in the background', tone: 'good' }, { text: '4.6M sampled rows rule out a 10⁻⁶ mismatch rate at 99% confidence', tone: 'info' }, { text: 'Also replay queries for latency and plan differences', tone: 'good' }],
      concepts: [{ term: 'Shadow read', def: 'Issuing a production read to both systems and comparing results without returning the new system’s answer to the user.' }],
      scene: { nodes: [app(), router({ tag: pill('serve old · compare new', 'search') }), old(), neu(), ver({ tag: pill('0 mismatches / 4.6M', 'check', 'good') })], links: [link('app', 'router'), link('router', 'old'), link('router', 'neu', { style: 'dashed' }), link('neu', 'ver'), link('old', 'ver')], flows: [flow(['app', 'router', 'old'], { rate: 1.6, back: true }), flow(['router', 'neu'], { rate: 1, back: true })] },
    },
    {
      short: 'Cutover',
      kind: 'technique',
      title: 'Cut over gradually — and keep a way back',
      body: [
        'Move traffic by <b>flag, in steps</b>: reads first (1% → 10% → 50% → 100% of users or tenants, watching latency, error rate and mismatches), then writes. For the write switch, briefly <b>pause or queue writes</b> (seconds), let the change log drain to zero, flip the flag so the new database becomes the source of truth, and resume. The critical safety is the <b>reverse path</b>: immediately start replicating changes from the new database <b>back to the old</b>, so if a problem appears you can flip back without data loss; keep it for days or weeks.',
        'Afterwards: stop the reverse sync, <b>freeze the old database read-only</b> for a retention period (backups, audit), remove dual-write code and flags, decommission, and write down what you learned. Throughout, communicate (status page, change calendar), rehearse the whole thing on a copy of production, and agree <b>go/no-go criteria</b> in advance (lag under N seconds, zero unexplained mismatches, p99 latency within X%). The figures here are first-order model outputs, to be replaced by your measured throughput.',
      ],
      changes: [{ text: 'Reads first by percentage, then a short write pause and flip', tone: 'good' }, { text: 'Reverse replication new → old = a safe rollback', tone: 'good' }, { text: 'Pre-agreed go/no-go criteria; rehearse on a copy', tone: 'good' }],
      scene: { nodes: [app(), router({ tag: pill('flag: reads 100% · writes new', 'route', 'good') }), neu({ tag: pill('now source of truth', 'check', 'good') }), old({ tag: pill('read-only fallback', 'pause') })], links: [link('app', 'router'), link('router', 'neu'), link('neu', 'old', { style: 'dashed' })], flows: [flow(['app', 'router', 'neu'], { kind: 'write', rate: 2 }), flow(['neu', 'old'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Capture, copy, catch up, verify, switch — reversibly',
      body: [
        'Start <b>change capture</b>, <b>backfill</b> in throttled key ranges with idempotent versioned writes (8.3 h for 12 TB here), <b>drain</b> the backlog (300 GB, ~56 min), <b>verify</b> with shadow reads and statistical sampling (4.6M rows), then <b>cut over</b> gradually with a reverse replication path.',
        'The old system stays authoritative until the new one is proven; every phase is observable and reversible.',
      ],
      scene: { nodes: [app(), old(), cdc(), bf(), neu(), ver()], links: [link('app', 'old'), link('old', 'bf'), link('bf', 'neu'), link('old', 'cdc'), link('cdc', 'neu'), link('neu', 'ver')], flows: [flow(['old', 'bf', 'neu'], { kind: 'write', rate: 2 })] },
    },
  ],
};

export default lesson;
