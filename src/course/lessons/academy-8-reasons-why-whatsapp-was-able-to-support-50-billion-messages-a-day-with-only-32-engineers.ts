import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const phoneA = (extra: Partial<SceneNode> = {}) => box('a', -16, -5, 'Alice’s phone', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const phoneB = (extra: Partial<SceneNode> = {}) => box('b', 16, -5, 'Bob’s phone', 'orange', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const edge = (id: string, r: number, name: string, extra: Partial<SceneNode> = {}) => box(id, r, -5, name, 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 0, 5, 'Undelivered queue', { size: [1.4, 1.4], ...extra });
const crowdN = (extra: Partial<SceneNode> = {}) => crowd('crowd', -16, 6, 8, 'users', extra);

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-8-reasons-why-whatsapp-was-able-to-support-50-billion-messages-a-day-with-only-32-engineers',
  title: 'Messaging at Scale: Connections, Queues and End-to-End Encryption',
  blurb: 'Persistent connections, store-and-forward for offline phones, delivery receipts, group fan-out and E2E encryption — the mechanisms that let a small team run billions of messages a day.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'srv', label: 'Connection servers needed', icon: 'server' },
    { key: 'mps', label: 'Messages per second (average)', icon: 'activity' },
    { key: 'del', label: 'Deliveries per second (with groups)', icon: 'share' },
    { key: 'off', label: 'Offline queue storage', icon: 'disk' },
  ],
  goals: [
    { text: 'Why many mostly-idle persistent connections are cheap on the right runtime', step: 1 },
    { text: 'The message path and delivery receipts', step: 2 },
    { text: 'Store-and-forward for offline recipients', step: 3 },
    { text: 'End-to-end encryption and what the server can see', step: 4 },
    { text: 'Group fan-out and why simplicity scales', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Connected users', min: 1000000, max: 2000000000, step: 1000000, default: 500000000, unit: '', description: 'Phones holding a connection at a typical moment.' },
      { key: 'per', label: 'Connections per server', min: 100000, max: 3000000, step: 100000, default: 1000000, unit: '', description: 'Concurrent connections one tuned server can hold (idle-dominated).' },
      { key: 'msgs', label: 'Messages sent per user per day', min: 1, max: 200, step: 1, default: 40, unit: '', description: 'Average messages originated.' },
      { key: 'group', label: 'Average recipients per message', min: 1, max: 20, step: 0.5, default: 2.5, unit: '', description: 'Mix of one-to-one and group chats.' },
      { key: 'off', label: 'Recipients offline when the message arrives', min: 0, max: 50, step: 1, default: 8, unit: '%', description: 'Share of deliveries that must be queued.' },
      { key: 'days', label: 'Average days until an offline user reconnects', min: 0.1, max: 30, step: 0.1, default: 1, unit: ' d', description: 'How long queued messages wait.' },
      { key: 'bytes', label: 'Stored bytes per message', min: 100, max: 5000, step: 50, default: 1000, unit: ' B', description: 'Encrypted payload plus envelope.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 5e8);
      const per = Math.max(1, input.per ?? 1e6);
      const msgs = Math.max(0, input.msgs ?? 40);
      const group = Math.max(1, input.group ?? 2.5);
      const off = Math.min(1, Math.max(0, (input.off ?? 8) / 100));
      const days = Math.max(0.01, input.days ?? 1);
      const bytes = Math.max(1, input.bytes ?? 1000);
      const mps = (users * msgs) / 86400;
      const dps = mps * group;
      // Offline deliveries accumulate for `days` before the recipient comes back.
      const queued = dps * 86400 * off * days;
      return {
        srv: step < 1 ? { v: '—' } : { v: fmtN(Math.ceil(users / per)), tone: 'good' },
        mps: step < 1 ? { v: '—' } : { v: fmtN(mps) },
        del: step < 4 ? { v: '—' } : { v: fmtN(dps), tone: dps > 1e6 ? 'warn' : 'good' },
        off: step < 2 ? { v: '—' } : { v: `${fmtB(queued * bytes)} (${fmtN(queued)} messages)`, tone: queued * bytes > 5e12 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Connections',
      kind: 'insight',
      title: 'Hold a connection per phone, and keep it cheap',
      body: [
        'A chat app delivers a message the instant it is sent, so every online phone keeps a <b>persistent connection</b> to a front-end server (historically a customised XMPP, now a compact binary protocol over TCP/TLS). Most connections are idle most of the time — a heartbeat now and then — so the cost per connection is memory, not CPU.',
        'The recipe for millions of them per machine: a runtime with <b>very cheap lightweight processes</b> (the Erlang/BEAM virtual machine — a process per connection, a few KB each, preemptively scheduled, isolated so one crash doesn’t spread), tuned kernel limits, and no threads-per-connection (see the C10K lesson). At 1 million connections per server, <b>500 million connected users need ~500 front-end servers</b>.',
      ],
      changes: [{ text: 'One lightweight process per connection', tone: 'good' }, { text: '500M users ÷ 1M per server = 500 servers', tone: 'info' }],
      scene: { nodes: [crowdN({ tag: pill('persistent connection each', 'bolt') }), edge('s1', -4, 'Connection server'), edge('s2', 8, 'Connection server')], links: [link('crowd', 's1'), link('crowd', 's2')], flows: [flow(['crowd', 's1'], { rate: 1 }), flow(['crowd', 's2'], { rate: 1 })] },
    },
    {
      short: 'Path',
      kind: 'technique',
      title: 'The message path and the ticks',
      body: [
        'Alice’s phone sends the message over its connection to her server; the server <b>acknowledges receipt</b> (one grey tick — “sent”), looks up which server holds Bob’s connection (a routing table keyed by user, held in memory and updated on connect/disconnect), forwards it, and Bob’s phone acknowledges (second tick — “delivered”). When Bob opens the chat a <b>read receipt</b> flows back (blue ticks). Each acknowledgement is itself a tiny message through the same path.',
        'Messages carry a client-generated id so retries are <b>idempotent</b> (see the Idempotency lesson), and the server is deliberately thin: it routes opaque encrypted blobs and keeps almost no state — which is what makes the system easy to scale and to operate with a tiny team. The average rate: 500M users × 40 messages ÷ 86,400 s ≈ <b>230,000 messages per second</b>.',
      ],
      changes: [{ text: '1 tick: server has it · 2: recipient’s phone has it · blue: read', tone: 'info' }, { text: '500M × 40 / day ≈ 230k msgs/s', tone: 'info' }],
      scene: { nodes: [phoneA({ tag: pill('msg id + ciphertext', 'hash') }), edge('s1', -8, 'Alice’s server', { tag: pill('ack: sent', 'check') }), edge('s2', 8, 'Bob’s server', { tag: pill('route by user', 'route') }), phoneB({ tag: pill('ack: delivered', 'check', 'good') })], links: [link('a', 's1'), link('s1', 's2'), link('s2', 'b')], flows: [flow(['a', 's1', 's2', 'b'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Offline',
      kind: 'technique',
      title: 'Store-and-forward for phones that are off',
      body: [
        'If Bob is offline (no routing entry), the server <b>stores the message</b> in a durable queue keyed by recipient and delivers it when he next connects, then <b>deletes it</b> once acknowledged. The server is a temporary mailbox, not an archive: history lives on the devices (hence local backups). Push notifications (see that lesson) wake the phone to reconnect.',
        'Storage is bounded by the queue’s depth: with 8% of deliveries to offline users who return after a day, 575,000 deliveries/s × 8% × 86,400 s = ~4 billion queued messages ≈ <b>4 TB</b> at 1 KB. Cap retention (messages expire after a few weeks), ack-then-delete promptly, and shard queues by recipient.',
      ],
      changes: [{ text: 'Queue by recipient → deliver on reconnect → delete after ack', tone: 'good' }, { text: 'Retention cap; server is a mailbox, not an archive', tone: 'good' }],
      scene: { nodes: [phoneA(), edge('s1', -8, 'Server'), store({ tag: pill('held until Bob connects', 'clock') }), phoneB({ state: 'down', tone: 'grey', tag: pill('offline', 'pause') })], links: [link('a', 's1'), link('s1', 'store'), link('store', 'b', { style: 'dashed' })], flows: [flow(['a', 's1', 'store'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'E2E',
      kind: 'technique',
      title: 'End-to-end encryption: the server sees ciphertext',
      body: [
        'With <b>end-to-end encryption</b> (the Signal protocol) the message is encrypted on Alice’s phone with keys only Alice’s and Bob’s devices hold, and decrypted only on Bob’s. Each user uploads <b>public keys</b> (an identity key, a signed prekey and a batch of one-time prekeys) to the server. Alice fetches Bob’s bundle and runs an <b>X3DH</b> key agreement to derive a shared secret even though Bob is offline; the <b>Double Ratchet</b> then derives a fresh key for every message, giving <b>forward secrecy</b> (past messages stay safe if a key leaks) and <b>post-compromise recovery</b>.',
        'The server’s role shrinks to routing and queuing opaque blobs plus a key directory — it cannot read content, which also removes the temptation and the ability to mine or search it. Costs: no server-side search or content moderation by reading, multi-device needs per-device key sets, and users must verify <b>safety numbers</b> to defeat a malicious key directory.',
      ],
      changes: [{ text: 'X3DH start + Double Ratchet per message', tone: 'good' }, { text: 'Server holds public keys and ciphertext only', tone: 'good' }, { text: 'Verify safety numbers to detect key substitution', tone: 'info' }],
      concepts: [{ term: 'Double Ratchet', def: 'A key-derivation scheme that updates encryption keys with every message, giving forward secrecy and recovery from key compromise.' }],
      scene: { nodes: [phoneA({ tag: pill('encrypt with Bob’s keys', 'lock') }), edge('s1', 0, 'Server: ciphertext only', { tag: pill('cannot read', 'shield', 'good') }), phoneB({ tag: pill('decrypt locally', 'lock') })], links: [link('a', 's1'), link('s1', 'b')], flows: [flow(['a', 's1', 'b'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Groups',
      kind: 'technique',
      title: 'Group fan-out',
      body: [
        'A message to a group must reach each member. Encrypting separately for every member makes the sender do O(n) work; <b>sender keys</b> let the sender encrypt <i>once</i> with a group key distributed to members through the pairwise E2E channels, so the server fans out the same ciphertext to each member’s connection or queue. Fan-out is therefore a server-side copy, not a re-encryption.',
        'Deliveries exceed messages: at an average of 2.5 recipients, 230k messages/s become <b>~575,000 deliveries/s</b> across the fleet. Group size limits (hundreds to thousands) bound the multiplier, and large broadcast channels use a different, read-optimised design. Membership changes require re-keying — removing someone means new sender keys so they can’t read future messages.',
      ],
      changes: [{ text: 'Sender key: encrypt once, server copies to members', tone: 'good' }, { text: '2.5 recipients avg → ~575k deliveries/s', tone: 'info' }, { text: 'Membership change → new sender keys', tone: 'info' }],
      scene: { nodes: [phoneA(), edge('s1', -4, 'Server fan-out', { tag: pill('same ciphertext × members', 'share') }), box('m1', 8, -9, 'Member 1', 'orange', 'user', { size: [1, 1], height: 20 }), box('m2', 8, -5, 'Member 2', 'orange', 'user', { size: [1, 1], height: 20 }), box('m3', 8, -1, 'Member 3', 'orange', 'user', { size: [1, 1], height: 20 })], links: [link('a', 's1'), link('s1', 'm1'), link('s1', 'm2'), link('s1', 'm3')], flows: [flow(['a', 's1', 'm1'], { rate: 1.2 }), flow(['s1', 'm2'], { rate: 1.2 }), flow(['s1', 'm3'], { rate: 1.2 })] },
    },
    {
      short: 'Simplicity',
      kind: 'insight',
      title: 'Why a tiny team could run it: do less, centrally',
      body: [
        'The design philosophy is <b>minimalism</b>: a thin, stateless-as-possible server that routes and queues opaque messages; no server-side feeds, ranking or content analysis; one well-understood runtime; a single protocol; clients that keep history; and a conservative approach to features. Fewer moving parts means fewer failure modes, easy capacity planning (connections, message rate, queue depth) and quick recovery — operating a system of this size depends more on what you <i>choose not to build</i> than on heroics.',
        'Operational habits matter too: automate everything, over-provision connection capacity, make servers disposable (a crashed server’s users reconnect to another in seconds), deploy gradually, and monitor the few numbers that matter. Figures here are model outputs for sizing, not a description of any company’s internal numbers.',
      ],
      scene: { nodes: [box('thin', -8, 0, 'Thin routing tier', 'blue', 'route', { size: [1.3, 1.3], height: 24, tag: pill('opaque blobs', 'check') }), box('cl', 4, 0, 'Smart clients', 'green', 'user', { size: [1.3, 1.3], height: 26, tag: pill('history + crypto on device', 'check') }), box('few', 14, 0, 'Few components', 'purple', 'layers', { size: [1.2, 1.2], height: 20 })], links: [link('thin', 'cl')], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Persistent connections, mailboxes, ciphertext',
      body: [
        'Hold one cheap persistent connection per phone (≈ users ÷ connections-per-server servers), route opaque encrypted messages through a thin tier, <b>queue for offline recipients</b> until acknowledged, use <b>E2E encryption</b> (X3DH + Double Ratchet, sender keys for groups) so servers see only ciphertext, and keep the system minimal.',
        'Capacity follows from messages × recipients per second and queue depth × retention; deliveries, not messages, set the fan-out load.',
      ],
      scene: { nodes: [phoneA(), edge('s1', -8, 'Server'), store(), phoneB()], links: [link('a', 's1'), link('s1', 'store'), link('s1', 'b')], flows: [flow(['a', 's1', 'b'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
