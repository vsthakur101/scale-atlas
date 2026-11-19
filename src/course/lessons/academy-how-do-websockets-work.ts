import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -15, 0, 12, 'clients', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -7, 0, 'Load balancer (sticky)', 'orange', 'route', { size: [1.3, 1.3], height: 26, ...extra });
const gw = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`g${i}`, 1, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });
const bus = (extra: Partial<SceneNode> = {}) => box('bus', 10, 0, 'Pub/sub bus', 'purple', 'share', { size: [1.4, 1.4], height: 28, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 17, 0, 'Presence / state', { size: [1.3, 1.3], ...extra });

const fmtR = (r: number): string => (r >= 1e9 ? `${(r / 1e9).toFixed(1)}B/s` : r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(r >= 1e4 ? 0 : 1)}k/s` : `${Math.round(r)}/s`);
const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-how-do-websockets-work',
  title: 'How WebSockets Work — and Scale',
  blurb: 'An HTTP upgrade to a persistent full-duplex connection, heartbeats, fan-out through a pub/sub layer, and the reconnect storm that follows every deploy.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'mem', label: 'Memory for open connections', icon: 'disk' },
    { key: 'beat', label: 'Heartbeat traffic', icon: 'activity' },
    { key: 'fan', label: 'Deliveries from broadcasts', icon: 'share' },
    { key: 'storm', label: 'Handshakes/s after a restart', icon: 'alert' },
    { key: 'cores', label: 'CPU cores for the storm', icon: 'cpu' },
  ],
  goals: [
    { text: 'The HTTP Upgrade handshake and framed full-duplex messages', step: 2 },
    { text: 'Why heartbeats and idle timeouts matter', step: 3 },
    { text: 'Stateful connections and sticky routing', step: 4 },
    { text: 'Fan-out across servers with pub/sub', step: 5 },
    { text: 'Reconnect storms and graceful draining', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'conns', label: 'Concurrent connections', min: 1000, max: 20000000, step: 1000, default: 1000000, unit: '', description: 'Open WebSocket connections.' },
      { key: 'kb', label: 'Memory per connection', min: 2, max: 100, step: 1, default: 20, unit: ' KB', description: 'Buffers and per-connection state in the gateway (more with TLS and app state).' },
      { key: 'ping', label: 'Heartbeat interval', min: 5, max: 120, step: 5, default: 30, unit: ' s', description: 'Time between pings on an idle connection.' },
      { key: 'room', label: 'Recipients per broadcast', min: 1, max: 1000000, step: 1, default: 1000, unit: '', description: 'Connections that receive each published message (chat room size).' },
      { key: 'pub', label: 'Broadcasts per second', min: 1, max: 100000, step: 1, default: 500, unit: '/s', description: 'Messages published across all rooms.' },
      { key: 'window', label: 'Reconnect spread (with jitter)', min: 1, max: 600, step: 1, default: 60, unit: ' s', description: 'Time over which clients reconnect after their server restarts.' },
      { key: 'hs', label: 'CPU per handshake (TLS + upgrade + auth)', min: 0.2, max: 10, step: 0.1, default: 1.5, unit: ' ms', description: 'Server CPU to establish one connection.' },
    ],
    calculate: (input, step) => {
      const conns = Math.max(1, input.conns ?? 1e6);
      const kb = Math.max(1, input.kb ?? 20);
      const ping = Math.max(1, input.ping ?? 30);
      const room = Math.max(1, input.room ?? 1000);
      const pub = Math.max(0, input.pub ?? 500);
      const win = Math.max(1, input.window ?? 60);
      const hs = Math.max(0.01, input.hs ?? 1.5);
      const storm = conns / win;
      return {
        mem: step < 1 ? { v: '—' } : { v: fmtB(conns * kb * 1024), tone: conns * kb * 1024 > 5e10 ? 'warn' : 'good' },
        beat: step < 2 ? { v: '—' } : { v: `${fmtR((conns * 2) / ping)} (ping + pong)` },
        fan: step < 4 ? { v: '—' } : { v: fmtR(pub * room), tone: pub * room > 5e6 ? 'warn' : 'good' },
        storm: step < 5 ? { v: '—' } : { v: fmtR(storm), tone: storm < 5000 ? 'good' : storm < 50000 ? 'warn' : 'bad' },
        cores: step < 5 ? { v: '—' } : { v: `${((storm * hs) / 1000).toFixed(1)} cores`, tone: (storm * hs) / 1000 < 16 ? 'good' : (storm * hs) / 1000 < 64 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'HTTP is request/response; some apps need the server to speak first',
      body: [
        'Chat, live scores, collaborative editing, trading dashboards and multiplayer games need updates <i>pushed</i> to the client the instant they happen. Plain HTTP makes the client ask: polling wastes requests and adds latency; long polling holds requests open but still costs a new request per message (see the Push lesson).',
        '<b>WebSocket</b> (RFC 6455) gives a <b>persistent, full-duplex</b> channel over a single TCP connection: either side can send messages at any time, with a couple of bytes of framing overhead instead of a full HTTP request’s headers.',
      ],
      scene: { nodes: [clients({ tag: pill('open connection', 'bolt') }), gw(0, 1, 'Server', { tag: pill('can push any time', 'check', 'good') })], links: [link('clients', 'g0', { arrow: 'both' })], flows: [flow(['clients', 'g0'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Handshake',
      kind: 'technique',
      title: 'An HTTP request that becomes something else',
      body: [
        'The client sends an ordinary HTTP/1.1 <code>GET</code> with <code>Upgrade: websocket</code>, <code>Connection: Upgrade</code> and a random <code>Sec-WebSocket-Key</code>; the server replies <code>101 Switching Protocols</code> with a hash of the key proving it understood. From then on the same TCP (and TLS) connection carries <b>WebSocket frames</b> — small headers, opcodes for text, binary, ping, pong and close, a length, and (client→server) a masking key.',
        'Because it starts as HTTP it passes through ports 80/443, proxies and CDNs that support it, and reuses cookies and TLS for authentication — authenticate <i>during the upgrade</i> (and again on token expiry), and check the <code>Origin</code> header to prevent cross-site hijacking. Messages are not delivered more than once or out of order — it is TCP underneath — but they are <b>not acknowledged at the application level</b>.',
      ],
      changes: [{ text: 'GET + Upgrade → 101 Switching Protocols', tone: 'info' }, { text: 'Authenticate on upgrade; check Origin', tone: 'good' }],
      scene: { nodes: [clients({ tag: pill('GET / Upgrade: websocket', 'file') }), gw(0, 1, 'Server', { tag: pill('101 Switching Protocols', 'check', 'good') })], links: [link('clients', 'g0', { arrow: 'both' })], flows: [flow(['clients', 'g0'], { kind: 'handshake', rate: 1, back: true })] },
    },
    {
      short: 'Heartbeats',
      kind: 'technique',
      title: 'Detecting dead connections',
      body: [
        'A TCP connection can die silently — a phone leaves coverage, a NAT or load balancer drops an idle mapping, a laptop sleeps — and neither side finds out until it tries to send. WebSocket defines <b>ping/pong</b> control frames: send a ping every 30 s; if no pong returns within a timeout, close and clean up. This also keeps intermediaries from timing the connection out (load balancers often close idle connections after 60 s).',
        'It has a cost: 1 million connections pinging every 30 s is <b>~67,000 messages/s</b> (ping + pong) of pure overhead — small frames, but real CPU and syscalls. Tune the interval to the tightest idle timeout on the path, and use <b>application-level heartbeats</b> if you also need to detect a stuck handler, not just a dead socket.',
      ],
      changes: [{ text: '1M connections ÷ 30 s × 2 = ~67k frames/s', tone: 'info' }, { text: 'Interval below the shortest idle timeout on the path', tone: 'good' }],
      scene: { nodes: [clients({ tag: pill('pong', 'refresh') }), gw(0, 1, 'Server', { tag: pill('ping every 30 s', 'clock') })], links: [link('clients', 'g0', { arrow: 'both' })], flows: [flow(['g0', 'clients'], { rate: 0.6, back: true })] },
    },
    {
      short: 'Stateful',
      kind: 'technique',
      title: 'Connections are state: memory and stickiness',
      body: [
        'Each open connection holds buffers, TLS state, authentication context and subscriptions in a gateway process — about 20 KB here, so a million connections is <b>~20 GB</b> across the fleet (a few GB per node at 50–100k each, bounded by memory and file descriptors; see the C10K lesson). A connection lives on <b>one specific server</b> for its entire life, so load balancing is decided at connect time: use least-connections and cap per-node counts.',
        'Because the server holds the state, the app is no longer stateless: to send a message to user U you must know <b>which gateway holds U’s connection</b> — kept in a presence/routing store. Keep gateways thin (terminate sockets, authenticate, route) and put business logic in stateless services behind them so a gateway restart loses only connections, not data.',
      ],
      changes: [{ text: '1M × 20 KB ≈ 20 GB of connection state', tone: 'info' }, { text: 'Routing table: user → gateway', tone: 'info' }],
      scene: { nodes: [clients(), lb({ tag: pill('chooses once, at connect', 'route') }), gw(0, 2, 'Gateway 1'), gw(1, 2, 'Gateway 2'), store({ tag: pill('user → gateway', 'hash') })], links: [link('clients', 'lb'), link('lb', 'g0'), link('lb', 'g1'), link('g0', 'store', { style: 'dashed' }), link('g1', 'store', { style: 'dashed' })], flows: [flow(['clients', 'lb', 'g0'], { rate: 1.5 })] },
    },
    {
      short: 'Fan-out',
      kind: 'technique',
      title: 'Broadcasting across gateways with pub/sub',
      body: [
        'A message to a chat room must reach every member, whichever gateway holds them. Publish it to a <b>pub/sub bus</b> (Redis, NATS, Kafka, a managed service) on a channel per room; each gateway subscribes to the channels its connected users need and writes the message to its local sockets. The publisher needn’t know where anyone is.',
        'Work multiplies: 500 broadcasts a second to rooms of 1,000 is <b>500,000 socket writes a second</b> across the fleet. Big rooms (100k+ members) need sharded fan-out trees, batching of small messages into one frame, conflation (send only the latest value for fast-changing data) and per-connection send queues with a cap — drop or disconnect slow consumers instead of buffering without bound.',
      ],
      changes: [{ text: 'Publish once; each gateway delivers to its local sockets', tone: 'good' }, { text: '500/s × 1,000 recipients = 500k writes/s', tone: 'info' }, { text: 'Cap per-connection queues; drop slow consumers', tone: 'good' }],
      scene: { nodes: [box('pub', -12, 0, 'Publisher', 'green', 'user', { size: [1.2, 1.2], height: 24 }), bus({ tag: pill('channel per room', 'hash') }), gw(0, 2, 'Gateway 1', { tag: pill('writes to local sockets', 'check') }), gw(1, 2, 'Gateway 2')], links: [link('pub', 'bus'), link('bus', 'g0'), link('bus', 'g1')], flows: [flow(['pub', 'bus', 'g0'], { kind: 'write', rate: 1.5 }), flow(['bus', 'g1'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Reconnects',
      kind: 'problem',
      title: 'The reconnect storm',
      body: [
        'Deploy or crash a gateway holding 100,000 connections and all of them try to reconnect at once — through the load balancer, to the <i>other</i> gateways, each requiring a TLS handshake and authentication. A million connections reconnecting within 60 s is <b>~16,700 handshakes/s</b>, ~25 cores of handshake CPU at 1.5 ms each — and a failing system makes it worse because clients retry. Without jitter the herd arrives in lockstep.',
        'Defences: client <b>exponential backoff with full jitter</b>; <b>graceful draining</b> (the old server asks clients to reconnect gradually before shutdown); rolling restarts of a small fraction at a time; session resumption (TLS tickets, resume tokens) to skip expensive work; a <b>rate limit on accepts</b>; and clients that fetch missed messages on reconnect via a sequence number instead of assuming nothing was lost.',
      ],
      changes: [{ text: '1M ÷ 60 s = 16.7k handshakes/s ≈ 25 cores', tone: 'bad' }, { text: 'Jittered backoff · draining · resume tokens', tone: 'good' }],
      scene: { nodes: [clients({ tag: pill('all reconnect now', 'alert', 'bad') }), gw(0, 2, 'Restarted', { state: 'hot', tag: pill('handshake flood', 'alert', 'bad') }), gw(1, 2, 'Others', { state: 'hot' })], links: [link('clients', 'g0'), link('clients', 'g1')], flows: [flow(['clients', 'g0'], { kind: 'heavy', rate: 4 }), flow(['clients', 'g1'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Alternatives',
      kind: 'tradeoff',
      title: 'WebSocket, SSE or polling?',
      body: [
        '<b>SSE</b> (server-sent events) streams one-way server→client over plain HTTP, with automatic reconnect and event ids — simpler and CDN/proxy-friendly when the client only needs to <i>receive</i>. <b>WebSocket</b> is right when the client also sends frequently or latency in both directions matters. <b>WebTransport</b>/QUIC and WebRTC data channels serve unreliable low-latency or peer-to-peer cases. <b>Polling</b> is fine for infrequent updates and the simplest to operate.',
        'Pick the simplest transport that meets the need; operations costs (stateful gateways, sticky routing, reconnect handling) are the real price of WebSockets. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [box('sse', -8, 0, 'SSE', 'green', 'bolt', { size: [1.2, 1.2], height: 20, tag: pill('server → client', 'check') }), box('ws', 0, 0, 'WebSocket', 'blue', 'refresh', { size: [1.2, 1.2], height: 26, tag: pill('both ways', 'check') }), box('poll', 8, 0, 'Polling', 'orange', 'clock', { size: [1.2, 1.2], height: 16, tag: pill('simplest', 'check') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Persistent connections are state you have to operate',
      body: [
        'WebSocket upgrades an HTTP connection into a persistent full-duplex channel. Heartbeats detect dead peers; each connection costs memory and pins a user to a gateway; <b>pub/sub fan-out</b> delivers broadcasts across gateways; and <b>reconnect storms</b> after restarts need jitter, draining and resumption.',
        'Keep gateways thin, cap queues, authenticate on upgrade, and prefer SSE or polling when one-way or infrequent updates are enough.',
      ],
      scene: { nodes: [clients(), lb(), gw(0, 2, 'Gateway 1'), gw(1, 2, 'Gateway 2'), bus()], links: [link('clients', 'lb'), link('lb', 'g0'), link('lb', 'g1'), link('g0', 'bus', { arrow: 'both' }), link('g1', 'bus', { arrow: 'both' })], flows: [flow(['clients', 'lb', 'g0', 'bus'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
