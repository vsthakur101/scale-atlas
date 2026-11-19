import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -8, 0, 'Market', 'blue', 'server', { sub: 'app', ...extra });
const pg = (extra: Partial<SceneNode> = {}) => db('pg', 0, -1, 'Postgres', { sub: 'relational', ...extra });
const docs = (extra: Partial<SceneNode> = {}) => db('docs', 5, -8, 'Documents', { tone: 'green', icon: 'file', ...extra });
const kv = (extra: Partial<SceneNode> = {}) => box('kv', 7, -2, 'Key-value', 'red', 'key', { size: [1.4, 1.4], height: 38, ...extra });
const wide = (extra: Partial<SceneNode> = {}) => db('wide', 6, 5, 'Wide-column', { tone: 'yellow', icon: 'layers', ...extra });
const search = (extra: Partial<SceneNode> = {}) => box('search', -1, 8, 'Search', 'teal', 'search', { size: [1.4, 1.4], height: 38, sub: 'inverted index', ...extra });

const lesson: Lesson = {
  slug: 'choosing-a-database',
  title: 'Choosing a Database',
  blurb: 'Relational, document, key-value, wide-column, search — match each data model to the questions you actually ask of it.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'fit', label: 'Model fit', icon: 'check' },
    { key: 'writes', label: 'Writes / s', icon: 'activity' },
    { key: 'latency', label: 'Query p95', icon: 'timer' },
    { key: 'systems', label: 'Systems', icon: 'layers' },
  ],
  goals: [
    { text: 'What relational databases are genuinely best at', step: 2 },
    { text: 'When documents beat tables', step: 4 },
    { text: 'Key-value and wide-column stores for scale', step: 6 },
    { text: 'Search as a derived, eventually consistent copy', step: 7 },
    { text: 'The cost of running many databases', step: 8 },
  ],
  legend: ['request', 'response', 'write'],
  steps: [
    {
      short: 'One for all',
      kind: 'problem',
      title: 'One database doing five jobs',
      body: [
        'A crafts marketplace keeps everything in one Postgres instance: orders and payments, product listings with wildly different attributes per category, shopping carts, a click-stream of 30,000 events a second, and keyword search over listings.',
        'Orders are happy. Everything else is fighting: event inserts bloat the WAL, <code>LIKE \'%walnut%\'</code> scans the listings table, and cart writes contend with checkout.',
      ],
      note: { kind: 'key', text: 'Pick storage by access pattern — what you read, how you read it, how much you write — not by brand or habit.' },
      scene: {
        nodes: [app(), pg({ load: 93, state: 'hot', tag: pill('5 workloads', 'alert', 'bad') })],
        links: [link('app', 'pg', { arrow: 'both' })],
        flows: [flow(['app', 'pg'], { kind: 'write', rate: 5, speed: 0.7 }), flow(['app', 'pg'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.4 })],
        metrics: { fit: { v: '1 of 5', tone: 'bad' }, writes: '34k/s', latency: { v: '820 ms', tone: 'bad' }, systems: '1' },
      },
    },
    {
      short: 'Relational',
      kind: 'technique',
      title: 'Relational: when correctness and joins matter',
      body: [
        'Orders, payments, refunds and inventory are deeply connected and must never disagree. Tables with foreign keys, constraints and <b>ACID transactions</b> enforce that, and SQL answers questions nobody planned for: “refunds by seller by month, excluding disputes”.',
        'That flexibility is the relational model’s superpower. It’s the right default for core business data — and modern instances handle far more than most teams assume.',
      ],
      changes: [{ text: 'Orders stay in Postgres', tone: 'good' }],
      concepts: [
        { term: 'Relational database', def: 'Stores data in tables of rows and columns, linked by keys and queried with SQL; strong constraints and transactions.' },
        { term: 'Foreign key', def: 'A constraint ensuring a column’s value refers to an existing row in another table.' },
      ],
      scene: {
        nodes: [app(), pg({ load: 40, tag: pill('orders ⋈ payments', 'sheet', 'good') })],
        links: [link('app', 'pg', { arrow: 'both', label: pill('BEGIN … COMMIT', 'lock') })],
        flows: [flow(['app', 'pg'], { back: true, rate: 2 })],
        metrics: { fit: { v: 'orders ✓', tone: 'good' }, writes: '400/s', latency: '8 ms', systems: '1' },
      },
    },
    {
      short: 'Shape shifts',
      kind: 'problem',
      title: 'Every category has different fields',
      body: [
        'A ring has metal, stone and size. A rug has dimensions, pile and material. A print has edition and paper. The listings table has grown 140 mostly-empty columns, and each new category needs a migration.',
        'The data isn’t really tabular: each listing is a self-contained thing that’s read and written <b>as a whole</b>.',
      ],
      scene: {
        nodes: [app(), pg({ load: 55, tag: pill('140 sparse columns', 'sheet', 'warn') })],
        links: [link('app', 'pg', { arrow: 'both', label: pill('ALTER TABLE… again', 'alert', 'warn') })],
        flows: [flow(['app', 'pg'], { back: true, rate: 2 })],
        metrics: { fit: { v: 'listings ✗', tone: 'warn' }, writes: '400/s', latency: '30 ms', systems: '1' },
      },
    },
    {
      short: 'Documents',
      kind: 'technique',
      title: 'Documents: store the aggregate whole',
      body: [
        'A <b>document store</b> keeps each listing as one JSON-like document, nested attributes and all. Fetching a listing is one read with good locality; new fields need no migration.',
        'The trade: joins across documents are weak or absent, and denormalised copies (the seller’s name inside every listing) must be kept in sync by your code. Postgres’s <code>jsonb</code> columns get you much of this without a second system.',
      ],
      note: { kind: 'tip', text: 'Documents fit data with a natural owner and a tree shape. If you keep needing many-to-many relationships between documents, you wanted tables.' },
      changes: [{ text: 'Listings → document store', tone: 'good' }],
      concepts: [{ term: 'Document database', def: 'Stores self-contained, nested records (documents), typically JSON, retrieved by id or indexed fields.' }],
      scene: {
        nodes: [app(), pg({ load: 35 }), docs({ tag: pill('{ ring: { metal, stone } }', 'file', 'good') })],
        links: [link('app', 'pg', { arrow: 'both' }), link('app', 'docs', { arrow: 'both' })],
        flows: [flow(['app', 'docs'], { back: true, rate: 2 }), flow(['app', 'pg'], { back: true, rate: 1 })],
        metrics: { fit: '2 of 5', writes: '400/s', latency: '5 ms', systems: '2' },
      },
    },
    {
      short: 'Key-value',
      kind: 'technique',
      title: 'Key-value: one key, one blob, very fast',
      body: [
        'Carts and sessions are only ever accessed by ID: get it, change it, put it back. A <b>key-value store</b> offers exactly that operation and nothing more — in exchange for sub-millisecond latency and effortless horizontal scale.',
        'You can’t ask it “which carts contain walnut bowls?”. If you ever need to, that question belongs somewhere else.',
      ],
      changes: [{ text: 'Carts & sessions → key-value', tone: 'good' }],
      concepts: [{ term: 'Key-value store', def: 'A database that stores opaque values under unique keys; get/put/delete by key, very fast and simple to scale.' }],
      scene: {
        nodes: [app(), pg({ load: 30 }), docs(), kv({ tag: pill('cart:u81 → {…}', 'key', 'good') })],
        links: [link('app', 'pg', { arrow: 'both' }), link('app', 'docs', { arrow: 'both' }), link('app', 'kv', { arrow: 'both' })],
        flows: [flow(['app', 'kv'], { kind: 'hit', back: true, rate: 4 })],
        metrics: { fit: '3 of 5', writes: '4k/s', latency: '0.8 ms', systems: '3' },
      },
    },
    {
      short: 'Wide-column',
      kind: 'technique',
      title: 'Wide-column: firehose writes by partition',
      body: [
        'The click-stream is append-only, enormous, and read by “events for user X in time range Y”. A <b>wide-column</b> store (Cassandra-style) partitions by a key you choose — say <code>user_id</code> — and keeps rows sorted inside each partition by time.',
        'Writes are cheap appends spread across many nodes, so 30,000 per second is routine. The price: you design tables around queries up front; ad-hoc questions need a separate analytics system.',
      ],
      note: { kind: 'warn', text: 'In wide-column stores the partition key is the whole design. A query that doesn’t include it is a full-cluster scan.' },
      changes: [{ text: 'Events → wide-column', tone: 'good' }, { text: 'Postgres write load −90%', tone: 'good' }],
      concepts: [{ term: 'Wide-column store', def: 'Partitions rows by key across nodes and sorts them within a partition; built for high write rates and key-based range reads.' }],
      scene: {
        nodes: [app(), pg({ load: 20 }), docs(), kv(), wide({ tag: pill('partition: user_id', 'layers', 'good') })],
        links: [link('app', 'pg', { arrow: 'both' }), link('app', 'docs', { arrow: 'both' }), link('app', 'kv', { arrow: 'both' }), link('app', 'wide')],
        flows: [flow(['app', 'wide'], { kind: 'write', rate: 6 }), flow(['app', 'kv'], { kind: 'hit', back: true, rate: 1.5 })],
        metrics: { fit: '4 of 5', writes: '34k/s', latency: '4 ms', systems: '4' },
      },
    },
    {
      short: 'Search',
      kind: 'technique',
      title: 'Search engines answer “find me something like…”',
      body: [
        'Keyword search, typo tolerance and relevance ranking need an <b>inverted index</b>: a map from each word to the listings that contain it. A search engine (Elasticsearch, OpenSearch, Meilisearch) is built around exactly that.',
        'Treat it as a <b>derived copy</b>: the document store is the source of truth, and changes flow into the index through a pipeline. It lags by a second or so, and you can rebuild it from scratch at any time.',
      ],
      changes: [{ text: 'Search: 820 ms → 25 ms', tone: 'good' }, { text: 'Index lags ~1 s', tone: 'bad' }],
      concepts: [
        { term: 'Inverted index', def: 'Maps each term to the list of documents containing it; the core structure of full-text search.' },
        { term: 'Derived data', def: 'Data computed from a source of truth (indexes, caches, aggregates) that can be rebuilt if lost.' },
      ],
      scene: {
        nodes: [app(), pg({ load: 20 }), docs(), kv(), wide(), search({ tag: pill('“walnut” → 3,112 ids', 'search', 'good') })],
        links: [link('app', 'pg', { arrow: 'both' }), link('app', 'docs', { arrow: 'both' }), link('app', 'kv', { arrow: 'both' }), link('app', 'wide'), link('app', 'search', { arrow: 'both' }), link('docs', 'search', { style: 'dashed', label: pill('change stream') })],
        flows: [flow(['app', 'search'], { back: true, rate: 2 }), flow(['docs', 'search'], { kind: 'write', rate: 1 })],
        metrics: { fit: { v: '5 of 5', tone: 'good' }, writes: '34k/s', latency: { v: '25 ms', tone: 'good' }, systems: '5' },
      },
    },
    {
      short: 'Sprawl',
      kind: 'case',
      title: 'Case: five databases, one on-call engineer',
      body: [
        'Every store now fits its workload — and the team runs five systems, each with its own backups, upgrades, monitoring, failure modes and security reviews. Sync pipelines between them are a new source of bugs.',
        'A smaller team would have been better served by Postgres with <code>jsonb</code>, a cache, and Postgres full-text search until each workload <i>proved</i> it needed more. Specialised stores pay off at scale; before that, operations cost dominates.',
      ],
      note: { kind: 'key', text: 'Default to one boring, well-understood database. Add a specialised one when a measured workload outgrows it — and count the people-cost, not just the latency.' },
      changes: [{ text: '5 systems to operate', tone: 'bad' }, { text: '3 sync pipelines', tone: 'bad' }],
      concepts: [{ term: 'Polyglot persistence', def: 'Using different database technologies for different data within one application.' }],
      scene: {
        nodes: [app({ tag: pill('on-call: 1 person', 'user', 'bad') }), pg(), docs(), kv(), wide(), search()],
        links: [link('app', 'pg'), link('app', 'docs'), link('app', 'kv'), link('app', 'wide'), link('app', 'search'), link('docs', 'search', { style: 'dashed' }), link('pg', 'wide', { style: 'dashed' })],
        flows: [flow(['docs', 'search'], { kind: 'write', rate: 1 }), flow(['pg', 'wide'], { kind: 'write', rate: 1 })],
        metrics: { fit: '5 of 5', writes: '34k/s', latency: '25 ms', systems: { v: '5', tone: 'bad' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Let the questions choose',
      body: [
        '<b>Relational</b> for connected data that must stay correct and be queried flexibly. <b>Document</b> for self-contained aggregates read whole. <b>Key-value</b> for get/put by ID at huge rates. <b>Wide-column</b> for firehose writes read by partition key. <b>Search</b> as a derived index for text and relevance.',
        'Start with the fewest systems that meet your needs, and split a workload out only when measurement says it hurts.',
      ],
      scene: {
        nodes: [app(), pg({ tag: pill('correct + flexible', 'sheet') }), docs({ tag: pill('read whole', 'file') }), kv({ tag: pill('by key', 'key') }), wide({ tag: pill('append fast', 'layers') }), search({ tag: pill('derived', 'search') })],
        links: [link('app', 'pg', { arrow: 'both' }), link('app', 'docs', { arrow: 'both' }), link('app', 'kv', { arrow: 'both' }), link('app', 'wide'), link('app', 'search', { arrow: 'both' })],
        flows: [flow(['app', 'pg'], { back: true, rate: 1 }), flow(['app', 'kv'], { kind: 'hit', back: true, rate: 1.5 }), flow(['app', 'wide'], { kind: 'write', rate: 2 })],
        metrics: { fit: '5 of 5', writes: '34k/s', latency: '25 ms', systems: '5' },
      },
    },
  ],
};

export default lesson;
