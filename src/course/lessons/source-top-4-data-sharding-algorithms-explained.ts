import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => crowd('app', -18, 0, 10, 'queries (key → shard?)', extra);
const router = (extra: Partial<SceneNode> = {}) => box('router', -9, 0, 'Shard router', 'purple', 'route', { size: [1.6, 1.6], height: 28, ...extra });
const sh = (i: number, extra: Partial<SceneNode> = {}) => db(`sh${i}`, 5, -9 + i * 6, `Shard ${i + 1}`, { size: [1.3, 1.3], ...extra });
const newSh = (extra: Partial<SceneNode> = {}) => db('newsh', 14, 0, 'New shard added', { size: [1.4, 1.4], ...extra });
const dir = (extra: Partial<SceneNode> = {}) => db('dir', -9, 9, 'Directory (key range → shard)', { size: [1.3, 1.3], ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'source-top-4-data-sharding-algorithms-explained',
  title: 'Sharding Algorithms: Modulo, Range, Consistent Hashing and Directories',
  blurb: 'Four ways to decide which shard owns a key — and what each costs when you add a node: how many keys move, how long rebalancing takes, how evenly load spreads, and which queries stay local.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'mod', label: 'Hash mod N: keys that move when a node is added', icon: 'alert' },
    { key: 'cons', label: 'Consistent hashing: keys that move', icon: 'check' },
    { key: 'rng', label: 'Range split of the hottest shard: keys that move', icon: 'filter' },
    { key: 'time', label: 'Rebalance time: modulo vs consistent hashing', icon: 'timer' },
    { key: 'imb', label: 'Consistent-hashing load imbalance with virtual nodes', icon: 'gauge' },
  ],
  goals: [
    { text: 'What a sharding function must do', step: 1 },
    { text: 'Hash modulo N: simple, brittle', step: 2 },
    { text: 'Range sharding: ordered, splittable, hot-spot prone', step: 3 },
    { text: 'Consistent hashing with virtual nodes', step: 4 },
    { text: 'Directory-based sharding, and choosing', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Shards before adding one', min: 2, max: 1000, step: 1, default: 10, unit: '', description: 'Current shard count.' },
      { key: 'keys', label: 'Keys stored', min: 1000000, max: 100000000000, step: 1000000, default: 1000000000, unit: '', description: 'Total keys.' },
      { key: 'tb', label: 'Data volume', min: 0.1, max: 10000, step: 0.1, default: 10, unit: ' TB', description: 'Total bytes stored.' },
      { key: 'rate', label: 'Rebalance transfer rate', min: 0.05, max: 100, step: 0.05, default: 1, unit: ' GB/s', description: 'Aggregate throughput for moving data.' },
      { key: 'v', label: 'Virtual nodes per physical shard', min: 1, max: 1000, step: 1, default: 100, unit: '', description: 'Positions each shard takes on the hash ring.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 10));
      const keys = Math.max(1, input.keys ?? 1e9);
      const tb = Math.max(0.01, input.tb ?? 10);
      const rate = Math.max(0.001, input.rate ?? 1);
      const v = Math.max(1, Math.round(input.v ?? 100));
      // Adding shard N+1: hash(key) mod N → mod (N+1) keeps a key only when the two residues agree (1 in N+1).
      const modFrac = n / (n + 1);
      const consFrac = 1 / (n + 1);
      // Splitting the most-loaded range in half and moving one half to the new shard.
      const rngFrac = 1 / (2 * n);
      const moveT = (f: number) => (tb * 1000 * f) / rate;
      // v random tokens per node: the share a node owns has relative std dev ≈ 1/√v; the busiest node of n sits ~ 2–3 σ above.
      const sd = 1 / Math.sqrt(v);
      const maxLoad = 1 + Math.sqrt(2 * Math.log(n)) * sd;
      return {
        mod: step < 2 ? { v: '—' } : { v: `${(modFrac * 100).toFixed(1)}% (${fmtN(keys * modFrac)} of ${fmtN(keys)} keys)`, tone: 'bad' },
        cons: step < 4 ? { v: '—' } : { v: `${(consFrac * 100).toFixed(1)}% (${fmtN(keys * consFrac)} keys) — only to the new shard`, tone: 'good' },
        rng: step < 3 ? { v: '—' } : { v: `${(rngFrac * 100).toFixed(1)}% (${fmtN(keys * rngFrac)} keys) — one shard splits`, tone: 'good' },
        time: step < 4 ? { v: '—' } : { v: `${fmtT(moveT(modFrac))} vs ${fmtT(moveT(consFrac))} at ${rate} GB/s (${fmtN(tb * 1000 * modFrac)} GB vs ${fmtN(tb * 1000 * consFrac)} GB)` },
        imb: step < 4 ? { v: '—' } : { v: `std dev ${(sd * 100).toFixed(0)}%; busiest shard ≈ ${maxLoad.toFixed(2)}× the average with ${v} virtual nodes`, tone: maxLoad < 1.3 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Goal',
      kind: 'insight',
      title: 'Choose where each key lives — and be able to change your mind',
      body: [
        'Sharding (see the Partitioning and Staged PostgreSQL lessons) splits a dataset across machines. The <b>sharding function</b> maps a key to a shard, and three properties pull against each other. <b>Even load</b>: data and traffic spread so no shard is a hotspot. <b>Cheap rebalancing</b>: adding or removing a shard moves as few keys as possible — because data movement is slow, I/O-heavy, and risky. <b>Query locality</b>: related keys land together so range scans and multi-key transactions touch one shard.',
        'No function is best on all three. The four classic choices — <b>hash modulo N</b>, <b>range</b>, <b>consistent hashing</b>, and a <b>directory</b> lookup — sit at different points. The numbers below add one shard to ten (10 TB, 1 billion keys, 1 GB/s of rebalancing bandwidth) and ask what each algorithm costs.',
      ],
      scene: { nodes: [app(), router({ tag: pill('shard = f(key)', 'hash') }), sh(0), sh(1), sh(2)], links: [link('app', 'router'), link('router', 'sh0'), link('router', 'sh1'), link('router', 'sh2')], flows: [flow(['app', 'router', 'sh1'], { rate: 1.6 })] },
    },
    {
      short: 'Modulo',
      kind: 'problem',
      title: 'Hash modulo N: perfectly even, catastrophically brittle',
      body: [
        '<code>shard = hash(key) mod N</code> is the obvious first answer: no state to store, O(1) routing, and a good hash spreads keys almost perfectly evenly. Its flaw appears when <b>N changes</b>. A key keeps its shard only if <code>hash mod N</code> equals <code>hash mod (N + 1)</code> — which for a random hash happens for just 1 key in (N + 1). Going from 10 to 11 shards remaps <b>10 ÷ 11 = 90.9%</b> of all keys: 909 million of 1 billion, <b>9.1 TB</b> to move — about <b>2.5 hours</b> at 1 GB/s, during which most reads miss their data.',
        'That makes resizing a rebuild rather than an operation, which is why modulo sharding is fine only for a <b>fixed number of shards</b> chosen generously up front — and why the common refinement is a fixed number of <b>logical shards</b> (say 1,024) hashed modulo, with a separate mapping table assigning logical shards to physical nodes: adding a node moves whole logical shards, not individual keys. Modulo also has <b>no range locality</b>: neighbouring keys hash to unrelated shards, so range scans fan out to every shard (see the Tail Latency lesson for why that hurts).',
      ],
      changes: [{ text: 'A key stays only if hash mod N = hash mod (N+1): 1 in N+1', tone: 'bad' }, { text: '10 → 11 shards remaps 90.9% (9.1 TB, ~2.5 h)', tone: 'bad' }, { text: 'Fix: many logical shards + a logical→physical map', tone: 'good' }],
      scene: { nodes: [app(), router({ tag: pill('hash mod 10 → hash mod 11', 'alert', 'warn') }), sh(0, { tag: pill('90.9% of keys move', 'alert', 'warn') }), sh(1), newSh()], links: [link('app', 'router'), link('router', 'sh0'), link('router', 'sh1'), link('router', 'newsh', { style: 'dashed' })], flows: [flow(['router', 'newsh'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Range',
      kind: 'technique',
      title: 'Range sharding: contiguous key ranges',
      body: [
        '<b>Range sharding</b> divides the sorted key space into contiguous ranges, one per shard (<code>A–F</code>, <code>G–M</code>…; HBase regions, Bigtable tablets, CockroachDB/Spanner ranges, MongoDB chunks with a range key). <b>Range scans stay local</b> (all orders for one customer id, all events in one hour live together), and rebalancing is <b>cheap and incremental</b>: split the most loaded range in two and move one half to the new shard — about 1 ÷ 2N of the data, <b>5%</b> (0.5 TB, ~8 minutes) for ten shards, with every other shard untouched. Ranges split and merge automatically as they grow or cool.',
        'The cost is <b>skew</b>. Keys that increase monotonically (timestamps, auto-increment ids) send <b>all new writes to the last range</b> — a hotspot no amount of shards cures; popular keys (a viral account) concentrate traffic on one range. Mitigate with <b>salting/hash-prefixing</b> the key (spreads writes, loses range order), <b>composite keys</b> (tenant id first, then time), <b>load-based splitting</b> (split on traffic, not just size), and pre-splitting for bulk loads. Range routing needs a <b>sorted map of boundaries</b> (a small metadata table, cached by clients).',
      ],
      changes: [{ text: 'Contiguous ranges: scans local; split a hot range to scale', tone: 'good' }, { text: 'Rebalance ≈ 1/2N of data: 5% for N = 10', tone: 'good' }, { text: 'Monotonic keys and popular keys create hotspots; salt or compose keys', tone: 'bad' }],
      scene: { nodes: [app(), router({ tag: pill('boundaries: A–F | G–M | N–Z', 'list') }), sh(0, { tag: pill('A–F', 'filter') }), sh(1, { state: 'hot', tag: pill('G–M: hot → split', 'alert', 'warn') }), newSh({ tag: pill('takes G–J', 'check', 'good') })], links: [link('app', 'router'), link('router', 'sh0'), link('router', 'sh1'), link('sh1', 'newsh', { style: 'dashed' })], flows: [flow(['sh1', 'newsh'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Ring',
      kind: 'technique',
      title: 'Consistent hashing with virtual nodes',
      body: [
        '<b>Consistent hashing</b> (see that lesson) places both shards and keys on a circular hash space; a key belongs to the next shard clockwise. Adding a shard takes over only the arc between it and its predecessor: on average <b>1 ÷ (N + 1) = 9.1%</b> of keys (91 million, <b>0.9 TB</b>, ~15 minutes) — all moving <i>to the new shard</i>, none shuffling between existing ones — versus 90.9% with modulo. Removing a shard sends its keys to its successor(s). Used by Dynamo-style stores (Cassandra, Riak), memcached client libraries and CDNs.',
        'With one position per shard, arcs are very uneven. <b>Virtual nodes</b> give each physical shard many positions (100 here): a shard’s total share is a sum of many small random arcs, so its relative standard deviation falls like <b>1 ÷ √v = 10%</b>, and the busiest of ten shards runs ≈ 1.2× the average; with 1,000 vnodes the spread tightens to 3%. Vnodes also let you weight heterogeneous machines (more tokens for bigger nodes) and spread a failed node’s load across many peers instead of dumping it on one neighbour. Cost: more routing metadata and slightly more complex replica placement (rack/zone awareness); no range locality, like any hash scheme (unless combined with order-preserving partitioning).',
      ],
      changes: [{ text: 'Adding a shard moves 1/(N+1) = 9.1% of keys, only to the new shard', tone: 'good' }, { text: 'Virtual nodes: imbalance ≈ 1/√v (10% at v = 100)', tone: 'good' }, { text: 'Weighted tokens; failure spreads load across many peers', tone: 'good' }],
      concepts: [{ term: 'Virtual node', def: 'One of many ring positions assigned to a physical shard, used to even out load and spread the impact of adding or losing a node.' }],
      scene: { nodes: [app(), router({ tag: pill('hash ring · 100 vnodes each', 'hash', 'good') }), sh(0, { tag: pill('±10%', 'gauge') }), sh(1), newSh({ tag: pill('takes 9.1%', 'check', 'good') })], links: [link('app', 'router'), link('router', 'sh0'), link('router', 'sh1'), link('router', 'newsh')], flows: [flow(['sh0', 'newsh'], { kind: 'write', rate: 1.2 }), flow(['sh1', 'newsh'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Directory',
      kind: 'tradeoff',
      title: 'Directory-based sharding, and choosing',
      body: [
        '<b>Directory (lookup) sharding</b> keeps an explicit table of <code>key (or key group) → shard</code> in a metadata service. Placement is <b>arbitrary</b>: put a huge tenant on its own shard, co-locate related entities, migrate one customer at a time, balance by <i>actual</i> load rather than hash luck — and rebalancing moves exactly what you choose. This is how multi-tenant SaaS (tenant → pod; see the Modular Monolith lesson), Vitess-style systems and many “logical shard” designs work. The costs: an <b>extra lookup</b> on every request (mitigated by client caching with invalidation), a <b>critical metadata service</b> that must be highly available and consistent (a stale map misroutes writes), and operational tooling to run migrations safely.',
        '<b>Choosing</b>: need range scans or time-ordered queries → <b>range</b> (with care for hot keys); uniform point lookups, elastic cluster → <b>consistent hashing</b>; fixed, known layout or simple system → <b>modulo over many logical shards</b>; heterogeneous tenants, strict isolation or manual control → <b>directory</b>. Most mature systems <b>combine</b> them: hash to a logical shard, directory from logical shard to node, range within a shard. Whatever the algorithm, plan resharding up front: <b>dual-write or log-based copy, verify, switch the map atomically, keep a way back</b> (see the Live Data Migration lesson). Figures here are model outputs; real skew often dominates.',
      ],
      changes: [{ text: 'Directory: arbitrary placement, per-tenant moves; extra hop + critical metadata', tone: 'info' }, { text: 'Range for scans · ring for elastic point lookups · logical shards for simplicity', tone: 'info' }, { text: 'Combine: hash → logical shard → directory → node', tone: 'good' }],
      scene: { nodes: [app(), router({ tag: pill('cached directory lookup', 'search') }), dir({ tag: pill('tenant 42 → shard 7', 'list') }), sh(0), sh(1)], links: [link('app', 'router'), link('router', 'dir'), link('router', 'sh0'), link('router', 'sh1')], flows: [flow(['app', 'router', 'sh0'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Pick for rebalancing cost and query shape',
      body: [
        '<b>Modulo</b>: even but moves N/(N+1) of keys when N changes (90.9%). <b>Range</b>: scans local, split a hot range (≈ 5%), but skew-prone. <b>Consistent hashing + vnodes</b>: moves 1/(N+1) (9.1%) to the new node, imbalance ≈ 1/√v. <b>Directory</b>: arbitrary placement at the price of a lookup and a critical map.',
        'Combine them, plan the migration, and measure real skew.',
      ],
      scene: { nodes: [app(), router(), sh(0), sh(1), newSh()], links: [link('app', 'router'), link('router', 'sh0'), link('router', 'sh1'), link('router', 'newsh')], flows: [flow(['app', 'router', 'sh0'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
