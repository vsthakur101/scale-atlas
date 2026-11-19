import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill, you } from '../kit';

const ana = (extra: Partial<SceneNode> = {}) => you('ana', -11, -4, { label: pill('Ana', 'user'), ...extra });
const ben = (extra: Partial<SceneNode> = {}) => you('ben', -11, 6, { label: pill('Ben', 'user'), ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', -2, 1, 'Booking', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('db', 7, 0, 'Bookings DB', extra);
const pay = (extra: Partial<SceneNode> = {}) => box('pay', 7, 9, 'Payments', 'teal', 'dollar', { size: [1.3, 1.3], height: 34, ...extra });
const wires = [link('ana', 'app'), link('ben', 'app'), link('app', 'db', { arrow: 'both' })];

const lesson: Lesson = {
  slug: 'transactions',
  title: 'Transactions',
  blurb: 'All-or-nothing changes and isolation from concurrent users — how databases stop the last seat being sold twice.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'sold', label: 'Seat 14C sold', icon: 'users' },
    { key: 'conflicts', label: 'Conflicts', icon: 'alert' },
    { key: 'tps', label: 'Tx / s', icon: 'activity' },
    { key: 'iso', label: 'Isolation', icon: 'shield' },
  ],
  goals: [
    { text: 'Atomicity: all-or-nothing changes', step: 2 },
    { text: 'Race conditions under weak isolation', step: 3 },
    { text: 'Pessimistic locks vs optimistic versions', step: 5 },
    { text: 'Snapshot isolation, write skew and serializable', step: 7 },
    { text: 'Deadlocks and keeping transactions short', step: 8 },
  ],
  legend: ['request', 'write', 'response', 'fail'],
  steps: [
    {
      short: 'Half done',
      kind: 'problem',
      title: 'The charge went through, the booking didn’t',
      body: [
        'Booking a seat takes three writes: mark the seat taken, insert a booking row, record the payment. The app crashes between the second and third. Now there’s a booking with no payment record — and nobody knows whether to refund.',
      ],
      changes: [{ text: '2 of 3 writes applied', tone: 'bad' }],
      scene: {
        nodes: [ana(), ben({ state: 'dim' }), app({ state: 'down', tag: pill('crashed after write 2', 'alert', 'bad') }), store({ tag: pill('booking ✓ · payment ✗', 'alert', 'bad') })],
        links: wires,
        flows: [flow(['ana', 'app'], { rate: 0.6 })],
        metrics: { sold: '1', conflicts: '—', tps: '—', iso: 'none' },
      },
    },
    {
      short: 'Atomic',
      kind: 'technique',
      title: 'Atomicity: all or nothing',
      body: [
        'Wrap the writes in a transaction: <code>BEGIN; …three writes…; COMMIT;</code>. The database guarantees that either all of them become visible together at commit, or — on crash, error or <code>ROLLBACK</code> — none do. The WAL makes this durable.',
        'That’s the <b>A</b> and <b>D</b> in ACID. The trickier letter is <b>I</b>: what happens when two transactions run at the same time.',
      ],
      changes: [{ text: 'Crash → automatic rollback', tone: 'good' }],
      concepts: [
        { term: 'ACID', def: 'Atomicity, Consistency, Isolation, Durability: the guarantees of database transactions.' },
        { term: 'Atomicity', def: 'A transaction’s writes are applied entirely or not at all.' },
      ],
      scene: {
        nodes: [ana(), ben({ state: 'dim' }), app({ tag: pill('BEGIN … COMMIT', 'lock', 'good') }), store({ tag: pill('3 writes, one commit', 'check', 'good') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.8 })],
        metrics: { sold: '1', conflicts: '—', tps: '800', iso: 'read committed' },
      },
    },
    {
      short: 'Race',
      kind: 'problem',
      title: 'The last seat, sold twice',
      body: [
        'Ana and Ben both click “buy” on the last seat within the same millisecond. Each transaction runs <code>SELECT status FROM seats WHERE id = \'14C\'</code>, sees <b>free</b>, then updates it to taken and inserts a booking. Both commit.',
        'Each transaction was atomic; the problem is they <b>interleaved</b>. Under the common default, <i>read committed</i>, nothing stops two transactions from acting on the same stale read.',
      ],
      changes: [{ text: 'Both read “free”', tone: 'bad' }, { text: 'Seat 14C sold twice', tone: 'bad' }],
      concepts: [
        { term: 'Read committed', def: 'An isolation level that only shows committed data, but allows other transactions’ commits to appear between your statements.' },
        { term: 'Lost update', def: 'Two read-modify-write cycles interleave and one overwrites the other’s change.' },
      ],
      scene: {
        nodes: [ana({ tag: pill('reads: free', 'check') }), ben({ tag: pill('reads: free', 'check') }), app(), store({ state: 'hot', tag: pill('14C → Ana AND Ben', 'alert', 'bad') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.9 }), flow(['ben', 'app', 'db'], { kind: 'write', back: true, rate: 0.9 })],
        metrics: { sold: { v: '2', tone: 'bad' }, conflicts: { v: 'undetected', tone: 'bad' }, tps: '800', iso: 'read committed' },
      },
    },
    {
      short: 'Lock',
      kind: 'technique',
      title: 'Pessimistic: lock the row you’ll change',
      body: [
        '<code>SELECT … FROM seats WHERE id = \'14C\' FOR UPDATE</code> takes a row lock. Ben’s transaction, reaching the same row, <b>waits</b> until Ana’s commits — then reads the new value, “taken”, and shows a polite error.',
        'Simple and correct. The cost: contention. While Ana’s transaction holds the lock, everyone touching that row queues — so never hold a lock across a slow call, like a payment API.',
      ],
      changes: [{ text: 'Ben waits 4 ms, then sees “taken”', tone: 'good' }],
      concepts: [{ term: 'SELECT FOR UPDATE', def: 'Reads rows and locks them against concurrent modification until the transaction ends.' }],
      scene: {
        nodes: [ana({ tag: pill('holds lock 14C', 'lock', 'good') }), ben({ tag: pill('waiting…', 'clock', 'warn') }), app(), store({ tag: pill('row lock: 14C', 'lock') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.9 }), flow(['ben', 'app'], { rate: 0.6, speed: 0.4 })],
        metrics: { sold: { v: '1', tone: 'good' }, conflicts: '1 (waited)', tps: '650', iso: 'row locks' },
      },
    },
    {
      short: 'Optimistic',
      kind: 'technique',
      title: 'Optimistic: check the version on write',
      body: [
        'Alternatively, add a <code>version</code> column. Read the seat (version 7), then write <code>UPDATE seats SET status=\'taken\', version=8 WHERE id=\'14C\' AND version=7</code>. If someone else got there first, the version is already 8 and <b>zero rows</b> update — retry or report.',
        'No locks are held while the user thinks or the app computes. It shines when conflicts are rare and degrades into retry storms when they’re common.',
      ],
      changes: [{ text: 'Ben’s update hits 0 rows → retry', tone: 'good' }],
      concepts: [{ term: 'Optimistic concurrency control', def: 'Proceed without locks and detect conflicts at write time using a version or timestamp check.' }],
      scene: {
        nodes: [ana({ tag: pill('v7 → v8 ✓', 'check', 'good') }), ben({ tag: pill('v7 → 0 rows', 'refresh', 'warn') }), app(), store({ tag: pill('14C @ version 8', 'hash') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.9 }), flow(['ben', 'app', 'db'], { kind: 'fail', rate: 0.6 })],
        metrics: { sold: { v: '1', tone: 'good' }, conflicts: '1 (retried)', tps: '780', iso: 'version check' },
      },
    },
    {
      short: 'Snapshots',
      kind: 'insight',
      title: 'MVCC: readers never block writers',
      body: [
        'Most databases keep several versions of each row (<b>multi-version concurrency control</b>). Each transaction reads from a consistent <b>snapshot</b> as of when it started, while writers create new versions alongside. Long reports don’t block bookings, and bookings don’t block reports.',
        'Running every transaction against its snapshot is <b>snapshot isolation</b> (“repeatable read” in Postgres). It prevents most anomalies, but not all.',
      ],
      concepts: [
        { term: 'MVCC', def: 'Multi-version concurrency control: keeping multiple row versions so reads see a consistent snapshot without locking.' },
        { term: 'Snapshot isolation', def: 'Each transaction sees the database as of its start; concurrent writes to the same row conflict.' },
      ],
      scene: {
        nodes: [ana({ tag: pill('report @ snapshot T1', 'list') }), ben({ tag: pill('booking writes v9', 'activity') }), app(), store({ tag: pill('14C: v7, v8, v9', 'layers') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { back: true, rate: 1.2 }), flow(['ben', 'app', 'db'], { kind: 'write', back: true, rate: 1.2 })],
        metrics: { sold: '1', conflicts: 'none', tps: '1,100', iso: 'snapshot' },
      },
    },
    {
      short: 'Write skew',
      kind: 'case',
      title: 'Case: write skew slips through snapshots',
      body: [
        'Rule: at least one venue manager must be on call. Two managers, both on call, each run: “count on-call managers — 2, so I can leave” and set themselves off call. Different rows are updated, so snapshot isolation sees <b>no conflict</b>. Both commit; nobody is on call.',
        'This is <b>write skew</b>. Fixes: lock the rows the decision depends on (<code>FOR UPDATE</code> on both), materialise the constraint as a row to conflict on, or use <b>serializable</b> isolation — which detects the dangerous pattern and aborts one transaction.',
      ],
      note: { kind: 'warn', text: 'Serializable transactions can abort for reasons outside your code. Wrap them in a retry loop, and keep them short so retries are cheap.' },
      concepts: [
        { term: 'Write skew', def: 'Two transactions read overlapping data, then update different rows, jointly violating an invariant.' },
        { term: 'Serializable isolation', def: 'The strongest level: the outcome equals some one-at-a-time ordering of the transactions.' },
      ],
      scene: {
        nodes: [ana({ label: pill('Manager 1', 'user'), tag: pill('2 on call → leave', 'check') }), ben({ label: pill('Manager 2', 'user'), tag: pill('2 on call → leave', 'check') }), app(), store({ state: 'hot', tag: pill('on call: 0', 'alert', 'bad') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['ben', 'app', 'db'], { kind: 'write', back: true, rate: 0.8 })],
        metrics: { sold: '—', conflicts: { v: 'invisible', tone: 'bad' }, tps: '1,100', iso: 'snapshot ✗' },
      },
    },
    {
      short: 'Deadlock',
      kind: 'problem',
      title: 'Deadlock: each waits for the other',
      body: [
        'Ana’s transaction locks seat 14C then tries 14D; Ben’s locks 14D then tries 14C. Each holds what the other needs. Databases detect the cycle and abort one transaction with a deadlock error after a short wait.',
        'Prevention: acquire locks in a consistent order (sort seat IDs), keep transactions short, and treat deadlock aborts as retryable.',
      ],
      changes: [{ text: 'Cycle detected → Ben aborted', tone: 'bad' }, { text: 'Fix: lock in sorted order', tone: 'good' }],
      concepts: [{ term: 'Deadlock', def: 'Two or more transactions each waiting for a lock held by another, so none can proceed.' }],
      scene: {
        nodes: [ana({ tag: pill('has 14C, wants 14D', 'lock', 'warn') }), ben({ tag: pill('has 14D, wants 14C', 'lock', 'warn') }), app(), store({ tag: pill('deadlock → abort Ben', 'alert', 'bad') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { rate: 0.6, speed: 0.4 }), flow(['ben', 'app', 'db'], { kind: 'fail', rate: 0.6 })],
        metrics: { sold: '1', conflicts: { v: '1 deadlock', tone: 'warn' }, tps: '700', iso: 'row locks' },
      },
    },
    {
      short: 'Boundaries',
      kind: 'tradeoff',
      title: 'Transactions stop at the database’s edge',
      body: [
        'Charging the card happens in a separate payments service. No <code>BEGIN</code> spans your database and their API: if the charge succeeds and your commit fails, you can’t roll back the charge with SQL.',
        'Keep payment calls outside database transactions, make them idempotent, and coordinate multi-service workflows with compensating actions — the <b>saga</b> pattern, covered in the Architecture module.',
      ],
      scene: {
        nodes: [ana(), ben({ state: 'dim' }), app({ tag: pill('commit ✓', 'check', 'good') }), store(), pay({ tag: pill('no shared transaction', 'alert', 'warn') })],
        links: [...wires, link('app', 'pay', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.7 }), flow(['app', 'pay'], { back: true, rate: 0.5 })],
        metrics: { sold: '1', conflicts: '—', tps: '1,000', iso: 'per database' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Atomic, isolated, and short',
      body: [
        'Transactions make groups of writes <b>atomic</b> and durable. <b>Isolation</b> is a spectrum: read committed allows lost updates; snapshot isolation stops most anomalies but not write skew; <b>serializable</b> stops all, at the price of aborts and retries.',
        'Prevent races with row locks or optimistic version checks, order locks to avoid deadlocks, keep transactions short, and never stretch one across a network call.',
      ],
      scene: {
        nodes: [ana({ tag: pill('booked 14C', 'check', 'good') }), ben({ tag: pill('“sorry, taken”', 'x') }), app({ tag: pill('short tx + retry', 'refresh', 'good') }), store({ tag: pill('serializable where needed', 'shield', 'good') })],
        links: wires,
        flows: [flow(['ana', 'app', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['ben', 'app', 'db'], { back: true, rate: 0.6 })],
        metrics: { sold: { v: '1', tone: 'good' }, conflicts: 'handled', tps: '1,000', iso: 'per operation' },
      },
    },
  ],
};

export default lesson;
