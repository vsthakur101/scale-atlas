import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const gws = (extra: Partial<SceneNode> = {}) => crowd('gw', -15, 0, 8, 'gateways', extra);
const seq = (extra: Partial<SceneNode> = {}) => box('seq', -6, 0, 'Sequencer', 'orange', 'route', { size: [1.3, 1.3], height: 30, ...extra });
const eng = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`e${i}`, 6, (i - (n - 1) / 2) * 5.5, name, 'purple', 'cpu', { size: [1.3, 1.3], height: 30, ...extra });

const fmtUs = (us: number): string => (us >= 1000 ? `${(us / 1000).toFixed(1)} ms` : `${us.toFixed(us < 10 ? 1 : 0)} µs`);
const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(2)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(0)}k/s` : `${Math.round(r)}/s`);

const lesson: Lesson = {
  slug: 'academy-how-stock-exchange-handles-concurrency-at-scale-part-2',
  title: 'How a Stock Exchange Scales, Part 2: Concurrency',
  blurb: 'One matching thread per symbol, a ring buffer between single-writer stages, deterministic replication — and what a hot ticker does to the plan.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'hot', label: 'Busiest symbol: engine utilisation', icon: 'cpu' },
    { key: 'lat', label: 'Busiest symbol: average latency', icon: 'clock' },
    { key: 'avg', label: 'Other engines: utilisation', icon: 'gauge' },
    { key: 'cap', label: 'Ceiling for one symbol', icon: 'activity' },
  ],
  goals: [
    { text: 'Why matching can’t be parallelised within one symbol', step: 2 },
    { text: 'Sharding by symbol and the hot-ticker limit', step: 3 },
    { text: 'The ring-buffer pipeline of single-writer stages', step: 4 },
    { text: 'Journalling and deterministic replication', step: 5 },
    { text: 'Failover without losing or duplicating orders', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'total', label: 'Total orders per second', min: 100000, max: 10000000, step: 100000, default: 2000000, unit: '/s', description: 'Order, cancel and amend events across all symbols.' },
      { key: 'skew', label: 'Share on the busiest symbol', min: 1, max: 60, step: 1, default: 8, unit: '%', description: 'Fraction of all events hitting one ticker (earnings day, index event).' },
      { key: 'engines', label: 'Matching engines (shards)', min: 2, max: 64, step: 1, default: 16, unit: '', description: 'Engines, each single-threaded, owning a set of symbols.' },
      { key: 'us', label: 'Time per event', min: 1, max: 20, step: 0.5, default: 4, unit: ' µs', description: 'Service time of one matching event on one engine.' },
    ],
    calculate: (input, step) => {
      const total = Math.max(1, input.total ?? 2e6);
      const skew = Math.min(0.95, Math.max(0.001, (input.skew ?? 8) / 100));
      const engines = Math.max(2, Math.round(input.engines ?? 16));
      const us = Math.max(0.1, input.us ?? 4);
      const hotRate = total * skew;
      const hotRho = (hotRate * us) / 1e6;
      const otherRho = (((total - hotRate) / (engines - 1)) * us) / 1e6;
      const lat = hotRho >= 0.999 ? Infinity : us / (1 - hotRho);
      return {
        hot: step < 2 ? { v: '—' } : { v: `${Math.min(hotRho * 100, 999).toFixed(0)}%`, tone: hotRho < 0.5 ? 'good' : hotRho < 0.8 ? 'warn' : 'bad' },
        lat: step < 2 ? { v: '—' } : { v: Number.isFinite(lat) ? fmtUs(lat) : 'queue grows without bound', tone: !Number.isFinite(lat) || hotRho >= 0.8 ? 'bad' : hotRho >= 0.5 ? 'warn' : 'good' },
        avg: step < 2 ? { v: '—' } : { v: `${Math.min(otherRho * 100, 999).toFixed(0)}%`, tone: otherRho < 0.6 ? 'good' : otherRho < 0.9 ? 'warn' : 'bad' },
        cap: step < 2 ? { v: '—' } : { v: fmtR(1e6 / us), tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The goal',
      kind: 'problem',
      title: 'Millions of events a second, one correct order',
      body: [
        'Part 1 described the book, price-time priority and a deterministic single-threaded matching engine. At real volumes — millions of orders, cancels and amends a second across thousands of symbols, with microsecond-level latency targets — a single thread can’t serve everything, and locks are too slow and too unpredictable to share one book.',
        'This part is about how to add parallelism <b>without</b> giving up determinism: where it is safe to run things in parallel, where it is not, and how the system stays correct when a machine fails mid-order.',
      ],
      scene: { nodes: [gws({ tag: pill('millions of events/s', 'bolt') }), seq(), eng(0, 3, 'Engine'), eng(1, 3, 'Engine'), eng(2, 3, 'Engine')], links: [link('gw', 'seq'), link('seq', 'e0'), link('seq', 'e1'), link('seq', 'e2')], flows: [flow(['gw', 'seq', 'e0'], { kind: 'write', rate: 2 }), flow(['gw', 'seq', 'e1'], { kind: 'write', rate: 2 }), flow(['gw', 'seq', 'e2'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Within a book',
      kind: 'insight',
      title: 'You can’t parallelise one order book',
      body: [
        'Every event on a symbol changes the same book, and the result of event N depends on the state left by event N−1: a buy that crosses the spread depends on whether the sell ahead of it was cancelled. Running two events at once means one of them operates on stale state — so any parallel scheme has to <b>serialise on the book anyway</b>.',
        'That makes one symbol’s matching inherently sequential, and its speed <code>1 ÷ time per event</code>: at 4 µs, <b>250,000 events a second</b>. The art is to make that single sequence as fast as possible and spread <i>different</i> symbols across engines.',
      ],
      note: { kind: 'key', text: 'Parallelism comes from independence between symbols, never from inside a single book.' },
      scene: { nodes: [box('book', 0, 0, 'One symbol’s book', 'red', 'list', { size: [1.6, 1.6], height: 30, tag: pill('each event needs the last one’s result', 'lock', 'warn') }), box('t1', -10, -5, 'Event 1', 'blue', 'bolt', { size: [1.1, 1.1], height: 20 }), box('t2', -10, 5, 'Event 2', 'orange', 'bolt', { size: [1.1, 1.1], height: 20 })], links: [link('t1', 'book'), link('t2', 'book')], flows: [flow(['t1', 'book'], { rate: 1 }), flow(['t2', 'book'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Sharding',
      kind: 'technique',
      title: 'Shard by symbol — and meet the hot ticker',
      body: [
        'Each matching engine owns a set of symbols; the sequencer (or a router in front of it) sends each event to its symbol’s engine. Engines share nothing and never talk to each other on the hot path, so throughput scales with engine count. Total 2 million events/s over 16 engines is ~125,000/s each — about 50% busy at 4 µs.',
        'But a book can’t be split, so the <b>busiest symbol is a hard ceiling</b>. If one ticker takes 8% of all traffic that’s 160,000 events/s on one engine: 64% busy, ~11 µs average latency; at 15% it passes 250,000/s and the queue grows without bound — no matter how many engines you add. Defences: give the hottest symbols a dedicated engine and core, shave per-event cost, and shed or throttle at the gateway.',
      ],
      changes: [{ text: '2M/s ÷ 16 engines ≈ 50% busy each', tone: 'good' }, { text: 'Hot symbol at 8% → 64% busy; at 15% → saturated', tone: 'bad' }],
      scene: { nodes: [seq(), eng(0, 3, 'Engine 1', { load: 49 }), eng(1, 3, 'Engine 2 · hot symbol', { load: 94, state: 'hot', tag: pill('one book, one thread', 'alert', 'warn') }), eng(2, 3, 'Engine 3', { load: 49 })], links: [link('seq', 'e0'), link('seq', 'e1'), link('seq', 'e2')], flows: [flow(['seq', 'e0'], { rate: 1.5 }), flow(['seq', 'e1'], { kind: 'heavy', rate: 3 }), flow(['seq', 'e2'], { rate: 1.5 })] },
    },
    {
      short: 'Pipeline',
      kind: 'technique',
      title: 'Single-writer stages around a ring buffer',
      body: [
        'Inside the engine node, work is a pipeline of stages joined by a <b>ring buffer</b> (the LMAX Disruptor pattern): <b>receive/decode</b> → <b>journal</b> and <b>replicate</b> → <b>match</b> → <b>publish</b>. Each stage is its own thread that <i>owns what it writes</i> — only one thread ever writes any variable — so there are no locks, only sequence counters that stages read to know how far the previous one got.',
        'It’s “mechanical sympathy”: pre-allocated, fixed-size slots (no garbage collection or allocation on the hot path), data laid out for CPU caches, busy-spinning pinned cores instead of blocking and waking threads, batching available events per wake-up. Locks and queues with contention cost microseconds; this design keeps handoff in the hundreds of nanoseconds.',
      ],
      changes: [{ text: 'One writer per variable → no locks', tone: 'good' }, { text: 'Pre-allocated slots, pinned cores, no GC', tone: 'good' }],
      concepts: [{ term: 'Ring buffer', def: 'A fixed circular array used as a queue between threads, coordinated by monotonically increasing sequence numbers rather than locks.' }],
      scene: { nodes: [box('rx', -12, 0, 'Receive', 'blue', 'server', { size: [1.2, 1.2], height: 24 }), box('rb', -4, 0, 'Ring buffer', 'yellow', 'queue', { size: [2.4, 1], height: 14, tag: pill('sequence counters', 'hash') }), box('j', 6, -5, 'Journal', 'teal', 'disk', { size: [1.2, 1.2], height: 22 }), box('m', 6, 5, 'Match', 'purple', 'cpu', { size: [1.3, 1.3], height: 30 }), box('pub', 16, 5, 'Publish', 'green', 'share', { size: [1.2, 1.2], height: 24 })], links: [link('rx', 'rb'), link('rb', 'j'), link('rb', 'm'), link('m', 'pub')], flows: [flow(['rx', 'rb', 'm', 'pub'], { rate: 2 }), flow(['rb', 'j'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Replication',
      kind: 'technique',
      title: 'Journal the input, replicate it, replay it',
      body: [
        'The matching engine is <b>deterministic</b>: the same ordered input always produces the same output. So you don’t replicate the book — you replicate the <b>input log</b>. Every sequenced event is written to a journal and sent to one or more <b>hot standbys</b>, which run the same engine code and reach the same state a moment behind.',
        'Journalling and replication run <i>in parallel</i> with matching, but an event is not acknowledged to the client until it is durable on the required replicas — that is the order that matters: durable first, visible second. Standbys also serve as a testing ground: run a new version on the live stream and compare its output byte-for-byte.',
      ],
      changes: [{ text: 'Replicate the input log, not the book', tone: 'good' }, { text: 'Acknowledge only after durable', tone: 'good' }],
      scene: { nodes: [seq(), eng(0, 2, 'Primary engine', { tag: pill('live', 'bolt', 'good') }), eng(1, 2, 'Hot standby', { tone: 'grey', tag: pill('replaying same log', 'refresh') }), db('j', 16, 0, 'Journal', { size: [1.3, 1.3] })], links: [link('seq', 'e0'), link('seq', 'e1', { style: 'dashed' }), link('e0', 'j')], flows: [flow(['seq', 'e0'], { kind: 'write', rate: 2 }), flow(['seq', 'e1'], { kind: 'write', rate: 1.5 }), flow(['e0', 'j'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Failover',
      kind: 'technique',
      title: 'Failing over without losing or repeating an order',
      body: [
        'When the primary fails, the standby has everything up to the last sequence number it received. It <b>replays to that point</b>, takes over, and continues numbering from there. Because every inbound and outbound message carries a sequence number, a client or downstream system that sees a gap asks for a resend, and anything it has already seen is recognised and dropped: nothing lost, nothing applied twice.',
        'The hard question is <b>split brain</b> — both nodes believing they are primary. Use a lease or consensus-based leader election with fencing (see the Distributed Locks lesson), and make the old primary’s writes impossible after it is replaced. Exchanges practise failover constantly because an untested failover path is a broken one.',
      ],
      changes: [{ text: 'Replay to the last sequence → take over', tone: 'good' }, { text: 'Sequence numbers make replays idempotent', tone: 'good' }, { text: 'Fence the old primary to prevent split brain', tone: 'info' }],
      scene: { nodes: [eng(0, 2, 'Old primary', { state: 'down', tone: 'red', tag: pill('failed', 'alert', 'bad') }), eng(1, 2, 'Standby → primary', { tag: pill('replayed to seq 4,182,071', 'check', 'good') }), seq()], links: [link('seq', 'e0', { style: 'broken' }), link('seq', 'e1')], flows: [flow(['seq', 'e1'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Latency',
      kind: 'tradeoff',
      title: 'Latency budget and tail latency',
      body: [
        'Average latency is not the target — <b>consistency of latency</b> is. A fair venue wants the 99.99th percentile close to the median, because jitter lets some participants’ orders jump the queue by accident. Sources of tails: garbage collection or allocation, cache misses, context switches, noisy neighbours, a lock somewhere, batching that waits for a full batch.',
        'Typical tools: managed-memory languages avoided or tamed (or runtime pauses engineered away), cores isolated and pinned, kernel-bypass networking, hardware timestamping at the edge, and batching that only groups what’s <i>already</i> waiting rather than delaying for more. Each microsecond removed comes with a complexity cost, so measure percentiles end to end before optimising.',
      ],
      changes: [{ text: 'Target: tight percentiles, not the best average', tone: 'info' }, { text: 'Remove allocation, locks and waits from the hot path', tone: 'good' }],
      scene: { nodes: [box('p50', -8, 0, 'Median: ~10 µs', 'green', 'gauge', { size: [1.3, 1.3], height: 22 }), box('p99', 2, 0, 'p99.99: should be close', 'orange', 'gauge', { size: [1.3, 1.3], height: 28, tag: pill('GC · cache misses · locks', 'alert', 'warn') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Parallelise between books, serialise within one',
      body: [
        'Matching a symbol is inherently sequential, so exchanges <b>shard by symbol</b>, run each engine as a pipeline of <b>single-writer stages over a ring buffer</b>, replicate the <b>sequenced input log</b> to hot standbys, and rely on <b>sequence numbers</b> for gap detection and idempotent recovery.',
        'The limit is the hottest ticker: one engine’s ceiling is <code>1 ÷ time-per-event</code>. Everything else — pinned cores, no allocation, durable-before-visible — exists to keep that sequence fast and its latency predictable. Numbers here are model outputs for illustration, not any exchange’s figures.',
      ],
      scene: { nodes: [gws(), seq(), eng(0, 2, 'Primary'), eng(1, 2, 'Standby', { tone: 'grey' })], links: [link('gw', 'seq'), link('seq', 'e0'), link('seq', 'e1', { style: 'dashed' })], flows: [flow(['gw', 'seq', 'e0'], { kind: 'write', rate: 2 })] },
    },
  ],
};

export default lesson;
