import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const a = (extra: Partial<SceneNode> = {}) => db('a', -12, -5, 'orders (outer)', { size: [1.3, 1.3], ...extra });
const b = (extra: Partial<SceneNode> = {}) => db('b', -12, 5, 'customers (inner)', { size: [1.3, 1.3], ...extra });
const join = (extra: Partial<SceneNode> = {}) => box('join', 0, 0, 'Join operator', 'purple', 'refresh', { size: [1.5, 1.5], height: 30, ...extra });
const out = (extra: Partial<SceneNode> = {}) => box('out', 11, 0, 'Result rows', 'green', 'list', { size: [1.3, 1.3], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);
const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'source-how-do-sql-joins-work',
  title: 'How SQL Joins Work: Nested Loop, Hash and Merge',
  blurb: 'The three physical join algorithms, what each costs in row operations and memory, and why the optimizer’s choice — and your indexes — decide whether a join takes milliseconds or days.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'nl', label: 'Nested loop, no index', icon: 'alert' },
    { key: 'nli', label: 'Nested loop with an index', icon: 'search' },
    { key: 'hash', label: 'Hash join', icon: 'hash' },
    { key: 'merge', label: 'Sort-merge join', icon: 'layers' },
    { key: 'mem', label: 'Hash table memory', icon: 'disk' },
  ],
  goals: [
    { text: 'What a join means and the logical join types', step: 1 },
    { text: 'Nested loop joins and the effect of an index', step: 2 },
    { text: 'Hash joins: build and probe', step: 3 },
    { text: 'Sort-merge joins and pre-sorted inputs', step: 4 },
    { text: 'How the optimizer chooses, and what goes wrong', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Rows in the outer table', min: 1000, max: 1000000000, step: 1000, default: 1000000, unit: '', description: 'Rows scanned from the first table (after filters).' },
      { key: 'm', label: 'Rows in the inner table', min: 1000, max: 1000000000, step: 1000, default: 10000000, unit: '', description: 'Rows in the table joined to.' },
      { key: 'ops', label: 'Row operations per second', min: 100000, max: 1000000000, step: 100000, default: 20000000, unit: '/s', description: 'Comparisons or hash probes per second on one core.' },
      { key: 'bytes', label: 'Bytes per hashed row', min: 16, max: 500, step: 4, default: 48, unit: ' B', description: 'Key plus pointer/payload stored in the hash table.' },
      { key: 'mem', label: 'Memory available for the join', min: 16, max: 65536, step: 16, default: 1024, unit: ' MB', description: 'work_mem / join buffer for one operation.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.n ?? 1e6);
      const m = Math.max(1, input.m ?? 1e7);
      const ops = Math.max(1, input.ops ?? 2e7);
      const bytes = Math.max(1, input.bytes ?? 48);
      const mem = Math.max(1, input.mem ?? 1024) * 1e6;
      const nl = n * m;
      const nli = n * Math.log2(m);
      const hash = n + m;
      // Sorting each side costs about k·log2 k comparisons, then one linear merge.
      const merge = n * Math.log2(n) + m * Math.log2(m) + n + m;
      // The hash table is built on the smaller input.
      const hashMem = Math.min(n, m) * bytes;
      const spill = hashMem > mem;
      return {
        nl: step < 2 ? { v: '—' } : { v: `${fmtN(nl)} ops · ${fmtT(nl / ops)}`, tone: nl / ops > 60 ? 'bad' : 'warn' },
        nli: step < 2 ? { v: '—' } : { v: `${fmtN(nli)} ops · ${fmtT(nli / ops)}`, tone: 'good' },
        hash: step < 3 ? { v: '—' } : { v: `${fmtN(hash)} ops · ${fmtT(hash / ops)}${spill ? ' (+ spills to disk)' : ''}`, tone: spill ? 'warn' : 'good' },
        merge: step < 4 ? { v: '—' } : { v: `${fmtN(merge)} ops · ${fmtT(merge / ops)}`, tone: 'good' },
        mem: step < 3 ? { v: '—' } : { v: `${fmtB(hashMem)} of ${fmtB(mem)}`, tone: spill ? 'bad' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Meaning',
      kind: 'insight',
      title: 'A join pairs rows from two tables that match',
      body: [
        'Relational data is split across tables to avoid duplication (orders in one, customers in another). A <b>join</b> reassembles it: for each order, find the customer whose <code>id</code> equals the order’s <code>customer_id</code>. Logically: <b>INNER</b> keeps only matching pairs; <b>LEFT/RIGHT OUTER</b> also keeps unmatched rows from one side, filling the other with NULLs; <b>FULL OUTER</b> keeps both; <b>CROSS</b> pairs every row with every row.',
        'That is the <i>logical</i> meaning, identical whichever way the database executes it. The <b>physical join algorithm</b> — how it actually finds the matches — determines the cost, and the differences are enormous: joining 1 million orders to 10 million customers naively is <b>10¹³ comparisons</b>; done well, about <b>11 million</b>.',
      ],
      scene: { nodes: [a({ tag: pill('1M rows', 'list') }), b({ tag: pill('10M rows', 'list') }), join({ tag: pill('ON o.customer_id = c.id', 'hash') }), out()], links: [link('a', 'join'), link('b', 'join'), link('join', 'out')], flows: [flow(['a', 'join', 'out'], { rate: 1.5 }), flow(['b', 'join', 'out'], { rate: 1.5 })] },
    },
    {
      short: 'Nested loop',
      kind: 'technique',
      title: 'Nested loop: for each outer row, find inner matches',
      body: [
        'The simplest algorithm: <code>for each row in outer: for each row in inner: if keys match, emit</code>. Without help that is <code>N × M</code> comparisons — 10¹³ here, about <b>6 days</b> at 20 million per second. But if the inner table has an <b>index</b> on the join key, the inner loop becomes a single index lookup (<code>log₂ M</code> ≈ 23 steps): total <code>N × log M</code> ≈ <b>23 million</b> operations — about a second.',
        'This is why <b>indexing foreign-key columns</b> matters so much. Index nested loop is the best plan when the outer side is <b>small</b> (a handful of rows after filters) — no setup, first rows returned immediately, and it supports any join condition including non-equality. It is the worst choice when both sides are large and the inner isn’t indexed.',
      ],
      changes: [{ text: 'No index: N × M = 10¹³ comparisons (~6 days)', tone: 'bad' }, { text: 'Index on inner: N × log M ≈ 23M (~1 s)', tone: 'good' }],
      scene: { nodes: [a(), b({ tag: pill('index on id', 'check', 'good') }), join({ tag: pill('lookup per outer row', 'search') }), out()], links: [link('a', 'join'), link('b', 'join', { arrow: 'both' }), link('join', 'out')], flows: [flow(['a', 'join', 'out'], { rate: 2 })] },
    },
    {
      short: 'Hash join',
      kind: 'technique',
      title: 'Hash join: build a table on the smaller side, probe with the other',
      body: [
        '<b>Build phase</b>: scan the <i>smaller</i> input and insert each row into an in-memory <b>hash table</b> keyed on the join column. <b>Probe phase</b>: scan the larger input once and, for each row, hash its key and look for matches — O(1) each. Total work ≈ <code>N + M</code>, about <b>11 million</b> operations (~0.55 s) for 1M and 10M rows, with <b>no index needed</b>. It is the workhorse for large equi-joins.',
        'The constraint is memory: the hash table holds the smaller side — 1M × 48 B = <b>48 MB</b> here, fine. If it exceeds the memory budget the join <b>spills</b>: both inputs are partitioned by hash into files on disk and joined partition by partition (Grace/hybrid hash join), several times slower. Hash joins work only for <b>equality</b> conditions; they return nothing until the build finishes.',
      ],
      changes: [{ text: 'Cost ≈ N + M, memory = smaller side', tone: 'good' }, { text: 'Exceed work_mem → spill to disk', tone: 'bad' }, { text: 'Equality joins only', tone: 'info' }],
      scene: { nodes: [a({ tag: pill('probe', 'search') }), b({ tag: pill('build hash table', 'hash') }), join({ tag: pill('N + M operations', 'check', 'good') }), out()], links: [link('b', 'join', { arrow: 'end' }), link('a', 'join', { arrow: 'end' }), link('join', 'out')], flows: [flow(['b', 'join'], { kind: 'write', rate: 1.5 }), flow(['a', 'join', 'out'], { rate: 2 })] },
    },
    {
      short: 'Merge join',
      kind: 'technique',
      title: 'Sort-merge join: walk two sorted lists in step',
      body: [
        'Sort both inputs on the join key, then walk them together with two pointers: advance whichever side has the smaller key, emit when equal. The merge itself is <b>linear</b> (N + M), but sorting costs <code>N log N + M log M</code> — about 20 million + 230 million (+ the merge) = <b>~260 million</b> comparisons here, ~13 s: slower than a hash join when the inputs start unsorted.',
        'It wins when the inputs are <b>already sorted</b> — a clustered index or an index scan on the join key delivers sorted rows for free, or an <code>ORDER BY</code> on the same key follows — and then it needs almost no memory, streams results, and handles <b>range and inequality</b> conditions and very large inputs gracefully. The cost model counts whether sorting is needed; two indexed inputs make merge join the cheapest plan.',
      ],
      changes: [{ text: 'Sort: N log N + M log M, then merge N + M', tone: 'info' }, { text: 'Pre-sorted (indexed) inputs → no sort, tiny memory', tone: 'good' }],
      scene: { nodes: [a({ tag: pill('sorted by key', 'list') }), b({ tag: pill('sorted by key', 'list') }), join({ tag: pill('two pointers, in step', 'refresh') }), out()], links: [link('a', 'join'), link('b', 'join'), link('join', 'out')], flows: [flow(['a', 'join', 'out'], { rate: 2 }), flow(['b', 'join', 'out'], { rate: 2 })] },
    },
    {
      short: 'Choosing',
      kind: 'tradeoff',
      title: 'How the optimizer chooses — and how it goes wrong',
      body: [
        'The <b>cost-based optimizer</b> estimates how many rows each step produces (from table statistics: row counts, value histograms, distinct counts) and computes a cost for each plan: join <b>order</b> (joining three tables has several orders, each producing different intermediate sizes) and join <b>method</b>. Rule of thumb: small outer + index on inner → <b>index nested loop</b>; large unsorted equi-join → <b>hash</b>; sorted inputs or range conditions → <b>merge</b>.',
        'Bad plans come from bad <b>estimates</b>: stale statistics, correlated columns the optimizer treats as independent, or a filter whose selectivity it misjudges by 1,000× can turn an index nested loop over “a few rows” into one over millions. Fix by <b>analysing tables</b>, adding the missing index, rewriting the query, extended statistics, or hints as a last resort; always read <code>EXPLAIN (ANALYZE)</code> and compare estimated vs actual rows. Figures here are operation-count models, not benchmarks.',
      ],
      changes: [{ text: 'Small outer + index → nested loop · big equi-join → hash · sorted → merge', tone: 'good' }, { text: 'Estimate errors cause the disasters', tone: 'bad' }],
      scene: { nodes: [box('opt', -8, 0, 'Optimizer: statistics → cost', 'teal', 'gauge', { size: [1.4, 1.4], height: 24 }), join({ tag: pill('picks method + order', 'check') }), box('exp', 10, 0, 'EXPLAIN ANALYZE: estimate vs actual', 'orange', 'search', { size: [1.4, 1.4], height: 22 })], links: [link('opt', 'join'), link('join', 'exp', { style: 'dashed' })], flows: [flow(['opt', 'join'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Indexes and the right algorithm turn 10¹³ into 10⁷',
      body: [
        'Nested loop is <code>N × M</code> without an index but <code>N log M</code> with one; hash join is <code>N + M</code> with memory for the smaller side; merge join is <code>N + M</code> plus sorting unless inputs are already ordered. The optimizer picks from statistics — and fails when they’re wrong.',
        'Index join keys, keep statistics fresh, watch memory for hash joins, and read the plan.',
      ],
      scene: { nodes: [a(), b(), join(), out()], links: [link('a', 'join'), link('b', 'join'), link('join', 'out')], flows: [flow(['a', 'join', 'out'], { rate: 2 })] },
    },
  ],
};

export default lesson;
