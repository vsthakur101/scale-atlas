import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const ledger = (extra: Partial<SceneNode> = {}) => db('ledger', -14, -6, 'Internal ledger (our records)', { size: [1.4, 1.4], ...extra });
const psp = (extra: Partial<SceneNode> = {}) => box('psp', -14, 6, 'Processor / PSP report', 'orange', 'file', { size: [1.4, 1.3], height: 22, ...extra });
const bank = (extra: Partial<SceneNode> = {}) => box('bank', -14, 0, 'Bank settlement statement', 'blue', 'scale', { size: [1.4, 1.3], height: 26, ...extra });
const engine = (extra: Partial<SceneNode> = {}) => box('engine', -2, 0, 'Matching engine', 'purple', 'layers', { size: [1.6, 1.6], height: 30, ...extra });
const matched = (extra: Partial<SceneNode> = {}) => db('matched', 10, -6, 'Matched (auto-cleared)', { size: [1.3, 1.3], ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', 10, 6, 'Exception queue (breaks)', 'red', 'alert', { size: [1.4, 1.3], height: 22, ...extra });
const analysts = (extra: Partial<SceneNode> = {}) => box('analysts', 18, 6, 'Operations analysts', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtD = (n: number): string => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString('en-US')}`);

const lesson: Lesson = {
  slug: 'source-reconciliation-in-payment',
  title: 'Payment Reconciliation: Matching Three Versions of the Truth',
  blurb: 'Why a payments company’s ledger, its processor and the bank never agree on their own, how matching engines clear 99%+ automatically — and how break rates turn directly into analyst headcount.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'breaks', label: 'Breaks per day (unmatched items)', icon: 'alert' },
    { key: 'value', label: 'Money sitting in unmatched items', icon: 'dollar' },
    { key: 'need', label: 'Analysts needed for real exceptions', icon: 'user' },
    { key: 'backlog', label: 'Backlog change per day', icon: 'gauge' },
  ],
  goals: [
    { text: 'Why independent records of one payment disagree', step: 1 },
    { text: 'Matching: exact keys, then rules and tolerances', step: 2 },
    { text: 'Three-way reconciliation and the break taxonomy', step: 3 },
    { text: 'Exception handling: aging, workload and capacity', step: 4 },
    { text: 'Designing systems that reconcile cleanly', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'txns', label: 'Transactions per day', min: 10000, max: 100000000, step: 10000, default: 2000000, unit: '', description: 'Items to reconcile each day.' },
      { key: 'exact', label: 'Cleared by exact key match', min: 80, max: 100, step: 0.1, default: 97, unit: '%', description: 'Share matching on unique id, amount and currency.' },
      { key: 'fuzzy', label: 'Additionally cleared by rules', min: 0, max: 15, step: 0.1, default: 2.5, unit: '%', description: 'Tolerance and aggregation rules: fee netting, date windows, batch settlement.' },
      { key: 'timing', label: 'Breaks that self-resolve (timing)', min: 0, max: 95, step: 1, default: 60, unit: '%', description: 'Counterparty record simply arrives the next cycle.' },
      { key: 'minutes', label: 'Handling time per real exception', min: 1, max: 60, step: 1, default: 4, unit: ' min', description: 'Analyst time to investigate and resolve one.' },
      { key: 'hours', label: 'Productive hours per analyst per day', min: 3, max: 8, step: 0.5, default: 6, unit: ' h', description: 'Net of meetings and breaks.' },
      { key: 'staff', label: 'Analysts on the team', min: 1, max: 1000, step: 1, default: 40, unit: '', description: 'Current staffing.' },
      { key: 'avg', label: 'Average value per item', min: 1, max: 5000, step: 1, default: 120, unit: ' $', description: 'Mean transaction value.' },
    ],
    calculate: (input, step) => {
      const txns = Math.max(1, input.txns ?? 2e6);
      const exact = Math.min(1, Math.max(0, (input.exact ?? 97) / 100));
      const fuzzy = Math.min(1 - exact, Math.max(0, (input.fuzzy ?? 2.5) / 100));
      const timing = Math.min(1, Math.max(0, (input.timing ?? 60) / 100));
      const minutes = Math.max(0.1, input.minutes ?? 4);
      const hours = Math.max(0.5, input.hours ?? 6);
      const staff = Math.max(0, input.staff ?? 40);
      const avg = Math.max(0, input.avg ?? 120);
      const breakRate = Math.max(0, 1 - exact - fuzzy);
      const breaks = txns * breakRate;
      const real = breaks * (1 - timing);
      const hoursNeeded = (real * minutes) / 60;
      const need = hoursNeeded / hours;
      const capacity = (staff * hours * 60) / minutes;
      const delta = real - capacity;
      return {
        breaks: step < 2 ? { v: '—' } : { v: `${fmtN(breaks)} (${(breakRate * 100).toFixed(2)}% of items)`, tone: breakRate < 0.005 ? 'good' : breakRate < 0.02 ? 'warn' : 'bad' },
        value: step < 3 ? { v: '—' } : { v: `${fmtD(breaks * avg)} unmatched · ${fmtD(real * avg)} needs action` },
        need: step < 4 ? { v: '—' } : { v: `${need.toFixed(1)} analysts (${staff} staffed)`, tone: need <= staff ? 'good' : 'bad' },
        backlog: step < 4 ? { v: '—' } : { v: delta <= 0 ? `clears ${fmtN(-delta)}/day spare` : `+${fmtN(delta)} items/day, growing`, tone: delta <= 0 ? 'good' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'One payment, three records that disagree',
      body: [
        'A card payment leaves records in several systems that don’t share a transaction: your own <b>ledger</b> (what you believe happened), the <b>processor or PSP report</b> (what they say they processed), and the <b>bank settlement statement</b> (what money actually arrived, usually <b>netted into one batch deposit</b> after fees, refunds and chargebacks). Each is correct by its own logic, yet they differ in <b>time</b> (authorised today, settled in two days), <b>amount</b> (fees deducted, FX applied), <b>granularity</b> (one deposit covers thousands of payments) and <b>identifiers</b> (different ids per system).',
        '<b>Reconciliation</b> is the control that proves these records agree, item by item, and surfaces the ones that don’t — <b>breaks</b>: money that is missing, duplicated, mis-sized or unexplained. It is both an accounting requirement (the books must tie to the bank) and a fraud and bug detector: a silent double charge or a lost settlement shows up here before a customer finds it.',
      ],
      scene: { nodes: [ledger({ tag: pill('2.00M items', 'db') }), psp({ tag: pill('2.00M items', 'file') }), bank({ tag: pill('1 netted deposit', 'dollar') })], links: [], flows: [] },
    },
    {
      short: 'Matching',
      kind: 'technique',
      title: 'Match on keys first, then on rules',
      body: [
        'The <b>matching engine</b> pairs records across sources. The cheap, certain pass is an <b>exact match</b> on a shared key — a unique reference or processor transaction id, plus amount and currency; at ~97% that clears most items with no human involved. What’s left goes through a <b>rule cascade</b>, from strict to loose: amount within a <b>tolerance</b> (rounding, FX), a <b>date window</b> (settles T+1 to T+3), <b>fee netting</b> (gross minus fee equals deposit), and <b>aggregate rules</b> — <i>one-to-many</i> (one bank deposit = sum of 8,000 payments) and <i>many-to-one</i> (several partial refunds = one reversal).',
        'Each rule carries a <b>confidence</b>; high-confidence rules auto-clear, lower ones propose a match for human confirmation. Good engines index on the join keys (hash joins over sorted batches), process in daily and intraday cycles, and keep every match decision <b>auditable</b> (which rule, which version, who approved). Rules lift auto-clearing from 97% to 99.5% here: a 6× smaller exception queue (60,000 → 10,000 items a day).',
      ],
      changes: [{ text: 'Exact key match clears the bulk', tone: 'good' }, { text: 'Tolerance, date-window, netting and one-to-many rules clear most of the rest', tone: 'good' }, { text: 'Every decision auditable', tone: 'info' }],
      concepts: [{ term: 'Break', def: 'An item present on one side that cannot be matched to the other side within the rules — a discrepancy to investigate.' }],
      scene: { nodes: [ledger(), psp(), bank(), engine({ tag: pill('exact → rules → aggregate', 'layers') }), matched({ tag: pill('99.5%', 'check', 'good') }), queue({ tag: pill('0.5% breaks', 'alert', 'warn') })], links: [link('ledger', 'engine'), link('psp', 'engine'), link('bank', 'engine'), link('engine', 'matched'), link('engine', 'queue')], flows: [flow(['psp', 'engine', 'matched'], { rate: 2 }), flow(['engine', 'queue'], { kind: 'fail', rate: 0.5 })] },
    },
    {
      short: 'Three-way',
      kind: 'technique',
      title: 'Three-way matching and the break taxonomy',
      body: [
        'Two-way reconciliation (ledger vs bank) tells you <i>that</i> something differs; adding the middle source — <b>ledger ↔ PSP ↔ bank</b> — tells you <i>where</i>. If the ledger and PSP agree but the bank deposit is short, the loss is between the processor and the bank; if the ledger and bank agree but the PSP differs, the processor’s report is wrong. Each hop is verified independently.',
        'Breaks fall into a small taxonomy that drives routing: <b>timing</b> (arrives next cycle — most of them; ~60% self-resolve), <b>missing</b> on one side (lost event, failed webhook), <b>duplicate</b> (retry without an idempotency key), <b>amount mismatch</b> (fee, FX or rounding the rules don’t cover), <b>status mismatch</b> (captured vs refunded), and <b>unknown</b> (an item that matches nothing). At 10,000 breaks a day of $120 average, <b>$1.2M</b> is unmatched on any day, of which the 40% that don’t self-resolve — 4,000 items, <b>$480,000</b> — needs action.',
      ],
      changes: [{ text: 'Third source localises the fault', tone: 'good' }, { text: 'Classify breaks: timing, missing, duplicate, amount, status', tone: 'info' }],
      scene: { nodes: [ledger({ tag: pill('A', 'db') }), psp({ tag: pill('B', 'file') }), bank({ tag: pill('C', 'dollar') }), engine({ tag: pill('A = B? B = C? A = C?', 'search') }), queue({ tag: pill('timing 60% · missing · duplicate · amount', 'list') })], links: [link('ledger', 'engine'), link('psp', 'engine'), link('bank', 'engine'), link('engine', 'queue')], flows: [flow(['engine', 'queue'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Operations',
      kind: 'problem',
      title: 'Exceptions are a queue: breaks become headcount',
      body: [
        'Each real exception needs a human to investigate, fix the cause (correct the ledger, chase the processor, claim a missing settlement) and document it. This is a queue with service times: at 4 minutes each, <b>4,000 real exceptions a day need 267 analyst-hours = 44.4 analysts at 6 productive hours</b>. With 40 on the team the capacity is 3,600 items a day, so the backlog grows by <b>400 a day</b> and ages — older breaks get harder to resolve (counterparties’ dispute windows close; chargeback and claim deadlines run out).',
        'Levers: raise the auto-match rate (the biggest — dropping exact+rule matching from 99.5% to 97% sextuples breaks and the headcount with them), add rules for recurring break patterns, <b>prioritise by value and age</b> rather than arrival order, auto-resolve timing breaks after a grace period, give analysts tooling that shows all three records side by side, and track <b>aging buckets</b> and a <b>match-rate SLO</b>. Figures here are model outputs with illustrative rates.',
      ],
      changes: [{ text: '4,000 exceptions × 4 min ÷ 6 h = 44 analysts needed', tone: 'bad' }, { text: 'Raise auto-match; prioritise by value and age', tone: 'good' }],
      scene: { nodes: [queue({ state: 'hot', tag: pill('4,000 real exceptions/day', 'alert', 'bad') }), analysts({ tag: pill('40 × 90/day = 3,600', 'user') })], links: [link('queue', 'analysts')], flows: [flow(['queue', 'analysts'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Design',
      kind: 'technique',
      title: 'Build systems that reconcile cleanly',
      body: [
        'Most breaks are created upstream. <b>Carry one correlation id</b> through every system (and the PSP’s reference back into your ledger) so exact matching works; use <b>idempotency keys</b> on every payment call so retries can’t duplicate (see the Idempotency lesson); make the ledger <b>append-only and double-entry</b> — corrections are <i>new</i> reversing entries, never edits — so history reproduces; and record status transitions as events so a captured-then-refunded payment is visible as two facts.',
        'Operationally: reconcile <b>continuously and by cut-off</b> (intraday for fast detection, end-of-day for the books), keep <b>sources immutable and timestamped</b>, store raw files as received, version the matching rules, and alert on a <b>sudden break-rate change</b> rather than only on absolute counts — a jump from 0.5% to 3% is a bug or an outage at a counterparty. Treat reconciliation as a product with an owner and a break-rate SLO, not month-end cleanup.',
      ],
      changes: [{ text: 'Correlation ids and idempotency keys prevent breaks', tone: 'good' }, { text: 'Append-only double-entry ledger; corrections are new entries', tone: 'good' }, { text: 'Alert on break-rate shifts', tone: 'good' }],
      scene: { nodes: [ledger({ tag: pill('append-only', 'lock', 'good') }), psp({ tag: pill('shared reference id', 'hash', 'good') }), engine(), matched({ tag: pill('99.5%+', 'check', 'good') })], links: [link('ledger', 'engine'), link('psp', 'engine'), link('engine', 'matched')], flows: [flow(['ledger', 'engine', 'matched'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Prove the books match the bank, and keep breaks small',
      body: [
        'Three independent records of a payment disagree by timing, amount and grain. <b>Reconciliation</b> matches them — exact keys first, then rules and aggregates — and routes the remaining <b>breaks</b> to humans: a 1% change in match rate is a many-fold change in headcount.',
        'Prevent breaks at the source with correlation ids, idempotency and an append-only ledger; manage the rest as a prioritised queue with aging and SLOs.',
      ],
      scene: { nodes: [ledger(), psp(), bank(), engine(), matched(), queue()], links: [link('ledger', 'engine'), link('psp', 'engine'), link('bank', 'engine'), link('engine', 'matched'), link('engine', 'queue')], flows: [flow(['psp', 'engine', 'matched'], { rate: 2 })] },
    },
  ],
};

export default lesson;
