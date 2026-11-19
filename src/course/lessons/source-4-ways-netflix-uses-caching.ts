import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -16, 0, 10, 'requests', extra);
const near = (extra: Partial<SceneNode> = {}) => box('near', -9, 0, 'Near cache (in-process)', 'teal', 'bolt', { size: [1.3, 1.3], height: 24, ...extra });
const dist = (extra: Partial<SceneNode> = {}) => box('dist', -1, 0, 'Distributed cache cluster', 'orange', 'layers', { size: [1.5, 1.5], height: 28, ...extra });
const origin = (extra: Partial<SceneNode> = {}) => db('origin', 9, 0, 'Database / service', { size: [1.4, 1.4], ...extra });

const fmtT = (ms: number): string => (ms >= 1 ? `${ms.toFixed(ms < 10 ? 2 : 1)} ms` : ms >= 0.001 ? `${(ms * 1000).toFixed(0)} µs` : `${(ms * 1e6).toFixed(0)} ns`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${n.toFixed(n < 10 ? 1 : 0)}`);

const lesson: Lesson = {
  slug: 'source-4-ways-netflix-uses-caching',
  title: 'Multi-Tier Caching: Near, Distributed and Origin',
  blurb: 'Stacking caches — in-process, a shared cluster, an edge — multiplies miss ratios, cuts average latency and shields the database; and creates new problems of invalidation and consistency.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'avg', label: 'Average read latency', icon: 'clock' },
    { key: 'db', label: 'Requests reaching the database', icon: 'activity' },
    { key: 'all', label: 'Share served without touching the database', icon: 'gauge' },
    { key: 'stale', label: 'Worst-case staleness (sum of TTLs)', icon: 'alert' },
  ],
  goals: [
    { text: 'Why more than one cache tier helps', step: 1 },
    { text: 'Near (local) cache: fastest, smallest, per-instance', step: 2 },
    { text: 'Distributed cache: shared, large, a network hop away', step: 3 },
    { text: 'The arithmetic of stacked hit ratios', step: 4 },
    { text: 'Invalidation, replication and consistency across tiers', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Read requests per second', min: 100, max: 10000000, step: 100, default: 500000, unit: '/s', description: 'Total read rate across the fleet.' },
      { key: 'h1', label: 'Near-cache hit ratio', min: 0, max: 99, step: 1, default: 60, unit: '%', description: 'Share of reads answered from the in-process cache.' },
      { key: 'h2', label: 'Distributed-cache hit ratio (of the rest)', min: 0, max: 99.9, step: 0.1, default: 90, unit: '%', description: 'Share of near-cache misses answered by the shared cluster.' },
      { key: 't1', label: 'Near-cache latency', min: 0.0001, max: 0.1, step: 0.0001, default: 0.001, unit: ' ms', description: 'In-process lookup (~1 µs).' },
      { key: 't2', label: 'Distributed-cache latency', min: 0.1, max: 5, step: 0.1, default: 0.8, unit: ' ms', description: 'Network round trip plus lookup.' },
      { key: 't3', label: 'Database latency', min: 1, max: 200, step: 1, default: 15, unit: ' ms', description: 'Read from the origin.' },
      { key: 'ttl1', label: 'Near-cache TTL', min: 1, max: 600, step: 1, default: 30, unit: ' s', description: 'How long a local entry is trusted.' },
      { key: 'ttl2', label: 'Distributed-cache TTL', min: 1, max: 86400, step: 1, default: 300, unit: ' s', description: 'How long the shared entry is trusted.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 5e5);
      const h1 = Math.min(0.999, Math.max(0, (input.h1 ?? 60) / 100));
      const h2 = Math.min(0.9999, Math.max(0, (input.h2 ?? 90) / 100));
      const t1 = Math.max(1e-6, input.t1 ?? 0.001);
      const t2 = Math.max(0.01, input.t2 ?? 0.8);
      const t3 = Math.max(0.1, input.t3 ?? 15);
      const ttl1 = Math.max(1, input.ttl1 ?? 30);
      const ttl2 = Math.max(1, input.ttl2 ?? 300);
      // A near-cache miss pays its own lookup, then the shared cache, then the database.
      const avg = t1 + (1 - h1) * (t2 + (1 - h2) * t3);
      const dbRate = rps * (1 - h1) * (1 - h2);
      const hitAll = 1 - (1 - h1) * (1 - h2);
      return {
        avg: step < 3 ? { v: '—' } : { v: fmtT(avg), tone: avg < 1 ? 'good' : avg < 5 ? 'warn' : 'bad' },
        db: step < 3 ? { v: '—' } : { v: `${fmtN(dbRate)}/s of ${fmtN(rps)}/s`, tone: dbRate < 10000 ? 'good' : dbRate < 50000 ? 'warn' : 'bad' },
        all: step < 3 ? { v: '—' } : { v: `${(hitAll * 100).toFixed(1)}%`, tone: hitAll > 0.95 ? 'good' : 'warn' },
        stale: step < 4 ? { v: '—' } : { v: `up to ${ttl1 + ttl2} s (${ttl1} + ${ttl2})`, tone: ttl1 + ttl2 < 120 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why tiers',
      kind: 'insight',
      title: 'Each tier trades speed against size and sharing',
      body: [
        'No single cache is best on every axis. <b>In-process memory</b> is the fastest (~1 µs, no network) but small, duplicated in every instance and invisible to others. A <b>distributed cache</b> (Memcached, Redis, a dedicated cluster) is large and shared, so one instance’s fill benefits all — at the price of a network round trip (~1 ms). The <b>origin</b> (database or service) is authoritative and slowest.',
        'Stacking them gives the best of each: most reads end at the fastest tier, the middle tier absorbs what the first misses, and the database sees only what everything missed. This is how large services serve hundreds of thousands of reads a second from a database sized for thousands.',
      ],
      scene: { nodes: [clients(), near({ tag: pill('~1 µs', 'bolt', 'good') }), dist({ tag: pill('~1 ms · shared', 'layers') }), origin({ tag: pill('~15 ms', 'clock', 'warn') })], links: [link('clients', 'near'), link('near', 'dist'), link('dist', 'origin')], flows: [flow(['clients', 'near'], { rate: 3 }), flow(['near', 'dist'], { rate: 1.2 }), flow(['dist', 'origin'], { rate: 0.3 })] },
    },
    {
      short: 'Near cache',
      kind: 'technique',
      title: 'The near cache: in-process, per instance',
      body: [
        'A near (local) cache lives in each application instance’s memory — a small LRU map of hot items (see the Cache Eviction lesson). Lookups cost microseconds and no network, so it protects the shared tier from <b>hot keys</b> (a celebrity profile read 100,000 times a second is served from RAM in every instance) and keeps working if the distributed cache is slow.',
        'Costs: capacity is limited by heap (and competes with garbage-collected application memory), every instance holds its <i>own copy</i> (N copies of the hot set), cold instances start empty after a deploy, and entries can be <b>stale</b> because no one tells an instance to drop them — so near caches use <b>short TTLs</b> (seconds). Even a modest 60% hit ratio removes 60% of the traffic to everything behind it.',
      ],
      changes: [{ text: 'µs lookups; absorbs hot keys', tone: 'good' }, { text: 'Per-instance copies, short TTLs, cold after deploy', tone: 'info' }],
      scene: { nodes: [clients(), near({ tag: pill('60% hits here', 'check', 'good') }), dist()], links: [link('clients', 'near'), link('near', 'dist', { style: 'dashed' })], flows: [flow(['clients', 'near'], { rate: 3 })] },
    },
    {
      short: 'Distributed',
      kind: 'technique',
      title: 'The distributed cache: big, shared, a hop away',
      body: [
        'A cache cluster holds orders of magnitude more data than any one process and is <b>shared</b>: when one instance loads an item, all benefit, so the combined hit ratio is high even though each instance sees only part of the traffic. Keys are spread by <b>consistent hashing</b> (see that lesson) so nodes can be added or lost with limited reshuffling; replication across zones protects against losing a node’s share all at once.',
        'The costs are a <b>network round trip per lookup</b> (~0.8 ms), serialisation, and the cluster’s capacity — a cold or failed cluster sends everything to the database (see the Cache Failure Modes lesson), so warm it, replicate it, and protect the origin with request coalescing and rate limits. It is also where <b>cross-region replication</b> of cache writes can make data available near every user.',
      ],
      changes: [{ text: 'Shared fills; consistent hashing; replicated across zones', tone: 'good' }, { text: 'Network hop per lookup; protect the origin if it fails', tone: 'info' }],
      scene: { nodes: [near(), dist({ tag: pill('90% of the rest hit here', 'check', 'good') }), origin()], links: [link('near', 'dist'), link('dist', 'origin', { style: 'dashed' })], flows: [flow(['near', 'dist'], { rate: 2 }), flow(['dist', 'origin'], { rate: 0.4 })] },
    },
    {
      short: 'The maths',
      kind: 'insight',
      title: 'Miss ratios multiply',
      body: [
        'Each tier sees only the previous tier’s <b>misses</b>, so the share reaching the database is <code>(1 − h₁)(1 − h₂)</code>. With a 60% near hit and 90% shared hit: 0.4 × 0.1 = <b>4%</b> — of 500,000 reads/s, only <b>20,000/s</b> reach the database; the stack serves <b>96%</b> of reads. Average latency <code>t₁ + (1−h₁)(t₂ + (1−h₂)·t₃)</code> = 0.001 + 0.4 × (0.8 + 0.1 × 15) = <b>0.92 ms</b> versus 15 ms for the database alone.',
        'Because the effects multiply, small improvements in an early tier have outsized effects: raising the near hit ratio from 60% to 80% halves database load (to 10,000/s); a single tier at 96% would need far more memory. Note the independence assumption — hot keys are cached in <i>both</i> tiers, so the shared tier’s hit ratio on what reaches it is lower than its standalone ratio. Measure hit ratios per tier in production.',
      ],
      changes: [{ text: 'DB load = rps × (1 − h₁)(1 − h₂) = 20,000/s', tone: 'info' }, { text: 'Latency ≈ t₁ + (1−h₁)(t₂ + (1−h₂)t₃) ≈ 0.92 ms', tone: 'info' }],
      scene: { nodes: [clients(), near({ tag: pill('60%', 'gauge') }), dist({ tag: pill('90% of 40%', 'gauge') }), origin({ tag: pill('4% of reads', 'gauge', 'good') })], links: [link('clients', 'near'), link('near', 'dist'), link('dist', 'origin')], flows: [flow(['clients', 'near'], { rate: 3 }), flow(['near', 'dist'], { rate: 1.2 }), flow(['dist', 'origin'], { rate: 0.3 })] },
    },
    {
      short: 'Consistency',
      kind: 'problem',
      title: 'Invalidation and consistency across tiers',
      body: [
        'Every extra tier is another place a stale value can live. After an update the database is current, but the shared cache may hold the old value for its TTL and each instance’s near cache for <i>its</i> TTL — worst-case staleness is roughly the <b>sum</b>: 30 + 300 = <b>330 seconds</b>. Reducing it means active invalidation: on write, <b>delete or update</b> the shared entry, and broadcast an invalidation (a pub/sub message or change-data-capture event) so near caches drop theirs; or version keys so old entries are simply never read.',
        'Choose per data type: user preferences can be minutes stale; prices and inventory cannot. <b>Write-through</b> keeps the shared tier current, <b>cache-aside with delete on write</b> is simplest, and read-your-writes needs routing the writer to the primary or carrying a version (see the Consistency Patterns lesson). Beware races between concurrent readers refilling and writers invalidating. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Worst-case staleness ≈ sum of tier TTLs (330 s)', tone: 'bad' }, { text: 'Invalidate on write; broadcast to near caches; version keys', tone: 'good' }],
      scene: { nodes: [near({ tag: pill('stale for ≤ 30 s', 'clock', 'warn') }), dist({ tag: pill('stale for ≤ 300 s', 'clock', 'warn') }), origin({ tag: pill('updated', 'check', 'good') }), box('inv', -1, 8, 'Invalidation events (CDC / pub-sub)', 'purple', 'share', { size: [1.4, 1.2], height: 18 })], links: [link('inv', 'near', { style: 'dashed' }), link('inv', 'dist', { style: 'dashed' }), link('origin', 'inv')], flows: [flow(['origin', 'inv', 'dist'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Stack tiers, multiply misses, mind the staleness',
      body: [
        'A <b>near cache</b> gives microsecond hits and shields hot keys; a <b>distributed cache</b> gives a large shared hit set; the origin serves only the product of the miss ratios. Average latency falls from tens of ms to about a millisecond, and database load by 25× at 60%/90%.',
        'Pay for it with invalidation: TTLs add across tiers, so use active invalidation and per-data-type freshness budgets, and protect the origin when a tier is cold.',
      ],
      scene: { nodes: [clients(), near(), dist(), origin()], links: [link('clients', 'near'), link('near', 'dist'), link('dist', 'origin')], flows: [flow(['clients', 'near'], { rate: 3 }), flow(['near', 'dist'], { rate: 1.2 }), flow(['dist', 'origin'], { rate: 0.3 })] },
    },
  ],
};

export default lesson;
