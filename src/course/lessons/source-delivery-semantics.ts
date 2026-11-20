import type { Lesson, SceneNode } from '../../types';
import { box, disk, flow, link, pill } from '../kit';

const prod = (extra: Partial<SceneNode> = {}) => box('prod', -13, 0, 'Producer', 'blue', 'server', { size: [1.3, 1.3], height: 30, ...extra });
const broker = (extra: Partial<SceneNode> = {}) => disk('broker', -1, 0, 'Broker log', { size: [3, 1.2], height: 20, tone: 'yellow', icon: 'list', ...extra });
const cons = (extra: Partial<SceneNode> = {}) => box('cons', 11, 0, 'Consumer', 'purple', 'cpu', { size: [1.3, 1.3], height: 30, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('en-US')}k` : `${Math.round(n)}`);
const fmtBytes = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);

const lesson: Lesson = {
  slug: 'source-delivery-semantics',
  title: 'At-Most-Once, At-Least-Once and Exactly-Once Delivery',
  blurb: 'At-most-once, at-least-once and “exactly-once”: what a network failure forces you to choose, and how Kafka-style systems and idempotent consumers fake the third.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'lost', label: 'At-most-once: lost / hour', icon: 'alert' },
    { key: 'dup', label: 'At-least-once: duplicates / hour', icon: 'layers' },
    { key: 'store', label: 'Dedup memory for exactly-once', icon: 'disk' },
  ],
  goals: [
    { text: 'Why a lost reply forces a choice between loss and duplicates', step: 1 },
    { text: 'At-most-once versus at-least-once and when each is right', step: 3 },
    { text: 'Exactly-once = at-least-once + idempotent processing', step: 4 },
    { text: 'The Kafka settings that decide whether messages are lost', step: 6 },
    { text: 'Why external side effects still need idempotency keys', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Messages per second', min: 100, max: 1000000, step: 100, default: 5000, unit: '/s', description: 'Steady send rate.' },
      { key: 'fail', label: 'Sends with unknown outcome', min: 0.001, max: 5, step: 0.001, default: 0.1, unit: '%', description: 'Share of sends where the producer never learns whether the message arrived (timeout, dropped reply, crash).' },
      { key: 'window', label: 'Dedup window', min: 1, max: 1440, step: 1, default: 60, unit: ' min', description: 'How long a consumer remembers processed ids to reject duplicates.' },
      { key: 'bytes', label: 'Bytes per remembered id', min: 16, max: 256, step: 8, default: 32, unit: ' B', description: 'Id plus hash-table overhead.' },
    ],
    calculate: (input, step) => {
      const rate = Math.max(1, input.rate ?? 5000);
      const p = Math.max(0, (input.fail ?? 0.1) / 100);
      const win = Math.max(1, input.window ?? 60) * 60;
      const bytes = Math.max(1, input.bytes ?? 32);
      const unknown = rate * 3600 * p;
      return {
        lost: step < 1 ? { v: '—' } : { v: `up to ${fmtN(unknown)}`, tone: unknown > 1000 ? 'bad' : 'warn' },
        dup: step < 2 ? { v: '—' } : { v: `up to ${fmtN(unknown)}`, tone: unknown > 1000 ? 'warn' : 'good' },
        store: step < 3 ? { v: '—' } : { v: fmtBytes(rate * win * bytes), tone: rate * win * bytes > 2e9 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Unknown',
      kind: 'problem',
      title: 'A missing reply doesn’t say what happened',
      body: [
        'A producer sends a message and waits for an acknowledgement that never comes. Did the broker <b>never receive</b> it? Did it <b>store</b> it and the ack was lost? Did the broker crash after storing but before replying? From the producer’s side all three look identical: silence.',
        'Whatever it does next is a bet. If it gives up, the message may be lost. If it resends, the message may now exist twice. No protocol over an unreliable network can remove that ambiguity — only choose which error you accept, and add machinery to hide the other one.',
      ],
      note: { kind: 'key', text: 'Messaging guarantees are decisions about what to do when a reply is missing.' },
      scene: { nodes: [prod({ tag: pill('no ack — now what?', 'clock', 'warn') }), broker({ tag: pill('stored? unknown', 'alert') })], links: [link('prod', 'broker', { arrow: 'both', style: 'dashed' })], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 1 }), flow(['broker', 'prod'], { kind: 'fail', rate: 0.6, speed: 0.4 })] },
    },
    {
      short: 'At-most-once',
      kind: 'technique',
      title: 'At-most-once: send and forget',
      body: [
        'Fire the message; never retry. It arrives <b>zero or one</b> times. Nothing is ever duplicated, nothing is ever repeated — and any send whose outcome was unknown may be gone for good. On the consumer side the equivalent is committing the offset <i>before</i> processing: a crash mid-work skips the message.',
        'Fine for data where a loss is invisible or self-heals: metrics samples, heartbeats, high-frequency telemetry, live position updates. Lowest latency and simplest code. At 5,000 messages a second and 0.1% unknown outcomes, up to 18,000 messages an hour disappear — acceptable for a gauge, not for an order.',
      ],
      changes: [{ text: 'Delivered 0 or 1 times', tone: 'info' }, { text: 'Loss possible, duplicates impossible', tone: 'bad' }],
      scene: { nodes: [prod({ tag: pill('send once, no retry', 'bolt') }), broker(), cons()], links: [link('prod', 'broker'), link('broker', 'cons')], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 1.5 }), flow(['broker', 'cons'], { rate: 1.2 })] },
    },
    {
      short: 'At-least-once',
      kind: 'technique',
      title: 'At-least-once: retry until acknowledged',
      body: [
        'Keep resending until you get an ack. Now the message arrives <b>one or more</b> times: if the original had actually been stored and only the ack was lost, the retry creates a duplicate. On the consumer side: process first, commit the offset after — a crash between the two replays the message.',
        'This is the sane default for anything you can’t afford to lose, and nearly every queue and broker offers it. The price moves to the receiver: it <b>must tolerate duplicates</b>. The metric above shows how many are possible per hour at your failure rate.',
      ],
      changes: [{ text: 'Delivered 1 or more times', tone: 'info' }, { text: 'No loss, duplicates possible', tone: 'good' }],
      scene: { nodes: [prod({ tag: pill('retry until ack', 'refresh') }), broker({ tag: pill('duplicate stored', 'layers', 'warn') }), cons()], links: [link('prod', 'broker'), link('broker', 'cons')], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 2 }), flow(['prod', 'broker'], { kind: 'write', rate: 0.8 }), flow(['broker', 'cons'], { rate: 1.5 })] },
    },
    {
      short: 'Exactly-once',
      kind: 'insight',
      title: '“Exactly-once” = at-least-once + idempotence',
      body: [
        'True exactly-once <i>delivery</i> over a lossy network is impossible, but exactly-once <i>effect</i> is achievable: deliver at-least-once, and make processing <b>idempotent</b> so repeats change nothing. Give every message a unique id (or a stable business key); the consumer records processed ids and skips ones it has seen — ideally in the <i>same transaction</i> as the side effect, so “did the work” and “remembered it” can’t diverge.',
        'The memory cost is <code>rate × window × bytes per id</code>: at 5,000/s, a 60-minute window and 32 bytes per entry, about <b>576 MB</b>. A shorter window is cheaper but misses late duplicates; a business key that is naturally unique (an order id with a unique constraint) removes the store entirely.',
      ],
      changes: [{ text: 'Unique id + dedup store → duplicates skipped', tone: 'good' }, { text: 'Remember and act in one transaction', tone: 'good' }],
      concepts: [{ term: 'Idempotent', def: 'An operation that has the same effect whether it is applied once or many times.' }],
      scene: { nodes: [prod({ tag: pill('id = 7f3a', 'hash') }), broker(), cons({ tag: pill('seen 7f3a → skip', 'check', 'good') }), disk('seen', 11, 7, 'Processed ids', { size: [2.6, 1.1], height: 18 })], links: [link('prod', 'broker'), link('broker', 'cons'), link('cons', 'seen', { arrow: 'both' })], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 1.5 }), flow(['broker', 'cons'], { rate: 1.5 })] },
    },
    {
      short: 'Kafka',
      kind: 'technique',
      title: 'How Kafka packages the pieces',
      body: [
        'The <b>idempotent producer</b> (<code>enable.idempotence</code>) tags each batch with a producer id and a per-partition sequence number; the broker discards a retry it has already appended, so producer retries don’t duplicate. <b>Transactions</b> let a consumer-process-produce loop write its output records <i>and</i> its input offsets atomically, so a crash either completes both or neither.',
        'That gives exactly-once <i>within Kafka</i> — read a topic, transform, write a topic. Consumers choosing <code>read_committed</code> skip aborted transactions. Outside that boundary (a database write, an email, a payment) Kafka can’t help: those side effects need their own idempotency.',
      ],
      changes: [{ text: 'Producer id + sequence → retries deduplicated', tone: 'good' }, { text: 'Offsets + output committed atomically', tone: 'good' }],
      scene: { nodes: [prod({ tag: pill('pid + sequence #', 'hash') }), broker({ tag: pill('drops repeated sequence', 'check', 'good') }), cons({ tag: pill('read_committed', 'shield') })], links: [link('prod', 'broker'), link('broker', 'cons')], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 1.5 }), flow(['broker', 'cons'], { rate: 1.5 })] },
    },
    {
      short: 'Losing data',
      kind: 'problem',
      title: 'Can Kafka lose messages? Yes, by configuration',
      body: [
        'With <code>acks=1</code> the leader acknowledges once <i>it</i> has written the record; if it crashes before followers copy it and a follower becomes leader, the acknowledged record is gone. <code>acks=all</code> waits for the in-sync replicas, and <code>min.insync.replicas=2</code> refuses writes when too few replicas are in sync. Allowing <b>unclean leader election</b> trades durability for availability by promoting an out-of-date replica.',
        'Consumer side: <b>auto-commit before processing</b> means a crash skips records; commit after processing for at-least-once. And retention (time or size) deletes data a slow consumer hasn’t read yet. A durable setup: <code>acks=all</code>, replication factor 3, <code>min.insync.replicas=2</code>, unclean election off, idempotent producer, commit after work.',
      ],
      changes: [{ text: 'acks=1 + leader crash → acknowledged write lost', tone: 'bad' }, { text: 'acks=all, RF 3, min.insync 2, no unclean election', tone: 'good' }],
      scene: { nodes: [prod({ tag: pill('acks = 1', 'alert', 'warn') }), broker({ state: 'hot', tag: pill('leader dies before replicating', 'alert', 'bad') }), cons()], links: [link('prod', 'broker'), link('broker', 'cons', { style: 'broken' })], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 1.5 }), flow(['broker', 'cons'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Side effects',
      kind: 'case',
      title: 'Case: charging a card twice',
      body: [
        'A consumer reads “charge order 981”, calls the payment API, then crashes before committing its offset. On restart it re-reads the message and charges again. Kafka’s exactly-once never saw the external call; at-least-once did its job and the effect still repeated.',
        'The fix is an <b>idempotency key</b> sent with the side effect — the order id or a message id. The payment provider stores the first result for that key and returns it for every repeat. The same pattern guards emails, webhooks and any call you can’t roll back: the receiver, not the transport, makes the repeat harmless.',
      ],
      changes: [{ text: 'Crash before offset commit → message replayed', tone: 'bad' }, { text: 'Idempotency key → provider returns the first result', tone: 'good' }],
      scene: { nodes: [cons({ name: 'Charge worker', tag: pill('key = order-981', 'hash') }), box('pay', 9, 0, 'Payment API', 'green', 'shield', { size: [1.4, 1.4], height: 30, tag: pill('same key → same result', 'check', 'good') })], links: [link('cons', 'pay', { arrow: 'both' })], flows: [flow(['cons', 'pay'], { kind: 'write', rate: 1.2 }), flow(['cons', 'pay'], { kind: 'write', rate: 0.8 }), flow(['pay', 'cons'], { kind: 'response', rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Choose loss or duplicates, then make duplicates harmless',
      body: [
        '<b>At-most-once</b> risks loss; <b>at-least-once</b> risks duplicates; <b>exactly-once</b> is at-least-once with idempotent processing (dedup store, unique constraints, idempotency keys). Kafka’s idempotent producer and transactions deliver this inside Kafka; side effects outside it need their own keys.',
        'Default for important data: at-least-once plus idempotent consumers. Use at-most-once only where a loss is cheap. Size dedup windows from <code>rate × window × bytes</code>, and check durability settings (acks, replication, min in-sync, commit order) — most “lost” messages are configuration.',
      ],
      scene: { nodes: [prod(), broker(), cons()], links: [link('prod', 'broker'), link('broker', 'cons')], flows: [flow(['prod', 'broker'], { kind: 'write', rate: 1.5 }), flow(['broker', 'cons'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
