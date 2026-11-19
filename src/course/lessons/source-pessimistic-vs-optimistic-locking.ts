import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const tx = (id: string, d: number, name: string, tone: SceneNode['tone'] = 'blue', extra: Partial<SceneNode> = {}) =>
  box(id, -13, d, name, tone, 'user', { size: [1.2, 1.2], height: 24, ...extra });
const row = (extra: Partial<SceneNode> = {}) => db('row', 5, 0, 'Row (version 7)', { size: [1.5, 1.5], ...extra });
const lock = (extra: Partial<SceneNode> = {}) => box('lock', -4, 0, 'Row lock', 'red', 'lock', { size: [1.2, 1.2], height: 22, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`);

const lesson: Lesson = {
  slug: 'source-pessimistic-vs-optimistic-locking',
  title: 'Pessimistic vs Optimistic Locking',
  blurb: 'Lock first and wait, or proceed and check at commit: how the two strategies behave at low and high contention, what each wastes, and how version columns implement the optimistic one.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'att', label: 'Optimistic: expected attempts (low contention)', icon: 'refresh' },
    { key: 'waste', label: 'Optimistic: wasted work on a hot row', icon: 'alert' },
    { key: 'wait', label: 'Pessimistic: average lock wait on a hot row', icon: 'clock' },
    { key: 'tput', label: 'Hot-row ceiling (either strategy)', icon: 'gauge' },
  ],
  goals: [
    { text: 'The lost-update problem both strategies prevent', step: 1 },
    { text: 'Pessimistic locking: SELECT … FOR UPDATE', step: 2 },
    { text: 'Optimistic locking: version columns and compare-and-set', step: 3 },
    { text: 'Where each wins: contention and transaction length', step: 4 },
    { text: 'Deadlocks, retries and distributed variants', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'p', label: 'Chance an attempt conflicts (low contention)', min: 0, max: 95, step: 1, default: 5, unit: '%', description: 'Probability another writer touched the row between read and commit.' },
      { key: 'c', label: 'Concurrent writers on one hot row', min: 1, max: 200, step: 1, default: 10, unit: '', description: 'Transactions competing for the same row at once.' },
      { key: 'work', label: 'Time to prepare an update', min: 1, max: 2000, step: 1, default: 50, unit: ' ms', description: 'Read, compute and (for pessimistic) hold the lock.' },
      { key: 'ovh', label: 'Lock acquire + release overhead', min: 0, max: 20, step: 0.5, default: 1, unit: ' ms', description: 'Extra time a pessimistic transaction pays to manage the lock.' },
    ],
    calculate: (input, step) => {
      const p = Math.min(0.99, Math.max(0, (input.p ?? 5) / 100));
      const c = Math.max(1, Math.round(input.c ?? 10));
      const work = Math.max(0.1, input.work ?? 50);
      const ovh = Math.max(0, input.ovh ?? 1);
      // Each attempt fails with probability p, so attempts are geometric: mean 1 ÷ (1 − p).
      const attempts = 1 / (1 - p);
      // On a hot row only one of c concurrent optimistic writers commits per round, so a writer needs ~(c + 1) ÷ 2 attempts on average.
      const wasted = ((c - 1) / 2) * work;
      // Pessimistic writers queue: the average waits for about half of the c − 1 others to finish their hold.
      const wait = ((c - 1) / 2) * (work + ovh);
      const tput = 1000 / (work + ovh);
      return {
        att: step < 3 ? { v: '—' } : { v: `${attempts.toFixed(2)} (${((attempts - 1) * 100).toFixed(0)}% extra work)`, tone: attempts < 1.2 ? 'good' : attempts < 2 ? 'warn' : 'bad' },
        waste: step < 3 ? { v: '—' } : { v: `${fmtMs(wasted)} of redone work per update`, tone: wasted < work ? 'good' : wasted < 5 * work ? 'warn' : 'bad' },
        wait: step < 3 ? { v: '—' } : { v: fmtMs(wait), tone: wait < 100 ? 'good' : wait < 1000 ? 'warn' : 'bad' },
        tput: step < 3 ? { v: '—' } : { v: `${tput.toFixed(0)} updates/s per row`, tone: tput > 100 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Lost update',
      kind: 'problem',
      title: 'Two writers, one row, one lost update',
      body: [
        'Two sessions read a stock count of 10 and each subtracts one: both write 9, and one sale vanishes. The pattern <i>read, compute, write</i> is unsafe whenever another transaction can change the row in between — the <b>lost update</b> problem (see the Isolation Levels lesson). Two strategies prevent it by coordinating access to the row.',
        '<b>Pessimistic</b> locking assumes conflicts are likely and <b>prevents</b> them by locking before reading. <b>Optimistic</b> locking assumes they are rare and <b>detects</b> them at write time, retrying if one happened. Both give correct results; they differ in <i>what they cost</i> under different contention.',
      ],
      scene: { nodes: [tx('a', -5, 'Tx A: read 10 → write 9'), tx('b', 5, 'Tx B: read 10 → write 9', 'orange'), row({ state: 'hot', tag: pill('stock = 9, should be 8', 'alert', 'bad') })], links: [link('a', 'row'), link('b', 'row')], flows: [flow(['a', 'row'], { kind: 'write', rate: 1 }), flow(['b', 'row'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Pessimistic',
      kind: 'technique',
      title: 'Pessimistic: lock the row, then work',
      body: [
        '<code>BEGIN; SELECT stock FROM items WHERE id = 7 <b>FOR UPDATE</b>;</code> takes an <b>exclusive row lock</b>; any other transaction that tries to read-for-update or write that row <b>waits</b> until the first commits or rolls back. Inside the lock nobody else can change the row, so the read-compute-write is safe and always succeeds the first time. Shared locks (<code>FOR SHARE</code>) allow concurrent readers but block writers.',
        'Costs: lock <b>overhead</b>, <b>waiting</b> (a hot row serialises its writers), a risk of <b>deadlock</b> when transactions lock several rows in different orders, and lock <b>hold time</b> including any slow work inside the transaction — a network call while holding a lock ties up everyone queued behind it. Locks must also be released on every failure path, and are held by a database connection, so they don’t fit long “think time” such as a user editing a form for minutes.',
      ],
      changes: [{ text: 'Lock first; writers queue; always succeeds first try', tone: 'good' }, { text: 'Waiting, deadlock risk, never hold across slow calls', tone: 'bad' }],
      scene: { nodes: [tx('a', -5, 'Tx A: holds the lock', 'green', { tag: pill('FOR UPDATE', 'lock', 'good') }), tx('b', 5, 'Tx B: waiting', 'orange', { tag: pill('blocked', 'clock', 'warn') }), lock(), row()], links: [link('a', 'lock'), link('b', 'lock', { style: 'dashed' }), link('lock', 'row')], flows: [flow(['a', 'lock', 'row'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Optimistic',
      kind: 'technique',
      title: 'Optimistic: read freely, check at write time',
      body: [
        'Add a <b>version</b> column (or use a timestamp or a hash of the row). Read the row and its version without locking; compute; then write conditionally: <code>UPDATE items SET stock = 9, version = 8 WHERE id = 7 <b>AND version = 7</b></code>. If another transaction changed the row, the version no longer matches, <b>0 rows are updated</b>, and the application <b>retries</b> from the read. It is <b>compare-and-set</b> (see the Concurrency lesson), implemented by the database’s atomic conditional update; ORMs expose it as <code>@Version</code>.',
        'No locks are held during the (possibly long) think time, nothing blocks, deadlocks are impossible, and it works across stateless requests — web forms, REST <code>If-Match</code> ETags, long-lived workflows. The cost is <b>wasted work</b> on conflict: the whole transaction repeats. With a 5% conflict chance the mean attempts are <code>1 ÷ (1 − 0.05)</code> = <b>1.05</b> — negligible; at 50% it is 2; at 90%, 10.',
      ],
      changes: [{ text: 'UPDATE … WHERE version = :seen → 0 rows = conflict', tone: 'good' }, { text: 'Mean attempts = 1 ÷ (1 − p)', tone: 'info' }, { text: 'No locks held; no deadlocks', tone: 'good' }],
      concepts: [{ term: 'Optimistic concurrency control', def: 'Proceeding without locks and validating at commit that no conflicting change occurred, retrying if one did.' }],
      scene: { nodes: [tx('a', -5, 'Tx A: version 7 seen', 'green', { tag: pill('commit: version still 7 ✓', 'check', 'good') }), tx('b', 5, 'Tx B: version 7 seen', 'orange', { tag: pill('version is 8 → retry', 'alert', 'warn') }), row({ tag: pill('version 7 → 8', 'hash') })], links: [link('a', 'row'), link('b', 'row', { style: 'dashed' })], flows: [flow(['a', 'row'], { kind: 'write', rate: 1.2 }), flow(['b', 'row'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Which wins',
      kind: 'tradeoff',
      title: 'Which one when: contention and transaction length',
      body: [
        '<b>Low contention</b> (conflicts rare, say under 10–20%): optimistic wins — no lock overhead, no blocking, a few percent of retries. <b>High contention</b> on a hot row (a counter, an inventory item in a sale, a leaderboard top): optimistic collapses into a <b>retry storm</b> — with 10 writers each preparing for 50 ms, only one commits per round and the rest redo their work, an average of ~4.5 re-runs ≈ <b>225 ms of wasted work</b> per update. Pessimistic queues them instead: the average waits ~<b>230 ms</b> but wastes no CPU and everyone succeeds once.',
        'Either way a single hot row caps at <code>1 ÷ (work + overhead)</code> ≈ <b>20 updates/s</b> here — contention is solved by <b>reducing it</b> (sharded counters, atomic <code>SET stock = stock − 1</code> in one statement, queueing writes through a single owner; see the Flash Sales and Distributed Counter lessons), not by choosing a lock style. Rule: pessimistic for short transactions on hot or critical rows (money, inventory); optimistic for long think times and rarely-colliding edits.',
      ],
      changes: [{ text: '5% conflicts → ~1.05 attempts: optimistic wins', tone: 'good' }, { text: 'Hot row, 10 writers: ~225 ms wasted vs ~230 ms queued', tone: 'info' }, { text: 'Cap 1 ÷ (work + overhead) ≈ 20/s either way', tone: 'info' }],
      scene: { nodes: [box('low', -8, 0, 'Low contention', 'green', 'check', { size: [1.4, 1.4], height: 22, tag: pill('optimistic', 'check', 'good') }), box('hot', 8, 0, 'Hot row', 'red', 'alert', { size: [1.4, 1.4], height: 26, tag: pill('pessimistic / redesign', 'lock') })], links: [], flows: [] },
    },
    {
      short: 'Pitfalls',
      kind: 'problem',
      title: 'Deadlocks, retries and distributed variants',
      body: [
        '<b>Deadlock</b> (pessimistic): A locks row 1 then wants row 2; B locks row 2 then wants row 1. Databases detect the cycle and abort one transaction — so be ready to retry — and you reduce it by locking rows in a <b>consistent order</b>, keeping transactions short and using timeouts (see the Distributed Locks lesson for the cross-machine version, with leases and fencing).',
        '<b>Optimistic</b> pitfalls: forgetting to check the update count (silently losing the write), retrying without a <b>limit and backoff</b> (livelock), and doing non-idempotent side effects before the commit succeeds. <b>Range/phantom</b> conflicts need predicate or serializable protection (see Isolation Levels). Across services the same idea appears as ETags with <code>If-Match</code>, conditional writes in key–value stores (DynamoDB condition expressions) and compare-and-swap on a log offset. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Lock in a consistent order; retry aborted transactions', tone: 'good' }, { text: 'Check update counts; bound retries with backoff', tone: 'good' }],
      scene: { nodes: [tx('a', -5, 'Tx A: has row 1, wants row 2', 'green', { tag: pill('deadlock', 'alert', 'bad') }), tx('b', 5, 'Tx B: has row 2, wants row 1', 'orange', { tag: pill('deadlock', 'alert', 'bad') }), row()], links: [link('a', 'row', { style: 'broken' }), link('b', 'row', { style: 'broken' })], flows: [flow(['a', 'row'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Prevent or detect — and shrink the hot spot',
      body: [
        '<b>Pessimistic</b> locks first: no wasted work, but waiting, overhead and deadlock risk. <b>Optimistic</b> checks a version at commit: no locks, mean attempts <code>1 ÷ (1 − p)</code>, but wasted retries under contention. Optimistic fits low-conflict and long-think-time edits; pessimistic fits short transactions on hot, critical rows.',
        'Neither fixes a hot row’s ceiling of <code>1 ÷ (work + overhead)</code>: reduce contention by redesign.',
      ],
      scene: { nodes: [tx('a', -5, 'Tx A'), tx('b', 5, 'Tx B', 'orange'), row()], links: [link('a', 'row'), link('b', 'row')], flows: [flow(['a', 'row'], { kind: 'write', rate: 1.2 })] },
    },
  ],
};

export default lesson;
