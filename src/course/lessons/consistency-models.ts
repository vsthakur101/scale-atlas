import type { Lesson, SceneNode } from '../../types';
import { db, flow, link, pill, you, zone } from '../kit';

const alice = (extra: Partial<SceneNode> = {}) => you('alice', -11, -4, { label: pill('Alice', 'user'), ...extra });
const bob = (extra: Partial<SceneNode> = {}) => you('bob', -11, 6, { label: pill('Bob', 'user'), ...extra });
const r1 = (extra: Partial<SceneNode> = {}) => db('r1', -1, -5, 'Replica 1', { sub: 'Frankfurt', ...extra });
const r2 = (extra: Partial<SceneNode> = {}) => db('r2', 1, 5, 'Replica 2', { sub: 'Dublin', ...extra });
const r3 = (extra: Partial<SceneNode> = {}) => db('r3', 9, 0, 'Replica 3', { sub: 'Virginia', ...extra });
const mesh = (style: 'solid' | 'dashed' = 'dashed') => [
  link('r1', 'r2', { arrow: 'both', style }),
  link('r1', 'r3', { arrow: 'both', style }),
  link('r2', 'r3', { arrow: 'both', style }),
];

const lesson: Lesson = {
  slug: 'consistency-models',
  title: 'Consistency Models',
  blurb: 'What can a reader see after a write, when the data lives in several places? From linearizable to eventual, and CAP in between.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'wlat', label: 'Write latency', icon: 'timer' },
    { key: 'avail', label: 'Available', icon: 'heart' },
    { key: 'stale', label: 'Staleness', icon: 'clock' },
    { key: 'model', label: 'Model', icon: 'shield' },
  ],
  goals: [
    { text: 'What linearizability promises and costs', step: 2 },
    { text: 'CAP: choosing during a partition', step: 4 },
    { text: 'PACELC: the latency trade without failures', step: 5 },
    { text: 'Eventual consistency and session guarantees', step: 7 },
    { text: 'Resolving concurrent conflicting writes', step: 8 },
  ],
  legend: ['write', 'request', 'response', 'fail'],
  steps: [
    {
      short: 'Disagree',
      kind: 'problem',
      title: 'Two replicas, two answers',
      body: [
        'A ticket marketplace replicates across three regions. Alice buys the last seat via Frankfurt. A moment later Bob, routed to Dublin, still sees the seat as available — Dublin hasn’t received the update yet — and tries to buy it too.',
        'A <b>consistency model</b> is the contract describing which of these outcomes are allowed. Stronger contracts forbid more surprises and cost more coordination.',
      ],
      changes: [{ text: 'Frankfurt: sold', tone: 'good' }, { text: 'Dublin: still available', tone: 'bad' }],
      concepts: [{ term: 'Consistency model', def: 'A contract specifying which values reads may return given the history of writes.' }],
      scene: {
        nodes: [alice(), bob(), r1({ tag: pill('seat 14C: sold', 'check', 'good') }), r2({ tag: pill('seat 14C: free', 'alert', 'bad') }), r3({ tag: pill('seat 14C: ?', 'clock', 'warn') })],
        links: [link('alice', 'r1'), link('bob', 'r2', { arrow: 'both' }), ...mesh()],
        flows: [flow(['alice', 'r1'], { kind: 'write', rate: 0.8 }), flow(['bob', 'r2'], { back: true, rate: 0.8 }), flow(['r1', 'r3'], { kind: 'write', rate: 0.8, speed: 0.4 })],
        metrics: { wlat: '5 ms', avail: 'yes', stale: { v: 'unbounded', tone: 'bad' }, model: '—' },
      },
    },
    {
      short: 'Linearizable',
      kind: 'technique',
      title: 'Linearizable: behave like one copy',
      body: [
        '<b>Linearizability</b> means the system acts as if there were a single copy of the data and every operation happened at one instant between its start and its end. Once Alice’s purchase completes, <i>every</i> later read anywhere sees it sold.',
        'To provide that, a write must reach a majority of replicas (or a single leader) before it’s acknowledged — across regions, that’s tens of milliseconds on every write.',
      ],
      changes: [{ text: 'Write waits for majority', tone: 'good' }, { text: 'Write latency 5 → 85 ms', tone: 'bad' }],
      concepts: [{ term: 'Linearizability', def: 'The strongest single-object consistency: operations appear to take effect atomically at a point between their invocation and completion.' }],
      scene: {
        nodes: [alice(), bob(), r1({ tag: pill('sold', 'check', 'good') }), r2({ tag: pill('sold', 'check', 'good') }), r3({ tag: pill('sold', 'check', 'good') })],
        links: [link('alice', 'r1'), link('bob', 'r2', { arrow: 'both' }), ...mesh('solid')],
        flows: [flow(['alice', 'r1'], { kind: 'write', rate: 0.8 }), flow(['r1', 'r2'], { kind: 'write', back: true, rate: 0.8 }), flow(['r1', 'r3'], { kind: 'write', back: true, rate: 0.8 }), flow(['bob', 'r2'], { back: true, rate: 0.6 })],
        metrics: { wlat: { v: '85 ms', tone: 'warn' }, avail: 'yes', stale: { v: 'none', tone: 'good' }, model: 'linearizable' },
      },
    },
    {
      short: 'Partition',
      kind: 'problem',
      title: 'The Atlantic link goes down',
      body: [
        'A network partition separates Virginia from both European replicas. Every node is healthy; they simply can’t talk. A customer in Virginia wants to buy a seat. What should Replica 3 do?',
        'It can’t know whether Europe has already sold that seat. There are only two honest choices.',
      ],
      changes: [{ text: 'Virginia cut off from EU', tone: 'bad' }],
      concepts: [{ term: 'Network partition', def: 'A network failure that splits nodes into groups that cannot communicate with each other.' }],
      scene: {
        nodes: [alice(), bob(), r1(), r2(), r3({ tag: pill('can’t reach EU', 'wifi', 'bad') })],
        links: [link('alice', 'r1'), link('bob', 'r2'), link('r1', 'r2', { arrow: 'both' }), link('r1', 'r3', { style: 'broken' }), link('r2', 'r3', { style: 'broken' })],
        flows: [flow(['r1', 'r3'], { kind: 'fail', rate: 0.8 }), flow(['r2', 'r3'], { kind: 'fail', rate: 0.8 })],
        metrics: { wlat: '—', avail: '?', stale: '?', model: '?' },
      },
    },
    {
      short: 'CAP',
      kind: 'tradeoff',
      title: 'CAP: during a partition, pick one',
      body: [
        '<b>Consistent (CP)</b>: Replica 3 refuses to sell until it can reach a majority. Virginia customers get errors, but no seat is ever sold twice. <b>Available (AP)</b>: Replica 3 accepts the sale locally and reconciles later — always responsive, but two people may own seat 14C when the link heals.',
        'That’s the whole of the CAP theorem: when a partition happens, a system must give up either linearizable consistency or availability on the cut-off side. Partitions aren’t optional, so the real choice is C or A.',
      ],
      note: { kind: 'key', text: 'Choose per operation, not per database. Seat sales want CP. “Seats viewed today” is happy with AP.' },
      concepts: [{ term: 'CAP theorem', def: 'Under a network partition, a distributed system cannot be both linearizably consistent and fully available.' }],
      scene: {
        nodes: [
          zone('cp', -5, 0, 7, 7, 'majority side', 'blue'),
          alice(),
          bob(),
          r1({ tag: pill('sells (majority)', 'check', 'good') }),
          r2(),
          r3({ tag: pill('CP: refuse · AP: accept', 'scale', 'warn') }),
        ],
        links: [link('alice', 'r1'), link('bob', 'r2'), link('r1', 'r2', { arrow: 'both' }), link('r1', 'r3', { style: 'broken' }), link('r2', 'r3', { style: 'broken' })],
        flows: [flow(['alice', 'r1', 'r2'], { kind: 'write', rate: 0.8 })],
        metrics: { wlat: '85 ms', avail: { v: 'C or A', tone: 'warn' }, stale: '—', model: 'CP / AP' },
      },
    },
    {
      short: 'PACELC',
      kind: 'insight',
      title: 'Even without failures: latency vs consistency',
      body: [
        'CAP only speaks about partitions. <b>PACELC</b> adds the everyday case: <i>if Partition, choose A or C; Else, choose Latency or Consistency</i>. Coordinating across regions on every write is slow even when nothing is broken.',
        'That’s why many systems offer tunable consistency per request — a quorum read when correctness matters, a single-replica read when speed does.',
      ],
      concepts: [{ term: 'PACELC', def: 'Extension of CAP: during a partition trade availability vs consistency; otherwise trade latency vs consistency.' }],
      scene: {
        nodes: [alice({ tag: pill('quorum: 85 ms', 'shield') }), bob({ tag: pill('local: 4 ms', 'bolt') }), r1(), r2(), r3()],
        links: [link('alice', 'r1'), link('bob', 'r2', { arrow: 'both' }), ...mesh('solid')],
        flows: [flow(['alice', 'r1', 'r3'], { kind: 'write', back: true, rate: 0.6, speed: 0.5 }), flow(['bob', 'r2'], { back: true, rate: 2 })],
        metrics: { wlat: 'choose', avail: 'yes', stale: 'choose', model: 'tunable' },
      },
    },
    {
      short: 'Eventual',
      kind: 'technique',
      title: 'Eventual consistency',
      body: [
        'The weakest useful promise: if writes stop, all replicas will <b>eventually</b> converge to the same value. Each replica acknowledges writes locally and propagates them in the background.',
        'Writes are fast and always available, but readers can see old values, values can appear to go backwards when switching replicas, and two writes can conflict. Perfectly fine for like counts, view counters, feeds and caches.',
      ],
      changes: [{ text: 'Local acks, background sync', tone: 'good' }, { text: 'Reads may be stale', tone: 'bad' }],
      concepts: [{ term: 'Eventual consistency', def: 'A guarantee that replicas converge to the same state if no new updates are made.' }],
      scene: {
        nodes: [alice({ tag: pill('likes: 10', 'heart') }), bob({ tag: pill('likes: 9', 'heart', 'warn') }), r1({ tag: pill('10') }), r2({ tag: pill('9 → 10', 'refresh') }), r3({ tag: pill('10') })],
        links: [link('alice', 'r1', { arrow: 'both' }), link('bob', 'r2', { arrow: 'both' }), ...mesh()],
        flows: [flow(['alice', 'r1'], { kind: 'write', rate: 1 }), flow(['r1', 'r2'], { kind: 'write', rate: 0.8, speed: 0.4 }), flow(['r1', 'r3'], { kind: 'write', rate: 0.8, speed: 0.4 }), flow(['bob', 'r2'], { back: true, rate: 1 })],
        metrics: { wlat: { v: '4 ms', tone: 'good' }, avail: { v: 'always', tone: 'good' }, stale: { v: '~100 ms', tone: 'warn' }, model: 'eventual' },
      },
    },
    {
      short: 'Sessions',
      kind: 'technique',
      title: 'Session guarantees: consistent for one user',
      body: [
        'Between “eventual” and “linearizable” sit guarantees scoped to one client’s session. <b>Read-your-writes</b>: you see your own updates. <b>Monotonic reads</b>: you never see time go backwards. <b>Consistent prefix</b>: you see writes in an order that makes sense (an answer never before its question).',
        'Usually implemented by pinning a session to a replica or tracking the version it has seen — cheap, and they fix most user-visible weirdness.',
      ],
      concepts: [
        { term: 'Monotonic reads', def: 'Once a client has seen a value, it will never later see an older one.' },
        { term: 'Causal consistency', def: 'Operations that are causally related are seen by everyone in the same order.' },
      ],
      scene: {
        nodes: [alice({ tag: pill('pinned: replica 1', 'pin', 'good') }), bob({ tag: pill('seen version ≥ 42', 'hash', 'good') }), r1(), r2(), r3()],
        links: [link('alice', 'r1', { arrow: 'both' }), link('bob', 'r2', { arrow: 'both' }), ...mesh()],
        flows: [flow(['alice', 'r1'], { back: true, rate: 1 }), flow(['bob', 'r2'], { back: true, rate: 1 }), flow(['r1', 'r2'], { kind: 'write', rate: 0.6 })],
        metrics: { wlat: '4 ms', avail: 'always', stale: 'not for you', model: 'session' },
      },
    },
    {
      short: 'Conflicts',
      kind: 'case',
      title: 'Case: two edits, no winner',
      body: [
        'During the partition, Virginia and Frankfurt both edited the same event description. When the link heals, which wins? <b>Last-write-wins</b> by timestamp is simple and silently throws one edit away — and clock skew may pick the “older” one.',
        'Better: detect concurrency with <b>version vectors</b> and keep both versions for the application to merge, or use <b>CRDTs</b> — data types (counters, sets, text) whose concurrent updates always merge deterministically.',
      ],
      concepts: [
        { term: 'Last-write-wins', def: 'Resolving conflicts by keeping the value with the latest timestamp, discarding others.' },
        { term: 'CRDT', def: 'Conflict-free Replicated Data Type: a structure whose replicas can be updated independently and always merge consistently.' },
      ],
      scene: {
        nodes: [r1({ tag: pill('desc v2a', 'file') }), r2(), r3({ tag: pill('desc v2b', 'file') }), db('merge', 4, 10, 'Merged', { tone: 'green', icon: 'refresh', tag: pill('v3 = merge(a, b)', 'check', 'good') })],
        links: [link('r1', 'merge'), link('r3', 'merge'), link('r1', 'r2', { arrow: 'both' }), link('r1', 'r3', { arrow: 'both', label: pill('healed', 'link', 'good') })],
        flows: [flow(['r1', 'merge'], { kind: 'write', rate: 0.6 }), flow(['r3', 'merge'], { kind: 'write', rate: 0.6 })],
        metrics: { wlat: '4 ms', avail: 'always', stale: '—', model: { v: 'merge, not drop', tone: 'good' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Pick the weakest model that’s still correct',
      body: [
        '<b>Linearizable</b> systems behave like one copy, at the cost of coordination latency and unavailability during partitions (<b>CAP</b>). <b>Eventual</b> systems are fast and always available but expose staleness and conflicts. <b>Session guarantees</b> fix most of what users notice, cheaply.',
        'Decide per operation: money, inventory and uniqueness want strong guarantees; counters, feeds and analytics thrive on weak ones — with a real conflict-resolution strategy.',
      ],
      scene: {
        nodes: [alice({ tag: pill('seat purchase: CP', 'lock', 'good') }), bob({ tag: pill('like count: AP', 'heart') }), r1(), r2(), r3()],
        links: [link('alice', 'r1'), link('bob', 'r2', { arrow: 'both' }), ...mesh('solid')],
        flows: [flow(['alice', 'r1', 'r3'], { kind: 'write', back: true, rate: 0.5 }), flow(['bob', 'r2'], { back: true, rate: 1.5 })],
        metrics: { wlat: 'per op', avail: 'per op', stale: 'per op', model: 'mixed' },
      },
    },
  ],
};

export default lesson;
