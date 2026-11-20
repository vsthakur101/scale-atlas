import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -16, 0, 'Application servers', 'orange', 'server', { size: [1.5, 1.5], height: 28, ...extra });
const proxy = (extra: Partial<SceneNode> = {}) => box('proxy', -7, 0, 'Query router / proxy', 'purple', 'route', { size: [1.5, 1.5], height: 28, ...extra });
const mono = (extra: Partial<SceneNode> = {}) => db('mono', 4, 0, 'One big Postgres', { size: [2, 2], ...extra });
const dbA = (extra: Partial<SceneNode> = {}) => db('dbA', 4, -8, 'DB: files + comments', { size: [1.4, 1.4], ...extra });
const dbB = (extra: Partial<SceneNode> = {}) => db('dbB', 4, 8, 'DB: orgs + billing', { size: [1.4, 1.4], ...extra });
const sh = (i: number, extra: Partial<SceneNode> = {}) => db(`sh${i}`, 13, -9 + i * 6, `Shard ${i}`, { size: [1.2, 1.2], ...extra });
const rep = (extra: Partial<SceneNode> = {}) => db('rep', 13, 12, 'Read replicas', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const pow2 = (n: number): number => Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));

const lesson: Lesson = {
  slug: 'academy-how-figma-scaled-postgres-to-4m-users',
  title: 'Scaling PostgreSQL in Stages: Replicas, Vertical Splits and Horizontal Shards',
  blurb: 'How a single relational database is taken from one box to many without a rewrite: bigger hardware, read replicas, moving whole tables to their own databases, then horizontal sharding behind a routing layer — with capacity maths and the cost of fan-out.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'now', label: 'Shards for today’s write load', icon: 'db' },
    { key: 'future', label: 'Shards after growth', icon: 'activity' },
    { key: 'fan', label: 'Chance a fan-out query hits a slow shard', icon: 'alert' },
    { key: 'cross', label: 'Cross-shard load on the router', icon: 'route' },
  ],
  goals: [
    { text: 'Stage 0–1: scale up and out with replicas', step: 1 },
    { text: 'Stage 2: vertical partitioning by table group', step: 2 },
    { text: 'Stage 3: horizontal sharding by a key', step: 3 },
    { text: 'The routing layer and the cost of cross-shard queries', step: 4 },
    { text: 'Migrating without downtime', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'wps', label: 'Peak writes per second (all tables)', min: 1000, max: 2000000, step: 1000, default: 60000, unit: '/s', description: 'Write transactions at peak.' },
      { key: 'cap', label: 'Writes one node sustains', min: 500, max: 50000, step: 500, default: 6000, unit: '/s', description: 'Primary write capacity for your schema and hardware.' },
      { key: 'util', label: 'Target utilisation', min: 20, max: 90, step: 5, default: 60, unit: '%', description: 'Headroom for spikes, vacuum and failover.' },
      { key: 'growth', label: 'Write growth per year', min: 0, max: 400, step: 5, default: 80, unit: '%', description: 'Annual increase in write rate.' },
      { key: 'years', label: 'Years of headroom wanted', min: 0.5, max: 5, step: 0.5, default: 2, unit: '', description: 'How far ahead to size the shard count.' },
      { key: 'cross', label: 'Queries that must touch every shard', min: 0, max: 50, step: 0.5, default: 3, unit: '%', description: 'Share of reads not routable by shard key.' },
      { key: 'slow', label: 'Chance one shard is slow on a request', min: 0.01, max: 10, step: 0.01, default: 1, unit: '%', description: 'Probability a given shard is slow (GC, vacuum, noisy neighbour).' },
      { key: 'rps', label: 'Total queries per second', min: 1000, max: 5000000, step: 1000, default: 200000, unit: '/s', description: 'All reads and writes through the router.' },
    ],
    calculate: (input, step) => {
      const wps = Math.max(1, input.wps ?? 60000);
      const cap = Math.max(1, input.cap ?? 6000);
      const util = Math.min(0.95, Math.max(0.1, (input.util ?? 60) / 100));
      const growth = Math.max(0, (input.growth ?? 80) / 100);
      const years = Math.max(0, input.years ?? 2);
      const cross = Math.min(1, Math.max(0, (input.cross ?? 3) / 100));
      const slow = Math.min(1, Math.max(0, (input.slow ?? 1) / 100));
      const rps = Math.max(1, input.rps ?? 2e5);
      const now = Math.ceil(wps / (cap * util));
      const nowPow = pow2(now);
      const later = Math.ceil((wps * Math.pow(1 + growth, years)) / (cap * util));
      const laterPow = pow2(later);
      const fan = 1 - Math.pow(1 - slow, laterPow);
      const crossLoad = rps * cross * laterPow;
      return {
        now: step < 3 ? { v: '—' } : { v: `${now} needed → ${nowPow} (power of two for easy splits)` },
        future: step < 3 ? { v: '—' } : { v: `${later} needed → ${laterPow} shards (${years} yr at ${Math.round(growth * 100)}% growth)` },
        fan: step < 4 ? { v: '—' } : { v: `${(fan * 100).toFixed(1)}% (1 − (1 − ${(slow * 100).toFixed(2)}%)^${laterPow})`, tone: fan < 0.05 ? 'good' : fan < 0.2 ? 'warn' : 'bad' },
        cross: step < 4 ? { v: '—' } : { v: `${fmtN(crossLoad)} shard-queries/s from ${fmtN(rps * cross)} fan-out queries`, tone: crossLoad < rps * 0.5 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Scale up',
      kind: 'technique',
      title: 'First, the cheap moves: a bigger box and read replicas',
      body: [
        'A relational database on one primary is operationally simple: transactions, joins and constraints just work. The first scaling moves keep that: <b>scale up</b> (more cores, RAM, faster NVMe — a surprisingly long runway), <b>tune</b> (indexes, query plans, autovacuum, connection pooling — see the Connection Pooling lesson), and <b>offload reads to replicas</b> (streaming replication; reads that tolerate a little <b>replication lag</b> go to replicas — see the Consistency Patterns lesson).',
        'Replicas scale reads but <b>not writes</b>: every replica replays the same write stream, and the primary is still one machine with one WAL (see the ACID lesson). When write throughput, table size (vacuum and index maintenance over multi-terabyte tables), or migration pain approach the ceiling of the largest instance, the data must be split. The key planning number is <b>write capacity per node</b>: 6,000 writes/s at 60% utilisation = 3,600 safe writes/s per node.',
      ],
      changes: [{ text: 'Scale up, tune, add read replicas', tone: 'good' }, { text: 'Replicas do not scale writes', tone: 'bad' }],
      scene: { nodes: [app(), mono({ tag: pill('one primary: write ceiling', 'alert', 'warn') }), rep({ tag: pill('reads only', 'db') })], links: [link('app', 'mono'), link('mono', 'rep', { style: 'dashed' })], flows: [flow(['app', 'mono'], { kind: 'write', rate: 2 }), flow(['mono', 'rep'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Vertical',
      kind: 'technique',
      title: 'Vertical partitioning: give each table group its own database',
      body: [
        '<b>Vertical partitioning</b> moves whole <b>groups of tables</b> into separate databases along product boundaries — files and comments in one cluster, organisations and billing in another. Each gets its own primary, replicas, connection pool and capacity. It is the best first split because it needs <b>no change to the data model within a group</b>: joins inside a group remain local, and the application mostly changes its connection strings.',
        'It costs the <b>joins across groups</b> (they become application-level lookups or are replaced by denormalised copies and foreign ids without constraints) and loses cross-group transactions — so choose the cut along the lowest-coupling seams, by looking at which tables are joined and written together. And it has a limit: the single largest, hottest table group can still outgrow one node. A write load of 60,000/s that splits into three groups of 20,000/s relieves the primary but doesn’t fit a 3,600/s node: the busiest group needs the next step.',
      ],
      changes: [{ text: 'Move table groups to their own clusters along low-coupling seams', tone: 'good' }, { text: 'Cross-group joins become application lookups', tone: 'bad' }],
      scene: { nodes: [app(), proxy(), dbA({ tag: pill('hot: 40k writes/s', 'alert', 'warn') }), dbB({ tag: pill('quiet: 5k/s', 'db') })], links: [link('app', 'proxy'), link('proxy', 'dbA'), link('proxy', 'dbB')], flows: [flow(['app', 'proxy', 'dbA'], { kind: 'write', rate: 2.4 }), flow(['proxy', 'dbB'], { kind: 'write', rate: 0.6 })] },
    },
    {
      short: 'Horizontal',
      kind: 'technique',
      title: 'Horizontal sharding: split one table group by a key',
      body: [
        'For the table group that exceeds one node, <b>horizontal sharding</b> splits its <b>rows</b> across many databases by a <b>shard key</b> — often the tenant, organisation or file id, so all data used together is in the same shard. Capacity maths: 60,000 writes/s ÷ (6,000 × 60%) = <b>17 shards</b> today; with 80% yearly growth over 2 years the write rate is 194,400/s → <b>54 shards</b>. Round up to <b>powers of two</b> (32 now, 64 later) so a shard splits cleanly in two and “shard = hash(key) mod 2ⁿ” stays easy to reason about; map many <b>logical shards</b> to physical hosts so rebalancing moves buckets, not rows.',
        'Key choice is the whole game: pick a key with <b>high cardinality and even load</b> (a hot tenant becomes a hot shard — plan to split or isolate it), that <b>appears in almost every query</b>, and that keeps related rows together so transactions stay single-shard. Colocate child tables with the parent key; replicate small global reference tables to every shard; and keep shard-local unique constraints (global uniqueness needs a separate mechanism or generated ids).',
      ],
      changes: [{ text: '17 shards for today, 54 for two years at 80% growth → 32 / 64', tone: 'info' }, { text: 'Shard key: even load, in every query, keeps related rows together', tone: 'good' }, { text: 'Hot tenant = hot shard: isolate or split', tone: 'bad' }],
      concepts: [{ term: 'Shard key', def: 'The column(s) whose value decides which shard holds a row; it determines load balance, query routing and which transactions stay local.' }],
      scene: { nodes: [app(), proxy({ tag: pill('shard = hash(org_id) mod 64', 'hash') }), sh(0), sh(1), sh(2)], links: [link('app', 'proxy'), link('proxy', 'sh0'), link('proxy', 'sh1'), link('proxy', 'sh2')], flows: [flow(['app', 'proxy', 'sh0'], { kind: 'write', rate: 1.2 }), flow(['proxy', 'sh1'], { kind: 'write', rate: 1.2 }), flow(['proxy', 'sh2'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Routing',
      kind: 'problem',
      title: 'The routing layer — and the price of fan-out',
      body: [
        'Applications shouldn’t know shard topology, so a <b>routing layer</b> (a proxy, or a client library that parses queries) takes each SQL statement, extracts the shard key, and sends it to the right shard; it handles connection pooling per shard, retries, and the logical-to-physical map. Queries <b>without the shard key</b> must be <b>scatter-gathered</b> to every shard, merged and re-sorted — correct but expensive.',
        'Scatter-gather has a tail-latency penalty: with 64 shards and a 1% chance any shard is slow, a fan-out query waits for the slowest, so <b>1 − 0.99⁶⁴ = 47.4%</b> of fan-out queries hit a slow shard. And it multiplies load: 3% of 200,000 queries/s (6,000) touching 64 shards generate <b>384,000 shard-queries/s</b> — more than the 200,000 everything else produces. Mitigations: keep fan-out queries rare, add <b>secondary lookup tables or search indexes</b> for the common non-key access paths, bound them with time limits and hedged requests, and watch the share of non-routable queries as a first-class metric.',
      ],
      changes: [{ text: 'Proxy extracts shard key and routes', tone: 'good' }, { text: '64 shards, 1% slow each → 47.4% of fan-outs wait on a slow shard', tone: 'bad' }, { text: '3% fan-out = 384k shard-queries/s of extra load', tone: 'bad' }],
      scene: { nodes: [app(), proxy({ state: 'hot', tag: pill('scatter-gather: all 64', 'alert', 'warn') }), sh(0), sh(1), sh(2)], links: [link('app', 'proxy'), link('proxy', 'sh0'), link('proxy', 'sh1'), link('proxy', 'sh2')], flows: [flow(['app', 'proxy', 'sh0'], { kind: 'heavy', rate: 2 }), flow(['proxy', 'sh1'], { kind: 'heavy', rate: 2 }), flow(['proxy', 'sh2'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Migrate',
      kind: 'technique',
      title: 'Migrating a live system without downtime',
      body: [
        'The hard part is moving production data while serving traffic. A common sequence: (1) <b>prepare the schema</b> and the application so every query carries the shard key; (2) run the new routing layer in <b>logical-only mode</b> against the unsharded database to find queries that would break; (3) <b>copy data</b> into the new shards with logical replication (Postgres publications/subscriptions) while the old primary keeps taking writes; (4) validate with <b>dual reads and checksums</b>; (5) <b>cut over</b> by briefly pausing writes, letting replication catch up, switching the routing map, and keeping the old database as a <b>fallback</b> with reverse replication for a while.',
        'Controls that make it safe: percentage-based rollout per table or tenant, a kill switch that flips routing back, and <b>shadow traffic</b> comparing results. Also budget for operational reality: many more databases to monitor, upgrade and back up; schema migrations that must roll across all shards; and a slower development loop for features that cut across shards. Sharding is a last resort — alternatives are purpose-built distributed SQL (see the Spanner lesson) or moving a specific workload to a different store. All figures here are first-order model outputs.',
      ],
      changes: [{ text: 'Logical replication to new shards, dual-read validation, cutover with fallback', tone: 'good' }, { text: 'More databases to run: tooling, upgrades, backups', tone: 'info' }],
      scene: { nodes: [app(), proxy({ tag: pill('routing map v2', 'hash') }), mono({ name: 'Old primary (fallback)', tag: pill('reverse replication', 'refresh') }), sh(0, { tag: pill('copied + validated', 'check', 'good') }), sh(1)], links: [link('app', 'proxy'), link('proxy', 'mono', { style: 'dashed' }), link('proxy', 'sh0'), link('proxy', 'sh1'), link('mono', 'sh0', { style: 'dashed' })], flows: [flow(['mono', 'sh0'], { kind: 'write', rate: 1 }), flow(['app', 'proxy', 'sh1'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Split by table first, then by key; watch fan-out',
      body: [
        'Scale up and add replicas first; then <b>vertically partition</b> table groups; then <b>horizontally shard</b> the group that outgrows a node using a key with even load and locality, with power-of-two logical shards. A routing layer hides topology, but <b>scatter-gather queries</b> multiply load and tail latency.',
        'Migrate with logical replication, validation and a reversible cutover — and treat the shard-key choice as the decision that is hardest to change.',
      ],
      scene: { nodes: [app(), proxy(), sh(0), sh(1), sh(2), rep()], links: [link('app', 'proxy'), link('proxy', 'sh0'), link('proxy', 'sh1'), link('proxy', 'sh2'), link('sh1', 'rep', { style: 'dashed' })], flows: [flow(['app', 'proxy', 'sh1'], { kind: 'write', rate: 1.4 })] },
    },
  ],
};

export default lesson;
