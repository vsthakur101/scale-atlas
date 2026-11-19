import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -12, 1, 18, 'shoppers', extra);
const web = (extra: Partial<SceneNode> = {}) => box('web', -3, 0, 'Product page', 'blue', 'server', { size: [1.6, 1.6], height: 44, sub: '200 threads', ...extra });
const catalog = (extra: Partial<SceneNode> = {}) => box('cat', 6, -7, 'Catalog', 'green', 'list', { size: [1.3, 1.3], height: 34, ...extra });
const cart = (extra: Partial<SceneNode> = {}) => box('cart', 8, 0, 'Cart', 'teal', 'box', { size: [1.3, 1.3], height: 34, ...extra });
const recs = (extra: Partial<SceneNode> = {}) => box('recs', 6, 7, 'Recommend', 'purple', 'sparkle', { size: [1.3, 1.3], height: 34, ...extra });
const deps = ['cat', 'cart', 'recs'];
const wires = [link('users', 'web'), ...deps.map((d) => link('web', d, { arrow: 'both' }))];
const healthy = [flow(['users', 'web'], { back: true, rate: 2.5 }), ...deps.map((d) => flow(['web', d], { back: true, rate: 2 }))];

const lesson: Lesson = {
  slug: 'timeouts-retries',
  title: 'Timeouts, Retries & Breakers',
  blurb: 'One slow dependency can drown a healthy service. Bound every wait, retry carefully, and fail fast when something’s clearly broken.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'p99', label: 'Page p99', icon: 'timer' },
    { key: 'threads', label: 'Busy threads', icon: 'layers' },
    { key: 'errors', label: 'Page errors', icon: 'alert' },
    { key: 'amp', label: 'Load on recs', icon: 'activity' },
  ],
  goals: [
    { text: 'How a slow dependency causes a cascade', step: 1 },
    { text: 'Choosing timeouts and propagating deadlines', step: 3 },
    { text: 'Retry amplification and how to tame it', step: 6 },
    { text: 'Circuit breakers and bulkheads', step: 8 },
    { text: 'Graceful degradation with fallbacks', step: 9 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  steps: [
    {
      short: 'Cascade',
      kind: 'problem',
      title: 'Recommendations stall; the shop goes down',
      body: [
        'The product page calls Catalog, Cart and Recommendations. A bad deploy makes Recommendations hang — not fail, <i>hang</i>. With no timeout, every page request waits on it forever, holding one of the page server’s 200 threads.',
        'Within seconds all 200 threads are stuck. Now pages that never needed recommendations can’t be served either. A non-essential widget took down the whole shop.',
      ],
      changes: [{ text: 'Recs hangs', tone: 'bad' }, { text: '200 / 200 threads stuck', tone: 'bad' }],
      concepts: [{ term: 'Resource exhaustion', def: 'A finite pool (threads, connections, memory) used up by work that isn’t completing.' }],
      scene: {
        nodes: [users(), web({ load: 100, state: 'hot', tag: pill('200/200 threads waiting', 'alert', 'bad') }), catalog(), cart(), recs({ state: 'hot', tag: pill('hanging', 'clock', 'bad') })],
        links: wires,
        flows: [flow(['users', 'web'], { kind: 'fail', rate: 3 }), flow(['web', 'recs'], { kind: 'heavy', rate: 1.5, speed: 0.2 })],
        metrics: { p99: { v: '∞', tone: 'bad' }, threads: { v: '200/200', tone: 'bad' }, errors: { v: '100%', tone: 'bad' }, amp: '1×' },
      },
    },
    {
      short: 'Timeouts',
      kind: 'technique',
      title: 'Every remote call gets a timeout',
      body: [
        'Give each call a timeout based on the dependency’s normal latency — a little above its p99.9, say 300 ms for Recommendations. A hung dependency now costs each request at most 300 ms, and threads are returned to the pool.',
        'Set both a <b>connect</b> timeout (short — a healthy server accepts in milliseconds) and a <b>request</b> timeout. Many libraries’ defaults are “infinite” or minutes: never trust the default.',
      ],
      note: { kind: 'warn', text: 'A timeout doesn’t mean the work didn’t happen. The server may finish after you gave up — which is why retried writes need idempotency.' },
      changes: [{ text: 'Recs timeout 300 ms', tone: 'good' }, { text: 'Threads recover', tone: 'good' }],
      concepts: [{ term: 'Timeout', def: 'An upper bound on how long a caller waits for a response before giving up.' }],
      scene: {
        nodes: [users(), web({ load: 55 }), catalog(), cart(), recs({ state: 'hot', tag: pill('timeout 300 ms', 'timer', 'warn') })],
        links: wires,
        flows: [flow(['users', 'web'], { back: true, rate: 2.5 }), flow(['web', 'cat'], { back: true, rate: 2 }), flow(['web', 'cart'], { back: true, rate: 2 }), flow(['web', 'recs'], { kind: 'fail', rate: 2 })],
        metrics: { p99: { v: '420 ms', tone: 'warn' }, threads: '110/200', errors: { v: '0%*', tone: 'warn' }, amp: '1×' },
      },
    },
    {
      short: 'Deadlines',
      kind: 'technique',
      title: 'Budgets, not just timeouts',
      body: [
        'The page itself has a 1-second budget. If Catalog already took 700 ms, there’s no point giving Cart its full 500 ms timeout. Pass a <b>deadline</b> downstream (gRPC does this natively; elsewhere, a header) so each hop knows how much time is left and gives up when it’s spent.',
        'Without deadlines, deep call chains keep doing work for requests whose users have already left.',
      ],
      concepts: [{ term: 'Deadline propagation', def: 'Passing the remaining time budget with a request so every downstream hop can stop when it expires.' }],
      scene: {
        nodes: [users({ tag: pill('budget 1,000 ms', 'timer') }), web({ load: 40, tag: pill('remaining: 300 ms', 'clock', 'warn') }), catalog({ tag: pill('took 700 ms', 'clock') }), cart({ tag: pill('deadline 300 ms', 'timer', 'good') }), recs()],
        links: wires,
        flows: [flow(['users', 'web'], { back: true, rate: 2 }), flow(['web', 'cat'], { back: true, rate: 1.5, speed: 0.5 }), flow(['web', 'cart'], { back: true, rate: 1.5 })],
        metrics: { p99: '960 ms', threads: '80/200', errors: '0.3%', amp: '1×' },
      },
    },
    {
      short: 'Retries',
      kind: 'technique',
      title: 'Retry the transient failures',
      body: [
        'Many failures are brief: a connection reset during a deploy, a pod that just died, a dropped packet. Retrying once on another instance turns most of these into successes the user never sees.',
        'Retry only <b>idempotent</b> operations (reads, or writes with idempotency keys), only on retryable errors (timeouts, 503, connection refused — not 400 or 404), and only within the remaining deadline.',
      ],
      changes: [{ text: '1 retry on transient errors', tone: 'good' }, { text: 'Errors 0.3% → 0.02%', tone: 'good' }],
      scene: {
        nodes: [users(), web({ load: 42, tag: pill('retry once, other host', 'refresh', 'good') }), catalog(), cart(), recs()],
        links: wires,
        flows: [...healthy, flow(['web', 'cart'], { kind: 'fail', rate: 0.3 })],
        metrics: { p99: '310 ms', threads: '84/200', errors: { v: '0.02%', tone: 'good' }, amp: '1.01×' },
      },
    },
    {
      short: 'Storm',
      kind: 'problem',
      title: 'Retries multiply an outage',
      body: [
        'Recommendations slows under load. The page retries 3 times; Recommendations’ own client to its feature store also retries 3 times; that store’s driver retries 3 times. One user request becomes up to <code>3 × 3 × 3 = 27</code> requests at the bottom — exactly when it is least able to handle them.',
        'Retries that help with isolated blips turn a partial overload into a total one. This is a <b>retry storm</b>.',
      ],
      changes: [{ text: 'Retries at 3 layers → 27×', tone: 'bad' }],
      concepts: [{ term: 'Retry storm', def: 'Retries across many clients or layers multiplying load on an already struggling service.' }],
      scene: {
        nodes: [users(), web({ load: 70, tag: pill('× 3 retries', 'refresh', 'bad') }), catalog(), cart(), recs({ load: 100, state: 'hot', tag: pill('27× load', 'alert', 'bad') })],
        links: wires,
        flows: [flow(['users', 'web'], { back: true, rate: 2 }), flow(['web', 'recs'], { kind: 'heavy', back: true, rate: 7, speed: 0.4 })],
        metrics: { p99: { v: '2.8 s', tone: 'bad' }, threads: '170/200', errors: { v: '41%', tone: 'bad' }, amp: { v: '27×', tone: 'bad' } },
      },
    },
    {
      short: 'Backoff',
      kind: 'technique',
      title: 'Back off, add jitter, cap the budget',
      body: [
        'Three fixes, used together. <b>Exponential backoff</b>: wait 100 ms, then 200, 400… so retries thin out. <b>Jitter</b>: randomise each wait so thousands of clients don’t retry in lockstep. A <b>retry budget</b>: retries may add at most ~10% to normal traffic; beyond that, fail instead.',
        'And retry at <b>one layer</b> only — usually the one closest to the user — so attempts don’t multiply down the stack.',
      ],
      changes: [{ text: 'Retry budget 10%', tone: 'good' }, { text: 'Amplification 27× → 1.1×', tone: 'good' }],
      concepts: [
        { term: 'Exponential backoff', def: 'Increasing the delay between successive retries, typically doubling each time.' },
        { term: 'Retry budget', def: 'A cap on retries as a fraction of normal requests, to stop retries amplifying overload.' },
      ],
      scene: {
        nodes: [users(), web({ load: 50, tag: pill('budget: ≤ 10% retries', 'gauge', 'good') }), catalog(), cart(), recs({ load: 78, tag: pill('recovering', 'refresh', 'warn') })],
        links: wires,
        flows: [...healthy.slice(0, 3), flow(['web', 'recs'], { back: true, rate: 2.2, speed: 0.7 })],
        metrics: { p99: '480 ms', threads: '95/200', errors: '3%', amp: { v: '1.1×', tone: 'good' } },
      },
    },
    {
      short: 'Breaker',
      kind: 'technique',
      title: 'Circuit breaker: stop calling a broken service',
      body: [
        'If most recent calls to Recommendations failed, every new call is likely to fail too — after costing a full timeout. A <b>circuit breaker</b> tracks the error rate; past a threshold it <b>opens</b> and fails calls instantly without sending them.',
        'After a cool-down it goes <b>half-open</b> and lets a few trial requests through. If they succeed, it <b>closes</b>; if not, it opens again. Callers fail fast, and the struggling service gets breathing room to recover.',
      ],
      changes: [{ text: 'Breaker open: fail in 0 ms', tone: 'good' }, { text: 'Recs load drops → recovers', tone: 'good' }],
      concepts: [{ term: 'Circuit breaker', def: 'A wrapper that stops calling a failing dependency for a while (open), then probes it (half-open) before resuming (closed).' }],
      scene: {
        nodes: [users(), web({ load: 30, tag: pill('breaker: OPEN', 'x', 'warn') }), catalog(), cart(), recs({ load: 20, tag: pill('half-open in 10 s', 'clock') })],
        links: [link('users', 'web'), link('web', 'cat', { arrow: 'both' }), link('web', 'cart', { arrow: 'both' }), link('web', 'recs', { style: 'broken' })],
        flows: [...healthy.slice(0, 3)],
        metrics: { p99: { v: '190 ms', tone: 'good' }, threads: '60/200', errors: '0%*', amp: { v: '0×', tone: 'good' } },
      },
    },
    {
      short: 'Bulkheads',
      kind: 'technique',
      title: 'Bulkheads: one leak can’t sink the ship',
      body: [
        'Timeouts bound <i>how long</i> a bad dependency can hold a thread. <b>Bulkheads</b> bound <i>how many</i>: give each dependency its own small pool — 40 threads or connections for Recommendations, 60 for Cart. If Recommendations stalls, it can exhaust only its own 40.',
        'The name comes from ships: watertight compartments so one breach doesn’t flood the hull.',
      ],
      concepts: [{ term: 'Bulkhead', def: 'Isolating resources (thread or connection pools) per dependency so one failure can’t consume them all.' }],
      scene: {
        nodes: [users(), web({ load: 45, tag: pill('pools: cat 60 · cart 60 · recs 40', 'layers', 'good') }), catalog(), cart(), recs({ state: 'hot', tag: pill('40/40 used — only its own', 'alert', 'warn') })],
        links: wires,
        flows: [...healthy.slice(0, 3), flow(['web', 'recs'], { kind: 'heavy', rate: 1, speed: 0.3 })],
        metrics: { p99: '200 ms', threads: 'recs: 40/40', errors: '0%*', amp: '1×' },
      },
    },
    {
      short: 'Fallbacks',
      kind: 'technique',
      title: 'Degrade gracefully',
      body: [
        'Those “0%*” error rates hide a question: what does the page show when Recommendations is unavailable? Not an error. A <b>fallback</b>: a cached list from an hour ago, generic best-sellers, or simply no carousel.',
        'Decide per dependency whether it’s critical (no cart → can’t buy, show an error) or optional (no recommendations → still sell the product). Most of a page should be optional.',
      ],
      note: { kind: 'key', text: 'Timeouts, breakers and bulkheads stop failure from spreading. Fallbacks decide what the user sees instead — design them as deliberately as the happy path.' },
      changes: [{ text: 'Recs down → show best-sellers', tone: 'good' }],
      concepts: [{ term: 'Graceful degradation', def: 'Continuing to serve a reduced but useful response when some components fail.' }],
      scene: {
        nodes: [users({ tag: pill('page works ✓', 'check', 'good') }), web({ load: 30, tag: pill('fallback: best-sellers', 'list', 'good') }), catalog(), cart(), recs({ state: 'down' })],
        links: [link('users', 'web'), link('web', 'cat', { arrow: 'both' }), link('web', 'cart', { arrow: 'both' }), link('web', 'recs', { style: 'broken' })],
        flows: healthy.slice(0, 3),
        metrics: { p99: { v: '180 ms', tone: 'good' }, threads: '55/200', errors: { v: '0%', tone: 'good' }, amp: '0×' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Contain the blast radius',
      body: [
        'Every remote call needs a <b>timeout</b>, and requests should carry a <b>deadline</b>. Retry only idempotent, transient failures — at one layer, with <b>backoff, jitter and a budget</b>.',
        '<b>Circuit breakers</b> fail fast when a dependency is clearly down, <b>bulkheads</b> cap how much of you it can tie up, and <b>fallbacks</b> keep the product useful while it recovers.',
      ],
      scene: {
        nodes: [users(), web({ load: 40, tag: pill('timeout · retry · breaker · bulkhead', 'shield', 'good') }), catalog(), cart(), recs()],
        links: wires,
        flows: healthy,
        metrics: { p99: '190 ms', threads: '80/200', errors: '0.02%', amp: '1.01×' },
      },
    },
  ],
};

export default lesson;
