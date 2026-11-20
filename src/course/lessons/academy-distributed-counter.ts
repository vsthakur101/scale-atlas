import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const fans = (extra: Partial<SceneNode> = {}) => crowd('fans', -13, 1, 18, 'viewers liking', extra);
const app = (extra: Partial<SceneNode> = {}) => box('app', -5, 0, 'Like service', 'blue', 'server', { size: [1.5, 1.5], height: 40, ...extra });
const row = (extra: Partial<SceneNode> = {}) => db('row', 5, 0, 'likes:video81', { size: [1.5, 1.5], ...extra });
const shard = (i: number, count = 4, extra: Partial<SceneNode> = {}): SceneNode =>
  db(`s${i}`, 6, (i - (count - 1) / 2) * 5, `shard ${i + 1}`, { size: [1.2, 1.2], height: 34, ...extra });
const shards = (n = 4, extra: (i: number) => Partial<SceneNode> = () => ({})) => Array.from({ length: n }, (_, i) => shard(i, n, extra(i)));
const reader = (extra: Partial<SceneNode> = {}) => box('reader', -5, 9, 'Counter read', 'teal', 'search', { size: [1.3, 1.3], height: 30, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', 0, 9, 'Cache', 'green', 'bolt', { size: [1.2, 1.2], height: 30, ...extra });

const fmt = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-distributed-counter',
  title: 'Counting at Scale: Sharded and Approximate Counters',
  blurb: 'Counting likes, views or stock without a single hot row: sharded counters, batching, cached reads and CRDTs — and the correctness traps of each.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'util', label: 'Hottest shard', icon: 'cpu' },
    { key: 'p99', label: 'Write p99', icon: 'timer' },
    { key: 'reads', label: 'DB reads', icon: 'search' },
    { key: 'stale', label: 'Count staleness', icon: 'clock' },
  ],
  goals: [
    { text: 'Why one counter row caps write throughput', step: 2 },
    { text: 'Sharded counters: writes scale, reads fan in', step: 3 },
    { text: 'Sizing the number of shards for a hot counter', step: 4 },
    { text: 'Batching and caching trade accuracy for load', step: 6 },
    { text: 'CRDT counters and double-counting on retries', step: 8 },
  ],
  legend: ['write', 'request', 'heavy', 'hit', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Increments', min: 1_000, max: 500_000, step: 1_000, default: 50_000, unit: '/s', description: 'Likes or views per second on the hot counter.' },
      { key: 'cap', label: 'Per-row write capacity', min: 200, max: 10_000, step: 100, default: 2_000, unit: '/s', description: 'Updates one row can sustain, limited by lock hold time (≈ 1 ÷ hold time).' },
      { key: 'shards', label: 'Shards K', min: 1, max: 256, step: 1, default: 64, unit: '', description: 'Independent rows the counter is split into.' },
      { key: 'skew', label: 'Shard imbalance', min: 1, max: 4, step: 0.1, default: 1.5, unit: '×', description: 'Hottest shard’s load relative to the average.' },
      { key: 'reads', label: 'Count reads', min: 100, max: 50_000, step: 100, default: 5_000, unit: '/s', description: 'Page views that show the number.' },
      { key: 'ttl', label: 'Cache TTL', min: 0, max: 60, step: 1, default: 5, unit: ' s', description: 'How long a computed total is reused. 0 = no cache.' },
    ],
    calculate: (input, step) => {
      const rate = input.rate ?? 50_000;
      const cap = input.cap ?? 2_000;
      const k = step === 0 || step === 1 ? 1 : Math.max(1, Math.round(input.shards ?? 64));
      const skew = k === 1 ? 1 : (input.skew ?? 1.5);
      const reads = input.reads ?? 5_000;
      const ttl = input.ttl ?? 5;
      const rho = (rate / k) * skew / cap;
      // hockey-stick latency on the hottest shard; beyond capacity requests queue and time out
      const p99 = rho >= 0.97 ? null : 4 * (1 + (3 * rho * rho) / (1 - rho));
      const dbReads = step < 4 ? reads * k : ttl > 0 ? k / ttl : reads * k;
      return {
        util: { v: `${Math.round(rho * 100)}%`, tone: rho > 1 ? 'bad' : rho > 0.7 ? 'warn' : 'good' },
        p99: p99 === null ? { v: 'saturated', tone: 'bad' } : { v: `${Math.round(p99)} ms`, tone: p99 > 100 ? 'bad' : p99 > 30 ? 'warn' : 'good' },
        reads: { v: `${fmt(dbReads)}/s`, tone: dbReads > 50_000 ? 'bad' : dbReads > 5_000 ? 'warn' : 'good' },
        stale: { v: step < 4 || ttl === 0 ? 'live' : `≤ ${ttl} s`, tone: undefined },
      };
    },
  },
  steps: [
    {
      short: 'Viral',
      kind: 'problem',
      title: 'One video, 50,000 likes a second',
      body: [
        'A video goes viral and its like counter becomes the hottest key in the system. Every like is <code>UPDATE counters SET n = n + 1 WHERE id = 81</code> on a single row.',
        'The database can do millions of operations a second across a table, but this is one row. Requests pile up behind it, latency climbs, and writes start timing out — while the rest of the cluster sits idle.',
      ],
      changes: [{ text: '50k/s aimed at one row', tone: 'bad' }, { text: 'Cluster idle, hot row saturated', tone: 'bad' }],
      scene: {
        nodes: [fans(), app({ load: 40 }), row({ load: 100, state: 'hot', tag: pill('lock queue growing', 'alert', 'bad') })],
        links: [link('fans', 'app'), link('app', 'row')],
        flows: [flow(['fans', 'app'], { rate: 5 }), flow(['app', 'row'], { kind: 'heavy', rate: 6, speed: 0.5 })],
      },
    },
    {
      short: 'The lock',
      kind: 'insight',
      title: 'A row can only be updated by one writer at a time',
      body: [
        'An increment is a read-modify-write: read n, add 1, write n + 1. To keep that correct, the database holds a <b>row lock</b> for the duration. If the lock is held 0.5 ms per update, the row can complete at most <code>1 ÷ 0.0005 = 2,000</code> updates per second — no matter how many servers or cores are available.',
        'Optimistic alternatives (compare-and-set with retry) don’t help: 50,000 writers racing for one value mostly fail and retry, adding load. The limit is <b>serialisation on one key</b>, so the fix has to be to stop having one key.',
      ],
      note: { kind: 'key', text: 'Throughput on one row ≈ 1 ÷ (time the row is locked per update). It is a property of the key, not the cluster.' },
      concepts: [{ term: 'Hot key', def: 'A single key receiving a disproportionate share of traffic; its serial update rate caps what the whole system can do for it.' }],
      scene: {
        nodes: [fans(), app({ load: 40 }), row({ load: 100, state: 'hot', tag: pill('2,000 updates/s max', 'lock', 'bad') })],
        links: [link('fans', 'app'), link('app', 'row')],
        flows: [flow(['fans', 'app'], { rate: 5 }), flow(['app', 'row'], { kind: 'fail', rate: 4 })],
      },
    },
    {
      short: 'Sharding',
      kind: 'technique',
      title: 'Split one counter into K rows',
      body: [
        'A <b>sharded counter</b> keeps K rows — <code>likes:81#0 … likes:81#63</code>. Each like increments a <b>randomly chosen</b> shard, so concurrent writers rarely contend. The total is the <b>sum of all shards</b>.',
        'Write capacity grows roughly K times: 64 shards at 2,000/s each offer up to 128,000 increments a second of raw capacity (before imbalance). This is the pattern behind Firestore’s “distributed counters” and many like/view counters.',
      ],
      changes: [{ text: 'Write capacity × K', tone: 'good' }, { text: 'A read now sums K rows', tone: 'bad' }],
      concepts: [{ term: 'Sharded counter', def: 'A counter split into K independent rows; writes pick one at random, reads sum them all.' }],
      scene: {
        nodes: [fans(), app({ load: 40 }), ...shards(4, (i) => ({ load: 40 + i * 3 }))],
        links: [link('fans', 'app'), ...[0, 1, 2, 3].map((i) => link('app', `s${i}`))],
        flows: [flow(['fans', 'app'], { rate: 5 }), ...[0, 1, 2, 3].map((i) => flow(['app', `s${i}`], { kind: 'write', rate: 1.4 }))],
      },
    },
    {
      short: 'How many?',
      kind: 'technique',
      title: 'Choosing the number of shards',
      body: [
        'Each shard sees about <code>rate ÷ K</code> writes a second, and random choice isn’t perfectly even: the busiest shard may carry 1.3–2× the average. Size K so that hottest shard stays below ~70% of its capacity: <code>K ≥ rate × skew ÷ (cap × 0.7)</code>. For 50,000/s, capacity 2,000, skew 1.5 that is 54 — so 32 shards would be overloaded, while 64 leave the hottest shard near 59%.',
        'Move the shards slider to see the hottest shard’s utilisation and p99 — the latency curve is the same queueing hockey stick from the latency lesson. More shards cost nothing on writes but multiply the work of every read.',
      ],
      changes: [{ text: '50k/s, cap 2k, skew 1.5 → K ≥ 54', tone: 'bad' }],
      scene: {
        nodes: [fans(), app(), ...shards(5, (i) => ({ load: i === 2 ? 92 : 65, ...(i === 2 ? { tag: pill('hottest', 'alert', 'warn') } : {}) }))],
        links: [link('fans', 'app'), ...[0, 1, 2, 3, 4].map((i) => link('app', `s${i}`))],
        flows: [flow(['fans', 'app'], { rate: 5 }), ...[0, 1, 2, 3, 4].map((i) => flow(['app', `s${i}`], { kind: 'write', rate: i === 2 ? 2.4 : 1.4 }))],
      },
    },
    {
      short: 'Reads',
      kind: 'tradeoff',
      title: 'Reading means adding up every shard',
      body: [
        'Every page view wants the number. With K = 64 each read is 64 row reads — at 5,000 views a second that is 320,000 database reads a second just to display a counter. Sharding moved the cost from writes to reads.',
        'Fix: compute the total once, <b>cache it with a short TTL</b>, and serve everyone from the cache. With a 5-second TTL one reader refreshes the total every 5 seconds: 64 ÷ 5 ≈ 13 reads a second instead of 320,000, at the price of a count that can be up to 5 seconds old. For likes and views, nobody notices.',
      ],
      changes: [{ text: '320k reads/s → ~13 reads/s', tone: 'good' }, { text: 'Count up to 5 s stale', tone: 'bad' }],
      concepts: [{ term: 'Eventually consistent count', def: 'A displayed total that lags the true value by a bounded delay (the cache TTL).' }],
      scene: {
        nodes: [fans(), app({ load: 40 }), ...shards(4), reader({ tag: pill('5,000 views/s', 'users') }), cache({ tag: pill('total, TTL 5 s', 'bolt', 'good') })],
        links: [link('fans', 'app'), ...[0, 1, 2, 3].map((i) => link('app', `s${i}`)), link('reader', 'cache', { arrow: 'both' }), ...[0, 1, 2, 3].map((i) => link('cache', `s${i}`, { style: 'dashed' }))],
        flows: [flow(['fans', 'app'], { rate: 4 }), flow(['reader', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['cache', 's0'], { back: true, rate: 0.3 })],
      },
    },
    {
      short: 'Batching',
      kind: 'technique',
      title: 'Aggregate in memory, flush periodically',
      body: [
        'Each like-service instance can keep a <b>local count</b> and flush the delta to the shard every second. 200 instances flushing once a second produce 200 writes/s instead of 50,000 — a 250× reduction.',
        'The risk: increments held in memory vanish if the instance crashes before the flush. That’s acceptable for likes and views, not for money or inventory. Shorter flush intervals shrink the loss window and raise write load.',
      ],
      changes: [{ text: '50,000 writes/s → 200/s', tone: 'good' }, { text: 'Up to 1 s of increments lost on a crash', tone: 'bad' }],
      concepts: [{ term: 'Write-behind batching', def: 'Accumulating updates in memory and writing the aggregate on an interval, trading durability for fewer writes.' }],
      scene: {
        nodes: [fans(), app({ name: 'Like service ×200', tag: pill('local delta, flush 1 s', 'timer') }), ...shards(3)],
        links: [link('fans', 'app'), ...[0, 1, 2].map((i) => link('app', `s${i}`))],
        flows: [flow(['fans', 'app'], { rate: 5 }), ...[0, 1, 2].map((i) => flow(['app', `s${i}`], { kind: 'write', rate: 0.5 }))],
      },
    },
    {
      short: 'Regions',
      kind: 'technique',
      title: 'Counting across regions with a CRDT',
      body: [
        'With users in several regions and replicas accepting writes locally, concurrent increments must merge without losing any. A <b>G-counter</b> (grow-only CRDT) gives each replica its own slot: <code>{eu: 410, us: 520, ap: 130}</code>. A replica only ever increments <i>its own</i> slot; the value is the sum; merging two copies takes the element-wise <b>max</b>.',
        'Max-merge is commutative, associative and idempotent, so replicas can exchange state in any order, any number of times, and converge — no coordination. Decrements need a <b>PN-counter</b>: two G-counters, one for increments and one for decrements.',
      ],
      changes: [{ text: 'merge = max per replica slot', tone: 'good' }, { text: 'value = sum of slots' }],
      concepts: [
        { term: 'G-counter', def: 'A grow-only CRDT counter: one slot per replica, merged by element-wise max, read as the sum.' },
        { term: 'PN-counter', def: 'A counter supporting decrements, built from a G-counter of increments and one of decrements.' },
      ],
      scene: {
        nodes: [
          box('eu', -4, -6, 'EU replica', 'blue', 'server', { size: [1.3, 1.3], height: 32, tag: pill('{eu 410}', 'hash') }),
          box('us', 6, -6, 'US replica', 'teal', 'server', { size: [1.3, 1.3], height: 32, tag: pill('{us 520}', 'hash') }),
          box('ap', 1, 7, 'AP replica', 'purple', 'server', { size: [1.3, 1.3], height: 32, tag: pill('{ap 130}', 'hash') }),
        ],
        links: [link('eu', 'us', { arrow: 'both', label: pill('merge: max', 'refresh') }), link('us', 'ap', { arrow: 'both' }), link('ap', 'eu', { arrow: 'both' })],
        flows: [flow(['eu', 'us'], { kind: 'handshake', rate: 0.6 }), flow(['us', 'ap'], { kind: 'handshake', rate: 0.6 }), flow(['ap', 'eu'], { kind: 'handshake', rate: 0.6 })],
      },
    },
    {
      short: 'Retries',
      kind: 'case',
      title: 'Case: the same like counted twice',
      body: [
        'A client taps like, the request reaches the server and increments a shard, but the response is lost; the client retries and the like counts twice. Multiply by flaky networks and the counter drifts upward. Increment is <b>not idempotent</b>.',
        'Fixes depend on how exact the count must be. For likes: store “user 17 liked video 81” as a row with a unique key (so repeats are rejected) and let the counter be derived or periodically reconciled. For money or inventory, don’t use a casual counter at all — use transactions or an append-only ledger.',
      ],
      note: { kind: 'warn', text: 'A distributed counter is cheap because it is approximate in time and, if you aren’t careful, in value. Know which one you’re building.' },
      changes: [{ text: 'Retry → double increment', tone: 'bad' }, { text: 'Dedupe on (user, video) or reconcile from events', tone: 'good' }],
      scene: {
        nodes: [fans({ tag: pill('retry after timeout', 'refresh', 'warn') }), app({ tag: pill('dedupe key: user+video', 'key', 'good') }), ...shards(3)],
        links: [link('fans', 'app', { arrow: 'both' }), ...[0, 1, 2].map((i) => link('app', `s${i}`))],
        flows: [flow(['fans', 'app'], { rate: 3 }), flow(['app', 's1'], { kind: 'write', rate: 1.2 }), flow(['app', 's1'], { kind: 'fail', rate: 0.5 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Spread the writes, cache the reads',
      body: [
        'One row can only take as many updates as its lock allows. A <b>sharded counter</b> spreads writes over K rows (size K for the hottest shard, not the average); a <b>cached total</b> keeps reads cheap; <b>local batching</b> cuts writes further at the cost of crash-loss; a <b>G-counter CRDT</b> merges multi-region replicas without coordination.',
        'Decide how stale and how exact the count may be, make increments idempotent where it matters — and never use these patterns for balances or stock.',
      ],
      scene: {
        nodes: [fans(), app({ load: 30 }), ...shards(4, () => ({ load: 55 })), reader(), cache({ tag: pill('TTL 5 s', 'bolt', 'good') })],
        links: [link('fans', 'app'), ...[0, 1, 2, 3].map((i) => link('app', `s${i}`)), link('reader', 'cache', { arrow: 'both' }), ...[0, 1, 2, 3].map((i) => link('cache', `s${i}`, { style: 'dashed' }))],
        flows: [flow(['fans', 'app'], { rate: 4 }), ...[0, 1, 2, 3].map((i) => flow(['app', `s${i}`], { kind: 'write', rate: 1 })), flow(['reader', 'cache'], { kind: 'hit', back: true, rate: 3 })],
      },
    },
  ],
};

export default lesson;
