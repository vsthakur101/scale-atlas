import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const apps = (extra: Partial<SceneNode> = {}) => crowd('apps', -18, 0, 10, 'application servers', extra);
const mc = (extra: Partial<SceneNode> = {}) => db('mc', -2, -7, 'Memcached node (slabs, N threads)', { size: [1.7, 1.7], ...extra });
const rd = (extra: Partial<SceneNode> = {}) => db('rd', -2, 7, 'Redis node (event loop, 1 thread / instance)', { size: [1.7, 1.7], ...extra });
const dbs = (extra: Partial<SceneNode> = {}) => db('dbs', 12, 0, 'Source-of-truth database', { size: [1.5, 1.5], ...extra });
const feat = (extra: Partial<SceneNode> = {}) => box('feat', 12, 8, 'Beyond GET/SET: structures, TTL, scripts', 'purple', 'layers', { size: [1.4, 1.4], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtG = (b: number): string => `${(b / 1e9).toFixed(1)} GB`;

const lesson: Lesson = {
  slug: 'source-memcached-vs-redis',
  title: 'Memcached vs Redis: Slab Allocation, Threading and What You Pay Per Key',
  blurb: 'Two in-memory key–value stores with different engines: memcached’s multi-threaded slab allocator and redis’s single-threaded event loop with rich data types — memory per item, per-node throughput, node counts, and how to choose.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'mc', label: 'Memcached memory for the data set', icon: 'disk' },
    { key: 'rd', label: 'Redis memory for the data set', icon: 'disk' },
    { key: 'nodes', label: 'Nodes needed (memory, throughput) — memcached', icon: 'layers' },
    { key: 'nodesR', label: 'Nodes needed (memory, throughput) — redis', icon: 'layers' },
  ],
  goals: [
    { text: 'What both stores do and where they sit', step: 1 },
    { text: 'Memcached: slab allocation and multi-threading', step: 2 },
    { text: 'Redis: one event loop, data structures and persistence', step: 3 },
    { text: 'Memory per key and node counts', step: 4 },
    { text: 'Choosing, and operating either one', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'keys', label: 'Cached items', min: 1000000, max: 5000000000, step: 1000000, default: 100000000, unit: '', description: 'Number of key–value pairs held.' },
      { key: 'ksize', label: 'Key size', min: 8, max: 200, step: 1, default: 40, unit: ' B', description: 'Average key length.' },
      { key: 'vsize', label: 'Value size', min: 16, max: 100000, step: 16, default: 200, unit: ' B', description: 'Average value length.' },
      { key: 'hdr', label: 'Memcached item header', min: 40, max: 80, step: 1, default: 56, unit: ' B', description: 'Per-item metadata (pointers, flags, expiry, CAS).' },
      { key: 'growth', label: 'Memcached slab growth factor', min: 1.05, max: 2, step: 0.01, default: 1.25, unit: '×', description: 'Ratio between consecutive slab chunk sizes.' },
      { key: 'rover', label: 'Redis per-key overhead', min: 30, max: 120, step: 1, default: 64, unit: ' B', description: 'Dictionary entry, object header and string header.' },
      { key: 'frag', label: 'Redis allocator fragmentation ratio', min: 1, max: 2, step: 0.01, default: 1.15, unit: '×', description: 'RSS ÷ used memory.' },
      { key: 'ram', label: 'Usable RAM per node', min: 8, max: 1024, step: 8, default: 48, unit: ' GB', description: 'Memory available for data after OS and headroom.' },
      { key: 'qps', label: 'Operations per second needed', min: 10000, max: 50000000, step: 10000, default: 2000000, unit: '/s', description: 'Cache load across the fleet.' },
      { key: 'mct', label: 'Memcached ops per node', min: 50000, max: 5000000, step: 10000, default: 960000, unit: '/s', description: 'Multi-threaded: threads × per-thread rate (illustrative).' },
      { key: 'rdt', label: 'Redis ops per node', min: 20000, max: 3000000, step: 10000, default: 400000, unit: '/s', description: 'Instances per node × ~100k/s each (illustrative).' },
    ],
    calculate: (input, step) => {
      const keys = Math.max(1, input.keys ?? 1e8);
      const ksize = Math.max(1, input.ksize ?? 40);
      const vsize = Math.max(1, input.vsize ?? 200);
      const hdr = Math.max(0, input.hdr ?? 56);
      const growth = Math.max(1.01, input.growth ?? 1.25);
      const rover = Math.max(0, input.rover ?? 64);
      const frag = Math.max(1, input.frag ?? 1.15);
      const ram = Math.max(1, input.ram ?? 48) * 1e9;
      const qps = Math.max(1, input.qps ?? 2e6);
      const mct = Math.max(1, input.mct ?? 960000);
      const rdt = Math.max(1, input.rdt ?? 400000);
      // Slab classes: item sizes fall between chunk sizes; average chunk is about (1 + (g-1)/2) × the item.
      const slabFactor = 1 + (growth - 1) / 2;
      const mcBytes = keys * (ksize + vsize + hdr) * slabFactor;
      const rdBytes = keys * (ksize + vsize + rover) * frag;
      const nMc = Math.max(Math.ceil(mcBytes / ram), Math.ceil(qps / mct));
      const nRd = Math.max(Math.ceil(rdBytes / ram), Math.ceil(qps / rdt));
      return {
        mc: step < 2 ? { v: '—' } : { v: `${fmtG(mcBytes)} (${((1 - 1 / slabFactor) * 100).toFixed(1)}% slab waste)` },
        rd: step < 3 ? { v: '—' } : { v: `${fmtG(rdBytes)} (${rover} B/key + ${((frag - 1) * 100).toFixed(0)}% fragmentation)` },
        nodes: step < 4 ? { v: '—' } : { v: `${fmtN(nMc)} (memory ${fmtN(Math.ceil(mcBytes / ram))}, throughput ${fmtN(Math.ceil(qps / mct))})` },
        nodesR: step < 4 ? { v: '—' } : { v: `${fmtN(nRd)} (memory ${fmtN(Math.ceil(rdBytes / ram))}, throughput ${fmtN(Math.ceil(qps / rdt))})` },
      };
    },
  },
  steps: [
    {
      short: 'Role',
      kind: 'insight',
      title: 'Two memory-resident key–value stores, built differently',
      body: [
        'Both keep data in RAM, answer in well under a millisecond, and are used mainly as a <b>cache</b> in front of a slower source of truth (see the Caching lessons): the application checks the cache, falls back to the database on a miss, and populates the cache. Past that, their designs diverge, and the divergence decides which to use.',
        '<b>Memcached</b> (2003) is deliberately minimal: strings in, strings out — <code>get/set/add/delete/incr/cas</code> with expiry — a <b>multi-threaded</b> server, a <b>slab allocator</b>, and LRU eviction. There is no persistence, no replication in the server (clients shard keys with consistent hashing). <b>Redis</b> (2009) is a <b>data-structure server</b>: strings, hashes, lists, sets, sorted sets, streams, bitmaps, HyperLogLog and geo indexes, with optional persistence, replication, Lua scripting, pub/sub and a cluster mode. “Cache” is one of many things it is used for.',
      ],
      scene: { nodes: [apps(), mc({ tag: pill('minimal: strings only', 'box') }), rd({ tag: pill('structures + persistence', 'layers') }), dbs()], links: [link('apps', 'mc'), link('apps', 'rd'), link('mc', 'dbs', { style: 'dashed' }), link('rd', 'dbs', { style: 'dashed' })], flows: [flow(['apps', 'mc'], { rate: 1.5, back: true }), flow(['apps', 'rd'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Memcached',
      kind: 'technique',
      title: 'Memcached: slab classes and worker threads',
      body: [
        'Calling <code>malloc</code> for millions of different-sized items fragments memory. Memcached instead pre-divides memory into <b>1 MB pages</b> assigned to <b>slab classes</b>, each holding <b>fixed-size chunks</b> (e.g. 96, 120, 152… bytes, each larger by the <b>growth factor</b> 1.25). An item goes in the smallest chunk that fits; allocation is O(1), no fragmentation over time. The cost is <b>internal waste</b>: an item averages half a growth step below its chunk size — with factor 1.25 about <b>11%</b> of memory — and <b>slab calcification</b>: if the size mix shifts, pages stay assigned to old classes (a slab rebalancer and automover mitigate this). Each item also carries a header (~56 bytes: LRU links, hash chain, expiry, flags, CAS id).',
        'Concurrency is by <b>worker threads</b> (libevent-based, default 4) sharing one hash table with fine-grained locks; the process scales to many cores, so one big node can serve hundreds of thousands to millions of simple operations per second. Eviction is per-slab-class LRU (segmented in modern versions). Large values (&gt; 1 MB) are not allowed by default. Operationally trivial: a node dying simply loses its cached keys, and clients rehash.',
      ],
      changes: [{ text: 'Slab classes: O(1) allocation, ~11% average waste at factor 1.25', tone: 'info' }, { text: 'Multi-threaded: one node uses many cores', tone: 'good' }, { text: 'No persistence: a restart is a cold cache', tone: 'bad' }],
      concepts: [{ term: 'Slab allocation', def: 'Memory is split into fixed-size chunk classes so items are stored without fragmentation, at the cost of rounding each item up to its class size.' }],
      scene: { nodes: [apps(), mc({ tag: pill('slab classes: 96 · 120 · 152 B…', 'list') }), dbs()], links: [link('apps', 'mc'), link('mc', 'dbs', { style: 'dashed' })], flows: [flow(['apps', 'mc'], { kind: 'heavy', rate: 3, back: true })] },
    },
    {
      short: 'Redis',
      kind: 'technique',
      title: 'Redis: one event loop and rich data types',
      body: [
        'Each Redis instance executes commands on <b>one main thread</b> (an epoll event loop — see the Why Redis Is Fast lesson): no locks, every command atomic, and operations on structures like a sorted set run in-memory at O(log n). Multi-core boxes run several instances (Redis Cluster shards the keyspace into 16,384 hash slots across them); newer versions use extra I/O threads for network reads and writes, but command execution stays serial. A slow command (<code>KEYS *</code>, a huge <code>SMEMBERS</code>, a long Lua script) blocks everyone on that instance.',
        'The structures turn it into infrastructure: leaderboards with <code>ZADD</code>, counters and rate limiters with <code>INCR</code>, queues with lists or streams, sessions in hashes, locks with <code>SET NX PX</code>, geo queries, HyperLogLog cardinality. Add <b>persistence</b> (RDB snapshots, AOF — see the Redis persistence lesson), <b>replication</b> with automatic failover (Sentinel/Cluster) and <b>eviction policies</b> (<code>allkeys-lru</code>, <code>volatile-ttl</code>, LFU). Per-key overhead is higher (dictionary entry, object header, SDS string header ≈ 64 bytes) and the allocator (jemalloc) adds fragmentation.',
      ],
      changes: [{ text: 'Single-threaded execution: atomic commands, no locks, but slow commands block', tone: 'info' }, { text: 'Data structures, persistence, replication, scripting', tone: 'good' }, { text: '~64 B per key plus allocator fragmentation', tone: 'info' }],
      scene: { nodes: [apps(), rd({ tag: pill('ZSET · HASH · STREAM', 'layers', 'good') }), feat(), dbs()], links: [link('apps', 'rd'), link('rd', 'feat', { style: 'dashed' }), link('rd', 'dbs', { style: 'dashed' })], flows: [flow(['apps', 'rd'], { rate: 2, back: true })] },
    },
    {
      short: 'Sizing',
      kind: 'problem',
      title: 'Memory per key and how many nodes you need',
      body: [
        'Sizing is arithmetic. 100 million items with 40-byte keys and 200-byte values: <b>memcached</b> stores (40 + 200 + 56) × 1.125 = 333 bytes each = <b>33.3 GB</b>; <b>redis</b> stores (40 + 200 + 64) × 1.15 = 350 bytes = <b>35.0 GB</b>. For small values the two are within a few percent; for tiny values redis’s per-key overhead dominates (a 16-byte value costs ~5× its size), for large values both approach the payload size, and Redis’s compact encodings for small hashes/lists/sets (listpack, intset) can beat one-key-per-field storage by a wide margin.',
        'Then node count is <code>max(memory ÷ usable RAM, ops/s ÷ per-node rate)</code>. With 48 GB usable and 2 M ops/s, memcached at an illustrative 960,000 ops/s per node needs <b>3 nodes</b> (throughput-bound, memory needs 1), while redis at ~400,000 ops/s per node (4 instances) needs <b>5</b>. The difference is threading, not data layout: cache workloads that are mostly small GETs favour memcached’s multi-threaded density; workloads needing structures, atomic multi-step logic or durability favour redis. Always benchmark with your sizes and pipelining.',
      ],
      changes: [{ text: '100M × 240 B payload: memcached ≈ 33 GB, redis ≈ 35 GB', tone: 'info' }, { text: 'Nodes = max(memory, throughput): 3 vs 5 at 2M ops/s here', tone: 'info' }],
      scene: { nodes: [apps({ tag: pill('2M ops/s', 'activity') }), mc({ tag: pill('33 GB · 3 nodes', 'disk') }), rd({ tag: pill('35 GB · 5 nodes', 'disk') })], links: [link('apps', 'mc'), link('apps', 'rd')], flows: [flow(['apps', 'mc'], { kind: 'heavy', rate: 3 }), flow(['apps', 'rd'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Choosing — and running — either one',
      body: [
        'Choose <b>memcached</b> for a pure, simple, large cache of small objects where you want multi-core efficiency and a trivially disposable tier (HTML fragments, rendered objects, database query results). Choose <b>redis</b> when you need data structures, atomic operations, TTL-per-field patterns, pub/sub, streams, a persistent or replicated store, or lightweight primitives such as counters and locks. Many companies run both: memcached for bulk cache, redis for structured and stateful uses. Managed services (ElastiCache, Memorystore, Upstash) remove most operational work for both.',
        'Whichever you pick, the engineering is the same: <b>client-side consistent hashing</b> so node changes remap only ~1/N keys, <b>TTLs with jitter</b> to prevent synchronised expiry stampedes, request coalescing for hot misses, a plan for a <b>cold cache</b> after restart (warm-up or rate-limited rebuild so the database isn’t crushed — see the Cache Failure Modes lesson), and monitoring of hit ratio, evictions, memory fragmentation and latency per command. Figures here are first-order model outputs with illustrative per-node rates.',
      ],
      changes: [{ text: 'Simple, big, multi-core cache → memcached', tone: 'info' }, { text: 'Structures, atomics, persistence, replication → redis', tone: 'info' }, { text: 'Same discipline: hashing, TTL jitter, stampede control', tone: 'good' }],
      scene: { nodes: [apps(), mc({ tag: pill('bulk cache', 'box') }), rd({ tag: pill('state, counters, queues', 'layers') }), dbs()], links: [link('apps', 'mc'), link('apps', 'rd'), link('mc', 'dbs', { style: 'dashed' }), link('rd', 'dbs', { style: 'dashed' })], flows: [flow(['apps', 'mc'], { rate: 1.6, back: true }), flow(['apps', 'rd'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Same job as a cache, different engines',
      body: [
        '<b>Memcached</b>: slab allocator (~11% waste), multi-threaded, strings only, no persistence. <b>Redis</b>: single-threaded event loop per instance, rich data types, persistence, replication; higher per-key overhead.',
        'Size with <code>max(memory, ops/s)</code> per node, and use consistent hashing, TTL jitter and stampede protection with either.',
      ],
      scene: { nodes: [apps(), mc(), rd(), dbs()], links: [link('apps', 'mc'), link('apps', 'rd'), link('mc', 'dbs', { style: 'dashed' }), link('rd', 'dbs', { style: 'dashed' })], flows: [flow(['apps', 'mc'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
