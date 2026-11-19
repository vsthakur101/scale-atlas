import type { Lesson, Pill, SceneNode } from '../../types';
import { box, disk, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -11, 0, 'App', 'blue', 'server', { size: [1.4, 1.4], height: 40, ...extra });
const heap = (extra: Partial<SceneNode> = {}) =>
  disk('heap', 7, 6, 'orders table · 40M rows', { size: [4.6, 2.6], height: 22, tone: 'purple', icon: 'sheet', ...extra });

// a three-level B-tree: root → 2 internal pages → 4 leaves
const page = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'green', 'list', { size: [1.05, 1.05], height: 22, ...extra });
const tree = (hot: string[] = [], tag?: Pill, prefix = 'idx'): SceneNode[] => {
  const t = (id: string): Partial<SceneNode> => (hot.includes(id) ? { tone: 'yellow' } : {});
  return [
    page(`${prefix}-root`, -2, -8, 'root', { ...t('root'), tag }),
    page(`${prefix}-i1`, -5, -3, '1–5k', t('i1')),
    page(`${prefix}-i2`, 1, -3, '5k–9k', t('i2')),
    page(`${prefix}-l1`, -7, 2, 'leaf', t('l1')),
    page(`${prefix}-l2`, -3, 2, 'leaf', t('l2')),
    page(`${prefix}-l3`, 1, 2, 'leaf', t('l3')),
    page(`${prefix}-l4`, 5, 2, 'leaf', t('l4')),
  ];
};
const treeLinks = (prefix = 'idx') => [
  link(`${prefix}-root`, `${prefix}-i1`, { arrow: 'none' }),
  link(`${prefix}-root`, `${prefix}-i2`, { arrow: 'none' }),
  link(`${prefix}-i1`, `${prefix}-l1`, { arrow: 'none' }),
  link(`${prefix}-i1`, `${prefix}-l2`, { arrow: 'none' }),
  link(`${prefix}-i2`, `${prefix}-l3`, { arrow: 'none' }),
  link(`${prefix}-i2`, `${prefix}-l4`, { arrow: 'none' }),
];
const lookup = ['app', 'idx-root', 'idx-i1', 'idx-l2'];

