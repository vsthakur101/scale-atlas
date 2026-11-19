import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -15, 0, 10, 'clients', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -6, 0, 'L4 load balancer', 'orange', 'route', { size: [1.3, 1.3], height: 26, ...extra });
const srv = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`s${i}`, 6, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB/s` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB/s` : `${Math.round(b / 1e3)} KB/s`);

const lesson: Lesson = {
  slug: 'source-how-does-grpc-work',
  title: 'How gRPC Works',
  blurb: 'Protobuf contracts over HTTP/2: compact messages, four call types, deadlines — and the long-lived connections that quietly break naive load balancing.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'json', label: 'JSON bandwidth', icon: 'activity' },
    { key: 'pb', label: 'Protobuf bandwidth', icon: 'activity' },
    { key: 'busiest', label: 'Busiest server (connections vs average)', icon: 'alert' },
  ],
  goals: [
    { text: 'The contract-first model and generated code', step: 1 },
    { text: 'Protobuf encoding and why it is compact', step: 2 },
    { text: 'The four call types and HTTP/2 streams', step: 3 },
    { text: 'Deadlines, cancellation and error codes', step: 4 },
    { text: 'Load balancing long-lived connections', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Calls per second', min: 100, max: 1000000, step: 100, default: 50000, unit: '/s', description: 'Request rate (each with a response of similar size).' },
      { key: 'json', label: 'Message size as JSON', min: 100, max: 100000, step: 100, default: 1000, unit: ' B', description: 'Size of a typical message serialized as JSON.' },
      { key: 'ratio', label: 'Protobuf size relative to JSON', min: 10, max: 100, step: 1, default: 35, unit: '%', description: 'Typical protobuf messages are 30–50% of the JSON size (varies by content).' },
      { key: 'conns', label: 'Client connections', min: 10, max: 100000, step: 10, default: 200, unit: '', description: 'Long-lived HTTP/2 connections, each pinned to one server.' },
      { key: 'servers', label: 'Servers', min: 2, max: 500, step: 1, default: 20, unit: '', description: 'Backends behind the L4 load balancer.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 5e4);
      const json = Math.max(1, input.json ?? 1000);
      const ratio = Math.min(1, Math.max(0.05, (input.ratio ?? 35) / 100));
      const conns = Math.max(1, Math.round(input.conns ?? 200));
      const srv = Math.max(2, Math.round(input.servers ?? 20));
      const mu = conns / srv;
      // Connections land on servers at connect time; balls-into-bins approximation for the busiest.
      const maxLoad = mu + Math.sqrt(2 * mu * Math.log(srv));
      return {
        json: step < 2 ? { v: '—' } : { v: fmtB(rps * json * 2) },
        pb: step < 2 ? { v: '—' } : { v: `${fmtB(rps * json * ratio * 2)} (${Math.round((1 - ratio) * 100)}% less)`, tone: 'good' },
        busiest: step < 5 ? { v: '—' } : { v: `~${Math.round(maxLoad)} vs ${mu.toFixed(0)} (+${(((maxLoad - mu) / mu) * 100).toFixed(0)}%)`, tone: (maxLoad - mu) / mu < 0.2 ? 'good' : (maxLoad - mu) / mu < 0.5 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Contract',
      kind: 'technique',
      title: 'Define the service once, generate the rest',
      body: [
        'gRPC is <b>contract-first</b>. You describe services and messages in a <code>.proto</code> file — <code>service Orders { rpc Get(GetReq) returns (Order); }</code> — and the compiler generates <b>client stubs and server skeletons</b> in each language. A call looks like a local function; serialization, transport, retries and typing are handled for you, and every client agrees on the exact types.',
        'The schema is the API documentation and the compatibility boundary: protobuf rules (never reuse field numbers; add, don’t change, types) let services and clients evolve independently — an old client still parses a new server’s response and vice versa.',
      ],
      scene: { nodes: [box('proto', -10, 0, '.proto contract', 'green', 'file', { size: [1.4, 1.4], height: 24 }), box('cl', 0, -5, 'Generated client', 'blue', 'cpu', { size: [1.2, 1.2], height: 22 }), box('sv', 0, 5, 'Generated server', 'blue', 'server', { size: [1.2, 1.2], height: 22 })], links: [link('proto', 'cl', { arrow: 'end' }), link('proto', 'sv', { arrow: 'end' }), link('cl', 'sv', { arrow: 'both' })], flows: [flow(['cl', 'sv'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Protobuf',
      kind: 'technique',
      title: 'Why protobuf is small and fast',
      body: [
        'JSON repeats field names in every message and writes numbers as text. <b>Protocol Buffers</b> encode each field as a <b>tag (field number + wire type)</b> followed by its value; integers use <b>varints</b> (1 byte for values below 128), strings are length-prefixed, and absent fields cost nothing. No field names on the wire, no quotes, no whitespace.',
        'Typical messages shrink to 30–50% of their JSON size and parse several times faster, since decoding is direct offset arithmetic rather than text scanning. At 50,000 calls/s with 1 KB JSON messages in each direction that is ~100 MB/s of JSON against ~35 MB/s of protobuf. The cost: messages aren’t human-readable on the wire (use tools like <code>grpcurl</code>, or reflection).',
      ],
      changes: [{ text: 'Tag + varint/length-prefixed values; no field names', tone: 'good' }, { text: '≈ 35% of the JSON size, faster to parse', tone: 'good' }],
      scene: { nodes: [box('j', -8, 0, 'JSON: {"id":42,"name":"…"}', 'red', 'file', { size: [1.5, 1.5], height: 26, tag: pill('1,000 B', 'file', 'warn') }), box('p', 8, 0, 'Protobuf: tag·varint·len', 'green', 'file', { size: [1.2, 1.2], height: 14, tag: pill('350 B', 'check', 'good') })], links: [link('j', 'p', { arrow: 'end' })], flows: [flow(['j', 'p'], { rate: 1 })] },
    },
    {
      short: 'Streams',
      kind: 'technique',
      title: 'Four call types on HTTP/2',
      body: [
        'gRPC runs on <b>HTTP/2</b>: each call is a <b>stream</b> multiplexed on a shared connection (no head-of-line blocking between calls at the HTTP layer; header compression; binary framing). Four shapes: <b>unary</b> (one request, one response), <b>server streaming</b> (one request, a stream of responses — a feed), <b>client streaming</b> (a stream of requests, one response — an upload) and <b>bidirectional streaming</b> (both sides send independently — chat, telemetry).',
        'Streaming is built in with flow control, so a slow consumer applies backpressure instead of exhausting memory. It also makes gRPC a natural fit for service-to-service traffic; browsers need <b>gRPC-Web</b> or a gateway because they can’t control HTTP/2 framing directly.',
      ],
      changes: [{ text: 'Unary · server-stream · client-stream · bidirectional', tone: 'info' }, { text: 'Browsers: gRPC-Web or an HTTP/JSON gateway', tone: 'info' }],
      scene: { nodes: [box('cl', -9, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24 }), box('conn', 0, 0, 'One HTTP/2 connection', 'teal', 'layers', { size: [2.6, 1.4], height: 16, tag: pill('many concurrent streams', 'layers') }), box('sv', 10, 0, 'Server', 'blue', 'server', { size: [1.2, 1.2], height: 26 })], links: [link('cl', 'conn', { arrow: 'both' }), link('conn', 'sv', { arrow: 'both' })], flows: [flow(['cl', 'conn', 'sv'], { rate: 2.5, back: true })] },
    },
    {
      short: 'Deadlines',
      kind: 'technique',
      title: 'Deadlines, cancellation and status codes',
      body: [
        'Every call should carry a <b>deadline</b> (an absolute time the answer is no longer useful). It is sent to the server and <b>propagates</b> through downstream calls, so a chain of services shares one time budget and stops working on requests whose caller has already given up. <b>Cancellation</b> propagates too: when the client cancels or disconnects, handlers stop and free resources.',
        'Errors use a small set of <b>status codes</b> — <code>OK</code>, <code>INVALID_ARGUMENT</code>, <code>DEADLINE_EXCEEDED</code>, <code>UNAVAILABLE</code> (retryable), <code>NOT_FOUND</code>, <code>PERMISSION_DENIED</code>… — plus optional rich details. Retries (with backoff and hedging) apply to idempotent calls and <code>UNAVAILABLE</code>; set a retry budget, as in the timeouts and retries lesson.',
      ],
      changes: [{ text: 'Deadline propagates across the call chain', tone: 'good' }, { text: 'UNAVAILABLE is retryable; others usually are not', tone: 'info' }],
      scene: { nodes: [box('a', -10, 0, 'A: deadline 300 ms', 'green', 'clock', { size: [1.3, 1.3], height: 22 }), box('b', 0, 0, 'B: 220 ms left', 'blue', 'clock', { size: [1.3, 1.3], height: 22 }), box('c', 10, 0, 'C: 120 ms left', 'orange', 'clock', { size: [1.3, 1.3], height: 22, tag: pill('cancelled if A gave up', 'alert', 'warn') })], links: [link('a', 'b', { arrow: 'end' }), link('b', 'c', { arrow: 'end' })], flows: [flow(['a', 'b', 'c'], { rate: 1.5 })] },
    },
    {
      short: 'Balancing',
      kind: 'problem',
      title: 'Long-lived connections defeat connection-level balancing',
      body: [
        'HTTP/2 connections are long-lived and carry many calls. An <b>L4 load balancer</b> chooses a backend <i>per connection</i> and then every call on that connection goes to the same server — so balance depends on how connections were distributed <i>when they were opened</i>. With 200 client connections over 20 servers (average 10), random placement leaves the busiest around <b>10 + √(2 × 10 × ln 20) ≈ 18 connections (+77%)</b>, and one busy client can dominate a server. New servers added during scale-out receive nothing because existing connections stay put.',
        'Fixes: an <b>L7 / gRPC-aware proxy</b> (Envoy, a service mesh) that balances per <i>call</i>; <b>client-side load balancing</b> with service discovery (the client holds connections to all servers and picks per call, e.g. round robin or two-choices); and <b>max connection age</b> so connections are recycled and rebalance over time.',
      ],
      changes: [{ text: 'L4 balances connections, not calls', tone: 'bad' }, { text: 'L7 proxy · client-side LB · max connection age', tone: 'good' }],
      scene: { nodes: [clients(), lb({ tag: pill('per connection', 'hash') }), srv(0, 3, 'Server 1', { load: 95, state: 'hot' }), srv(1, 3, 'Server 2', { load: 30 }), srv(2, 3, 'Server 3', { load: 25 })], links: [link('clients', 'lb'), link('lb', 's0'), link('lb', 's1'), link('lb', 's2')], flows: [flow(['clients', 'lb', 's0'], { kind: 'heavy', rate: 3 }), flow(['clients', 'lb', 's1'], { rate: 0.8 }), flow(['clients', 'lb', 's2'], { rate: 0.6 })] },
    },
    {
      short: 'When',
      kind: 'tradeoff',
      title: 'When to choose gRPC',
      body: [
        '<b>Strong fit</b>: internal service-to-service calls, polyglot back ends, streaming, latency- and bandwidth-sensitive paths, strict contracts. <b>Weaker fit</b>: public APIs consumed by browsers and third parties (REST/JSON is easier to explore, cache and debug), simple CRUD where HTTP caching helps, and teams without tooling for proto management and versioning.',
        'Operationally plan for: schema registry and breaking-change checks in CI, a mesh or proxy for balancing and observability, TLS/mTLS between services, and error-status conventions. Figures here are illustrative model outputs: actual message-size savings depend on the data.',
      ],
      scene: { nodes: [box('g', -8, 0, 'gRPC: internal, streaming, strict', 'green', 'bolt', { size: [1.5, 1.5], height: 26 }), box('r', 8, 0, 'REST/JSON: public, cacheable', 'blue', 'globe', { size: [1.5, 1.5], height: 26 })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Contracts, compact messages, multiplexed streams',
      body: [
        'gRPC = <b>protobuf schemas</b> (generated clients/servers, compact binary messages) over <b>HTTP/2</b> (multiplexed streams, four call types), with <b>deadlines</b> and <b>status codes</b> built in. Balance per <i>call</i> (L7 or client-side), not per connection, and recycle long-lived connections.',
        'Use it between services; put a gateway in front for browsers and public consumers.',
      ],
      scene: { nodes: [box('cl', -9, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24 }), box('conn', 0, 0, 'HTTP/2 + protobuf', 'teal', 'layers', { size: [2.2, 1.4], height: 16 }), box('sv', 10, 0, 'Server', 'blue', 'server', { size: [1.2, 1.2], height: 26 })], links: [link('cl', 'conn', { arrow: 'both' }), link('conn', 'sv', { arrow: 'both' })], flows: [flow(['cl', 'conn', 'sv'], { rate: 2.5, back: true })] },
    },
  ],
};

export default lesson;
