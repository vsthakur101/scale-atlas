import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const br = (extra: Partial<SceneNode> = {}) => box('br', -18, 0, 'Browser', 'teal', 'globe', { size: [1.5, 1.5], height: 26, ...extra });
const dns = (extra: Partial<SceneNode> = {}) => box('dns', -9, -8, 'DNS resolver', 'purple', 'search', { size: [1.4, 1.4], height: 22, ...extra });
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', -4, 0, 'CDN edge / load balancer', 'blue', 'cloud', { size: [1.5, 1.5], height: 24, ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', 6, 0, 'Application server', 'orange', 'server', { size: [1.7, 1.7], height: 30, ...extra });
const data = (extra: Partial<SceneNode> = {}) => db('data', 15, 0, 'Database / cache', { size: [1.5, 1.5], ...extra });
const render = (extra: Partial<SceneNode> = {}) => box('render', -9, 8, 'Render pipeline: DOM · CSSOM · layout · paint', 'green', 'layers', { size: [1.7, 1.5], height: 26, ...extra });

const fmtMs = (ms: number): string => `${Math.round(ms)} ms`;

const lesson: Lesson = {
  slug: 'source-what-happens-when-you-type-a-url-into-your-browser',
  title: 'From URL to Pixels: DNS, TCP, TLS, HTTP and Rendering in One Latency Budget',
  blurb: 'Follow one page load end to end — URL parsing, DNS, connection setup, the request, parsing and rendering — with a millisecond budget for each stage, what changes when everything is warm, and what HTTP/3 saves.',
  minutes: 14,
  level: 'Beginner',
  metrics: [
    { key: 'cold', label: 'Cold load: first visit, nothing cached', icon: 'timer' },
    { key: 'warm', label: 'Warm load: connection reused, assets cached', icon: 'bolt' },
    { key: 'setup', label: 'Share of the cold load spent before the request', icon: 'clock' },
    { key: 'h3', label: 'HTTP/3 savings (fresh connection · 0-RTT resumption)', icon: 'gauge' },
  ],
  goals: [
    { text: 'URL parsing and the local caches', step: 1 },
    { text: 'DNS: name to address', step: 2 },
    { text: 'TCP and TLS: setting up a secure connection', step: 3 },
    { text: 'The HTTP request: edge, balancer, server, data', step: 4 },
    { text: 'Parsing, the critical rendering path and JavaScript', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rtt', label: 'Round-trip time to the server', min: 5, max: 400, step: 5, default: 60, unit: ' ms', description: 'Network latency (browser ↔ edge/server).' },
      { key: 'dns', label: 'Uncached DNS lookup', min: 0, max: 300, step: 5, default: 40, unit: ' ms', description: 'Resolver chasing the name when not cached.' },
      { key: 'tls', label: 'TLS handshake round trips', min: 1, max: 2, step: 1, default: 1, unit: '', description: '1 = TLS 1.3, 2 = TLS 1.2.' },
      { key: 'srv', label: 'Server time to first byte (after arrival)', min: 5, max: 2000, step: 5, default: 150, unit: ' ms', description: 'Routing, app logic, database, templating.' },
      { key: 'html', label: 'HTML size', min: 5, max: 1000, step: 5, default: 50, unit: ' KB', description: 'Compressed document.' },
      { key: 'assets', label: 'Critical CSS + JS size', min: 0, max: 5000, step: 10, default: 300, unit: ' KB', description: 'Render-blocking and startup resources, compressed.' },
      { key: 'bw', label: 'Bandwidth', min: 1, max: 1000, step: 1, default: 20, unit: ' Mbps', description: 'Downlink throughput.' },
      { key: 'rend', label: 'Parse, execute and render', min: 20, max: 3000, step: 10, default: 300, unit: ' ms', description: 'Main-thread work until the page is usable.' },
    ],
    calculate: (input, step) => {
      const rtt = Math.max(1, input.rtt ?? 60);
      const dns = Math.max(0, input.dns ?? 40);
      const tls = Math.max(1, Math.round(input.tls ?? 1));
      const srv = Math.max(0, input.srv ?? 150);
      const html = Math.max(1, input.html ?? 50);
      const assets = Math.max(0, input.assets ?? 300);
      const bw = Math.max(0.1, input.bw ?? 20);
      const rend = Math.max(0, input.rend ?? 300);
      const dl = (kb: number) => (kb * 8) / bw; // ms, since Mbps = kb/ms
      const setup = dns + rtt + tls * rtt;
      const req = rtt + srv;
      const htmlDone = setup + req + dl(html);
      const cold = htmlDone + (assets > 0 ? rtt + dl(assets) : 0) + rend;
      // Warm: DNS cached, connection reused, static assets from the browser cache.
      const warm = req + dl(html) + rend;
      // QUIC folds transport and TLS into one round trip; resumption can send the request in the first flight.
      const save1 = rtt * tls;
      const save0 = rtt * (1 + tls);
      return {
        cold: step < 4 ? { v: '—' } : { v: `${fmtMs(cold)} (setup ${fmtMs(setup)} + request ${fmtMs(req)} + HTML ${fmtMs(dl(html))} + assets ${fmtMs(rtt + dl(assets))} + render ${fmtMs(rend)})`, tone: cold < 1000 ? 'good' : cold < 2500 ? 'warn' : 'bad' },
        warm: step < 4 ? { v: '—' } : { v: `${fmtMs(warm)} (${((1 - warm / cold) * 100).toFixed(0)}% faster than cold)`, tone: 'good' },
        setup: step < 3 ? { v: '—' } : { v: `${fmtMs(setup)} = DNS ${fmtMs(dns)} + TCP ${fmtMs(rtt)} + TLS ${fmtMs(tls * rtt)} (${((setup / cold) * 100).toFixed(0)}%)`, tone: setup / cold < 0.25 ? 'good' : 'warn' },
        h3: step < 5 ? { v: '—' } : { v: `−${fmtMs(save1)} fresh · −${fmtMs(save0)} with 0-RTT resumption`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'URL',
      kind: 'technique',
      title: 'Parse the URL and check the caches first',
      body: [
        'You type <code>https://shop.example.com/cart?item=7</code>. The browser first decides what you meant: a URL or a search query (the omnibox), and splits the URL into <b>scheme</b> (<code>https</code>), <b>host</b> (<code>shop.example.com</code>), <b>port</b> (default 443), <b>path</b> and <b>query</b>. It then checks things that could skip the network entirely: the <b>HSTS list</b> (a host that demanded HTTPS is upgraded from <code>http://</code> before any request leaves, defeating downgrade attacks), the <b>HTTP cache</b> (a still-fresh copy with <code>Cache-Control: max-age</code> is used without asking anyone), a <b>service worker</b> that may answer, and a <b>preconnect/prefetch</b> speculation the browser made while you typed.',
        'Only if none of those answers does the real work begin, and it is a chain: <b>find the address</b> (DNS) → <b>open a transport connection</b> (TCP) → <b>secure it</b> (TLS) → <b>send the request</b> (HTTP) → <b>receive and render</b>. Several steps need a full network round trip, so they add up in proportion to distance — the numbers below use a 60 ms round trip, 40 ms for an uncached DNS lookup, a 150 ms server, a 50 KB page, 300 KB of critical assets and 20 Mbps.',
      ],
      scene: { nodes: [br({ tag: pill('shop.example.com/cart', 'search') }), dns(), cdn(), app()], links: [link('br', 'dns'), link('br', 'cdn'), link('cdn', 'app')], flows: [flow(['br', 'cdn', 'app'], { rate: 1.4 })] },
    },
    {
      short: 'DNS',
      kind: 'technique',
      title: 'DNS: from name to address',
      body: [
        'Network packets need IP addresses, so the name must be resolved (see the DNS lesson). The lookup falls through <b>layers of cache</b>: the browser’s own cache, the operating system’s resolver cache and hosts file, then the configured <b>recursive resolver</b> (your ISP, or 1.1.1.1 / 8.8.8.8). On a miss the resolver walks the hierarchy — <b>root</b> servers (which point to the <code>.com</code> TLD servers), the <b>TLD</b> servers (which point to <code>example.com</code>’s authoritative servers) and the <b>authoritative</b> server (which returns the A/AAAA records), with each answer cached for its TTL. A warm resolver answers in a few ms; a cold recursion costs tens to hundreds (<b>40 ms</b> here), and a response may carry several addresses (IPv4 and IPv6; the browser tries them with “Happy Eyeballs”).',
        'Large sites make the answer <b>depend on who asks</b>: GeoDNS or anycast sends you to a nearby edge. Since DNS sits on every first visit to a host, performance practice is to <b>reduce distinct hostnames</b> (each new one costs a lookup and a connection), use <code>dns-prefetch</code> or <code>preconnect</code> hints for third-party origins, set sensible TTLs, and (increasingly) use <b>DNS over HTTPS/TLS</b> for privacy — at the cost of an extra connection to the resolver on first use.',
      ],
      changes: [{ text: 'Browser → OS → recursive resolver → root → TLD → authoritative', tone: 'info' }, { text: 'Cold: ~40 ms here; cached: ~0', tone: 'info' }, { text: 'Fewer hostnames; dns-prefetch / preconnect hints', tone: 'good' }],
      scene: { nodes: [br({ tag: pill('cache miss', 'search') }), dns({ tag: pill('root → .com → example.com', 'list') }), cdn({ tag: pill('203.0.113.10', 'globe', 'good') })], links: [link('br', 'dns'), link('dns', 'cdn', { style: 'dashed' })], flows: [flow(['br', 'dns'], { kind: 'handshake', rate: 1.4, back: true })] },
    },
    {
      short: 'TCP+TLS',
      kind: 'technique',
      title: 'TCP and TLS: a secure connection costs round trips',
      body: [
        '<b>TCP</b> opens with a three-way handshake — SYN, SYN-ACK, ACK — and the client can send data right after the ACK, so it costs <b>one round trip (60 ms)</b> before the first useful byte. <b>TLS</b> then runs inside the connection: in TLS 1.3 the client sends its supported versions and a key share, the server answers with its certificate, a signature and its key share (see the TLS and Symmetric vs Asymmetric lessons); both derive keys and the client sends its request in its next flight — <b>one more round trip</b>. TLS 1.2 needs <b>two</b>. The browser validates the certificate chain to a trusted CA, checks the name and expiry, and (via stapled OCSP or CRLite) its revocation status.',
        'Setup before the request is therefore DNS 40 + TCP 60 + TLS 60 = <b>160 ms</b> — nearly a fifth of the 870 ms cold load — and it is pure overhead: no bytes of your page have moved. Mitigations: <b>connection reuse</b> (HTTP keep-alive; HTTP/2 multiplexing many requests on one connection), <b>TLS session resumption</b>, a <b>CDN edge close to the user</b> (shrinking the round trip itself), <b>TCP Fast Open</b> and <b>HTTP/3 over QUIC</b>, which merges transport and crypto setup into one round trip and allows <b>0-RTT</b> requests on resumed connections (saving 60 ms fresh, 120 ms resumed here, with replay caveats for non-idempotent requests).',
      ],
      changes: [{ text: 'TCP: 1 RTT · TLS 1.3: 1 RTT · TLS 1.2: 2 RTT', tone: 'info' }, { text: 'DNS 40 + TCP 60 + TLS 60 = 160 ms before any HTTP', tone: 'bad' }, { text: 'Reuse connections, resumption, nearby edge, HTTP/3 + 0-RTT', tone: 'good' }],
      concepts: [{ term: 'Round trip (RTT)', def: 'The time for a message to reach the server and a reply to return; handshakes, requests and many protocols are counted in round trips.' }],
      scene: { nodes: [br({ tag: pill('SYN → SYN-ACK → ACK', 'link') }), cdn({ tag: pill('cert + key share', 'lock', 'good') })], links: [link('br', 'cdn')], flows: [flow(['br', 'cdn'], { kind: 'handshake', rate: 1.6, back: true })] },
    },
    {
      short: 'Request',
      kind: 'technique',
      title: 'The HTTP request: edge, balancer, server, data',
      body: [
        'The browser sends <code>GET /cart?item=7</code> with headers (<code>Host</code>, <code>Accept-Encoding: br, gzip</code>, cookies, <code>User-Agent</code>). It reaches a <b>CDN edge or load balancer</b> (see those lessons) that terminates TLS and either serves a cached copy or forwards the request — over a warm, pooled connection to the origin — to an <b>application server</b>. The app authenticates the session cookie, calls its services and database (often through a cache), renders the HTML — perhaps streaming it (see the HTTP Streaming lesson) — and returns <code>200</code> with <code>Content-Encoding</code>, <code>Cache-Control</code> and security headers.',
        'Time to first byte is <b>one round trip plus server time</b>: 60 + 150 = <b>210 ms</b>; the 50 KB document then takes 20 ms at 20 Mbps — the HTML is complete at 390 ms. Server time is the part you control: query efficiency, cache hit rates, avoiding serial calls (see the Resiliency and Tail Latency lessons). A redirect (<code>http → https</code>, <code>/ → /home</code>, <code>www → apex</code>) adds an entire extra round trip — and often a repeat of the connection setup if the host changes — so avoid redirect chains.',
      ],
      changes: [{ text: 'TTFB = RTT + server time = 60 + 150 = 210 ms', tone: 'info' }, { text: 'HTML complete at ≈ 390 ms', tone: 'info' }, { text: 'Each redirect costs a full round trip — avoid chains', tone: 'bad' }],
      scene: { nodes: [br({ tag: pill('GET /cart', 'search') }), cdn({ tag: pill('TLS terminate · route', 'route') }), app({ tag: pill('150 ms: auth + render', 'timer') }), data()], links: [link('br', 'cdn'), link('cdn', 'app'), link('app', 'data')], flows: [flow(['br', 'cdn', 'app', 'data'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Render',
      kind: 'insight',
      title: 'Parse, fetch critical resources, render',
      body: [
        'As bytes arrive, the browser <b>parses HTML incrementally</b> into the <b>DOM</b>. A <b>preload scanner</b> races ahead to find <code>&lt;link rel=stylesheet&gt;</code>, <code>&lt;script&gt;</code> and images and starts fetching them immediately — on the same HTTP/2 connection, so no new setup: another round trip plus transfer, 60 + 120 = <b>180 ms</b> for 300 KB. CSS is <b>render-blocking</b> (the browser won’t paint without the CSSOM), classic scripts are <b>parser-blocking</b> unless <code>async</code>/<code>defer</code>/<code>type=module</code>. With the DOM and CSSOM the browser builds the <b>render tree</b>, computes <b>layout</b> (geometry), <b>paints</b> layers and <b>composites</b> them on the GPU; JavaScript runs on the main thread and can add more work (hydrating a framework app, firing API calls — each another round trip).',
        'Add <b>300 ms</b> of parse/execute/render and the cold load completes at about <b>870 ms</b>. The warm case — DNS cached, connection reused, static assets in the HTTP cache — drops setup and asset fetching: 210 + 20 + 300 = <b>530 ms</b> (39% faster), and with a CDN-cached HTML shell or prefetch even less. Metrics to watch: <b>TTFB</b>, <b>First Contentful Paint</b>, <b>Largest Contentful Paint</b> (when the main content is visible) and <b>Interaction to Next Paint</b>. The figures in this lesson are model outputs for the stated latency, bandwidth and work.',
      ],
      changes: [{ text: 'Preload scanner starts CSS/JS fetches early: +180 ms here', tone: 'info' }, { text: 'Cold ≈ 870 ms · warm ≈ 530 ms', tone: 'info' }, { text: 'CSS blocks render; sync scripts block parsing — use defer/async', tone: 'bad' }],
      scene: { nodes: [br({ tag: pill('HTML → DOM · CSS → CSSOM', 'layers') }), cdn({ tag: pill('CSS + JS, 300 KB', 'file') }), render({ tag: pill('layout → paint → composite', 'check', 'good') })], links: [link('br', 'cdn'), link('br', 'render')], flows: [flow(['br', 'cdn'], { rate: 1.6, back: true }), flow(['br', 'render'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A page load is a chain of round trips — shorten the chain',
      body: [
        'URL → local caches → <b>DNS</b> (40 ms) → <b>TCP</b> (1 RTT) → <b>TLS</b> (1 RTT) → <b>request</b> (RTT + server time) → <b>assets</b> (RTT + transfer) → <b>render</b>: ≈ 870 ms cold, 530 ms warm. Setup is 18% of the cold load before the first byte of content.',
        'Cut round trips (CDN, reuse, HTTP/3, fewer origins and redirects), server time, and render-blocking bytes.',
      ],
      scene: { nodes: [br(), dns(), cdn(), app(), render()], links: [link('br', 'dns'), link('br', 'cdn'), link('cdn', 'app'), link('br', 'render')], flows: [flow(['br', 'cdn', 'app'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
