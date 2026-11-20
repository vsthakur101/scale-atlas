import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -16, 0, 'Query / index request', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const coord = (extra: Partial<SceneNode> = {}) => box('coord', -8, 0, 'Coordinating node', 'purple', 'route', { size: [1.4, 1.4], height: 28, ...extra });
const shard = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`s${i}`, 2, (i - (n - 1) / 2) * 5, name, 'blue', 'db', { size: [1.3, 1.3], height: 26, ...extra });
const seg = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  disk(`g${i}`, -4 + i * 4.4, 6, name, { size: [1.8, 1], height: 10, tone: 'yellow', icon: 'list', ...extra });
const buffer = (extra: Partial<SceneNode> = {}) => box('buf', -8, -6, 'In-memory buffer + translog', 'orange', 'bolt', { size: [1.5, 1.2], height: 18, ...extra });

const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(0)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-top-6-elasticsearch-use-cases',
  title: 'Elasticsearch and Lucene: Segments, Shards and Near-Real-Time Search',
  blurb: 'A distributed search engine built from immutable Lucene segments: why new documents appear after a refresh, how shards scale (and over-scale), and the sizing arithmetic that keeps clusters healthy.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'data', label: 'Primary data size', icon: 'disk' },
    { key: 'shards', label: 'Primary shards (at the target size)', icon: 'layers' },
    { key: 'total', label: 'Total shard copies (with replicas)', icon: 'share' },
    { key: 'heap', label: 'Heap needed just to hold shards', icon: 'cpu' },
    { key: 'tail', label: 'Chance a search waits on a slow shard', icon: 'alert' },
  ],
  goals: [
    { text: 'The inverted index and immutable segments', step: 2 },
    { text: 'Near-real-time search: buffer, refresh and translog', step: 3 },
    { text: 'Segment merging and why deletes are lazy', step: 4 },
    { text: 'Shards, replicas and how a search scatters and gathers', step: 5 },
    { text: 'Shard sizing: too many is worse than too few', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'docs', label: 'Documents', min: 1000000, max: 100000000000, step: 1000000, default: 2000000000, unit: '', description: 'Documents in the index.' },
      { key: 'kb', label: 'Average indexed size per document', min: 0.1, max: 100, step: 0.1, default: 1.5, unit: ' KB', description: 'Stored size including the inverted index and doc values.' },
      { key: 'target', label: 'Target shard size', min: 1, max: 200, step: 1, default: 30, unit: ' GB', description: 'Common guidance is tens of GB per shard.' },
      { key: 'rep', label: 'Replicas per primary', min: 0, max: 4, step: 1, default: 1, unit: '', description: 'Copies for availability and read throughput.' },
      { key: 'perGB', label: 'Shards per GB of heap', min: 5, max: 50, step: 1, default: 20, unit: '', description: 'Rule of thumb for how many shards a node can comfortably manage per GB of JVM heap.' },
      { key: 'slow', label: 'Chance one shard is slow on a query', min: 0.01, max: 5, step: 0.01, default: 0.2, unit: '%', description: 'Probability a given shard exceeds the latency target.' },
    ],
    calculate: (input, step) => {
      const docs = Math.max(1, input.docs ?? 2e9);
      const kb = Math.max(0.01, input.kb ?? 1.5);
      const target = Math.max(0.1, input.target ?? 30) * 1e9;
      const rep = Math.max(0, Math.round(input.rep ?? 1));
      const perGB = Math.max(1, input.perGB ?? 20);
      const slow = Math.min(1, Math.max(0, (input.slow ?? 0.2) / 100));
      const bytes = docs * kb * 1000;
      const primaries = Math.max(1, Math.ceil(bytes / target));
      const total = primaries * (1 + rep);
      const heap = total / perGB;
      const tail = 1 - Math.pow(1 - slow, primaries);
      return {
        data: step < 1 ? { v: '—' } : { v: `${fmtB(bytes)} (${fmtB(bytes * (1 + rep))} with replicas)` },
        shards: step < 4 ? { v: '—' } : { v: fmtN(primaries) },
        total: step < 4 ? { v: '—' } : { v: fmtN(total) },
        heap: step < 5 ? { v: '—' } : { v: `${heap.toFixed(heap < 10 ? 1 : 0)} GB of JVM heap across the cluster`, tone: heap > 500 ? 'warn' : 'good' },
        tail: step < 4 ? { v: '—' } : { v: `${(tail * 100).toFixed(tail < 0.1 ? 1 : 0)}% (${fmtN(primaries)} shards queried)`, tone: tail < 0.05 ? 'good' : tail < 0.3 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Search is a different workload from a database',
      body: [
        'Elasticsearch (and the Lucene library inside it, also behind Solr and OpenSearch) answers questions a relational database does badly: <b>full-text search</b> with relevance ranking, fuzzy and prefix matching, <b>faceting and aggregations</b> over huge sets, and <b>log and event analytics</b> where you filter by time and field and count. Typical uses: site and product search, application and security log analysis (the “ELK” stack), metrics and observability, geo queries, recommendations and autocomplete.',
        'It is a <b>secondary, query-optimised copy</b> of data kept elsewhere (a system of record, or a log stream), not the source of truth: it trades transactional guarantees for fast retrieval over a denormalised, indexed view. Its design follows from two ideas — an <b>inverted index</b> built from <b>immutable files</b> — and a way to shard and replicate them.',
      ],
      scene: { nodes: [client(), coord(), shard(0, 3, 'Shard 1'), shard(1, 3, 'Shard 2'), shard(2, 3, 'Shard 3')], links: [link('client', 'coord'), link('coord', 's0'), link('coord', 's1'), link('coord', 's2')], flows: [flow(['client', 'coord', 's1'], { rate: 1.5 })] },
    },
    {
      short: 'Segments',
      kind: 'technique',
      title: 'Inverted index in immutable segments',
      body: [
        'Each shard is a <b>Lucene index</b> made of <b>segments</b>. A segment is a self-contained, <b>immutable</b> mini-index: an inverted index (term → sorted list of document ids, with frequencies and positions; see the Search Engines lesson), stored fields, and columnar <b>doc values</b> for sorting and aggregations. A search runs over every segment in the shard and merges the results.',
        'Immutability is the central design choice: segments are written once and never modified, so they can be cached aggressively by the OS page cache, read without locks, compressed tightly and copied between nodes simply. The price: <b>you can’t update a document in place</b> — an update is a delete-mark on the old version plus a new document in a new segment.',
      ],
      changes: [{ text: 'Segment = immutable inverted index + stored fields + doc values', tone: 'info' }, { text: 'Update = mark old deleted + index a new copy', tone: 'info' }],
      scene: { nodes: [shard(0, 1, 'One shard (a Lucene index)'), seg(0, 'segment 1'), seg(1, 'segment 2'), seg(2, 'segment 3')], links: [link('s0', 'g0'), link('s0', 'g1'), link('s0', 'g2')], flows: [flow(['s0', 'g1'], { rate: 1 })] },
    },
    {
      short: 'Near real time',
      kind: 'technique',
      title: 'Indexing: buffer, refresh and translog',
      body: [
        'A new document is first added to an <b>in-memory buffer</b> and appended to the <b>translog</b> (a write-ahead log fsynced for durability, so a crash can replay it). It is <i>not yet searchable</i>. Every <b>refresh</b> (default 1 s) the buffer is written out as a <b>new small segment</b> that opens for search — which is why Elasticsearch is “<b>near-real-time</b>”: a document appears about a second after it is indexed, not instantly.',
        'Refresh frequency is a throughput knob: a 1 s refresh creates a segment per second per shard (3,600 an hour before merging). For heavy bulk loads raise it to 30 s or disable it, then refresh once at the end. A <b>flush</b> periodically commits segments to disk and truncates the translog; reads by id (<code>GET /index/_doc/7</code>) are real-time because they consult the translog.',
      ],
      changes: [{ text: 'Buffer + translog → refresh (1 s) → searchable segment', tone: 'info' }, { text: 'Bulk loads: slow the refresh', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('index a document', 'file') }), buffer({ tag: pill('not searchable yet', 'clock', 'warn') }), shard(0, 1, 'Shard', { tag: pill('refresh → new segment', 'refresh', 'good') })], links: [link('client', 'buf'), link('buf', 's0', { arrow: 'end' })], flows: [flow(['client', 'buf', 's0'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Merging',
      kind: 'technique',
      title: 'Merging segments and lazy deletes',
      body: [
        'Many small segments make searches slow (each query touches every segment) and waste space. A background <b>merge policy</b> continuously combines small segments into larger ones — reading them sequentially, writing a new segment, then deleting the old files. Merging also <b>physically removes deleted and overwritten documents</b>; until then they linger, marked in a bitmap and filtered at query time. It costs I/O and CPU, competing with indexing and queries (throttled).',
        'Consequences: an index with heavy updates or deletes carries “dead” space until merges catch up; <b>force-merging</b> a finished, read-only index (time-series data after its day ends) into one segment gives the fastest searches and smallest size; and <b>disk space must stay free</b> for merges, which temporarily need room for old and new segments together.',
      ],
      changes: [{ text: 'Background merges: fewer, larger segments; deleted docs dropped', tone: 'good' }, { text: 'Needs spare disk and I/O; force-merge finished indices', tone: 'info' }],
      scene: { nodes: [seg(0, 'small'), seg(1, 'small'), seg(2, 'small'), box('m', -4, -2, 'Merge', 'purple', 'refresh', { size: [1.2, 1.2], height: 20 }), disk('big', 10, -2, 'one larger segment', { size: [2.6, 1], height: 14, tone: 'green' })], links: [link('g0', 'm'), link('g1', 'm'), link('g2', 'm'), link('m', 'big')], flows: [flow(['g1', 'm', 'big'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Shards',
      kind: 'technique',
      title: 'Shards, replicas and scatter–gather search',
      body: [
        'An index is split into <b>primary shards</b> (a document goes to <code>hash(id) mod shards</code>, so the shard count is fixed at creation) and each has <b>replicas</b> on other nodes: copies for failover and extra read capacity. A search arrives at any <b>coordinating node</b>, which <b>scatters</b> it to one copy of every shard, each shard returns its local top results, and the coordinator <b>gathers and merges</b> them (a second “fetch” phase retrieves the documents themselves).',
        '2 billion documents at 1.5 KB is <b>3 TB</b>; at a 30 GB target that is <b>100 primary shards</b>, 200 with one replica. Every search touches all 100, so it waits for the slowest: at a 0.2% chance a shard is slow, <b>18%</b> of searches hit at least one (the tail-latency effect from the Search Engines lesson). Shard count therefore trades parallelism and capacity against overhead and tail latency.',
      ],
      changes: [{ text: '3 TB ÷ 30 GB = 100 primaries; ×2 with a replica', tone: 'info' }, { text: 'Search = scatter to all shards, gather top-k', tone: 'info' }],
      scene: { nodes: [client(), coord({ tag: pill('scatter → gather', 'search') }), shard(0, 3, 'Primary 1'), shard(1, 3, 'Primary 2'), shard(2, 3, 'Replica of 3')], links: [link('client', 'coord'), link('coord', 's0'), link('coord', 's1'), link('coord', 's2')], flows: [flow(['coord', 's0'], { rate: 1.5, back: true }), flow(['coord', 's1'], { rate: 1.5, back: true }), flow(['coord', 's2'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Sizing',
      kind: 'tradeoff',
      title: 'Shard sizing: too many hurts as much as too few',
      body: [
        'Each shard has fixed overhead — memory for its segment metadata and field data structures, file handles, cluster-state entries, a thread of work per search. A common rule of thumb is ~20 shards per GB of JVM heap: the 200 shard copies need ~10 GB of heap just to exist, before serving anything. <b>Thousands of tiny shards</b> (one daily index per tiny service) bloat cluster state and slow everything; <b>huge shards</b> (hundreds of GB) recover slowly after a node failure and hit merge and cache limits.',
        'Design: aim for shards of tens of GB; use <b>time-based indices</b> with <b>rollover</b> and an index-lifecycle policy (hot → warm → cold tiers on cheaper storage → delete) for logs; keep the number of shards per search small by <b>routing</b> (send a tenant’s queries to one shard) or filtering by index; and never use Elasticsearch as the only copy of important data. Figures here are model outputs for sizing, not benchmarks.',
      ],
      changes: [{ text: '~20 shards per GB heap; 200 copies ≈ 10 GB heap', tone: 'info' }, { text: 'Tens-of-GB shards; rollover + lifecycle tiers', tone: 'good' }, { text: 'Not a system of record', tone: 'bad' }],
      scene: { nodes: [box('hot', -8, 0, 'Hot: SSD, today', 'red', 'bolt', { size: [1.3, 1.3], height: 26 }), box('warm', 2, 0, 'Warm: this month', 'orange', 'layers', { size: [1.3, 1.3], height: 20 }), box('cold', 12, 0, 'Cold: cheap, searchable snapshots', 'blue', 'disk', { size: [1.3, 1.3], height: 14 })], links: [link('hot', 'warm', { arrow: 'end' }), link('warm', 'cold', { arrow: 'end' })], flows: [flow(['hot', 'warm', 'cold'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Immutable segments, refreshed and merged, sharded for scale',
      body: [
        'A shard is a set of <b>immutable Lucene segments</b>; new documents become searchable at the next <b>refresh</b> (near-real-time), background <b>merges</b> consolidate segments and drop deleted documents, and a search <b>scatters across shards</b> and gathers the top results — so shard count sets parallelism but also tail latency and heap overhead.',
        'Size shards in tens of GB, manage time-series data with rollover and tiers, tune the refresh interval for bulk loads, and keep the source of truth elsewhere.',
      ],
      scene: { nodes: [client(), coord(), shard(0, 2, 'Shard'), shard(1, 2, 'Shard'), db('src', -8, 8, 'Source of truth', { size: [1.2, 1.2] })], links: [link('client', 'coord'), link('coord', 's0'), link('coord', 's1'), link('src', 'coord', { style: 'dashed' })], flows: [flow(['client', 'coord', 's0'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
