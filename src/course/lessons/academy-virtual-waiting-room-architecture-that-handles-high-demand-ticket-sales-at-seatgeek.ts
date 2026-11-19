import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

/**
 * A general virtual-waiting-room mechanism for high-demand on-sales. The numbers are an
 * illustrative worked scenario, not measurements from any particular company.
 */

const fans = (n = 20, text = '150k fans', extra: Partial<SceneNode> = {}) => crowd('fans', -14, 0, n, text, extra);
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -6, 0, 'Edge', 'teal', 'globe', { size: [1.4, 1.4], height: 36, ...extra });
const room = (extra: Partial<SceneNode> = {}) => box('room', -6, -8, 'Waiting room', 'yellow', 'queue', { size: [2, 1.2], height: 26, ...extra });
const origin = (extra: Partial<SceneNode> = {}) => box('origin', 3, 0, 'Checkout', 'blue', 'server', { size: [1.6, 1.6], height: 42, ...extra });
const seats = (extra: Partial<SceneNode> = {}) => db('seats', 11, 0, 'Seat inventory', extra);
const pay = (extra: Partial<SceneNode> = {}) => box('pay', 11, 8, 'Payments', 'purple', 'dollar', { size: [1.2, 1.2], height: 30, ...extra });

const fmtDur = (s: number): string => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const fmtN = (n: number): string => (n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-virtual-waiting-room-architecture-that-handles-high-demand-ticket-sales-at-seatgeek',
  title: 'Virtual Waiting Room',
  blurb: 'When 150,000 people want 20,000 seats at the same second, queue them at the edge and let in only as many as the backend can serve — a worked example of Little’s Law as admission control.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'offered', label: 'Offered load', icon: 'bolt' },
    { key: 'admit', label: 'Admission rate', icon: 'activity' },
    { key: 'wait', label: 'Median wait', icon: 'clock' },
    { key: 'last', label: 'Longest wait', icon: 'timer' },
  ],
  goals: [
    { text: 'Why a flash crowd breaks checkout even with autoscaling', step: 2 },
    { text: 'How a waiting room holds traffic at the edge', step: 3 },
    { text: 'Deriving the admission rate with Little’s Law', step: 4 },
    { text: 'Fair ordering and signed admission tokens', step: 5 },
    { text: 'Failure modes: abandonment, bots, fail-open vs closed', step: 8 },
  ],
  legend: ['request', 'response', 'heavy', 'fail', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'fans', label: 'People arriving', min: 5, max: 1_000, step: 5, default: 150, unit: 'k', description: 'Visitors trying to buy as the sale opens.' },
      { key: 'cap', label: 'Checkout capacity', min: 500, max: 20_000, step: 500, default: 3_000, unit: ' req/s', description: 'Requests per second the purchase flow can serve.' },
      { key: 'reqs', label: 'Requests per purchase', min: 10, max: 200, step: 5, default: 60, unit: '', description: 'API calls an active shopper makes during one purchase attempt.' },
      { key: 'session', label: 'Time to buy', min: 1, max: 15, step: 0.5, default: 5, unit: ' min', description: 'How long an admitted shopper holds a spot.' },
      { key: 'util', label: 'Target utilisation', min: 40, max: 95, step: 5, default: 70, unit: '%', description: 'Share of capacity to use; the rest is headroom for spikes.' },
    ],
    calculate: (input, step) => {
      const fans = (input.fans ?? 150) * 1e3;
      const cap = input.cap ?? 3_000;
      const reqs = input.reqs ?? 60;
      const session = (input.session ?? 5) * 60;
      const util = (input.util ?? 70) / 100;
      // each active shopper generates reqs/session requests per second
      const perShopper = reqs / session;
      const offered = fans * perShopper;
      // concurrent shoppers the backend can carry, then Little's Law: λ = N / session
      const concurrent = (cap * util) / perShopper;
      const admit = concurrent / session;
      const median = fans / 2 / admit;
      const last = fans / admit;
      return {
        offered: { v: `${fmtN(offered)}/s (${(offered / cap).toFixed(offered / cap >= 10 ? 0 : 1)}× capacity)`, tone: offered > cap ? 'bad' : 'good' },
        admit: step < 3 ? { v: '— (no queue)' } : { v: `${admit.toFixed(admit < 10 ? 1 : 0)}/s`, tone: 'good' },
        wait: step < 3 ? { v: '—' } : { v: fmtDur(median), tone: median < 1800 ? 'good' : median < 7200 ? 'warn' : 'bad' },
        last: step < 3 ? { v: '—' } : { v: fmtDur(last), tone: last < 3600 ? 'good' : last < 14_400 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'On sale',
      kind: 'problem',
      title: '150,000 fans, 20,000 seats, one moment',
      body: [
        'Tickets for a stadium tour go on sale at 10:00:00. Everyone has been refreshing for ten minutes; at the stroke of ten, 150,000 people click “buy”. Normal traffic for this site is a few hundred requests a second.',
        'Each shopper tries to browse seats, select, hold and pay — dozens of API calls in a few minutes. Across 150,000 shoppers that is tens of thousands of requests a second against a purchase flow built for three thousand.',
      ],
      changes: [{ text: '~30,000 req/s offered vs 3,000 capacity', tone: 'bad' }],
      scene: {
        nodes: [fans(24), origin({ load: 100, state: 'hot', tag: pill('10× overload', 'alert', 'bad') }), seats({ load: 95, state: 'hot' })],
        links: [link('fans', 'origin'), link('origin', 'seats', { arrow: 'both' })],
        flows: [flow(['fans', 'origin'], { kind: 'heavy', rate: 7, speed: 0.6 }), flow(['fans', 'origin'], { kind: 'fail', rate: 3 })],
      },
    },
    {
      short: 'Why not scale',
      kind: 'insight',
      title: 'Autoscaling isn’t the answer to a cliff',
      body: [
        'New servers take minutes to start and warm; the crowd arrives in seconds and might be gone in an hour. The seat inventory is a <b>shared hot spot</b>: everyone contends for the same rows, so adding web servers just adds more contenders. And the payment provider has its own rate limits.',
        'Worse, failure feeds on itself: errors make people refresh and retry, multiplying load — a retry storm. Buyers see half-completed purchases and duplicate charges. Capacity for a peak that lasts minutes is expensive; the realistic fix is to <b>limit how many people are in the purchase flow at once</b>.',
      ],
      note: { kind: 'key', text: 'You can’t serve everyone at once, so decide who goes first — deliberately and fairly — instead of letting overload decide randomly.' },
      changes: [{ text: 'Retries multiply the overload', tone: 'bad' }, { text: 'Shared inventory: more servers ≠ more throughput', tone: 'bad' }],
      scene: {
        nodes: [fans(24), origin({ load: 100, state: 'hot', tag: pill('retries ×3', 'refresh', 'bad') }), seats({ load: 98, state: 'hot', tag: pill('row lock contention', 'lock', 'bad') }), pay({ tag: pill('provider limit', 'alert', 'warn') })],
        links: [link('fans', 'origin'), link('origin', 'seats', { arrow: 'both' }), link('origin', 'pay')],
        flows: [flow(['fans', 'origin'], { kind: 'fail', rate: 4 }), flow(['origin', 'seats'], { kind: 'heavy', rate: 2, speed: 0.5 })],
      },
    },
    {
      short: 'The room',
      kind: 'technique',
      title: 'Hold the crowd at the edge',
      body: [
        'A <b>virtual waiting room</b> sits in front of the purchase flow, at the CDN or edge. Visitors to the on-sale page are redirected to a lightweight, cacheable “you’re in line” page and registered in a queue. Only the queue — not the checkout — takes the hit of 150,000 arrivals, and a queue entry is far cheaper than a purchase session.',
        'The room then <b>admits</b> people into checkout at a controlled rate, and the origin never sees more than it can serve. Everyone else waits, informed, instead of fighting errors.',
      ],
      changes: [{ text: 'Checkout sees only admitted shoppers', tone: 'good' }, { text: 'Crowd absorbed by a static queue page', tone: 'good' }],
      concepts: [{ term: 'Virtual waiting room', def: 'An edge-hosted queue that admits visitors to a protected system at a rate its capacity can sustain.' }],
      scene: {
        nodes: [fans(24), edge({ tag: pill('static “in line” page', 'globe', 'good') }), room({ tag: pill('145,000 waiting', 'queue') }), origin({ load: 68, tag: pill('admitted only', 'check', 'good') }), seats({ load: 60 })],
        links: [link('fans', 'edge'), link('edge', 'room', { arrow: 'both' }), link('edge', 'origin', { label: pill('admit ~35/s', 'filter') }), link('origin', 'seats', { arrow: 'both' })],
        flows: [flow(['fans', 'edge'], { rate: 5 }), flow(['edge', 'room'], { kind: 'handshake', rate: 3 }), flow(['edge', 'origin', 'seats'], { back: true, rate: 1 })],
      },
    },
    {
      short: 'The maths',
      kind: 'technique',
      title: 'Admission rate from Little’s Law',
      body: [
        'Each active shopper makes about <code>requests ÷ time-to-buy</code> calls per second: 60 over 5 minutes is 0.2 req/s. A backend of 3,000 req/s run at 70% utilisation carries <code>2,100 ÷ 0.2 = 10,500</code> concurrent shoppers.',
        'Little’s Law (<code>N = λ × W</code>) turns that into an admission rate: <code>λ = 10,500 ÷ 300 s = 35</code> people per second. Someone at queue position p waits about <code>p ÷ λ</code>: the median fan waits ~36 minutes, the last of 150,000 about 71 minutes. Move the sliders — double capacity and every wait halves; a faster checkout does the same.',
      ],
      note: { kind: 'tip', text: 'Shortening the purchase flow is the cheapest way to shorten the queue: halving time-to-buy doubles the admission rate.' },
      changes: [{ text: '10,500 concurrent shoppers → 35 admitted/s' }, { text: 'Median wait 36 min · longest 71 min' }],
      concepts: [{ term: 'Little’s Law', def: 'In steady state, items in the system N = arrival rate λ × time in system W.' }],
      scene: {
        nodes: [fans(24), edge(), room({ tag: pill('position p → wait p ÷ 35 s', 'calc', 'accent') }), origin({ load: 70 }), seats({ load: 60 })],
        links: [link('fans', 'edge'), link('edge', 'room', { arrow: 'both' }), link('edge', 'origin'), link('origin', 'seats', { arrow: 'both' })],
        flows: [flow(['fans', 'edge'], { rate: 4 }), flow(['edge', 'origin', 'seats'], { back: true, rate: 1 })],
      },
    },
    {
      short: 'Fairness',
      kind: 'tradeoff',
      title: 'Who goes first? Random beats fastest-finger',
      body: [
        'Strict first-come-first-served rewards whoever connects first — bots, people with the fastest connection, anyone with 20 browser tabs. A fairer design opens a <b>pre-queue window</b> (say, ten minutes before the sale) and assigns positions by <b>random draw</b> among everyone who joined in it. Arriving at 09:50 or 09:59 makes no difference.',
        'After the window closes, latecomers queue behind in arrival order. Add <b>one entry per person</b> checks (account, device or verified-human challenges at the edge) so duplicate tabs don’t multiply a person’s chances.',
      ],
      changes: [{ text: 'Pre-queue lottery: position independent of arrival time', tone: 'good' }, { text: 'One entry per person / device', tone: 'good' }],
      scene: {
        nodes: [fans(24, 'joined 09:50–10:00'), edge(), room({ tag: pill('random draw: pos 41,207', 'hash', 'accent') }), origin({ load: 68 })],
        links: [link('fans', 'edge'), link('edge', 'room', { arrow: 'both' }), link('edge', 'origin')],
        flows: [flow(['fans', 'edge'], { rate: 3 }), flow(['edge', 'room'], { kind: 'handshake', rate: 2 })],
      },
    },
    {
      short: 'Token',
      kind: 'technique',
      title: 'A signed token as the ticket to checkout',
      body: [
        'When a person reaches the front, the room issues an <b>admission token</b>: a signed value (an HMAC or JWT) carrying a session ID and an expiry, set as a cookie. The edge or origin verifies the signature locally on every request — no call back to the queue — so a billion verifications never load the queue service.',
        'Make tokens short-lived (the time to buy plus a margin), bound to the session, and unforgeable without the secret. A copied link or cookie shared with a friend then stops working quickly, and expired sessions release their slot.',
      ],
      changes: [{ text: 'Verify signature at the edge, no queue lookup', tone: 'good' }],
      concepts: [{ term: 'Admission token', def: 'A signed, expiring credential proving a visitor was released from the queue, verifiable without contacting it.' }],
      scene: {
        nodes: [fans(10, 'admitted shopper', { count: 6 }), edge({ tag: pill('verify HMAC + expiry', 'lock', 'good') }), room({ tag: pill('issues signed token', 'key') }), origin({ load: 68 })],
        links: [link('fans', 'edge', { arrow: 'both' }), link('room', 'fans', { style: 'dashed', label: pill('token', 'key') }), link('edge', 'origin')],
        flows: [flow(['room', 'fans'], { kind: 'handshake', rate: 0.8 }), flow(['fans', 'edge', 'origin'], { back: true, rate: 1 })],
      },
    },
    {
      short: 'Waiting page',
      kind: 'technique',
      title: 'Keeping 145,000 people informed cheaply',
      body: [
        'Waiting people need updates, but 145,000 clients polling every second is its own flood. Serve a static page and have it poll a tiny edge-cached endpoint every 10–30 seconds with <b>random jitter</b> so requests spread evenly: at a 20-second interval that is about 7,000 requests a second of cached responses, trivial for a CDN.',
        'The response says the person’s approximate position and an estimated wait, or, when admitted, sets the token and redirects. Estimates should be honest ranges, recalculated from the actual admission rate.',
      ],
      changes: [{ text: '145k waiting ÷ 20 s polls ≈ 7k cached req/s', tone: 'good' }],
      scene: {
        nodes: [fans(24, 'waiting'), edge({ tag: pill('cached status JSON', 'bolt', 'good') }), room({ tag: pill('position + ETA', 'clock') })],
        links: [link('fans', 'edge', { arrow: 'both', label: pill('poll 10–30 s, jittered') }), link('edge', 'room', { style: 'dashed' })],
        flows: [flow(['fans', 'edge'], { kind: 'hit', back: true, rate: 3 }), flow(['edge', 'room'], { kind: 'handshake', rate: 0.5 })],
      },
    },
    {
      short: 'Failure',
      kind: 'case',
      title: 'Abandoned slots, bots and a dead queue',
      body: [
        'Admitted people don’t all buy: some leave the tab open. Without an idle timeout their slots stay occupied, throttling the real admission rate. <b>Release a slot</b> on purchase, on abandonment, or when the token expires, and keep the admission rate tied to <i>observed</i> concurrency, not a fixed schedule.',
        'Decide what the queue does when it fails. <b>Fail open</b> (let everyone through) risks the overload you were avoiding; <b>fail closed</b> (admit nobody) is safe but halts the sale. A common choice: degrade to a conservative fixed admission rate from a replicated store, and keep the signed-token check independent of the queue service.',
      ],
      changes: [{ text: 'Idle timeout frees abandoned slots', tone: 'good' }, { text: 'Queue down: fall back to a fixed, safe rate', tone: 'good' }],
      scene: {
        nodes: [fans(16, 'waiting'), edge(), room({ state: 'down', tag: pill('queue service down', 'alert', 'bad') }), origin({ load: 55, tag: pill('fixed rate: 20/s', 'filter', 'warn') })],
        links: [link('fans', 'edge'), link('edge', 'room', { style: 'broken' }), link('edge', 'origin')],
        flows: [flow(['fans', 'edge'], { rate: 3 }), flow(['edge', 'origin'], { back: true, rate: 0.8 }), flow(['edge', 'room'], { kind: 'fail', rate: 0.6 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Don’t serve everyone at once — serve everyone in turn',
      body: [
        'A <b>virtual waiting room</b> absorbs a flash crowd at the edge and admits shoppers at the rate the backend can serve. Derive that rate from capacity with <b>Little’s Law</b>: concurrent shoppers = capacity × utilisation ÷ requests per shopper-second; admission rate = concurrency ÷ time-to-buy.',
        'Make it fair with a random pre-queue draw, authorise entry with <b>signed, expiring tokens</b> verified at the edge, keep waiting pages cheap with jittered polling, release abandoned slots, and plan the queue’s own failure mode.',
      ],
      scene: {
        nodes: [fans(24), edge(), room(), origin({ load: 68 }), seats({ load: 60 })],
        links: [link('fans', 'edge'), link('edge', 'room', { arrow: 'both' }), link('edge', 'origin'), link('origin', 'seats', { arrow: 'both' })],
        flows: [flow(['fans', 'edge'], { rate: 4 }), flow(['edge', 'origin', 'seats'], { back: true, rate: 1 })],
      },
    },
  ],
};

export default lesson;
