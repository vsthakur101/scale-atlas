import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -18, 0, 'Your app server (provider)', 'orange', 'server', { size: [1.5, 1.5], height: 26, ...extra });
const gw = (extra: Partial<SceneNode> = {}) => box('gw', -7, 0, 'OS push service (APNs / FCM)', 'purple', 'cloud', { size: [1.8, 1.8], height: 32, ...extra });
const reg = (extra: Partial<SceneNode> = {}) => db('reg', -7, 9, 'Token registry (token → device)', { size: [1.3, 1.3], ...extra });
const conns = (extra: Partial<SceneNode> = {}) => crowd('conns', 8, 0, 14, 'devices (one shared connection each)', extra);
const store = (extra: Partial<SceneNode> = {}) => db('store', 8, 9, 'Offline message store (TTL)', { size: [1.3, 1.3], ...extra });
const nat = (extra: Partial<SceneNode> = {}) => box('nat', 0, -8, 'Carrier NAT / firewall (idle timeout)', 'red', 'filter', { size: [1.4, 1.4], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'source-how-are-notifications-pushed-to-our-phones-or-pcs',
  title: 'Push Notifications: One Persistent Connection per Device',
  blurb: 'Why apps don’t poll for messages, how the OS keeps one shared connection to the platform’s push service, how keepalives fight NAT timeouts and battery, and the arithmetic of connection servers, heartbeats, broadcast time and reconnect storms.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'srv', label: 'Connection servers for the online devices', icon: 'server' },
    { key: 'hb', label: 'Keepalive packets per second', icon: 'activity' },
    { key: 'wake', label: 'Radio wake-ups per device per hour', icon: 'wifi' },
    { key: 'bc', label: 'Time to deliver a broadcast to all recipients', icon: 'timer' },
    { key: 'storm', label: 'Time to re-establish every connection after an outage', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why not poll: the cost of asking', step: 1 },
    { text: 'One shared persistent connection per device', step: 2 },
    { text: 'Keepalives, NAT timeouts and battery', step: 3 },
    { text: 'Delivery semantics: TTL, collapse, priority', step: 4 },
    { text: 'Fan-out, rate limits and reconnect storms', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'dev', label: 'Online devices', min: 10000, max: 2000000000, step: 10000, default: 50000000, unit: '', description: 'Devices holding a connection to the push service.' },
      { key: 'ka', label: 'Keepalive interval', min: 10, max: 1800, step: 10, default: 300, unit: ' s', description: 'How often the device pings the service.' },
      { key: 'cps', label: 'Connections per gateway server', min: 10000, max: 5000000, step: 10000, default: 500000, unit: '', description: 'Concurrent sockets one server holds.' },
      { key: 'send', label: 'Fleet send rate', min: 1000, max: 50000000, step: 1000, default: 200000, unit: '/s', description: 'Notifications the service can deliver per second.' },
      { key: 'rcpt', label: 'Broadcast recipients', min: 1000, max: 1000000000, step: 1000, default: 20000000, unit: '', description: 'Devices in one campaign.' },
      { key: 'hs', label: 'New connections one server can accept', min: 100, max: 100000, step: 100, default: 5000, unit: '/s', description: 'TLS handshake capacity per server.' },
    ],
    calculate: (input, step) => {
      const dev = Math.max(1, input.dev ?? 5e7);
      const ka = Math.max(1, input.ka ?? 300);
      const cps = Math.max(1, input.cps ?? 5e5);
      const send = Math.max(1, input.send ?? 2e5);
      const rcpt = Math.max(1, input.rcpt ?? 2e7);
      const hs = Math.max(1, input.hs ?? 5000);
      const srv = Math.ceil(dev / cps);
      const hb = dev / ka;
      const wake = 3600 / ka;
      const bc = rcpt / send;
      const storm = dev / (srv * hs);
      return {
        srv: step < 2 ? { v: '—' } : { v: `${fmtN(srv)} servers (${fmtN(dev)} ÷ ${fmtN(cps)})`, tone: 'good' },
        hb: step < 3 ? { v: '—' } : { v: `${fmtN(hb)}/s (${fmtN(dev)} ÷ ${ka} s)`, tone: hb < 1e6 ? 'good' : 'warn' },
        wake: step < 3 ? { v: '—' } : { v: `${wake.toFixed(0)} per hour`, tone: wake < 30 ? 'good' : wake < 120 ? 'warn' : 'bad' },
        bc: step < 5 ? { v: '—' } : { v: `${fmtT(bc)} (${fmtN(rcpt)} ÷ ${fmtN(send)}/s)`, tone: bc < 300 ? 'good' : 'warn' },
        storm: step < 5 ? { v: '—' } : { v: `${fmtT(storm)} at ${fmtN(srv * hs)} handshakes/s`, tone: storm < 120 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Poll?',
      kind: 'problem',
      title: 'Asking constantly is wasteful, and the OS forbids it',
      body: [
        'A messaging app wants to show a message within a second of its arrival, even when closed. The naive solution — every app polls its server every few seconds — fails on every axis. <b>Battery</b>: each poll wakes the radio, which then stays in a high-power state for seconds; 50 apps polling would keep a phone radio permanently on. <b>Server load</b>: 50 million devices polling every 10 s is <b>5 million requests/s</b>, almost all returning “nothing new”. <b>Latency</b>: average delay is half the interval. And mobile operating systems suspend background apps, so a poll loop doesn’t run anyway.',
        'The OS solution is <b>push</b>: instead of each app polling, the <b>operating system</b> keeps <b>one</b> long-lived connection to the platform’s push service (Apple’s <b>APNs</b>, Google’s <b>FCM</b>, or the equivalent on Windows/browsers), shared by every app on the device. Apps register once, are handed an opaque <b>device token</b>, and their servers send notifications <i>to the push service</i>, which relays them down the connection — waking the app or showing a notification. The cost of staying reachable is paid once per device, not once per app.',
      ],
      scene: { nodes: [app({ tag: pill('has a device token', 'key') }), gw(), conns()], links: [link('app', 'gw'), link('gw', 'conns')], flows: [flow(['app', 'gw', 'conns'], { rate: 1.6 })] },
    },
    {
      short: 'Shared',
      kind: 'technique',
      title: 'One shared persistent connection per device',
      body: [
        '<b>Registration</b>: the app asks the OS for a push token; the OS contacts the push service (authenticating the device, app and developer) and returns an <b>opaque token</b> identifying <i>this app on this device</i>. The app sends the token to its own server, which stores it against the user (and removes it when it is invalidated). <b>Sending</b>: the app server calls the push service’s HTTP/2 API (APNs) or HTTPS API (FCM) with the token, a payload (a few KB at most) and delivery options; the service looks up which connection holds that device and writes the message down it. The OS hands it to the app or displays it.',
        'The service’s core is a <b>connection fleet</b>: tens of millions to billions of long-lived sockets (TLS over TCP, often HTTP/2 or custom framing), each pinned to a gateway server. A server can hold ~500,000 idle connections (memory per socket, kernel tuning, event-driven I/O — see the C10K lesson), so 50 million online devices need <b>100 servers</b>, plus a routing layer mapping token → gateway (a distributed registry) and queues for devices that are offline. Because connections are <i>idle</i> nearly all the time, the cost is memory and keepalive traffic, not CPU.',
      ],
      changes: [{ text: 'App registers → OS → push service returns an opaque token', tone: 'info' }, { text: 'App server sends token + payload to the push API', tone: 'info' }, { text: '50M devices ÷ 500k per server = 100 gateway servers', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('POST token + payload', 'share') }), gw({ tag: pill('token → gateway → socket', 'hash') }), reg({ tag: pill('50M tokens', 'db') }), conns({ tag: pill('shared by all apps', 'users') })], links: [link('app', 'gw'), link('gw', 'reg'), link('gw', 'conns')], flows: [flow(['app', 'gw', 'conns'], { rate: 1.6 })] },
    },
    {
      short: 'Keepalive',
      kind: 'technique',
      title: 'Keepalives, NAT timeouts and battery',
      body: [
        'A connection that is silent for too long is <b>silently dropped</b> by <b>NAT gateways and carrier firewalls</b>, which expire idle mappings (home routers ~minutes; mobile carrier NATs from a few minutes to a half hour, sometimes far less). The device then thinks it is connected, while the server’s messages vanish — until the next write fails. So the client sends periodic <b>keepalive</b> pings, tuned to stay inside the shortest NAT timeout. Too frequent: battery and signalling cost; too infrequent: dropped connections and delayed delivery.',
        'The arithmetic: 50 million devices pinging every 300 s is <b>166,667 keepalives/s</b> for the fleet — trivial — but each <b>wakes the radio</b>: 12 times an hour per device. At 30 s that is 1.7 million/s and 120 wake-ups/hour, and battery drain becomes noticeable. Platforms therefore <b>adapt intervals</b> to the network (longer on Wi-Fi than cellular; learned per carrier), coalesce system-wide traffic so apps share radio wake-ups, and prefer <b>power-efficient transports</b> (the OS’s push channel rather than per-app sockets). When a connection does drop, the client reconnects and the service delivers anything queued.',
      ],
      changes: [{ text: 'NAT expires idle mappings: ping inside the shortest timeout', tone: 'info' }, { text: '300 s: 167k pings/s, 12 wake-ups/h · 30 s: 1.7M/s, 120/h', tone: 'info' }, { text: 'Adaptive intervals; coalesce radio wake-ups', tone: 'good' }],
      scene: { nodes: [conns({ tag: pill('ping every 300 s', 'timer') }), nat({ tag: pill('idle mapping dropped after N min', 'alert', 'warn') }), gw({ tag: pill('167k keepalives/s', 'activity') })], links: [link('conns', 'nat'), link('nat', 'gw')], flows: [flow(['conns', 'nat', 'gw'], { kind: 'handshake', rate: 1, back: true })] },
    },
    {
      short: 'Delivery',
      kind: 'technique',
      title: 'Delivery semantics: best effort with controls',
      body: [
        'Push is <b>at-most-once best effort</b>, not a guaranteed queue: the service stores a notification only for a limited time if the device is offline. Sender controls: <b>TTL / expiration</b> (a “flash sale ends in 10 minutes” notification is worthless after 10 — set the TTL to match; expired messages are dropped), <b>priority</b> (high-priority messages may wake a dozing device immediately; normal priority is batched for battery — abusing high priority gets throttled), <b>collapse keys / apns-collapse-id</b> (only the latest of “you have N new messages” is kept for an offline device, rather than N stale ones), and <b>silent / data messages</b> that wake the app to fetch fresh content.',
        'Design consequences: treat the notification as a <b>doorbell, not the data</b> — keep the payload small and ID-based and fetch the authoritative content from your API when the app opens (a notification can be lost, delayed or duplicated); send <b>end-to-end encrypted</b> payloads through push for private messaging (the push service only sees ciphertext); handle <b>invalid-token</b> responses by pruning tokens; respect user permission and quiet hours; and measure delivery with receipts or in-app confirmation. Web push (Push API + service workers + VAPID keys) follows the same pattern through browser vendors’ push services.',
      ],
      changes: [{ text: 'Best effort: TTL, priority and collapse keys are your controls', tone: 'info' }, { text: 'Notification = doorbell; fetch real data from your API', tone: 'good' }, { text: 'Prune invalid tokens; E2E-encrypt private payloads', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('ttl 600 · collapse “inbox”', 'list') }), gw({ tag: pill('offline? store, then expire', 'clock') }), store({ tag: pill('latest only', 'db') }), conns()], links: [link('app', 'gw'), link('gw', 'store'), link('gw', 'conns')], flows: [flow(['app', 'gw', 'conns'], { rate: 1.6 }), flow(['gw', 'store'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Fan-out',
      kind: 'problem',
      title: 'Fan-out, rate limits and reconnect storms',
      body: [
        'A <b>campaign to 20 million devices</b> is a fan-out problem: at a fleet capacity of 200,000 notifications/s the send takes <b>100 seconds</b> — and that is if the provider’s own request rate is allowed that high. Providers and platforms rate-limit senders, so large sends use <b>topics</b> (FCM topic subscriptions: one API call, the service fans out), <b>batched requests</b>, and staggering by time zone or segment; also protect your own backend from the thundering herd when millions of users tap a notification at once.',
        'Failure recovery is its own load: if a gateway region fails or a network blip drops connections, <b>every device reconnects at once</b>. 50 million reconnects through 100 servers each accepting 5,000 TLS handshakes/s is <b>100 seconds</b> of full-capacity handshake work — plus queued notifications flushing as each device returns. Defences: <b>jittered, exponential client backoff</b>, TLS session resumption (cheap handshakes), spare handshake capacity, admission control, and slow-start of message replay. Figures in this lesson are model outputs for the stated fleet; real services differ widely.',
      ],
      changes: [{ text: '20M ÷ 200k/s = 100 s for a full broadcast', tone: 'info' }, { text: '50M reconnects ÷ 500k handshakes/s = 100 s storm', tone: 'bad' }, { text: 'Topics, batching, staggering; jittered backoff; session resumption', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('campaign: 20M', 'users') }), gw({ state: 'hot', tag: pill('200k/s send', 'gauge', 'warn') }), conns({ tag: pill('reconnect storm', 'alert', 'warn') })], links: [link('app', 'gw'), link('gw', 'conns')], flows: [flow(['app', 'gw', 'conns'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'One shared socket per device, a doorbell not a data channel',
      body: [
        'The OS holds <b>one persistent connection</b> per device to the push service, shared by all apps; your server sends to it with a token. <b>Keepalives</b> beat NAT timeouts at a battery cost; delivery is best effort with TTL, priority and collapse keys; fan-out and reconnect storms need rate limits, topics, jittered backoff and spare handshake capacity.',
        'Send small ID-based payloads and fetch the real data over your API.',
      ],
      scene: { nodes: [app(), gw(), reg(), conns(), store()], links: [link('app', 'gw'), link('gw', 'reg'), link('gw', 'conns'), link('gw', 'store')], flows: [flow(['app', 'gw', 'conns'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
