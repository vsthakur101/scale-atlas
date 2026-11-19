import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

/** Resting sell orders, best (lowest) price first. Illustrative numbers. */
const ASKS: ReadonlyArray<{ px: number; qty: number }> = [
  { px: 101.0, qty: 300 },
  { px: 101.5, qty: 500 },
  { px: 102.0, qty: 800 },
  { px: 103.0, qty: 1000 },
];
const BEST_ASK = 101.0;
const lvl = (i: number): { px: number; qty: number } => ASKS[i] ?? { px: BEST_ASK, qty: 0 };

/** Walk the ask side with a market buy; returns shares filled, notional and levels touched. */
function walkBook(qty: number): { filled: number; cost: number; levels: number } {
  let left = qty;
  let cost = 0;
  let levels = 0;
  for (const lvl of ASKS) {
    if (left <= 0) break;
    const take = Math.min(left, lvl.qty);
    cost += take * lvl.px;
    left -= take;
    levels++;
  }
  return { filled: qty - left, cost, levels };
}

const fmtUs = (us: number): string => (us >= 1000 ? `${(us / 1000).toFixed(us >= 10000 ? 0 : 1)} ms` : `${us.toFixed(us < 10 ? 1 : 0)} µs`);

const askNode = (i: number, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`a${i}`, 6, -9 + i * 5, `ask ${lvl(i).px.toFixed(2)}`, 'red', 'list', { size: [1.1, 1.1], height: 16 + lvl(i).qty / 60, tag: pill(`${lvl(i).qty} sh`, 'list'), ...extra });
const bidNode = (i: number, px: number, qty: number, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`b${i}`, -6, -4 + i * 5, `bid ${px.toFixed(2)}`, 'green', 'list', { size: [1.1, 1.1], height: 12 + qty / 60, tag: pill(`${qty} sh`, 'list'), ...extra });
const BIDS = [
  { px: 100.5, qty: 400 },
  { px: 100.0, qty: 600 },
  { px: 99.5, qty: 900 },
];
const book = (extra: { a?: (i: number) => Partial<SceneNode>; b?: (i: number) => Partial<SceneNode> } = {}): SceneNode[] => [
  ...ASKS.map((_, i) => askNode(i, extra.a?.(i))),
  ...BIDS.map((b, i) => bidNode(i, b.px, b.qty, extra.b?.(i))),
];

