import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const src = (extra: Partial<SceneNode> = {}) => box('src', -15, 0, 'Event source', 'green', 'bolt', { size: [1.3, 1.3], height: 26, ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', -7, 0, 'Delivery queue', 'yellow', 'queue', { size: [1.6, 1], height: 14, ...extra });
const worker = (extra: Partial<SceneNode> = {}) => box('worker', 0, 0, 'Delivery workers', 'orange', 'cpu', { size: [1.3, 1.3], height: 28, ...extra });
const endpoint = (extra: Partial<SceneNode> = {}) => box('endpoint', 9, 0, 'Subscriber endpoint', 'blue', 'server', { size: [1.4, 1.4], height: 30, ...extra });
const dlq = (extra: Partial<SceneNode> = {}) => db('dlq', 0, 8, 'Dead-letter / log', { size: [1.3, 1.3], ...extra });

const fmtT = (s: number): string => (s >= 172800 ? `${(s / 86400).toFixed(1)} days` : s >= 7200 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(0)} min` : `${Math.round(s)} s`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n.toFixed(n < 10 ? 2 : 0));

const lesson: Lesson = {
  slug: 'academy-how-do-webhooks-work',
  title: 'How Webhooks Work',
  blurb: 'HTTP callbacks from one system to another: signed payloads, at-least-once delivery with exponential backoff, idempotent receivers, and the backlog when an endpoint goes down.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'attempts', label: 'Average attempts per event', icon: 'refresh' },
    { key: 'giveup', label: 'Retries span (time before giving up)', icon: 'clock' },
    { key: 'lost', label: 'Events never delivered / day', icon: 'alert' },
    { key: 'backlog', label: 'Backlog after an outage', icon: 'layers' },
  ],
  goals: [
    { text: 'Push callbacks versus polling', step: 1 },
    { text: 'Signing and verifying payloads', step: 2 },
    { text: 'Delivery guarantees and retry with backoff', step: 3 },
    { text: 'Idempotent, fast-acknowledging receivers', step: 4 },
    { text: 'Outages, ordering and replay', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Events per second', min: 1, max: 100000, step: 1, default: 200, unit: '/s', description: 'Events generated for this subscriber.' },
      { key: 'ok', label: 'Chance one delivery attempt succeeds', min: 50, max: 100, step: 0.1, default: 98, unit: '%', description: 'Endpoint responds 2xx within the timeout.' },
      { key: 'max', label: 'Maximum attempts', min: 1, max: 20, step: 1, default: 8, unit: '', description: 'Attempts before moving to a dead-letter store.' },
      { key: 'base', label: 'First retry delay', min: 1, max: 600, step: 1, default: 30, unit: ' s', description: 'Delay before attempt 2; it doubles each time.' },
      { key: 'outage', label: 'Endpoint outage length', min: 0, max: 1440, step: 5, default: 20, unit: ' min', description: 'Time the subscriber is completely down.' },
    ],
    calculate: (input, step) => {
      const rate = Math.max(0, input.rate ?? 200);
      const p = Math.min(1, Math.max(0.01, (input.ok ?? 98) / 100));
      const A = Math.max(1, Math.round(input.max ?? 8));
      const base = Math.max(1, input.base ?? 30);
      const outage = Math.max(0, input.outage ?? 20) * 60;
      const q = 1 - p;
      // Expected attempts: 1 + q + q² + … up to A attempts.
      let attempts = 0;
      for (let k = 0; k < A; k++) attempts += Math.pow(q, k);
      // Delays double: base, 2·base, … between attempts → total span.
      const span = base * (Math.pow(2, A - 1) - 1);
      const lostFrac = Math.pow(q, A);
      return {
        attempts: step < 2 ? { v: '—' } : { v: attempts.toFixed(2), tone: attempts < 1.1 ? 'good' : 'warn' },
        giveup: step < 2 ? { v: '—' } : { v: fmtT(span), tone: span > outage ? 'good' : 'bad' },
        lost: step < 2 ? { v: '—' } : { v: fmtN(rate * 86400 * lostFrac), tone: rate * 86400 * lostFrac < 1 ? 'good' : 'warn' },
        backlog: step < 4 ? { v: '—' } : { v: `${fmtN(rate * outage)} events${span < outage ? ' (older ones dead-lettered)' : ''}`, tone: span >= outage ? 'good' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Callbacks',
      kind: 'insight',
      title: 'Don’t poll — get called',
      body: [
        'A payment provider, a Git host or a CRM knows when something happens; your system wants to react. Polling their API every few seconds wastes requests, adds latency and hits rate limits. A <b>webhook</b> reverses it: you register a URL, and the provider sends an <b>HTTP <code>POST</code></b> with a JSON payload to it when an event occurs — “payment succeeded”, “push to main”.',
        'It is the simplest integration pattern on the internet: no persistent connection, works through firewalls, easy to test with a tunnel. Its simplicity hides the real engineering: the <i>sender</i> must deliver reliably to endpoints it doesn’t control, and the <i>receiver</i> must trust and survive what arrives.',
      ],
      scene: { nodes: [src({ tag: pill('payment.succeeded', 'bolt') }), endpoint({ tag: pill('POST /hooks/pay', 'file') })], links: [link('src', 'endpoint', { arrow: 'end' })], flows: [flow(['src', 'endpoint'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Signing',
      kind: 'technique',
      title: 'Is this really from them? Signatures',
      body: [
        'Anyone can POST to your public URL, so you must authenticate the sender. The standard pattern: the provider computes an <b>HMAC-SHA256</b> of the <i>raw request body</i> (plus a timestamp) with a <b>shared secret</b> and sends it in a header (<code>X-Signature</code>, <code>t=…,v1=…</code>). The receiver recomputes it over the exact bytes received and compares in <b>constant time</b>.',
        'Verify the <b>raw body</b> (not a re-serialised JSON), reject timestamps older than a few minutes to stop <b>replays</b>, rotate secrets, and serve the endpoint over HTTPS only. Some providers use asymmetric signatures (a public key to verify) or mutual TLS and IP allow-lists as extra layers — see the Digital Signatures lesson.',
      ],
      changes: [{ text: 'HMAC(secret, timestamp + raw body) in a header', tone: 'good' }, { text: 'Constant-time compare; reject stale timestamps', tone: 'good' }],
      scene: { nodes: [src({ tag: pill('signs with shared secret', 'lock') }), endpoint({ tag: pill('recompute · compare · check age', 'check', 'good') }), box('atk', 0, 8, 'Forged request', 'red', 'alert', { size: [1.2, 1.2], height: 22, tag: pill('bad signature → 401', 'shield', 'good') })], links: [link('src', 'endpoint'), link('atk', 'endpoint', { style: 'broken' })], flows: [flow(['src', 'endpoint'], { rate: 1.5 }), flow(['atk', 'endpoint'], { kind: 'fail', rate: 0.7 })] },
    },
    {
      short: 'Delivery',
      kind: 'technique',
      title: 'At-least-once delivery with exponential backoff',
      body: [
        'The sender can’t assume your endpoint is up. It puts each event on a <b>durable queue</b> and delivers with workers: a <code>2xx</code> within a timeout (a few seconds) means success; anything else — error, timeout, connection failure — means <b>retry later</b>, with <b>exponential backoff and jitter</b> (30 s, 1 min, 2 min, 4 min…) over hours or days, then a dead-letter store and an alert. Timeouts are ambiguous, so the same event can arrive twice: delivery is <b>at-least-once</b>.',
        'The numbers: with a 98% success rate each event needs on average <b>1.02 attempts</b>; 8 attempts starting at 30 s and doubling span <b>~1 hour</b>. The share still undelivered after all attempts is <code>(1 − p)^max</code> — negligible at 98% but ~0.4% if the endpoint fails half its attempts (0.5⁸). Disable endpoints that fail for days to protect the queue.',
      ],
      changes: [{ text: 'Delays: 30 s, 1 m, 2 m … → 8 attempts ≈ 1 h', tone: 'info' }, { text: 'Unacknowledged → retry; so duplicates happen', tone: 'info' }],
      scene: { nodes: [src(), queue({ tag: pill('durable', 'disk') }), worker({ tag: pill('retry: 30 s, 1 m, 2 m…', 'refresh') }), endpoint({ tag: pill('503 · timeout', 'alert', 'warn') }), dlq()], links: [link('src', 'queue'), link('queue', 'worker'), link('worker', 'endpoint', { arrow: 'both' }), link('worker', 'dlq', { style: 'dashed' })], flows: [flow(['src', 'queue', 'worker', 'endpoint'], { kind: 'write', rate: 1.5 }), flow(['worker', 'dlq'], { kind: 'fail', rate: 0.4 })] },
    },
    {
      short: 'Receiving',
      kind: 'technique',
      title: 'Receiver rules: acknowledge fast, process safely',
      body: [
        '<b>Acknowledge immediately</b>: verify the signature, write the raw event to your own durable queue or table, return <code>200</code> within a second or two, and process asynchronously. Slow handlers cause timeouts, which cause retries, which cause duplicate work. <b>Be idempotent</b>: events carry an <code>id</code>; store processed ids (unique constraint) and skip repeats (see the Idempotency Keys lesson).',
        '<b>Don’t trust the payload for important facts</b>: treat the webhook as a notification and <b>fetch the current state</b> from the provider’s API (the payment’s real status) — this handles reordering, spoofing and stale data at the cost of one call. Return <code>4xx</code> for permanently bad events so the sender stops retrying and <code>5xx</code> only for retryable failures.',
      ],
      changes: [{ text: 'Verify → store → 200 → process async', tone: 'good' }, { text: 'Dedupe by event id; fetch current state from the API', tone: 'good' }],
      scene: { nodes: [endpoint({ tag: pill('verify · enqueue · 200', 'check', 'good') }), box('q2', 9, 7, 'Own queue', 'yellow', 'queue', { size: [1.6, 1], height: 14 }), box('proc', 0, 7, 'Idempotent processor', 'green', 'cpu', { size: [1.3, 1.3], height: 24, tag: pill('unique event id', 'hash') })], links: [link('endpoint', 'q2'), link('q2', 'proc')], flows: [flow(['endpoint', 'q2', 'proc'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Outages',
      kind: 'problem',
      title: 'When the endpoint is down: backlog, ordering and replay',
      body: [
        'A 20-minute outage at 200 events/s builds a backlog of <b>240,000</b> events. With retries spanning an hour they will be delivered — but when the endpoint returns they arrive as a <b>burst</b> that can knock it down again: senders should rate-limit per endpoint and ramp up. If the outage outlasts the retry span (set the outage slider to 120 minutes), the oldest events are <b>dead-lettered and lost</b> unless the subscriber can <b>replay</b>.',
        '<b>Ordering</b> is not guaranteed — retries reorder events, so “updated” can arrive before “created”. Include a version or timestamp and make handlers order-tolerant, or fetch state. Good providers expose an <b>events API</b> and dashboard to list and redeliver missed events: reconcile periodically by listing events since your last seen id, so webhooks become an optimisation over a reliable pull. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: '20 min × 200/s = 240,000 queued events', tone: 'info' }, { text: 'Outage longer than the retry span → events dead-lettered', tone: 'bad' }, { text: 'Reconcile with the events API', tone: 'good' }],
      scene: { nodes: [src(), queue({ tag: pill('backlog 240,000', 'layers', 'warn') }), worker(), endpoint({ state: 'down', tone: 'red', tag: pill('down 20 min', 'alert', 'bad') })], links: [link('src', 'queue'), link('queue', 'worker'), link('worker', 'endpoint', { style: 'broken' })], flows: [flow(['src', 'queue'], { kind: 'write', rate: 2 }), flow(['worker', 'endpoint'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Sign, retry, deduplicate, reconcile',
      body: [
        'A webhook is an HTTP callback. <b>Senders</b> queue events durably, deliver at-least-once with exponential backoff (span ≈ <code>base × (2^(attempts−1) − 1)</code>), sign payloads with HMAC and offer replay. <b>Receivers</b> verify signatures over the raw body, acknowledge fast, process asynchronously and idempotently, and treat the payload as a hint to fetch current state.',
        'Plan for duplicates, reordering and outages longer than the retry window by reconciling against the provider’s events API.',
      ],
      scene: { nodes: [src(), queue(), worker(), endpoint()], links: [link('src', 'queue'), link('queue', 'worker'), link('worker', 'endpoint', { arrow: 'both' })], flows: [flow(['src', 'queue', 'worker', 'endpoint'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
