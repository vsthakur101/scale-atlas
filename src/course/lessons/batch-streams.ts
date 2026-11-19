import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -12, 0, 'Ride app', 'blue', 'server', { size: [1.4, 1.4], height: 40, ...extra });
const prim = (extra: Partial<SceneNode> = {}) => db('prim', -5, 0, 'Primary DB', extra);
const lake = (extra: Partial<SceneNode> = {}) => disk('lake', 3, 7, 'data lake · daily files', { size: [3, 2], height: 24, tone: 'orange', icon: 'layers', ...extra });
const wh = (extra: Partial<SceneNode> = {}) => db('wh', 12, 7, 'Warehouse', { tone: 'green', icon: 'sheet', ...extra });
const log = (extra: Partial<SceneNode> = {}) =>
  disk('log', 2, -6, 'event log · trips', { size: [3.4, 1.4], height: 22, tone: 'yellow', icon: 'list', ...extra });
const proc = (extra: Partial<SceneNode> = {}) => box('proc', 9, -6, 'Stream job', 'purple', 'activity', { size: [1.4, 1.4], height: 38, ...extra });
const live = (extra: Partial<SceneNode> = {}) => box('live', 15, -6, 'Live view', 'teal', 'gauge', { size: [1.3, 1.3], height: 32, ...extra });
const ckpt = (extra: Partial<SceneNode> = {}) => disk('ckpt', 13, -12, 'checkpoints', { size: [1.6, 1.2], height: 18, tone: 'grey', icon: 'shield', ...extra });
const workers = (extra: Partial<SceneNode> = {}) => [0, 1, 2].map((i) => box(`m${i}`, 8 + i * 0.8, 1 + i * 2.6, `worker ${i + 1}`, 'purple', 'cpu', { size: [0.9, 0.9], height: 22, ...extra }));

