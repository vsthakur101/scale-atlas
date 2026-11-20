import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => crowd('user', -18, 0, 8, 'requests', extra);
const root = (extra: Partial<SceneNode> = {}) => box('root', -9, 0, 'Aggregator (fan-out)', 'orange', 'share', { size: [1.6, 1.6], height: 28, ...extra });
const be = (i: number, name: string, extra: Partial<SceneNode> = {}) => box(`be${i}`, 4, -9 + i * 6, name, 'blue', 'server', { size: [1.2, 1.2], height: 22, ...extra });
const hedge = (extra: Partial<SceneNode> = {}) => box('hedge', 14, 0, 'Hedged duplicate (second replica)', 'purple', 'copy', { size: [1.4, 1.4], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const pct = (p: number): string => (p >= 0.9995 ? '>99.95%' : p < 0.0005 ? `${(p * 100).toFixed(3)}%` : `${(p * 100).toFixed(1)}%`);

const lesson: Lesson = {
  slug: 'source-top-5-strategies-to-reduce-latency',
  title: 'Tail Latency at Scale: Percentiles, Fan-Out Amplification and Hedged Requests',
  blurb: 'Averages hide the slow requests users actually notice. When one request fans out to many backends, a 1% slow-call rate becomes a 63% chance of a slow page — the arithmetic, the sources of variance, and the techniques that tame the tail.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'slow', label: 'Chance a fan-out request hits at least one slow backend', icon: 'alert' },
    { key: 'q', label: 'Backend percentile you must hit to deliver the overall target', icon: 'gauge' },
    { key: 'hedge', label: 'Same chance with hedged requests', icon: 'shield' },
    { key: 'load', label: 'Extra backend load from hedging', icon: 'activity' },
    { key: 'half', label: 'Fan-out width at which most requests are slow', icon: 'users' },
  ],
  goals: [
    { text: 'Why percentiles, not averages', step: 1 },
    { text: 'Fan-out amplifies rare slowness', step: 2 },
    { text: 'Where the variance comes from', step: 3 },
    { text: 'Hedged and tied requests, and other tail tools', step: 4 },
    { text: 'Budgets, headroom and graceful degradation', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Backends one request fans out to', min: 1, max: 5000, step: 1, default: 100, unit: '', description: 'Shards or services consulted per request.' },
      { key: 'q', label: 'Chance one backend call is slow', min: 0.01, max: 20, step: 0.01, default: 1, unit: '%', description: 'Share of calls slower than your latency target (e.g. above the p99).' },
      { key: 'target', label: 'Overall percentile you promise', min: 50, max: 99.99, step: 0.01, default: 99, unit: '%', description: 'e.g. “99% of requests under X ms”.' },
      { key: 'hshare', label: 'Calls that exceed the hedge delay', min: 0.1, max: 50, step: 0.1, default: 5, unit: '%', description: 'Share of calls still running when the duplicate is sent (e.g. the p95).' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.n ?? 100));
      const q = Math.min(0.5, Math.max(0.0001, (input.q ?? 1) / 100));
      const target = Math.min(0.99999, Math.max(0.5, (input.target ?? 99) / 100));
      const hshare = Math.min(1, Math.max(0, (input.hshare ?? 5) / 100));
      const slow = 1 - Math.pow(1 - q, n);
      // For the whole request to meet the target, every backend must meet a higher quantile: target^(1/n).
      const needQ = Math.pow(target, 1 / n);
      // Hedging: a second independent try rescues a slow call, so a call stays slow only if both are slow.
      const slowH = 1 - Math.pow(1 - q * q, n);
      const half = Math.ceil(Math.log(0.5) / Math.log(1 - q));
      return {
        slow: step < 2 ? { v: '—' } : { v: `${pct(slow)} (1 − (1 − ${(q * 100).toFixed(2)}%)^${n})`, tone: slow < 0.05 ? 'good' : slow < 0.3 ? 'warn' : 'bad' },
        q: step < 2 ? { v: '—' } : { v: `p${(needQ * 100).toFixed(needQ > 0.9999 ? 4 : 3)} of each backend for an overall p${(target * 100).toFixed(2)}`, tone: needQ < 0.999 ? 'good' : 'warn' },
        hedge: step < 4 ? { v: '—' } : { v: `${pct(slowH)} (a call stays slow only if both tries are: ${(q * q * 100).toFixed(4)}%)`, tone: slowH < 0.05 ? 'good' : 'warn' },
        load: step < 4 ? { v: '—' } : { v: `+${(hshare * 100).toFixed(1)}% requests (duplicates sent only after the hedge delay)`, tone: hshare < 0.1 ? 'good' : 'warn' },
        half: step < 3 ? { v: '—' } : { v: `${fmtN(half)} backends (${(q * 100).toFixed(2)}% slow each)` },
      };
    },
  },
  steps: [
    {
      short: 'Percentiles',
      kind: 'insight',
      title: 'Users experience the tail, not the average',
      body: [
        'A service with a 20 ms <b>mean</b> latency can still have 1 in 100 requests taking 400 ms. Averages hide that; <b>percentiles</b> expose it: p50 (median), p95, p99, p99.9 are the latencies under which that fraction of requests complete. Report and alert on percentiles, never the mean (and never average percentiles across instances — merge <i>histograms</i> instead). Latency distributions are <b>long-tailed</b>, not bell-shaped: the median says what is typical and the p99 says what an unlucky user — who, across a session of many requests, is <i>every</i> user — sees regularly.',
        'The tail matters more as systems grow, for a structural reason: modern requests aren’t served by one machine. A search query, a feed or a product page asks dozens to thousands of backends and waits for them. That turns rare per-backend slowness into common request-level slowness — the subject of the next step, and the reason the latency techniques here (hedging, replicas, deadlines) are mostly about the tail, not the median.',
      ],
      scene: { nodes: [user({ tag: pill('mean 20 ms · p99 400 ms', 'clock') }), root(), be(0, 'Backend'), be(1, 'Backend')], links: [link('user', 'root'), link('root', 'be0'), link('root', 'be1')], flows: [flow(['user', 'root', 'be0'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Fan-out',
      kind: 'problem',
      title: 'Fan-out turns 1% slow into 63% slow',
      body: [
        'A request that fans out to <i>n</i> backends in parallel is as slow as the <b>slowest</b> one. If each call is “slow” (beyond your target, say above its own p99) with probability <i>q</i> = 1%, the chance that <i>at least one</i> of 100 calls is slow is <code>1 − (1 − q)ⁿ</code> = 1 − 0.99¹⁰⁰ = <b>63.4%</b>. Nearly two thirds of requests are slow even though 99% of individual calls are fast — the “p99” of the backends has become the <i>median</i> of the user. At 10 backends the chance is 9.6%; at 500 it is 99.3%.',
        'Equivalently: to give the <i>user</i> a p99, each backend must deliver a much higher percentile — <code>0.99^(1/100)</code> = <b>p99.99</b> — a hundred times rarer slowness than the user-level target. Fan-out width is therefore a latency decision as much as a capacity one: <b>wider fan-out</b> (more shards, more microservice calls per page) pays in the tail; <b>narrower</b> fan-out (fewer, larger partitions, batching, denormalised reads — see the Sharding Algorithms lesson) pays far less. This is “the tail at scale” (Dean &amp; Barroso).',
      ],
      changes: [{ text: '1 − 0.99¹⁰⁰ = 63.4% of fan-out requests hit a slow call', tone: 'bad' }, { text: 'Overall p99 needs each backend at p99.99', tone: 'bad' }, { text: 'Fewer, bigger fan-outs shrink the problem', tone: 'good' }],
      concepts: [{ term: 'Tail amplification', def: 'In a fan-out, the request is as slow as its slowest sub-call, so the probability of a slow request grows as 1 − (1 − q)ⁿ.' }],
      scene: { nodes: [user({ tag: pill('63% see a slow response', 'alert', 'bad') }), root({ tag: pill('wait for all 100', 'clock') }), be(0, 'fast 10 ms'), be(1, 'slow 400 ms', { state: 'hot', tag: pill('1 of 100', 'alert', 'warn') }), be(2, 'fast 10 ms')], links: [link('user', 'root'), link('root', 'be0'), link('root', 'be1'), link('root', 'be2')], flows: [flow(['root', 'be0'], { rate: 1.6 }), flow(['root', 'be1'], { kind: 'heavy', rate: 3 }), flow(['root', 'be2'], { rate: 1.6 })] },
    },
    {
      short: 'Sources',
      kind: 'technique',
      title: 'Where the variance comes from',
      body: [
        'Backends are slow <i>sometimes</i> for reasons that are hard to eliminate: <b>queueing</b> (a burst makes a request wait behind others — latency rises steeply with utilisation; see the CPU Saturation lesson), <b>garbage-collection pauses</b> and JIT deoptimisation, <b>background work</b> (compaction, log rotation, index builds, backups, cron), <b>shared-resource interference</b> (noisy neighbours on a host, cache or memory bandwidth contention, network incast), <b>lock contention</b>, <b>cold caches</b> after a deploy or failover, <b>power and thermal throttling</b>, <b>retries and timeouts</b> in downstream calls, and plain <b>request-size skew</b> (one huge key or tenant). Individually each is rare; together they add up to a per-call slow probability of a percent or two.',
        'Because you can’t remove them all, you build the system to be <b>tail-tolerant</b>. Note the asymmetry: it is cheap to reduce <i>median</i> latency with caching and faster code, but the tail needs <i>redundancy</i> and <i>scheduling</i> techniques that make one slow component irrelevant — the same idea as fault tolerance, applied to slowness (a slow server is a partial failure). At 1% slow per call, the fan-out width at which more than half of requests are slow is <b>69 backends</b>.',
      ],
      changes: [{ text: 'Queueing, GC, background jobs, noisy neighbours, cold caches, contention', tone: 'info' }, { text: 'Can’t eliminate all: design to tolerate slow components', tone: 'good' }, { text: 'At 1% slow per call, 69 backends → most requests slow', tone: 'bad' }],
      scene: { nodes: [root(), be(0, 'GC pause', { tag: pill('+200 ms', 'alert', 'warn') }), be(1, 'Compaction', { tag: pill('+150 ms', 'alert', 'warn') }), be(2, 'Noisy neighbour', { tag: pill('+300 ms', 'alert', 'warn') })], links: [link('root', 'be0'), link('root', 'be1'), link('root', 'be2')], flows: [flow(['root', 'be0'], { kind: 'fail', rate: 1 }), flow(['root', 'be1'], { kind: 'fail', rate: 1 }), flow(['root', 'be2'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Hedging',
      kind: 'technique',
      title: 'Hedged and tied requests, and other tail tools',
      body: [
        '<b>Hedged requests</b>: send the request to one replica; if it hasn’t answered within a small delay (about the p95 latency), send a <b>duplicate to another replica</b> and take whichever returns first (cancelling the other). A call stays slow only if <i>both</i> tries are slow — probability q² = 0.01% — so the fan-out slow chance falls from 63.4% to <b>1.0%</b>, at the cost of only the calls that exceeded the hedge delay: <b>~5% extra load</b>. <b>Tied requests</b> go further: enqueue the request on two replicas <i>at once</i>, each told of the other, and whichever starts first cancels its twin — removing queueing delay without wasted work. Both require <b>idempotent</b> (or read-only) operations and spare capacity, and they work because slowness is mostly <i>independent</i> across replicas.',
        'Other tools: <b>micro-partitioning</b> (many small shards per machine so load can move fast and one slow machine only affects a sliver), <b>selective replication</b> of hot items, <b>latency-induced probation</b> (temporarily exclude servers that are currently slow), <b>good-enough results</b> (return when 99% of shards answered, marking the rest unavailable — suits search and recommendations), <b>canary requests</b> (try one backend first before fanning out a query that might trigger a crash), <b>request deadlines</b> propagated downstream so work whose answer is no longer wanted is dropped, and <b>reducing fan-out</b> by design. All add complexity; apply them where the arithmetic says the tail is the user’s problem.',
      ],
      changes: [{ text: 'Hedge after p95: slow chance 63.4% → 1.0% for ~5% extra load', tone: 'good' }, { text: 'Tied requests cancel the twin when one starts', tone: 'good' }, { text: 'Micro-partitions, probation, good-enough results, propagated deadlines', tone: 'good' }],
      scene: { nodes: [root({ tag: pill('no reply in 20 ms → hedge', 'timer') }), be(0, 'Replica A', { state: 'hot', tag: pill('slow', 'alert', 'warn') }), hedge({ tag: pill('answers in 12 ms', 'check', 'good') })], links: [link('root', 'be0'), link('root', 'hedge')], flows: [flow(['root', 'be0'], { kind: 'heavy', rate: 2 }), flow(['root', 'hedge'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Budgets',
      kind: 'tradeoff',
      title: 'Headroom, budgets and graceful degradation',
      body: [
        'Techniques address variance; <b>capacity headroom</b> addresses the largest source of it, queueing. Run backends at moderate utilisation (60–70%), because delay explodes near saturation; <b>shed load</b> and apply admission control before queues grow; prefer <b>short timeouts with retries to a different replica</b> over long waits (and cap retries with a budget — see the Resiliency lesson). Give every request a <b>latency budget</b> that is split across hops (1.5 s page ≈ 50 ms DNS/CDN + 200 ms API + 800 ms render + slack) and propagate the <b>remaining deadline</b> so each hop knows what it has left.',
        'Measure it properly: record latency <b>histograms</b> per backend and per request class (HDR histograms, DDSketch), watch <b>p99 and p99.9</b> as well as p50, account for <b>coordinated omission</b> when load testing (a stalled client that stops sending hides the stalls), and set SLOs on tail percentiles. Trade-offs are real: hedging costs load and needs idempotency; “good enough” results cost completeness; wider replication costs money. All figures here come from the independent-slow-call model — real systems have correlated slowness (a bad deploy slows everything), which is why you also need the operational basics. Model outputs for the stated fan-out and slow rate.',
      ],
      changes: [{ text: 'Run at 60–70% utilisation; shed load before queues grow', tone: 'good' }, { text: 'Latency budgets with propagated deadlines', tone: 'good' }, { text: 'Histograms, p99/p99.9 SLOs, avoid coordinated omission', tone: 'good' }],
      scene: { nodes: [user(), root({ tag: pill('deadline: 200 ms left', 'timer') }), be(0, 'Backend', { tag: pill('≤ 70% utilised', 'gauge', 'good') }), be(1, 'Backend')], links: [link('user', 'root'), link('root', 'be0'), link('root', 'be1')], flows: [flow(['user', 'root', 'be0'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'In a fan-out, the tail is the product',
      body: [
        'Measure <b>percentiles</b>. A fan-out of <i>n</i> makes the chance of a slow request <b>1 − (1 − q)ⁿ</b>: 1% slow calls become 63.4% slow requests at 100 backends, and an overall p99 needs each backend at p99.99. <b>Hedged and tied requests</b> cut that to ~1% for ~5% extra load.',
        'Add headroom, deadlines, good-enough results and smaller fan-out, and watch tail histograms.',
      ],
      scene: { nodes: [user(), root(), be(0, 'Backend'), be(1, 'Backend'), hedge()], links: [link('user', 'root'), link('root', 'be0'), link('root', 'be1'), link('root', 'hedge')], flows: [flow(['user', 'root', 'be0'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
