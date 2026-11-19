import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const payer = (extra: Partial<SceneNode> = {}) => box('payer', -18, 0, 'Sender', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const bankA = (extra: Partial<SceneNode> = {}) => box('bankA', -11, 0, 'Sender’s bank', 'blue', 'db', { size: [1.3, 1.3], height: 28, ...extra });
const corr = (extra: Partial<SceneNode> = {}) => box('corr', -3, 0, 'Correspondent bank(s)', 'orange', 'db', { size: [1.4, 1.4], height: 28, ...extra });
const bankB = (extra: Partial<SceneNode> = {}) => box('bankB', 6, 0, 'Beneficiary’s bank', 'purple', 'db', { size: [1.3, 1.3], height: 28, ...extra });
const rcv = (extra: Partial<SceneNode> = {}) => box('rcv', 13, 0, 'Beneficiary', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const net = (extra: Partial<SceneNode> = {}) => box('net', -3, -8, 'Messaging network', 'teal', 'share', { size: [1.5, 1.2], height: 18, ...extra });
const nostro = (extra: Partial<SceneNode> = {}) => db('nostro', -3, 8, 'Nostro / vostro accounts', { size: [1.3, 1.3], ...extra });

const usd = (n: number): string => `$${n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)}`;
const fmtH = (h: number): string => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(0)} h`);

const lesson: Lesson = {
  slug: 'source-swift-payment-messaging-system',
  title: 'Cross-Border Payments: Correspondent Banking and Messaging',
  blurb: 'A secure messaging network tells banks what to do; money moves through accounts banks hold with each other. Why each correspondent hop adds time, fees and FX margin — and what tracking and ISO 20022 change.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'fees', label: 'Total fees and FX cost', icon: 'gauge' },
    { key: 'recv', label: 'Beneficiary receives', icon: 'check' },
    { key: 'time', label: 'Time to arrive', icon: 'clock' },
    { key: 'pct', label: 'Cost as % of the amount', icon: 'activity' },
  ],
  goals: [
    { text: 'The difference between messaging and settlement', step: 1 },
    { text: 'Why correspondent chains exist', step: 2 },
    { text: 'Nostro and vostro accounts: how value actually moves', step: 3 },
    { text: 'What each hop costs in time and money', step: 4 },
    { text: 'Tracking, structured data and compliance', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'amt', label: 'Payment amount', min: 100, max: 1000000, step: 100, default: 5000, unit: ' $', description: 'Value sent.' },
      { key: 'hops', label: 'Correspondent banks in the chain', min: 0, max: 5, step: 1, default: 2, unit: '', description: 'Intermediary banks between sender’s and beneficiary’s banks.' },
      { key: 'fee', label: 'Fee per bank in the chain', min: 0, max: 60, step: 1, default: 15, unit: ' $', description: 'Flat fee each intermediary deducts or charges.' },
      { key: 'out', label: 'Sender’s bank fee', min: 0, max: 80, step: 1, default: 25, unit: ' $', description: 'Outgoing wire fee.' },
      { key: 'fx', label: 'FX margin', min: 0, max: 5, step: 0.05, default: 0.6, unit: '%', description: 'Spread over the mid-market rate when currencies are converted.' },
      { key: 'delay', label: 'Time per bank handling the payment', min: 0.5, max: 36, step: 0.5, default: 6, unit: ' h', description: 'Queues, cut-off times, screening, time zones.' },
    ],
    calculate: (input, step) => {
      const amt = Math.max(1, input.amt ?? 5000);
      const hops = Math.max(0, Math.round(input.hops ?? 2));
      const fee = Math.max(0, input.fee ?? 15);
      const out = Math.max(0, input.out ?? 25);
      const fx = Math.max(0, (input.fx ?? 0.6) / 100);
      const delay = Math.max(0.1, input.delay ?? 6);
      const fees = out + hops * fee + amt * fx;
      const recv = Math.max(0, amt - fees);
      // Sender's bank, each correspondent and the beneficiary's bank each handle the payment once.
      const hours = (hops + 2) * delay;
      return {
        fees: step < 3 ? { v: '—' } : { v: usd(fees), tone: fees / amt < 0.01 ? 'good' : fees / amt < 0.04 ? 'warn' : 'bad' },
        recv: step < 3 ? { v: '—' } : { v: `${usd(recv)} of ${usd(amt)}`, tone: 'good' },
        time: step < 3 ? { v: '—' } : { v: fmtH(hours), tone: hours < 24 ? 'good' : hours < 72 ? 'warn' : 'bad' },
        pct: step < 3 ? { v: '—' } : { v: `${((fees / amt) * 100).toFixed(2)}%`, tone: fees / amt < 0.01 ? 'good' : fees / amt < 0.04 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Messaging',
      kind: 'insight',
      title: 'A messaging network is not a payment system',
      body: [
        'SWIFT — the Society for Worldwide Interbank Financial Telecommunication — is a <b>secure messaging network</b> that thousands of banks use to send each other standardised instructions: “pay 5,000 USD to this account at your bank”. It <b>carries instructions; it does not hold or move money</b>. Settlement happens elsewhere: in accounts the banks hold with one another, or through each currency’s domestic payment and central-bank systems.',
        'Messages are authenticated, encrypted and follow strict formats (the long-standing MT series, now migrating to the richer XML-based <b>ISO 20022</b> MX messages). Each bank is identified by a <b>BIC</b> (SWIFT code) and each account by an <b>IBAN</b> or national format — which is how a bank halfway round the world knows exactly where to credit.',
      ],
      scene: { nodes: [bankA(), net({ tag: pill('instructions only', 'file') }), bankB()], links: [link('bankA', 'net', { arrow: 'both' }), link('net', 'bankB', { arrow: 'both' })], flows: [flow(['bankA', 'net', 'bankB'], { rate: 1.5 })] },
    },
    {
      short: 'Why chains',
      kind: 'technique',
      title: 'Banks can’t hold accounts with every bank',
      body: [
        'Your bank in one country usually has no direct relationship with the beneficiary’s bank in another. Direct links between all banks would be impossible (thousands of banks, hundreds of currencies), so banks use <b>correspondent banking</b>: a bank maintains accounts with a few large <b>correspondent banks</b> — typically those with strong access to a particular currency’s clearing system — and routes payments through them.',
        'A USD payment from a European bank to an Asian bank may travel: sender’s bank → a USD correspondent in New York (which can settle in dollars) → possibly another correspondent → the beneficiary’s bank. The shape of the route depends on which banks have relationships and which can clear the currency. Every extra bank is one more stop.',
      ],
      scene: { nodes: [payer(), bankA(), corr({ tag: pill('has USD clearing access', 'check') }), bankB(), rcv()], links: [link('payer', 'bankA'), link('bankA', 'corr'), link('corr', 'bankB'), link('bankB', 'rcv')], flows: [flow(['payer', 'bankA', 'corr', 'bankB', 'rcv'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Nostro',
      kind: 'technique',
      title: 'Nostro and vostro: how value actually moves',
      body: [
        'Bank A holds an account <i>at</i> the correspondent: from A’s view it is its <b>nostro</b> (“ours, held with you”); from the correspondent’s view it is a <b>vostro</b> (“yours, held with us”). When A pays, it sends a message and the correspondent <b>debits the vostro and credits the next bank’s account</b> (or sends on a message to settle domestically). No cash crosses borders — the banks just move balances on each other’s books, and later settle net positions.',
        'This makes banks hold <b>pre-funded balances</b> in each currency at each correspondent (trapped liquidity that earns little), and makes each hop a separate ledger entry with its own cut-off time, compliance screening and fee. <b>FX</b> conversion happens at one of the banks, with a margin over the market rate that is often the largest cost.',
      ],
      changes: [{ text: 'Nostro = our account at you · vostro = your account at us', tone: 'info' }, { text: 'Balances move on books; banks pre-fund currencies', tone: 'info' }],
      scene: { nodes: [bankA({ tag: pill('nostro at the correspondent', 'db') }), nostro({ tag: pill('debit A · credit B', 'refresh') }), corr(), bankB({ tag: pill('credit the beneficiary', 'check', 'good') })], links: [link('bankA', 'corr', { arrow: 'both' }), link('corr', 'nostro'), link('corr', 'bankB', { arrow: 'both' })], flows: [flow(['bankA', 'corr', 'bankB'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Cost',
      kind: 'tradeoff',
      title: 'Each hop adds time and money',
      body: [
        'Fees stack: the sender’s bank charges an outgoing wire fee ($25), each correspondent deducts or charges its own (2 × $15), and the FX margin (0.6% of $5,000 = $30) is added: <b>$85 total, 1.7% of the amount</b> — and the beneficiary may receive less than the sender intended unless the payment is sent “our” (sender pays all fees). Time stacks too: each of the four banks handles the payment once, with queues, <b>cut-off times</b>, screening and time zones — 4 × 6 h = <b>24 hours</b> here, longer if a hop misses its window or the weekend intervenes.',
        'Fixed fees make small payments expensive in percentage terms (a $200 payment would lose over a quarter of its value at these settings) and large ones cheap; FX margin scales with the amount. That is why remittances use specialised providers that <b>pre-fund local accounts</b> and settle net positions in bulk, bypassing the chain.',
      ],
      changes: [{ text: '$25 + 2 × $15 + $30 FX = $85 (1.7%) on $5,000', tone: 'info' }, { text: '4 banks × 6 h ≈ 24 h', tone: 'info' }],
      scene: { nodes: [bankA({ tag: pill('+$25 · 6 h', 'clock') }), corr({ tag: pill('+$30 · 12 h', 'clock', 'warn') }), bankB({ tag: pill('+6 h', 'clock') })], links: [link('bankA', 'corr'), link('corr', 'bankB')], flows: [flow(['bankA', 'corr', 'bankB'], { rate: 1.2 })] },
    },
    {
      short: 'gpi & data',
      kind: 'technique',
      title: 'Tracking, structured data and compliance',
      body: [
        'A classic complaint was <b>opacity</b>: “where is my payment, and why did I receive less?”. Modern improvements: <b>end-to-end tracking</b> with a unique reference (UETR) so every bank updates a shared status; <b>fee and FX transparency</b> up front; and <b>ISO 20022</b> messages that carry structured, richer data (full addresses, purpose codes, invoice references) instead of cramped free-text fields, which improves automated processing and reduces manual investigation.',
        '<b>Compliance</b> is a major source of delay: each bank screens the parties against sanctions lists and checks for money-laundering patterns (KYC/AML); a false positive means a manual review. Better data reduces false positives; real-time domestic and cross-border rails (see the Payment Rails lesson), stablecoins and fintech networks target the same pain points with pre-funding, local clearing and fewer hops. Figures here are model outputs with illustrative fees.',
      ],
      changes: [{ text: 'UETR: one tracking id across all banks', tone: 'good' }, { text: 'ISO 20022: structured data, fewer manual reviews', tone: 'good' }, { text: 'Screening is a main source of delay', tone: 'info' }],
      scene: { nodes: [bankA({ tag: pill('UETR 7f3a…', 'hash') }), net({ tag: pill('status updates', 'activity', 'good') }), corr({ tag: pill('sanctions screening', 'shield') }), bankB()], links: [link('bankA', 'corr'), link('corr', 'bankB'), link('bankA', 'net', { style: 'dashed' }), link('corr', 'net', { style: 'dashed' }), link('bankB', 'net', { style: 'dashed' })], flows: [flow(['bankA', 'corr', 'bankB'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Messages in the open, money on the books',
      body: [
        'A secure messaging network carries instructions; <b>correspondent banks</b> move balances on nostro/vostro accounts. Every hop adds <b>a fee, FX margin exposure and handling time</b>, so total cost ≈ outgoing fee + hops × fee + amount × FX margin, and time ≈ banks × handling time.',
        'Tracking and ISO 20022 improve visibility and automation; fewer hops (direct links, pre-funded local accounts, real-time rails) is where the real savings are.',
      ],
      scene: { nodes: [payer(), bankA(), corr(), bankB(), rcv()], links: [link('payer', 'bankA'), link('bankA', 'corr'), link('corr', 'bankB'), link('bankB', 'rcv')], flows: [flow(['payer', 'bankA', 'corr', 'bankB', 'rcv'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
