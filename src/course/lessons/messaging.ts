import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill, you } from '../kit';

const sam = (extra: Partial<SceneNode> = {}) => you('sam', -13, -5, { label: pill('Sam', 'user'), ...extra });
const kai = (extra: Partial<SceneNode> = {}) => you('kai', -13, 7, { label: pill('Kai', 'user'), ...extra });
const gw1 = (extra: Partial<SceneNode> = {}) => box('gw1', -5, -5, 'Gateway 1', 'teal', 'wifi', { size: [1.2, 1.2], height: 32, ...extra });
const gw2 = (extra: Partial<SceneNode> = {}) => box('gw2', -5, 7, 'Gateway 2', 'teal', 'wifi', { size: [1.2, 1.2], height: 32, ...extra });
const chat = (extra: Partial<SceneNode> = {}) => box('chat', 3, 1, 'Chat service', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('msgs', 11, 1, 'Messages', { tone: 'yellow', icon: 'layers', sub: 'by conversation', ...extra });
const presence = (extra: Partial<SceneNode> = {}) => box('reg', 3, -9, 'Sessions', 'red', 'key', { size: [1.2, 1.2], height: 30, sub: 'user → gateway', ...extra });
const push = (extra: Partial<SceneNode> = {}) => box('push', 3, 11, 'Push notify', 'purple', 'cloud', { size: [1.2, 1.2], height: 30, ...extra });

const base = [link('sam', 'gw1', { arrow: 'both' }), link('kai', 'gw2', { arrow: 'both' }), link('gw1', 'chat', { arrow: 'both' }), link('gw2', 'chat', { arrow: 'both' }), link('chat', 'msgs', { arrow: 'both' }), link('chat', 'reg', { arrow: 'both', style: 'dashed' })];
const send = [flow(['sam', 'gw1', 'chat', 'msgs'], { kind: 'write', rate: 0.8 }), flow(['chat', 'gw2', 'kai'], { kind: 'write', rate: 0.8 })];

const lesson: Lesson = {
  slug: 'messaging',
  title: 'A Messaging App',
  blurb: 'Deliver chat messages to the right devices in under a second, in order, exactly once from the user’s point of view — even offline.',
  minutes: 15,
  level: 'Advanced',
  metrics: [
    { key: 'lat', label: 'Send → deliver', icon: 'timer' },
    { key: 'conns', label: 'Open sockets', icon: 'link' },
    { key: 'rate', label: 'Messages / s', icon: 'activity' },
    { key: 'dupes', label: 'Dupes / gaps', icon: 'alert' },
  ],
  goals: [
    { text: 'Persistent connections through gateways', step: 2 },
    { text: 'The send path: persist, then deliver', step: 3 },
    { text: 'Ordering and deduplication', step: 5 },
    { text: 'Storage by conversation and group fan-out', step: 7 },
    { text: 'Receipts, presence and end-to-end encryption', step: 9 },
  ],
  legend: ['request', 'response', 'write', 'handshake', 'fail'],
  steps: [
    {
      short: 'Scope',
      kind: 'problem',
      title: 'Requirements for a chat system',
      body: [
        'One-to-one and group chats (up to 1,000 members), message history on every device, delivered and read receipts, online indicators, and push notifications when the app is closed. 500M daily users, 50M connected at once, ~1M messages/s at peak.',
        'Non-functional: delivery under 500 ms when both are online; <b>no lost messages</b>; messages in a conversation appear in the <b>same order</b> for everyone; a retried send must not appear twice.',
      ],
      scene: {
        nodes: [sam({ tag: pill('“lunch at 1?”', 'file') }), kai(), chat()],
        links: [link('sam', 'chat'), link('chat', 'kai')],
        flows: [flow(['sam', 'chat', 'kai'], { kind: 'write', rate: 0.8 })],
        metrics: { lat: '< 500 ms', conns: '50M', rate: '1M peak', dupes: 'must be 0' },
      },
    },
    {
      short: 'Gateways',
      kind: 'technique',
      title: 'Every online device holds a socket',
      body: [
        'Each online device keeps a WebSocket (or similar persistent connection) to a <b>gateway</b> — a stateful tier whose only job is holding millions of connections and relaying frames. Business logic lives in stateless chat services behind them.',
        'When a device connects, its gateway records <code>user/device → gateway</code> in a fast session registry, so messages can be routed to wherever that device is connected right now.',
      ],
      changes: [{ text: '50M sockets over ~500 gateways' }],
      scene: {
        nodes: [sam(), kai(), gw1({ tag: pill('~100k sockets each', 'link') }), gw2(), chat(), presence({ tag: pill('kai:phone → gw2', 'key') })],
        links: [link('sam', 'gw1', { arrow: 'both' }), link('kai', 'gw2', { arrow: 'both' }), link('gw1', 'chat', { arrow: 'both' }), link('gw2', 'chat', { arrow: 'both' }), link('gw2', 'reg', { style: 'dashed' })],
        flows: [flow(['gw2', 'reg'], { kind: 'handshake', rate: 0.4 }), flow(['sam', 'gw1'], { kind: 'handshake', back: true, rate: 0.4 })],
        metrics: { lat: '—', conns: '50M', rate: '—', dupes: '—' },
      },
    },
    {
      short: 'Send',
      kind: 'technique',
      title: 'Persist first, then deliver',
      body: [
        'Sam’s client sends the message over its socket with a <b>client-generated ID</b>. The chat service assigns the next <b>sequence number</b> in that conversation, writes the message durably, and only then acks Sam (“sent” ✓).',
        'Then it looks up Kai’s devices in the registry and forwards the message to their gateways. Persisting before delivering means a crash anywhere afterwards can’t lose the message — the worst case is a delayed delivery.',
      ],
      changes: [{ text: 'Write → ack → deliver', tone: 'good' }, { text: 'Delivery ~120 ms', tone: 'good' }],
      scene: {
        nodes: [sam({ tag: pill('✓ sent', 'check', 'good') }), kai({ tag: pill('new message', 'bolt') }), gw1(), gw2(), chat({ tag: pill('seq 4,812 in conv 77', 'hash') }), store(), presence()],
        links: base,
        flows: send,
        metrics: { lat: { v: '120 ms', tone: 'good' }, conns: '50M', rate: '1M peak', dupes: '—' },
      },
    },
    {
      short: 'Offline',
      kind: 'technique',
      title: 'Kai is offline',
      body: [
        'The registry has no live device for Kai. The message is already stored, so nothing is lost: the chat service triggers a <b>push notification</b> through the phone platform’s service.',
        'When Kai opens the app, the client reconnects and asks “give me everything in my conversations after the last sequence numbers I have”. The server answers from storage. Delivery-on-reconnect is just a range read.',
      ],
      changes: [{ text: 'Push sent', tone: 'good' }, { text: 'Sync on reconnect: after seq 4,811', tone: 'good' }],
      scene: {
        nodes: [sam(), kai({ state: 'dim', tag: pill('offline', 'wifi', 'warn') }), gw1(), gw2({ state: 'dim' }), chat(), store(), presence({ tag: pill('kai: no live device', 'x') }), push({ tag: pill('“Sam: lunch at 1?”', 'bolt', 'good') })],
        links: [...base.filter((l) => l.from !== 'kai' && l.to !== 'kai'), link('chat', 'push'), link('push', 'kai', { style: 'dashed' })],
        flows: [flow(['sam', 'gw1', 'chat', 'msgs'], { kind: 'write', rate: 0.8 }), flow(['chat', 'push', 'kai'], { kind: 'write', rate: 0.5 })],
        metrics: { lat: 'on reconnect', conns: '50M', rate: '1M peak', dupes: '0 lost' },
      },
    },
    {
      short: 'Order & dupes',
      kind: 'technique',
      title: 'Same order for everyone, no duplicates',
      body: [
        'Device clocks disagree, so timestamps can’t order messages. The server-assigned <b>per-conversation sequence number</b> defines the order every client displays, and lets a client spot a gap (got 4,812 but not 4,811) and fetch it.',
        'If Sam’s ack is lost and the client resends, the server sees the same <b>client message ID</b> and returns the original sequence number instead of storing it twice. At-least-once transport plus idempotent handling looks exactly-once to users.',
      ],
      changes: [{ text: 'Retry → same seq, no duplicate', tone: 'good' }],
      concepts: [{ term: 'Per-conversation sequence', def: 'A monotonically increasing number assigned by the server to each message in a conversation, defining a single order.' }],
      scene: {
        nodes: [sam({ tag: pill('resend client_id a7f3', 'refresh', 'warn') }), kai({ tag: pill('… 4,811 · 4,812', 'list', 'good') }), gw1(), gw2(), chat({ tag: pill('a7f3 already = 4,812', 'check', 'good') }), store(), presence()],
        links: base,
        flows: [flow(['sam', 'gw1', 'chat'], { kind: 'write', back: true, rate: 0.8 }), flow(['chat', 'gw2', 'kai'], { kind: 'write', rate: 0.5 })],
        metrics: { lat: '120 ms', conns: '50M', rate: '1M peak', dupes: { v: '0 / 0', tone: 'good' } },
      },
    },
    {
      short: 'Storage',
      kind: 'technique',
      title: 'Store messages by conversation',
      body: [
        'Message storage is write-heavy (~1M/s), append-mostly, and read as “the latest N messages of conversation X, then page backwards”. That’s a natural fit for a <b>wide-column</b> store partitioned by <code>conversation_id</code> and clustered by sequence number.',
        'Each read is a single-partition range scan. Very large group conversations can be split into time buckets so no partition grows without bound.',
      ],
      changes: [{ text: 'Partition: conversation_id · order: seq', tone: 'good' }],
      scene: {
        nodes: [sam(), kai(), gw1(), gw2(), chat(), store({ tag: pill('(conv 77, seq ↓) range scan', 'layers', 'good') }), presence()],
        links: base,
        flows: [...send, flow(['chat', 'msgs'], { back: true, rate: 1 })],
        metrics: { lat: '120 ms', conns: '50M', rate: '1M/s writes', dupes: '0 / 0' },
      },
    },
    {
      short: 'Groups',
      kind: 'tradeoff',
      title: 'Group messages fan out',
      body: [
        'A message to a 500-member group is stored <b>once</b>, then delivered to every online member’s devices — 500 registry lookups and gateway pushes. The chat service groups recipients by gateway so each gateway receives one batch.',
        'For very large groups or broadcast channels, stop pushing full messages to everyone: send a lightweight “new messages in channel X” signal and let clients pull — the same push/pull trade-off as social feeds.',
      ],
      scene: {
        nodes: [sam({ tag: pill('to #team (500)', 'users') }), kai(), gw1(), gw2({ tag: pill('batch: 212 members', 'layers') }), box('gw3', -5, 1, 'Gateway 3', 'teal', 'wifi', { size: [1.2, 1.2], height: 32, tag: pill('batch: 160', 'layers') }), chat({ tag: pill('store once, fan out', 'share', 'good') }), store(), presence()],
        links: [...base, link('gw3', 'chat', { arrow: 'both' })],
        flows: [flow(['sam', 'gw1', 'chat', 'msgs'], { kind: 'write', rate: 0.6 }), flow(['chat', 'gw2'], { kind: 'write', rate: 1.5 }), flow(['chat', 'gw3'], { kind: 'write', rate: 1.5 }), flow(['chat', 'gw1'], { kind: 'write', rate: 1 })],
        metrics: { lat: '180 ms', conns: '50M', rate: '1M/s', dupes: '0 / 0' },
      },
    },
    {
      short: 'Receipts',
      kind: 'technique',
      title: 'Receipts and presence, cheaply',
      body: [
        '<b>Receipts</b> are just tiny messages flowing back: Kai’s device reports “delivered up to seq 4,812” and later “read up to 4,812”. Sending the high-water mark rather than one receipt per message keeps the volume down.',
        '<b>Presence</b> is the expensive feature: naively, every online/offline change fans out to all contacts. Instead, derive it from connection heartbeats, publish changes only to users who are currently viewing that contact, and accept a few seconds of staleness.',
      ],
      changes: [{ text: 'Receipts as high-water marks', tone: 'good' }, { text: 'Presence only to active viewers', tone: 'good' }],
      scene: {
        nodes: [sam({ tag: pill('✓✓ read', 'check', 'good') }), kai({ tag: pill('read up to 4,812', 'check') }), gw1(), gw2(), chat(), store(), presence({ tag: pill('Kai: online (heartbeat)', 'heart') })],
        links: base,
        flows: [flow(['kai', 'gw2', 'chat', 'gw1', 'sam'], { kind: 'handshake', rate: 0.6 }), flow(['gw2', 'chat', 'reg'], { kind: 'handshake', rate: 0.4 })],
        metrics: { lat: '120 ms', conns: '50M', rate: '1M/s + receipts', dupes: '0 / 0' },
      },
    },
    {
      short: 'E2E',
      kind: 'insight',
      title: 'End-to-end encryption changes the server’s job',
      body: [
        'With <b>end-to-end encryption</b>, devices encrypt messages with keys that never leave them (protocols in the Signal family); the server stores and routes ciphertext it cannot read. Each of Kai’s devices has its own keys, so a message is encrypted per recipient device.',
        'Consequences: server-side search, spam filtering on content and history sync to new devices all have to work differently — on devices, or via encrypted backups. The architecture stays the same; what the server knows shrinks dramatically.',
      ],
      concepts: [{ term: 'End-to-end encryption', def: 'Only the communicating devices hold the keys; intermediaries, including the service provider, see only ciphertext.' }],
      scene: {
        nodes: [sam({ tag: pill('encrypt for Kai’s 2 devices', 'lock', 'good') }), kai({ tag: pill('decrypt locally', 'key', 'good') }), gw1(), gw2(), chat({ tag: pill('routes ciphertext only', 'lock') }), store({ tag: pill('ciphertext', 'lock') }), presence()],
        links: base,
        flows: send,
        metrics: { lat: '130 ms', conns: '50M', rate: '1M/s', dupes: '0 / 0' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Persist, sequence, route, sync',
      body: [
        'Devices hold persistent connections to stateful <b>gateways</b>; stateless chat services <b>persist first</b>, assign a <b>per-conversation sequence</b>, ack the sender, then route via a <b>session registry</b>. Offline devices get a <b>push</b> and <b>sync by sequence</b> on reconnect.',
        'Client message IDs make retries idempotent; messages live in a store partitioned by conversation; groups are stored once and fanned out (or pulled when huge); receipts and presence are kept cheap; end-to-end encryption leaves the server routing ciphertext.',
      ],
      scene: {
        nodes: [sam(), kai(), gw1(), gw2(), chat({ tag: pill('persist → seq → route', 'check', 'good') }), store(), presence(), push()],
        links: [...base, link('chat', 'push', { style: 'dashed' })],
        flows: send,
        metrics: { lat: '120 ms', conns: '50M', rate: '1M/s', dupes: '0 / 0' },
      },
    },
  ],
};

export default lesson;
