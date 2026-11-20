import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -17, 0, 10, 'clients (web, mobile, partners)', extra);
const gw = (extra: Partial<SceneNode> = {}) => box('gw', -8, 0, 'API gateway', 'purple', 'route', { size: [1.6, 1.6], height: 34, ...extra });
const svc = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`s${i}`, 4, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });

const fmtMs = (ms: number): string => `${Math.round(ms)} ms`;
const fmtN = (n: number): string => (n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-what-does-an-api-gateway-do',
  title: 'What an API Gateway Does',
  blurb: 'One front door for many services: routing, authentication, rate limiting, caching and aggregation — and the latency and capacity arithmetic of putting a hop in front of everything.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'direct', label: 'Client calls each service itself', icon: 'clock' },
    { key: 'agg', label: 'Via gateway aggregation', icon: 'check' },
    { key: 'hop', label: 'Latency added to a simple pass-through', icon: 'alert' },
    { key: 'inst', label: 'Gateway instances needed', icon: 'server' },
  ],
  goals: [
    { text: 'The problem a gateway solves for clients and services', step: 1 },
    { text: 'Routing and protocol translation', step: 2 },
    { text: 'Cross-cutting concerns: auth, limits, caching, observability', step: 3 },
    { text: 'Aggregation: fewer round trips for mobile clients', step: 4 },
    { text: 'Risks: bottleneck, single point of failure, logic creep', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'calls', label: 'Backend services behind one screen', min: 1, max: 15, step: 1, default: 4, unit: '', description: 'Services a client would call to render one view.' },
      { key: 'rtt', label: 'Client ↔ edge round trip', min: 5, max: 500, step: 5, default: 80, unit: ' ms', description: 'Mobile or internet latency from the client.' },
      { key: 'svc', label: 'Service latency', min: 1, max: 500, step: 1, default: 40, unit: ' ms', description: 'Typical backend processing time per call.' },
      { key: 'int', label: 'Internal network hop', min: 0.1, max: 20, step: 0.1, default: 1, unit: ' ms', description: 'Round trip inside the datacentre.' },
      { key: 'gwms', label: 'Gateway processing per request', min: 0.1, max: 50, step: 0.1, default: 2, unit: ' ms', description: 'Auth check, routing, rate-limit lookup, logging.' },
      { key: 'rps', label: 'Requests per second', min: 100, max: 5000000, step: 100, default: 100000, unit: '/s', description: 'Peak client request rate.' },
      { key: 'cap', label: 'Requests per gateway instance', min: 500, max: 100000, step: 500, default: 8000, unit: '/s', description: 'Throughput one instance sustains with its plugins.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.calls ?? 4));
      const rtt = Math.max(1, input.rtt ?? 80);
      const svc = Math.max(0, input.svc ?? 40);
      const int = Math.max(0, input.int ?? 1);
      const gwms = Math.max(0, input.gwms ?? 2);
      const rps = Math.max(1, input.rps ?? 1e5);
      const cap = Math.max(1, input.cap ?? 8000);
      // Direct: the client pays a full round trip per service, one after another.
      const direct = n * (rtt + svc);
      // Gateway: one client round trip, then parallel calls inside the datacentre; the slowest sets the time.
      const agg = rtt + gwms + int + svc;
      const hop = gwms + int;
      return {
        direct: step < 3 ? { v: '—' } : { v: fmtMs(direct), tone: direct > 400 ? 'bad' : 'warn' },
        agg: step < 3 ? { v: '—' } : { v: `${fmtMs(agg)} (${(direct / agg).toFixed(1)}× faster)`, tone: 'good' },
        hop: step < 2 ? { v: '—' } : { v: `+${hop.toFixed(1)} ms`, tone: hop < 5 ? 'good' : 'warn' },
        inst: step < 4 ? { v: '—' } : { v: `${fmtN(Math.max(2, Math.ceil(rps / (cap * 0.6))))} (at 60% utilisation, N+1 spread across zones)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The problem',
      kind: 'problem',
      title: 'Clients shouldn’t know your service map',
      body: [
        'With a dozen microservices, clients that call each one directly must know every address, authenticate with each, handle each one’s errors and versions, and make many round trips over slow mobile networks. Every service in turn must re-implement TLS, authentication, rate limiting and logging, and any internal refactoring (splitting or merging a service) breaks clients.',
        'An <b>API gateway</b> is a single entry point in front of the services: clients talk to <i>one</i> address and API; the gateway routes, secures and shapes traffic. It is the “front door” — related to, but different from, a plain <b>reverse proxy</b> (forwards requests) and a <b>load balancer</b> (spreads them): a gateway adds API-aware policy and composition on top.',
      ],
      scene: { nodes: [clients(), gw({ tag: pill('one front door', 'check', 'good') }), svc(0, 3, 'Orders'), svc(1, 3, 'Users'), svc(2, 3, 'Catalog')], links: [link('clients', 'gw'), link('gw', 's0'), link('gw', 's1'), link('gw', 's2')], flows: [flow(['clients', 'gw', 's1'], { rate: 1.5 })] },
    },
    {
      short: 'Routing',
      kind: 'technique',
      title: 'Routing and protocol translation',
      body: [
        'The gateway matches each request — by path (<code>/orders/*</code>), host, method, header or version — and <b>routes</b> it to the right upstream service, possibly rewriting the URL. This <b>decouples the public API from the internal topology</b>: a service can be split, moved or replaced, and the route updated, without any client change. Canary and blue/green releases are weighted routes (5% to the new version).',
        'It can also <b>translate protocols</b>: REST/JSON from clients to gRPC internally (see that lesson), WebSocket or SSE termination, SOAP façades for legacy systems, GraphQL in front of REST. Terminating <b>TLS</b> once at the edge keeps certificates in one place. The cost of all of this is one extra hop — about <b>3 ms</b> here (2 ms of gateway work plus a 1 ms internal hop) — usually small against internet latency.',
      ],
      changes: [{ text: 'Route by path, host, header, version; weighted canaries', tone: 'good' }, { text: 'REST ↔ gRPC, TLS termination at the edge', tone: 'good' }, { text: 'Cost: ~3 ms for the extra hop', tone: 'info' }],
      scene: { nodes: [clients(), gw({ tag: pill('/orders → orders-v2 (5%)', 'route') }), svc(0, 2, 'orders v1'), svc(1, 2, 'orders v2', { tag: pill('canary', 'check') })], links: [link('clients', 'gw'), link('gw', 's0'), link('gw', 's1', { style: 'dashed' })], flows: [flow(['clients', 'gw', 's0'], { rate: 2 }), flow(['gw', 's1'], { rate: 0.4 })] },
    },
    {
      short: 'Policies',
      kind: 'technique',
      title: 'Cross-cutting concerns in one place',
      body: [
        '<b>Authentication and authorisation</b>: validate API keys, session cookies or OAuth/JWT tokens once at the edge (see those lessons) and pass a verified identity downstream — services trust the gateway rather than each parsing credentials. <b>Rate limiting and quotas</b> per key or plan (see the Rate Limiters lesson); <b>request validation</b> against an OpenAPI schema; <b>CORS</b>; <b>IP allow/deny</b> and WAF integration.',
        '<b>Response caching</b> for cacheable GETs (a hit never reaches the service), <b>compression</b>, <b>retries and timeouts</b> with circuit breakers, and <b>observability</b>: access logs, metrics and trace-id injection for every call. Centralising them gives consistency and one place to change policy — but also concentrates risk, so keep the policy chain fast (each plugin adds latency) and well tested.',
      ],
      changes: [{ text: 'Auth, limits, validation, caching, tracing: once, at the edge', tone: 'good' }, { text: 'Every plugin adds latency; keep the chain short', tone: 'info' }],
      scene: { nodes: [clients(), gw({ tag: pill('auth · limits · cache · trace', 'shield', 'good') }), svc(0, 2, 'Service A'), svc(1, 2, 'Service B')], links: [link('clients', 'gw'), link('gw', 's0'), link('gw', 's1')], flows: [flow(['clients', 'gw', 's0'], { rate: 2 })] },
    },
    {
      short: 'Aggregation',
      kind: 'technique',
      title: 'Aggregation: one round trip instead of many',
      body: [
        'A mobile home screen needs data from four services. Called directly, the client makes four sequential round trips over a slow link: 4 × (80 ms network + 40 ms service) = <b>480 ms</b>. The gateway (or a <b>backend-for-frontend</b>, BFF, one per client type) accepts <b>one</b> request, <b>fans out in parallel</b> inside the fast datacentre network, merges the results into the shape that screen needs, and returns it: 80 + 2 + 1 + 40 = <b>~123 ms</b>, <b>3.9× faster</b>, with less radio use and battery drain.',
        'The same layer can <b>shape responses</b> (strip fields a client doesn’t need, adapt formats for different devices) and tolerate partial failure (return the screen without the recommendations if that service times out). The risk is <b>logic creep</b>: orchestration, business rules and data joins accumulate in the gateway until it is a hidden monolith owned by no one — keep aggregation thin, and put real business logic in services (see Orchestration vs Choreography).',
      ],
      changes: [{ text: 'Direct: 4 × (80 + 40) = 480 ms · gateway: ~123 ms', tone: 'good' }, { text: 'BFF per client type; tolerate partial failure', tone: 'good' }, { text: 'Keep business logic out of the gateway', tone: 'bad' }],
      scene: { nodes: [clients({ tag: pill('1 request', 'bolt') }), gw({ tag: pill('fan out in parallel, merge', 'layers', 'good') }), svc(0, 4, 'Profile'), svc(1, 4, 'Orders'), svc(2, 4, 'Recommendations'), svc(3, 4, 'Notifications')], links: [link('clients', 'gw'), link('gw', 's0'), link('gw', 's1'), link('gw', 's2'), link('gw', 's3')], flows: [flow(['clients', 'gw', 's0'], { rate: 1.5 }), flow(['gw', 's1'], { rate: 1.5 }), flow(['gw', 's2'], { rate: 1.5 }), flow(['gw', 's3'], { rate: 1.5 })] },
    },
    {
      short: 'Risks',
      kind: 'problem',
      title: 'A bottleneck, a single point of failure, a deployment choke point',
      body: [
        'Everything flows through it, so the gateway must be <b>horizontally scaled and highly available</b>: at 100,000 requests/s and 8,000 per instance at 60% utilisation you need ~21 instances spread across zones, with health checks and an N+1 margin; a gateway outage is a total outage. It is a <b>shared dependency for every team</b> — a slow plugin or a bad route change can hurt every API — so roll out config progressively, test policies in staging, and isolate noisy tenants (per-route concurrency limits, separate gateway clusters for critical vs bulk traffic).',
        'Alternatives and neighbours: in a <b>service mesh</b> sidecars handle service-to-service policy while the gateway handles north–south traffic; managed gateways (cloud API gateways) trade control for operations; and for very simple needs a reverse proxy suffices. Choose the lightest thing that provides the policies you actually need. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: '100k req/s ÷ (8k × 60%) ≈ 21 instances across zones', tone: 'info' }, { text: 'Progressive config rollout; isolate noisy tenants', tone: 'good' }],
      scene: { nodes: [clients(), gw({ state: 'hot', tag: pill('every request passes here', 'alert', 'warn') }), svc(0, 2, 'Service A'), svc(1, 2, 'Service B')], links: [link('clients', 'gw'), link('gw', 's0'), link('gw', 's1')], flows: [flow(['clients', 'gw', 's0'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'One front door, thin and well-guarded',
      body: [
        'An API gateway <b>routes, secures and shapes</b> traffic at the edge: decouples clients from topology, centralises auth, limits, caching and tracing, translates protocols, and aggregates calls (480 ms → ~123 ms for four services over a mobile link).',
        'Run it as a scaled, redundant, progressively-deployed tier; keep it thin; and don’t let business logic migrate into it.',
      ],
      scene: { nodes: [clients(), gw(), svc(0, 3, 'Service'), svc(1, 3, 'Service'), svc(2, 3, 'Service')], links: [link('clients', 'gw'), link('gw', 's0'), link('gw', 's1'), link('gw', 's2')], flows: [flow(['clients', 'gw', 's1'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
