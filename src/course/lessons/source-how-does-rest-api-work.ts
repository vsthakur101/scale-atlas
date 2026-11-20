import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => crowd('client', -18, 0, 8, 'clients (browser, mobile, services)', extra);
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', -9, 0, 'CDN / HTTP cache', 'teal', 'globe', { size: [1.4, 1.4], height: 24, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', 0, 0, 'Stateless API servers', 'orange', 'server', { size: [1.6, 1.6], height: 30, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 10, 0, 'Resource store', { size: [1.5, 1.5], ...extra });
const res = (id: string, y: number, name: string, extra: Partial<SceneNode> = {}) => box(id, 10, y, name, 'blue', 'file', { size: [1.2, 1.1], height: 16, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtBw = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB/s` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.round(b / 1e3)} KB/s`);

const lesson: Lesson = {
  slug: 'source-how-does-rest-api-work',
  title: 'REST in Practice: Resources, Verbs, Caching and Chatty Clients',
  blurb: 'What REST’s constraints buy you — uniform verbs, statelessness, cacheable responses — and where it hurts: conditional requests and max-age that cut origin load by an order of magnitude, versus N+1 request chains and over-fetching.',
  minutes: 13,
  level: 'Beginner',
  metrics: [
    { key: 'origin', label: 'Requests reaching the origin', icon: 'server' },
    { key: 'bw', label: 'Origin bandwidth: no caching → with cache + ETag', icon: 'gauge' },
    { key: 'chatty', label: 'Page load: N+1 calls vs one embedded call', icon: 'clock' },
    { key: 'waste', label: 'Bytes fetched but not used', icon: 'alert' },
  ],
  goals: [
    { text: 'Resources, URIs and representations', step: 1 },
    { text: 'Verbs, safety, idempotency and status codes', step: 2 },
    { text: 'Statelessness and scaling out', step: 3 },
    { text: 'HTTP caching: max-age and conditional requests', step: 4 },
    { text: 'Chatty clients, over-fetching and evolution', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'GET requests per second', min: 100, max: 1000000, step: 100, default: 5000, unit: '/s', description: 'Read traffic for a resource type.' },
      { key: 'kb', label: 'Response size', min: 1, max: 1000, step: 1, default: 20, unit: ' KB', description: 'Full representation size.' },
      { key: 'hit', label: 'Served by browser/CDN cache (max-age)', min: 0, max: 99, step: 1, default: 60, unit: '%', description: 'Requests never reaching the origin.' },
      { key: 'same', label: 'Revalidations where the resource is unchanged', min: 0, max: 100, step: 1, default: 85, unit: '%', description: 'Share answered with 304 Not Modified.' },
      { key: 'n', label: 'Related items needing a detail call', min: 0, max: 100, step: 1, default: 20, unit: '', description: 'Items in a list, each fetched by id (N).' },
      { key: 'rtt', label: 'Network round trip', min: 5, max: 500, step: 5, default: 60, unit: ' ms', description: 'Client to API round trip.' },
      { key: 'srv', label: 'Server time per call', min: 1, max: 200, step: 1, default: 15, unit: ' ms', description: 'Fixed server cost of one request.' },
      { key: 'item', label: 'Extra server time per embedded item', min: 0.1, max: 20, step: 0.1, default: 0.5, unit: ' ms', description: 'Marginal cost when items are embedded in one response.' },
      { key: 'used', label: 'Fields the client uses', min: 1, max: 100, step: 1, default: 5, unit: '', description: 'Fields actually rendered.' },
      { key: 'total', label: 'Fields in the representation', min: 1, max: 200, step: 1, default: 40, unit: '', description: 'Fields in the response.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 5000);
      const bytes = Math.max(1, input.kb ?? 20) * 1000;
      const hit = Math.min(0.999, Math.max(0, (input.hit ?? 60) / 100));
      const same = Math.min(1, Math.max(0, (input.same ?? 85) / 100));
      const n = Math.max(0, Math.round(input.n ?? 20));
      const rtt = Math.max(1, input.rtt ?? 60);
      const srv = Math.max(0, input.srv ?? 15);
      const item = Math.max(0, input.item ?? 0.5);
      const used = Math.max(1, input.used ?? 5);
      const total = Math.max(used, input.total ?? 40);
      const origin = rps * (1 - hit);
      const base = rps * bytes;
      // 304 responses carry headers only (~400 B); changed resources are sent in full.
      const withCache = origin * (same * 400 + (1 - same) * bytes);
      const serial = (1 + n) * (rtt + srv);
      const embedded = rtt + srv + n * item;
      return {
        origin: step < 4 ? { v: '—' } : { v: `${fmtN(origin)}/s of ${fmtN(rps)}/s (${((1 - hit) * 100).toFixed(0)}%)`, tone: hit > 0.5 ? 'good' : 'warn' },
        bw: step < 4 ? { v: '—' } : { v: `${fmtBw(base)} → ${fmtBw(withCache)} (${((1 - withCache / base) * 100).toFixed(0)}% less)`, tone: withCache < base * 0.2 ? 'good' : 'warn' },
        chatty: step < 5 ? { v: '—' } : { v: `${Math.round(serial)} ms (${1 + n} calls) vs ${Math.round(embedded)} ms (1 call)`, tone: serial < 300 ? 'good' : serial < 1000 ? 'warn' : 'bad' },
        waste: step < 5 ? { v: '—' } : { v: `${((1 - used / total) * 100).toFixed(0)}% (${used} of ${total} fields)`, tone: used / total > 0.5 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Resources',
      kind: 'insight',
      title: 'Everything is a resource with an address',
      body: [
        '<b>REST</b> (Representational State Transfer, Fielding’s 2000 dissertation) describes the architectural style of the web itself. The central idea: model the system as <b>resources</b> — nouns such as an order, a user, a collection of invoices — each identified by a <b>URI</b> (<code>/orders/8123</code>, <code>/users/17/orders</code>). A client never touches the resource directly; it exchanges <b>representations</b> (JSON, HTML, protobuf) of its state, chosen by content negotiation (<code>Accept</code> header).',
        'Good URIs name things, not actions: <code>POST /orders</code> rather than <code>/createOrder</code>; nesting expresses ownership (<code>/orders/8123/items</code>) but should stay shallow; collections are plural; identifiers are opaque and stable. The interface is the <b>uniform</b> HTTP vocabulary — a small, shared set of verbs and status codes — so generic tools (browsers, proxies, caches, gateways, SDK generators) work without knowing your domain. That generality is the main thing REST buys.',
      ],
      scene: { nodes: [client(), api({ tag: pill('/orders · /orders/8123 · /users/17', 'link') }), store(), res('r1', -8, 'order 8123'), res('r2', 8, 'user 17')], links: [link('client', 'api'), link('api', 'store'), link('store', 'r1'), link('store', 'r2')], flows: [flow(['client', 'api', 'store'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Verbs',
      kind: 'technique',
      title: 'Verbs, safety, idempotency and status codes',
      body: [
        'HTTP methods carry <b>semantics that intermediaries rely on</b>. <code>GET</code> is <b>safe</b> (no state change) and cacheable. <code>PUT</code> (replace) and <code>DELETE</code> are <b>idempotent</b> — repeating them leaves the same state, so a client can retry after a timeout without fear. <code>POST</code> (create / do something) is neither, so a retried POST may create a duplicate — protect it with an <b><code>Idempotency-Key</code></b> header (see the Idempotency lesson). <code>PATCH</code> applies a partial change and is idempotent only if you design it so (set a field, don’t increment it).',
        'Status codes tell clients what to do without reading the body: <b>200/201/204</b> success (201 with a <code>Location</code> header on create), <b>301/304</b> redirect / not modified, <b>400</b> malformed, <b>401</b> unauthenticated, <b>403</b> forbidden, <b>404</b> missing, <b>409</b> conflict (version mismatch), <b>422</b> validation, <b>429</b> rate limited (with <code>Retry-After</code>), <b>5xx</b> server error (safe to retry idempotent calls, with backoff). Return a consistent <b>error body</b> (RFC 9457 <code>application/problem+json</code>) and never signal errors with 200.',
      ],
      changes: [{ text: 'GET safe + cacheable; PUT/DELETE idempotent', tone: 'good' }, { text: 'POST needs an Idempotency-Key to be retry-safe', tone: 'info' }, { text: 'Use real status codes and a problem+json body', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('GET · PUT · DELETE · POST', 'list') }), api({ tag: pill('201 + Location · 409 · 429', 'check') }), store()], links: [link('client', 'api'), link('api', 'store')], flows: [flow(['client', 'api', 'store'], { kind: 'write', rate: 1.4, back: true })] },
    },
    {
      short: 'Stateless',
      kind: 'technique',
      title: 'Statelessness: any server can serve any request',
      body: [
        'Each request carries <b>everything needed to process it</b> — credentials (a bearer token, not a server-side session), the resource id, the parameters. The server stores no conversational state between requests. The payoff is operational: a load balancer can send consecutive requests to different servers, you add or remove instances freely (see the Load Balancer and Autoscaling lessons), a crashed server loses nothing, and caches can store responses keyed by URL.',
        'The price is bytes (headers and tokens repeated on every call) and <b>work pushed to the client</b>: pagination cursors, upload progress and multi-step flows must keep their state in the client or in a shared store keyed by an id the client supplies. Long-running operations follow the <b>asynchronous resource pattern</b>: <code>POST /exports</code> returns <code>202 Accepted</code> with a <code>Location: /exports/55</code>; the client polls that resource (or receives a webhook) until it reports <code>done</code> with a link to the result.',
      ],
      changes: [{ text: 'No server-side session: scale out, survive crashes, cache by URL', tone: 'good' }, { text: 'Long jobs: 202 + status resource', tone: 'info' }],
      scene: { nodes: [client(), box('lb', -9, 0, 'Load balancer', 'purple', 'route', { size: [1.3, 1.3], height: 22 }), api({ name: 'Any of N servers', tag: pill('token in every request', 'key') }), store()], links: [link('client', 'lb'), link('lb', 'api'), link('api', 'store')], flows: [flow(['client', 'lb', 'api', 'store'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Caching',
      kind: 'technique',
      title: 'HTTP caching: max-age and conditional requests',
      body: [
        'Because GETs are safe and URLs are identifiers, HTTP’s own caches (browser, CDN, reverse proxy) can answer for you. <code>Cache-Control: max-age=60</code> lets any cache serve the response for 60 seconds without asking. When it expires, the cache sends a <b>conditional request</b> (<code>If-None-Match: "v17"</code> using the response’s <code>ETag</code>, or <code>If-Modified-Since</code>); if nothing changed the origin replies <b><code>304 Not Modified</code></b> with <i>no body</i>. <code>Vary</code> says which request headers change the representation; <code>private</code> vs <code>public</code> says whether shared caches may store it; <code>stale-while-revalidate</code> hides revalidation latency.',
        'Numbers: 5,000 GET/s of 20 KB responses is <b>100 MB/s</b> with no caching. If 60% are served by max-age, 2,000/s reach the origin; of those 85% are 304s (~400 bytes) and 15% full responses: 2,000 × (0.85 × 0.4 KB + 0.15 × 20 KB) = <b>6.7 MB/s — 93% less</b> bandwidth and 60% fewer requests to compute. Use <b>strong ETags</b> derived from a version or content hash, <b>immutable</b> versioned URLs for static assets, and invalidate by changing the URL or by short max-age plus revalidation.',
      ],
      changes: [{ text: 'max-age: 60% never reach the origin', tone: 'good' }, { text: '304 Not Modified: revalidate with no body', tone: 'good' }, { text: '100 MB/s → 6.7 MB/s (−93%)', tone: 'good' }],
      concepts: [{ term: 'ETag', def: 'An opaque version tag for a representation; clients send it back in If-None-Match so the server can answer 304 when nothing changed.' }],
      scene: { nodes: [client(), cdn({ tag: pill('max-age 60 · ETag v17', 'timer', 'good') }), api({ tag: pill('304 or 200', 'check') }), store()], links: [link('client', 'cdn'), link('cdn', 'api'), link('api', 'store')], flows: [flow(['client', 'cdn'], { rate: 2.4, back: true }), flow(['cdn', 'api', 'store'], { rate: 0.8, back: true })] },
    },
    {
      short: 'Chatty',
      kind: 'problem',
      title: 'Chatty clients, over-fetching and evolving the API',
      body: [
        'Resource-per-URL design invites the <b>N+1 pattern</b>: fetch a list of 20 orders, then <code>GET /orders/{id}</code> for each. Even with a fast server (15 ms) and a 60 ms round trip, <b>21 serial calls take 21 × 75 = 1,575 ms</b>; a single call that embeds the items takes 60 + 15 + 20 × 0.5 = <b>85 ms</b>. Fixes: <b>embedding/expansion</b> (<code>?include=items</code>, <code>?expand=customer</code>), <b>compound endpoints</b> for known screens, HTTP/2 multiplexing (parallel calls, though each still costs server work), or a different style where clients shape queries (GraphQL — see that lesson — or gRPC streaming).',
        'The opposite problem is <b>over-fetching</b>: a 40-field representation when the screen shows 5 wastes about 88% of the bytes; offer sparse fieldsets (<code>?fields=id,total</code>) or purpose-built representations. For <b>evolution</b>: add fields and endpoints without breaking clients (additive changes only), version deliberately (<code>/v2</code> or a media-type version) when you must, publish a deprecation policy with <code>Sunset</code> headers, paginate every collection from day one with cursors (see the Pagination lesson), and describe the API in OpenAPI so docs, SDKs, mocks and contract tests come from one source. Figures here are model outputs.',
      ],
      changes: [{ text: '21 serial calls ≈ 1,575 ms vs 1 embedded call ≈ 85 ms', tone: 'bad' }, { text: 'Sparse fieldsets and expansion; paginate from day one', tone: 'good' }, { text: 'Additive evolution; OpenAPI as the single source', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('1 list + 20 detail GETs', 'alert', 'warn') }), api({ state: 'hot', tag: pill('21 round trips', 'clock', 'warn') }), store()], links: [link('client', 'api'), link('api', 'store')], flows: [flow(['client', 'api'], { kind: 'heavy', rate: 3, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Uniform, stateless, cacheable — and mind the round trips',
      body: [
        '<b>REST</b> models resources with URIs, uses HTTP’s uniform verbs and status codes (safe GET, idempotent PUT/DELETE, keyed POST), keeps servers <b>stateless</b>, and lets standard <b>HTTP caches</b> cut origin load by an order of magnitude with max-age and ETags.',
        'Watch for N+1 chatter and over-fetching, offer expansion and sparse fields, and evolve additively with an OpenAPI contract.',
      ],
      scene: { nodes: [client(), cdn(), api(), store()], links: [link('client', 'cdn'), link('cdn', 'api'), link('api', 'store')], flows: [flow(['client', 'cdn', 'api', 'store'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
