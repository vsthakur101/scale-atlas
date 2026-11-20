import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const holder = (extra: Partial<SceneNode> = {}) => box('holder', -18, 0, 'Cardholder', 'teal', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const merchant = (extra: Partial<SceneNode> = {}) => box('merchant', -9, 0, 'Merchant', 'orange', 'server', { size: [1.4, 1.4], height: 24, ...extra });
const acquirer = (extra: Partial<SceneNode> = {}) => box('acquirer', 0, 0, 'Acquirer / processor', 'blue', 'layers', { size: [1.5, 1.5], height: 26, ...extra });
const network = (extra: Partial<SceneNode> = {}) => box('network', 9, 0, 'Card network (the scheme)', 'purple', 'share', { size: [1.7, 1.7], height: 30, ...extra });
const issuer = (extra: Partial<SceneNode> = {}) => box('issuer', 18, 0, 'Issuer (cardholder’s bank)', 'green', 'dollar', { size: [1.5, 1.5], height: 28, ...extra });
const rules = (extra: Partial<SceneNode> = {}) => db('rules', 9, 9, 'Interchange schedule + scheme rules', { size: [1.3, 1.3], ...extra });

const fmtD = (n: number): string => (n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(2)}`);

const lesson: Lesson = {
  slug: 'source-how-does-visa-make-money',
  title: 'Card Network Economics: Interchange, Scheme Fees and the Merchant Discount',
  blurb: 'Who gets what when a card is tapped: the four-party model, the fee waterfall from the merchant’s price to the issuer, the network and the acquirer, why small tickets cost more, and how a network earns on volume without lending a cent.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'mdr', label: 'Merchant pays on this ticket', icon: 'dollar' },
    { key: 'split', label: 'Split: issuer · network · acquirer', icon: 'share' },
    { key: 'small', label: 'Effective rate on a small ticket (fixed fee bites)', icon: 'alert' },
    { key: 'rev', label: 'Network revenue from payment volume', icon: 'gauge' },
    { key: 'xb', label: 'Blended rate when cross-border share rises', icon: 'globe' },
  ],
  goals: [
    { text: 'The four-party model and the message flow', step: 1 },
    { text: 'Authorisation, clearing and settlement', step: 2 },
    { text: 'The fee waterfall: interchange, assessments, markup', step: 3 },
    { text: 'Why interchange exists — and its critics', step: 4 },
    { text: 'The network’s business model; pricing for merchants', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'ticket', label: 'Purchase amount', min: 1, max: 5000, step: 1, default: 100, unit: ' $', description: 'Transaction value.' },
      { key: 'ic', label: 'Interchange (paid to the issuer)', min: 0, max: 4, step: 0.01, default: 1.8, unit: '%', description: 'Percentage set by the scheme schedule by card type and merchant category (illustrative).' },
      { key: 'as', label: 'Scheme assessments and network fees', min: 0, max: 0.6, step: 0.01, default: 0.13, unit: '%', description: 'Paid to the network (illustrative).' },
      { key: 'mk', label: 'Acquirer / processor markup', min: 0, max: 2, step: 0.01, default: 0.3, unit: '%', description: 'Acquirer’s margin on top.' },
      { key: 'fx', label: 'Per-transaction fixed fee', min: 0, max: 0.5, step: 0.01, default: 0.1, unit: ' $', description: 'Fixed fee charged by the acquirer.' },
      { key: 'vol', label: 'Network payment volume per year', min: 0.1, max: 20, step: 0.1, default: 10, unit: ' $T', description: 'Total purchases processed.' },
      { key: 'xs', label: 'Cross-border share of volume', min: 0, max: 50, step: 1, default: 10, unit: '%', description: 'Transactions across currencies or countries.' },
      { key: 'xf', label: 'Extra cross-border fee', min: 0, max: 3, step: 0.05, default: 1, unit: '%', description: 'Additional percentage on cross-border transactions (illustrative).' },
    ],
    calculate: (input, step) => {
      const t = Math.max(0.01, input.ticket ?? 100);
      const ic = Math.max(0, (input.ic ?? 1.8) / 100);
      const as = Math.max(0, (input.as ?? 0.13) / 100);
      const mk = Math.max(0, (input.mk ?? 0.3) / 100);
      const fx = Math.max(0, input.fx ?? 0.1);
      const vol = Math.max(0.01, input.vol ?? 10) * 1e12;
      const xs = Math.min(1, Math.max(0, (input.xs ?? 10) / 100));
      const xf = Math.max(0, (input.xf ?? 1) / 100);
      const issuer = t * ic;
      const network = t * as;
      const acq = t * mk + fx;
      const total = issuer + network + acq;
      const small = ((5 * (ic + as + mk) + fx) / 5) * 100;
      const rev = vol * as;
      const blended = (ic + as + mk + xs * xf) * 100 + (fx / t) * 100;
      return {
        mdr: step < 3 ? { v: '—' } : { v: `${fmtD(total)} (${((total / t) * 100).toFixed(2)}% of ${fmtD(t)})`, tone: total / t < 0.03 ? 'good' : 'warn' },
        split: step < 3 ? { v: '—' } : { v: `${fmtD(issuer)} · ${fmtD(network)} · ${fmtD(acq)}` },
        small: step < 3 ? { v: '—' } : { v: `${small.toFixed(1)}% on a $5 purchase vs ${((total / t) * 100).toFixed(2)}% on ${fmtD(t)}`, tone: small > 3.5 ? 'bad' : 'warn' },
        rev: step < 5 ? { v: '—' } : { v: `${fmtD(rev)} per year (${(as * 100).toFixed(2)}% × ${fmtD(vol)}) — illustrative`, tone: 'good' },
        xb: step < 5 ? { v: '—' } : { v: `${blended.toFixed(2)}% (${(xs * 100).toFixed(0)}% cross-border at +${(xf * 100).toFixed(1)}%)`, tone: 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Four parties',
      kind: 'insight',
      title: 'Four parties and a network in the middle',
      body: [
        'A card payment involves more parties than the two visible ones. The <b>cardholder</b> pays; the <b>issuer</b> (the bank that issued the card) holds the account or credit line and takes the risk the cardholder won’t pay; the <b>merchant</b> sells; the <b>acquirer</b> (a bank or processor) signs up the merchant, receives their payments and pays them out. In the middle sits the <b>card network</b> or <b>scheme</b> (Visa, Mastercard, RuPay, UnionPay…) — a rulebook plus switching infrastructure that lets any issuer talk to any acquirer, which is why one card works at millions of unrelated merchants (see the Card Payments lesson).',
        'Crucially, a network like Visa is typically <b>not</b> the lender and does not hold the cardholder’s account: the issuer decides credit limits, bears fraud and default losses, and sets the cardholder’s fees and rewards. The network’s job is <b>authorisation messaging, clearing, settlement coordination, rules, brand and security standards</b> — and it is paid per transaction and per dollar of volume rather than from interest. That determines its business model, below.',
      ],
      scene: { nodes: [holder(), merchant(), acquirer(), network({ tag: pill('rules + switching', 'share') }), issuer({ tag: pill('credit risk, rewards', 'dollar') })], links: [link('holder', 'merchant'), link('merchant', 'acquirer'), link('acquirer', 'network'), link('network', 'issuer')], flows: [flow(['holder', 'merchant', 'acquirer', 'network', 'issuer'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Flow',
      kind: 'technique',
      title: 'Authorisation, clearing and settlement',
      body: [
        '<b>Authorisation</b> takes about a second: the merchant’s terminal sends the card data and amount to the acquirer; the acquirer routes it via the network to the issuer, which checks funds/credit, fraud signals and card status and replies approve or decline; the answer travels back. Nothing has moved yet — the issuer has put a <i>hold</i> on the customer’s available funds. <b>Clearing</b> happens later (hours, usually end of day): the merchant’s batch of approved transactions is sent through the network, which computes <b>who owes whom, net of fees</b>.',
        '<b>Settlement</b> then moves money, typically one or two days after purchase: the issuer pays the network/acquirer the purchase amount <b>minus interchange</b>; the acquirer pays the merchant the amount <b>minus the merchant discount fee</b> (interchange + scheme fees + acquirer markup). So on a $100 sale the merchant receives roughly $97.67, the issuer retains $1.80 of the flow as interchange, the network collects its fees, and the acquirer keeps its markup. Refunds and chargebacks reverse flows, and disputes follow scheme rules (see the Reconciliation lesson for how the books are matched).',
      ],
      changes: [{ text: 'Authorise in ~1 s: issuer places a hold', tone: 'info' }, { text: 'Clear in a batch: the network nets fees', tone: 'info' }, { text: 'Settle in 1–2 days: merchant paid minus fees', tone: 'info' }],
      scene: { nodes: [merchant({ tag: pill('1 authorise', 'bolt') }), acquirer(), network({ tag: pill('2 clear · 3 settle', 'list') }), issuer({ tag: pill('approve + hold', 'check') })], links: [link('merchant', 'acquirer'), link('acquirer', 'network'), link('network', 'issuer')], flows: [flow(['merchant', 'acquirer', 'network', 'issuer'], { kind: 'handshake', rate: 1.8, back: true })] },
    },
    {
      short: 'Waterfall',
      kind: 'insight',
      title: 'The fee waterfall: what $100 becomes',
      body: [
        'The merchant’s total cost, the <b>merchant discount rate (MDR)</b>, is the sum of three layers. <b>Interchange</b> (illustrative 1.8%) goes from the acquirer to the <b>issuer</b>; it is set by the network’s published schedule according to card type (debit, credit, premium rewards), merchant category, channel (card-present vs online) and region — hundreds of rates — or capped by regulation in some markets. <b>Scheme / assessment fees</b> (0.13%) go to the <b>network</b> for access, processing and brand. <b>Acquirer markup</b> (0.30% plus a $0.10 fixed fee) pays the acquirer or processor for onboarding, risk, support and the platform.',
        'On a $100 purchase: issuer <b>$1.80</b>, network <b>$0.13</b>, acquirer <b>$0.40</b> — total <b>$2.33 (2.33%)</b>; the merchant nets $97.67. The <b>fixed fee</b> matters for small tickets: on a $5 coffee the same schedule costs 2.23% × $5 + $0.10 = <b>$0.21, 4.2%</b> — nearly double the percentage. That’s why cafés set card minimums, prefer debit or local rails (UPI, PIX, bank transfers — see the Real-Time Payments lesson), or use acquirers with flat or interchange-plus pricing. (All rates in this lesson are illustrative, not any network’s published schedule.)',
      ],
      changes: [{ text: '$100: issuer $1.80 · network $0.13 · acquirer $0.40 = $2.33', tone: 'info' }, { text: 'Small $5 ticket: 4.2% effective — fixed fee dominates', tone: 'bad' }],
      scene: { nodes: [acquirer({ tag: pill('merchant discount 2.33%', 'dollar') }), network({ tag: pill('$0.13', 'dollar', 'good') }), issuer({ tag: pill('interchange $1.80', 'dollar', 'good') }), rules({ tag: pill('rate by card type & category', 'list') })], links: [link('acquirer', 'network'), link('network', 'issuer'), link('rules', 'network')], flows: [flow(['acquirer', 'network', 'issuer'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Why',
      kind: 'tradeoff',
      title: 'Why interchange exists, and why it’s contested',
      body: [
        '<b>The rationale</b>: a card payment needs both sides to participate. Issuers bear the costs and risks that make cards attractive to <i>cardholders</i> — fraud liability, credit losses, the interest-free float, customer service, rewards and cash-back — but the revenue comes from <i>merchants</i> (who gain: guaranteed payment, higher sales, no cash handling, lower fraud risk than cheques). Interchange is the mechanism that moves a share of merchant value to issuers so they keep issuing and rewarding — a classic <b>two-sided market</b>: the platform sets prices on each side to get both on board.',
        'The criticisms: rates are set by network schedules rather than competitive bidding between issuers, merchants can’t refuse a card type without losing sales (the <b>honour-all-cards</b> rule), reward cards shift cost from cardholders to all shoppers (a cash buyer pays the same price as a premium card buyer), and prices are opaque. Regulators have responded in various ways: caps on debit interchange, limits on rewards, surcharging allowed or banned, and steering rules. Merchants respond with <b>surcharging</b> where permitted, <b>routing</b> debit to cheaper networks, and local payment rails. The structure differs by country — the numbers above are not universal.',
      ],
      changes: [{ text: 'Two-sided market: merchants’ value funds issuers’ rewards and risk', tone: 'info' }, { text: 'Contested: rate-setting, honour-all-cards, cross-subsidy', tone: 'bad' }, { text: 'Regulation: caps, surcharge rules, routing choice', tone: 'info' }],
      scene: { nodes: [merchant({ tag: pill('pays the MDR', 'dollar') }), issuer({ tag: pill('funds rewards + bears fraud', 'heart') }), holder({ tag: pill('earns cash-back', 'heart', 'good') }), rules({ tag: pill('caps / surcharge rules', 'scale') })], links: [link('merchant', 'issuer', { style: 'dashed' }), link('issuer', 'holder'), link('rules', 'issuer')], flows: [flow(['merchant', 'issuer', 'holder'], { rate: 1.4 })] },
    },
    {
      short: 'Model',
      kind: 'technique',
      title: 'The network’s business model, and how merchants buy',
      body: [
        'A network earns <b>a small slice of a vast volume</b>: assessments (a few basis points of purchase volume), <b>per-transaction processing fees</b> for each authorisation and clearing message, <b>cross-border and currency conversion fees</b> (the richest margin — a transaction in another currency or country carries an extra percentage), and <b>value-added services</b> (fraud scoring, tokenisation, data and analytics, risk and dispute tools, issuer/acquirer processing). At an illustrative $10 trillion of annual volume and 0.13% assessments the base is <b>$13 billion a year</b> — before processing and cross-border income — with low marginal cost per extra transaction and <b>no credit risk</b> (the issuer lends), which is why scale and network effects dominate: more cardholders attract more merchants and the reverse.',
        '<b>Merchant pricing</b> comes in models: <b>blended / flat rate</b> (e.g. 2.9% + $0.30 for all cards — simple, costly for large tickets and cheap cards), <b>interchange-plus</b> (pass-through interchange and scheme fees plus a fixed markup — transparent, better for volume), <b>tiered</b> (buckets, often opaque), and <b>subscription</b>. Cross-border mix raises the blend: with 10% of volume cross-border at +1%, the effective rate on the $100 ticket rises from 2.33% to <b>2.43%</b>. Optimise with data: debit routing, level-2/3 data for B2B cards, authorisation-rate tuning (declines cost sales), network tokens (higher approval) and chargeback management. All numbers here are illustrative model outputs.',
      ],
      changes: [{ text: '$10T × 0.13% ≈ $13B base assessments (illustrative), plus processing and cross-border', tone: 'info' }, { text: 'No credit risk; value = scale and network effects', tone: 'good' }, { text: 'Flat vs interchange-plus pricing; cross-border mix lifts the blend to 2.43%', tone: 'info' }],
      scene: { nodes: [network({ tag: pill('bps of volume + per-txn + FX fees', 'gauge', 'good') }), acquirer({ tag: pill('interchange-plus pricing', 'list') }), merchant(), issuer()], links: [link('merchant', 'acquirer'), link('acquirer', 'network'), link('network', 'issuer')], flows: [flow(['merchant', 'acquirer', 'network', 'issuer'], { kind: 'write', rate: 1.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'The scheme earns on volume; the issuer earns on risk; the merchant pays',
      body: [
        'A purchase flows through <b>cardholder → merchant → acquirer → network → issuer</b>. The merchant pays an <b>MDR</b> built of <b>interchange</b> (to the issuer), <b>scheme fees</b> (to the network) and <b>acquirer markup</b> — $2.33 on $100 here, with the fixed fee pushing small tickets to ~4%.',
        'The network lends nothing and takes no credit risk: it earns on volume, processing and cross-border fees, which is why scale is its moat. Rates vary by country and are regulated differently.',
      ],
      scene: { nodes: [holder(), merchant(), acquirer(), network(), issuer()], links: [link('holder', 'merchant'), link('merchant', 'acquirer'), link('acquirer', 'network'), link('network', 'issuer')], flows: [flow(['holder', 'merchant', 'acquirer', 'network', 'issuer'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
