import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -13, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -3, 0, 'API', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const table = (extra: Partial<SceneNode> = {}) => db('table', 9, 0, 'Table (indexed)', { size: [1.5, 1.5], ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 1 ? `${ms.toFixed(ms < 10 ? 1 : 0)} ms` : `${(ms * 1000).toFixed(0)} µs`);

const lesson: Lesson = {
  slug: 'source-how-do-we-perform-pagination-in-api-design',
  title: 'API Pagination: Offset vs Cursor',
  blurb: 'Why OFFSET gets slower the deeper you go and shows duplicates on live data, and how keyset cursors fix both.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'off', label: 'Offset: rows scanned', icon: 'search' },
    { key: 'offt', label: 'Offset: time for this page', icon: 'clock' },
    { key: 'cur', label: 'Cursor: rows examined', icon: 'search' },
    { key: 'dup', label: 'Rows repeated by offset between pages', icon: 'alert' },
  ],
  goals: [
    { text: 'Why a list endpoint must paginate at all', step: 1 },
    { text: 'How offset pagination works and why it slows with depth', step: 2 },
    { text: 'Why offset repeats or skips rows on live data', step: 3 },
    { text: 'Keyset (cursor) pagination and its trade-offs', step: 4 },
    { text: 'Response design: opaque cursors, limits and totals', step: 6 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'page', label: 'Page number requested', min: 1, max: 100000, step: 1, default: 1000, unit: '', description: 'How deep the client has scrolled.' },
      { key: 'size', label: 'Page size', min: 5, max: 200, step: 5, default: 20, unit: '', description: 'Rows per page.' },
      { key: 'scan', label: 'Rows the database skips per ms', min: 100, max: 5000, step: 100, default: 1000, unit: '', description: 'How quickly the database can walk and discard rows.' },
      { key: 'ins', label: 'New rows per minute at the top', min: 0, max: 20000, step: 10, default: 600, unit: '', description: 'Insert rate on a newest-first list.' },
      { key: 'gap', label: 'Seconds between page loads', min: 1, max: 120, step: 1, default: 10, unit: ' s', description: 'Time a user spends between fetching one page and the next.' },
    ],
    calculate: (input, step) => {
      const page = Math.max(1, Math.round(input.page ?? 1000));
      const size = Math.max(1, Math.round(input.size ?? 20));
      const scan = Math.max(1, input.scan ?? 1000);
      const ins = Math.max(0, input.ins ?? 600);
      const gap = Math.max(0, input.gap ?? 10);
      // OFFSET k LIMIT n makes the database walk past k rows and return n.
      const rows = (page - 1) * size + size;
      const ms = rows / scan;
      // New rows pushed in at the top shift every later row down; the next page starts that many rows too early.
      const shift = (ins / 60) * gap;
      const repeated = Math.min(size, shift);
      return {
        off: step < 1 ? { v: '—' } : { v: fmtN(rows), tone: rows > 100000 ? 'bad' : rows > 10000 ? 'warn' : 'good' },
        offt: step < 1 ? { v: '—' } : { v: fmtMs(ms), tone: ms > 200 ? 'bad' : ms > 20 ? 'warn' : 'good' },
        cur: step < 3 ? { v: '—' } : { v: `${fmtN(size)} (+ one index seek)`, tone: 'good' },
        dup: step < 2 ? { v: '—' } : { v: repeated >= size ? `all ${size} (page is a repeat)` : `${Math.round(repeated)} of ${size}`, tone: repeated === 0 ? 'good' : repeated >= size ? 'bad' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Never return an unbounded list',
      body: [
        'A <code>GET /orders</code> that returns everything works in development and fails in production: a table with millions of rows means huge responses, memory pressure, slow queries and clients that time out. List endpoints must return <b>a bounded page</b> and let the client ask for the next.',
        'Two designs dominate: <b>offset pagination</b> (“skip N rows, give me M”) and <b>keyset / cursor pagination</b> (“give me M rows after this one”). They look interchangeable and behave very differently at depth and under change.',
      ],
      scene: { nodes: [client(), api(), table({ tag: pill('10,000,000 rows', 'list') })], links: [link('client', 'api', { arrow: 'both' }), link('api', 'table', { arrow: 'both' })], flows: [flow(['client', 'api', 'table'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Offset',
      kind: 'technique',
      title: 'Offset pagination: simple, and slower with every page',
      body: [
        '<code>GET /orders?page=3&amp;per_page=20</code> becomes <code>SELECT … ORDER BY created_at DESC LIMIT 20 OFFSET 40</code>. It is easy to build, lets users jump to page N and supports a “page 3 of 500” UI.',
        'The cost: the database can’t jump to row 40 — it must <b>walk and discard</b> the first 40 rows in sort order, then return 20. Page 1,000 of 20 rows means reading <b>20,000 rows</b> to return 20; page 50,000 means a million. At 1,000 rows/ms that’s 20 ms, then 1 s, and every deeper page is slower — a hostile or careless client can walk into very expensive queries.',
      ],
      changes: [{ text: 'Cost ∝ offset + limit', tone: 'bad' }, { text: 'Page 1,000 × 20 → 20,000 rows read', tone: 'bad' }],
      scene: { nodes: [client({ tag: pill('page 1000', 'list') }), api({ tag: pill('OFFSET 19980 LIMIT 20', 'search') }), table({ state: 'hot', load: 90, tag: pill('skips 19,980 rows', 'alert', 'bad') })], links: [link('client', 'api'), link('api', 'table')], flows: [flow(['client', 'api', 'table'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Drift',
      kind: 'problem',
      title: 'Offsets repeat and skip rows on live data',
      body: [
        'The list changes while the user reads it. On a newest-first feed, 600 new rows a minute is 10 a second. The user loads page 1, takes 10 seconds, then asks for page 2 — but <b>100 new rows</b> have arrived at the top, pushing everything down. “Skip 20” now lands on rows that were part of page 1: <b>the whole second page is a repeat</b> (and with deletes, rows are silently skipped instead).',
        'Offset positions refer to “the Nth row right now”, not to a stable place in the data, so any insert or delete before the position shifts everything after it. This is invisible in tests and routine in production.',
      ],
      changes: [{ text: '100 inserts at the top → page 2 repeats page 1', tone: 'bad' }, { text: 'Deletes cause skipped rows', tone: 'bad' }],
      scene: { nodes: [client({ tag: pill('page 2 = rows already seen', 'alert', 'warn') }), api(), table({ tag: pill('+100 new rows at the top', 'refresh', 'warn') })], links: [link('client', 'api'), link('api', 'table')], flows: [flow(['client', 'api', 'table'], { rate: 1.2 })] },
    },
    {
      short: 'Keyset',
      kind: 'technique',
      title: 'Keyset (cursor) pagination: remember where you stopped',
      body: [
        'Instead of a number, the client sends the <b>position of the last row it saw</b>: <code>WHERE (created_at, id) &lt; (:ts, :id) ORDER BY created_at DESC, id DESC LIMIT 20</code>. With an index on those columns the database <b>seeks directly</b> to that point and reads 20 rows — the cost is the same on page 1 and page 1,000,000, and inserts or deletes elsewhere can’t shift it.',
        'The sort key must be <b>unique and stable</b>, so add a tie-breaker (the primary key). Limits: no jumping to “page 5,000” (only next/previous), and the sort order must match an index — arbitrary multi-column sorts and filters need matching composite indexes. For infinite-scroll feeds, activity logs and exports, it is the right default.',
      ],
      changes: [{ text: 'WHERE key < last_seen → index seek', tone: 'good' }, { text: 'Constant cost at any depth', tone: 'good' }, { text: 'No random page jumps', tone: 'info' }],
      concepts: [{ term: 'Keyset pagination', def: 'Paging by the sort-key value of the last row seen, using an index seek instead of skipping rows.' }],
      scene: { nodes: [client({ tag: pill('after = (ts, id)', 'hash') }), api({ tag: pill('WHERE key < last', 'search', 'good') }), table({ tag: pill('index seek + 20 rows', 'check', 'good') })], links: [link('client', 'api'), link('api', 'table')], flows: [flow(['client', 'api', 'table'], { rate: 2 })] },
    },
    {
      short: 'Design',
      kind: 'technique',
      title: 'Designing the response',
      body: [
        'Return the items plus a <b>next cursor</b> — an <b>opaque</b> string (base64 of the key, ideally signed or encrypted) so clients treat it as a token, not something to construct, and you can change its internals later. Include <code>has_more</code> (or a null cursor at the end). Support <code>limit</code> with a sane <b>default and a hard maximum</b> (say 100).',
        'Counts are a separate cost: <code>COUNT(*)</code> over a big filtered table is slow — omit totals, return an approximate count, or cache it. Follow conventions clients know: <code>Link</code> headers (<code>rel="next"</code>) or a <code>next</code> field in the body, and keep the ordering deterministic.',
      ],
      changes: [{ text: 'Opaque next cursor + has_more', tone: 'good' }, { text: 'Default and maximum limit', tone: 'good' }, { text: 'Totals are optional and costly', tone: 'info' }],
      scene: { nodes: [api(), box('resp', 8, 0, '{ items: […], next: "eyJ0cyI6…" }', 'teal', 'file', { size: [1.6, 1.2], height: 22, tag: pill('opaque cursor', 'hash') })], links: [link('api', 'resp')], flows: [flow(['api', 'resp'], { kind: 'response', rate: 1.5 })] },
    },
    {
      short: 'Choosing',
      kind: 'tradeoff',
      title: 'When offset is still fine',
      body: [
        'Offset is acceptable for <b>small, slow-changing, admin-style</b> data where users genuinely need page numbers: a few thousand rows, rare inserts, shallow paging — enforce a maximum depth. Use keyset for large or live data, feeds, and public APIs. Some systems combine them: keyset for scrolling and an approximate page jump via a precomputed index.',
        'Whichever you choose, make the contract explicit: ordering, stability guarantees, maximum page size and what happens to rows inserted mid-scan. Figures here are model outputs for sizing, not measurements of any database.',
      ],
      scene: { nodes: [box('off', -8, 0, 'Offset', 'orange', 'list', { size: [1.3, 1.3], height: 22, tag: pill('small, static, jumpable', 'check') }), box('key', 8, 0, 'Keyset', 'green', 'search', { size: [1.3, 1.3], height: 26, tag: pill('large, live, scalable', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Seek, don’t skip',
      body: [
        '<b>Offset</b> pagination is simple but reads <code>offset + limit</code> rows and drifts when data changes. <b>Keyset</b> pagination seeks to the last-seen key with an index: constant cost, stable under inserts, no random page jumps.',
        'Default to keyset with an opaque cursor, a hard page-size cap and a deterministic unique sort; use offset only for small, static, human-browsed lists.',
      ],
      scene: { nodes: [client(), api(), table()], links: [link('client', 'api', { arrow: 'both' }), link('api', 'table', { arrow: 'both' })], flows: [flow(['client', 'api', 'table'], { rate: 2 })] },
    },
  ],
};

export default lesson;
