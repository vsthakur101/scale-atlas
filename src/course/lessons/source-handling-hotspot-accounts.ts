import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const payers = (extra: Partial<SceneNode> = {}) => crowd('payers', -18, 0, 12, 'concurrent payments', extra);
const app = (extra: Partial<SceneNode> = {}) => box('app', -9, 0, 'Payment service', 'orange', 'server', { size: [1.6, 1.6], height: 28, ...extra });
const hot = (extra: Partial<SceneNode> = {}) => db('hot', 3, 0, 'One account row (balance)', { size: [1.8, 1.8], ...extra });
const sub = (i: number, extra: Partial<SceneNode> = {}) => db(`sub${i}`, 4, -9 + i * 6, `Sub-account ${i + 1}`, { size: [1.2, 1.2], ...extra });
const batcher = (extra: Partial<SceneNode> = {}) => box('batcher', -1, 8, 'Micro-batcher (sums deltas)', 'purple', 'layers', { size: [1.4, 1.4], height: 24, ...extra });
const ledger = (extra: Partial<SceneNode> = {}) => db('ledger', 14, 0, 'Append-only ledger entries', { size: [1.5, 1.5], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-handling-hotspot-accounts',
  title: 'Hotspot Accounts: When Everyone Updates the Same Row',
  blurb: 'A platform fee account, a charity campaign or a popular merchant turns one balance row into a serial bottleneck capped at 1 ÷ lock-hold-time. Quantify the ceiling, then lift it by shortening the critical section, splitting into sub-accounts, batching deltas, or going append-only.',
  minutes: 12,
  level: 'Advanced',
  metrics: [
    { key: 'cap', label: 'Ceiling on one row (updates/s)', icon: 'gauge' },
    { key: 'over', label: 'Offered load vs that ceiling', icon: 'alert' },
    { key: 'k', label: 'Sub-accounts needed at target utilisation', icon: 'layers' },
    { key: 'batch', label: 'Micro-batching: batch size, utilisation, added latency', icon: 'timer' },
  ],
  goals: [
    { text: 'Why one hot row serialises everything', step: 1 },
    { text: 'Shorten the critical section', step: 2 },
    { text: 'Split the balance into sub-accounts', step: 3 },
    { text: 'Batch deltas or append to a ledger', step: 4 },
    { text: 'Invariants, ordering and detecting hotspots', step: 5 },
  ],
  legend: ['request', 'write', 'response', 'fail'],
  dynamic: {
    parameters: [
      { key: 'tps', label: 'Updates per second to the hot account', min: 10, max: 200000, step: 10, default: 5000, unit: '/s', description: 'Credits and debits touching one account.' },
      { key: 'hold', label: 'Row-lock hold time per transaction', min: 0.1, max: 100, step: 0.1, default: 4, unit: ' ms', description: 'From lock acquisition to commit (includes the log flush).' },
      { key: 'util', label: 'Target utilisation of each row', min: 20, max: 95, step: 5, default: 70, unit: '%', description: 'Headroom for bursts and retries.' },
      { key: 'win', label: 'Micro-batch window', min: 1, max: 200, step: 1, default: 10, unit: ' ms', description: 'Time over which deltas are summed before one update.' },
      { key: 'bhold', label: 'Lock hold for the batched update', min: 0.5, max: 50, step: 0.5, default: 5, unit: ' ms', description: 'One update of the summed delta.' },
    ],
    calculate: (input, step) => {
      const tps = Math.max(1, input.tps ?? 5000);
      const hold = Math.max(0.01, input.hold ?? 4) / 1000;
      const util = Math.min(0.99, Math.max(0.05, (input.util ?? 70) / 100));
      const win = Math.max(0.001, (input.win ?? 10) / 1000);
      const bhold = Math.max(0.0001, (input.bhold ?? 5) / 1000);
      const cap = 1 / hold;
      const k = Math.ceil(tps / (cap * util));
      const batchSize = tps * win;
      const flushes = 1 / win;
      const bUtil = flushes * bhold;
      const added = (win / 2 + bhold) * 1000;
      return {
        cap: step < 1 ? { v: '—' } : { v: `${fmtN(cap)}/s (1 ÷ ${(hold * 1000).toFixed(1)} ms)`, tone: cap >= tps ? 'good' : 'bad' },
        over: step < 1 ? { v: '—' } : { v: `${(tps / cap).toFixed(1)}× the ceiling`, tone: tps / cap <= 0.7 ? 'good' : tps / cap <= 1 ? 'warn' : 'bad' },
        k: step < 3 ? { v: '—' } : { v: `${fmtN(k)} sub-accounts (${fmtN(tps)} ÷ (${fmtN(cap)} × ${(util * 100).toFixed(0)}%))` },
        batch: step < 4 ? { v: '—' } : { v: `${fmtN(batchSize)} per batch · ${(bUtil * 100).toFixed(0)}% busy · +${added.toFixed(0)} ms`, tone: bUtil <= 0.7 ? 'good' : bUtil <= 1 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Hot row',
      kind: 'problem',
      title: 'One row, one lock, one at a time',
      body: [
        'Most rows are touched rarely, so row-level locking scales almost for free. Some are not: the <b>platform’s fee account</b> credited by every sale, a <b>campaign or charity wallet</b> during a viral moment, a <b>popular merchant</b> on sale day, a global counter. Every transaction does the same thing — <code>UPDATE accounts SET balance = balance + :x WHERE id = :hot</code> — and the database must <b>serialise</b> them: each takes the row lock, applies its change, commits, and releases it before the next may proceed (see the Isolation Levels and ACID lessons).',
        'The ceiling is arithmetic: with the lock held 4 ms per transaction (statement execution plus the commit’s log flush), one row can do <b>1 ÷ 0.004 = 250 updates/s</b> — however many cores, replicas or shards you have, because it is one row on one primary. At 5,000 payments/s the account is offered <b>20× its capacity</b>: a queue forms, wait times grow without bound, lock timeouts and deadlocks fire, and the <i>unrelated</i> queries sharing that connection pool and the primary’s CPU slow down too.',
      ],
      scene: { nodes: [payers({ tag: pill('5,000 payments/s', 'activity') }), app(), hot({ state: 'hot', load: 100, tag: pill('250/s ceiling', 'alert', 'bad') })], links: [link('payers', 'app'), link('app', 'hot')], flows: [flow(['payers', 'app', 'hot'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Short txn',
      kind: 'technique',
      title: 'First, make the critical section tiny',
      body: [
        'Throughput of a serial resource is <code>1 / service time</code>, so cut the time the lock is held. Do the update as <b>one atomic statement</b> (<code>SET balance = balance + :x WHERE id = :id AND balance + :x &gt;= 0</code> — check and apply together, no read-then-write round trips), keep <b>everything else outside the transaction</b> (validation, fraud checks, API calls, notifications), acquire the hot row <b>last</b> and in a consistent order across code paths to avoid deadlocks, and avoid triggers or foreign-key chains that extend the hold. Group commit (see the ACID lesson) lets many transactions share one log flush.',
        'Realistic gains are <b>2–5×</b>: dropping the hold from 4 ms to 1 ms lifts the ceiling to 1,000/s — still 5× short of 5,000/s. Shortening is worth doing first (it is cheap and benefits every other fix) but it cannot remove the serial bottleneck; for a load that is 20× over, the structure must change.',
      ],
      changes: [{ text: 'One atomic UPDATE with the check inside; no read-modify-write', tone: 'good' }, { text: 'Hold 4 ms → 1 ms = 250 → 1,000/s: still short', tone: 'info' }],
      scene: { nodes: [app({ tag: pill('validate outside the txn', 'check', 'good') }), hot({ tag: pill('lock held 1 ms', 'timer', 'good') })], links: [link('app', 'hot')], flows: [flow(['app', 'hot'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Sub-accounts',
      kind: 'technique',
      title: 'Split the balance across k sub-accounts',
      body: [
        'Replace one row with <b>k rows</b> whose balances sum to the account’s balance. Each credit or debit goes to <b>one sub-account</b>, chosen at random or by hash of the transaction id, so the load spreads and capacity multiplies to <code>k × 250/s</code>. At 70% target utilisation, k = ⌈5,000 ÷ (250 × 0.7)⌉ = <b>29 sub-accounts</b>. Reading the total is a <code>SUM</code> over k rows (cache it, or maintain it asynchronously — a displayed balance rarely needs to be exact to the cent in real time). Place sub-accounts on <b>different shards</b> if you need throughput beyond one primary.',
        'The price is the <b>no-overdraft invariant</b>. Total $10,000 over 29 sub-accounts is ~$345 each; a $500 debit fails on any single sub-account even though the account as a whole can afford it. Handle it by <b>retrying on another sub-account</b>, by routing debits to the <i>largest</i> sub-accounts, by a background <b>rebalancer</b> moving funds between sub-accounts, and by a strict slow path (lock all, or fall back to one row) only when the total is genuinely near zero. Credit-heavy accounts (fees, donations) rarely hit this; debit-heavy ones need more care.',
      ],
      changes: [{ text: 'k = ⌈5,000 ÷ (250 × 70%)⌉ = 29 sub-accounts', tone: 'good' }, { text: 'Reads sum k rows (cache them)', tone: 'info' }, { text: 'Debits can fail on a small sub-account: retry, route, rebalance', tone: 'bad' }],
      concepts: [{ term: 'Sub-account (sharded counter)', def: 'Splitting one hot value into several independently updated parts whose sum is the logical value, trading cheap writes for a costlier read and invariant checks.' }],
      scene: { nodes: [app({ tag: pill('pick a sub-account at random', 'hash') }), sub(0), sub(1), sub(2)], links: [link('app', 'sub0'), link('app', 'sub1'), link('app', 'sub2')], flows: [flow(['app', 'sub0'], { kind: 'write', rate: 1.2 }), flow(['app', 'sub1'], { kind: 'write', rate: 1.2 }), flow(['app', 'sub2'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Batch',
      kind: 'technique',
      title: 'Batch the deltas, or stop updating in place',
      body: [
        '<b>Micro-batching</b>: instead of applying each payment, the service (or a queue consumer — see the Message Queues lesson) accumulates deltas in memory for a short window, then applies <b>one update with the summed delta</b>. At 5,000/s with a 10 ms window each batch holds <b>50 payments</b>; one 5 ms update every 10 ms keeps the row <b>50% busy</b> and the hot-row throughput is no longer limited by 1/hold but by the window — at the cost of ~10 ms average added latency (half the window plus the update). Individual payments are still recorded in their own rows for audit; only the <i>balance</i> update is aggregated.',
        'The structural alternative is <b>append-only ledger entries</b>: each payment is an <code>INSERT</code> into a ledger (double-entry — see the Reconciliation lesson) with no shared row to contend on, and the balance is a <b>rollup</b> — a periodically refreshed snapshot plus entries since — or a derived read. Inserts into different rows and pages don’t conflict, so throughput scales with the log and storage, not with a lock. The costs are reads that must combine a snapshot with recent entries, and constraints (no overdraft) that need a separate, serialised authorisation step <i>only where they truly apply</i>.',
      ],
      changes: [{ text: '10 ms window: 50 payments per update, 50% lock utilisation, +10 ms', tone: 'good' }, { text: 'Append-only ledger: inserts don’t contend; balance = rollup', tone: 'good' }, { text: 'Overdraft checks still need a serial point', tone: 'bad' }],
      scene: { nodes: [app(), batcher({ tag: pill('sum 50 deltas / 10 ms', 'layers', 'good') }), hot({ tag: pill('1 update every 10 ms', 'check', 'good') }), ledger({ tag: pill('every payment appended', 'list') })], links: [link('app', 'batcher'), link('batcher', 'hot'), link('app', 'ledger')], flows: [flow(['app', 'batcher', 'hot'], { kind: 'write', rate: 2 }), flow(['app', 'ledger'], { kind: 'write', rate: 2.4 })] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Matching the fix to the invariant',
      body: [
        'Pick by what must be <b>true at commit time</b>. <b>Credit-only or additive</b> (fees, donations, counters, inventory returns): sub-accounts or batching — no invariant to check, so scale almost freely. <b>Balance-checked debits</b> (a wallet that must not go negative): keep a serial authorisation point but make it cheap — reserve funds with a short atomic update on a sharded balance, move heavy work off-path, or use <b>optimistic limits</b> (allow brief overshoot within a bound and reconcile). <b>Strict ordering</b> (a running balance printed on every statement line): preserve a single sequencer per account and batch within it; the ledger carries a sequence number.',
        'Operationally: <b>detect hotspots</b> early (lock-wait time, per-key QPS, top-N keys by update rate), alert before saturation, <b>isolate</b> hot accounts onto dedicated shards or queues so they can’t starve neighbours, apply <b>admission control</b> (reject or queue excess rather than letting it pile into lock waits), make writes <b>idempotent</b> (retries after timeouts must not double-apply — see the Idempotency lesson), and <b>reconcile</b> sub-account and rollup totals against the ledger. Figures here are model outputs with illustrative hold times.',
      ],
      changes: [{ text: 'Additive → shard or batch; checked debits → cheap serial authorisation', tone: 'info' }, { text: 'Detect hot keys, isolate, shed excess, idempotent writes, reconcile', tone: 'good' }],
      scene: { nodes: [app(), sub(0, { tag: pill('shard A', 'layers') }), sub(1, { tag: pill('shard B', 'layers') }), ledger({ tag: pill('source of truth', 'check', 'good') })], links: [link('app', 'sub0'), link('app', 'sub1'), link('app', 'ledger')], flows: [flow(['app', 'ledger'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A serial resource caps at 1 ÷ hold time; change the structure',
      body: [
        'One hot row handles <b>1 ÷ lock-hold-time</b> updates per second (250/s at 4 ms). Shorten the hold first, then <b>split into k sub-accounts</b> (k = load ÷ (ceiling × utilisation) = 29), <b>batch deltas</b> (50 per update, +10 ms) or <b>append to a ledger</b> and roll up the balance.',
        'Match the fix to the invariant, detect and isolate hotspots, and keep writes idempotent and reconcilable.',
      ],
      scene: { nodes: [payers(), app(), sub(0), sub(1), ledger()], links: [link('payers', 'app'), link('app', 'sub0'), link('app', 'sub1'), link('app', 'ledger')], flows: [flow(['payers', 'app', 'sub0'], { kind: 'write', rate: 2 })] },
    },
  ],
};

export default lesson;
