import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -17, 0, 10, 'callers', extra);
const svc = (extra: Partial<SceneNode> = {}) => box('svc', -7, 0, 'Your service (worker pool)', 'orange', 'server', { size: [1.8, 1.6], height: 32, ...extra });
const healthy = (extra: Partial<SceneNode> = {}) => box('healthy', 6, -6, 'Healthy dependency', 'green', 'server', { size: [1.3, 1.3], height: 24, ...extra });
const sick = (extra: Partial<SceneNode> = {}) => box('sick', 6, 6, 'Slow dependency', 'red', 'alert', { size: [1.3, 1.3], height: 24, ...extra });
const breaker = (extra: Partial<SceneNode> = {}) => box('breaker', -1, 6, 'Circuit breaker', 'purple', 'shield', { size: [1.2, 1.2], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-resiliency-patterns',
  title: 'Resiliency Patterns: Timeouts, Bulkheads, Breakers and Retries',
  blurb: 'How one slow dependency exhausts a shared thread pool and takes down healthy traffic — the concurrency arithmetic behind it, and the timeout, bulkhead, circuit-breaker and retry-budget patterns that contain it.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'demand', label: 'Threads a slow dependency can hold (no protection)', icon: 'layers' },
    { key: 'timeout', label: 'Healthy traffic still served — timeout only', icon: 'clock' },
    { key: 'bulk', label: 'Healthy traffic still served — timeout + bulkhead', icon: 'shield' },
    { key: 'trip', label: 'Time for the breaker to open', icon: 'activity' },
    { key: 'amp', label: 'Retry amplification across layers', icon: 'refresh' },
  ],
  goals: [
    { text: 'Concurrency = arrival rate × latency (Little’s law)', step: 1 },
    { text: 'Timeouts bound how long a call may hold a thread', step: 2 },
    { text: 'Bulkheads isolate resources per dependency', step: 3 },
    { text: 'Circuit breakers fail fast and probe for recovery', step: 4 },
    { text: 'Retries: backoff, jitter, budgets — and amplification', step: 5 },
  ],
  legend: ['request', 'response', 'fail', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Total request rate', min: 100, max: 50000, step: 100, default: 2000, unit: '/s', description: 'Requests per second into the service.' },
      { key: 'depShare', label: 'Requests that call the slow dependency', min: 1, max: 100, step: 1, default: 30, unit: '%', description: 'Share of traffic needing the dependency.' },
      { key: 'wNorm', label: 'Normal call latency', min: 1, max: 500, step: 1, default: 50, unit: ' ms', description: 'Latency when everything is healthy.' },
      { key: 'wSlow', label: 'Latency of the degraded dependency', min: 50, max: 30000, step: 50, default: 2000, unit: ' ms', description: 'Latency when the dependency is slow (not down).' },
      { key: 'pool', label: 'Worker threads in the service', min: 10, max: 5000, step: 10, default: 200, unit: '', description: 'Shared concurrency limit.' },
      { key: 'timeout', label: 'Call timeout', min: 10, max: 10000, step: 10, default: 250, unit: ' ms', description: 'Maximum wait for the dependency.' },
      { key: 'bulk', label: 'Bulkhead: threads for the dependency', min: 1, max: 1000, step: 1, default: 60, unit: '', description: 'Cap on threads the dependency may hold.' },
      { key: 'window', label: 'Breaker window (minimum calls to judge)', min: 10, max: 1000, step: 10, default: 100, unit: ' calls', description: 'Calls needed before the breaker can trip.' },
      { key: 'retries', label: 'Retries per layer', min: 0, max: 6, step: 1, default: 2, unit: '', description: 'Additional attempts each layer makes on failure.' },
      { key: 'layers', label: 'Layers that each retry', min: 1, max: 6, step: 1, default: 3, unit: '', description: 'Call-chain depth with independent retry logic.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 2000);
      const share = Math.min(1, Math.max(0.01, (input.depShare ?? 30) / 100));
      const wNorm = Math.max(0.001, (input.wNorm ?? 50) / 1000);
      const wSlow = Math.max(0.001, (input.wSlow ?? 2000) / 1000);
      const pool = Math.max(1, input.pool ?? 200);
      const timeout = Math.max(0.001, (input.timeout ?? 250) / 1000);
      const bulk = Math.max(1, input.bulk ?? 60);
      const window = Math.max(1, input.window ?? 100);
      const retries = Math.max(0, Math.round(input.retries ?? 2));
      const layers = Math.max(1, Math.round(input.layers ?? 3));
      const lamD = rps * share;
      const lamH = rps - lamD;
      const healthyNeed = lamH * wNorm;
      const demand = lamD * wSlow;
      const served = (held: number) => Math.min(1, Math.max(0, pool - Math.min(pool, held)) / Math.max(1e-9, healthyNeed));
      const sTimeout = served(lamD * Math.min(wSlow, timeout));
      const sBulk = served(Math.min(bulk, lamD * Math.min(wSlow, timeout)));
      const trip = window / lamD;
      const amp = Math.pow(1 + retries, layers);
      const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
      return {
        demand: step < 1 ? { v: '—' } : { v: `${fmtN(demand)} threads vs ${fmtN(pool)} in the pool (${(demand / pool).toFixed(1)}×)`, tone: demand > pool ? 'bad' : demand > pool * 0.7 ? 'warn' : 'good' },
        timeout: step < 2 ? { v: '—' } : { v: pct(sTimeout), tone: sTimeout >= 0.99 ? 'good' : sTimeout > 0.5 ? 'warn' : 'bad' },
        bulk: step < 3 ? { v: '—' } : { v: pct(sBulk), tone: sBulk >= 0.99 ? 'good' : sBulk > 0.5 ? 'warn' : 'bad' },
        trip: step < 4 ? { v: '—' } : { v: `${trip.toFixed(trip < 10 ? 2 : 0)} s (${fmtN(window)} calls ÷ ${fmtN(lamD)}/s)`, tone: trip < 5 ? 'good' : 'warn' },
        amp: step < 5 ? { v: '—' } : { v: `${fmtN(amp)}× load on the bottom layer (${1 + retries}^${layers})`, tone: amp <= 3 ? 'good' : amp <= 10 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Little',
      kind: 'insight',
      title: 'Slowness, not failure, is what kills a thread pool',
      body: [
        'A service handling a request holds a <b>thread</b> (or connection, or coroutine slot) for as long as the call takes. By <b>Little’s law</b> the concurrency needed is <code>arrival rate × latency</code>. With 2,000 requests/s, 30% calling a dependency: healthy at 50 ms the whole service needs 2,000 × 0.05 = <b>100 threads</b> of 200. When that dependency degrades to 2 seconds — not down, just slow — its 600 requests/s need 600 × 2 = <b>1,200 threads</b>: six times the whole pool.',
        'Threads pile up waiting, the pool saturates, and <b>healthy requests that never touch the dependency</b> can’t get a thread either: a partial dependency failure becomes a total service outage. Slow is worse than down, because a fast error releases the thread immediately. Every pattern below is a way to bound how much of a shared resource a misbehaving dependency can hold.',
      ],
      changes: [{ text: 'Concurrency = arrival rate × latency', tone: 'info' }, { text: '600/s × 2 s = 1,200 threads vs a 200-thread pool', tone: 'bad' }],
      concepts: [{ term: 'Cascading failure', def: 'A failure that spreads because each overloaded component pushes load or latency onto its callers.' }],
      scene: { nodes: [clients(), svc({ state: 'hot', load: 100, tag: pill('pool saturated: 200/200', 'alert', 'bad') }), healthy(), sick({ tag: pill('2 s per call', 'clock', 'bad') })], links: [link('clients', 'svc'), link('svc', 'healthy'), link('svc', 'sick')], flows: [flow(['clients', 'svc', 'sick'], { kind: 'heavy', rate: 3 }), flow(['svc', 'healthy'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Timeouts',
      kind: 'technique',
      title: 'Timeouts: cap how long a call may hold a thread',
      body: [
        'Every network call needs a <b>timeout</b> — connect and read/total — chosen from the dependency’s latency distribution, typically a little above its p99 (here 250 ms vs a 50 ms median), and ideally derived from an overall <b>deadline</b> propagated down the call chain so a nested call never outlives the caller’s budget. Without timeouts a hung dependency holds threads forever.',
        'Timeouts alone only <b>reduce</b> the damage: the dependency’s 600 requests/s still each hold a thread for 250 ms = 150 threads, leaving 50 for the 70 the healthy traffic needs, so only <b>71% of healthy requests</b> are served. Too-long timeouts do nothing; too-short ones convert slow-but-working calls into errors and retries (see below).',
      ],
      changes: [{ text: 'Timeout > p99, from a propagated deadline', tone: 'good' }, { text: 'Timeout only: 150 threads still held, healthy served 71%', tone: 'bad' }],
      scene: { nodes: [clients(), svc({ tag: pill('150/200 threads on the dependency', 'gauge', 'warn') }), healthy(), sick({ tag: pill('timeout 250 ms', 'clock') })], links: [link('clients', 'svc'), link('svc', 'healthy'), link('svc', 'sick')], flows: [flow(['clients', 'svc', 'sick'], { kind: 'heavy', rate: 2 }), flow(['svc', 'healthy'], { rate: 1 })] },
    },
    {
      short: 'Bulkhead',
      kind: 'technique',
      title: 'Bulkheads: give each dependency its own compartment',
      body: [
        'A <b>bulkhead</b> (from ship hulls) partitions resources so one failing section can’t sink the vessel: a <b>separate thread pool or concurrency semaphore per dependency</b>, or per tenant/priority class, with its own queue. Capping the slow dependency at 60 threads leaves 140 for everything else; its calls beyond 60 are rejected immediately (a fast error or a fallback) rather than waiting. Healthy traffic needing 70 threads is served <b>100%</b>.',
        'You pay in <b>sizing and headroom</b>: partitions that are too small reject legitimate bursts, and unused capacity in one can’t help another — size each from <code>λ × latency × headroom</code> and revisit as traffic changes. Variants: connection pools per host, rate limits per caller, separate processes or cells (see the Cell-Based Architecture lesson), and priority queues so critical traffic is never behind batch.',
      ],
      changes: [{ text: 'Own pool per dependency: cap 60 of 200 threads', tone: 'good' }, { text: 'Healthy traffic served 100%', tone: 'good' }],
      scene: { nodes: [clients(), svc({ tag: pill('60 for slow · 140 for rest', 'layers', 'good') }), healthy({ tag: pill('100% served', 'check', 'good') }), sick({ tag: pill('capped at 60 threads', 'shield') })], links: [link('clients', 'svc'), link('svc', 'healthy'), link('svc', 'sick')], flows: [flow(['clients', 'svc', 'healthy'], { rate: 2 }), flow(['svc', 'sick'], { kind: 'heavy', rate: 0.8 })] },
    },
    {
      short: 'Breaker',
      kind: 'technique',
      title: 'Circuit breakers: stop calling something that is failing',
      body: [
        'A <b>circuit breaker</b> wraps a dependency with a state machine: <b>closed</b> (normal; track success and failure rates over a rolling window), <b>open</b> (failure or slow-call rate above a threshold, e.g. 50% over at least 100 calls — then <b>fail fast</b> without calling at all, for a cool-down), and <b>half-open</b> (after the cool-down, let a few probe calls through; if they succeed close, else reopen). At 600 calls/s the window fills in <b>0.17 s</b>, so the breaker opens almost immediately.',
        'Open means the dependency holds <b>near-zero threads</b>, it gets room to recover instead of being hammered by a retry crowd, and callers return a <b>fallback</b> instantly — cached data, a default, a degraded page, a queued request. Tune carefully: count slow calls as failures, require a minimum volume (a breaker on 3 calls flaps), jitter cool-downs across instances so they don’t all probe at once, and expose breaker state in metrics and alerts. Breakers belong next to bulkheads, not instead of them.',
      ],
      changes: [{ text: 'Closed → open → half-open; fail fast when open', tone: 'good' }, { text: '100 calls at 600/s → trips in ~0.17 s', tone: 'info' }, { text: 'Fallback gives a degraded answer, not an error', tone: 'good' }],
      scene: { nodes: [clients(), svc(), breaker({ tag: pill('OPEN: fail fast', 'shield', 'warn') }), healthy(), sick({ tag: pill('left alone to recover', 'refresh') })], links: [link('clients', 'svc'), link('svc', 'healthy'), link('svc', 'breaker'), link('breaker', 'sick', { style: 'broken' })], flows: [flow(['clients', 'svc', 'healthy'], { rate: 2 }), flow(['svc', 'breaker'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Retries',
      kind: 'problem',
      title: 'Retries help rare failures and amplify outages',
      body: [
        'Retrying handles transient blips (a dropped packet, a restarted pod) but is dangerous in an outage: if every layer of a three-deep call chain retries twice, one user request becomes up to <b>(1 + 2)³ = 27</b> calls at the bottom service — a <b>retry storm</b> that turns a struggling dependency into a dead one. Mitigate: retry at <b>one layer only</b> (usually the edge), use <b>exponential backoff with full jitter</b> (<code>sleep = random(0, min(cap, base·2^n))</code>) so retries de-synchronise, set a <b>retry budget</b> (retries ≤ 10% of requests per window, shared across callers) and honour server hints (<code>Retry-After</code>, 429/503).',
        'Only retry <b>idempotent</b> operations or those carrying an idempotency key (see the Idempotency lesson), respect the overall deadline, and combine with <b>load shedding</b> at the dependency (reject work early when overloaded — see the Backpressure lesson). A resilient service layers all five: deadlines, bulkheads, breakers, budgeted retries and shedding — each bounding a different way slowness can spread. Figures here are model outputs from first-order arithmetic.',
      ],
      changes: [{ text: '3 layers × 2 retries = 27× load on the bottom service', tone: 'bad' }, { text: 'Backoff + full jitter; one retry layer; retry budget', tone: 'good' }, { text: 'Idempotent operations only', tone: 'good' }],
      scene: { nodes: [clients(), svc({ tag: pill('3 layers × 2 retries', 'refresh', 'bad') }), sick({ state: 'hot', load: 100, tag: pill('27× the load', 'alert', 'bad') })], links: [link('clients', 'svc'), link('svc', 'sick')], flows: [flow(['clients', 'svc', 'sick'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bound every shared resource, fail fast, retry carefully',
      body: [
        'Slow dependencies exhaust shared pools: <b>concurrency = λ × latency</b>. Contain them with <b>timeouts</b> from deadlines, <b>bulkheads</b> per dependency, <b>circuit breakers</b> with fallbacks, and <b>retries</b> that use jittered backoff, a single layer and a budget.',
        'Test it: inject latency and failures (chaos experiments) and confirm healthy traffic keeps its share.',
      ],
      scene: { nodes: [clients(), svc(), breaker(), healthy(), sick()], links: [link('clients', 'svc'), link('svc', 'healthy'), link('svc', 'breaker'), link('breaker', 'sick')], flows: [flow(['clients', 'svc', 'healthy'], { rate: 2 })] },
    },
  ],
};

export default lesson;
