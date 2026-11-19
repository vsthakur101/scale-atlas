import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const t1 = (extra: Partial<SceneNode> = {}) => box('t1', -12, -5, 'Transaction A', 'blue', 'user', { size: [1.2, 1.2], height: 26, ...extra });
const t2 = (extra: Partial<SceneNode> = {}) => box('t2', -12, 5, 'Transaction B', 'orange', 'user', { size: [1.2, 1.2], height: 26, ...extra });
const row = (name: string, extra: Partial<SceneNode> = {}) => db('row', 6, 0, name, { size: [1.5, 1.5], ...extra });

const LEVELS = ['Read uncommitted', 'Read committed', 'Snapshot (repeatable read)', 'Serializable'] as const;
const ANOMALIES: ReadonlyArray<string> = [
  'dirty reads, non-repeatable reads, phantoms, lost updates, write skew',
  'non-repeatable reads, phantoms, lost updates, write skew',
  'write skew (and phantom-based skew)',
  'none',
];

const lesson: Lesson = {
  slug: 'source-database-isolation-levels',
  title: 'Database Isolation Levels',
  blurb: 'What concurrent transactions can see of each other: the anomalies, the levels that prevent them, and the retries you pay for strictness.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'level', label: 'Isolation level', icon: 'lock' },
    { key: 'anom', label: 'Anomalies still possible', icon: 'alert' },
    { key: 'conflict', label: 'Chance a transaction conflicts', icon: 'activity' },
    { key: 'retry', label: 'Retries per 1,000 transactions', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why concurrent transactions need isolation at all', step: 1 },
    { text: 'Dirty reads, non-repeatable reads and lost updates', step: 2 },
    { text: 'Snapshot isolation and why it is not serializable', step: 5 },
    { text: 'Write skew: the anomaly snapshots miss', step: 6 },
    { text: 'What strictness costs in conflicts and retries', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'level', label: 'Isolation level (1–4)', min: 1, max: 4, step: 1, default: 3, unit: '', description: '1 read uncommitted · 2 read committed · 3 snapshot / repeatable read · 4 serializable.' },
      { key: 'conc', label: 'Concurrent transactions', min: 2, max: 500, step: 1, default: 50, unit: '', description: 'Transactions in flight at the same moment.' },
      { key: 'rows', label: 'Rows touched per transaction', min: 1, max: 50, step: 1, default: 5, unit: '', description: 'Rows each transaction writes.' },
      { key: 'n', label: 'Rows in the hot table', min: 100, max: 1000000, step: 100, default: 100000, unit: '', description: 'Size of the set the rows are drawn from. Smaller means more contention.' },
    ],
    calculate: (input, step) => {
      const level = Math.min(4, Math.max(1, Math.round(input.level ?? 3)));
      const c = Math.max(2, Math.round(input.conc ?? 50));
      const k = Math.max(1, Math.round(input.rows ?? 5));
      const n = Math.max(k, input.n ?? 1e5);
      // Two transactions share at least one of their k random rows out of n:
      const pair = 1 - Math.pow(1 - k / n, k);
      // A given transaction overlaps at least one of the other c − 1:
      const p = 1 - Math.pow(1 - pair, c - 1);
      const conflicts = level >= 3;
      return {
        level: step < 1 ? { v: '—' } : { v: LEVELS[level - 1] ?? '' },
        anom: step < 1 ? { v: '—' } : { v: ANOMALIES[level - 1] ?? '', tone: level === 4 ? 'good' : level === 3 ? 'warn' : 'bad' },
        conflict: step < 7 ? { v: '—' } : { v: `${(p * 100).toFixed(p < 0.1 ? 2 : 1)}%`, tone: p < 0.02 ? 'good' : p < 0.15 ? 'warn' : 'bad' },
        retry: step < 7 ? { v: '—' } : conflicts ? { v: `~${Math.round(p * 1000)}`, tone: p < 0.02 ? 'good' : p < 0.15 ? 'warn' : 'bad' } : { v: 'none (but wrong results possible)', tone: 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Transactions overlap in time',
      body: [
        'A database runs many transactions at once. Without rules, their reads and writes interleave and each can observe the other’s half-finished work. <b>Isolation</b> (the I in ACID) defines how much of that is allowed. The ideal is <b>serializable</b>: the result equals some one-at-a-time ordering of the same transactions.',
        'Perfect isolation costs throughput — locks, aborts, retries — so databases offer weaker <b>levels</b> that forbid some anomalies and permit others. Choosing one means knowing exactly which anomalies your code can tolerate. The sliders at the top let you see the anomaly list for each level and the conflict rate it costs.',
      ],
      concepts: [{ term: 'Serializable', def: 'Concurrent execution is equivalent to running the transactions one at a time in some order.' }],
      scene: { nodes: [t1(), t2(), row('accounts')], links: [link('t1', 'row', { arrow: 'both' }), link('t2', 'row', { arrow: 'both' })], flows: [flow(['t1', 'row'], { kind: 'write', rate: 1 }), flow(['t2', 'row'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Dirty read',
      kind: 'problem',
      title: 'Dirty read: seeing uncommitted data',
      body: [
        'A transfers 100 out of an account but hasn’t committed. B reads the balance — already reduced — and acts on it. Then A <b>rolls back</b>. B made a decision on a value that never officially existed.',
        'Only <b>read uncommitted</b> allows this, and most databases don’t really offer it (PostgreSQL treats it as read committed). It is the baseline every other level improves on: reads see committed data only.',
      ],
      changes: [{ text: 'A writes 900 (uncommitted); B reads 900; A rolls back to 1000', tone: 'bad' }, { text: 'Fix: read only committed data', tone: 'good' }],
      scene: {
        nodes: [t1({ tag: pill('write 900, then ROLLBACK', 'refresh') }), t2({ tag: pill('read 900 ← never committed', 'alert', 'bad') }), row('balance', { tag: pill('1000 committed · 900 dirty', 'file', 'warn') })],
        links: [link('t1', 'row'), link('row', 't2')],
        flows: [flow(['t1', 'row'], { kind: 'write', rate: 0.9 }), flow(['row', 't2'], { kind: 'fail', rate: 0.9 })],
      },
    },
    {
      short: 'Read committed',
      kind: 'problem',
      title: 'Non-repeatable reads and lost updates',
      body: [
        '<b>Read committed</b> stops dirty reads, but each statement sees whatever was committed when it ran. A reads a balance (100), B commits a change (150), A reads again and gets 150 — a <b>non-repeatable read</b>. A report that adds two queries can be inconsistent with itself.',
        'The nastier cousin is the <b>lost update</b>: A and B both read 100, A writes 110 (+10), B writes 120 (+20), and A’s increment vanishes. Fixes: an atomic <code>UPDATE … SET x = x + 10</code>, <code>SELECT … FOR UPDATE</code>, or compare-and-set with a version column. This is the default level in PostgreSQL, Oracle and SQL Server.',
      ],
      changes: [{ text: 'Same row read twice → two values', tone: 'bad' }, { text: 'Both add to 100 → one increment lost', tone: 'bad' }, { text: 'Fix: atomic update, FOR UPDATE, version column', tone: 'good' }],
      scene: {
        nodes: [t1({ tag: pill('reads 100 … reads 150', 'search', 'warn') }), t2({ tag: pill('commits 150 in between', 'check') }), row('balance')],
        links: [link('t1', 'row', { arrow: 'both' }), link('t2', 'row', { arrow: 'both' })],
        flows: [flow(['t1', 'row'], { rate: 0.8 }), flow(['t2', 'row'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Phantoms',
      kind: 'problem',
      title: 'Phantoms: rows that appear between queries',
      body: [
        'A runs <code>SELECT COUNT(*) FROM bookings WHERE room = 7 AND slot = 10</code> and gets 0. B inserts a booking for that room and slot and commits. A, believing the slot is free, inserts its own. Individual row locks can’t prevent it — the conflicting row <i>did not exist yet</i> when A looked.',
        'This is a <b>phantom</b>: a query’s result set changes because of rows that match the predicate. Stopping it needs a lock or check on the <i>range or predicate</i> (gap and next-key locks, predicate locks) or a unique constraint that the database enforces for you.',
      ],
      changes: [{ text: 'Check “slot free”, then insert — twice', tone: 'bad' }, { text: 'Fix: unique constraint or predicate locking', tone: 'good' }],
      scene: {
        nodes: [t1({ tag: pill('count = 0 → insert', 'search') }), t2({ tag: pill('insert + commit', 'check') }), row('bookings', { tag: pill('2 bookings, same slot', 'alert', 'bad') })],
        links: [link('t1', 'row', { arrow: 'both' }), link('t2', 'row')],
        flows: [flow(['t2', 'row'], { kind: 'write', rate: 0.8 }), flow(['t1', 'row'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Snapshot',
      kind: 'technique',
      title: 'Snapshot isolation: every transaction gets a consistent view',
      body: [
        'With <b>MVCC</b> (multi-version concurrency control) the database keeps several versions of each row. A <b>snapshot isolation</b> transaction reads from a consistent snapshot taken at its start: it sees everything committed before and nothing committed after. Repeated reads agree, and readers never block writers.',
        'Writers conflict only with writers: if two transactions update the same row, the second to commit aborts (“first committer wins”) and must retry — which also removes the lost update. This is what PostgreSQL’s <i>repeatable read</i> gives you, and Oracle’s default <i>serializable</i> is really this. It is strong, popular — and not serializable.',
      ],
      changes: [{ text: 'Consistent snapshot per transaction', tone: 'good' }, { text: 'Same-row write conflict → second commit aborts', tone: 'info' }, { text: 'Still allows write skew', tone: 'bad' }],
      concepts: [{ term: 'MVCC', def: 'Keeping multiple row versions so readers see an old committed version while writers create a new one.' }],
      scene: {
        nodes: [t1({ tag: pill('sees snapshot at T0', 'clock') }), t2(), row('row versions', { tag: pill('v1 (T0) · v2 (T5)', 'layers') })],
        links: [link('t1', 'row', { arrow: 'both' }), link('t2', 'row')],
        flows: [flow(['t1', 'row'], { rate: 1 }), flow(['t2', 'row'], { kind: 'write', rate: 0.7 })],
      },
    },
    {
      short: 'Write skew',
      kind: 'problem',
      title: 'Write skew: the anomaly snapshots cannot see',
      body: [
        'Rule: at least one doctor must stay on call. Alice and Bob are both on call; each runs a transaction that counts the doctors on call (2), decides it is safe to leave, and sets <i>their own</i> row to off-duty. They write <b>different rows</b>, so there is no write-write conflict — both commit and nobody is on call.',
        'Each transaction was correct against its own snapshot; together they broke an invariant that spans rows. This is <b>write skew</b>, the characteristic gap between snapshot isolation and serializable. Cures: <code>SELECT … FOR UPDATE</code> on everything you read, materialise the rule as a row you both update, or use true <b>serializable</b>.',
      ],
      changes: [{ text: 'Alice and Bob both see 2 on call → both leave → 0', tone: 'bad' }, { text: 'Fix: lock what you read, or serializable', tone: 'good' }],
      scene: {
        nodes: [t1({ name: 'Alice', tag: pill('on-call = 2 → leave', 'user') }), t2({ name: 'Bob', tag: pill('on-call = 2 → leave', 'user') }), row('on-call roster', { tag: pill('0 on call', 'alert', 'bad') })],
        links: [link('t1', 'row'), link('t2', 'row')],
        flows: [flow(['t1', 'row'], { kind: 'write', rate: 0.8 }), flow(['t2', 'row'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Serializable',
      kind: 'technique',
      title: 'Three ways to be serializable',
      body: [
        '<b>Actual serial execution</b>: run transactions one at a time on one thread (Redis, VoltDB) — simple and correct, bounded by one core, needs short transactions. <b>Two-phase locking</b>: take shared locks to read and exclusive locks to write, hold all of them until commit, including predicate locks for phantoms — correct, but readers and writers block each other and deadlocks occur.',
        '<b>Serializable snapshot isolation (SSI)</b>, used by PostgreSQL’s <i>serializable</i>, runs on snapshots and <b>detects</b> dangerous read-write dependency patterns, aborting one transaction when it finds one. Optimistic: cheap when contention is low, a flood of retries when it is high. Your application must be ready to retry on serialization failures.',
      ],
      changes: [{ text: 'Serial execution · 2PL · SSI', tone: 'info' }, { text: 'Always: retry on serialization failure', tone: 'good' }],
      concepts: [{ term: 'SSI', def: 'Serializable snapshot isolation: snapshots plus detection of read-write dependency cycles, aborting one transaction to break them.' }],
      scene: {
        nodes: [box('serial', -8, -6, 'Serial execution', 'blue', 'queue', { size: [1.3, 1.3], height: 28 }), box('lock', 4, -6, 'Two-phase locking', 'orange', 'lock', { size: [1.3, 1.3], height: 28 }), box('ssi', -2, 6, 'SSI (detect & abort)', 'green', 'shield', { size: [1.3, 1.3], height: 28 })],
        links: [],
        flows: [],
      },
    },
    {
      short: 'Cost',
      kind: 'tradeoff',
      title: 'What strictness costs: conflicts and retries',
      body: [
        'Stricter levels add aborts and waits. A rough model: if each of <code>c</code> concurrent transactions touches <code>k</code> random rows out of <code>n</code>, the chance two overlap is about <code>k²/n</code>, and a given transaction conflicts with at least one of the others with probability <code>1 − (1 − k²/n)^(c−1)</code>.',
        'Defaults (50 concurrent, 5 rows, 100,000 rows): about <b>1.2%</b> — ~12 retries per 1,000 transactions, harmless. Shrink the table to 1,000 rows and it climbs past 70% — the system now spends most of its time retrying — while raising concurrency to 500 on the original table gives about 12%. Contention, not the level itself, decides whether serializable is affordable — a hot row (a counter, a leaderboard top) makes every level painful.',
      ],
      changes: [{ text: 'Defaults ≈ 1.2% → harmless', tone: 'good' }, { text: 'Hot table (1,000 rows) → most transactions retry', tone: 'bad' }],
      scene: {
        nodes: [t1(), t2(), row('hot rows', { state: 'hot', tag: pill('contention = k²/n', 'gauge', 'warn') })],
        links: [link('t1', 'row'), link('t2', 'row')],
        flows: [flow(['t1', 'row'], { kind: 'write', rate: 1.5 }), flow(['t2', 'row'], { kind: 'fail', rate: 1 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Pick the level from the anomalies you can’t tolerate',
      body: [
        '<b>Read committed</b> stops dirty reads; <b>snapshot / repeatable read</b> adds consistent views and removes lost updates but allows write skew; <b>serializable</b> forbids everything at the price of aborts or waits. Names mean slightly different things in different databases — read yours.',
        'Practical defaults: stay on read committed or snapshot, protect specific invariants with <code>FOR UPDATE</code>, constraints and atomic updates, and use serializable where the invariant spans rows you can’t lock — with retry logic. Reduce contention first; it is what makes every level expensive.',
      ],
      scene: { nodes: [t1(), t2(), row('database')], links: [link('t1', 'row', { arrow: 'both' }), link('t2', 'row', { arrow: 'both' })], flows: [flow(['t1', 'row'], { rate: 1 }), flow(['t2', 'row'], { rate: 1 })] },
    },
  ],
};

export default lesson;
