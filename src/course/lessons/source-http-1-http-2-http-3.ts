import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const browser = (extra: Partial<SceneNode> = {}) => box('browser', -13, 0, 'Browser', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const server = (extra: Partial<SceneNode> = {}) => box('server', 11, 0, 'Server', 'blue', 'server', { size: [1.3, 1.3], height: 30, ...extra });
const conn = (i: number, n: number, extra: Partial<SceneNode> = {}) =>
  box(`c${i}`, -1, (i - (n - 1) / 2) * 3.4, `connection ${i + 1}`, 'teal', 'route', { size: [1.1, 1.1], height: 16, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

const lesson: Lesson = {
  slug: 'source-http-1-http-2-http-3',
  title: 'HTTP/1.1 → HTTP/2 → HTTP/3',
  blurb: 'Connection setup, multiplexing and head-of-line blocking: what each version fixed, counted in round trips.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'h1', label: 'HTTP/1.1 (6 connections, TLS 1.2)', icon: 'clock' },
    { key: 'h2', label: 'HTTP/2 (1 connection, TLS 1.3)', icon: 'clock' },
    { key: 'h3', label: 'HTTP/3 (QUIC)', icon: 'clock' },
    { key: 'rt', label: 'Round trips: 1.1 / 2 / 3', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why HTTP/1.1 needs many connections and how that costs round trips', step: 2 },
    { text: 'Multiplexing, header compression and what HTTP/2 fixes', step: 3 },
    { text: 'TCP head-of-line blocking — the problem HTTP/2 left', step: 4 },
    { text: 'What QUIC and HTTP/3 change', step: 5 },
    { text: 'What they still don’t fix', step: 7 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rtt', label: 'Round-trip time to the server', min: 5, max: 500, step: 5, default: 80, unit: ' ms', description: 'Network latency between browser and server.' },
      { key: 'res', label: 'Resources on the page', min: 1, max: 300, step: 1, default: 60, unit: '', description: 'HTML, scripts, styles, images and API calls needed for the page.' },
    ],
    calculate: (input, step) => {
      const rtt = Math.max(1, input.rtt ?? 80);
      const res = Math.max(1, Math.round(input.res ?? 60));
      // Network waiting only (ignores bandwidth and server time). TCP = 1 RTT; TLS 1.2 = 2 RTT; TLS 1.3 = 1 RTT; QUIC+TLS 1.3 = 1 RTT.
      // The HTML must arrive before the other resources are discovered, so every protocol has two request waves at minimum.
      const rtH1 = 3 + 1 + Math.ceil((res - 1) / 6);
      const rtH2 = 2 + 2;
      const rtH3 = 1 + 2;
      return {
        h1: step < 1 ? { v: '—' } : { v: fmtMs(rtH1 * rtt), tone: rtH1 * rtt > 1000 ? 'bad' : 'warn' },
        h2: step < 2 ? { v: '—' } : { v: fmtMs(rtH2 * rtt), tone: 'good' },
        h3: step < 4 ? { v: '—' } : { v: fmtMs(rtH3 * rtt), tone: 'good' },
        rt: step < 1 ? { v: '—' } : { v: `${rtH1} / ${rtH2} / ${rtH3}` },
      };
    },
  },
  steps: [
    {
      short: 'Cost model',
      kind: 'problem',
      title: 'On the web, latency is counted in round trips',
      body: [
        'A page isn’t one request: it is a chain of dozens, often over a connection that must first be set up. Bandwidth rarely limits the first second; <b>round trips</b> do, because the speed of light doesn’t improve. At 80 ms each, ten wasted round trips is nearly a second.',
        'The three HTTP versions are best understood as three answers to “how do we spend fewer round trips and stop one slow thing blocking the rest?” The model above counts only network waiting (setup plus request waves), ignoring bandwidth and server time.',
      ],
      scene: { nodes: [browser(), server()], links: [link('browser', 'server', { arrow: 'both' })], flows: [flow(['browser', 'server'], { kind: 'handshake', rate: 1, back: true })] },
    },
    {
      short: 'HTTP/1.1',
      kind: 'technique',
      title: 'HTTP/1.1: one request at a time per connection',
      body: [
        'HTTP/1.1 sends a request and waits for the full response before the next on the same connection (pipelining existed but was effectively unusable). To parallelise, browsers open <b>about six connections per host</b>, and each pays the setup: 1 RTT for TCP plus 2 RTT for TLS 1.2 — three round trips before the first byte of the request.',
        'For 60 resources over 6 connections that is <code>3 setup + 1 for the HTML + ⌈59 ÷ 6⌉ = 14 round trips</code> ≈ 1.1 s at 80 ms. Workarounds became habits: bundling files, sprites, inlining, and <b>domain sharding</b> (more hostnames to get more connections) — all of which fight the cache and the protocol.',
      ],
      changes: [{ text: '6 connections × (TCP 1 + TLS 2 RTT) setup', tone: 'bad' }, { text: '14 round trips for 60 resources at the defaults', tone: 'bad' }],
      scene: { nodes: [browser(), ...[0, 1, 2].map((i) => conn(i, 3)), server({ tag: pill('one request per connection at a time', 'queue', 'warn') })], links: [...[0, 1, 2].map((i) => link('browser', `c${i}`)), ...[0, 1, 2].map((i) => link(`c${i}`, 'server'))], flows: [...[0, 1, 2].map((i) => flow(['browser', `c${i}`, 'server'], { rate: 1 }))] },
    },
    {
      short: 'HTTP/2',
      kind: 'technique',
      title: 'HTTP/2: one connection, many streams',
      body: [
        'HTTP/2 uses <b>one connection</b> carrying many interleaved <b>streams</b> in a binary framing layer: all 60 requests go out at once and responses return in whatever order they’re ready, with <b>priorities</b>. Headers are compressed with <b>HPACK</b> (repeated cookies and user agents shrink to a few bytes). Setup is paid once: with TLS 1.3 the cost is 1 (TCP) + 1 (TLS) + 2 request waves (the HTML, then everything it references) = 4 round trips.',
        'The same page drops from 14 round trips to 4 — about <b>320 ms</b> — and the hacks (sharding, bundling for connection limits) become counter-productive. Server push, once the headline feature, was little used and has been removed from major browsers.',
      ],
      changes: [{ text: '60 requests multiplexed on one connection', tone: 'good' }, { text: 'HPACK header compression', tone: 'good' }, { text: '14 → 4 round trips at the defaults', tone: 'good' }],
      concepts: [{ term: 'Multiplexing', def: 'Carrying many independent request/response streams concurrently over a single connection.' }],
      scene: { nodes: [browser(), conn(0, 1, { name: 'one connection', tag: pill('60 streams interleaved', 'layers', 'good') }), server()], links: [link('browser', 'c0'), link('c0', 'server')], flows: [flow(['browser', 'c0', 'server'], { rate: 3 }), flow(['server', 'c0', 'browser'], { kind: 'response', rate: 3 })] },
    },
    {
      short: 'HoL blocking',
      kind: 'problem',
      title: 'But TCP still delivers bytes in order',
      body: [
        'HTTP/2 moved the multiplexing above TCP, and TCP knows nothing about streams: it guarantees one ordered byte stream. If a single packet is <b>lost</b>, TCP holds back every later byte — including ones belonging to completely different streams — until the retransmission arrives, roughly an extra round trip or more. This is <b>head-of-line blocking at the transport layer</b>.',
        'On a clean wired network it hardly matters; on lossy mobile or Wi-Fi links with a couple of percent loss, one HTTP/2 connection can stall <i>all</i> 60 resources, sometimes performing worse than six HTTP/1.1 connections where a loss only blocks one.',
      ],
      changes: [{ text: 'One lost packet stalls every stream on the connection', tone: 'bad' }],
      scene: { nodes: [browser(), conn(0, 1, { state: 'hot', tag: pill('packet lost → all streams wait', 'alert', 'bad') }), server()], links: [link('browser', 'c0'), link('c0', 'server')], flows: [flow(['server', 'c0'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'HTTP/3',
      kind: 'technique',
      title: 'HTTP/3: QUIC over UDP',
      body: [
        '<b>QUIC</b> reimplements reliable transport on UDP in user space, with <b>streams as a first-class concept</b>: loss recovery is per stream, so a lost packet delays only the stream it carried. It also integrates TLS 1.3 into the transport handshake — connection setup and encryption in <b>one round trip</b>, and <b>0-RTT</b> resumption for repeat visitors (with replay-safety caveats).',
        'Other gains: <b>connection migration</b> (a connection id, not the IP/port 4-tuple, identifies the session, so switching Wi-Fi to cellular doesn’t reset it) and faster evolution since QUIC isn’t in the OS kernel. Our page needs about 3 round trips ≈ <b>240 ms</b>. HTTP/3 is HTTP semantics carried by QUIC, with QPACK for headers.',
      ],
      changes: [{ text: 'Per-stream loss recovery', tone: 'good' }, { text: 'Transport + TLS 1.3 in 1 RTT; 0-RTT resume', tone: 'good' }, { text: 'Connection migration across networks', tone: 'good' }],
      concepts: [{ term: 'QUIC', def: 'A UDP-based transport with built-in TLS 1.3, independent streams and connection migration; the foundation of HTTP/3.' }],
      scene: { nodes: [browser(), box('quic', -1, 0, 'QUIC connection', 'teal', 'route', { size: [1.3, 1.3], height: 26, tag: pill('per-stream recovery', 'check', 'good') }), server()], links: [link('browser', 'quic'), link('quic', 'server')], flows: [flow(['browser', 'quic', 'server'], { rate: 3 }), flow(['server', 'quic', 'browser'], { kind: 'response', rate: 3 })] },
    },
    {
      short: 'Deploying',
      kind: 'tradeoff',
      title: 'How you actually adopt it',
      body: [
        'Browsers discover HTTP/3 via the <code>Alt-Svc</code> header or DNS <code>HTTPS</code> records and fall back to HTTP/2 when UDP is blocked, so you serve all three. Most CDNs and load balancers terminate HTTP/2 and 3 for you and speak HTTP/1.1 or 2 to your origin, which is why upgrading often needs no application change.',
        'Costs: QUIC runs in user space and is more CPU-intensive than kernel TCP, middleboxes sometimes throttle UDP, and observability tooling must understand it. Gains are largest on high-latency, lossy or mobile networks and for many small requests; on a fast, clean connection the three look similar.',
      ],
      scene: { nodes: [browser({ tag: pill('Alt-Svc: h3', 'search') }), box('cdn', 0, 0, 'CDN / load balancer', 'orange', 'globe', { size: [1.4, 1.4], height: 28, tag: pill('HTTP/3 ↔ HTTP/2', 'refresh') }), server({ name: 'Origin (HTTP/1.1 or 2)' })], links: [link('browser', 'cdn'), link('cdn', 'server')], flows: [flow(['browser', 'cdn', 'server'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fewer round trips, no cross-stream blocking',
      body: [
        '<b>HTTP/1.1</b>: one request at a time per connection, many connections, 3 setup round trips each. <b>HTTP/2</b>: one connection, multiplexed streams and compressed headers — but TCP head-of-line blocking. <b>HTTP/3</b>: QUIC gives per-stream loss recovery, 1-RTT (or 0-RTT) setup and connection migration.',
        'At the defaults the same page costs roughly 1,120 ms, 320 ms and 240 ms of pure network waiting. Serve all three, let browsers negotiate, and remember none of them fixes slow servers, oversized assets or too many dependent requests. Figures are model outputs, not measurements.',
      ],
      scene: { nodes: [browser(), server()], links: [link('browser', 'server', { arrow: 'both' })], flows: [flow(['browser', 'server'], { rate: 2 })] },
    },
  ],
};

export default lesson;