const lesson: Lesson = {
  slug: 'academy-how-stock-exchange-works-part-1',
  title: 'How a Stock Exchange Works, Part 1: The Order Book',
  blurb: 'Price-time priority, the order book and the matching engine: how an exchange turns a stream of buy and sell orders into fair, deterministic trades.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'fill', label: 'Average fill price', icon: 'gauge' },
    { key: 'slip', label: 'Slippage vs best ask', icon: 'activity' },
    { key: 'util', label: 'Engine utilisation', icon: 'cpu' },
    { key: 'lat', label: 'Order latency (avg)', icon: 'clock' },
  ],
  goals: [
    { text: 'What a limit order, a market order and the spread are', step: 1 },
    { text: 'Price-time priority and why it is the fairness rule', step: 2 },
    { text: 'How a market order walks the book and pays slippage', step: 3 },
    { text: 'The data structure that makes match and cancel fast', step: 4 },
    { text: 'Why a single sequencer thread beats locking', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'qty', label: 'Market buy size', min: 50, max: 2600, step: 50, default: 600, unit: ' sh', description: 'Shares in a single market buy order that walks the ask side of the book.' },
      { key: 'rate', label: 'Orders per second (one symbol)', min: 1000, max: 400000, step: 1000, default: 50000, unit: '/s', description: 'Orders, cancels and amends arriving for one instrument.' },
      { key: 'us', label: 'Time per order', min: 1, max: 100, step: 1, default: 5, unit: ' µs', description: 'Service time of the single-threaded matching engine for one event.' },
    ],
    calculate: (input, step) => {
      const qty = Math.max(1, input.qty ?? 600);
      const rate = Math.max(1, input.rate ?? 50000);
      const us = Math.max(0.1, input.us ?? 5);
      const w = walkBook(qty);
      const avg = w.filled > 0 ? w.cost / w.filled : BEST_ASK;
      const slip = avg - BEST_ASK;
      const rho = (rate * us) / 1e6;
      // M/M/1 mean time in system = service / (1 − ρ); capped when saturated.
      const lat = rho >= 0.999 ? Infinity : us / (1 - rho);
      const partial = w.filled < qty;
      return {
        fill:
          step < 2
            ? { v: '—' }
            : { v: `${avg.toFixed(3)}${partial ? ` (${w.filled}/${qty} filled)` : ''}`, tone: partial ? 'bad' : undefined },
        slip: step < 2 ? { v: '—' } : { v: `${slip.toFixed(3)} (${((slip / BEST_ASK) * 100).toFixed(2)}%)`, tone: slip < 0.1 ? 'good' : slip < 0.5 ? 'warn' : 'bad' },
        util: step < 4 ? { v: '—' } : { v: `${Math.min(rho * 100, 999).toFixed(1)}%`, tone: rho < 0.5 ? 'good' : rho < 0.8 ? 'warn' : 'bad' },
        lat: step < 4 ? { v: '—' } : { v: Number.isFinite(lat) ? fmtUs(lat) : 'queue grows without bound', tone: !Number.isFinite(lat) || rho >= 0.8 ? 'bad' : rho >= 0.5 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The book',
      kind: 'problem',
      title: 'Buyers and sellers who have never met',
      body: [
        'An exchange’s job is to match people who want to buy a security with people who want to sell it, at a price both accept, with rules everyone can verify. It keeps one <b>order book</b> per instrument: <b>bids</b> (buy orders, highest first) on one side and <b>asks</b> (sell orders, lowest first) on the other.',
        'A <b>limit order</b> says “buy up to 100 shares at no more than 100.50” and rests in the book until matched or cancelled. A <b>market order</b> says “buy now at whatever the best prices are”. The gap between the best bid and the best ask is the <b>spread</b> — here 100.50 versus 101.00, so 0.50.',
      ],
      concepts: [
        { term: 'Limit order', def: 'An order with a price limit; it matches only at that price or better, otherwise rests in the book.' },
        { term: 'Market order', def: 'An order to trade immediately at the best available prices, accepting whatever price that is.' },
        { term: 'Spread', def: 'Best ask minus best bid; the cost of trading immediately in both directions.' },
      ],
      scene: { nodes: book(), links: [], flows: [] },
    },
    {
      short: 'Priority',
      kind: 'insight',
      title: 'Price-time priority is the fairness rule',
      body: [
        'Among orders that could match, the exchange applies two rules in order: <b>best price first</b> (the highest bid and the lowest ask trade before anything worse), and at equal price <b>first come, first served</b> (earlier orders in a FIFO queue trade before later ones).',
        'The rule is simple enough to be audited and impossible to argue with — which is exactly why latency matters: arriving a microsecond earlier at the same price moves you ahead in the queue. Some venues use other allocation rules (pro-rata is common for futures); the rest of this lesson assumes price-time.',
      ],
      note: { kind: 'key', text: 'Same price? The earlier order trades first. Price improvement beats time; time breaks ties.' },
      scene: {
        nodes: book({ a: (i) => (i === 0 ? { tag: pill('queue: A(100) → B(150) → C(50)', 'list', 'good') } : {}) }),
        links: [],
        flows: [],
      },
    },
    {
      short: 'Matching',
      kind: 'technique',
      title: 'A market order walks the book',
      body: [
        'A market buy for 600 shares meets the best ask first: 300 at 101.00. Those are gone, so it moves to the next level and takes 300 of the 500 at 101.50. Average fill: <code>(300×101.00 + 300×101.50) ÷ 600 = 101.25</code> — the 0.25 above the best ask is <b>slippage</b>, the price of size.',
        'Each match produces a <b>trade</b> (price, quantity, both order ids) and updates the book. Slide the order size: past 800 shares it reaches 102.00, and past 2,600 the book runs out and the order is only partially filled. A limit order would have stopped at its price instead of paying more.',
      ],
      changes: [{ text: '600 sh: 300 @ 101.00 + 300 @ 101.50 → 101.25', tone: 'info' }, { text: 'Larger orders pay more per share', tone: 'bad' }],
      concepts: [{ term: 'Slippage', def: 'The difference between the best displayed price and the average price actually obtained by a large order.' }],
      scene: {
        nodes: [...book({ a: (i) => (i < 2 ? { tone: 'orange', state: 'hot' } : {}) }), box('mo', 16, 0, 'Market buy 600', 'blue', 'bolt', { size: [1.2, 1.2], height: 28 })],
        links: [link('mo', 'a0', { arrow: 'end' }), link('mo', 'a1', { arrow: 'end' })],
        flows: [flow(['mo', 'a0'], { kind: 'write', rate: 1.2 }), flow(['mo', 'a1'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Structure',
      kind: 'technique',
      title: 'The data structure behind the book',
      body: [
        'Each side is a collection of <b>price levels</b> sorted by price; each level is a <b>FIFO queue</b> of orders. Matching only ever touches the top levels, so the hot operations are: peek best level, pop from the front of its queue, and insert at the back of a queue at an arbitrary price.',
        'Cancels are the problem — most orders are cancelled, not filled — so a <b>hash map from order id to its node</b> in the queue makes a cancel O(1) instead of a scan. Production engines often store levels in a contiguous array indexed by tick and keep everything pre-allocated, to avoid pointer chasing and garbage-collection pauses.',
      ],
      changes: [{ text: 'Sorted levels + FIFO per level + id → node map', tone: 'good' }, { text: 'Cancel in O(1), match at the top', tone: 'good' }],
      scene: {
        nodes: [box('lv', 0, -6, 'Price levels (sorted)', 'blue', 'layers', { size: [1.4, 1.4], height: 30 }), box('q', 0, 4, 'FIFO queue per level', 'teal', 'queue', { size: [1.4, 1.4], height: 28 }), box('map', 12, -1, 'Order id → node', 'purple', 'hash', { size: [1.4, 1.4], height: 26, tag: pill('O(1) cancel', 'bolt', 'good') })],
        links: [link('lv', 'q'), link('map', 'q', { arrow: 'end' })],
        flows: [flow(['lv', 'q'], { rate: 1 })],
      },
    },
    {
      short: 'Sequencer',
      kind: 'technique',
      title: 'One thread, one order, no locks',
      body: [
        'Many gateways receive orders in parallel, but matching must be <b>deterministic</b>: the same input sequence must always produce the same trades. So orders pass through a <b>sequencer</b> that stamps each event with a monotonically increasing number, and a single-threaded matching engine per instrument processes them strictly in that order.',
        'No locks, no races, and a free audit trail: replaying the sequenced log reproduces the book exactly, which is also how hot standbys stay in sync. The cost is that one symbol’s throughput is bounded by one core: at 5 µs per event the ceiling is 200,000 per second, and as utilisation approaches 100% queueing delay explodes. Sliders show it.',
      ],
      changes: [{ text: 'Sequence number = total order of events', tone: 'good' }, { text: 'Replay the log → identical book', tone: 'good' }, { text: 'Latency = service ÷ (1 − utilisation)', tone: 'info' }],
      concepts: [{ term: 'Sequencer', def: 'A component that assigns every inbound event a unique increasing number, defining the single order the engine and replicas process.' }],
      scene: {
        nodes: [crowd('gw', -14, 0, 8, 'gateways'), box('seq', -4, 0, 'Sequencer', 'orange', 'route', { size: [1.3, 1.3], height: 32, tag: pill('seq # 1, 2, 3…', 'hash') }), box('me', 6, 0, 'Matching engine', 'blue', 'cpu', { size: [1.4, 1.4], height: 36, load: 60, tag: pill('1 thread / symbol', 'cpu') }), db('log', 16, 0, 'Event log', { size: [1.3, 1.3], tag: pill('replay → same book', 'refresh', 'good') })],
        links: [link('gw', 'seq'), link('seq', 'me'), link('seq', 'log', { style: 'dashed' })],
        flows: [flow(['gw', 'seq', 'me'], { kind: 'write', rate: 2 }), flow(['seq', 'log'], { kind: 'write', rate: 1.2 })],
      },
    },
    {
      short: 'Pipeline',
      kind: 'technique',
      title: 'From a client’s click to a trade report',
      body: [
        'An order travels: client → <b>gateway</b> (authentication, session, protocol decoding) → <b>pre-trade risk checks</b> (credit limits, price bands, fat-finger size checks) → sequencer → matching engine. The engine emits events — accepted, rejected, partially filled, filled, cancelled — back to the gateway for the client, and trades to the downstream <b>clearing</b> and <b>market-data</b> systems.',
        'Risk checks sit <i>before</i> the sequencer so a bad order never costs engine time and cannot corrupt the book. Everything after the sequencer is derived from the log, so it can be rebuilt; everything before it is stateless-ish and horizontally scalable.',
      ],
      scene: {
        nodes: [box('cl', -16, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24 }), box('gw', -9, 0, 'Gateway', 'blue', 'server', { size: [1.2, 1.2], height: 28 }), box('rk', -2, 0, 'Risk checks', 'red', 'shield', { size: [1.2, 1.2], height: 28 }), box('seq', 5, 0, 'Sequencer', 'orange', 'route', { size: [1.2, 1.2], height: 28 }), box('me', 12, 0, 'Matching', 'purple', 'cpu', { size: [1.3, 1.3], height: 34 })],
        links: [link('cl', 'gw'), link('gw', 'rk'), link('rk', 'seq'), link('seq', 'me', { arrow: 'both' })],
        flows: [flow(['cl', 'gw', 'rk', 'seq', 'me'], { kind: 'write', rate: 1.5 }), flow(['me', 'seq', 'rk', 'gw', 'cl'], { back: true, rate: 0.8, speed: 0.6 })],
      },
    },
    {
      short: 'Market data',
      kind: 'technique',
      title: 'Telling everyone the same thing at the same time',
      body: [
        'Every change to the book is published as a <b>market-data feed</b>. Sending it point-to-point to thousands of firms would favour whoever is served first, so exchanges use <b>multicast</b>: one packet, delivered to all subscribers in effectively the same instant, with equal-length cables to co-located customers.',
        'Multicast is lossy, so each message carries a sequence number. A client that sees a gap asks a retransmission server for the missing range, or reloads a periodic <b>snapshot</b> of the whole book and then applies the incremental updates after it. Same pattern as any log-based replication: snapshot + sequenced deltas.',
      ],
      changes: [{ text: 'Multicast = equal delivery time', tone: 'good' }, { text: 'Gap in sequence → retransmit or snapshot', tone: 'info' }],
      scene: {
        nodes: [box('me', -12, 0, 'Matching', 'purple', 'cpu', { size: [1.3, 1.3], height: 34 }), box('md', -2, 0, 'Market-data publisher', 'orange', 'share', { size: [1.3, 1.3], height: 30, tag: pill('multicast', 'share') }), crowd('subs', 12, -4, 10, 'subscribers'), box('rt', 12, 6, 'Retransmit / snapshot', 'teal', 'refresh', { size: [1.2, 1.2], height: 24, tag: pill('fills gaps', 'refresh') })],
        links: [link('me', 'md'), link('md', 'subs'), link('rt', 'subs', { style: 'dashed' })],
        flows: [flow(['me', 'md', 'subs'], { rate: 2 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A deterministic machine with a total order',
      body: [
        'An exchange keeps an <b>order book</b> per instrument (bids and asks as sorted price levels of FIFO queues), applies <b>price-time priority</b>, and funnels every event through a <b>sequencer</b> into a single-threaded <b>matching engine</b>. Determinism and an ordered log give fairness, auditability and cheap replication.',
        'The limit is one core per symbol, so scale comes from sharding by instrument and from making each event cost microseconds. Part 2 of this topic covers how real venues push concurrency, fault tolerance and recovery further without giving up that single order. Numbers in this lesson are illustrative, not from any venue.',
      ],
      scene: { nodes: [...book(), box('me', 16, 0, 'Matching engine', 'purple', 'cpu', { size: [1.3, 1.3], height: 34 })], links: [link('me', 'a0', { arrow: 'both' }), link('me', 'b0', { arrow: 'both' })], flows: [flow(['me', 'a0'], { rate: 1 })] },
    },
  ],
};

export default lesson;
