import type { Lesson, SceneNode, Tone } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const orders = (extra: Partial<SceneNode> = {}) => box('orders', -11, 0, 'Orders', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const ordersDb = (extra: Partial<SceneNode> = {}) => db('odb', -12, 8, 'Orders DB', extra);
const topic = (extra: Partial<SceneNode> = {}) =>
  disk('topic', -2, 0, 'topic: order-events', { size: [3.6, 1.6], height: 24, tone: 'yellow', icon: 'list', ...extra });

const SUBS: [string, string, Tone, number, number][] = [
  ['email', 'Email', 'teal', 7, -10],
  ['stock', 'Inventory', 'green', 9, -5],
  ['fraud', 'Fraud', 'red', 10, 0],
  ['loyalty', 'Loyalty', 'purple', 9, 5],
  ['stats', 'Analytics', 'orange', 7, 10],
];
const subs = (over: Record<string, Partial<SceneNode>> = {}, only?: string[]) =>
  SUBS.filter(([id]) => !only || only.includes(id)).map(([id, name, tone, r, d]) =>
    box(id, r, d, name, tone, 'server', { size: [1.25, 1.25], height: 32, ...over[id] }),
  );
const ids = SUBS.map(([id]) => id);

const lesson: Lesson = {
  slug: 'pubsub',
  title: 'Events & Pub/Sub',
  blurb: 'Announce what happened instead of telling everyone what to do — and keep services independent as their number grows.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'lat', label: 'Order latency', icon: 'timer' },
    { key: 'deps', label: 'Direct deps', icon: 'link' },
    { key: 'lag', label: 'Max consumer lag', icon: 'clock' },
    { key: 'lost', label: 'Lost events', icon: 'alert' },
  ],
  goals: [
    { text: 'Why direct calls couple services together', step: 1 },
    { text: 'Publishing events to a topic', step: 2 },
    { text: 'Consumer groups, partitions and per-key order', step: 4 },
    { text: 'Retained logs, replay and consumer lag', step: 6 },
    { text: 'The dual-write problem and the outbox pattern', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'Coupled',
      kind: 'problem',
      title: 'Placing an order calls five services',
      body: [
        'After saving an order, the Orders service calls Email, Inventory, Fraud, Loyalty and Analytics in turn. Order latency is the <b>sum</b> of all five; if Loyalty is down, orders fail; and every new team that cares about orders needs a change — and a deploy — in Orders.',
        'Orders has become responsible for knowing everyone who might be interested in it.',
      ],
      changes: [{ text: '5 synchronous calls per order', tone: 'bad' }, { text: 'Loyalty down → orders fail', tone: 'bad' }],
      scene: {
        nodes: [orders({ load: 70, tag: pill('call all 5…', 'link', 'warn') }), ordersDb(), ...subs({ loyalty: { state: 'down' } })],
        links: [link('orders', 'odb', { arrow: 'both' }), ...ids.map((s) => link('orders', s, { arrow: 'both', style: s === 'loyalty' ? 'broken' : 'solid' }))],
        flows: [...ids.filter((s) => s !== 'loyalty').map((s) => flow(['orders', s], { back: true, rate: 0.8 })), flow(['orders', 'loyalty'], { kind: 'fail', rate: 0.8 })],
        metrics: { lat: { v: '940 ms', tone: 'bad' }, deps: { v: '5', tone: 'bad' }, lag: '—', lost: '—' },
      },
    },
    {
      short: 'Publish',
      kind: 'technique',
      title: 'Publish a fact, let others subscribe',
      body: [
        'Instead, Orders publishes one <b>event</b> — <code>OrderPlaced { id, customer, items, total }</code> — to a topic on a message broker, and returns. Each interested service <b>subscribes</b> to the topic and receives its own copy.',
        'Orders no longer knows who listens. A new consumer subscribes without any change to Orders, and a slow or broken subscriber only delays itself.',
      ],
      note: { kind: 'key', text: 'Commands say “do this” and expect one handler. Events say “this happened” and may have zero, one or many listeners.' },
      changes: [{ text: '5 calls → 1 publish', tone: 'good' }, { text: 'Order latency 940 → 60 ms', tone: 'good' }],
      concepts: [
        { term: 'Publish/subscribe', def: 'Producers publish messages to a topic; every subscriber receives a copy, without producer and consumers knowing each other.' },
        { term: 'Domain event', def: 'An immutable record of something that happened in the business, named in the past tense.' },
      ],
      scene: {
        nodes: [orders({ load: 25 }), ordersDb(), topic({ tag: pill('OrderPlaced', 'bolt', 'accent') }), ...subs()],
        links: [link('orders', 'odb', { arrow: 'both' }), link('orders', 'topic', { label: pill('publish') }), ...ids.map((s) => link('topic', s))],
        flows: [flow(['orders', 'topic'], { kind: 'write', rate: 1 }), ...ids.map((s) => flow(['topic', s], { rate: 1 }))],
        metrics: { lat: { v: '60 ms', tone: 'good' }, deps: { v: '1 (broker)', tone: 'good' }, lag: '< 1 s', lost: '0' },
      },
    },
    {
      short: 'New consumer',
      kind: 'insight',
      title: 'Adding a subscriber touches nothing else',
      body: [
        'Marketing wants a “first order” coupon. They deploy a new service that subscribes to <code>order-events</code>. Orders isn’t changed, redeployed or even told. That’s the payoff of the indirection: the topic is a stable contract that many teams build on independently.',
        'The flip side: it’s harder to see who depends on what. Keep a catalogue of topics, schemas and consumers.',
      ],
      scene: {
        nodes: [orders({ load: 25 }), ordersDb(), topic(), ...subs(), box('promo', 2, 10, 'Coupons', 'yellow', 'sparkle', { size: [1.25, 1.25], height: 32, tag: pill('new subscriber', 'sparkle', 'good') })],
        links: [link('orders', 'odb', { arrow: 'both' }), link('orders', 'topic'), ...ids.map((s) => link('topic', s)), link('topic', 'promo')],
        flows: [flow(['orders', 'topic'], { kind: 'write', rate: 1 }), ...[...ids, 'promo'].map((s) => flow(['topic', s], { rate: 1 }))],
        metrics: { lat: '60 ms', deps: '1 (broker)', lag: '< 1 s', lost: '0' },
      },
    },
    {
      short: 'Groups',
      kind: 'technique',
      title: 'Consumer groups: copies across, shares within',
      body: [
        'Analytics runs four instances. They shouldn’t each process every event — that would quadruple the counts. Instances join a <b>consumer group</b>: every <i>group</i> gets every event, but within a group each event goes to only one instance.',
        'In log-based brokers like Kafka, a topic is split into <b>partitions</b>, and each partition is read by one member of a group at a time. Partition count therefore caps a group’s parallelism.',
      ],
      concepts: [
        { term: 'Consumer group', def: 'A set of consumer instances that share a subscription, each event handled by one member.' },
        { term: 'Partition (log)', def: 'An ordered, append-only shard of a topic; the unit of parallelism and ordering.' },
      ],
      scene: {
        nodes: [
          orders({ load: 25 }),
          topic({ tag: pill('4 partitions', 'layers') }),
          ...subs({}, ['email']),
          ...[0, 1, 2, 3].map((i) => box(`a${i}`, 8 + i * 0.8, -1 + i * 3.5, `Analytics ${i + 1}`, 'orange', 'server', { size: [1.1, 1.1], height: 28, tag: pill(`p${i}`) })),
        ],
        links: [link('orders', 'topic'), link('topic', 'email', { label: pill('group: email') }), ...[0, 1, 2, 3].map((i) => link('topic', `a${i}`))],
        flows: [flow(['orders', 'topic'], { kind: 'write', rate: 2 }), flow(['topic', 'email'], { rate: 2 }), ...[0, 1, 2, 3].map((i) => flow(['topic', `a${i}`], { rate: 0.5 }))],
        metrics: { lat: '60 ms', deps: '1 (broker)', lag: '< 1 s', lost: '0' },
      },
    },
    {
      short: 'Order by key',
      kind: 'technique',
      title: 'Order is kept per partition key',
      body: [
        'Events for order 81733 — Placed, Paid, Shipped — must be handled in sequence. Publishing with <b>key = order ID</b> sends all of them to the same partition, which is read in order by one consumer.',
        'Different orders land in different partitions and are processed in parallel. There’s no global ordering across partitions — and you rarely need one.',
      ],
      note: { kind: 'warn', text: 'Increasing a topic’s partition count changes which partition a key maps to, which can briefly reorder events for existing keys. Choose partition counts generously up front.' },
      scene: {
        nodes: [
          orders({ tag: pill('key = order_id', 'key', 'good') }),
          topic({ tag: pill('81733 → p2', 'hash') }),
          ...[0, 1, 2, 3].map((i) => box(`a${i}`, 8 + i * 0.8, -1 + i * 3.5, `Fulfilment ${i + 1}`, 'green', 'server', { size: [1.1, 1.1], height: 28, tag: i === 2 ? pill('Placed → Paid → Shipped', 'list', 'good') : pill(`p${i}`) })),
        ],
        links: [link('orders', 'topic'), ...[0, 1, 2, 3].map((i) => link('topic', `a${i}`))],
        flows: [flow(['orders', 'topic'], { kind: 'write', rate: 2 }), ...[0, 1, 2, 3].map((i) => flow(['topic', `a${i}`], { rate: i === 2 ? 1.2 : 0.5 }))],
        metrics: { lat: '60 ms', deps: '1 (broker)', lag: '< 1 s', lost: '0' },
      },
    },
    {
      short: 'Lag & replay',
      kind: 'insight',
      title: 'A log you can read at your own pace',
      body: [
        'A log-based broker <b>retains</b> events (days, or forever) instead of deleting them on delivery. Each consumer group just tracks its <b>offset</b> — how far it has read. Analytics falls 2 hours behind during a reprocessing job; email and fraud, at their own offsets, are unaffected.',
        'Retention also enables <b>replay</b>: reset a group’s offset to rebuild a search index, backfill a new service, or reprocess after fixing a bug.',
      ],
      changes: [{ text: 'Analytics lag: 2 h', tone: 'bad' }, { text: 'Others: real-time', tone: 'good' }],
      concepts: [
        { term: 'Consumer offset', def: 'A consumer group’s position in a partition’s log; committing it records progress.' },
        { term: 'Consumer lag', def: 'How far a consumer group’s offset trails the newest event in the log.' },
      ],
      scene: {
        nodes: [orders({ load: 25 }), ordersDb(), topic({ tag: pill('retained 7 days', 'clock') }), ...subs({ stats: { load: 99, tag: pill('lag 2 h', 'clock', 'bad') }, email: { tag: pill('lag 0', 'check', 'good') } })],
        links: [link('orders', 'odb', { arrow: 'both' }), link('orders', 'topic'), ...ids.map((s) => link('topic', s))],
        flows: [flow(['orders', 'topic'], { kind: 'write', rate: 1 }), ...ids.filter((s) => s !== 'stats').map((s) => flow(['topic', s], { rate: 1 })), flow(['topic', 'stats'], { kind: 'heavy', rate: 2, speed: 0.5 })],
        metrics: { lat: '60 ms', deps: '1 (broker)', lag: { v: '2 h (analytics)', tone: 'warn' }, lost: '0' },
      },
    },
    {
      short: 'Dual write',
      kind: 'case',
      title: 'Case: the order saved, the event didn’t',
      body: [
        'Orders commits the order to its database, then publishes the event. One day the broker call times out after the commit. The order exists, but email, inventory and fraud never hear about it — the stock count is now wrong. Publishing first has the opposite failure: an event for an order that was rolled back.',
        'Fix with the <b>transactional outbox</b>: in the <i>same</i> database transaction as the order, insert the event into an <code>outbox</code> table. A relay (or change-data-capture) reads the outbox and publishes, retrying until the broker accepts. At-least-once, so consumers stay idempotent.',
      ],
      note: { kind: 'tip', text: 'Change-data-capture tools such as Debezium can tail the database log and publish outbox rows without a polling relay.' },
      changes: [{ text: 'Commit ✓ · publish ✗ → event lost', tone: 'bad' }, { text: 'Outbox row in same transaction', tone: 'good' }],
      concepts: [{ term: 'Transactional outbox', def: 'Writing events to a table in the same transaction as the state change, then relaying them to the broker.' }],
      scene: {
        nodes: [orders(), ordersDb({ tag: pill('orders + outbox, one commit', 'lock', 'good') }), box('relay', -6, 9, 'Relay', 'grey', 'refresh', { size: [1.2, 1.2], height: 30, tag: pill('retry until acked', 'refresh') }), topic(), ...subs()],
        links: [link('orders', 'odb', { label: pill('BEGIN … COMMIT', 'lock') }), link('odb', 'relay'), link('relay', 'topic'), ...ids.map((s) => link('topic', s))],
        flows: [flow(['orders', 'odb'], { kind: 'write', rate: 1 }), flow(['odb', 'relay', 'topic'], { kind: 'write', rate: 1 }), ...ids.map((s) => flow(['topic', s], { rate: 1 }))],
        metrics: { lat: '62 ms', deps: '1 (broker)', lag: '< 1 s', lost: { v: '0', tone: 'good' } },
      },
    },
    {
      short: 'Contracts',
      kind: 'tradeoff',
      title: 'Events are a public API you can’t see the callers of',
      body: [
        'Five teams parse <code>OrderPlaced</code>. Renaming <code>total</code> to <code>amount</code> breaks consumers you may not know exist — and replaying old events means today’s code must still read last year’s format.',
        'Treat event schemas like APIs: version them, evolve additively, validate against a <b>schema registry</b> at publish time, and prefer events that carry enough data to be useful without a callback to the producer.',
      ],
      concepts: [{ term: 'Schema registry', def: 'A service storing versioned event schemas and enforcing compatibility rules for producers and consumers.' }],
      scene: {
        nodes: [orders({ tag: pill('OrderPlaced v3', 'file') }), box('reg', -11, -9, 'Schemas', 'yellow', 'sheet', { size: [1.3, 1.3], height: 32, tag: pill('v3 ⊇ v2 ✓', 'check', 'good') }), topic(), ...subs({ stats: { tag: pill('reads v2', 'file') }, email: { tag: pill('reads v3', 'file') } })],
        links: [link('orders', 'reg', { style: 'dashed', label: pill('compatible?') }), link('orders', 'topic'), ...ids.map((s) => link('topic', s))],
        flows: [flow(['orders', 'reg'], { kind: 'handshake', back: true, rate: 0.5 }), flow(['orders', 'topic'], { kind: 'write', rate: 1 }), ...ids.map((s) => flow(['topic', s], { rate: 1 }))],
        metrics: { lat: '62 ms', deps: '1 (broker)', lag: '< 1 s', lost: '0' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Announce facts, decouple teams',
      body: [
        'Publishing <b>events</b> to a topic replaces a web of synchronous calls: producers stop knowing their consumers, latency stops adding up, and failures stay local. <b>Consumer groups</b> share work; <b>partition keys</b> keep per-entity order; a retained <b>log</b> lets each consumer go at its own pace and replay.',
        'Close the dual-write gap with an <b>outbox</b>, keep consumers idempotent, and govern event schemas like the public APIs they are.',
      ],
      scene: {
        nodes: [orders({ load: 25 }), ordersDb(), topic({ tag: pill('the contract', 'list', 'good') }), ...subs()],
        links: [link('orders', 'odb', { arrow: 'both' }), link('orders', 'topic'), ...ids.map((s) => link('topic', s))],
        flows: [flow(['orders', 'topic'], { kind: 'write', rate: 1 }), ...ids.map((s) => flow(['topic', s], { rate: 1 }))],
        metrics: { lat: '62 ms', deps: '1 (broker)', lag: '< 1 s', lost: '0' },
      },
    },
  ],
};

export default lesson;
