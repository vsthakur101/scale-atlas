import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -16, 0, 'Application writes', 'green', 'server', { size: [1.3, 1.3], height: 26, ...extra });
const source = (extra: Partial<SceneNode> = {}) => db('source', -9, 0, 'Source database', { size: [1.5, 1.5], ...extra });
const wal = (extra: Partial<SceneNode> = {}) => disk('wal', -9, 8, 'Write-ahead / binary log', { size: [2.8, 1.1], height: 16, tone: 'yellow', icon: 'list', ...extra });
const conn = (extra: Partial<SceneNode> = {}) => box('conn', -1, 0, 'CDC connector', 'purple', 'refresh', { size: [1.4, 1.4], height: 28, ...extra });
const stream = (extra: Partial<SceneNode> = {}) => box('stream', 6, 0, 'Event stream (Kafka)', 'orange', 'queue', { size: [2, 1], height: 16, ...extra });
const sink = (id: string, d: number, name: string, extra: Partial<SceneNode> = {}) => box(id, 14, d, name, 'blue', 'server', { size: [1.2, 1.2], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 7200 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'source-change-data-capture-key-to-leverage-real-time-data',
  title: 'Change Data Capture',
  blurb: 'Reading the database’s own log to stream every insert, update and delete as events — without dual writes — plus the lag, backlog and log-retention arithmetic that decides whether it keeps up.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'wal', label: 'Log volume generated', icon: 'disk' },
    { key: 'backlog', label: 'Backlog after a connector outage', icon: 'layers' },
    { key: 'catch', label: 'Time to catch up', icon: 'clock' },
    { key: 'ret', label: 'Log retention needed to survive the outage', icon: 'alert' },
    { key: 'snap', label: 'Initial snapshot time', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why dual writes break and CDC is the alternative', step: 1 },
    { text: 'Log-based CDC versus polling and triggers', step: 2 },
    { text: 'The change event format and ordering', step: 3 },
    { text: 'Initial snapshot, then streaming', step: 4 },
    { text: 'Lag, backlog and log retention', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Row changes per second', min: 10, max: 500000, step: 10, default: 5000, unit: '/s', description: 'Inserts, updates and deletes on captured tables.' },
      { key: 'bytes', label: 'Log bytes per change', min: 50, max: 5000, step: 10, default: 500, unit: ' B', description: 'Size of one change in the database log.' },
      { key: 'cap', label: 'Connector throughput', min: 100, max: 1000000, step: 100, default: 20000, unit: ' events/s', description: 'Events per second the connector and pipeline can process.' },
      { key: 'out', label: 'Connector outage', min: 0, max: 1440, step: 5, default: 30, unit: ' min', description: 'Time the connector is down or paused.' },
      { key: 'rows', label: 'Rows in captured tables (for the snapshot)', min: 1000000, max: 10000000000, step: 1000000, default: 500000000, unit: '', description: 'Existing data to copy before streaming.' },
      { key: 'srate', label: 'Snapshot read speed', min: 1000, max: 1000000, step: 1000, default: 50000, unit: ' rows/s', description: 'Rows per second the snapshot can read without hurting production.' },
    ],
    calculate: (input, step) => {
      const rate = Math.max(1, input.rate ?? 5000);
      const bytes = Math.max(1, input.bytes ?? 500);
      const cap = Math.max(1, input.cap ?? 20000);
      const outage = Math.max(0, input.out ?? 30) * 60;
      const rows = Math.max(1, input.rows ?? 5e8);
      const srate = Math.max(1, input.srate ?? 5e4);
      const backlog = rate * outage;
      const catchT = cap > rate ? backlog / (cap - rate) : Infinity;
      return {
        wal: step < 1 ? { v: '—' } : { v: `${fmtB(rate * bytes * 86400)}/day (${((rate * bytes) / 1e6).toFixed(1)} MB/s)` },
        backlog: step < 4 ? { v: '—' } : { v: `${fmtN(backlog)} events (${fmtB(backlog * bytes)})`, tone: 'warn' },
        catch: step < 4 ? { v: '—' } : Number.isFinite(catchT) ? { v: fmtT(catchT), tone: catchT < 600 ? 'good' : catchT < 3600 ? 'warn' : 'bad' } : { v: 'never — connector slower than the source', tone: 'bad' },
        ret: step < 4 ? { v: '—' } : { v: `${fmtB(backlog * bytes)} of log must be kept`, tone: 'warn' },
        snap: step < 3 ? { v: '—' } : { v: fmtT(rows / srate), tone: rows / srate < 3600 ? 'good' : rows / srate < 86400 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Keeping other systems in sync with the database',
      body: [
        'The database is the source of truth, but the same changes are needed elsewhere: a search index, a cache, a data warehouse, a downstream service. The obvious way — the application writes to the database <i>and</i> to the other system — is a <b>dual write</b>, and it is broken by construction: there is no atomic commit across both, so a crash or failure between them leaves them <b>permanently inconsistent</b>, and concurrent writers can apply the two updates in different orders.',
        '<b>Change data capture (CDC)</b> fixes it by making the database’s own commit log the single source: capture every committed change <i>from the database</i> and stream it to whoever needs it. Consumers are eventually consistent but <b>never diverge</b>, because they replay exactly what the database committed, in commit order.',
      ],
      scene: { nodes: [app(), source(), box('search', 6, -6, 'Search index', 'blue', 'search', { size: [1.2, 1.2], height: 22, tag: pill('out of sync?', 'alert', 'warn') }), box('cache', 6, 6, 'Cache', 'orange', 'layers', { size: [1.2, 1.2], height: 22 })], links: [link('app', 'source'), link('app', 'search', { style: 'dashed' }), link('app', 'cache', { style: 'dashed' })], flows: [flow(['app', 'source'], { kind: 'write', rate: 1.5 }), flow(['app', 'search'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Log-based',
      kind: 'technique',
      title: 'Read the log, not the tables',
      body: [
        'Databases already write every change to a <b>transaction log</b> for durability and replication — PostgreSQL’s write-ahead log (WAL) via logical decoding, MySQL’s binlog, SQL Server’s transaction log, MongoDB’s oplog. A CDC connector (Debezium is the best-known) <b>acts like a replica</b>: it reads that log, decodes each committed row change into an event and publishes it to a stream such as Kafka.',
        'Alternatives are worse: <b>polling</b> (<code>SELECT … WHERE updated_at &gt; ?</code>) misses deletes, adds load and can miss rows committed out of order; <b>triggers</b> write to an outbox table inside every transaction, slowing writes and coupling logic to the schema. Log-based CDC adds <b>almost no load</b> on the source, captures deletes and every intermediate update, and preserves commit order.',
      ],
      changes: [{ text: 'Log-based: low overhead, deletes included, commit order', tone: 'good' }, { text: 'Polling misses deletes; triggers slow writes', tone: 'bad' }],
      concepts: [{ term: 'Change data capture', def: 'Capturing committed changes from a database’s transaction log and publishing them as an ordered stream of events.' }],
      scene: { nodes: [app(), source(), wal({ tag: pill('already written for durability', 'check') }), conn({ tag: pill('reads like a replica', 'search') }), stream()], links: [link('app', 'source'), link('source', 'wal'), link('wal', 'conn'), link('conn', 'stream')], flows: [flow(['app', 'source'], { kind: 'write', rate: 1.5 }), flow(['wal', 'conn', 'stream'], { rate: 1.5 })] },
    },
    {
      short: 'Events',
      kind: 'technique',
      title: 'What a change event looks like',
      body: [
        'Each event carries the <b>operation</b> (create / update / delete), the <b>primary key</b>, the row state <b>before</b> and <b>after</b> (when the database logs it), a <b>source position</b> (log sequence number, transaction id) and a timestamp. Events are partitioned in the stream by the row’s <b>primary key</b>, so all changes to one row stay in order — the guarantee consumers rely on; ordering across different rows is not preserved.',
        'Consumers apply events idempotently (they may be delivered more than once — see the Delivery Semantics lesson), using the key as identity: upsert into a search index, invalidate or update a cache entry (see Multi-Tier Caching), append to a warehouse table. <b>Schema changes</b> are events too, requiring a schema registry and compatible evolution. The <b>outbox pattern</b> — the app writes a domain event to an <code>outbox</code> table in the same transaction and CDC publishes it — gives reliable event publishing without dual writes.',
      ],
      changes: [{ text: 'op · key · before · after · log position', tone: 'info' }, { text: 'Partition by key → per-row ordering', tone: 'good' }, { text: 'Outbox table + CDC = reliable events', tone: 'good' }],
      scene: { nodes: [conn(), stream({ tag: pill('key = order 8841', 'hash') }), sink('s1', -6, 'Search index', { tag: pill('upsert', 'check') }), sink('s2', 0, 'Cache', { tag: pill('invalidate', 'check') }), sink('s3', 6, 'Warehouse', { tag: pill('append', 'check') })], links: [link('conn', 'stream'), link('stream', 's1'), link('stream', 's2'), link('stream', 's3')], flows: [flow(['conn', 'stream', 's1'], { rate: 1.5 }), flow(['stream', 's2'], { rate: 1.2 }), flow(['stream', 's3'], { rate: 1.2 })] },
    },
    {
      short: 'Snapshot',
      kind: 'technique',
      title: 'Initial snapshot, then stream',
      body: [
        'The log doesn’t go back forever, so a new consumer needs the <b>existing data</b> first. The connector takes a consistent <b>snapshot</b> of the captured tables — reading at a recorded log position so no change is missed or duplicated — emits each row as a “read” event, and then switches to <b>streaming from that position</b>. At 50,000 rows/s, 500 million rows take <b>2.8 hours</b>; snapshots are throttled and run against a replica where possible to avoid hurting production.',
        'Incremental snapshots (watermark-based, chunk by chunk) let you re-snapshot a table <i>while streaming continues</i> without a long lock, which is how you add a table or backfill after a bug. Plan for snapshot duration when you introduce CDC to large tables, and for the log growth while it runs.',
      ],
      changes: [{ text: '500M rows ÷ 50k/s = 2.8 h snapshot', tone: 'info' }, { text: 'Snapshot at a log position, then stream from it', tone: 'good' }],
      scene: { nodes: [source({ tag: pill('consistent read at LSN 9,120', 'check') }), conn({ tag: pill('snapshot → stream', 'refresh') }), stream()], links: [link('source', 'conn'), link('conn', 'stream')], flows: [flow(['source', 'conn', 'stream'], { rate: 2.5 })] },
    },
    {
      short: 'Lag & logs',
      kind: 'problem',
      title: 'Lag, backlog and the log retention clock',
      body: [
        'If the connector stops (a crash, a deploy, a downstream outage), the database keeps writing; the unread changes form a <b>backlog</b>: 5,000 changes/s for 30 minutes is <b>9 million events</b> (~4.5 GB). When it restarts it must process faster than the source produces: at 20,000 events/s against 5,000 incoming it drains at 15,000/s and catches up in <b>10 minutes</b>. A connector no faster than the write rate <b>never catches up</b>.',
        'The dangerous part: the database only keeps log files while something needs them. A connector’s <b>replication slot</b> (PostgreSQL) forces the database to <b>retain WAL</b> until it’s consumed — a stalled connector can fill the disk and take down the source. Conversely, if the log is purged before the connector returns, it must <b>re-snapshot</b>. So: monitor <b>lag</b> and slot size, alert early, size log retention above your worst outage, cap retained WAL, and keep connector capacity several times the peak write rate.',
      ],
      changes: [{ text: '30 min × 5,000/s = 9M events (~4.5 GB) backlog', tone: 'info' }, { text: 'Catch-up = backlog ÷ (capacity − rate) = 10 min', tone: 'info' }, { text: 'Stalled slot retains WAL → disk full risk', tone: 'bad' }],
      scene: { nodes: [source({ state: 'hot', tag: pill('writes continue', 'bolt') }), wal({ tag: pill('retained for the slot: growing', 'alert', 'warn') }), conn({ state: 'down', tone: 'red', tag: pill('down 30 min', 'alert', 'bad') })], links: [link('source', 'wal'), link('wal', 'conn', { style: 'broken' })], flows: [flow(['source', 'wal'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'The database’s log is the integration bus',
      body: [
        'CDC streams committed changes from the database log — no dual writes, deletes included, per-row ordering — to caches, indexes, warehouses and services; the <b>outbox pattern</b> publishes domain events reliably. Start with a consistent snapshot, then stream.',
        'Operate it by lag: backlog = rate × outage, catch-up = backlog ÷ (capacity − rate), and keep log retention above the longest outage you will accept. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [app(), source(), conn(), stream(), sink('s1', -3, 'Consumer'), sink('s2', 3, 'Consumer')], links: [link('app', 'source'), link('source', 'conn'), link('conn', 'stream'), link('stream', 's1'), link('stream', 's2')], flows: [flow(['app', 'source', 'conn', 'stream', 's1'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
