import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = crowd('users', -12, 1, 18, '50k writes/s');
const router = (extra: Partial<SceneNode> = {}) => box('router', -4, 0, 'Router', 'orange', 'route', { sub: 'key → shard', ...extra });
const shard = (i: 1 | 2 | 3 | 4, extra: Partial<SceneNode> = {}): SceneNode => {
  const pos = { 1: [4, -8], 2: [6, -2], 3: [8, 4], 4: [10, 10] } as const;
  const [r, d] = pos[i];
  return db(`s${i}`, r, d, `Shard ${i}`, extra);
};
const to = (ids: string[]) => ids.map((s) => link('router', s));

const lesson: Lesson = {
  slug: 'partitioning',
  title: 'Partitioning',
  blurb: 'When data no longer fits one machine, split it — and live with the hot spots, rebalancing and cross-shard queries that follow.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'maxload', label: 'Hottest shard', icon: 'cpu' },
    { key: 'per', label: 'Data / shard', icon: 'disk' },
    { key: 'fanout', label: 'Query fan-out', icon: 'share' },
    { key: 'moved', label: 'Data moved', icon: 'refresh' },
  ],
  goals: [
    { text: 'Range partitioning and its hot spots', step: 3 },
    { text: 'Hash partitioning and lost range scans', step: 4 },
    { text: 'Why mod-N rebalancing moves nearly everything', step: 5 },
    { text: 'Handling celebrity keys', step: 6 },
    { text: 'Scatter-gather and request routing', step: 8 },
  ],
  legend: ['write', 'request', 'response', 'heavy'],
  steps: [
    {
      short: 'Too big',
      kind: 'problem',
      title: 'Bigger than any one machine',
      body: [
        'A messaging service stores 20 TB of messages and takes 50,000 writes per second. Replicas helped with reads, but every replica holds <b>all</b> the data and every write still lands on one leader. Neither the disk nor the write rate fits a single node.',
        'The answer is <b>partitioning</b> (sharding): give each node a subset of the data, so both storage and writes divide across machines.',
      ],
      concepts: [{ term: 'Partitioning (sharding)', def: 'Splitting a dataset so each node stores and serves only a subset of it.' }],
      scene: {
        nodes: [users, db('one', 4, 0, 'Database', { load: 97, state: 'hot', tag: pill('20 TB · 50k w/s', 'alert', 'bad') })],
        links: [link('users', 'one')],
        flows: [flow(['users', 'one'], { kind: 'write', rate: 6, speed: 0.6 })],
        metrics: { maxload: { v: '97%', tone: 'bad' }, per: { v: '20 TB', tone: 'bad' }, fanout: '1', moved: '—' },
      },
    },
    {
      short: 'By range',
      kind: 'technique',
      title: 'Split by key range',
      body: [
        'Give each shard a contiguous range of keys: conversations A–H on shard 1, I–P on shard 2, Q–Z on shard 3. A small routing table maps ranges to shards, and range queries (“all conversations starting with K”) touch a single shard.',
        'Ranges can be split when they grow — HBase, Bigtable, CockroachDB and others work this way.',
      ],
      changes: [{ text: '3 shards by key range', tone: 'good' }],
      concepts: [{ term: 'Range partitioning', def: 'Assigning contiguous key ranges to partitions; keeps neighbouring keys together for range scans.' }],
      scene: {
        nodes: [users, router({ tag: pill('A–H · I–P · Q–Z', 'list') }), shard(1, { load: 35, tag: pill('A–H') }), shard(2, { load: 33, tag: pill('I–P') }), shard(3, { load: 32, tag: pill('Q–Z') })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3'])],
        flows: [flow(['users', 'router', 's1'], { kind: 'write', rate: 2 }), flow(['users', 'router', 's2'], { kind: 'write', rate: 2 }), flow(['users', 'router', 's3'], { kind: 'write', rate: 2 })],
        metrics: { maxload: '35%', per: '6.7 TB', fanout: '1', moved: '—' },
      },
    },
    {
      short: 'Hot range',
      kind: 'problem',
      title: 'When the key is a timestamp',
      body: [
        'The messages table is partitioned by <code>created_at</code> so “last hour of messages” is one shard. But <b>every new message</b> has the newest timestamp, so every write lands on the last range. One shard is at 98%; the others only serve old reads.',
        'Range partitioning follows the key distribution, and monotonic keys — timestamps, auto-increment IDs — concentrate all writes at the end.',
      ],
      changes: [{ text: 'All writes → newest range', tone: 'bad' }],
      concepts: [{ term: 'Hot spot', def: 'A partition receiving a disproportionate share of traffic.' }],
      scene: {
        nodes: [users, router({ tag: pill('by created_at', 'clock') }), shard(1, { load: 4, tag: pill('Jan–Apr') }), shard(2, { load: 6, tag: pill('May–Aug') }), shard(3, { load: 98, state: 'hot', tag: pill('Sep–now', 'alert', 'bad') })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3'])],
        flows: [flow(['users', 'router', 's3'], { kind: 'write', rate: 6, speed: 0.7 })],
        metrics: { maxload: { v: '98%', tone: 'bad' }, per: '6.7 TB', fanout: '1', moved: '—' },
      },
    },
    {
      short: 'By hash',
      kind: 'technique',
      title: 'Split by hash of the key',
      body: [
        'Partition by <code>hash(conversation_id) mod 3</code> instead. A good hash scatters keys uniformly, so writes spread evenly no matter how the IDs are assigned, and each shard gets ~⅓ of the load.',
        'The cost: neighbouring keys end up on different shards, so a range query must ask <b>every</b> shard. Many systems compromise with a compound key — hash the conversation ID to pick the shard, then keep messages sorted by time within it.',
      ],
      changes: [{ text: 'Even load: ~33% each', tone: 'good' }, { text: 'Range scans hit all shards', tone: 'bad' }],
      concepts: [{ term: 'Hash partitioning', def: 'Choosing a partition by hashing the key, spreading keys uniformly but scattering ranges.' }],
      scene: {
        nodes: [users, router({ tag: pill('hash(id) mod 3', 'hash') }), shard(1, { load: 34 }), shard(2, { load: 33 }), shard(3, { load: 33 })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3'])],
        flows: [flow(['users', 'router', 's1'], { kind: 'write', rate: 2 }), flow(['users', 'router', 's2'], { kind: 'write', rate: 2 }), flow(['users', 'router', 's3'], { kind: 'write', rate: 2 })],
        metrics: { maxload: { v: '34%', tone: 'good' }, per: '6.7 TB', fanout: 'ranges: 3', moved: '—' },
      },
    },
    {
      short: 'Reshard',
      kind: 'problem',
      title: 'Adding a fourth shard moves almost everything',
      body: [
        'Growth demands a fourth shard. But with <code>mod N</code>, changing N from 3 to 4 changes the shard for about <b>75%</b> of all keys. Fifteen terabytes must move between machines while the system stays online — saturating networks and disks for days.',
        'Two common fixes: create many more partitions than nodes up front (say 256) and move <i>whole partitions</i> between nodes, or use <b>consistent hashing</b> — the next lesson.',
      ],
      note: { kind: 'tip', text: 'Fixed partition counts are why Kafka topics, Elasticsearch indexes and many sharded SQL setups ask you to choose a partition count much larger than today’s node count.' },
      changes: [{ text: 'mod 3 → mod 4', tone: 'bad' }, { text: '~75% of keys relocate', tone: 'bad' }],
      scene: {
        nodes: [users, router({ tag: pill('hash(id) mod 4', 'hash', 'warn') }), shard(1, { load: 70 }), shard(2, { load: 72 }), shard(3, { load: 71 }), shard(4, { state: 'ghost', tag: pill('new', 'sparkle') })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3', 's4']), link('s1', 's2', { style: 'dashed', arrow: 'both' }), link('s2', 's3', { style: 'dashed', arrow: 'both' }), link('s3', 's4', { style: 'dashed' })],
        flows: [flow(['s1', 's2'], { kind: 'heavy', rate: 1 }), flow(['s2', 's3'], { kind: 'heavy', rate: 1 }), flow(['s3', 's4'], { kind: 'heavy', rate: 1 }), flow(['s2', 's1'], { kind: 'heavy', rate: 1 })],
        metrics: { maxload: { v: '72%', tone: 'warn' }, per: '5 TB', fanout: 'ranges: 4', moved: { v: '15 TB', tone: 'bad' } },
      },
    },
    {
      short: 'Celebrity',
      kind: 'case',
      title: 'Case: one key that’s hotter than a shard',
      body: [
        'Hashing spreads <i>keys</i> evenly, not <i>traffic</i>. A celebrity’s broadcast channel gets 40% of all writes — and every write for that one ID hashes to the same shard.',
        'Fix it in the application: split the hot key into sub-keys with a suffix (<code>chan:9#0 … chan:9#15</code>) so its writes spread over 16 shards. Reads must now gather from all 16, so do this only for the keys that need it.',
      ],
      concepts: [{ term: 'Key salting', def: 'Appending a suffix to a hot key to spread its load across several partitions.' }],
      scene: {
        nodes: [users, router({ tag: pill('chan:9 → #0…#15', 'hash', 'good') }), shard(1, { load: 48 }), shard(2, { load: 51 }), shard(3, { load: 50 }), shard(4, { load: 49 })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3', 's4'])],
        flows: ['s1', 's2', 's3', 's4'].map((s) => flow(['users', 'router', s], { kind: 'write', rate: 1.6 })),
        metrics: { maxload: { v: '51%', tone: 'good' }, per: '5 TB', fanout: 'chan:9 → 16', moved: '—' },
      },
    },
    {
      short: 'Scatter',
      kind: 'tradeoff',
      title: 'Queries that don’t know the key',
      body: [
        '“Find messages mentioning <i>invoice</i> from user 77” can’t be routed: messages are partitioned by conversation, not by sender. The router sends it to every shard and merges the results — <b>scatter-gather</b> — and the query is only as fast as the slowest shard.',
        'Secondary indexes face the same choice: <b>local</b> indexes (each shard indexes its own data — cheap writes, scatter reads) or a <b>global</b> index partitioned by the indexed term (targeted reads, but each write updates another shard asynchronously).',
      ],
      concepts: [
        { term: 'Scatter-gather', def: 'Sending a query to all partitions in parallel and merging their results.' },
        { term: 'Global secondary index', def: 'An index partitioned by the indexed value rather than the primary key, enabling targeted lookups.' },
      ],
      scene: {
        nodes: [users, router({ tag: pill('sender = 77 → ?', 'search', 'warn') }), shard(1), shard(2), shard(3), shard(4, { tag: pill('slowest: 140 ms', 'clock', 'bad') })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3', 's4']).map((l) => ({ ...l, arrow: 'both' as const }))],
        flows: [...['s1', 's2', 's3'].map((s) => flow(['router', s], { back: true, rate: 1 })), flow(['router', 's4'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.4 })],
        metrics: { maxload: '50%', per: '5 TB', fanout: { v: '4 (all)', tone: 'warn' }, moved: '—' },
      },
    },
    {
      short: 'Routing',
      kind: 'technique',
      title: 'Who knows where each key lives?',
      body: [
        'Something must map keys to shards and stay correct while partitions move. Options: a <b>routing tier</b> that clients call (like this router), <b>partition-aware clients</b> that cache the map, or <b>any node</b> accepting requests and forwarding them.',
        'The map itself usually lives in a small, strongly consistent coordination service (ZooKeeper, etcd), and routers subscribe to changes.',
      ],
      scene: {
        nodes: [users, router(), box('coord', -4, -9, 'Config', 'yellow', 'key', { size: [1.3, 1.3], height: 32, sub: 'partition map', tag: pill('etcd', 'shield') }), shard(1), shard(2), shard(3), shard(4)],
        links: [link('users', 'router'), link('coord', 'router', { style: 'dashed', label: pill('watch') }), ...to(['s1', 's2', 's3', 's4'])],
        flows: [flow(['coord', 'router'], { kind: 'handshake', rate: 0.4 }), ...['s1', 's2', 's3', 's4'].map((s) => flow(['users', 'router', s], { kind: 'write', rate: 1.3 }))],
        metrics: { maxload: '50%', per: '5 TB', fanout: '1', moved: '—' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Choosing the partition key is the design',
      body: [
        '<b>Range</b> partitioning keeps ranges together but turns monotonic keys into hot spots. <b>Hash</b> partitioning spreads load but scatters ranges. Plan rebalancing from day one — fixed partition counts or consistent hashing — and handle celebrity keys explicitly.',
        'Queries that include the partition key are cheap; everything else is scatter-gather. Pick the key that your most important queries filter on.',
      ],
      scene: {
        nodes: [users, router({ tag: pill('partition key', 'key', 'good') }), shard(1, { load: 50 }), shard(2, { load: 50 }), shard(3, { load: 50 }), shard(4, { load: 50 })],
        links: [link('users', 'router'), ...to(['s1', 's2', 's3', 's4'])],
        flows: ['s1', 's2', 's3', 's4'].map((s) => flow(['users', 'router', s], { kind: 'write', rate: 1.4 })),
        metrics: { maxload: '50%', per: '5 TB', fanout: '1', moved: '—' },
      },
    },
  ],
};

export default lesson;
