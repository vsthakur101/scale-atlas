import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const riders = (n = 18, text = '1M open apps', extra: Partial<SceneNode> = {}) => crowd('users', -12, 1, n, text, extra);
const api = (extra: Partial<SceneNode> = {}) => box('api', -2, 0, 'Tracking API', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const courier = (extra: Partial<SceneNode> = {}) => box('courier', 7, 0, 'Courier feed', 'orange', 'pin', { size: [1.4, 1.4], height: 36, ...extra });
const gw = (i: number, extra: Partial<SceneNode> = {}) =>
  box(`g${i}`, -1 + (i - 2) * 1.2, (i - 2) * 6, `Gateway ${i}`, 'teal', 'wifi', { size: [1.3, 1.3], height: 34, ...extra });
const gws = (extra: (i: number) => Partial<SceneNode> = () => ({})) => [1, 2, 3].map((i) => gw(i, extra(i)));
const bus = (extra: Partial<SceneNode> = {}) => box('bus', 8, -6, 'Pub/Sub', 'yellow', 'bolt', { size: [1.4, 1.4], height: 34, sub: 'channel per user', ...extra });
const registry = (extra: Partial<SceneNode> = {}) => box('reg', 8, 6, 'Registry', 'red', 'key', { size: [1.3, 1.3], height: 32, sub: 'user → gateway', ...extra });

const lesson: Lesson = {
  slug: 'push',
  title: 'Push: Polling to WebSockets',
  blurb: 'Getting updates to a million open screens the moment they happen — without a million pointless requests a second.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'rps', label: 'Requests / s', icon: 'activity' },
    { key: 'delay', label: 'Update delay', icon: 'timer' },
    { key: 'wasted', label: 'Empty replies', icon: 'x' },
    { key: 'conns', label: 'Open conns', icon: 'link' },
  ],
  goals: [
    { text: 'The cost of short polling', step: 1 },
    { text: 'Long polling and Server-Sent Events', step: 3 },
    { text: 'WebSockets for two-way, low-latency channels', step: 4 },
    { text: 'Routing messages to the right connection', step: 6 },
    { text: 'Reconnect storms and mobile push', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'Polling',
      kind: 'problem',
      title: 'A million apps asking “anything new?”',
      body: [
        'A food-delivery app shows the courier moving on a map. Each open app asks <code>GET /orders/81733/location</code> every 2 seconds. With a million open apps that’s <b>500,000 requests a second</b> — and since a courier moves every ~10 seconds, about 80% of replies say “no change”.',
        'Halving the interval halves the delay and doubles the bill. Polling ties freshness to cost.',
      ],
      changes: [{ text: '500k req/s', tone: 'bad' }, { text: '80% empty replies', tone: 'bad' }],
      concepts: [{ term: 'Short polling', def: 'The client repeatedly requests the latest state on a fixed interval.' }],
      scene: {
        nodes: [riders(), api({ load: 92, state: 'hot', tag: pill('500k req/s', 'alert', 'bad') }), courier()],
        links: [link('users', 'api', { arrow: 'both', label: pill('every 2 s') }), link('courier', 'api')],
        flows: [flow(['users', 'api'], { back: true, rate: 7 }), flow(['courier', 'api'], { kind: 'write', rate: 0.4 })],
        metrics: { rps: { v: '500k', tone: 'bad' }, delay: '≤ 2 s', wasted: { v: '80%', tone: 'bad' }, conns: 'short-lived' },
      },
    },
    {
      short: 'Long poll',
      kind: 'technique',
      title: 'Long polling: hold the request open',
      body: [
        'With <b>long polling</b>, the server doesn’t answer immediately. It holds the request until there <i>is</i> news — or a timeout like 30 s — then responds, and the client immediately asks again.',
        'Updates arrive almost instantly and empty replies nearly vanish. It works through any proxy and needs nothing beyond plain HTTP, but each held request ties up a connection, and every message still costs a fresh request.',
      ],
      changes: [{ text: 'Requests 500k → 110k/s', tone: 'good' }, { text: 'Delay ≤ 2 s → ~100 ms', tone: 'good' }],
      concepts: [{ term: 'Long polling', def: 'The server holds a request open until new data is available or a timeout passes.' }],
      scene: {
        nodes: [riders(), api({ load: 55, tag: pill('holding 1M requests', 'clock') }), courier()],
        links: [link('users', 'api', { arrow: 'both', label: pill('wait ≤ 30 s') }), link('courier', 'api')],
        flows: [flow(['users', 'api'], { back: true, rate: 2, speed: 0.6 }), flow(['courier', 'api'], { kind: 'write', rate: 0.6 })],
        metrics: { rps: '110k', delay: { v: '~100 ms', tone: 'good' }, wasted: '~3%', conns: '1M held' },
      },
    },
    {
      short: 'SSE',
      kind: 'technique',
      title: 'Server-Sent Events: a one-way stream',
      body: [
        'For server-to-client updates, <b>Server-Sent Events</b> keep one HTTP response open and stream messages down it as text events. The browser’s <code>EventSource</code> reconnects automatically and sends <code>Last-Event-ID</code> so the server can resume where it left off.',
        'No per-message request overhead, plain HTTP, works well over HTTP/2. The limit: it’s one-way — the client still uses normal requests to send anything.',
      ],
      changes: [{ text: 'One stream per app', tone: 'good' }, { text: 'Requests ≈ only reconnects', tone: 'good' }],
      concepts: [{ term: 'Server-Sent Events', def: 'A standard for streaming text events from server to browser over a long-lived HTTP response.' }],
      scene: {
        nodes: [riders(), api({ load: 35, tag: pill('text/event-stream', 'activity', 'good') }), courier()],
        links: [link('api', 'users', { label: pill('event: location') }), link('courier', 'api')],
        flows: [flow(['api', 'users'], { kind: 'response', rate: 2 }), flow(['courier', 'api'], { kind: 'write', rate: 0.6 })],
        metrics: { rps: { v: '~2k', tone: 'good' }, delay: '~80 ms', wasted: { v: '0%', tone: 'good' }, conns: '1M streams' },
      },
    },
    {
      short: 'WebSockets',
      kind: 'technique',
      title: 'WebSockets: both directions, one connection',
      body: [
        'The app adds chat with the courier, with typing indicators. That needs low-latency messages <b>both ways</b>. A <b>WebSocket</b> starts as an HTTP request, upgrades, and becomes a persistent full-duplex channel with tiny per-message framing.',
        'It’s the right tool for chat, collaborative editing, games and live dashboards. You do give up HTTP niceties — caching, standard status codes, per-request auth — and take on managing long-lived connections yourself.',
      ],
      changes: [{ text: 'Chat + location over one socket', tone: 'good' }],
      concepts: [{ term: 'WebSocket', def: 'A protocol providing a persistent, full-duplex message channel over a single TCP connection, started via HTTP upgrade.' }],
      scene: {
        nodes: [riders(), api({ name: 'Socket server', load: 40, tag: pill('101 Switching Protocols', 'refresh') }), courier({ name: 'Courier app', icon: 'user' })],
        links: [link('users', 'api', { arrow: 'both', label: pill('ws://… full duplex') }), link('courier', 'api', { arrow: 'both' })],
        flows: [flow(['api', 'users'], { kind: 'response', rate: 2 }), flow(['users', 'api'], { rate: 1 }), flow(['courier', 'api', 'users'], { kind: 'write', rate: 0.8 })],
        metrics: { rps: '~2k', delay: { v: '~40 ms', tone: 'good' }, wasted: '0%', conns: '1M sockets' },
      },
    },
    {
      short: 'Gateways',
      kind: 'insight',
      title: 'A million connections are state',
      body: [
        'One process can hold tens or hundreds of thousands of idle sockets, but each costs memory and a file descriptor, and every one is pinned to the machine it landed on. So connections go to a fleet of dedicated <b>gateway</b> servers behind a load balancer.',
        'The gateways are now <i>stateful</i> — the opposite of the stateless app servers from the Scaling module — and that changes how you route, deploy and scale them.',
      ],
      changes: [{ text: '3 gateways × ~330k sockets' }],
      concepts: [{ term: 'Connection gateway', def: 'A server tier dedicated to holding long-lived client connections and relaying messages over them.' }],
      scene: {
        nodes: [riders(), ...gws((i) => ({ load: 60, tag: pill(`${[330, 340, 330][i - 1]}k sockets`, 'link') })), courier({ at: [6, 0] as [number, number] })],
        links: [...[1, 2, 3].map((i) => link('users', `g${i}`, { arrow: 'both' })), ...[1, 2, 3].map((i) => link('courier', `g${i}`, { style: 'dashed' }))],
        flows: [1, 2, 3].map((i) => flow([`g${i}`, 'users'], { kind: 'response', rate: 1 })),
        metrics: { rps: '~2k', delay: '~40 ms', wasted: '0%', conns: '1M on 3 gateways' },
      },
    },
    {
      short: 'Routing',
      kind: 'technique',
      title: 'Which gateway is this customer on?',
      body: [
        'A courier update for order 81733 arrives at the backend — but the customer’s socket lives on Gateway 2. Two common designs: each gateway <b>subscribes</b> to a pub/sub channel for the users connected to it, and the backend publishes to <code>user:4821</code>; or a <b>registry</b> records user → gateway, and the backend sends straight there.',
        'Either way the backend never needs to know which machine holds which socket.',
      ],
      changes: [{ text: 'Publish to user:4821 → Gateway 2', tone: 'good' }],
      scene: {
        nodes: [riders(), ...gws((i) => (i === 2 ? { tag: pill('subscribed: user:4821', 'bolt', 'good') } : {})), courier({ at: [10, 6] as [number, number] }), bus(), registry()],
        links: [...[1, 2, 3].map((i) => link(`g${i}`, 'users', { arrow: 'both' })), link('courier', 'bus', { label: pill('publish') }), ...[1, 2, 3].map((i) => link('bus', `g${i}`, { style: i === 2 ? 'solid' : 'dashed' })), link('g2', 'reg', { style: 'dashed' })],
        flows: [flow(['courier', 'bus', 'g2', 'users'], { kind: 'write', rate: 1 })],
        metrics: { rps: '~2k', delay: '~45 ms', wasted: '0%', conns: '1M on 3 gateways' },
      },
    },
    {
      short: 'Reconnects',
      kind: 'case',
      title: 'Case: a deploy causes a stampede',
      body: [
        'Restarting Gateway 1 drops 330,000 sockets at once. Every client reconnects within the same second, each doing a TLS handshake, auth and a state resync — and the remaining gateways and the auth service fall over under the spike. Their clients reconnect too…',
        'Defences: clients reconnect with <b>exponential backoff and random jitter</b>; gateways drain gradually, closing connections in batches during deploys; and resync sends only what changed since the client’s last event ID.',
      ],
      note: { kind: 'warn', text: 'Any fleet of long-lived clients can synchronise into a thundering herd. Jitter is not optional.' },
      changes: [{ text: '330k reconnects in 1 s', tone: 'bad' }, { text: 'Backoff + jitter + gradual drain', tone: 'good' }],
      concepts: [{ term: 'Jitter', def: 'Randomness added to retry or reconnect delays so many clients don’t act in lockstep.' }],
      scene: {
        nodes: [riders(24, '330k reconnecting'), ...gws((i) => (i === 1 ? { state: 'ghost', tag: pill('restarting', 'refresh', 'warn') } : { load: 97, state: 'hot' }))],
        links: [link('users', 'g1', { style: 'broken' }), link('users', 'g2', { arrow: 'both' }), link('users', 'g3', { arrow: 'both' })],
        flows: [flow(['users', 'g2'], { kind: 'handshake', rate: 5, speed: 0.7 }), flow(['users', 'g3'], { kind: 'handshake', rate: 5, speed: 0.7 }), flow(['users', 'g1'], { kind: 'fail', rate: 3 })],
        metrics: { rps: { v: '330k/s spike', tone: 'bad' }, delay: { v: 'seconds', tone: 'bad' }, wasted: '—', conns: 'churning' },
      },
    },
    {
      short: 'Mobile',
      kind: 'tradeoff',
      title: 'When the app is in the background',
      body: [
        'Phones suspend background apps and kill their sockets to save battery. To reach a user whose app isn’t open — “your food has arrived” — the backend sends through the platform’s push service (APNs on iOS, FCM on Android), which keeps one efficient connection per device on behalf of every app.',
        'Platform push is best-effort, rate-limited and may be delayed or collapsed. Use it to nudge the user; send the real data over your own channel once the app opens.',
      ],
      concepts: [{ term: 'Mobile push notification', def: 'A message delivered by the OS vendor’s push service (APNs, FCM) to a device even when the app isn’t running.' }],
      scene: {
        nodes: [riders(10, 'apps in background', { tone: 'grey' }), box('apns', -3, 0, 'APNs / FCM', 'purple', 'cloud', { size: [1.5, 1.5], height: 38, tag: pill('best-effort', 'cloud', 'warn') }), courier({ name: 'Notify service', icon: 'bolt' })],
        links: [link('courier', 'apns', { label: pill('“Your food arrived”') }), link('apns', 'users')],
        flows: [flow(['courier', 'apns', 'users'], { kind: 'write', rate: 1 })],
        metrics: { rps: '—', delay: '1–10 s', wasted: '0%', conns: 'OS-managed' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Push instead of asking',
      body: [
        '<b>Short polling</b> is simple but trades freshness for load. <b>Long polling</b> and <b>Server-Sent Events</b> deliver server updates promptly over plain HTTP; <b>WebSockets</b> add low-latency two-way messaging.',
        'Persistent connections make gateways stateful: route messages via <b>pub/sub or a registry</b>, reconnect with <b>backoff and jitter</b>, drain gently on deploys, and fall back to platform push when the app isn’t open.',
      ],
      scene: {
        nodes: [riders(), ...gws((i) => ({ load: 55, tag: i === 2 ? pill('jittered reconnects', 'refresh', 'good') : undefined })), courier({ at: [10, 6] as [number, number] }), bus()],
        links: [...[1, 2, 3].map((i) => link(`g${i}`, 'users', { arrow: 'both' })), link('courier', 'bus'), ...[1, 2, 3].map((i) => link('bus', `g${i}`))],
        flows: [...[1, 2, 3].map((i) => flow(['courier', 'bus', `g${i}`, 'users'], { kind: 'write', rate: 0.6 }))],
        metrics: { rps: '~2k', delay: '~45 ms', wasted: '0%', conns: '1M' },
      },
    },
  ],
};

export default lesson;
