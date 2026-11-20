import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const tenants = (extra: Partial<SceneNode> = {}) => crowd('tenants', -19, 0, 12, 'tenants (workflows firing)', extra);
const noisy = (extra: Partial<SceneNode> = {}) => box('noisy', -19, -9, 'One tenant floods 1M tasks', 'red', 'alert', { size: [1.3, 1.3], height: 22, ...extra });
const ingest = (extra: Partial<SceneNode> = {}) => box('ingest', -10, 0, 'Ingest: validate, rate-limit, enqueue', 'orange', 'filter', { size: [1.5, 1.5], height: 26, ...extra });
const queue = (extra: Partial<SceneNode> = {}) => db('queue', 0, 0, 'Per-tenant queues (or shuffle shards)', { size: [1.8, 1.8], ...extra });
const sched = (extra: Partial<SceneNode> = {}) => box('sched', 9, 0, 'Fair scheduler', 'purple', 'scale', { size: [1.6, 1.6], height: 28, ...extra });
const workers = (extra: Partial<SceneNode> = {}) => crowd('workers', 18, 0, 10, '500 workers', extra);
const dlq = (extra: Partial<SceneNode> = {}) => db('dlq', 9, 9, 'Retry queue / dead letters', { size: [1.3, 1.3], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(0)} s` : `${Math.round(s * 1000)} ms`);
const choose2 = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

const lesson: Lesson = {
  slug: 'academy-how-zapier-automates-billions-of-tasks',
  title: 'Multi-Tenant Job Queues: Fairness, Noisy Neighbours and Shuffle Sharding',
  blurb: 'In a shared FIFO queue one tenant’s flood becomes everyone’s latency. Per-tenant queues with fair scheduling, concurrency caps, shuffle sharding and retry discipline keep a million-task burst from starving the other customers.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'fifo', label: 'Delay for ordinary tenants behind a flood in one FIFO', icon: 'alert' },
    { key: 'fair', label: 'Their delay with fair per-tenant scheduling', icon: 'check' },
    { key: 'flood', label: 'Time to finish the flood: work-conserving vs capped', icon: 'timer' },
    { key: 'shuf', label: 'Shuffle sharding: chance a victim shares all / any queue with the flooder', icon: 'shield' },
  ],
  goals: [
    { text: 'Why shared queues create noisy neighbours', step: 1 },
    { text: 'FIFO failure: head-of-line blocking by volume', step: 2 },
    { text: 'Per-tenant queues and fair scheduling', step: 3 },
    { text: 'Caps vs work-conserving sharing; priority tiers', step: 4 },
    { text: 'Shuffle sharding, retries and backpressure', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'workers', label: 'Workers', min: 10, max: 10000, step: 10, default: 500, unit: '', description: 'Concurrent task executors.' },
      { key: 'rate', label: 'Tasks per second per worker', min: 0.1, max: 200, step: 0.1, default: 10, unit: '/s', description: 'Throughput of one worker.' },
      { key: 'flood', label: 'Tasks in the flooding tenant’s burst', min: 1000, max: 100000000, step: 1000, default: 1000000, unit: '', description: 'A single customer’s backlog.' },
      { key: 'ten', label: 'Other active tenants', min: 1, max: 100000, step: 1, default: 200, unit: '', description: 'Ordinary customers submitting work now.' },
      { key: 'arr', label: 'Tasks per second per ordinary tenant', min: 0.01, max: 100, step: 0.01, default: 2, unit: '/s', description: 'Their steady arrival rate.' },
      { key: 'cap', label: 'Hard cap per tenant (share of workers)', min: 0.5, max: 100, step: 0.5, default: 5, unit: '%', description: 'Maximum concurrency one tenant may use.' },
      { key: 'n', label: 'Queues available for shuffle sharding', min: 4, max: 1000, step: 1, default: 100, unit: '', description: 'Independent queue shards.' },
      { key: 'k', label: 'Queues assigned to each tenant', min: 1, max: 6, step: 1, default: 2, unit: '', description: 'Each tenant hashes to this many queues.' },
    ],
    calculate: (input, step) => {
      const workers = Math.max(1, input.workers ?? 500);
      const rate = Math.max(0.01, input.rate ?? 10);
      const flood = Math.max(1, input.flood ?? 1e6);
      const ten = Math.max(1, Math.round(input.ten ?? 200));
      const arr = Math.max(0.001, input.arr ?? 2);
      const capShare = Math.min(1, Math.max(0.005, (input.cap ?? 5) / 100));
      const n = Math.max(2, Math.round(input.n ?? 100));
      const k = Math.min(n, Math.max(1, Math.round(input.k ?? 2)));
      const capacity = workers * rate;
      const normalLoad = ten * arr;
      const fifoDelay = flood / capacity;
      // Max-min fair share per active tenant (flooder included); an M/M/1 view of an ordinary tenant’s own queue.
      const share = capacity / (ten + 1);
      const fairDelay = share > arr ? 1 / (share - arr) : Infinity;
      const free = Math.max(1, capacity - normalLoad);
      const workCons = flood / free;
      const capped = flood / Math.max(1, capacity * capShare);
      const combos = choose2(n, k);
      const all = 1 / combos;
      const any = 1 - choose2(n - k, k) / combos;
      return {
        fifo: step < 2 ? { v: '—' } : { v: `${fmtT(fifoDelay)} (${fmtN(flood)} ÷ ${fmtN(capacity)}/s)`, tone: fifoDelay < 5 ? 'good' : 'bad' },
        fair: step < 3 ? { v: '—' } : { v: Number.isFinite(fairDelay) ? `${fmtT(fairDelay)} (fair share ${share.toFixed(1)}/s vs ${arr}/s arriving)` : 'overloaded: fair share below arrivals', tone: fairDelay < 1 ? 'good' : 'warn' },
        flood: step < 4 ? { v: '—' } : { v: `${fmtT(workCons)} borrowing idle capacity · ${fmtT(capped)} at a ${(capShare * 100).toFixed(0)}% cap` },
        shuf: step < 5 ? { v: '—' } : { v: `${(all * 100).toFixed(3)}% (1 in ${fmtN(combos)}) · ${(any * 100).toFixed(1)}% share any`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Shared',
      kind: 'problem',
      title: 'One platform, thousands of customers, one pool of workers',
      body: [
        'A workflow-automation or job platform runs work for a huge number of <b>tenants</b> — each firing tasks when a trigger happens (a form submission, an email, a webhook) — on a shared fleet. Sharing is the economics: dedicated infrastructure per customer would be mostly idle. But sharing creates the <b>noisy-neighbour</b> problem: one tenant’s behaviour can degrade everyone else’s, and tenants have wildly different shapes — most send a trickle, a few send millions of tasks in minutes (a bulk import, a loop gone wrong, a viral event).',
        'The product promise is per-tenant: “your task runs within seconds”. It must hold regardless of what the other customers are doing. The scheduler, not the capacity, is what delivers it — adding workers to absorb a flood just means paying for more machines to be monopolised. The numbers below use 500 workers at 10 tasks/s each (5,000 tasks/s), 200 ordinary tenants at 2 tasks/s each, and one tenant that dumps 1,000,000 tasks.',
      ],
      scene: { nodes: [tenants({ tag: pill('200 tenants × 2/s', 'users') }), noisy({ tag: pill('+1,000,000 tasks', 'alert', 'bad') }), ingest(), queue(), workers({ tag: pill('5,000 tasks/s', 'gauge') })], links: [link('tenants', 'ingest'), link('noisy', 'ingest'), link('ingest', 'queue'), link('queue', 'workers')], flows: [flow(['noisy', 'ingest', 'queue', 'workers'], { kind: 'heavy', rate: 4 }), flow(['tenants', 'ingest', 'queue'], { rate: 1.2 })] },
    },
    {
      short: 'FIFO',
      kind: 'problem',
      title: 'FIFO turns volume into head-of-line blocking',
      body: [
        'A single first-in-first-out queue is fair <i>per task</i>, which is exactly wrong: a tenant who submits a million tasks takes a million places in line. A normal tenant’s task that arrives one second later waits behind all of them: 1,000,000 ÷ 5,000 per second = <b>200 seconds</b> of delay — for work that takes milliseconds — and the delay applies to <b>every</b> customer simultaneously. Alerts fire, SLAs breach and unrelated customers file tickets about a problem they didn’t cause.',
        'Common “fixes” that don’t work: <b>more workers</b> (the flood simply finishes sooner while still blocking; costs scale with the worst customer), <b>a priority queue by arrival time</b> (same problem), and <b>a global rate limit</b> (throttles everyone for one tenant’s sins). The fix is to change what “fair” means: share capacity <b>per tenant</b>, not per task.',
      ],
      changes: [{ text: '1,000,000 ÷ 5,000/s = 200 s delay for everyone behind the flood', tone: 'bad' }, { text: 'Adding workers or a global limit doesn’t isolate tenants', tone: 'bad' }],
      scene: { nodes: [noisy({ tag: pill('1M ahead in line', 'alert', 'bad') }), tenants({ tag: pill('waiting 200 s', 'clock', 'bad') }), queue({ state: 'hot', tag: pill('single FIFO', 'queue', 'warn') }), workers()], links: [link('noisy', 'queue'), link('tenants', 'queue'), link('queue', 'workers')], flows: [flow(['noisy', 'queue', 'workers'], { kind: 'heavy', rate: 4 }), flow(['tenants', 'queue'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Fair',
      kind: 'technique',
      title: 'Per-tenant queues with a fair scheduler',
      body: [
        'Give each tenant its <b>own logical queue</b> and have the scheduler pick the next task <b>across queues</b> rather than from one line: <b>round-robin</b> (one task per tenant in turn), <b>weighted round-robin</b> (paid plans get larger weights), or <b>deficit round-robin / weighted fair queueing</b> (each tenant earns capacity credit per round, so tenants with large tasks aren’t favoured). The outcome is <b>max-min fairness</b>: tenants whose demand is below their fair share are served immediately; surplus goes to those with more.',
        'With 201 active tenants the fair share is 5,000 ÷ 201 ≈ <b>24.9 tasks/s</b> each. An ordinary tenant sending 2 tasks/s is far below it, so its tasks run almost at once — modelled as an M/M/1 queue with service rate 24.9 and arrivals 2: mean wait 1 ÷ (24.9 − 2) ≈ <b>44 ms</b> instead of 200 s. The flooding tenant gets whatever capacity is left. Implementation: a priority structure keyed by tenant “virtual finish time”, per-tenant queues in a store such as Redis or SQS with tenant-keyed partitions, or a database table with <code>SELECT … FOR UPDATE SKIP LOCKED</code> and a fairness-aware ordering.',
      ],
      changes: [{ text: 'Per-tenant queues; scheduler rotates across tenants (round-robin, weighted, deficit)', tone: 'good' }, { text: 'Fair share 24.9/s: ordinary tenants wait ≈ 44 ms, not 200 s', tone: 'good' }, { text: 'Max-min fair: small tenants served first, surplus to heavy ones', tone: 'info' }],
      concepts: [{ term: 'Max-min fairness', def: 'Capacity is allocated so no tenant can get more without taking from one who has less; tenants below their fair share are fully served.' }],
      scene: { nodes: [tenants({ tag: pill('2/s each → immediate', 'check', 'good') }), noisy({ tag: pill('gets the remainder', 'gauge') }), queue({ tag: pill('one queue per tenant', 'list', 'good') }), sched({ tag: pill('round-robin across tenants', 'scale', 'good') }), workers()], links: [link('tenants', 'queue'), link('noisy', 'queue'), link('queue', 'sched'), link('sched', 'workers')], flows: [flow(['tenants', 'queue', 'sched', 'workers'], { rate: 2 }), flow(['noisy', 'queue', 'sched'], { kind: 'heavy', rate: 1.2 })] },
    },
    {
      short: 'Caps',
      kind: 'tradeoff',
      title: 'Hard caps vs work-conserving sharing; priority tiers',
      body: [
        'Two ways to treat the flooder. <b>Work-conserving</b> fair sharing lets it use <i>all spare capacity</i> — 5,000 − 400 = 4,600 tasks/s — so the 1,000,000-task burst finishes in about <b>217 seconds</b> without hurting anyone (their fair share is protected, and the moment they need capacity, the flooder yields). This is the efficient default: idle capacity is wasted money. A <b>hard concurrency cap</b> (say 5% of workers = 250 tasks/s) guarantees the blast radius but stretches the flood to <b>4,000 seconds (67 minutes)</b> even if the fleet is otherwise idle; use it when tasks hit shared downstream limits (a customer’s own API rate limit, a database) or when you’re protecting an expensive resource.',
        '<b>Priority tiers</b> layer on top: reserve capacity for latency-sensitive classes (interactive triggers, paid plans) and let bulk or low-priority work (imports, backfills) use leftovers via <b>weights or separate queues with their own worker pools</b>. Also <b>rate-limit at ingest</b> (reject or slow a tenant whose queue depth exceeds a bound — backpressure to the sender with a clear 429), <b>cap queue size</b> per tenant, and set <b>per-destination concurrency limits</b> so a tenant calling a slow third-party API doesn’t pin all workers waiting on it (isolate by destination, too).',
      ],
      changes: [{ text: 'Work-conserving: flood done in ~217 s, others unaffected', tone: 'good' }, { text: '5% hard cap: 250/s → flood takes 4,000 s but blast radius is bounded', tone: 'info' }, { text: 'Ingest rate limits, queue-depth bounds, per-destination concurrency', tone: 'good' }],
      scene: { nodes: [noisy(), ingest({ tag: pill('429 when queue > bound', 'filter', 'good') }), sched({ tag: pill('weights: interactive > bulk', 'scale') }), workers({ tag: pill('per-destination limits', 'shield') })], links: [link('noisy', 'ingest'), link('ingest', 'sched'), link('sched', 'workers')], flows: [flow(['noisy', 'ingest', 'sched', 'workers'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Shuffle',
      kind: 'technique',
      title: 'Shuffle sharding, retries and backpressure',
      body: [
        'Even with fair scheduling a <b>pathological</b> tenant — tasks that crash workers, hang for minutes, or poison a queue — can hurt whatever it shares. <b>Shuffle sharding</b> shrinks the blast radius: with 100 queues, hash each tenant to a random <b>pair</b> of queues (k = 2) and route its tasks to the shorter. The number of distinct pairs is C(100, 2) = <b>4,950</b>, so the chance a victim tenant lands on <i>exactly the same pair</i> as the troublemaker is 1 in 4,950 (<b>0.02%</b>); the chance they share <i>at least one</i> queue is ~4%, and even then the second queue remains clean. Compare one big queue (100% of tenants hurt) or plain sharding (1% of tenants share the shard, with no escape).',
        'Round out reliability: tasks are <b>at-least-once</b>, so make steps <b>idempotent</b> (idempotency keys per task attempt — see the Idempotency lesson); <b>retry with exponential backoff and jitter</b> through a delayed-retry queue (not by re-enqueuing at the head); send exhausted tasks to a <b>dead-letter queue</b> with the error for replay and alerting; set <b>visibility timeouts</b> sized to task duration and heartbeats for long tasks; and expose per-tenant <b>queue depth, age of oldest task and error rate</b> as the SLO signals. Model outputs here assume the stated capacities and arrivals; real tenants vary in task cost, so schedule by estimated cost, not just count.',
      ],
      changes: [{ text: '100 queues, 2 per tenant: 1 in 4,950 share both (0.02%); ~4% share one', tone: 'good' }, { text: 'Idempotent steps; backoff + jitter; delayed retry; dead-letter queue', tone: 'good' }, { text: 'Watch per-tenant queue depth and oldest-task age', tone: 'good' }],
      scene: { nodes: [tenants({ tag: pill('hash → 2 of 100 queues', 'hash') }), queue({ tag: pill('poison tenant isolated', 'shield', 'good') }), sched(), dlq({ tag: pill('retry + dead letters', 'refresh') }), workers()], links: [link('tenants', 'queue'), link('queue', 'sched'), link('sched', 'workers'), link('workers', 'dlq', { style: 'dashed' })], flows: [flow(['tenants', 'queue', 'sched', 'workers'], { rate: 1.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fair per tenant, not per task',
      body: [
        'A shared FIFO lets one tenant’s <b>1M-task flood</b> delay everyone by <b>200 s</b>. <b>Per-tenant queues</b> and a <b>fair scheduler</b> cut ordinary tenants’ delay to ~44 ms; <b>work-conserving</b> sharing finishes the flood in ~217 s while a <b>cap</b> bounds the blast radius; <b>shuffle sharding</b> makes the chance of sharing a queue with a bad actor 1 in 4,950.',
        'Add ingest rate limits, idempotent retries with backoff, dead-letter queues and per-tenant SLO metrics.',
      ],
      scene: { nodes: [tenants(), noisy(), ingest(), queue(), sched(), workers()], links: [link('tenants', 'ingest'), link('noisy', 'ingest'), link('ingest', 'queue'), link('queue', 'sched'), link('sched', 'workers')], flows: [flow(['tenants', 'ingest', 'queue', 'sched', 'workers'], { rate: 1.8 })] },
    },
  ],
};

export default lesson;
