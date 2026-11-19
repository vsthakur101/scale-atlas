import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const holder = (extra: Partial<SceneNode> = {}) => box('holder', -16, -6, 'Cardholder', 'green', 'user', { size: [1.1, 1.1], height: 22, ...extra });
const merchant = (extra: Partial<SceneNode> = {}) => box('merchant', -9, 0, 'Merchant', 'orange', 'globe', { size: [1.3, 1.3], height: 26, ...extra });
const acquirer = (extra: Partial<SceneNode> = {}) => box('acq', -2, 0, 'Acquirer / processor', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const network = (extra: Partial<SceneNode> = {}) => box('net', 5, 0, 'Card network', 'purple', 'route', { size: [1.4, 1.4], height: 30, ...extra });
const issuer = (extra: Partial<SceneNode> = {}) => box('iss', 13, 0, 'Issuer (bank)', 'red', 'db', { size: [1.4, 1.4], height: 30, ...extra });

const usd = (n: number): string => `$${n.toFixed(n < 10 ? 2 : n < 1000 ? 2 : 0)}`;
const fmtMs = (ms: number): string => `${Math.round(ms)} ms`;

const lesson: Lesson = {
  slug: 'source-how-visa-works-when-swiping-a-credit-card',
  title: 'How Card Payments Work: Authorization, Clearing, Settlement',
  blurb: 'The four-party model: why the “yes” arrives in under a second but the money moves days later, who earns what from each swipe, and where fraud and chargebacks enter.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'net', label: 'Merchant receives', icon: 'check' },
    { key: 'iss', label: 'Issuer interchange', icon: 'layers' },
    { key: 'ntw', label: 'Network fees', icon: 'route' },
    { key: 'acq', label: 'Acquirer / processor margin', icon: 'server' },
    { key: 'lat', label: 'Authorization round trip', icon: 'clock' },
  ],
  goals: [
    { text: 'The five parties and what each one does', step: 1 },
    { text: 'Authorization: how a decision arrives in a second', step: 2 },
    { text: 'Clearing and settlement: how money actually moves', step: 3 },
    { text: 'Who is paid what: the fee split', step: 4 },
    { text: 'Disputes, fraud controls and tokenization', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'amt', label: 'Purchase amount', min: 1, max: 5000, step: 1, default: 100, unit: ' $', description: 'Value of one transaction.' },
      { key: 'mdr', label: 'Merchant discount rate (total fee)', min: 0.5, max: 5, step: 0.05, default: 2.5, unit: '%', description: 'Total percentage the merchant pays on each sale.' },
      { key: 'ic', label: 'Interchange to the issuer', min: 0.1, max: 3, step: 0.05, default: 1.8, unit: '%', description: 'Share of the fee passed to the cardholder’s bank.' },
      { key: 'nf', label: 'Network assessment', min: 0, max: 0.5, step: 0.01, default: 0.15, unit: '%', description: 'Share kept by the card network.' },
      { key: 'hop', label: 'One-way hop latency', min: 5, max: 200, step: 5, default: 40, unit: ' ms', description: 'Network delay of each of the three hops.' },
      { key: 'dec', label: 'Issuer decision time', min: 10, max: 1000, step: 10, default: 150, unit: ' ms', description: 'Time for the issuer’s fraud and balance checks.' },
    ],
    calculate: (input, step) => {
      const amt = Math.max(1, input.amt ?? 100);
      const mdr = Math.max(0, input.mdr ?? 2.5) / 100;
      const ic = Math.max(0, input.ic ?? 1.8) / 100;
      const nf = Math.max(0, input.nf ?? 0.15) / 100;
      const hop = Math.max(1, input.hop ?? 40);
      const dec = Math.max(1, input.dec ?? 150);
      const fee = amt * mdr;
      const acqMargin = fee - amt * ic - amt * nf;
      // POS → acquirer → network → issuer and back: three hops each way, plus the issuer’s decision.
      const lat = 2 * 3 * hop + dec;
      return {
        net: step < 3 ? { v: '—' } : { v: `${usd(amt - fee)} of ${usd(amt)}`, tone: 'good' },
        iss: step < 3 ? { v: '—' } : { v: usd(amt * ic) },
        ntw: step < 3 ? { v: '—' } : { v: usd(amt * nf) },
        acq: step < 3 ? { v: '—' } : { v: usd(acqMargin), tone: acqMargin < 0 ? 'bad' : 'good' },
        lat: step < 1 ? { v: '—' } : { v: fmtMs(lat), tone: lat < 500 ? 'good' : lat < 1200 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Parties',
      kind: 'insight',
      title: 'Five parties, because nobody trusts anybody',
      body: [
        'The <b>cardholder</b> pays; the <b>merchant</b> sells; the <b>issuer</b> is the cardholder’s bank (it extends credit or holds the account); the <b>acquirer</b> (with its payment <b>processor</b>) is the merchant’s bank; and the <b>card network</b> (Visa, Mastercard, and others) connects thousands of issuers and acquirers with one set of rules, messages and guarantees.',
        'The network is the hub that makes the system scale: a merchant needs one acquiring relationship, a cardholder one issuer, and the network routes between them. That is why a card from any bank works at any shop — and why the money is divided among so many parties.',
      ],
      scene: { nodes: [holder(), merchant(), acquirer(), network(), issuer()], links: [link('holder', 'merchant'), link('merchant', 'acq', { arrow: 'both' }), link('acq', 'net', { arrow: 'both' }), link('net', 'iss', { arrow: 'both' })], flows: [] },
    },
    {
      short: 'Authorize',
      kind: 'technique',
      title: 'Authorization: the answer in about a second',
      body: [
        'On “pay”, the merchant’s terminal or website sends the card data (a token or encrypted PAN), amount and merchant id to the <b>acquirer</b>, which forwards an <b>authorization request</b> (ISO 8583-style message) to the <b>network</b>, which routes it using the card number’s bank identification number to the <b>issuer</b>. The issuer checks the account, available credit or balance, fraud models and card status, and returns <b>approve / decline</b> plus an authorization code — back through the same chain.',
        'Three hops each way plus the issuer’s decision: 2 × 3 × 40 ms + 150 ms = <b>~390 ms</b> at these settings. Crucially the issuer places a <b>hold</b> on the funds; <b>no money has moved yet</b>. The chain is designed to answer even when parts fail: <b>stand-in processing</b> lets the network approve or decline on the issuer’s behalf with rules if the issuer is unreachable.',
      ],
      changes: [{ text: 'Request: terminal → acquirer → network → issuer', tone: 'info' }, { text: 'Hold placed; no funds moved', tone: 'info' }],
      concepts: [{ term: 'Authorization', def: 'The issuer’s real-time approval of a transaction and reservation of the funds, before any money is transferred.' }],
      scene: { nodes: [merchant(), acquirer(), network(), issuer({ tag: pill('balance · fraud · approve', 'check') })], links: [link('merchant', 'acq'), link('acq', 'net'), link('net', 'iss')], flows: [flow(['merchant', 'acq', 'net', 'iss'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Settle',
      kind: 'technique',
      title: 'Clearing and settlement: money moves later, in batches',
      body: [
        'At the end of the day (or per capture) the merchant sends a <b>capture</b> — “bill the authorised amount (or less)” — and the acquirer submits it in a <b>clearing</b> file. The network reconciles transactions between issuers and acquirers, computes each party’s <b>net position</b> and instructs <b>settlement</b>: issuers pay the network, which pays acquirers, which pay merchants — typically one to three days after the sale.',
        'Netting is the point: millions of transactions between thousands of banks collapse into a few net transfers across central-bank or settlement accounts. The cardholder is billed later still, on the statement. Everything in between — holds that expire, partial captures, tips, refunds — is reconciled against the authorization record, which is why payment systems keep <b>immutable ledgers</b> and daily reconciliation (see the Idempotency lesson).',
      ],
      changes: [{ text: 'Authorize now · capture later · settle in 1–3 days', tone: 'info' }, { text: 'Net positions, not individual transfers', tone: 'good' }],
      scene: { nodes: [merchant({ tag: pill('capture', 'check') }), acquirer({ tag: pill('clearing file', 'file') }), network({ tag: pill('nets positions', 'refresh') }), issuer({ tag: pill('pays the network', 'activity') })], links: [link('merchant', 'acq'), link('acq', 'net', { arrow: 'both' }), link('net', 'iss', { arrow: 'both' })], flows: [flow(['merchant', 'acq', 'net'], { kind: 'write', rate: 1 }), flow(['iss', 'net', 'acq', 'merchant'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Fees',
      kind: 'tradeoff',
      title: 'Who earns what from each swipe',
      body: [
        'The merchant pays a <b>merchant discount rate</b> (here 2.5%) and receives the sale minus it. That fee is split: <b>interchange</b> to the issuer (1.8% — funds rewards, fraud losses and credit risk), a <b>network assessment</b> (0.15%), and the <b>acquirer/processor</b> keeps the remainder (0.55%) for processing, risk and support. On $100: the merchant nets <b>$97.50</b>, the issuer earns <b>$1.80</b>, the network <b>$0.15</b>, the acquirer <b>$0.55</b>.',
        'This is why rewards cards cost merchants more and why surcharging and routing rules are contentious: interchange varies by card type, region and how the transaction is processed (card-present vs online). Move the sliders to see how small changes in rate shift the whole split — the acquirer’s margin is what remains after the two pass-through components.',
      ],
      changes: [{ text: '$100: merchant $97.50 · issuer $1.80 · network $0.15 · acquirer $0.55', tone: 'info' }],
      scene: { nodes: [box('mer', -8, 0, 'Merchant pays 2.5%', 'orange', 'globe', { size: [1.3, 1.3], height: 24 }), box('s1', 6, -6, 'Issuer 1.8%', 'red', 'db', { size: [1.2, 1.2], height: 22 }), box('s2', 6, 0, 'Network 0.15%', 'purple', 'route', { size: [1.2, 1.2], height: 14 }), box('s3', 6, 6, 'Acquirer 0.55%', 'blue', 'server', { size: [1.2, 1.2], height: 18 })], links: [link('mer', 's1', { arrow: 'end' }), link('mer', 's2', { arrow: 'end' }), link('mer', 's3', { arrow: 'end' })], flows: [flow(['mer', 's1'], { kind: 'write', rate: 1 }), flow(['mer', 's2'], { kind: 'write', rate: 0.6 }), flow(['mer', 's3'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Trust',
      kind: 'technique',
      title: 'Fraud, disputes and tokenization',
      body: [
        '<b>Fraud scoring</b> runs at every layer — merchant rules, acquirer and network models, and the issuer’s — in the ~150 ms decision window. <b>3-D Secure</b> adds a strong customer authentication step for online payments, shifting liability. If a cardholder disputes a charge, a <b>chargeback</b> reverses it through the network, with representment evidence and fees (often $15+ on top of the lost sale) — so merchants watch their chargeback ratio closely.',
        '<b>Tokenization</b> replaces the card number (PAN) with a <b>token</b> usable only with a specific merchant or device, so a breach of the merchant’s database yields nothing spendable; wallets like Apple/Google Pay use device-bound tokens plus a per-transaction cryptogram. Keep card data out of your systems entirely with hosted fields or a payment provider to limit <b>PCI DSS</b> scope.',
      ],
      changes: [{ text: 'Chargeback = lost sale + fee + penalty risk', tone: 'bad' }, { text: 'Tokens and cryptograms: stolen data is useless', tone: 'good' }],
      scene: { nodes: [merchant({ tag: pill('stores token, not PAN', 'shield', 'good') }), network({ tag: pill('token → PAN', 'hash') }), issuer({ tag: pill('fraud score', 'alert') })], links: [link('merchant', 'net'), link('net', 'iss')], flows: [flow(['merchant', 'net', 'iss'], { rate: 1.5 })] },
    },
    {
      short: 'Failure',
      kind: 'problem',
      title: 'What goes wrong between “approved” and “paid”',
      body: [
        '<b>Timeouts</b>: the request reaches the issuer, which approves, but the response is lost — the cardholder is held for money the merchant never learns about. The network sends a <b>reversal</b>; clients must retry with idempotency keys and reconcile. <b>Duplicate submissions</b>, <b>partial captures</b>, <b>expired holds</b> and <b>refunds after settlement</b> each need explicit handling.',
        'The defence is the same everywhere: <b>idempotent operations</b>, an append-only ledger with double-entry bookkeeping, a state machine per payment (authorised → captured → settled → refunded/disputed) and <b>daily reconciliation</b> of your records against the acquirer’s and network’s files — mismatches are investigated, not ignored. Figures here are illustrative model outputs, not any network’s real rates.',
      ],
      changes: [{ text: 'Approve with lost reply → reversal + reconciliation', tone: 'info' }, { text: 'State machine + ledger + daily reconciliation', tone: 'good' }],
      scene: { nodes: [merchant({ tag: pill('no response → retry?', 'clock', 'warn') }), acquirer(), issuer({ tag: pill('approved, hold placed', 'check') })], links: [link('merchant', 'acq', { style: 'broken' }), link('acq', 'iss')], flows: [flow(['iss', 'acq'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fast approval, slow money, many hands',
      body: [
        'A card payment is <b>authorization</b> (a ~400 ms message chain through acquirer, network and issuer, placing a hold) followed by <b>capture, clearing and settlement</b> (netted money movement over 1–3 days). The merchant discount rate is split between issuer interchange, network assessment and the acquirer.',
        'Reliability comes from idempotency, ledgers, a payment state machine and reconciliation; security from tokenization, 3-D Secure and fraud scoring at every layer. Use a payment provider to keep card data out of scope.',
      ],
      scene: { nodes: [merchant(), acquirer(), network(), issuer(), db('ledger', 5, 8, 'Ledger', { size: [1.2, 1.2] })], links: [link('merchant', 'acq', { arrow: 'both' }), link('acq', 'net', { arrow: 'both' }), link('net', 'iss', { arrow: 'both' })], flows: [flow(['merchant', 'acq', 'net', 'iss'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
