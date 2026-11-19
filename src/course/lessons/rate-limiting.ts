import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const good = (extra: Partial<SceneNode> = {}) => crowd('users', -12, -4, 14, 'customers', extra);
const bot = (extra: Partial<SceneNode> = {}) => crowd('bot', -12, 6, 4, 'scraper script', { tone: 'red', ...extra });
const limiter = (extra: Partial<SceneNode> = {}) => box('rl', -4, 1, 'Limiter', 'orange', 'filter', { size: [1.5, 1.5], height: 40, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', 4, 0, 'Search API', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('db', 11, -1, 'Database', extra);
const counter = (extra: Partial<SceneNode> = {}) => box('redis', -4, -8, 'Counters', 'red', 'hash', { size: [1.3, 1.3], height: 32, sub: 'shared store', ...extra });

const gated = (botRate = 6) => ({
  links: [link('users', 'rl'), link('bot', 'rl'), link('rl', 'api'), link('api', 'db', { arrow: 'both' })],
  flows: [
    flow(['users', 'rl', 'api'], { back: true, rate: 2 }),
    flow(['bot', 'rl'], { kind: 'fail' as const, rate: botRate }),
    flow(['bot', 'rl', 'api'], { back: true, rate: 0.5 }),
  ],
});

const lesson: Lesson = {
  slug: 'rate-limiting',
  title: 'Rate Limiting',
  blurb: 'Cap how fast any one client can call you — so one runaway script can’t take the service away from everyone else.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'bot', label: 'Script req/s', icon: 'bolt' },
    { key: 'served', label: 'Customer p95', icon: 'timer' },
    { key: 'rejected', label: 'Rejected', icon: 'x' },
    { key: 'cpu', label: 'API CPU', icon: 'cpu' },
  ],
  goals: [
    { text: 'Why every public API needs limits', step: 1 },
    { text: 'Fixed and sliding windows', step: 3 },
    { text: 'Token buckets for bursts with an average cap', step: 4 },
    { text: 'Telling clients to slow down with 429s', step: 6 },
    { text: 'Distributed limits and load shedding', step: 9 },
  ],
  legend: ['request', 'response', 'fail', 'heavy'],
  steps: [
    {
      short: 'Abuse',
      kind: 'problem',
      title: 'One script, everyone’s problem',
      body: [
        'A partner’s buggy sync script calls the search API in a tight loop: 4,000 requests a second from one API key. Search CPU hits 97% and ordinary customers — about 300 requests a second in total — see 3-second searches.',
        'Nothing is malicious. But without limits, the worst-behaved client sets the experience for everyone.',
      ],
      changes: [{ text: 'One key: 4,000 req/s', tone: 'bad' }, { text: 'Customer p95 3.1 s', tone: 'bad' }],
      scene: {
        nodes: [good(), bot({ tag: pill('key pk_81: 4k/s', 'alert', 'bad') }), api({ load: 97, state: 'hot' }), store({ load: 80 })],
        links: [link('users', 'api'), link('bot', 'api'), link('api', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { back: true, rate: 1, speed: 0.5 }), flow(['bot', 'api'], { kind: 'heavy', back: true, rate: 7, speed: 0.6 })],
        metrics: { bot: { v: '4,000', tone: 'bad' }, served: { v: '3.1 s', tone: 'bad' }, rejected: '0', cpu: { v: '97%', tone: 'bad' } },
      },
    },
    {
      short: 'Fixed window',
      kind: 'technique',
      title: 'Fixed window: count per minute',
      body: [
        'Simplest limiter: a counter per key per clock minute — <code>rl:pk_81:12:04</code>. Increment on every request; above 600, reject until the minute rolls over.',
        'One counter per key, one increment per request: cheap and easy to reason about. The script is cut to 10 requests a second on average and customers recover.',
      ],
      changes: [{ text: 'Limit: 600 / minute / key', tone: 'good' }],
      concepts: [{ term: 'Fixed window', def: 'Counting requests per key in discrete time intervals and rejecting beyond a threshold.' }],
      scene: {
        nodes: [good(), bot(), limiter({ tag: pill('pk_81: 600/600 this min', 'hash', 'warn') }), api({ load: 35 }), store()],
        ...gated(),
        metrics: { bot: '10 avg', served: { v: '140 ms', tone: 'good' }, rejected: '3,990/s', cpu: '35%' },
      },
    },
    {
      short: 'Edges',
      kind: 'problem',
      title: 'Double bursts at the window edge',
      body: [
        'The script adapts: it sends 600 requests at 12:04:59 and 600 more at 12:05:00. Both windows are within limits, but the API just took 1,200 requests in two seconds — a 2× burst the limit was meant to prevent.',
        'A <b>sliding window</b> fixes this by weighting the previous window: count = current + previous × (fraction of it still inside the last 60 s). It’s an approximation, but a cheap and accurate one.',
      ],
      changes: [{ text: '1,200 in 2 s across the boundary', tone: 'bad' }, { text: 'Sliding window smooths it', tone: 'good' }],
      concepts: [{ term: 'Sliding window', def: 'Limiting over a moving time span, often approximated by weighting the previous fixed window.' }],
      scene: {
        nodes: [good(), bot({ tag: pill('600 @ :59 + 600 @ :00', 'clock', 'warn') }), limiter({ tag: pill('sliding: 600 per any 60 s', 'refresh', 'good') }), api({ load: 40 }), store()],
        ...gated(5),
        metrics: { bot: '10 avg', served: '150 ms', rejected: '—', cpu: '40%' },
      },
    },
    {
      short: 'Token bucket',
      kind: 'technique',
      title: 'Token bucket: bursts allowed, average capped',
      body: [
        'Each key has a bucket holding up to <b>B</b> tokens, refilled at <b>r</b> tokens per second. A request takes one token; an empty bucket means reject. Only two numbers are stored: the token count and the last refill time.',
        'With r = 10/s and B = 50, a client can burst 50 requests after being idle — great for real apps that load a page of data at once — but can never sustain more than 10 a second.',
      ],
      note: { kind: 'tip', text: 'Token buckets are what most API gateways, cloud providers and proxies implement. Capacity sets burst tolerance; rate sets the long-run ceiling.' },
      changes: [{ text: 'r = 10/s, B = 50', tone: 'good' }],
      concepts: [{ term: 'Token bucket', def: 'A limiter where tokens refill at a steady rate up to a capacity, and each request spends one.' }],
      scene: {
        nodes: [good({ tag: pill('burst of 30: ok', 'check', 'good') }), bot({ tag: pill('bucket empty', 'x', 'bad') }), limiter({ tag: pill('+10/s · max 50', 'bolt') }), api({ load: 32 }), store()],
        ...gated(),
        metrics: { bot: '10/s', served: { v: '120 ms', tone: 'good' }, rejected: '3,990/s', cpu: '32%' },
      },
    },
    {
      short: 'Shaping',
      kind: 'tradeoff',
      title: 'Reject, or make it wait?',
      body: [
        'Rejecting excess requests is <b>policing</b>. The alternative is <b>shaping</b>: queue them and release at a fixed rate — the leaky bucket. Downstream sees a perfectly smooth stream.',
        'Shaping suits outbound traffic you control, like calls to a partner API with a strict quota. For inbound requests, waiting just moves the overload into your memory and lengthens latency — reject quickly instead.',
      ],
      concepts: [{ term: 'Leaky bucket', def: 'A queue drained at a constant rate, smoothing bursts into a steady output.' }],
      scene: {
        nodes: [box('jobs', -12, 0, 'Sync jobs', 'purple', 'queue', { size: [1.5, 1.5], height: 36 }), box('shaper', -4, 0, 'Leaky bucket', 'yellow', 'timer', { size: [1.5, 1.5], height: 36, tag: pill('drain 5/s', 'timer') }), box('partner', 5, 0, 'Partner API', 'teal', 'cloud', { size: [1.5, 1.5], height: 38, tag: pill('quota: 5/s ✓', 'check', 'good') })],
        links: [link('jobs', 'shaper', { label: pill('bursty') }), link('shaper', 'partner', { label: pill('smooth') })],
        flows: [flow(['jobs', 'shaper'], { rate: 4 }), flow(['shaper', 'partner'], { back: true, rate: 1 })],
        metrics: { bot: '—', served: '—', rejected: '0 (queued)', cpu: '—' },
      },
    },
    {
      short: '429',
      kind: 'technique',
      title: 'Tell clients what happened',
      body: [
        'A rejected request should get <code>429 Too Many Requests</code> with a <code>Retry-After</code> header, plus headers showing the limit, how much remains and when it resets. Well-behaved clients then back off instead of hammering harder.',
        'Make rejections cheap — decided before authentication-heavy or database work — or the limiter itself becomes the bottleneck under attack.',
      ],
      changes: [{ text: '429 + Retry-After: 4', tone: 'good' }, { text: 'Script backs off to 10/s', tone: 'good' }],
      concepts: [{ term: 'HTTP 429', def: 'Too Many Requests: the client has exceeded a rate limit; often accompanied by Retry-After.' }],
      scene: {
        nodes: [good(), bot({ tag: pill('backing off', 'clock', 'good') }), limiter({ tag: pill('429 · Retry-After: 4', 'timer', 'warn') }), api({ load: 30 }), store()],
        ...gated(1.5),
        metrics: { bot: { v: '10/s', tone: 'good' }, served: '120 ms', rejected: '~0', cpu: '30%' },
      },
    },
    {
      short: 'Distributed',
      kind: 'technique',
      title: 'Twenty API servers, one limit',
      body: [
        'The API runs on twenty servers behind a load balancer. If each counts locally, a client gets 20× its limit. Put the counters in a shared, fast store and update them atomically — a single <code>INCR</code> with expiry, or a small script that refills and spends a token bucket in one step.',
        'That adds a sub-millisecond round trip per request. At very high volume, a hybrid works: each server enforces a slice of the budget locally and syncs with the shared store periodically, accepting a little inaccuracy.',
      ],
      note: { kind: 'warn', text: 'Decide what happens when the counter store is down. Usually: fail open (allow traffic) with a local fallback limit, rather than taking the whole API offline.' },
      scene: {
        nodes: [good(), bot(), limiter({ name: 'API fleet', sub: '× 20', tag: pill('atomic INCR', 'hash') }), counter({ tag: pill('pk_81 → 7 tokens', 'key') }), api({ load: 30 }), store()],
        links: [...gated().links, link('rl', 'redis', { arrow: 'both' })],
        flows: [...gated().flows, flow(['rl', 'redis'], { kind: 'handshake', back: true, rate: 2 })],
        metrics: { bot: '10/s', served: '121 ms', rejected: '3,990/s', cpu: '30%' },
      },
    },
    {
      short: 'Keys & tiers',
      kind: 'insight',
      title: 'Limit by the right key',
      body: [
        'What you count matters. Per <b>IP</b> punishes a whole office or mobile carrier behind one NAT address. Per <b>API key</b> or <b>user</b> is fairer for authenticated traffic. Per <b>endpoint</b> lets cheap reads have generous limits while expensive exports get tight ones — or charge requests by cost instead of count.',
        'Paid tiers often simply get bigger buckets. Use several layers: a coarse per-IP limit at the edge against floods, finer per-key limits in the API.',
      ],
      scene: {
        nodes: [good({ tag: pill('free: 10/s', 'user') }), bot({ name: 'partner', tone: 'purple', tag: pill('pro: 100/s', 'key', 'good') }), limiter({ tag: pill('/export costs 50', 'dollar') }), api({ load: 40 }), store()],
        ...gated(0.5),
        metrics: { bot: '100/s (pro)', served: '120 ms', rejected: '~0', cpu: '40%' },
      },
    },
    {
      short: 'Shedding',
      kind: 'technique',
      title: 'Load shedding: protect the whole service',
      body: [
        'Per-client limits don’t help when <i>legitimate</i> traffic exceeds capacity — a TV mention brings 10× real customers. <b>Load shedding</b> is a global guard: when the server is saturated (queue too long, latency too high), reject some requests immediately to keep the rest fast.',
        'Shed by priority: drop background syncs and recommendations first, keep checkout and login. Serving 80% of requests well beats serving 100% so slowly that all of them time out.',
      ],
      concepts: [{ term: 'Load shedding', def: 'Deliberately rejecting some work when overloaded so that the remaining work completes successfully.' }],
      scene: {
        nodes: [good({ count: 24, tag: pill('TV spike ×10', 'bolt', 'warn') }), bot({ name: 'background sync', tone: 'grey' }), limiter({ name: 'Shedder', tag: pill('shed: low priority', 'filter', 'warn') }), api({ load: 82 }), store({ load: 70 })],
        ...gated(3),
        metrics: { bot: '0 (shed)', served: { v: '310 ms', tone: 'warn' }, rejected: '18%', cpu: { v: '82%', tone: 'warn' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fair share, enforced cheaply',
      body: [
        'Rate limits stop any single client from consuming everyone’s capacity. <b>Fixed windows</b> are simplest; <b>sliding windows</b> remove edge bursts; <b>token buckets</b> allow bursts with a capped average. Reject with <b>429 + Retry-After</b>, and keep the check cheap.',
        'Share counters across servers atomically (and fail open), choose keys that are fair, layer limits from edge to endpoint, and add <b>load shedding</b> for when the whole world shows up at once.',
      ],
      scene: {
        nodes: [good(), bot(), limiter({ tag: pill('token bucket per key', 'bolt', 'good') }), counter(), api({ load: 32 }), store()],
        links: [...gated().links, link('rl', 'redis', { arrow: 'both' })],
        flows: gated(2).flows,
        metrics: { bot: '10/s', served: '120 ms', rejected: 'excess only', cpu: '32%' },
      },
    },
  ],
};

export default lesson;
