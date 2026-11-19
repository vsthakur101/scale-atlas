import type { Lesson } from '../../types';
import { box, crowd, db, flow, link, pill, you } from '../kit';

const lesson: Lesson = {
  slug: 'academy-how-mcdonald-s-food-delivery-platform-handles-20-000-orders-per-second',
  title: 'How McDonald’s Food Delivery Platform Handles 20,000 Orders per Second',
  blurb: 'Trace a food order through checkout, payment, restaurant routing, durable queues, fulfilment, and recovery.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'orders', label: 'Orders/s', icon: 'activity' },
    { key: 'accepted', label: 'Accepted', icon: 'check' },
    { key: 'queue', label: 'Queue backlog', icon: 'queue' },
    { key: 'p99', label: 'p99 ack', icon: 'timer' },
  ],
  goals: [
    { text: 'Separate checkout throughput from kitchen throughput', step: 2 },
    { text: 'Route orders to eligible restaurants without a hot-spot partition', step: 4 },
    { text: 'Use queues and idempotency to absorb bursts safely', step: 6 },
    { text: 'Keep orders retryable and observable through recovery', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'heavy', 'fail', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'orders', label: 'Order rate', min: 100, max: 40_000, step: 100, default: 20_000, unit: ' orders/s', description: 'Incoming checkout requests.' },
      { key: 'paymentRate', label: 'Payment success', min: 50, max: 100, step: 1, default: 96, unit: '%', description: 'Payments that complete before the acknowledgement deadline.' },
      { key: 'workerRate', label: 'Worker capacity', min: 2_000, max: 30_000, step: 500, default: 22_000, unit: ' jobs/s', description: 'Restaurant and delivery work consumed per second.' },
      { key: 'failure', label: 'Dependency failure', min: 0, max: 40, step: 1, default: 8, unit: '%', description: 'Orders delayed or rejected by a degraded dependency.' },
    ],
    calculate: (input, stepIndex) => {
      const orders = input.orders ?? 20_000;
      const paymentRate = input.paymentRate ?? 96;
      const workerRate = input.workerRate ?? 22_000;
      const failure = input.failure ?? 8;
      const acceptedRate = Math.round(orders * (paymentRate / 100) * (1 - failure / 100));
      const queueBacklog = Math.max(0, Math.round(acceptedRate - workerRate));
      const utilization = Math.min(99, (acceptedRate / workerRate) * 100);
      const queueFactor = utilization >= 97 ? 28 : 1 + (3 * (utilization / 100) ** 2) / (1 - utilization / 100);
      const p99 = Math.round((stepIndex >= 5 ? 180 : 85) * queueFactor * (1 + failure / 100));
      return {
        orders: { v: `${orders.toLocaleString()}/s`, tone: orders > 30_000 ? 'warn' : undefined },
        accepted: { v: `${acceptedRate.toLocaleString()}/s`, tone: acceptedRate < orders * 0.9 ? 'bad' : acceptedRate < orders * 0.96 ? 'warn' : 'good' },
        queue: { v: queueBacklog ? `+${queueBacklog.toLocaleString()}/s` : '0 backlog', tone: queueBacklog > 2_000 ? 'bad' : queueBacklog > 0 ? 'warn' : 'good' },
        p99: { v: `${p99} ms`, tone: p99 > 500 ? 'bad' : p99 > 180 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Checkout',
      kind: 'problem',
      title: 'The order is not a single database row',
      body: [
        'A customer places a food order. The platform verifies the cart, payment, menu availability, location, restaurant capacity, delivery, and durable order state.',
        'At 20,000 checkout requests per second, the key distinction is <b>acknowledgement throughput</b> versus <b>fulfilment throughput</b>. A slow kitchen does not prove that order intake is slow.',
      ],
      concepts: [
        { term: 'Checkout throughput', def: 'Requests accepted and durably acknowledged per second.' },
        { term: 'Fulfilment throughput', def: 'Orders completed through preparation and delivery per second.' },
      ],
      scene: {
        nodes: [crowd('users', -11, 1, 18, '20k orders/s'), box('gateway', -2, 0, 'Order edge', 'orange', 'route'), box('checkout', 7, 0, 'Checkout', 'blue', 'server')],
        links: [link('users', 'gateway', { arrow: 'end' }), link('gateway', 'checkout', { arrow: 'both' })],
        flows: [flow(['users', 'gateway', 'checkout'], { back: true, rate: 5 })],
      },
    },
    {
      short: 'Cart',
      kind: 'technique',
      title: 'Validate once and preserve a stable order ID',
      body: [
        'Checkout validates menu availability, location, taxes, currency, and minimum basket value. It converts the cart into an immutable order intent with a client-generated idempotency key.',
        'On retry, the gateway finds the original key and returns the stored result. It does not charge or create the order twice.',
      ],
      note: { kind: 'tip', text: 'Keep idempotency keys for at least the payment and order-timeout window. Store the key with the side-effect result.' },
      concepts: [
        { term: 'Idempotency key', def: 'A client identifier that makes repeated logical operations return one stored result.' },
        { term: 'Order intent', def: 'A validated, retryable description of an order before irreversible fulfilment.' },
      ],
      scene: {
        nodes: [you('app', -11, 1, { label: pill('order-key: 48a1', 'key') }), box('gateway', -2, 0, 'Checkout API', 'orange', 'route'), box('intent', 7, 0, 'Order service', 'blue', 'server'), db('store', 14, 0, 'Order state')],
        links: [link('app', 'gateway', { arrow: 'both' }), link('gateway', 'intent', { arrow: 'both' }), link('intent', 'store', { arrow: 'both', label: pill('key + result') })],
        flows: [flow(['app', 'gateway', 'intent', 'store'], { back: true, rate: 4 })],
      },
    },
    {
      short: 'Payment',
      kind: 'tradeoff',
      title: 'Payment success is an independent dependency',
      body: [
        'Payment authorisation and order persistence may finish at different times. A timeout does not prove failure; it proves that the outcome is uncertain.',
        'The order state machine covers pending, authorised, captured, cancelled, and unknown states. Unknown payments reconcile with the provider instead of entering the duplicate-payment path.',
      ],
      concepts: [
        { term: 'Authorisation', def: 'A provider reservation of funds that may later be captured or released.' },
        { term: 'Reconciliation', def: 'Comparing local payment state with the provider of record.' },
      ],
      scene: {
        nodes: [box('order', -8, 0, 'Order service', 'blue', 'server'), box('payment', 0, 0, 'Payment service', 'teal', 'shield'), box('provider', 9, 0, 'Provider', 'purple', 'globe'), db('ledger', 9, 7, 'Ledger')],
        links: [link('order', 'payment', { arrow: 'both' }), link('payment', 'provider', { arrow: 'both' }), link('provider', 'ledger', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['order', 'payment', 'provider'], { back: true, rate: 3 }), flow(['payment', 'ledger'], { kind: 'write', back: true, rate: 2 })],
      },
    },
    {
      short: 'Menu',
      kind: 'technique',
      title: 'Route only to restaurants that can serve',
      body: [
        'Menu and capacity change faster than the restaurant catalogue. The location index finds candidates, then a live eligibility check verifies item availability and preparation capacity.',
        'Do not partition every restaurant with one request hash: a popular restaurant becomes hot. Partition candidate search by location and balance eligible restaurants inside that region.',
      ],
      concepts: [
        { term: 'Hot partition', def: 'A shard or key receiving disproportionate traffic or updates.' },
        { term: 'Candidate search', def: 'A bounded list of places that may satisfy the request.' },
      ],
      scene: {
        nodes: [box('gateway', -10, 0, 'Location router', 'orange', 'route'), box('search', -2, 0, 'Candidate index', 'green', 'search'), box('north', 8, -5, 'North restaurants', 'blue', 'server'), box('south', 8, 5, 'South restaurants', 'blue', 'server')],
        links: [link('gateway', 'search', { arrow: 'both' }), link('search', 'north', { arrow: 'both' }), link('search', 'south', { arrow: 'both' })],
        flows: [flow(['gateway', 'search', 'north'], { back: true, rate: 2 }), flow(['gateway', 'search', 'south'], { back: true, rate: 2 })],
      },
    },
    {
      short: 'Queue',
      kind: 'insight',
      title: 'The queue absorbs a burst, it does not create capacity',
      body: [
        'Accepted orders enter durable queues partitioned by region or restaurant. A 20,000/s burst can be acknowledged even if 16,000 jobs/s can be prepared or dispatched.',
        'The platform exposes backlog and oldest-job age. Queue capacity is a buffer, not a throughput guarantee.',
      ],
      note: { kind: 'warn', text: 'If arrival rate exceeds drain rate, backlog grows by arrival minus drain: backlog/s = accepted − workers.' },
      concepts: [
        { term: 'Backlog', def: 'Durable work whose arrival rate exceeds current drain rate.' },
        { term: 'Oldest job age', def: 'Time since the oldest incomplete item entered the queue.' },
      ],
      scene: {
        nodes: [box('checkout', -10, 0, 'Accepted orders', 'blue', 'server'), box('queue', 0, 0, 'Regional queue', 'yellow', 'queue', { load: 85, tag: pill('oldest age', 'clock') }), box('workers', 9, 0, 'Dispatch workers', 'purple', 'server'), db('orders', 9, 7, 'Orders')],
        links: [link('checkout', 'queue', { arrow: 'end', label: pill('acknowledge') }), link('queue', 'workers', { arrow: 'end' }), link('workers', 'orders', { arrow: 'both' })],
        flows: [flow(['checkout', 'queue'], { kind: 'write', rate: 5 }), flow(['queue', 'workers'], { rate: 4 }), flow(['workers', 'orders'], { kind: 'write', rate: 4 })],
      },
    },
    {
      short: 'Workers',
      kind: 'technique',
      title: 'Partition work and make every job repeatable',
      body: [
        'Workers assign restaurants, prepare handoff records, notify couriers, and publish status events. Each job carries order and delivery action IDs so retries do not create duplicate assignments.',
        'Retry with bounded exponential backoff and jitter. Quarantine a poison job instead of blocking the partition behind it.',
      ],
      concepts: [
        { term: 'At-least-once delivery', def: 'A queue may repeat work, so downstream effects must tolerate duplicates.' },
        { term: 'Poison job', def: 'A job that repeatedly fails and may consume worker capacity.' },
      ],
      scene: {
        nodes: [box('queue', -9, 0, 'Queue', 'yellow', 'queue'), box('worker', 0, 0, 'Workers', 'purple', 'server'), box('dead', 9, -5, 'Retry queue', 'orange', 'queue'), box('restaurant', 9, 5, 'Restaurant', 'blue', 'server')],
        links: [link('queue', 'worker', { arrow: 'end' }), link('worker', 'restaurant', { arrow: 'both' }), link('worker', 'dead', { arrow: 'end', style: 'dashed' })],
        flows: [flow(['queue', 'worker', 'restaurant'], { back: true, rate: 4 }), flow(['worker', 'dead'], { kind: 'fail', rate: 0.5 })],
      },
    },
    {
      short: 'Fail',
      kind: 'case',
      title: 'Payment times out; the order cannot be accepted twice',
      body: [
        'The customer retries while the provider outcome is unknown. The order key is replayed and payment is reconciled before fulfilment starts.',
        'A regional store outage keeps the accepted state pending for replay. The fallback is not to discard the order; it is to preserve an auditable state until processing is safe.',
      ],
      changes: [{ text: 'Unknown payment → reconcile', tone: 'info' }, { text: 'Duplicate order → replay one result', tone: 'good' }, { text: 'Database outage → retain pending state', tone: 'bad' }],
      concepts: [
        { term: 'Exactly-once effect', def: 'A logical result appears once despite retries; usually achieved by durable deduplication and state.' },
        { term: 'Saga', def: 'A sequence of compensatable local transactions across services.' },
      ],
      scene: {
        nodes: [you('app', -11, 1, { label: pill('retry', 'refresh') }), box('gateway', -2, 0, 'Idempotent gateway', 'orange', 'route'), box('payment', 7, -5, 'Payment reconciliation', 'teal', 'shield'), db('pending', 7, 5, 'Pending orders')],
        links: [link('app', 'gateway', { arrow: 'both' }), link('gateway', 'payment', { arrow: 'both' }), link('gateway', 'pending', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['app', 'gateway', 'payment'], { back: true, rate: 2 }), flow(['gateway', 'pending'], { kind: 'write', back: true, rate: 1 })],
      },
    },
    {
      short: 'Observe',
      kind: 'recap',
      title: 'Measure the order, not only the service',
      body: [
        'A useful dashboard follows order acceptance, payment reconciliation, restaurant assignment, preparation handoff, delivery assignment, and completion.',
        'The design uses durable state, partitioned queues, bounded worker pools, idempotency, regional candidate search, and explicit transitions. The 20,000/s title is a worked peak, not a claim of one exact implementation.',
      ],
      note: { kind: 'key', text: 'Service CPU alone does not show whether customer orders are stuck.' },
      scene: {
        nodes: [crowd('users', -11, 1, 18, 'orders'), box('edge', -3, 0, 'Order platform', 'green', 'route'), box('queue', 5, 0, 'Regional queues', 'yellow', 'queue'), box('ops', 13, 0, 'Order observability', 'purple', 'search')],
        links: [link('users', 'edge', { arrow: 'both' }), link('edge', 'queue', { arrow: 'both' }), link('edge', 'ops', { arrow: 'end', style: 'dashed' }), link('queue', 'ops', { arrow: 'end', style: 'dashed' })],
        flows: [flow(['users', 'edge', 'queue'], { back: true, rate: 5 }), flow(['edge', 'ops'], { kind: 'handshake', rate: 2 }), flow(['queue', 'ops'], { kind: 'handshake', rate: 2 })],
      },
    },
  ],
};

export default lesson;
