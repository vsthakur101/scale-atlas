import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -17, 0, 'SQL text', 'green', 'file', { size: [1.2, 1.2], height: 22, ...extra });
const parser = (extra: Partial<SceneNode> = {}) => box('parser', -10, 0, 'Parse + bind', 'blue', 'list', { size: [1.2, 1.2], height: 24, ...extra });
const opt = (extra: Partial<SceneNode> = {}) => box('opt', -3, 0, 'Optimizer (cost-based)', 'orange', 'gauge', { size: [1.4, 1.4], height: 28, ...extra });
const exec = (extra: Partial<SceneNode> = {}) => box('exec', 5, 0, 'Executor', 'purple', 'cpu', { size: [1.3, 1.3], height: 28, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 12, 0, 'Pages: heap + indexes', { size: [1.4, 1.4], ...extra });
const stats = (extra: Partial<SceneNode> = {}) => db('stats', -3, 8, 'Table statistics', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-sql-statement-execution-in-database',
  title: 'How a SQL Statement Is Executed: Plans, Statistics and Index Choice',
  blurb: 'Parse, bind, optimise, execute: how the planner prices a sequential scan against an index scan, why the crossover sits at a fraction of a percent, and what stale statistics do to it.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'seq', label: 'Sequential scan cost', icon: 'list' },
    { key: 'idx', label: 'Index scan cost', icon: 'search' },
    { key: 'plan', label: 'Plan chosen (true selectivity)', icon: 'check' },
    { key: 'cross', label: 'Crossover selectivity', icon: 'gauge' },
    { key: 'bad', label: 'Cost penalty if statistics are wrong', icon: 'alert' },
  ],
  goals: [
    { text: 'The pipeline: parse, bind, plan, execute', step: 1 },
    { text: 'What the optimizer estimates: rows, selectivity, cost', step: 2 },
    { text: 'Sequential vs index scan: the crossover', step: 3 },
    { text: 'Covering indexes and index-only scans', step: 4 },
    { text: 'Bad statistics, plan caching and prepared statements', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rows', label: 'Rows in the table', min: 10000, max: 1000000000, step: 10000, default: 10000000, unit: '', description: 'Total rows.' },
      { key: 'rpp', label: 'Rows per page', min: 10, max: 500, step: 10, default: 100, unit: '', description: 'Rows that fit in one disk page.' },
      { key: 'rcost', label: 'Random page cost vs sequential', min: 1, max: 10, step: 0.1, default: 4, unit: '×', description: '4 is the classic spinning-disk default; ~1.1 suits SSD or fully cached data.' },
      { key: 'sel', label: 'True selectivity of the filter', min: 0.001, max: 100, step: 0.001, default: 0.1, unit: '%', description: 'Share of rows the WHERE clause actually matches.' },
      { key: 'err', label: 'Optimizer’s estimate off by', min: 1, max: 1000, step: 1, default: 1, unit: '×', description: 'Factor by which statistics under-estimate selectivity (1 = accurate).' },
    ],
    calculate: (input, step) => {
      const rows = Math.max(1, input.rows ?? 1e7);
      const rpp = Math.max(1, input.rpp ?? 100);
      const rc = Math.max(1, input.rcost ?? 4);
      const sel = Math.min(1, Math.max(1e-6, (input.sel ?? 0.1) / 100));
      const err = Math.max(1, input.err ?? 1);
      const pages = rows / rpp;
      // Sequential scan reads every page once; an index scan fetches roughly one random page per matching row.
      const seq = pages;
      const idxCost = (s: number) => s * rows * rc;
      const idx = idxCost(sel);
      const cross = pages / (rows * rc);
      const truePlan = idx < seq ? 'Index scan' : 'Sequential scan';
      // The optimizer believes the filter is `err` times more selective than it is and picks the plan on that belief.
      const believed = sel / err;
      const picks = idxCost(believed) < seq ? 'index' : 'seq';
      const actualPicked = picks === 'index' ? idx : seq;
      const best = Math.min(seq, idx);
      const penalty = actualPicked / best;
      return {
        seq: step < 2 ? { v: '—' } : { v: `${fmtN(seq)} page reads` },
        idx: step < 2 ? { v: '—' } : { v: `${fmtN(idx)} page cost`, tone: idx < seq ? 'good' : 'bad' },
        plan: step < 2 ? { v: '—' } : { v: truePlan, tone: 'good' },
        cross: step < 2 ? { v: '—' } : { v: `${(cross * 100).toFixed(2)}% of the table` },
        bad: step < 4 ? { v: '—' } : { v: penalty <= 1.01 ? 'none (right plan)' : `${penalty.toFixed(1)}× slower`, tone: penalty <= 1.01 ? 'good' : penalty < 5 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'insight',
      title: 'From SQL text to rows',
      body: [
        'A statement passes through four stages. <b>Parse</b>: check syntax and build a tree. <b>Bind/analyse</b>: resolve table and column names, check types and permissions, expand <code>*</code>, resolve views. <b>Optimise</b>: from the many possible ways to compute the result, choose the cheapest <b>plan</b> — a tree of operators (scans, joins, sorts, aggregates). <b>Execute</b>: run the plan, usually pulling rows one at a time up the tree (the iterator model) or in batches, reading <b>pages</b> through the buffer pool.',
        'SQL says <i>what</i> you want; the optimizer decides <i>how</i>. Two equivalent queries can differ by orders of magnitude in cost, and the same query can switch plans as data grows — which is why reading and understanding plans (<code>EXPLAIN</code>) is a core skill.',
      ],
      scene: { nodes: [client({ tag: pill('SELECT … WHERE …', 'file') }), parser(), opt({ tag: pill('chooses the plan', 'check') }), exec(), store()], links: [link('client', 'parser'), link('parser', 'opt'), link('opt', 'exec'), link('exec', 'store', { arrow: 'both' })], flows: [flow(['client', 'parser', 'opt', 'exec', 'store'], { rate: 1.5 })] },
    },
    {
      short: 'Estimates',
      kind: 'technique',
      title: 'Cost = estimated rows × cost per row',
      body: [
        'The optimizer prices plans using <b>statistics</b> kept per table and column: row count, number of pages, number of distinct values, most-common values and a <b>histogram</b> of the rest. From a predicate like <code>status = \'shipped\'</code> it estimates <b>selectivity</b> — the fraction of rows matching — hence the output row count, which feeds the next operator’s cost.',
        'Costs are in abstract units: reading one page sequentially = 1, a random page = 4 (configurable), plus small CPU costs per row and per operator. On 10 million rows at 100 per page the table is <b>100,000 pages</b>; a sequential scan costs 100,000. An index scan costs roughly one random page per matching row: 0.1% selectivity = 10,000 rows × 4 = <b>40,000</b> — cheaper. The planner chooses the lower number.',
      ],
      changes: [{ text: 'Statistics → selectivity → rows → cost', tone: 'info' }, { text: 'Seq scan: pages · Index scan: matches × random cost', tone: 'info' }],
      scene: { nodes: [opt({ tag: pill('cost(seq) vs cost(index)', 'gauge') }), stats({ tag: pill('rows · distinct · histogram', 'list') })], links: [link('opt', 'stats', { arrow: 'both' })], flows: [flow(['opt', 'stats'], { rate: 1, back: true })] },
    },
    {
      short: 'Crossover',
      kind: 'insight',
      title: 'Why an index isn’t always used',
      body: [
        'Intuition says an index is always faster. It isn’t: each match found through a (non-clustered) index requires a <b>random page fetch</b> into the table, while a sequential scan reads pages in order, prefetched and cheap per row. The break-even selectivity is <code>1 ÷ (rows-per-page × random-page-cost)</code> = 1 ÷ (100 × 4) = <b>0.25%</b>: if the filter matches more than a quarter of one percent of the table, scanning everything is cheaper.',
        'Hence <code>WHERE status = \'active\'</code> on a column where 60% of rows are active ignores the index — correctly. On SSD or cached data the random-page cost is closer to 1 and the crossover rises to ~1%. Indexes shine for <b>selective</b> predicates (a primary-key lookup, a rare status, a narrow range); for “most of the table” the scan wins. Move the selectivity slider across the crossover to watch the plan flip.',
      ],
      changes: [{ text: 'Crossover = 1 ÷ (rows per page × random cost) = 0.25%', tone: 'info' }, { text: 'SSD: random cost ≈ 1.1 → crossover ≈ 1%', tone: 'info' }],
      scene: { nodes: [box('hi', -8, 0, 'Selective: 0.01%', 'green', 'search', { size: [1.3, 1.3], height: 22, tag: pill('use the index', 'check', 'good') }), box('lo', 8, 0, 'Unselective: 40%', 'red', 'list', { size: [1.3, 1.3], height: 26, tag: pill('scan the table', 'check') })], links: [], flows: [] },
    },
    {
      short: 'Covering',
      kind: 'technique',
      title: 'Covering indexes, index-only scans and clustering',
      body: [
        'The random-fetch penalty disappears if the index contains <i>everything the query needs</i>. A <b>covering index</b> (key columns plus <code>INCLUDE</code>d payload columns) allows an <b>index-only scan</b>: the answer comes from the index pages alone, never touching the table — often 10–100× cheaper than a heap fetch per row, and sequential within the index. Databases also need the visibility information (PostgreSQL uses a visibility map) to know the row is current.',
        'A <b>clustered index</b> (InnoDB’s primary key, SQL Server clustered) stores the rows <i>in key order</i>, so range scans on that key read consecutive pages — no random fetch at all. Column order matters in composite indexes: the leftmost columns serve equality and the first range; put the most selective equality columns first. Each extra index costs write time and space, so index what real queries need.',
      ],
      changes: [{ text: 'Covering index → index-only scan, no table access', tone: 'good' }, { text: 'Clustered key → range scans are sequential', tone: 'good' }],
      scene: { nodes: [exec({ tag: pill('answer from the index alone', 'check', 'good') }), db('ix', 8, -4, 'Covering index', { size: [1.3, 1.3] }), box('heap', 8, 6, 'Heap (skipped)', 'grey', 'list', { size: [1.2, 1.2], height: 14, state: 'ghost' })], links: [link('exec', 'ix', { arrow: 'both' }), link('exec', 'heap', { style: 'dashed' })], flows: [flow(['exec', 'ix'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Bad stats',
      kind: 'problem',
      title: 'When estimates are wrong',
      body: [
        'Statistics are samples taken at some moment. After a bulk load, a skewed insert pattern, or for <b>correlated columns</b> (city = ‘Paris’ AND country = ‘France’ treated as independent) the estimate can be off by orders of magnitude. If the optimizer believes the filter matches 100× fewer rows than it does, it picks the index scan for what is really 10% of the table: <b>far more expensive</b> than the scan it should have chosen. Set the true selectivity to 10% and the estimate error to 100×: it picks the index and runs about <b>40× slower</b> than the scan it should have chosen. The opposite error (over-estimating) makes it scan when an index would win.',
        'Fixes: <code>ANALYZE</code> after big changes (and keep auto-analyze on), raise statistics targets for skewed columns, create <b>extended/multi-column statistics</b>, rewrite predicates so they’re estimable, and compare <b>estimated vs actual rows</b> in <code>EXPLAIN ANALYZE</code>. <b>Prepared statements</b> reuse a plan across parameter values — fast, but a plan chosen for a rare value can be wrong for a common one (parameter sniffing).',
      ],
      changes: [{ text: 'Estimate off by 100× → wrong plan, many times slower', tone: 'bad' }, { text: 'ANALYZE · extended statistics · compare estimate vs actual', tone: 'good' }],
      scene: { nodes: [opt({ state: 'hot', tag: pill('believes 100× fewer rows', 'alert', 'bad') }), stats({ tag: pill('stale', 'clock', 'warn') }), exec({ tag: pill('wrong plan runs', 'alert', 'warn') })], links: [link('opt', 'stats', { style: 'dashed' }), link('opt', 'exec')], flows: [flow(['opt', 'exec'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'The plan is a cost estimate — keep the estimates honest',
      body: [
        'SQL is parsed, bound, <b>optimised from statistics</b> and executed as a tree of operators. A scan costs pages; an index scan costs matches × random-page cost, so the crossover is <code>1 ÷ (rows per page × random cost)</code> — a quarter of a percent at the defaults. Covering and clustered indexes remove the random fetch; wrong statistics produce slow plans.',
        'Index selective predicates, keep statistics fresh, read <code>EXPLAIN ANALYZE</code>, and be careful with cached plans. Figures here are cost-model outputs, not timings.',
      ],
      scene: { nodes: [client(), parser(), opt(), exec(), store()], links: [link('client', 'parser'), link('parser', 'opt'), link('opt', 'exec'), link('exec', 'store', { arrow: 'both' })], flows: [flow(['client', 'parser', 'opt', 'exec', 'store'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
