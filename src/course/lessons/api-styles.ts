import type { Lesson, SceneNode } from '../../types';
import { at, box, db, flow, link, pill, you } from '../kit';

const phone = (extra: Partial<SceneNode> = {}) => you('phone', -11, 1, { label: pill('mobile app · 3G', 'wifi'), ...extra });
const svc = (id: string, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, 6, d, name, 'blue', 'server', { size: [1.4, 1.4], height: 38, ...extra });
const users = (x: Partial<SceneNode> = {}) => svc('users', -8, 'Users', x);
const orders = (x: Partial<SceneNode> = {}) => svc('orders', 0, 'Orders', x);
const reviews = (x: Partial<SceneNode> = {}) => svc('reviews', 8, 'Reviews', x);
const gateway = (extra: Partial<SceneNode> = {}) => box('gw', -3, 0, 'Gateway', 'orange', 'route', { size: [1.5, 1.5], height: 40, ...extra });
const three = ['users', 'orders', 'reviews'];

const lesson: Lesson = {
  slug: 'api-styles',
  title: 'API Styles',
  blurb: 'REST, GraphQL and RPC are answers to different questions. See what each costs in round trips, bytes and coupling.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'rtts', label: 'Round trips', icon: 'refresh' },
    { key: 'bytes', label: 'Payload', icon: 'file' },
    { key: 'load', label: 'Screen load', icon: 'timer' },
    { key: 'risk', label: 'Retry safety', icon: 'shield' },
  ],
  goals: [
    { text: 'Resource-oriented REST and HTTP caching', step: 2 },
    { text: 'Over-fetching, under-fetching and N+1 calls', step: 3 },
    { text: 'GraphQL’s single round trip and its server-side costs', step: 5 },
    { text: 'gRPC for service-to-service calls', step: 6 },
    { text: 'Evolving APIs, idempotency keys and cursor pagination', step: 9 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  steps: [
    {
      short: 'Three calls',
      kind: 'problem',
      title: 'One screen, three trips across a slow network',
      body: [
        'A shop’s mobile profile screen shows the user, their last orders, and their reviews. The app makes three sequential calls — it needs the user ID from the first to make the others — over a 3G connection with a 300 ms round trip.',
        'Even with fast servers, the screen takes over a second, and most of that is waiting on the network.',
      ],
      changes: [{ text: '3 sequential round trips', tone: 'bad' }],
      scene: {
        nodes: [phone(), users(), orders(), reviews()],
        links: three.map((s) => link('phone', s, { arrow: 'both' })),
        flows: three.map((s) => flow(['phone', s], { back: true, rate: 0.6, speed: 0.5 })),
        metrics: { rtts: { v: '3', tone: 'bad' }, bytes: '74 KB', load: { v: '1.2 s', tone: 'bad' }, risk: '—' },
      },
    },
    {
      short: 'REST',
      kind: 'technique',
      title: 'REST: resources, verbs and caching',
      body: [
        '<b>REST</b> models the API as resources at URLs — <code>/users/7</code>, <code>/users/7/orders</code> — manipulated with HTTP methods: <code>GET</code> reads, <code>POST</code> creates, <code>PUT</code>/<code>PATCH</code> update, <code>DELETE</code> removes. Status codes carry the outcome.',
        'Its biggest gift is the web’s infrastructure: <code>GET</code> responses are cacheable by browsers, CDNs and proxies with <code>Cache-Control</code> and <code>ETag</code>. Simple, inspectable with curl, and understood by every client on earth.',
      ],
      concepts: [
        { term: 'REST', def: 'An API style built on resources identified by URLs and manipulated with standard HTTP methods.' },
        { term: 'ETag', def: 'A response version identifier; clients revalidate with If-None-Match and get 304 Not Modified when unchanged.' },
      ],
      scene: {
        nodes: [phone(), users({ tag: pill('GET /users/7', 'link') }), orders({ tag: pill('GET /users/7/orders', 'link') }), reviews({ tag: pill('304 Not Modified', 'check', 'good') })],
        links: three.map((s) => link('phone', s, { arrow: 'both' })),
        flows: three.map((s) => flow(['phone', s], { back: true, rate: 0.6, speed: 0.5 })),
        metrics: { rtts: '3', bytes: '74 KB', load: '1.2 s', risk: 'GET safe' },
      },
    },
    {
      short: 'Over/under',
      kind: 'problem',
      title: 'Too much here, not enough there',
      body: [
        '<b>Over-fetching</b>: <code>/users/7</code> returns 60 fields; the screen uses 3. <b>Under-fetching</b>: the orders list returns product IDs, so showing product names means one more call <i>per order</i> — the <b>N+1</b> pattern, now over 3G.',
        'Teams patch this with custom endpoints (<code>/mobile/profile-screen</code>) or <code>?fields=</code> and <code>?include=</code> parameters. Each works, and each couples the server to one client’s screens.',
      ],
      changes: [{ text: '60 fields sent, 3 used', tone: 'bad' }, { text: '+10 calls for product names', tone: 'bad' }],
      concepts: [{ term: 'N+1 requests', def: 'One request for a list followed by one request per item to fetch related data.' }],
      scene: {
        nodes: [phone({ tag: pill('13 requests', 'alert', 'bad') }), users({ tag: pill('60 fields', 'file', 'warn') }), orders(), reviews(), svc('products', 16, 'Products', { at: at(12, 4) })],
        links: [...three.map((s) => link('phone', s, { arrow: 'both' })), link('phone', 'products', { arrow: 'both', label: pill('× 10', 'refresh', 'bad') })],
        flows: [...three.map((s) => flow(['phone', s], { back: true, rate: 0.5, speed: 0.5 })), flow(['phone', 'products'], { back: true, rate: 2, speed: 0.5 })],
        metrics: { rtts: { v: '4 + 10', tone: 'bad' }, bytes: { v: '118 KB', tone: 'bad' }, load: { v: '2.4 s', tone: 'bad' }, risk: 'GET safe' },
      },
    },
    {
      short: 'GraphQL',
      kind: 'technique',
      title: 'GraphQL: the client asks for a shape',
      body: [
        'With <b>GraphQL</b> the server publishes a typed schema, and the client sends one query describing exactly the tree it needs: the user’s name and avatar, their last five orders with product names, their review count.',
        'A gateway resolves each field from the right backend and returns precisely that shape in <b>one round trip</b>. Mobile and web can evolve their screens without new endpoints.',
      ],
      changes: [{ text: '1 round trip', tone: 'good' }, { text: 'Payload 118 → 9 KB', tone: 'good' }],
      concepts: [
        { term: 'GraphQL', def: 'A query language and runtime where clients request exactly the fields they need from a typed schema.' },
        { term: 'Resolver', def: 'The server function that fetches the data for one field of a GraphQL type.' },
      ],
      scene: {
        nodes: [phone({ tag: pill('{ user { name orders(last:5) … } }', 'list', 'accent') }), gateway({ name: 'GraphQL', tag: pill('resolve fields', 'route') }), users(), orders(), reviews()],
        links: [link('phone', 'gw', { arrow: 'both', label: pill('1 query') }), ...three.map((s) => link('gw', s, { arrow: 'both' }))],
        flows: [flow(['phone', 'gw'], { back: true, rate: 0.7, speed: 0.5 }), ...three.map((s) => flow(['gw', s], { back: true, rate: 1.4 }))],
        metrics: { rtts: { v: '1', tone: 'good' }, bytes: { v: '9 KB', tone: 'good' }, load: { v: '420 ms', tone: 'good' }, risk: 'GET safe' },
      },
    },
    {
      short: 'GQL costs',
      kind: 'tradeoff',
      title: 'The complexity moved to the server',
      body: [
        'Naive resolvers recreate N+1 on the server: one database query per order to fetch its product. A <b>DataLoader</b> batches those into one <code>WHERE id IN (…)</code> per request tick.',
        'Other costs: queries usually arrive as <code>POST</code>, so CDN caching needs persisted queries; one innocent-looking nested query can fan out into thousands of lookups, so you need <b>depth and cost limits</b>; and per-field authorization must be enforced in resolvers.',
      ],
      note: { kind: 'warn', text: 'A public GraphQL endpoint without query cost limits is an invitation to denial of service.' },
      concepts: [{ term: 'DataLoader', def: 'A batching and caching layer that coalesces many single-key loads within a request into one bulk fetch.' }],
      scene: {
        nodes: [phone(), gateway({ name: 'GraphQL', tag: pill('depth ≤ 6 · cost ≤ 1k', 'shield', 'good') }), users(), orders({ tag: pill('batched: IN (…)', 'layers', 'good') }), reviews(), db('db', 13, 0, 'Products DB')],
        links: [link('phone', 'gw', { arrow: 'both' }), ...three.map((s) => link('gw', s, { arrow: 'both' })), link('orders', 'db', { arrow: 'both', label: pill('1 query, not 10') })],
        flows: [flow(['phone', 'gw'], { back: true, rate: 0.7 }), flow(['gw', 'orders', 'db'], { back: true, rate: 1 })],
        metrics: { rtts: '1', bytes: '9 KB', load: '380 ms', risk: 'GET safe' },
      },
    },
    {
      short: 'gRPC',
      kind: 'technique',
      title: 'RPC between services: gRPC',
      body: [
        'Behind the gateway, services call each other thousands of times a second. <b>gRPC</b> defines methods and messages in a Protocol Buffers schema, generates typed clients and servers in many languages, and sends compact binary messages over long-lived HTTP/2 connections with multiplexing and streaming.',
        'Payloads are several times smaller than JSON and parsing is cheaper. The price: not human-readable, awkward from browsers, and both sides must share the schema.',
      ],
      changes: [{ text: 'Internal calls: JSON → protobuf', tone: 'good' }, { text: 'Payload −70%', tone: 'good' }],
      concepts: [
        { term: 'gRPC', def: 'An RPC framework using Protocol Buffers over HTTP/2, with generated clients, deadlines and streaming.' },
        { term: 'Protocol Buffers', def: 'A schema-defined binary serialization format with numbered fields for compatibility.' },
      ],
      scene: {
        nodes: [phone({ state: 'dim' }), gateway({ tag: pill('rpc GetOrders()', 'bolt') }), users(), orders(), reviews()],
        links: [link('phone', 'gw', { style: 'dashed' }), ...three.map((s) => link('gw', s, { arrow: 'both', label: s === 'orders' ? pill('HTTP/2 · protobuf', 'bolt') : undefined }))],
        flows: three.map((s) => flow(['gw', s], { back: true, rate: 2.5, speed: 1.4 })),
        metrics: { rtts: '1', bytes: { v: '2.7 KB', tone: 'good' }, load: '310 ms', risk: 'GET safe' },
      },
    },
    {
      short: 'Evolution',
      kind: 'insight',
      title: 'Change without breaking old clients',
      body: [
        'Mobile apps live on phones for years, so an API change must not break versions you can’t update. Additive changes are safe: new optional fields, new endpoints. Removing or renaming fields, or changing their meaning, is not.',
        'In protobuf, never reuse a field number; in GraphQL, mark fields <code>@deprecated</code> and watch usage drop to zero before removing; in REST, add rather than alter, and reserve <code>/v2</code> for real breaks.',
      ],
      concepts: [{ term: 'Backward compatibility', def: 'New server versions keep working for existing clients that don’t know about the change.' }],
      scene: {
        nodes: [you('old', -11, -5, { label: pill('app v3.2 (2 years old)', 'wifi') }), you('new', -11, 6, { label: pill('app v5.0', 'wifi') }), gateway({ tag: pill('+ fields, never − fields', 'check', 'good') }), users(), orders(), reviews()],
        links: [link('old', 'gw', { arrow: 'both' }), link('new', 'gw', { arrow: 'both' }), ...three.map((s) => link('gw', s))],
        flows: [flow(['old', 'gw'], { back: true, rate: 0.7 }), flow(['new', 'gw'], { back: true, rate: 0.7 })],
        metrics: { rtts: '1', bytes: '9 KB', load: '380 ms', risk: 'GET safe' },
      },
    },
    {
      short: 'Retries',
      kind: 'case',
      title: 'Case: the double charge',
      body: [
        'A customer taps “Pay”. The request reaches the server and the charge succeeds, but the response is lost when the train enters a tunnel. The app retries — and the customer is charged twice.',
        '<code>GET</code>, <code>PUT</code> and <code>DELETE</code> are meant to be idempotent; <code>POST</code> is not. Fix: the client generates an <b>idempotency key</b> per logical operation and sends it on every retry; the server stores the key with the result and replays the stored response for duplicates.',
      ],
      note: { kind: 'tip', text: 'Store the idempotency key in the same transaction as the side effect, so a crash can’t record one without the other.' },
      changes: [{ text: 'Retry → duplicate charge', tone: 'bad' }, { text: 'Idempotency-Key → replay result', tone: 'good' }],
      concepts: [{ term: 'Idempotency key', def: 'A client-chosen unique key that lets a server recognise and safely replay a repeated request.' }],
      scene: {
        nodes: [phone({ tag: pill('Idempotency-Key: 9f1c…', 'key', 'good') }), gateway(), box('pay', 6, 0, 'Payments', 'teal', 'dollar', { size: [1.5, 1.5], height: 40, tag: pill('seen 9f1c → replay', 'refresh', 'good') })],
        links: [link('phone', 'gw', { arrow: 'both' }), link('gw', 'pay', { arrow: 'both' })],
        flows: [flow(['phone', 'gw', 'pay'], { back: true, rate: 0.8 }), flow(['pay', 'gw', 'phone'], { kind: 'fail', rate: 0.4 })],
        metrics: { rtts: '1 + retry', bytes: '1 KB', load: '—', risk: { v: 'exactly once', tone: 'good' } },
      },
    },
    {
      short: 'Pagination',
      kind: 'technique',
      title: 'Paginate with cursors, not offsets',
      body: [
        '<code>?offset=10000&limit=20</code> makes the database walk and discard 10,000 rows, and if new orders arrive between pages, items shift — users see duplicates or miss some.',
        '<b>Cursor pagination</b> returns an opaque token for “after this item” (often the last sort key): <code>?after=eyJpZCI6…</code>. Each page is an index seek, and inserts don’t disturb the pages already served.',
      ],
      concepts: [{ term: 'Cursor pagination', def: 'Fetching the next page relative to the last item seen, rather than by numeric offset.' }],
      scene: {
        nodes: [phone({ tag: pill('?after=eyJpZCI6…', 'arrowRight', 'good') }), gateway(), orders({ tag: pill('index seek, 20 rows', 'search', 'good') }), db('db', 13, 0, 'Orders DB')],
        links: [link('phone', 'gw', { arrow: 'both' }), link('gw', 'orders', { arrow: 'both' }), link('orders', 'db', { arrow: 'both' })],
        flows: [flow(['phone', 'gw', 'orders', 'db'], { back: true, rate: 0.8 })],
        metrics: { rtts: '1 / page', bytes: '4 KB', load: '120 ms', risk: 'GET safe' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Different styles for different borders',
      body: [
        '<b>REST</b> for public, cacheable, resource-shaped APIs that any client can call. <b>GraphQL</b> where many clients need different shapes of the same data — usually as a gateway in front of services, with batching and cost limits. <b>gRPC</b> for high-volume, typed calls between your own services.',
        'Whatever the style: evolve additively, make retried writes safe with <b>idempotency keys</b>, and paginate with <b>cursors</b>.',
      ],
      scene: {
        nodes: [phone({ tag: pill('REST or GraphQL at the edge', 'globe') }), gateway({ tag: pill('gRPC inside', 'bolt') }), users(), orders(), reviews()],
        links: [link('phone', 'gw', { arrow: 'both' }), ...three.map((s) => link('gw', s, { arrow: 'both' }))],
        flows: [flow(['phone', 'gw'], { back: true, rate: 0.7 }), ...three.map((s) => flow(['gw', s], { back: true, rate: 1.5, speed: 1.3 }))],
        metrics: { rtts: '1', bytes: '9 KB', load: '310 ms', risk: 'idempotent' },
      },
    },
  ],
};

export default lesson;