const lesson: Lesson = {
  slug: 'indexes',
  title: 'Indexes',
  blurb: 'Turn a 40-million-row scan into four page reads — and learn what every index quietly costs on the write path.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'rows', label: 'Rows read', icon: 'list' },
    { key: 'time', label: 'Query time', icon: 'timer' },
    { key: 'insert', label: 'Insert cost', icon: 'activity' },
    { key: 'size', label: 'Index size', icon: 'disk' },
  ],
  goals: [
    { text: 'How a B-tree index finds a row in a few reads', step: 2 },
    { text: 'Column order in composite indexes', step: 3 },
    { text: 'Covering indexes and index-only scans', step: 4 },
    { text: 'The write cost of every index', step: 6 },
    { text: 'Why some indexes never get used', step: 8 },
  ],
  legend: ['request', 'response', 'heavy', 'write'],
  steps: [
    {
      short: 'Full scan',
      kind: 'problem',
      title: 'Find one customer’s orders in 40 million rows',
      body: [
        '<code>SELECT * FROM orders WHERE customer_id = 4821</code>. Rows are stored in insertion order, so the database has no idea where customer 4821’s orders are. It reads <b>every page</b> of the table — 40 million rows, about 6 GB — to return 23 of them.',
        'This is the slow query from the very first lesson. It takes 900 ms when cached and much longer when it isn’t.',
      ],
      changes: [{ text: 'Seq scan: 40M rows', tone: 'bad' }],
      concepts: [{ term: 'Sequential scan', def: 'Reading every row of a table in storage order to evaluate a query.' }],
      scene: {
        nodes: [app(), heap({ state: 'hot', tag: pill('reading every page…', 'alert', 'bad') })],
        links: [link('app', 'heap', { arrow: 'both' })],
        flows: [flow(['app', 'heap'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.35 })],
        metrics: { rows: { v: '40,000,000', tone: 'bad' }, time: { v: '900 ms', tone: 'bad' }, insert: '1 write', size: '—' },
      },
    },
    {
      short: 'B-tree',
      kind: 'technique',
      title: 'A B-tree: a sorted, shallow index',
      body: [
        'An index on <code>customer_id</code> is a separate structure — a <b>B-tree</b> — holding customer IDs in sorted order, each with a pointer to its row. Pages hold hundreds of keys, so the tree is very wide and very shallow: <b>three or four levels</b> cover billions of rows.',
        'The lookup reads the root, picks a child by comparing keys, descends to a leaf, and follows 23 pointers into the table. About 4 index pages and 23 table pages instead of 750,000.',
      ],
      note: { kind: 'key', text: 'Logarithmic with a huge base: with ~400 keys per page, 3 levels address 64 million entries, 4 levels 25 billion.' },
      changes: [{ text: 'CREATE INDEX ON orders(customer_id)', tone: 'good' }, { text: '900 ms → 0.4 ms', tone: 'good' }],
      concepts: [
        { term: 'B-tree', def: 'A balanced tree of sorted pages with high fan-out; supports lookups, range scans and ordered reads in O(log n) page reads.' },
        { term: 'Index', def: 'An auxiliary data structure that lets the database find rows by column values without scanning the table.' },
      ],
      scene: {
        nodes: [app(), ...tree(['root', 'i1', 'l2'], pill('customer_id', 'hash')), heap({ tag: pill('23 rows fetched', 'check', 'good') })],
        links: [...treeLinks(), link('app', 'idx-root'), link('idx-l2', 'heap', { style: 'dashed', label: pill('row pointers') })],
        flows: [flow([...lookup, 'heap'], { back: true, rate: 1.2 })],
        metrics: { rows: { v: '23', tone: 'good' }, time: { v: '0.4 ms', tone: 'good' }, insert: '2 writes', size: '900 MB' },
      },
    },
    {
      short: 'Column order',
      kind: 'technique',
      title: 'Composite indexes: order is everything',
      body: [
        'The common query is <code>WHERE customer_id = ? AND status = \'open\'</code>. An index on <code>(customer_id, status)</code> sorts by customer first, then by status within each customer — like a phone book sorted by surname, then first name.',
        'It serves queries on <code>customer_id</code> alone and on both columns. It does <b>not</b> help <code>WHERE status = \'open\'</code> by itself, any more than a phone book helps you find everyone named “Ana”. That’s the <b>leftmost-prefix</b> rule.',
      ],
      changes: [{ text: '(customer_id, status) ✓ both' }, { text: 'status alone ✗', tone: 'bad' }],
      concepts: [{ term: 'Leftmost prefix', def: 'A composite index can be used for queries that constrain its leading columns, in order.' }],
      scene: {
        nodes: [app(), ...tree(['root', 'i1', 'l2'], pill('(customer_id, status)', 'hash')), heap({ tag: pill('3 open orders', 'check', 'good') })],
        links: [...treeLinks(), link('app', 'idx-root'), link('idx-l2', 'heap', { style: 'dashed' })],
        flows: [flow([...lookup, 'heap'], { back: true, rate: 1.2 })],
        metrics: { rows: '3', time: '0.3 ms', insert: '2 writes', size: '1.1 GB' },
      },
    },
    {
      short: 'Covering',
      kind: 'technique',
      title: 'Covering indexes skip the table entirely',
      body: [
        'The order list only shows <code>id, total, created_at</code>. If those columns are <b>included</b> in the index leaf entries, the database can answer from the index alone — an <b>index-only scan</b> — and never touch the table pages.',
        'For hot queries that’s often a 2–10× win, because table pages are scattered across disk while index entries for one customer sit together.',
      ],
      changes: [{ text: 'INCLUDE (total, created_at)', tone: 'good' }, { text: '0 table pages read', tone: 'good' }],
      concepts: [{ term: 'Covering index', def: 'An index containing every column a query needs, so the table itself needn’t be read.' }],
      scene: {
        nodes: [app(), ...tree(['root', 'i1', 'l2'], pill('+ total, created_at', 'hash', 'good')), heap({ state: 'dim' })],
        links: [...treeLinks(), link('app', 'idx-root')],
        flows: [flow(lookup, { kind: 'hit', back: true, rate: 1.4 })],
        metrics: { rows: '3', time: { v: '0.08 ms', tone: 'good' }, insert: '2 writes', size: '1.6 GB' },
      },
    },
    {
      short: 'Range & sort',
      kind: 'insight',
      title: 'Sorted means ranges and ORDER BY come free',
      body: [
        'Because leaves are sorted and linked to their neighbours, a range query — <code>created_at BETWEEN … AND …</code> — finds the first match and walks sideways. <code>ORDER BY created_at DESC LIMIT 20</code> reads 20 entries in index order and stops, with no sort step.',
        'Hash indexes can only answer equality; that’s why B-trees are the default almost everywhere.',
      ],
      scene: {
        nodes: [app(), ...tree(['root', 'i2', 'l3', 'l4'], pill('created_at', 'clock')), heap({ state: 'dim' })],
        links: [...treeLinks(), link('app', 'idx-root'), link('idx-l3', 'idx-l4', { label: pill('walk →', 'arrowRight') })],
        flows: [flow(['app', 'idx-root', 'idx-i2', 'idx-l3', 'idx-l4'], { kind: 'hit', back: true, rate: 1.2 })],
        metrics: { rows: '20', time: '0.1 ms', insert: '3 writes', size: '2.4 GB' },
      },
    },
    {
      short: 'Write cost',
      kind: 'tradeoff',
      title: 'Every index is another write',
      body: [
        'Each <code>INSERT</code> must also insert into every index on the table, each <code>UPDATE</code> of an indexed column must move entries, and pages occasionally split. Over the years the orders table has collected nine indexes; inserts now do ten writes and checkout latency has doubled.',
        'Indexes also take memory: the hot parts of all nine compete for the same buffer cache as the data.',
      ],
      note: { kind: 'tip', text: 'Audit index usage stats (e.g. pg_stat_user_indexes). Drop indexes nobody reads; merge ones that share a leading column.' },
      changes: [{ text: '9 indexes → 10 writes per insert', tone: 'bad' }, { text: 'Insert p95 4 → 9 ms', tone: 'bad' }],
      concepts: [{ term: 'Write amplification', def: 'One logical write causing several physical writes — here, one per index.' }],
      scene: {
        nodes: [
          app(),
          ...tree([], undefined),
          heap(),
          box('more', 9, -5, '+7 more', 'grey', 'layers', { size: [1.5, 1.5], height: 30, sub: 'indexes' }),
        ],
        links: [...treeLinks(), link('app', 'heap', { label: pill('INSERT', 'activity') }), link('app', 'idx-root'), link('app', 'more')],
        flows: [flow(['app', 'heap'], { kind: 'write', rate: 1.5 }), flow(['app', 'idx-root', 'idx-i2', 'idx-l4'], { kind: 'write', rate: 1.5 }), flow(['app', 'more'], { kind: 'write', rate: 3 })],
        metrics: { rows: '—', time: '—', insert: { v: '10 writes', tone: 'bad' }, size: { v: '11 GB', tone: 'warn' } },
      },
    },
    {
      short: 'Selectivity',
      kind: 'insight',
      title: 'Not every column deserves an index',
      body: [
        'Someone indexed <code>status</code>, which has three values; 70% of orders are “delivered”. Looking up “delivered” via the index would mean 28 million random row fetches — slower than just scanning. The query planner knows this and ignores the index.',
        'Indexes pay off when they are <b>selective</b>: the condition matches a small fraction of rows. For skewed columns, a <b>partial index</b> (<code>WHERE status = \'open\'</code>) indexes only the rare, interesting rows.',
      ],
      concepts: [
        { term: 'Selectivity', def: 'The fraction of rows a condition matches; low fractions make index lookups worthwhile.' },
        { term: 'Partial index', def: 'An index over only the rows matching a predicate, keeping it small and selective.' },
      ],
      scene: {
        nodes: [app(), ...tree([], pill('status: 3 values', 'hash', 'warn')).map((n) => ({ ...n, state: 'dim' as const })), heap({ tag: pill('planner: seq scan', 'list', 'warn') })],
        links: [...treeLinks(), link('app', 'heap', { arrow: 'both' })],
        flows: [flow(['app', 'heap'], { kind: 'heavy', back: true, rate: 0.5, speed: 0.5 })],
        metrics: { rows: { v: '28M match', tone: 'warn' }, time: '700 ms', insert: '10 writes', size: '11 GB' },
      },
    },
    {
      short: 'Gotcha',
      kind: 'case',
      title: 'Case: the index that silently stopped working',
      body: [
        'Login gets slow after a refactor changed <code>WHERE email = ?</code> to <code>WHERE lower(email) = lower(?)</code>. The index stores raw emails, not lowercased ones, so the planner can’t use it: back to a full scan of 12M users.',
        '<code>EXPLAIN ANALYZE</code> shows it immediately. Fix with an <b>expression index</b> on <code>lower(email)</code>, or store emails normalised. Implicit type casts and leading wildcards (<code>LIKE \'%x\'</code>) defeat indexes the same way.',
      ],
      note: { kind: 'tip', text: 'Put EXPLAIN plans for your top queries in code review. An index you can’t see being used is an index you can’t trust.' },
      concepts: [{ term: 'Expression index', def: 'An index on the result of a function or expression, e.g. lower(email).' }],
      scene: {
        nodes: [app({ tag: pill('lower(email) = ?', 'search', 'bad') }), ...tree([], pill('email (raw)', 'hash')).map((n) => ({ ...n, state: 'dim' as const })), heap({ name: 'users table · 12M rows', state: 'hot' })],
        links: [...treeLinks(), link('app', 'heap', { arrow: 'both', label: pill('Seq Scan', 'alert', 'bad') })],
        flows: [flow(['app', 'heap'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.4 })],
        metrics: { rows: { v: '12,000,000', tone: 'bad' }, time: { v: '410 ms', tone: 'bad' }, insert: '—', size: '—' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Indexes are a read/write trade',
      body: [
        'A <b>B-tree</b> keeps keys sorted in a shallow tree, turning scans into a handful of page reads and making ranges and ordering cheap. Order composite columns by how you filter, <b>cover</b> hot queries, and prefer selective or partial indexes.',
        'Every index taxes writes and memory, and small changes in a query can make one unusable — so verify with <code>EXPLAIN</code> and prune what isn’t used.',
      ],
      scene: {
        nodes: [app(), ...tree(['root', 'i1', 'l2'], pill('few, selective, covering', 'hash', 'good')), heap()],
        links: [...treeLinks(), link('app', 'idx-root'), link('idx-l2', 'heap', { style: 'dashed' })],
        flows: [flow(lookup, { kind: 'hit', back: true, rate: 1.4 })],
        metrics: { rows: '3', time: '0.08 ms', insert: '4 writes', size: '3 GB' },
      },
    },
  ],
};

export default lesson;
