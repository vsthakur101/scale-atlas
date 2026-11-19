import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const crowdN = (extra: Partial<SceneNode> = {}) => crowd('crowd', -15, 0, 14, 'shoppers', extra);
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -8, 0, 'CDN / edge', 'orange', 'globe', { size: [1.3, 1.3], height: 28, ...extra });
const gate = (extra: Partial<SceneNode> = {}) => box('gate', -1, 0, 'Inventory gate', 'red', 'bolt', { size: [1.3, 1.3], height: 30, ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', 6, 0, 'Order queue', 'yellow', 'queue', { size: [1.6, 1], height: 14, ...extra });
const orders = (extra: Partial<SceneNode> = {}) => db('orders', 14, 0, 'Orders database', { size: [1.4, 1.4], ...extra });

const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(r >= 1e4 ? 0 : 1)}k/s` : `${Math.round(r)}/s`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.round(s * 1000)} ms`);

const lesson: Lesson = {
  slug: 'academy-how-shopify-handles-flash-sales-at-32-million-requests-per-minute',
  title: 'Flash Sales: Surviving the Spike',
  blurb: 'A thousand times normal traffic for a few seconds, a few thousand units of stock, and one hot row: how to stop overselling without melting the database.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'attempts', label: 'Purchase attempts', icon: 'activity' },
    { key: 'row', label: 'One database row can sell', icon: 'lock' },
    { key: 'overload', label: 'Overload on a single DB row', icon: 'alert' },
    { key: 'gate', label: 'Sell-out time with an in-memory gate', icon: 'bolt' },
  ],
  goals: [
    { text: 'Why a flash sale is a different problem from high traffic', step: 1 },
    { text: 'The hot-row problem and why a database lock caps throughput', step: 2 },
    { text: 'Atomic in-memory inventory gates and sharded counters', step: 3 },
    { text: 'Reserve-then-pay and asynchronous order creation', step: 4 },
    { text: 'Protecting the system: rate limits, waiting rooms, shedding', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'stock', label: 'Units in stock', min: 100, max: 1000000, step: 100, default: 5000, unit: '', description: 'Items available in the sale.' },
      { key: 'peak', label: 'Peak requests per second', min: 1000, max: 5000000, step: 1000, default: 500000, unit: '/s', description: 'All traffic during the first seconds of the sale.' },
      { key: 'intent', label: 'Requests that try to buy', min: 1, max: 100, step: 1, default: 20, unit: '%', description: 'Share of requests that are add-to-cart or checkout attempts.' },
      { key: 'hold', label: 'Time one update holds the row lock', min: 1, max: 50, step: 1, default: 5, unit: ' ms', description: 'Duration of a database transaction that decrements stock.' },
      { key: 'buckets', label: 'Counter shards for the stock row', min: 1, max: 1000, step: 1, default: 1, unit: '', description: 'Stock split across independent rows; each is a separate lock.' },
      { key: 'gcap', label: 'In-memory gate throughput', min: 10000, max: 2000000, step: 10000, default: 100000, unit: '/s', description: 'Atomic decrements per second an in-memory store can sustain.' },
    ],
    calculate: (input, step) => {
      const stock = Math.max(1, input.stock ?? 5000);
      const peak = Math.max(1, input.peak ?? 5e5);
      const intent = Math.min(1, Math.max(0.001, (input.intent ?? 20) / 100));
      const hold = Math.max(0.1, input.hold ?? 5) / 1000;
      const buckets = Math.max(1, Math.round(input.buckets ?? 1));
      const gcap = Math.max(1, input.gcap ?? 1e5);
      const attempts = peak * intent;
      // One locked row serves 1 ÷ hold updates a second; shards multiply that.
      const rowRate = buckets / hold;
      const overload = attempts / rowRate;
      const gateTime = stock / Math.min(attempts, gcap);
      return {
        attempts: step < 1 ? { v: '—' } : { v: fmtR(attempts), tone: attempts > 50000 ? 'warn' : 'good' },
        row: step < 1 ? { v: '—' } : { v: `${fmtR(rowRate)} (lock held ${(hold * 1000).toFixed(0)} ms)`, tone: rowRate < attempts * 0.1 ? 'bad' : rowRate < attempts ? 'warn' : 'good' },
        overload: step < 1 ? { v: '—' } : { v: overload <= 1 ? 'fits' : `${overload.toFixed(overload < 10 ? 1 : 0)}× too many`, tone: overload <= 1 ? 'good' : overload < 10 ? 'warn' : 'bad' },
        gate: step < 2 ? { v: '—' } : { v: `${fmtT(gateTime)} (${stock.toLocaleString('en-US')} units)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The spike',
      kind: 'problem',
      title: 'A thousand times the traffic, for seconds',
      body: [
        'A limited drop or a doorbuster sale announced for 12:00 sends the whole audience at once. Traffic jumps from a few hundred requests a second to hundreds of thousands in under a minute, most of it people hammering refresh, and the real demand — <b>purchase attempts for a few thousand units</b> — is concentrated on the <i>same</i> few items.',
        'Autoscaling reacts in minutes; the event is over in seconds. And the consequences of error are asymmetric: a slow page is annoying, but <b>overselling</b> (promising stock you don’t have) costs refunds and trust, while underselling leaves money on the table. The design must be correct under contention and cheap under overload.',
      ],
      changes: [{ text: '500k req/s × 20% intent = 100k purchase attempts/s', tone: 'bad' }, { text: '5,000 units: 20 attempts per unit', tone: 'info' }],
      scene: { nodes: [crowdN({ tag: pill('12:00 sharp', 'clock', 'warn') }), edge(), box('shop', 6, 0, 'Shop backend', 'blue', 'server', { size: [1.5, 1.5], height: 32, state: 'hot', load: 100, tag: pill('everyone buys the same item', 'alert', 'bad') })], links: [link('crowd', 'edge'), link('edge', 'shop')], flows: [flow(['crowd', 'edge', 'shop'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Hot row',
      kind: 'problem',
      title: 'One row, one lock, one queue',
      body: [
        'The naive checkout does <code>BEGIN; SELECT stock FROM items WHERE id = 7 FOR UPDATE; UPDATE items SET stock = stock − 1; COMMIT</code>. Every buyer of item 7 must take the <b>same row lock</b>, so they execute one after another. If the transaction holds the lock for 5 ms, that row sells at most <code>1 ÷ 0.005</code> = <b>200 units a second</b> — however many servers you add.',
        'Against 100,000 attempts a second that is <b>500× too many</b>: connections pile up waiting, the pool exhausts, timeouts cascade and <i>unrelated</i> requests fail. It is correct (no overselling) but it collapses. Checking stock first and decrementing later without a lock is fast and <b>oversells</b>: many requests see “1 left”.',
      ],
      changes: [{ text: 'Row lock held 5 ms → max 200 sales/s', tone: 'bad' }, { text: 'Read-then-write without atomicity → oversell', tone: 'bad' }],
      scene: { nodes: [crowdN(), box('shop', -6, 0, 'App servers', 'blue', 'server', { size: [1.4, 1.4], height: 28 }), db('row', 8, 0, 'items row id=7', { size: [1.4, 1.4], state: 'hot', tag: pill('lock queue: 99,800 waiting', 'lock', 'bad') })], links: [link('crowd', 'shop'), link('shop', 'row')], flows: [flow(['crowd', 'shop', 'row'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Gate',
      kind: 'technique',
      title: 'Decide in memory, record in the database',
      body: [
        'Put a cheap, <b>atomic gate</b> in front: an in-memory store holds the remaining count and a single atomic operation (Redis <code>DECR</code>, or a Lua script that checks and decrements) either claims a unit or says sold out. At 100,000 atomic ops a second the 5,000 units are claimed in <b>0.05 s</b>; everyone after that is rejected instantly <i>without touching the database</i>.',
        'Only winners proceed, so the database sees ~5,000 order writes, not 100,000 attempts a second. If one in-memory key is itself too hot, <b>shard the counter</b> (50 buckets of 100 units, pick one at random, retry another if empty) so many keys serve in parallel. Make the gate the <i>source of truth</i> for stock during the event and reconcile with the database afterwards.',
      ],
      changes: [{ text: 'Atomic decrement-if-positive in memory', tone: 'good' }, { text: 'Sold out in 0.05 s; DB sees only winners', tone: 'good' }, { text: 'Shard hot counters across keys', tone: 'good' }],
      concepts: [{ term: 'Sharded counter', def: 'Splitting one hot counter into several independent ones so updates spread across keys or rows, summing them when the total is needed.' }],
      scene: { nodes: [crowdN(), edge(), gate({ tag: pill('DECR if > 0', 'check', 'good') }), orders({ tag: pill('only 5,000 writes', 'check', 'good') })], links: [link('crowd', 'edge'), link('edge', 'gate'), link('gate', 'orders')], flows: [flow(['crowd', 'edge', 'gate'], { kind: 'heavy', rate: 4 }), flow(['gate', 'orders'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Reserve',
      kind: 'technique',
      title: 'Reserve now, pay within a window',
      body: [
        'Winning the gate isn’t a sale; payment can fail or the buyer can abandon. Treat it as a <b>reservation with a TTL</b> (say 10 minutes): the unit leaves the available count, an order is created in <code>pending</code>, and if payment doesn’t complete the reservation expires and the unit <b>returns to the pool</b> for the next shopper. A scheduler or key expiry handles release.',
        'Create the order <b>asynchronously</b>: the gate acknowledges immediately and drops a message on a durable queue; workers write orders at the database’s pace. Use <b>idempotency keys</b> (see that lesson) so retries don’t double-reserve, and a unique constraint per (user, item) to enforce purchase limits.',
      ],
      changes: [{ text: 'Reservation expires → stock returns', tone: 'good' }, { text: 'Queue absorbs the burst; workers drain at DB pace', tone: 'good' }],
      scene: { nodes: [gate({ tag: pill('reserve 10 min', 'clock') }), queue({ tag: pill('buffers the burst', 'queue') }), orders({ tag: pill('pending → paid / expired', 'refresh') })], links: [link('gate', 'queue'), link('queue', 'orders')], flows: [flow(['gate', 'queue', 'orders'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Protect',
      kind: 'technique',
      title: 'Keeping the rest of the system alive',
      body: [
        '<b>Serve the page from the edge</b>: static assets and even the product page come from a CDN; only the buy action reaches origin. <b>Rate-limit per user and per IP</b> and block bots with proof-of-work or challenges before the gate. A <b>virtual waiting room</b> (see that lesson) admits shoppers at a rate the backend can serve, turning a spike into a queue. <b>Load-shed</b> unimportant work (recommendations, analytics) first; return fast, cheap “sold out” answers.',
        '<b>Rehearse</b>: warm caches and connections, pre-scale ahead of the announced time (autoscaling lags), and load-test the exact sale with realistic bot and refresh behaviour. Isolate the sale — its own cells or shards (see Cell-Based Architecture) — so a hot merchant can’t take other merchants down.',
      ],
      changes: [{ text: 'CDN · rate limits · waiting room · shedding', tone: 'good' }, { text: 'Pre-scale and rehearse; isolate the hot tenant', tone: 'good' }],
      scene: { nodes: [crowdN(), edge({ tag: pill('page + bots filtered here', 'shield', 'good') }), gate(), orders()], links: [link('crowd', 'edge'), link('edge', 'gate'), link('gate', 'orders')], flows: [flow(['crowd', 'edge', 'gate'], { rate: 3 })] },
    },
    {
      short: 'Fairness',
      kind: 'tradeoff',
      title: 'Fast, fair, or simple: pick two',
      body: [
        'A first-come-first-served gate rewards the fastest connection and the best bots. Alternatives: a <b>lottery</b> (everyone entering in a window has equal chance — fair and spike-free, but no instant gratification), <b>queue position</b> assigned randomly at open (the waiting-room approach), per-user purchase limits, and verified-account or registered-in-advance requirements.',
        'Whichever you pick, the engineering stays the same: <b>one authoritative atomic claim</b> per unit, a reservation with expiry, asynchronous order creation and protection in front. Figures here are illustrative model outputs for sizing.',
      ],
      scene: { nodes: [box('fcfs', -8, 0, 'First come, first served', 'orange', 'bolt', { size: [1.4, 1.4], height: 24, tag: pill('favours bots', 'alert', 'warn') }), box('lot', 8, 0, 'Lottery / random queue', 'green', 'refresh', { size: [1.4, 1.4], height: 24, tag: pill('fair, delayed', 'check') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Claim atomically in memory, write only the winners',
      body: [
        'A flash sale is a contention problem: one hot row’s lock caps sales at <code>1 ÷ lock time</code> (200/s at 5 ms). Move the decision to an <b>atomic in-memory gate</b> (sharded if needed), make winners <b>reservations with expiry</b>, write orders <b>asynchronously</b> through a queue, and protect everything with edge caching, rate limits, a waiting room and load shedding.',
        'Correctness comes from one authoritative atomic claim; resilience from not letting the spike reach the database. Pre-scale, rehearse and isolate the hot tenant.',
      ],
      scene: { nodes: [crowdN(), edge(), gate(), queue(), orders()], links: [link('crowd', 'edge'), link('edge', 'gate'), link('gate', 'queue'), link('queue', 'orders')], flows: [flow(['crowd', 'edge', 'gate', 'queue', 'orders'], { kind: 'write', rate: 2 })] },
    },
  ],
};

export default lesson;
