import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const payer = (extra: Partial<SceneNode> = {}) => box('payer', -17, 0, 'Payer app (PSP)', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const payerBank = (extra: Partial<SceneNode> = {}) => box('pbank', -9, -6, 'Payer bank', 'red', 'db', { size: [1.3, 1.3], height: 28, ...extra });
const switchN = (extra: Partial<SceneNode> = {}) => box('switch', -1, 0, 'Central switch', 'purple', 'route', { size: [1.6, 1.6], height: 34, ...extra });
const payeeBank = (extra: Partial<SceneNode> = {}) => box('ybank', 8, -6, 'Payee bank', 'blue', 'db', { size: [1.3, 1.3], height: 28, ...extra });
const payee = (extra: Partial<SceneNode> = {}) => box('payee', 15, 0, 'Payee app (PSP)', 'orange', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const ledger = (extra: Partial<SceneNode> = {}) => db('ledger', -1, 8, 'Transaction log / reconciliation', { size: [1.4, 1.4], ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-unified-payments-interface-upi',
  title: 'Real-Time Payments: How UPI-Style Systems Work',
  blurb: 'A central switch routes debit and credit requests between banks in seconds, using virtual addresses and a PIN — and spends most of its engineering on the ambiguous middle: pending, timeouts and reconciliation.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'peak', label: 'Peak transactions per second', icon: 'activity' },
    { key: 'lat', label: 'End-to-end latency', icon: 'clock' },
    { key: 'pend', label: 'Transactions left pending / day', icon: 'alert' },
    { key: 'rev', label: 'Automatic reversals needed / day', icon: 'refresh' },
  ],
  goals: [
    { text: 'The parties: PSP apps, the central switch and banks', step: 1 },
    { text: 'Virtual addresses and the pay flow, step by step', step: 2 },
    { text: 'Why a debit and a credit are two separate calls', step: 3 },
    { text: 'The ambiguous middle: timeouts, pending, reversals', step: 4 },
    { text: 'Scale, resilience and fraud controls', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'tpd', label: 'Transactions per day', min: 100000, max: 1000000000, step: 100000, default: 10000000, unit: '', description: 'Daily volume through the switch.' },
      { key: 'peak', label: 'Peak-to-average ratio', min: 1, max: 20, step: 0.5, default: 6, unit: '×', description: 'Busiest second relative to the daily average second.' },
      { key: 'hop', label: 'Latency per network hop', min: 5, max: 300, step: 5, default: 40, unit: ' ms', description: 'One-way latency of each of the six message legs.' },
      { key: 'dec', label: 'Bank processing time (debit + credit)', min: 50, max: 3000, step: 50, default: 600, unit: ' ms', description: 'Combined time both banks take to post their sides.' },
      { key: 'to', label: 'Calls that time out or fail ambiguously', min: 0.01, max: 5, step: 0.01, default: 0.3, unit: '%', description: 'Share of transactions where a response is lost or late.' },
      { key: 'debited', label: 'Of those, debited but credit unknown', min: 0, max: 100, step: 1, default: 40, unit: '%', description: 'Share where the payer’s account was actually debited.' },
    ],
    calculate: (input, step) => {
      const tpd = Math.max(1, input.tpd ?? 1e7);
      const peakR = Math.max(1, input.peak ?? 6);
      const hop = Math.max(1, input.hop ?? 40);
      const dec = Math.max(1, input.dec ?? 600);
      const to = Math.max(0, (input.to ?? 0.3) / 100);
      const debited = Math.min(1, Math.max(0, (input.debited ?? 40) / 100));
      const tps = (tpd / 86400) * peakR;
      // PSP → switch → payer bank → switch → payee bank → switch → PSP: six legs, plus both banks’ processing.
      const lat = 6 * hop + dec;
      const pend = tpd * to;
      return {
        peak: step < 1 ? { v: '—' } : { v: fmtN(tps), tone: tps > 20000 ? 'warn' : 'good' },
        lat: step < 1 ? { v: '—' } : { v: fmtMs(lat), tone: lat < 1500 ? 'good' : lat < 4000 ? 'warn' : 'bad' },
        pend: step < 3 ? { v: '—' } : { v: fmtN(pend), tone: pend < 10000 ? 'good' : 'warn' },
        rev: step < 3 ? { v: '—' } : { v: fmtN(pend * debited) },
      };
    },
  },
  steps: [
    {
      short: 'Parties',
      kind: 'insight',
      title: 'Apps, a central switch, and every bank',
      body: [
        'A UPI-style system lets anyone pay anyone, from any bank, instantly. The pieces: <b>PSP apps</b> (payment service providers — the phone apps customers see) sit in front of sponsor banks; a <b>central switch</b> operated by the national payments body routes every message; and <b>banks</b> hold the accounts. The payer and payee can be in different apps and different banks — the switch standardises the messages and the rules so they interoperate.',
        'Unlike a card network (authorize now, settle later), the money moves in <b>near real time</b>: the payer’s account is debited and the payee’s credited within seconds, with interbank net settlement happening periodically behind the scenes.',
      ],
      scene: { nodes: [payer(), payerBank(), switchN({ tag: pill('routes every message', 'route') }), payeeBank(), payee()], links: [link('payer', 'switch'), link('switch', 'pbank'), link('switch', 'ybank'), link('switch', 'payee')], flows: [flow(['payer', 'switch', 'ybank'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Pay flow',
      kind: 'technique',
      title: 'Address, PIN, debit, credit, confirmation',
      body: [
        'The payee is identified by a <b>virtual payment address</b> (<code>name@bank</code>) or a QR code that encodes it — no account number or IFSC shared. The payer enters the amount and a <b>PIN</b> (the second factor, entered on a secure keypad bound to the registered device). The app sends the pay request to the switch, which resolves the address to the payee’s bank.',
        'Sequence: (1) PSP → switch: pay request; (2) switch → payer bank: <b>debit</b>; (3) payer bank confirms; (4) switch → payee bank: <b>credit</b>; (5) payee bank confirms; (6) switch → both PSPs: success notifications. Six message legs plus both banks’ posting time: 6 × 40 ms + 600 ms ≈ <b>~840 ms</b> at these settings. A <b>collect</b> request works the other way: the payee asks, the payer approves with a PIN.',
      ],
      changes: [{ text: 'Payee identified by name@bank or QR', tone: 'info' }, { text: 'Six legs + bank posting ≈ 0.85 s', tone: 'info' }],
      scene: { nodes: [payer({ tag: pill('amount + PIN', 'lock') }), switchN({ tag: pill('resolve address', 'search') }), payerBank({ tag: pill('debit', 'check') }), payeeBank({ tag: pill('credit', 'check') }), payee({ tag: pill('success', 'check', 'good') })], links: [link('payer', 'switch', { arrow: 'both' }), link('switch', 'pbank', { arrow: 'both' }), link('switch', 'ybank', { arrow: 'both' }), link('switch', 'payee')], flows: [flow(['payer', 'switch', 'pbank'], { rate: 1.2, back: true }), flow(['switch', 'ybank'], { kind: 'write', rate: 1.2, back: true })] },
    },
    {
      short: 'Two calls',
      kind: 'technique',
      title: 'Debit and credit are separate, independent systems',
      body: [
        'The payer’s bank and the payee’s bank are different organisations with different ledgers, and no distributed transaction spans them. So the switch runs a small <b>saga</b> (see that lesson): debit first, then credit. If the credit fails, the debit must be <b>reversed</b>; if the debit fails, nothing else happens. Each leg has a unique <b>transaction id</b> and a <b>reference</b> so repeats are idempotent.',
        'Banks keep money safe by <b>debiting before crediting</b> and by treating the switch’s message as the instruction of record. Every state change is logged by the switch and both banks; those logs are what reconciliation later compares.',
      ],
      changes: [{ text: 'Debit → credit; credit failure → reverse the debit', tone: 'info' }, { text: 'Unique transaction id on every leg', tone: 'good' }],
      scene: { nodes: [switchN({ tag: pill('saga: debit then credit', 'list') }), payerBank({ tag: pill('debited', 'check') }), payeeBank({ tag: pill('credit failed', 'alert', 'warn') }), ledger()], links: [link('switch', 'pbank', { arrow: 'both' }), link('switch', 'ybank', { arrow: 'both' }), link('switch', 'ledger', { style: 'dashed' })], flows: [flow(['switch', 'ybank'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Pending',
      kind: 'problem',
      title: 'The ambiguous middle: timeouts and pending',
      body: [
        'Networks and banks fail mid-flow. The payer’s app sees no answer: was it debited? credited? neither? The system must never say “failed” when the money has moved, nor “success” when it hasn’t, so it introduces <b>pending</b>/<b>deemed</b> states: the transaction is marked unresolved and the switch actively checks status with both banks. If the debit happened but the credit did not, an <b>automatic reversal</b> returns the money — usually within a defined time (hours to a day).',
        'The volume matters: at 10 million transactions a day and 0.3% ambiguous outcomes, <b>30,000 transactions a day</b> are left pending, of which (40% debited) <b>~12,000 need automatic reversals</b>. Rates are tiny and the absolute counts are not — customer support, clear status messaging (“don’t retry yet”), and automation of status checks and reversals are major parts of the system.',
      ],
      changes: [{ text: '0.3% × 10M = 30,000 pending a day', tone: 'bad' }, { text: '40% debited → ~12,000 auto-reversals', tone: 'info' }, { text: 'Status checks + reversal timers + clear messaging', tone: 'good' }],
      scene: { nodes: [payer({ tag: pill('no response — pending', 'clock', 'warn') }), switchN({ tag: pill('checks status with both banks', 'search') }), payerBank({ tag: pill('debited', 'alert', 'warn') }), payeeBank({ tag: pill('no credit', 'alert') })], links: [link('payer', 'switch', { style: 'broken' }), link('switch', 'pbank', { arrow: 'both' }), link('switch', 'ybank', { arrow: 'both' })], flows: [flow(['switch', 'pbank'], { rate: 1, back: true }), flow(['payer', 'switch'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Reconcile',
      kind: 'technique',
      title: 'Reconciliation and settlement',
      body: [
        'Real-time debit and credit are <b>instructions</b>; actual interbank money moves through <b>net settlement</b> at the central bank in cycles through the day. Reconciliation compares three independent records — switch, payer bank, payee bank — transaction by transaction. A transaction present on one side only (debited, never credited; credited, never debited) is a <b>break</b> that raises a reversal or a dispute workflow.',
        'This is the same discipline as card payments: an append-only ledger, idempotent operations and daily reconciliation (see the Idempotency Keys and Card Payments lessons). The difference is speed — “real-time” means the checks and corrections themselves must be automated, not left for an overnight batch.',
      ],
      scene: { nodes: [box('r1', -8, -5, 'Switch log', 'purple', 'list', { size: [1.2, 1.2], height: 22 }), box('r2', 0, -5, 'Payer bank log', 'red', 'list', { size: [1.2, 1.2], height: 22 }), box('r3', 8, -5, 'Payee bank log', 'blue', 'list', { size: [1.2, 1.2], height: 22 }), ledger({ name: 'Reconciliation', tag: pill('breaks → reversal / dispute', 'alert', 'warn') })], links: [link('r1', 'ledger'), link('r2', 'ledger'), link('r3', 'ledger')], flows: [flow(['r1', 'ledger'], { rate: 1 }), flow(['r2', 'ledger'], { rate: 1 }), flow(['r3', 'ledger'], { rate: 1 })] },
    },
    {
      short: 'Scale',
      kind: 'tradeoff',
      title: 'Peak load, resilience and fraud',
      body: [
        '10 million transactions a day averages 116/s, but <b>peaks at 6× is ~700/s</b>; festival evenings and salary days push ratios far higher, and national systems run hundreds of millions a day. Design for the peak: horizontally scaled stateless routing, partitioned transaction stores, per-bank <b>throttling and circuit breakers</b> (a slow bank must not stall everyone — the switch sheds or fails fast for that bank), and capacity agreements with participants.',
        '<b>Fraud and safety</b>: device binding, PIN entry on trusted UI, velocity limits and per-transaction caps, behavioural fraud scoring in the 150–300 ms budget, and verified-name display before confirming. <b>Availability</b> is a national-infrastructure concern: multi-datacentre active–active switches, tested failover and public uptime reporting. Figures here are illustrative model outputs, not any system’s statistics.',
      ],
      changes: [{ text: 'Peak = average × peak ratio; design for it', tone: 'info' }, { text: 'Per-bank throttles and breakers', tone: 'good' }],
      scene: { nodes: [switchN({ tag: pill('per-bank breakers', 'shield') }), payerBank({ tag: pill('healthy', 'check', 'good') }), payeeBank({ state: 'hot', tag: pill('slow → throttled', 'clock', 'warn') })], links: [link('switch', 'pbank'), link('switch', 'ybank', { style: 'dashed' })], flows: [flow(['switch', 'pbank'], { rate: 2 }), flow(['switch', 'ybank'], { rate: 0.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A saga with a switch in the middle',
      body: [
        'Real-time payments route <b>debit then credit</b> through a central switch using virtual addresses and a PIN; latency ≈ six message legs + bank posting; the hard part is the <b>ambiguous outcome</b>, handled with pending states, status checks, automatic reversals and three-way reconciliation.',
        'Design for peak load, isolate slow banks, automate corrections, and keep clear user messaging for “pending”.',
      ],
      scene: { nodes: [payer(), switchN(), payerBank(), payeeBank(), payee()], links: [link('payer', 'switch'), link('switch', 'pbank'), link('switch', 'ybank'), link('switch', 'payee')], flows: [flow(['payer', 'switch', 'pbank'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
