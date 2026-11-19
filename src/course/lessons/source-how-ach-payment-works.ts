import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const orig = (extra: Partial<SceneNode> = {}) => box('orig', -17, 0, 'Originator (payer or biller)', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const odfi = (extra: Partial<SceneNode> = {}) => box('odfi', -9, 0, 'Originating bank (ODFI)', 'blue', 'db', { size: [1.3, 1.3], height: 28, ...extra });
const op = (extra: Partial<SceneNode> = {}) => box('op', 0, 0, 'ACH operator (batch)', 'purple', 'queue', { size: [1.6, 1.2], height: 18, ...extra });
const rdfi = (extra: Partial<SceneNode> = {}) => box('rdfi', 9, 0, 'Receiving bank (RDFI)', 'orange', 'db', { size: [1.3, 1.3], height: 28, ...extra });
const rcv = (extra: Partial<SceneNode> = {}) => box('rcv', 17, 0, 'Account holder', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const ledger = (extra: Partial<SceneNode> = {}) => db('ledger', 0, 8, 'Returns / reconciliation', { size: [1.3, 1.3], ...extra });

const RAILS = ['Card', 'Batch bank transfer (ACH-style)', 'Real-time rail', 'Wire (correspondent)'] as const;
const fmtH = (h: number): string => (h >= 48 ? `${(h / 24).toFixed(1)} days` : h >= 1 ? `${h.toFixed(h < 10 ? 1 : 0)} h` : h >= 1 / 60 ? `${Math.round(h * 60)} min` : `${Math.round(h * 3600)} s`);
const fmtD = (d: number): string => (d === 0 ? 'none (irrevocable)' : d >= 1 ? `${Math.round(d)} days` : `${Math.round(d * 24)} h`);
const usd = (n: number): string => `$${n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(0) : Math.round(n).toLocaleString('en-US')}`;

const lesson: Lesson = {
  slug: 'source-how-ach-payment-works',
  title: 'Payment Rails Compared: Batch, Card, Real-Time and Wire',
  blurb: 'Same money, four plumbing systems: when funds are final, who can reverse them, and what each rail costs — with the ACH-style batch model explained step by step.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'rail', label: 'Rail', icon: 'route' },
    { key: 'time', label: 'Typical time until funds arrive', icon: 'clock' },
    { key: 'fee', label: 'Cost for this payment', icon: 'gauge' },
    { key: 'risk', label: 'Window in which it can be reversed', icon: 'alert' },
  ],
  goals: [
    { text: 'Who is who in a batch bank transfer', step: 1 },
    { text: 'Batches, windows and why it takes a day', step: 2 },
    { text: 'Returns: why a “settled” debit can come back', step: 3 },
    { text: 'How cards, real-time and wires differ', step: 4 },
    { text: 'Choosing a rail by speed, risk and cost', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rail', label: 'Rail (1 card · 2 batch · 3 real-time · 4 wire)', min: 1, max: 4, step: 1, default: 2, unit: '', description: 'Payment rail to evaluate.' },
      { key: 'amt', label: 'Payment amount', min: 1, max: 1000000, step: 1, default: 5000, unit: ' $', description: 'Value of the payment.' },
      { key: 'win', label: 'Batch windows per business day', min: 1, max: 8, step: 1, default: 3, unit: '', description: 'How many times a day the batch rail clears (same-day style).' },
      { key: 'hops', label: 'Correspondent banks (wire)', min: 0, max: 5, step: 1, default: 1, unit: '', description: 'Intermediary banks on an international wire.' },
    ],
    calculate: (input, step) => {
      const r = Math.min(4, Math.max(1, Math.round(input.rail ?? 2)));
      const amt = Math.max(1, input.amt ?? 5000);
      const win = Math.max(1, Math.round(input.win ?? 3));
      const hops = Math.max(0, Math.round(input.hops ?? 1));
      // Illustrative, order-of-magnitude figures per rail.
      let hours = 0;
      let fee = 0;
      let revDays = 0;
      if (r === 1) { hours = 48; fee = amt * 0.025; revDays = 120; }
      if (r === 2) { hours = (9 / win) / 2 + 4 + (win >= 3 ? 0 : 20); fee = 0.5; revDays = 60; }
      if (r === 3) { hours = 5 / 3600; fee = 0.1; revDays = 0; }
      if (r === 4) { hours = 6 + hops * 12; fee = 25 + hops * 15; revDays = 0; }
      return {
        rail: step < 1 ? { v: '—' } : { v: RAILS[r - 1] ?? '' },
        time: step < 1 ? { v: '—' } : { v: fmtH(hours), tone: hours < 0.1 ? 'good' : hours < 12 ? 'warn' : 'bad' },
        fee: step < 3 ? { v: '—' } : { v: `${usd(fee)} (${((fee / amt) * 100).toFixed(fee / amt < 0.01 ? 3 : 2)}% of the amount)`, tone: fee / amt < 0.005 ? 'good' : fee / amt < 0.02 ? 'warn' : 'bad' },
        risk: step < 2 ? { v: '—' } : { v: fmtD(revDays), tone: revDays === 0 ? 'good' : revDays <= 60 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Parties',
      kind: 'technique',
      title: 'A bank transfer through the ACH operator',
      body: [
        'In an ACH-style system the parties are the <b>originator</b> (the payer pushing money, or a biller/employer pulling or paying), the <b>originating bank</b> (ODFI), the <b>ACH operator</b> (a central clearing house, run by the central bank and private networks), the <b>receiving bank</b> (RDFI) and the <b>account holder</b>. Entries come in two kinds: <b>credits</b> push money (payroll, vendor payments) and <b>debits</b> pull it (bill payments, subscriptions, loan repayments) under a prior <b>authorization</b>.',
        'Identification is by routing number (bank) and account number, which is why account details are sensitive and why <b>account verification</b> (micro-deposits, instant account linking) precedes first use.',
      ],
      scene: { nodes: [orig(), odfi(), op({ tag: pill('batches entries', 'layers') }), rdfi(), rcv()], links: [link('orig', 'odfi'), link('odfi', 'op'), link('op', 'rdfi'), link('rdfi', 'rcv')], flows: [flow(['orig', 'odfi', 'op', 'rdfi', 'rcv'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Batches',
      kind: 'technique',
      title: 'Entries are batched into windows, then cleared',
      body: [
        'The originator sends a <b>file</b> of entries to its bank, which bundles them and submits to the operator at fixed <b>submission deadlines</b>. The operator sorts entries by receiving bank and <b>distributes in batches</b> at set times; the receiving bank posts them; funds settle between banks at the central bank in net amounts. Classic ACH settled next business day; <b>same-day</b> windows (here 3 per business day) reduce the wait.',
        'The latency is built-in: an entry waits for the <b>next window</b> (on average half the gap between windows) plus processing — about 5.5 hours with 3 windows, a full extra day if it misses a cut-off. In exchange, batching makes every payment <b>cheap</b> (cents) and the system simple, predictable and auditable. Weekends and holidays pause the clock.',
      ],
      changes: [{ text: 'Wait for the next window + processing', tone: 'info' }, { text: 'Cents per entry; next-day or same-day', tone: 'good' }],
      scene: { nodes: [odfi({ tag: pill('submit before cut-off', 'clock') }), op({ tag: pill('windows: 10:00 · 14:00 · 17:00', 'clock') }), rdfi({ tag: pill('posts the batch', 'check') })], links: [link('odfi', 'op'), link('op', 'rdfi')], flows: [flow(['odfi', 'op', 'rdfi'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Returns',
      kind: 'problem',
      title: 'Returns: the money can come back',
      body: [
        'Receipt is <b>not final</b>. A debit against an account with insufficient funds is <b>returned</b> by the receiving bank within about two banking days. A debit the account holder says they never authorised can be returned for up to <b>60 days</b> (consumer accounts), and the originator bears that risk. Returns also cover closed accounts, wrong numbers and stop-payments. Each return is its own message flowing back through the operator.',
        'So originators treat an ACH debit as <b>provisional</b>: hold goods or credit until the return window closes, monitor return rates (networks enforce thresholds), verify accounts first, keep proof of authorization and screen for fraud. Receiving a payment this way is cheap; being the one who trusted it too early is not.',
      ],
      changes: [{ text: 'Insufficient funds: ~2 banking days', tone: 'info' }, { text: 'Unauthorised debit: up to 60 days', tone: 'bad' }, { text: 'Treat as provisional; verify and keep authorization', tone: 'good' }],
      scene: { nodes: [rdfi({ tag: pill('R01: insufficient funds', 'alert', 'warn') }), op({ tag: pill('return entry', 'refresh') }), odfi({ tag: pill('funds clawed back', 'alert', 'bad') }), ledger()], links: [link('rdfi', 'op', { arrow: 'end' }), link('op', 'odfi', { arrow: 'end' }), link('odfi', 'ledger', { style: 'dashed' })], flows: [flow(['rdfi', 'op', 'odfi'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Others',
      kind: 'technique',
      title: 'Card, real-time and wire in one view',
      body: [
        '<b>Card</b>: authorise in a second, settle in ~2 days, and the cardholder can <b>charge back</b> for up to ~120 days; the merchant pays a percentage (here 2.5%, see the Card Payments lesson). <b>Real-time rails</b> (UPI-style, FedNow, RTP, Faster Payments): credit and debit in seconds, 24×7, <b>irrevocable</b> once posted, flat low fees — which moves fraud risk to the sender, so authentication and verification-of-payee matter more. <b>Wires</b> (RTGS plus messaging like SWIFT): same-day domestic, 1–3 days international via <b>correspondent banks</b>, each adding time and a fee ($25 + $15 per hop here), final and used for large or urgent amounts.',
        'SWIFT is a <i>messaging</i> network, not a settlement system: it carries instructions between banks, which then move money through accounts they hold with each other (nostro/vostro) or via central-bank settlement. The sliders compare time, cost and reversal windows rail by rail.',
      ],
      changes: [{ text: 'Card: 2 days, ~2.5%, 120-day chargeback', tone: 'info' }, { text: 'Real-time: seconds, ~free, irrevocable', tone: 'info' }, { text: 'Wire: hours–days, $25+, final', tone: 'info' }],
      scene: { nodes: [box('c', -10, -5, 'Card', 'orange', 'user', { size: [1.2, 1.2], height: 20, tag: pill('chargeback 120 d', 'alert', 'warn') }), box('a', 0, -5, 'Batch', 'blue', 'queue', { size: [1.2, 1.2], height: 18, tag: pill('return 60 d', 'alert', 'warn') }), box('r', 10, -5, 'Real-time', 'green', 'bolt', { size: [1.2, 1.2], height: 22, tag: pill('seconds, final', 'check', 'good') }), box('w', 0, 6, 'Wire', 'purple', 'globe', { size: [1.2, 1.2], height: 24, tag: pill('hops add time + fees', 'clock') })], links: [], flows: [] },
    },
    {
      short: 'Choosing',
      kind: 'tradeoff',
      title: 'Choosing a rail',
      body: [
        '<b>Speed vs risk vs cost</b> is the whole trade. Large, infrequent, urgent: wire. Recurring pulls (subscriptions, rent, loans): batch debits — cheap but with return risk. Consumer purchases where buyer protection matters: card. Instant, low-value, sender-authenticated transfers and payouts: real-time. Marketplaces often offer several and route by amount, risk and country.',
        'Engineering consequences: model the <b>payment state machine</b> per rail (initiated → pending → settled → returned/charged-back), never mark funds <i>available</i> before the rail’s finality, run reconciliation against each rail’s files, and handle returns as first-class events. Figures here are illustrative order-of-magnitude values; check each rail’s current rules and prices.',
      ],
      scene: { nodes: [box('s', -8, 0, 'Payment request', 'green', 'user', { size: [1.2, 1.2], height: 22 }), box('route', 2, 0, 'Router: amount · risk · country', 'purple', 'route', { size: [1.4, 1.4], height: 26 }), box('rails', 12, 0, 'Card · batch · real-time · wire', 'blue', 'layers', { size: [1.4, 1.4], height: 24 })], links: [link('s', 'route'), link('route', 'rails')], flows: [flow(['s', 'route', 'rails'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Finality is the product',
      body: [
        'Batch rails (ACH-style) are cheap and slow, clear in windows and allow <b>returns</b> for days. Cards are fast to authorise and expensive, with long chargeback windows. Real-time rails are instant and irrevocable. Wires are final and priced per hop.',
        'Choose by speed, risk and cost; treat provisional funds as provisional; keep a state machine and reconciliation per rail.',
      ],
      scene: { nodes: [orig(), odfi(), op(), rdfi(), rcv()], links: [link('orig', 'odfi'), link('odfi', 'op'), link('op', 'rdfi'), link('rdfi', 'rcv')], flows: [flow(['orig', 'odfi', 'op', 'rdfi', 'rcv'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