const lesson: Lesson = {
  slug: 'batch-streams',
  title: 'Batch & Streams',
  blurb: 'Process data in big scheduled chunks or continuously as it arrives — and know what each costs in freshness and complexity.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'fresh', label: 'Freshness', icon: 'clock' },
    { key: 'prodload', label: 'Primary DB load', icon: 'db' },
    { key: 'rerun', label: 'Reprocessing', icon: 'refresh' },
    { key: 'correct', label: 'Correctness', icon: 'check' },
  ],
  goals: [
    { text: 'Why analytics off the primary database hurts', step: 1 },
    { text: 'Batch jobs: partition, map, shuffle, reduce', step: 3 },
    { text: 'Stream processing on an event log', step: 4 },
    { text: 'Windows, event time and late data', step: 5 },
    { text: 'State, checkpoints and one pipeline vs two', step: 8 },
  ],
  legend: ['write', 'request', 'response', 'heavy'],
  steps: [
    {
      short: 'Reports',
      kind: 'problem',
      title: 'The report that slows down every ride',
      body: [
        'A ride-hailing company runs its daily revenue report as one huge SQL query against the production database at 02:00. It scans a billion trips, takes three hours, and hogs I/O — so rider requests at 2 a.m. in another time zone crawl.',
        'And the result is always a day old. Operations wants to see surge pricing effects within minutes, not tomorrow.',
      ],
      changes: [{ text: '3 h scan on production', tone: 'bad' }, { text: 'Insights 24 h stale', tone: 'bad' }],
      scene: {
        nodes: [app(), prim({ load: 96, state: 'hot', tag: pill('report query: 3 h', 'alert', 'bad') }), box('report', -5, 9, 'Report', 'grey', 'sheet', { size: [1.2, 1.2], height: 30 })],
        links: [link('app', 'prim', { arrow: 'both' }), link('report', 'prim', { arrow: 'both' })],
        flows: [flow(['app', 'prim'], { back: true, rate: 2, speed: 0.5 }), flow(['report', 'prim'], { kind: 'heavy', back: true, rate: 0.8, speed: 0.3 })],
        metrics: { fresh: { v: '24 h', tone: 'bad' }, prodload: { v: '96%', tone: 'bad' }, rerun: 'painful', correct: 'yes' },
      },
    },
    {
      short: 'Copy out',
      kind: 'technique',
      title: 'Move analytics off the primary',
      body: [
        'First rule: don’t do analytics on the database that serves users. Export the data — a nightly dump, or continuous change-data-capture — into a <b>data lake</b> of immutable files (columnar formats such as Parquet) and a <b>warehouse</b> built for big scans.',
        'Production goes back to serving riders, and analysts can run any query they like without paging anyone.',
      ],
      changes: [{ text: 'Primary load 96% → 35%', tone: 'good' }],
      concepts: [
        { term: 'Data warehouse', def: 'A database optimised for large analytical queries over historical data, usually columnar.' },
        { term: 'Columnar storage', def: 'Storing each column’s values together, so scans read only the columns a query needs and compress well.' },
      ],
      scene: {
        nodes: [app(), prim({ load: 35 }), lake(), wh({ tag: pill('analysts query here', 'sheet', 'good') })],
        links: [link('app', 'prim', { arrow: 'both' }), link('prim', 'lake', { label: pill('nightly export') }), link('lake', 'wh')],
        flows: [flow(['app', 'prim'], { back: true, rate: 2 }), flow(['prim', 'lake'], { kind: 'write', rate: 0.6 }), flow(['lake', 'wh'], { kind: 'write', rate: 0.6 })],
        metrics: { fresh: '24 h', prodload: { v: '35%', tone: 'good' }, rerun: 'possible', correct: 'yes' },
      },
    },
    {
      short: 'Batch',
      kind: 'technique',
      title: 'Batch jobs: divide, compute, combine',
      body: [
        'The revenue job reads a day of trip files in parallel. Each worker processes one partition and emits (city, fare) pairs — the <b>map</b>. Pairs are <b>shuffled</b> so all of one city’s fares reach the same worker, which sums them — the <b>reduce</b>. Spark, Flink batch and BigQuery all build on this shape.',
        'Batch jobs are simple to reason about: fixed input, deterministic output. If the logic had a bug, fix it and rerun over the same files. The price is latency — results arrive when the job finishes.',
      ],
      changes: [{ text: '1B trips in 6 min on 3 workers', tone: 'good' }],
      concepts: [
        { term: 'MapReduce', def: 'A batch model: map records to key/value pairs, shuffle by key, then reduce each key’s values.' },
        { term: 'Shuffle', def: 'Redistributing intermediate data across workers so all records with the same key meet at one place.' },
      ],
      scene: {
        nodes: [app({ state: 'dim' }), prim({ state: 'dim' }), lake({ tag: pill('day=2026-11-18', 'file') }), ...workers({ tag: undefined }), wh({ tag: pill('revenue by city', 'sheet', 'good') })],
        links: [link('lake', 'm0'), link('lake', 'm1'), link('lake', 'm2'), link('m0', 'wh'), link('m1', 'wh'), link('m2', 'wh')],
        flows: [...[0, 1, 2].map((i) => flow(['lake', `m${i}`], { kind: 'heavy', rate: 1 })), ...[0, 1, 2].map((i) => flow([`m${i}`, 'wh'], { kind: 'write', rate: 0.6 }))],
        metrics: { fresh: '~24 h', prodload: '35%', rerun: { v: 'easy', tone: 'good' }, correct: 'yes' },
      },
    },
    {
      short: 'Streams',
      kind: 'technique',
      title: 'Stream processing: compute as events arrive',
      body: [
        'For minute-level freshness, the app publishes every trip event to a durable <b>event log</b>. A <b>stream job</b> consumes it continuously and keeps results up to date — rides per city per minute, average wait, surge multipliers — pushing them to a live view.',
        'Same transformations as the batch job, but on an unbounded input: there’s never a moment when “all the data” has arrived.',
      ],
      changes: [{ text: 'Freshness 24 h → ~5 s', tone: 'good' }],
      concepts: [{ term: 'Stream processing', def: 'Continuously computing results over an unbounded sequence of events as they arrive.' }],
      scene: {
        nodes: [app(), prim({ load: 35 }), log(), proc({ load: 50 }), live({ tag: pill('Lisbon: 412 rides/min', 'gauge', 'good') }), lake(), wh()],
        links: [link('app', 'prim', { arrow: 'both' }), link('app', 'log'), link('log', 'proc'), link('proc', 'live'), link('prim', 'lake', { style: 'dashed' }), link('lake', 'wh', { style: 'dashed' })],
        flows: [flow(['app', 'log'], { kind: 'write', rate: 4 }), flow(['log', 'proc', 'live'], { rate: 3 })],
        metrics: { fresh: { v: '~5 s', tone: 'good' }, prodload: '35%', rerun: 'replay log', correct: 'yes' },
      },
    },
    {
      short: 'Windows',
      kind: 'insight',
      title: 'Windows, and the event that arrives late',
      body: [
        '“Rides per minute” needs <b>windows</b>: tumbling (12:00–12:01, 12:01–12:02), sliding (last 5 min, every 30 s), or session windows. But which clock? A trip that ended at 12:00:58 in a tunnel may reach the log at 12:03. Counting by <b>processing time</b> puts it in the wrong minute; counting by <b>event time</b> is right, but when is the 12:00 window complete?',
        'Stream engines use <b>watermarks</b> — “we believe all events up to time T have arrived” — to close windows, plus an allowed lateness for stragglers that update already-emitted results.',
      ],
      concepts: [
        { term: 'Event time', def: 'When an event actually happened, as recorded in the event, as opposed to when it was processed.' },
        { term: 'Watermark', def: 'A stream engine’s estimate that no more events older than a given event time are expected.' },
      ],
      scene: {
        nodes: [app({ tag: pill('trip ended 12:00:58', 'clock') }), log({ tag: pill('arrived 12:03:10', 'clock', 'warn') }), proc({ tag: pill('watermark: 12:02:30', 'timer') }), live({ tag: pill('12:00 window: +1 (late)', 'refresh', 'warn') }), prim({ state: 'dim' })],
        links: [link('app', 'log'), link('log', 'proc'), link('proc', 'live')],
        flows: [flow(['app', 'log'], { kind: 'write', rate: 3 }), flow(['log', 'proc', 'live'], { rate: 2.5 }), flow(['app', 'log', 'proc'], { kind: 'heavy', rate: 0.3, speed: 0.4 })],
        metrics: { fresh: '~5 s', prodload: '35%', rerun: 'replay log', correct: { v: 'handles late', tone: 'good' } },
      },
    },
    {
      short: 'State',
      kind: 'technique',
      title: 'State and checkpoints',
      body: [
        'Counting per city per window means the job holds <b>state</b> — counters in memory or a local embedded store. If a worker crashes, that state must not vanish or double-count.',
        'The engine periodically takes a consistent <b>checkpoint</b>: all operator state plus the log offsets it corresponds to, written to durable storage. On failure it restores the checkpoint and re-reads the log from those offsets. Combined with idempotent or transactional sinks, results are as if each event was processed <b>exactly once</b>.',
      ],
      changes: [{ text: 'Checkpoint every 30 s', tone: 'good' }, { text: 'Crash → restore + replay', tone: 'good' }],
      concepts: [{ term: 'Checkpoint (stream)', def: 'A durable snapshot of operator state and input offsets used to recover a stream job without losing or duplicating effects.' }],
      scene: {
        nodes: [app(), log({ tag: pill('offset 88,412,903', 'hash') }), proc({ state: 'hot', tag: pill('restored from 12:04:30', 'refresh', 'good') }), live(), ckpt({ tag: pill('state + offsets', 'shield', 'good') }), prim({ state: 'dim' })],
        links: [link('app', 'log'), link('log', 'proc'), link('proc', 'live'), link('proc', 'ckpt', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['app', 'log'], { kind: 'write', rate: 3 }), flow(['log', 'proc', 'live'], { rate: 2 }), flow(['proc', 'ckpt'], { kind: 'write', rate: 0.4 })],
        metrics: { fresh: '~5 s', prodload: '35%', rerun: 'replay log', correct: { v: 'effectively once', tone: 'good' } },
      },
    },
    {
      short: 'Lag',
      kind: 'case',
      title: 'Case: New Year’s Eve',
      body: [
        'At midnight trip events jump 12×. The stream job can’t keep up; its <b>consumer lag</b> grows to 20 minutes, so the “live” view shows 23:40. Surge pricing, driven by it, reacts far too late.',
        'Because the log buffers everything, nothing is lost — the job catches up when traffic drops. To stay fresh, scale the job ahead of known peaks (partitions cap parallelism, so provision enough of them), and alert on lag, not just on errors.',
      ],
      changes: [{ text: 'Events ×12', tone: 'bad' }, { text: 'Lag 20 min', tone: 'bad' }],
      scene: {
        nodes: [app({ load: 80 }), log({ tag: pill('backlog: 20 min', 'clock', 'bad') }), proc({ load: 100, state: 'hot' }), live({ tag: pill('showing 23:40', 'clock', 'bad') }), prim({ state: 'dim' })],
        links: [link('app', 'log'), link('log', 'proc'), link('proc', 'live')],
        flows: [flow(['app', 'log'], { kind: 'write', rate: 9 }), flow(['log', 'proc', 'live'], { rate: 2, speed: 0.6 })],
        metrics: { fresh: { v: '20 min', tone: 'bad' }, prodload: '35%', rerun: 'replay log', correct: 'yes (late)' },
      },
    },
    {
      short: 'One or two',
      kind: 'tradeoff',
      title: 'Two pipelines, or one log to rule them',
      body: [
        'Many companies run both: streaming for fresh-but-approximate numbers, batch for slow-but-authoritative ones (the “Lambda” architecture). That means the same logic written twice, which slowly drifts apart, and dashboards that disagree.',
        'The alternative (“Kappa”) treats the retained event log as the source of truth and uses only stream jobs; to recompute history, replay the log through a new version of the job. Modern engines that run the same code in batch and streaming modes narrow the gap from both sides.',
      ],
      concepts: [
        { term: 'Lambda architecture', def: 'Running a batch layer for accurate historical results alongside a streaming layer for low-latency results.' },
        { term: 'Kappa architecture', def: 'Using a single streaming pipeline over a replayable log for both real-time and historical processing.' },
      ],
      scene: {
        nodes: [app(), log({ tag: pill('retained 30 days', 'clock') }), proc({ tag: pill('v2 replaying history', 'refresh', 'good') }), live(), lake(), wh({ tag: pill('same code, batch mode', 'sheet') }), prim({ state: 'dim' })],
        links: [link('app', 'log'), link('log', 'proc'), link('proc', 'live'), link('log', 'lake', { style: 'dashed', label: pill('archive') }), link('lake', 'wh')],
        flows: [flow(['app', 'log'], { kind: 'write', rate: 3 }), flow(['log', 'proc', 'live'], { rate: 2 }), flow(['log', 'lake', 'wh'], { kind: 'write', rate: 0.6 })],
        metrics: { fresh: '~5 s', prodload: '35%', rerun: { v: 'replay', tone: 'good' }, correct: 'one codebase' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bounded or unbounded',
      body: [
        'Keep analytics off the primary. <b>Batch</b> processes bounded data in big parallel jobs — simple, cheap per record, easy to rerun, hours behind. <b>Streams</b> process unbounded event logs continuously — seconds behind, but you must handle <b>windows</b>, <b>event time</b>, late data, <b>state</b> and <b>checkpoints</b>.',
        'A durable, replayable log connects both worlds: it buffers spikes, feeds stream jobs, archives to the lake, and lets you recompute when logic changes.',
      ],
      scene: {
        nodes: [app(), prim({ load: 35 }), log(), proc({ load: 50 }), live(), ckpt(), lake(), wh()],
        links: [link('app', 'prim', { arrow: 'both' }), link('app', 'log'), link('log', 'proc'), link('proc', 'live'), link('proc', 'ckpt', { style: 'dashed' }), link('log', 'lake', { style: 'dashed' }), link('lake', 'wh')],
        flows: [flow(['app', 'log'], { kind: 'write', rate: 3 }), flow(['log', 'proc', 'live'], { rate: 2 }), flow(['lake', 'wh'], { kind: 'heavy', rate: 0.4 })],
        metrics: { fresh: '~5 s / ~24 h', prodload: '35%', rerun: 'replay', correct: 'effectively once' },
      },
    },
  ],
};

export default lesson;
