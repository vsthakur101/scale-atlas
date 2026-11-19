import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -14, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -4, 0, 'Payments API', 'blue', 'server', { size: [1.4, 1.4], height: 32, ...extra });
const keys = (extra: Partial<SceneNode> = {}) => db('keys', 6, -6, 'Idempotency keys', { size: [1.4, 1.4], ...extra });
const ledger = (extra: Partial<SceneNode> = {}) => db('ledger', 6, 6, 'Charges', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtBytes = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-how-stripe-prevents-double-payment-using-idempotent-api',
  title: 'Idempotency Keys: Safe Retries for Payments',
  blurb: 'How a client-generated key plus one atomic insert turns “retry and hope” into “retry safely” — including the races, the mismatches and the storage bill.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'dup', label: 'Duplicate charges / day without keys', icon: 'alert' },
    { key: 'dupk', label: 'Duplicate charges / day with keys', icon: 'shield' },
    { key: 'store', label: 'Key store size', icon: 'disk' },
  ],
  goals: [
    { text: 'Why a timeout on a charge is ambiguous', step: 1 },
    { text: 'The key, the stored result and the replay', step: 3 },
    { text: 'Races and mismatched requests on one key', step: 4 },
    { text: 'Why key and charge must commit together', step: 5 },
    { text: 'What keeping keys costs and how long to keep them', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Charge requests per second', min: 1, max: 5000, step: 1, default: 200, unit: '/s', description: 'Average rate of charge creations.' },
      { key: 'timeout', label: 'Requests that time out', min: 0.01, max: 5, step: 0.01, default: 0.5, unit: '%', description: 'Share of requests where the client gives up waiting (network, load, deploys).' },
      { key: 'applied', label: 'Timed-out requests that were actually processed', min: 0, max: 100, step: 1, default: 60, unit: '%', description: 'Share of those timeouts where the server did charge the card and only the reply was lost.' },
      { key: 'hours', label: 'Key retention', min: 1, max: 168, step: 1, default: 24, unit: ' h', description: 'How long a key and its saved response are kept.' },
      { key: 'bytes', label: 'Stored bytes per key', min: 200, max: 5000, step: 100, default: 1000, unit: ' B', description: 'Key, request fingerprint and saved response.' },
    ],
    calculate: (input, step) => {
      const rate = Math.max(1, input.rate ?? 200);
      const t = Math.max(0, (input.timeout ?? 0.5) / 100);
      const a = Math.max(0, (input.applied ?? 60) / 100);
      const hours = Math.max(1, input.hours ?? 24);
      const bytes = Math.max(1, input.bytes ?? 1000);
      // Every timed-out-but-applied request is retried by a client that has no way to know, producing a second charge.
      const dup = rate * 86400 * t * a;
      return {
        dup: step < 1 ? { v: '—' } : { v: fmtN(dup), tone: dup > 100 ? 'bad' : dup > 0 ? 'warn' : 'good' },
        dupk: step < 2 ? { v: '—' } : { v: '0', tone: 'good' },
        store: step < 6 ? { v: '—' } : { v: fmtBytes(rate * hours * 3600 * bytes), tone: rate * hours * 3600 * bytes > 5e11 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Timeout',
      kind: 'problem',
      title: 'The charge that may or may not have happened',
      body: [
        'A client sends “charge this card $50”. The connection stalls and times out. Maybe the request never arrived. Maybe the payment was made and the <i>response</i> got lost. The client can’t tell, and has two bad options: <b>don’t retry</b> and risk the customer not being charged (or their order failing), or <b>retry</b> and risk charging twice.',
        'This isn’t rare: at 200 requests a second with 0.5% timeouts, and 60% of those actually processed, you get over <b>50,000 duplicate charges a day</b> if clients simply retry. The same ambiguity underlies every delivery guarantee (see the Delivery Semantics lesson); payments are where being wrong costs real money and trust.',
      ],
      changes: [{ text: 'Timeout → outcome unknown', tone: 'bad' }, { text: 'Blind retry → possible double charge', tone: 'bad' }],
      scene: { nodes: [client({ tag: pill('timeout… retry?', 'clock', 'warn') }), api(), ledger({ tag: pill('already charged?', 'alert') })], links: [link('client', 'api', { arrow: 'both', style: 'dashed' }), link('api', 'ledger')], flows: [flow(['client', 'api', 'ledger'], { kind: 'write', rate: 1 }), flow(['api', 'client'], { kind: 'fail', rate: 0.6, speed: 0.4 })] },
    },
    {
      short: 'The key',
      kind: 'technique',
      title: 'Let the client name the operation',
      body: [
        'The client generates a unique <b>idempotency key</b> (a random UUID) for each <i>logical</i> operation and sends it in a header: <code>Idempotency-Key: 4f9c…</code>. A retry reuses the <b>same key</b>. The key means “this is one intention, however many times you hear it”.',
        'The server’s promise: the first request with a given key is processed; every later request with that key returns <b>the same result</b> without running the charge again. Now retrying is always safe, so clients can retry freely — and retries are exactly what make timeouts survivable.',
      ],
      concepts: [{ term: 'Idempotency key', def: 'A client-supplied unique id for one logical operation; the server uses it to apply the operation at most once and replay its result.' }],
      scene: { nodes: [client({ tag: pill('key = 4f9c…', 'hash') }), api(), keys(), ledger()], links: [link('client', 'api', { arrow: 'both' }), link('api', 'keys', { arrow: 'both' }), link('api', 'ledger')], flows: [flow(['client', 'api'], { kind: 'write', rate: 1.2 }), flow(['api', 'keys'], { rate: 1 })] },
    },
    {
      short: 'Flow',
      kind: 'technique',
      title: 'Insert the key first, store the answer last',
      body: [
        'On each request the server tries to <b>insert</b> the key into a table with a unique constraint. If the insert succeeds, this is the first time: mark the key <i>in progress</i>, perform the charge, then save the <b>response</b> (status code and body) against the key and mark it complete.',
        'If the key already exists and is complete, return the saved response verbatim — including a saved error, so a retry of a failed request sees the same failure. The unique constraint, not application logic, is what makes “first one wins” safe.',
      ],
      changes: [{ text: 'New key → run charge → save response', tone: 'good' }, { text: 'Seen key → return the saved response', tone: 'good' }],
      scene: { nodes: [client(), api({ tag: pill('INSERT key (unique)', 'lock') }), keys({ tag: pill('status + response', 'file') }), ledger({ tag: pill('charged once', 'check', 'good') })], links: [link('client', 'api', { arrow: 'both' }), link('api', 'keys', { arrow: 'both' }), link('api', 'ledger')], flows: [flow(['client', 'api', 'keys'], { kind: 'write', rate: 1 }), flow(['api', 'ledger'], { kind: 'write', rate: 0.8 }), flow(['api', 'client'], { kind: 'response', rate: 1, speed: 0.8 })] },
    },
    {
      short: 'Races',
      kind: 'problem',
      title: 'Concurrent retries and mismatched requests',
      body: [
        'A client retries while the first attempt is <i>still running</i>. Both arrive; the insert lets one through and the other sees an <b>in-progress</b> key. It must not start a second charge — return a conflict (HTTP 409) or wait briefly for the first to finish, then return its result.',
        'And a key reused with <i>different</i> parameters — same key, $500 instead of $50 — is a client bug. Store a <b>fingerprint</b> of the request and reject a mismatch (HTTP 422/400) rather than silently replaying a response for a different request. Keys are scoped per account, so one customer’s UUID can’t collide with another’s.',
      ],
      changes: [{ text: 'In-progress key → 409 / wait, never a second charge', tone: 'good' }, { text: 'Different body, same key → reject', tone: 'good' }],
      scene: { nodes: [client({ name: 'Attempt 1 + retry', tag: pill('two requests, one key', 'layers', 'warn') }), api(), keys({ tag: pill('in progress', 'clock') })], links: [link('client', 'api', { arrow: 'both' }), link('api', 'keys', { arrow: 'both' })], flows: [flow(['client', 'api', 'keys'], { kind: 'write', rate: 1 }), flow(['client', 'api'], { kind: 'fail', rate: 0.7 })] },
    },
    {
      short: 'Atomic',
      kind: 'technique',
      title: 'The key and the charge must commit together',
      body: [
        'If the key is saved as “complete” in one transaction and the charge happens in another, a crash between them leaves a key claiming a charge that never occurred — or a charge with no key, so the retry runs it again. Put the key row, the ledger entry and the saved response in <b>one database transaction</b>.',
        'When the real side effect lives <i>outside</i> your database (a card network), you can’t make it atomic. Record <b>recovery points</b> — “charge requested” before, “charge confirmed” after — and pass your own idempotency key to the downstream call, so a crashed request can be resumed or safely re-driven. Each hop in a chain needs its own key.',
      ],
      changes: [{ text: 'Key + ledger + response in one transaction', tone: 'good' }, { text: 'External call: recovery points + downstream key', tone: 'info' }],
      scene: { nodes: [api({ tag: pill('BEGIN … COMMIT', 'lock') }), keys(), ledger(), box('card', 16, 0, 'Card network', 'orange', 'globe', { size: [1.3, 1.3], height: 28, tag: pill('downstream key', 'hash') })], links: [link('api', 'keys'), link('api', 'ledger'), link('ledger', 'card', { style: 'dashed' })], flows: [flow(['api', 'keys'], { kind: 'write', rate: 1 }), flow(['api', 'ledger'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Methods',
      kind: 'insight',
      title: 'Which operations need a key?',
      body: [
        'HTTP says <code>GET</code>, <code>PUT</code> and <code>DELETE</code> should already be idempotent: setting a resource to a value twice, or deleting it twice, ends in the same state. <b><code>POST</code> that creates something is not</b> — each call makes a new one — so “create charge”, “send email”, “place order” are where keys belong.',
        'You can also get idempotency without a key table: a <b>natural key</b> such as an order id with a unique constraint (“at most one payment per order”), or compare-and-set on a version. Keys are the general tool when no natural unique identifier exists.',
      ],
      scene: { nodes: [box('get', -6, -6, 'GET / PUT / DELETE', 'green', 'check', { size: [1.4, 1.4], height: 24, tag: pill('already idempotent', 'check', 'good') }), box('post', 6, -6, 'POST create', 'red', 'alert', { size: [1.4, 1.4], height: 24, tag: pill('needs a key', 'hash', 'warn') }), box('nat', 0, 6, 'Natural key', 'blue', 'lock', { size: [1.4, 1.4], height: 24, tag: pill('UNIQUE(order_id)', 'lock') })], links: [], flows: [] },
    },
    {
      short: 'Cost',
      kind: 'tradeoff',
      title: 'Keys have a lifetime and a storage cost',
      body: [
        'Every request leaves a record. At 200/s with 1 KB per record and 24 hours’ retention that is <b>~17 GB</b>; at 5,000/s and a week it is about 3 TB — manageable, but real. Retention is a trade: shorter keys cost less but a retry after expiry runs as new, so choose a window longer than any client could plausibly keep retrying (hours to a day is typical) and tell clients what it is.',
        'Implement expiry with a TTL or a partitioned table you can drop, not a delete-heavy cleanup job. Keep keys in the same database as the ledger when you need atomicity; a separate cache (Redis) is faster but loses the transactional guarantee and the keys on eviction.',
      ],
      changes: [{ text: '200/s × 24 h × 1 KB ≈ 17 GB', tone: 'info' }, { text: 'Expired key + late retry = a new operation', tone: 'bad' }],
      scene: { nodes: [keys({ tag: pill('TTL / drop partition', 'clock') }), api(), ledger()], links: [link('api', 'keys', { arrow: 'both' }), link('api', 'ledger')], flows: [flow(['api', 'keys'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Make the retry harmless, not the failure impossible',
      body: [
        'A timeout can’t be told apart from a lost reply, so make the operation <b>safe to repeat</b>: client-generated key, unique-constraint insert, saved response replayed on repeat, a fingerprint to catch misuse, and a transaction (or recovery points) so key and effect agree.',
        'Use it for every non-idempotent write that costs money or sends something irreversible, pass keys through each downstream hop, and keep them long enough to outlast any retry. Figures here are illustrative model outputs for sizing, not measurements of any provider.',
      ],
      scene: { nodes: [client(), api(), keys(), ledger()], links: [link('client', 'api', { arrow: 'both' }), link('api', 'keys', { arrow: 'both' }), link('api', 'ledger')], flows: [flow(['client', 'api'], { kind: 'write', rate: 1.2 }), flow(['api', 'ledger'], { kind: 'write', rate: 0.8 })] },
    },
  ],
};

export default lesson;
