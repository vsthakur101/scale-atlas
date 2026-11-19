import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -15, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const gql = (extra: Partial<SceneNode> = {}) => box('gql', -6, 0, 'GraphQL server', 'purple', 'route', { size: [1.5, 1.5], height: 32, ...extra });
const svcA = (extra: Partial<SceneNode> = {}) => db('a', 6, -6, 'Posts service / DB', { size: [1.3, 1.3], ...extra });
const svcB = (extra: Partial<SceneNode> = {}) => db('b', 6, 0, 'Users service / DB', { size: [1.3, 1.3], ...extra });
const svcC = (extra: Partial<SceneNode> = {}) => db('c', 6, 6, 'Comments service / DB', { size: [1.3, 1.3], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

const lesson: Lesson = {
  slug: 'source-what-is-graphql',
  title: 'GraphQL: Queries, Resolvers and the N+1 Problem',
  blurb: 'One typed endpoint where the client names the shape it wants — and the resolver fan-out, batching and cost limits that make it fast and safe.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'objs', label: 'Objects returned by the query', icon: 'layers' },
    { key: 'size', label: 'Response size', icon: 'file' },
    { key: 'naive', label: 'Database queries (naive resolvers)', icon: 'alert' },
    { key: 'batch', label: 'Database queries (batched)', icon: 'check' },
  ],
  goals: [
    { text: 'Schema, query and the client-chosen response shape', step: 1 },
    { text: 'How resolvers execute a query tree', step: 2 },
    { text: 'The N+1 problem and DataLoader batching', step: 3 },
    { text: 'Why unbounded queries are a denial-of-service risk', step: 4 },
    { text: 'Caching, persisted queries and federation', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'items', label: 'Items per list at each level', min: 1, max: 200, step: 1, default: 20, unit: '', description: '“first: N” on each nested list (posts, comments, likes…).' },
      { key: 'depth', label: 'Nesting depth', min: 1, max: 6, step: 1, default: 3, unit: '', description: 'Levels of nested lists in the query.' },
      { key: 'bytes', label: 'Bytes per object in the response', min: 50, max: 2000, step: 10, default: 200, unit: ' B', description: 'Serialized size of one object with its selected fields.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.items ?? 20));
      const d = Math.max(1, Math.round(input.depth ?? 3));
      const bytes = Math.max(1, input.bytes ?? 200);
      // Objects at level k = n^k; total = n + n² + … + n^d.
      let objs = 0;
      let naive = 1;
      for (let k = 1; k <= d; k++) {
        objs += Math.pow(n, k);
        // Without batching, every object at level k−1 triggers one query for its children.
        if (k > 1) naive += Math.pow(n, k - 1);
      }
      const batch = d; // one query per level when loaded by parent-id sets
      return {
        objs: step < 1 ? { v: '—' } : { v: fmtN(objs), tone: objs > 100000 ? 'bad' : objs > 5000 ? 'warn' : 'good' },
        size: step < 1 ? { v: '—' } : { v: fmtB(objs * bytes), tone: objs * bytes > 5e6 ? 'bad' : objs * bytes > 5e5 ? 'warn' : 'good' },
        naive: step < 2 ? { v: '—' } : { v: fmtN(naive), tone: naive > 1000 ? 'bad' : naive > 100 ? 'warn' : 'good' },
        batch: step < 2 ? { v: '—' } : { v: `${batch}`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The idea',
      kind: 'insight',
      title: 'Ask for exactly what you need, in one request',
      body: [
        'With REST a screen showing a post, its author and the first comments often needs several round trips (<code>/posts/7</code>, <code>/users/3</code>, <code>/posts/7/comments</code>) and each returns more fields than the screen uses. <b>GraphQL</b> exposes one endpoint and a <b>typed schema</b> of objects and their relations; the client sends a <b>query</b> naming exactly the fields it wants — nested however it likes — and gets back a response of exactly that shape.',
        'The schema is the contract (types, nullability, relations), introspectable by tools; clients and servers evolve by adding fields and deprecating old ones rather than versioning endpoints. The cost moves to the server: it must <b>resolve</b> arbitrary client-chosen trees efficiently and safely.',
      ],
      scene: { nodes: [client({ tag: pill('post { title author { name } comments { text } }', 'file') }), gql({ tag: pill('one typed endpoint', 'check') }), svcA(), svcB(), svcC()], links: [link('client', 'gql', { arrow: 'both' }), link('gql', 'a'), link('gql', 'b'), link('gql', 'c')], flows: [flow(['client', 'gql'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Resolvers',
      kind: 'technique',
      title: 'Resolvers: a function per field',
      body: [
        'Each field in the schema has a <b>resolver</b> — a function that returns its value, defaulting to reading a property. The engine parses and validates the query against the schema, then executes it as a tree: it resolves the root field (<code>posts</code>), then for <i>each</i> returned object resolves the requested child fields (<code>author</code>, <code>comments</code>), recursively, running sibling fields concurrently.',
        'That flexibility is the problem in disguise: the server has no idea in advance how many objects or how deep the client’s query will go, and a resolver written as “fetch this author by id” gets called once per post. The number of calls depends on the <b>shape of the data and the query</b>, not on your code.',
      ],
      changes: [{ text: 'Execute the query tree; resolver per field', tone: 'info' }],
      scene: { nodes: [gql({ tag: pill('posts → [author, comments]', 'list') }), box('p', 6, -6, 'resolve posts', 'blue', 'cpu', { size: [1.1, 1.1], height: 20 }), box('a', 6, 0, 'resolve author × N', 'orange', 'cpu', { size: [1.1, 1.1], height: 20 }), box('c', 6, 6, 'resolve comments × N', 'orange', 'cpu', { size: [1.1, 1.1], height: 20 })], links: [link('gql', 'p'), link('gql', 'a'), link('gql', 'c')], flows: [flow(['gql', 'p'], { rate: 1 })] },
    },
    {
      short: 'N+1',
      kind: 'problem',
      title: 'The N+1 problem and batching',
      body: [
        'Query: 20 posts, each with its comments, each comment with its author. A naive resolver per object issues one database query per parent: <b>1</b> query for posts, <b>20</b> for the comments of each post, <b>400</b> for each comment’s author — <b>421 queries</b> for a modest page, each a network round trip. Latency and database load scale with the data, not the query.',
        'The standard fix is <b>batching with a DataLoader</b>: resolvers ask a loader for a key (<code>author(id)</code>); the loader collects all keys requested in the same tick and issues <b>one</b> <code>WHERE id IN (…)</code> query, then hands each resolver its row, with per-request caching. The same 3-level query becomes <b>3 queries</b>. Also useful: join-based loading from the root resolver and look-ahead on the selected fields.',
      ],
      changes: [{ text: '20 → 400 children: 1 + 20 + 400 = 421 queries', tone: 'bad' }, { text: 'DataLoader: one batched query per level = 3', tone: 'good' }],
      concepts: [{ term: 'DataLoader', def: 'A per-request batching and caching helper that coalesces many single-key loads in one tick into one multi-key query.' }],
      scene: { nodes: [gql({ tag: pill('421 queries', 'alert', 'bad') }), svcA({ state: 'hot', tag: pill('flooded', 'alert', 'bad') }), box('dl', 0, 8, 'DataLoader', 'green', 'layers', { size: [1.3, 1.3], height: 24, tag: pill('IN (…): 3 queries', 'check', 'good') })], links: [link('gql', 'a'), link('gql', 'dl', { style: 'dashed' })], flows: [flow(['gql', 'a'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Abuse',
      kind: 'problem',
      title: 'Client-chosen shape means client-chosen cost',
      body: [
        'Because clients control nesting and list sizes, a small query can be enormous. <code>posts(first:100) { comments(first:100) { likes(first:100) { user } } }</code> asks for up to <b>1,000,000</b> leaf objects — a 200 MB response at 200 B each — from a few hundred bytes of text. Cyclic relations (<code>author { posts { author { posts … } } }</code>) allow unbounded depth. This is an accidental or deliberate <b>denial of service</b>.',
        'Defences: <b>depth limits</b>, <b>query-cost analysis</b> (assign each field a cost × the list-size arguments, reject over a budget — often returning the cost to clients), <b>mandatory pagination limits</b> (max <code>first</code>), <b>timeouts</b>, per-client rate limits by cost not requests, and <b>persisted/allow-listed queries</b> in production so only reviewed queries run. Disable introspection and detailed errors for public endpoints.',
      ],
      changes: [{ text: '100 × 100 × 100 = 1,000,000 objects from one tiny query', tone: 'bad' }, { text: 'Depth limit · cost budget · page caps · persisted queries', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('first:100 × 100 × 100', 'alert', 'bad') }), gql({ state: 'hot', load: 100, tag: pill('1M objects?', 'alert', 'bad') }), box('guard', -6, 8, 'Cost limit', 'red', 'shield', { size: [1.2, 1.2], height: 22, tag: pill('reject over budget', 'check', 'good') })], links: [link('client', 'gql'), link('client', 'guard', { style: 'dashed' })], flows: [flow(['client', 'gql'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Caching',
      kind: 'tradeoff',
      title: 'Caching, persisted queries and federation',
      body: [
        'GraphQL usually uses <code>POST</code> to one URL, so HTTP/CDN caching doesn’t work by default. Options: <b>persisted queries</b> (the client sends a hash that maps to a stored query, enabling <code>GET</code> and CDN caching, and shrinking requests), <b>field-level response caching</b> with cache hints, and <b>client-side normalised caches</b> (Apollo/Relay store objects by id so overlapping queries share data).',
        'At scale a monolithic schema is split across teams with <b>federation</b>: each service owns part of the graph, and a <b>gateway</b> plans a query across services (this is where batching and cost control matter most — one client query fans out to many back ends). Trade-offs against REST: flexible clients and fewer round trips versus harder caching, security and operations. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [client(), gql({ name: 'Gateway', tag: pill('plan across services', 'route') }), box('s1', 6, -5, 'Users graph', 'blue', 'db', { size: [1.2, 1.2], height: 22 }), box('s2', 6, 5, 'Orders graph', 'orange', 'db', { size: [1.2, 1.2], height: 22 })], links: [link('client', 'gql'), link('gql', 's1'), link('gql', 's2')], flows: [flow(['client', 'gql', 's1'], { rate: 1.5 }), flow(['gql', 's2'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Flexible for clients, your job to bound the server',
      body: [
        'GraphQL: a typed schema, one endpoint, client-shaped responses. The server executes a <b>resolver tree</b>; without <b>batching</b> it suffers N+1 (<code>1 + n + n² …</code> queries); without <b>depth and cost limits</b> a tiny query can ask for millions of objects.',
        'Use DataLoader-style batching, cost analysis, persisted queries and per-client limits; accept that CDN caching needs extra work. Choose it when many different clients need different shapes of the same graph.',
      ],
      scene: { nodes: [client(), gql(), svcA(), svcB(), svcC()], links: [link('client', 'gql', { arrow: 'both' }), link('gql', 'a'), link('gql', 'b'), link('gql', 'c')], flows: [flow(['client', 'gql'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
