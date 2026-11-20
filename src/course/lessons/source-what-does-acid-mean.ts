import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => crowd('app', -17, 0, 10, 'concurrent transactions', extra);
const engine = (extra: Partial<SceneNode> = {}) => box('engine', -8, 0, 'Transaction manager', 'orange', 'layers', { size: [1.6, 1.6], height: 30, ...extra });
const buf = (extra: Partial<SceneNode> = {}) => db('buf', 1, -7, 'Buffer pool (dirty pages in RAM)', { size: [1.5, 1.5], ...extra });
const wal = (extra: Partial<SceneNode> = {}) => disk('wal', 1, 7, 'Write-ahead log (sequential, fsync)', { size: [3, 1.2], height: 14, tone: 'yellow', icon: 'list', ...extra });
const data = (extra: Partial<SceneNode> = {}) => disk('data', 11, -7, 'Data files (checkpointed)', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const crash = (extra: Partial<SceneNode> = {}) => box('crash', 11, 7, 'Crash → recovery replay', 'red', 'alert', { size: [1.4, 1.4], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtM = (mb: number): string => (mb >= 1e6 ? `${(mb / 1e6).toFixed(1)} TB` : mb >= 1e3 ? `${(mb / 1e3).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(s < 10 ? 1 : 0)} s`);

const lesson: Lesson = {
  slug: 'source-what-does-acid-mean',
  title: 'ACID in Practice: Write-Ahead Logging, Group Commit and Crash Recovery',
  blurb: 'How a database delivers atomicity and durability with a sequential log, why fsync is the throughput limit, how group commit and checkpoints change the numbers — and how long a crash recovery takes.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'solo', label: 'Commits/s with one fsync per commit', icon: 'gauge' },
    { key: 'group', label: 'Commits/s with group commit', icon: 'bolt' },
    { key: 'wal', label: 'Log written between checkpoints', icon: 'disk' },
    { key: 'rec', label: 'Crash-recovery time (replay)', icon: 'timer' },
  ],
  goals: [
    { text: 'What each letter of ACID really requires', step: 1 },
    { text: 'The write-ahead log: durable before visible', step: 2 },
    { text: 'fsync and group commit', step: 3 },
    { text: 'Checkpoints and crash recovery (redo and undo)', step: 4 },
    { text: 'Isolation and consistency: locks, MVCC, constraints', step: 5 },
  ],
  legend: ['request', 'write', 'response', 'fail'],
  dynamic: {
    parameters: [
      { key: 'fsync', label: 'fsync latency', min: 0.05, max: 20, step: 0.05, default: 2, unit: ' ms', description: 'Time for the log device to acknowledge a durable flush.' },
      { key: 'clients', label: 'Concurrent committing transactions', min: 1, max: 1000, step: 1, default: 64, unit: '', description: 'Transactions waiting to commit at once.' },
      { key: 'maxg', label: 'Max commits per group flush', min: 1, max: 1000, step: 1, default: 256, unit: '', description: 'Upper bound on a group commit batch.' },
      { key: 'rate', label: 'Log generation rate', min: 0.5, max: 500, step: 0.5, default: 20, unit: ' MB/s', description: 'Write-ahead log bytes produced.' },
      { key: 'ckpt', label: 'Checkpoint interval', min: 10, max: 3600, step: 10, default: 300, unit: ' s', description: 'Time between checkpoints.' },
      { key: 'replay', label: 'Recovery replay speed', min: 10, max: 2000, step: 10, default: 200, unit: ' MB/s', description: 'How fast redo applies log records.' },
    ],
    calculate: (input, step) => {
      const fsync = Math.max(0.001, input.fsync ?? 2) / 1000;
      const clients = Math.max(1, Math.round(input.clients ?? 64));
      const maxg = Math.max(1, Math.round(input.maxg ?? 256));
      const rate = Math.max(0.001, input.rate ?? 20);
      const ckpt = Math.max(1, input.ckpt ?? 300);
      const replay = Math.max(0.001, input.replay ?? 200);
      const solo = 1 / fsync;
      const group = Math.min(clients, maxg) / fsync;
      const logMb = rate * ckpt;
      const rec = logMb / replay;
      return {
        solo: step < 2 ? { v: '—' } : { v: `${fmtN(solo)}/s`, tone: solo < 1000 ? 'warn' : 'good' },
        group: step < 2 ? { v: '—' } : { v: `${fmtN(group)}/s (${Math.min(clients, maxg)} commits per flush, ${(group / solo).toFixed(0)}×)`, tone: 'good' },
        wal: step < 3 ? { v: '—' } : { v: fmtM(logMb) },
        rec: step < 3 ? { v: '—' } : { v: fmtT(rec), tone: rec < 60 ? 'good' : rec < 300 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'ACID',
      kind: 'insight',
      title: 'Four promises about a transaction',
      body: [
        '<b>Atomicity</b>: a transaction’s changes happen entirely or not at all — a crash halfway through must leave no partial effects. <b>Consistency</b>: a transaction moves the database from one valid state to another, with the database enforcing declared constraints (keys, uniqueness, foreign keys, checks) — the application defines what “valid” means. <b>Isolation</b>: concurrent transactions don’t see each other’s partial work, to a defined level (see the Isolation Levels lesson). <b>Durability</b>: once commit returns, the data survives a crash or power loss.',
        'Atomicity and durability both come from one mechanism — the <b>write-ahead log (WAL)</b>; isolation comes from <b>locks or multi-version concurrency control (MVCC)</b>; consistency from constraint checks plus the other three. The interesting engineering is the cost: <b>durability means waiting for the disk</b>, and that wait, not CPU, usually sets commit throughput.',
      ],
      scene: { nodes: [app(), engine({ tag: pill('A · C · I · D', 'layers') }), buf(), wal()], links: [link('app', 'engine'), link('engine', 'buf'), link('engine', 'wal')], flows: [flow(['app', 'engine', 'wal'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'WAL',
      kind: 'technique',
      title: 'The write-ahead log: durable before visible',
      body: [
        'Updating data pages in place is slow and unsafe — pages are scattered across the disk, and a crash mid-write leaves a torn page. The WAL rule: <b>before a changed page may be written to the data files, the log record describing the change must be on durable storage</b> — and a transaction is committed when its <b>commit record</b> is durable in the log. Changes are first made to pages in the <b>buffer pool</b> (RAM); dirty pages are flushed to the data files lazily, in the background, in whatever order is efficient.',
        'This turns many random writes into one <b>sequential append</b> (fast on any disk and SSD), and makes the log the source of truth: if the machine dies with dirty pages unflushed, the log can <b>redo</b> them; if it dies with uncommitted changes already on disk, the log lets recovery <b>undo</b> them. The same idea appears as the journal in a file system (see the Linux file system lesson), the commit log in Cassandra, the redo log in MySQL/InnoDB and the WAL in PostgreSQL and SQLite.',
      ],
      changes: [{ text: 'Log record durable before the data page is written', tone: 'good' }, { text: 'Commit = commit record durable in the log', tone: 'info' }, { text: 'Random page writes deferred; log is sequential', tone: 'good' }],
      concepts: [{ term: 'WAL (write-ahead logging)', def: 'A rule and mechanism: log every change durably before applying it to data files, so a crash can be repaired by replaying or rolling back from the log.' }],
      scene: { nodes: [engine(), buf({ tag: pill('dirty pages (RAM)', 'db') }), wal({ tag: pill('append + fsync at commit', 'disk', 'good') }), data({ tag: pill('flushed lazily', 'disk') })], links: [link('engine', 'wal'), link('engine', 'buf'), link('buf', 'data', { style: 'dashed' })], flows: [flow(['engine', 'wal'], { kind: 'write', rate: 1.6 }), flow(['buf', 'data'], { kind: 'write', rate: 0.6 })] },
    },
    {
      short: 'fsync',
      kind: 'problem',
      title: 'fsync is the throughput limit: group commit',
      body: [
        '“Durable” means the bytes reached stable media, so commit must call <code>fsync</code> (or <code>fdatasync</code>/<code>O_DSYNC</code>) and wait. If each commit flushed the log by itself, throughput is capped at <code>1 / fsync latency</code> — at 2 ms that is only <b>500 commits/s</b>, however many cores or clients you have. (Disabling fsync or using <code>synchronous_commit=off</code> removes the wait but allows losing the last moments of committed transactions on a crash.)',
        '<b>Group commit</b> fixes this: while one flush is in flight, other transactions append their commit records and wait; the next flush makes <i>all of them</i> durable at once. With 64 concurrent committers, each 2 ms flush covers 64 commits: <b>32,000 commits/s</b>, 64× higher, at the price of up to one flush of added latency per commit. The ceiling becomes the group size cap (256 here) and log bandwidth. Devices with <b>power-loss-protected write caches</b> (enterprise SSDs, battery-backed RAID) make fsync fast — and consumer devices that acknowledge flushes they have not performed are how databases silently lose “durable” data.',
      ],
      changes: [{ text: 'One fsync per commit: 1/2 ms = 500 commits/s', tone: 'bad' }, { text: 'Group commit: 64 commits per flush = 32,000/s', tone: 'good' }, { text: 'Trust only devices that honour flush', tone: 'info' }],
      scene: { nodes: [app({ tag: pill('64 waiting to commit', 'clock') }), engine({ tag: pill('batch into one flush', 'layers', 'good') }), wal({ tag: pill('1 fsync = 64 commits', 'check', 'good') })], links: [link('app', 'engine'), link('engine', 'wal')], flows: [flow(['app', 'engine', 'wal'], { kind: 'write', rate: 3 })] },
    },
    {
      short: 'Recovery',
      kind: 'technique',
      title: 'Checkpoints and crash recovery',
      body: [
        'If the log grew forever, recovery would replay all of history. A <b>checkpoint</b> forces dirty pages up to some log position onto the data files and records that position, so recovery only needs to start from the <b>last checkpoint’s redo point</b>. After a crash, recovery has three phases (the ARIES family): <b>analysis</b> (find which transactions were active and which pages dirty), <b>redo</b> (replay log records forward to restore the state at the moment of the crash, including changes of uncommitted transactions), and <b>undo</b> (roll back transactions with no commit record, writing compensation records so undo itself is crash-safe).',
        'The trade-off is checkpoint frequency. At 20 MB/s of log, a 300 s interval leaves <b>6,000 MB</b> to replay: 6,000 ÷ 200 MB/s = <b>30 s</b> of recovery. Checkpoint every 60 s and replay is 6 s — but checkpoints themselves cause bursts of random data-file I/O (spread them out, as PostgreSQL’s <code>checkpoint_completion_target</code> does). Long recovery time is also unavailability: standbys apply the same log continuously, so promotion is near instant (see the High Availability lesson).',
      ],
      changes: [{ text: 'Checkpoint bounds how much log must be replayed', tone: 'good' }, { text: 'Analysis → redo → undo', tone: 'info' }, { text: '20 MB/s × 300 s = 6 GB → 30 s replay at 200 MB/s', tone: 'info' }],
      scene: { nodes: [wal({ tag: pill('last checkpoint → crash point', 'list') }), crash({ tag: pill('redo, then undo uncommitted', 'refresh') }), data({ tag: pill('consistent again', 'check', 'good') })], links: [link('wal', 'crash'), link('crash', 'data')], flows: [flow(['wal', 'crash', 'data'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'I and C',
      kind: 'technique',
      title: 'Isolation and consistency: locks, MVCC and constraints',
      body: [
        'Isolation is built beside the WAL: <b>two-phase locking</b> (take locks as you go, release at commit — readers block writers) or <b>MVCC</b> (each row keeps multiple versions with transaction ids; a reader sees a snapshot, so readers don’t block writers — PostgreSQL, InnoDB, Oracle). The levels from read committed to serializable differ in which anomalies they allow (dirty reads, lost updates, write skew). <b>Serializable</b> costs aborts or lock contention; many systems default to read committed or repeatable read and rely on application care.',
        '<b>Consistency</b> is the C that depends on you: declare constraints (<code>PRIMARY KEY</code>, <code>UNIQUE</code>, <code>FOREIGN KEY</code>, <code>CHECK</code>) so the database rejects invalid states regardless of which code path produced them. NoSQL systems often give ACID only per document or per partition, or trade it for availability (see the CAP and Consistency Models lessons), and distributed transactions (two-phase commit, sagas) are a different, costlier problem. Figures in this lesson are first-order model outputs; real systems add buffering, batching and device-specific behaviour.',
      ],
      changes: [{ text: 'Locks vs MVCC snapshots for isolation', tone: 'info' }, { text: 'Constraints encode consistency in the database', tone: 'good' }],
      scene: { nodes: [app(), engine({ tag: pill('MVCC snapshot + constraint check', 'shield', 'good') }), buf(), wal()], links: [link('app', 'engine'), link('engine', 'buf'), link('engine', 'wal')], flows: [flow(['app', 'engine', 'buf'], { rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'The log makes it atomic and durable; fsync sets the speed',
      body: [
        'ACID rests on the <b>write-ahead log</b>: durable before visible, redo and undo after a crash. Commit throughput is bounded by fsync latency until <b>group commit</b> amortises each flush over many transactions; <b>checkpoints</b> bound recovery time at the cost of write bursts.',
        'Isolation comes from locks or MVCC, and consistency from constraints you declare.',
      ],
      scene: { nodes: [app(), engine(), buf(), wal(), data()], links: [link('app', 'engine'), link('engine', 'buf'), link('engine', 'wal'), link('buf', 'data', { style: 'dashed' })], flows: [flow(['app', 'engine', 'wal'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
