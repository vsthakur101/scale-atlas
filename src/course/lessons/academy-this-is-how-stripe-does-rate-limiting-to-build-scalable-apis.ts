import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -16, 0, 12, 'API clients', extra);
const limiter = (extra: Partial<SceneNode> = {}) => box('limiter', -8, 0, 'Rate limiters', 'orange', 'gauge', { size: [1.4, 1.4], height: 28, ...extra });
const shedder = (extra: Partial<SceneNode> = {}) => box('shed', 0, 0, 'Load shedders', 'red', 'shield', { size: [1.4, 1.4], height: 28, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', 9, 0, 'API workers', 'blue', 'server', { size: [1.5, 1.5], height: 32, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', -8, 8, 'Counters (Redis)', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtS = (s: number): string => (s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

const lesson: Lesson = {
  slug: 'academy-this-is-how-stripe-does-rate-limiting-to-build-scalable-apis',
  title: 'API Rate Limiters and Load Shedders',
  blurb: 'Four layers that keep a shared API alive: a token-bucket request limiter, a concurrency limiter, a fleet-wide shedder that protects critical traffic, and a worker-utilization shedder.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'burst', label: 'Token bucket: how long a burst is absorbed', icon: 'clock' },
    { key: 'rej', label: 'Rejected if the overload persists', icon: 'alert' },
    { key: 'conc', label: 'Concurrency limiter: max sustained rate', icon: 'activity' },
    { key: 'shed', label: 'Non-critical requests shed at capacity', icon: 'shield' },
  ],
  goals: [
    { text: 'Why every shared API needs several limiters, not one', step: 1 },
    { text: 'The token bucket: rate and burst', step: 2 },
    { text: 'The concurrent-requests limiter and Little’s law', step: 3 },
    { text: 'Fleet usage load shedder: reserving capacity for critical traffic', step: 4 },
    { text: 'Worker-utilization shedding and operating the limiters', step: 5 },
  ],
  legend: ['request', 'response', 'fail', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Allowed rate (bucket refill)', min: 1, max: 10000, step: 1, default: 100, unit: '/s', description: 'Tokens added per second per user.' },
      { key: 'burst', label: 'Bucket size (burst allowance)', min: 1, max: 10000, step: 1, default: 500, unit: '', description: 'Maximum tokens stored.' },
      { key: 'offered', label: 'Offered request rate from one client', min: 1, max: 20000, step: 1, default: 400, unit: '/s', description: 'What the client actually sends.' },
      { key: 'limit', label: 'Concurrent-request limit', min: 1, max: 500, step: 1, default: 20, unit: '', description: 'Requests one user may have in flight.' },
      { key: 'lat', label: 'Request latency', min: 10, max: 5000, step: 10, default: 200, unit: ' ms', description: 'Typical time one request takes.' },
      { key: 'cap', label: 'Fleet capacity', min: 1000, max: 1000000, step: 1000, default: 10000, unit: ' req/s', description: 'What the whole API fleet can serve.' },
      { key: 'crit', label: 'Critical traffic (e.g. creating charges)', min: 0, max: 100000, step: 100, default: 3000, unit: ' req/s', description: 'Requests that must keep working during overload.' },
      { key: 'noncrit', label: 'Non-critical traffic (e.g. listing, analytics)', min: 0, max: 200000, step: 100, default: 9000, unit: ' req/s', description: 'Requests that can be delayed or dropped.' },
      { key: 'reserve', label: 'Capacity reserved for critical traffic', min: 0, max: 80, step: 1, default: 20, unit: '%', description: 'Share of fleet capacity non-critical traffic may never use.' },
    ],
    calculate: (input, step) => {
      const r = Math.max(0.1, input.rate ?? 100);
      const b = Math.max(1, input.burst ?? 500);
      const o = Math.max(0, input.offered ?? 400);
      const L = Math.max(1, input.limit ?? 20);
      const w = Math.max(0.001, (input.lat ?? 200) / 1000);
      const cap = Math.max(1, input.cap ?? 1e4);
      const crit = Math.max(0, input.crit ?? 3000);
      const non = Math.max(0, input.noncrit ?? 9000);
      const reserve = Math.min(0.95, Math.max(0, (input.reserve ?? 20) / 100));
      // A full bucket absorbs the excess over the refill rate for b ÷ (offered − rate) seconds.
      const burstT = o > r ? b / (o - r) : Infinity;
      const rej = o > r ? (1 - r / o) * 100 : 0;
      // Little’s law: throughput = concurrency ÷ latency.
      const concRate = L / w;
      // Non-critical traffic may use only (1 − reserve) of capacity, and less if critical traffic needs room.
      const nonAllowed = Math.max(0, Math.min(non, cap * (1 - reserve), cap - crit));
      const shed = non - nonAllowed;
      return {
        burst: step < 1 ? { v: '—' } : Number.isFinite(burstT) ? { v: fmtS(burstT), tone: burstT > 5 ? 'good' : 'warn' } : { v: 'never exceeds the rate', tone: 'good' },
        rej: step < 1 ? { v: '—' } : { v: `${rej.toFixed(0)}% (${fmtN(Math.max(0, o - r))}/s over the limit)`, tone: rej === 0 ? 'good' : rej < 30 ? 'warn' : 'bad' },
        conc: step < 2 ? { v: '—' } : { v: `${fmtN(concRate)}/s (${L} ÷ ${(w * 1000).toFixed(0)} ms)`, tone: 'good' },
        shed: step < 3 ? { v: '—' } : { v: `${fmtN(shed)}/s of ${fmtN(non)}/s`, tone: shed === 0 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'A shared API fails in more than one way',
      body: [
        'Rate limiting is usually pictured as “100 requests per second per user”. But an API can be overwhelmed in several different ways, each needing its own defence: <b>one client sends far too fast</b> (a bug or a misconfigured loop); <b>one client’s requests are slow and pile up</b> in flight; <b>total traffic exceeds what the fleet can serve</b> (a launch, a retry storm); or <b>a subset of workers is saturated</b> even though the average looks fine.',
        'Production systems therefore layer <b>four kinds of controls</b>, from per-user fairness to whole-fleet survival. Crucially, the cheap, early ones reject <i>quickly</i> (a 429 costs microseconds), so rejected work doesn’t consume the capacity it is protecting.',
      ],
      scene: { nodes: [clients(), limiter({ tag: pill('per-user fairness', 'gauge') }), shedder({ tag: pill('fleet protection', 'shield') }), api()], links: [link('clients', 'limiter'), link('limiter', 'shed'), link('shed', 'api')], flows: [flow(['clients', 'limiter', 'shed', 'api'], { rate: 2 })] },
    },
    {
      short: 'Token bucket',
      kind: 'technique',
      title: 'The request-rate limiter: a token bucket',
      body: [
        'Each user has a <b>bucket</b> holding up to <code>b</code> tokens, refilled at <code>r</code> tokens per second. Each request removes one; if the bucket is empty the request gets <b>HTTP 429</b> and a <code>Retry-After</code> hint. It permits <b>bursts</b> (up to <code>b</code> at once) while enforcing the <b>average rate</b> <code>r</code> over time — the right shape for real clients, which are bursty (a page load fires ten calls at once).',
        'With r = 100/s, b = 500 and a client sending 400/s: the excess is 300/s, so the bucket drains in 500 ÷ 300 = <b>1.7 seconds</b>; after that only 100 of every 400 requests pass — <b>75% rejected</b>. State is two numbers per user (tokens, last refill time) in a fast shared store (Redis, updated atomically with a Lua script) so all API servers see the same counts; the refill is computed lazily on each request rather than by a timer.',
      ],
      changes: [{ text: 'Burst absorbed for b ÷ (offered − rate)', tone: 'info' }, { text: 'Sustained overload: 1 − rate ÷ offered rejected', tone: 'bad' }],
      concepts: [{ term: 'Token bucket', def: 'A limiter that stores up to b tokens, refilled at r per second, spending one per request: allows bursts while capping the average rate.' }],
      scene: { nodes: [clients({ tag: pill('400/s sent', 'bolt') }), limiter({ tag: pill('100/s refill · 500 burst', 'gauge') }), store({ tag: pill('tokens + last refill', 'hash') }), api()], links: [link('clients', 'limiter'), link('limiter', 'store', { arrow: 'both' }), link('limiter', 'api')], flows: [flow(['clients', 'limiter', 'api'], { rate: 2 }), flow(['clients', 'limiter'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Concurrency',
      kind: 'technique',
      title: 'The concurrent-requests limiter',
      body: [
        'A rate limit doesn’t stop a client whose requests are <b>slow</b>: at 20 requests/s with 10-second latency, 200 are in flight — each holding a worker, a database connection and memory. The <b>concurrency limiter</b> caps requests <i>in flight</i> per user: it increments a counter when a request starts and decrements it when it finishes (with a TTL so a crashed server can’t leak slots), and rejects when the cap is reached.',
        'By <b>Little’s law</b> the cap sets the throughput a client can sustain: <code>rate = concurrency ÷ latency</code>. 20 slots at 200 ms allows 100/s; if latency degrades to 2 s the same limit allows only 10/s — so it automatically <b>backs clients off when the system slows down</b>, unlike a fixed rate. It is particularly useful for expensive endpoints (reports, search) that a normal rate limit would treat as cheap.',
      ],
      changes: [{ text: 'Throughput = concurrency ÷ latency (Little’s law)', tone: 'info' }, { text: 'Self-throttles as latency rises', tone: 'good' }],
      scene: { nodes: [clients(), limiter({ name: 'Concurrency limiter', tag: pill('20 in flight max', 'lock') }), api({ tag: pill('slow requests hold workers', 'clock', 'warn') })], links: [link('clients', 'limiter'), link('limiter', 'api')], flows: [flow(['clients', 'limiter', 'api'], { rate: 1.5 }), flow(['clients', 'limiter'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Fleet shedder',
      kind: 'technique',
      title: 'The fleet usage load shedder: protect what matters',
      body: [
        'Per-user limits can all pass while <i>total</i> traffic exceeds capacity — a successful launch, a retry storm after an incident. The <b>fleet usage load shedder</b> classifies requests by <b>criticality</b> (creating a charge is critical; listing past charges or analytics is not) and reserves capacity: non-critical traffic may use only <code>(1 − reserve) × capacity</code>, say 80% of 10,000 = 8,000/s, so a spike in critical requests always has 20% headroom.',
        'With 3,000/s of critical and 9,000/s of non-critical traffic against 10,000/s of capacity, non-critical is cut to 7,000/s (the capacity left after critical) — <b>2,000/s shed</b> — and critical traffic is untouched. This is graceful degradation by design: decide <i>in advance</i> what to drop first, instead of letting the overload drop requests at random (including your most important ones). Many systems add more priority classes (critical, default, bulk, batch).',
      ],
      changes: [{ text: 'Critical traffic always served; non-critical shed first', tone: 'good' }, { text: '9,000 non-critical vs 7,000 allowed → 2,000/s shed', tone: 'info' }],
      scene: { nodes: [clients(), shedder({ tag: pill('critical first', 'shield', 'good') }), api({ tag: pill('critical traffic protected', 'check', 'good') })], links: [link('clients', 'shed'), link('shed', 'api')], flows: [flow(['clients', 'shed', 'api'], { rate: 2 }), flow(['clients', 'shed'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Worker shedder',
      kind: 'technique',
      title: 'The worker-utilization load shedder',
      body: [
        'The fleet-wide view can look healthy while <b>individual workers</b> are saturated — an uneven load balancer, a slow dependency pinning a subset of workers, a noisy neighbour. The <b>worker-utilization shedder</b> reads each server’s own utilisation (busy workers ÷ total, queue depth) and, above thresholds, sheds in order: first the lowest-priority traffic, then progressively higher classes, keeping the last slice for critical methods.',
        'Because the decision is local and based on the server’s real state it reacts in milliseconds, with no central coordination. Together the four layers form a defence in depth: rate and concurrency limits give <b>per-tenant fairness</b>; the two shedders give <b>system survival</b>. All shedding should be <b>observable</b> (metrics by reason and class) and every 429 should explain what to do (<code>Retry-After</code>, error code).',
      ],
      changes: [{ text: 'Local, millisecond decisions from real utilisation', tone: 'good' }, { text: 'Fairness (per tenant) + survival (per fleet)', tone: 'good' }],
      scene: { nodes: [shedder({ name: 'Worker shedder', tag: pill('utilisation > 90%: shed bulk', 'alert', 'warn') }), api({ state: 'hot', load: 95 })], links: [link('shed', 'api')], flows: [flow(['shed', 'api'], { rate: 1.5 })] },
    },
    {
      short: 'Operating',
      kind: 'tradeoff',
      title: 'Running limiters in production',
      body: [
        '<b>Roll out safely</b>: ship new limits in <b>shadow mode</b> (count what would be rejected without rejecting), alert on the would-reject rate, then enforce gradually. <b>Fail open</b>: if the limiter’s counter store is unavailable, allow traffic — a limiter outage must not become an API outage. Give clients <b>headers</b> about their limits and remaining quota, and document backoff: well-behaved clients use exponential backoff with jitter, which turns rejections into smooth load.',
        'Choose limits from observed legitimate traffic (set the burst above a normal peak), allow <b>per-account overrides</b> for large customers, and keep limiter logic cheap: a Redis round trip adds latency, so consider local approximate counters synced periodically for very hot paths. Figures here are model outputs for illustration.',
      ],
      changes: [{ text: 'Shadow mode first · fail open · expose limits', tone: 'good' }, { text: 'Clients: exponential backoff + jitter', tone: 'good' }],
      scene: { nodes: [limiter({ tag: pill('shadow mode → enforce', 'check') }), store({ tag: pill('down? allow traffic', 'alert', 'warn') })], links: [link('limiter', 'store', { arrow: 'both', style: 'dashed' })], flows: [flow(['limiter', 'store'], { rate: 1, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fair to tenants, safe for the fleet',
      body: [
        'Four layers: a <b>token bucket</b> (rate <code>r</code>, burst <code>b</code>; a burst lasts <code>b ÷ (offered − r)</code>), a <b>concurrency limiter</b> (throughput = limit ÷ latency), a <b>fleet shedder</b> that reserves capacity for critical traffic, and a <b>worker-utilization shedder</b> that sheds by priority under local saturation.',
        'Reject early and cheaply, decide in advance what to drop first, fail open, observe everything and ship in shadow mode.',
      ],
      scene: { nodes: [clients(), limiter(), shedder(), api()], links: [link('clients', 'limiter'), link('limiter', 'shed'), link('shed', 'api')], flows: [flow(['clients', 'limiter', 'shed', 'api'], { rate: 2 })] },
    },
  ],
};

export default lesson;
