import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const payer = (extra: Partial<SceneNode> = {}) => box('payer', -17, 0, 'Payer’s phone (wallet app)', 'teal', 'user', { size: [1.3, 1.4], height: 26, ...extra });
const qr = (extra: Partial<SceneNode> = {}) => box('qr', -8, 0, 'QR code', 'yellow', 'image', { size: [1.2, 1.2], height: 16, ...extra });
const merch = (extra: Partial<SceneNode> = {}) => box('merch', -8, 8, 'Merchant (till / POS)', 'orange', 'server', { size: [1.3, 1.3], height: 24, ...extra });
const psp = (extra: Partial<SceneNode> = {}) => box('psp', 2, 0, 'Wallet / payment provider', 'purple', 'shield', { size: [1.5, 1.5], height: 30, ...extra });
const bank = (extra: Partial<SceneNode> = {}) => box('bank', 12, 0, 'Payer’s bank / account', 'blue', 'dollar', { size: [1.4, 1.4], height: 28, ...extra });
const ledger = (extra: Partial<SceneNode> = {}) => db('ledger', 12, 8, 'Merchant settlement account', { size: [1.2, 1.2], ...extra });
const thief = (extra: Partial<SceneNode> = {}) => box('thief', -8, -8, 'Sticker swapper', 'red', 'alert', { size: [1.2, 1.2], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtD = (n: number): string => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString('en-US')}`);
const sci = (p: number): string => (p === 0 ? '0' : `~10^${Math.round(Math.log10(p))}`);

const lesson: Lesson = {
  slug: 'source-4-ways-of-qr-code-payment',
  title: 'QR Code Payments: Static, Dynamic, Merchant-Scanned and Customer-Scanned',
  blurb: 'A QR code is only a way to carry data across an air gap. Compare the four patterns, what each payload contains, how amounts and merchants are bound to a payment, and where fraud and reconciliation problems live.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'mis', label: 'Static QR: payments with wrong or missing amount / day', icon: 'alert' },
    { key: 'swap', label: 'Static QR: yearly loss to sticker swaps', icon: 'shield' },
    { key: 'guess', label: 'Dynamic QR: chance to guess a live code', icon: 'lock' },
    { key: 'time', label: 'Scan-to-confirmation time', icon: 'clock' },
  ],
  goals: [
    { text: 'What a QR payload is and why it works for payments', step: 1 },
    { text: 'Merchant-presented static QR', step: 2 },
    { text: 'Merchant-presented dynamic QR', step: 3 },
    { text: 'Customer-presented QR (merchant scans)', step: 4 },
    { text: 'Fraud, reconciliation and choosing a pattern', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'merchants', label: 'Merchants using static QR', min: 1000, max: 50000000, step: 1000, default: 100000, unit: '', description: 'Small merchants with a printed sticker.' },
      { key: 'txns', label: 'Payments per merchant per day', min: 1, max: 1000, step: 1, default: 150, unit: '', description: 'Daily customer payments.' },
      { key: 'ticket', label: 'Average ticket', min: 0.5, max: 500, step: 0.5, default: 4.5, unit: ' $', description: 'Typical amount of one payment.' },
      { key: 'mistype', label: 'Payer enters wrong or no amount', min: 0, max: 10, step: 0.1, default: 0.8, unit: '%', description: 'Share of static-QR payments with an amount mismatch.' },
      { key: 'swapRate', label: 'Merchants hit by a sticker swap per year', min: 0, max: 5, step: 0.05, default: 0.2, unit: '%', description: 'Annual share whose QR is replaced by an attacker’s.' },
      { key: 'swapDays', label: 'Days until a swap is detected', min: 1, max: 30, step: 1, default: 3, unit: '', description: 'Detection delay.' },
      { key: 'bits', label: 'Dynamic-code entropy', min: 20, max: 128, step: 4, default: 64, unit: ' bits', description: 'Random bits in the per-order payment reference.' },
      { key: 'ttl', label: 'Dynamic-code lifetime', min: 10, max: 3600, step: 10, default: 120, unit: ' s', description: 'How long a code stays payable.' },
      { key: 'attempts', label: 'Attacker lookups per second', min: 1, max: 100000, step: 1, default: 1000, unit: '/s', description: 'Rate the attacker can try references.' },
      { key: 'scan', label: 'Scan + decode', min: 100, max: 3000, step: 50, default: 800, unit: ' ms', description: 'Camera focus and decoding.' },
      { key: 'ui', label: 'Review + authorise (PIN / biometric)', min: 500, max: 10000, step: 100, default: 2500, unit: ' ms', description: 'Human time on the confirm screen.' },
      { key: 'net', label: 'Network + provider + bank approval', min: 200, max: 5000, step: 50, default: 900, unit: ' ms', description: 'Backend round trips.' },
    ],
    calculate: (input, step) => {
      const merchants = Math.max(1, input.merchants ?? 1e5);
      const txns = Math.max(0, input.txns ?? 150);
      const ticket = Math.max(0, input.ticket ?? 4.5);
      const mistype = Math.max(0, (input.mistype ?? 0.8) / 100);
      const swapRate = Math.max(0, (input.swapRate ?? 0.2) / 100);
      const swapDays = Math.max(0, input.swapDays ?? 3);
      const bits = Math.max(1, input.bits ?? 64);
      const ttl = Math.max(1, input.ttl ?? 120);
      const attempts = Math.max(1, input.attempts ?? 1000);
      const mis = merchants * txns * mistype;
      const swapLoss = merchants * swapRate * swapDays * txns * ticket;
      const guess = Math.min(1, (attempts * ttl) / Math.pow(2, bits));
      const time = (input.scan ?? 800) + (input.ui ?? 2500) + (input.net ?? 900);
      return {
        mis: step < 2 ? { v: '—' } : { v: `${fmtN(mis)} items (${fmtD(mis * ticket)}) to reconcile`, tone: mis < 1000 ? 'good' : 'warn' },
        swap: step < 2 ? { v: '—' } : { v: fmtD(swapLoss), tone: swapLoss < 1e5 ? 'good' : 'warn' },
        guess: step < 3 ? { v: '—' } : { v: guess >= 1e-3 ? `${(guess * 100).toFixed(2)}%` : sci(guess), tone: guess < 1e-9 ? 'good' : 'bad' },
        time: step < 4 ? { v: '—' } : { v: `${(time / 1000).toFixed(1)} s (${Math.round(input.scan ?? 800)} + ${Math.round(input.ui ?? 2500)} + ${Math.round(input.net ?? 900)} ms)`, tone: time < 5000 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Payload',
      kind: 'insight',
      title: 'A QR code is just data crossing an air gap',
      body: [
        'A QR code encodes up to a few kilobytes of text with error correction, so a phone camera can read it from a screen or a sticker. The security and the semantics come entirely from the <b>payload</b> and from what the back end does with it. Payment QR codes carry a standardised string — for example the <b>EMVCo Merchant-Presented QR</b> format: tag–length–value fields for the <b>payee identifier</b> (a merchant id, account or UPI-style address), <b>currency</b>, an optional <b>amount</b>, a <b>reference or order id</b>, and a checksum (CRC-16). National schemes (UPI, PIX, PayNow, Alipay/WeChat Pay) use variants of the same idea.',
        'Four patterns come from two questions: <b>who shows the code</b> (merchant or customer) and <b>is it fixed or generated per payment</b> (static or dynamic). The code never carries money — scanning it only tells a payment app <i>whom to pay and (maybe) how much</i>; the actual transfer goes through the provider and banks. Everything below is about binding amount, payee and payment together.',
      ],
      scene: { nodes: [payer({ tag: pill('scan → parse → confirm', 'search') }), qr({ tag: pill('payee · currency · amount? · ref', 'list') }), psp()], links: [link('payer', 'qr'), link('payer', 'psp')], flows: [flow(['qr', 'payer'], { rate: 1.2 }), flow(['payer', 'psp'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Static',
      kind: 'technique',
      title: 'Merchant-presented static QR: a sticker on the counter',
      body: [
        'The merchant prints one QR per shop containing only <b>who to pay</b> (their merchant id). The customer scans it, <b>types the amount</b>, authorises, and the provider moves money to the merchant. Cheap and universal — no hardware, a printed sticker is the whole integration — which is why it dominates micro-merchants (street vendors, market stalls).',
        'Weaknesses follow from the missing amount and order binding. The payer can mistype or underpay, and the merchant has <b>no per-sale reference</b> to match, so matching depends on the merchant seeing a notification or SMS: at 100,000 merchants × 150 payments × 0.8% = <b>120,000 payments a day</b> ($540,000) with the wrong or missing amount to dispute and reconcile. And the sticker itself is the attack surface: a <b>QR swap</b> (pasting the attacker’s code over the merchant’s) silently diverts payments — 0.2% of merchants a year with 3 days to detect is about <b>$405,000 a year</b> in this model. Mitigations: tamper-evident stickers, a merchant-name confirmation screen showing <i>who</i> will be paid, and payment notifications to the merchant.',
      ],
      changes: [{ text: 'Payload = payee only; payer enters the amount', tone: 'info' }, { text: 'No order reference → manual matching, mismatches', tone: 'bad' }, { text: 'Sticker swap diverts funds; show payee name before paying', tone: 'bad' }],
      scene: { nodes: [payer({ tag: pill('types ₹/$ amount', 'user') }), qr({ tag: pill('merchant id only', 'list') }), merch({ tag: pill('hears “received”', 'speaker') }), psp(), thief({ tag: pill('swaps the sticker', 'alert', 'bad') })], links: [link('payer', 'qr'), link('payer', 'psp'), link('psp', 'merch'), link('thief', 'qr', { style: 'dashed' })], flows: [flow(['payer', 'psp', 'merch'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Dynamic',
      kind: 'technique',
      title: 'Merchant-presented dynamic QR: one code per order',
      body: [
        'The merchant’s system (POS, checkout page, vending kiosk, parking meter) <b>generates a new QR for each payment</b> containing the payee, the exact <b>amount</b> and a unique <b>reference</b> that the back end maps to the order. The customer scans, sees a pre-filled amount and merchant name, and confirms. The provider notifies the merchant system with that reference — <b>automatic reconciliation</b>, no mistyped amounts, and the amount can’t be altered by the payer.',
        'The code is a <b>capability with an expiry</b>: valid for one order and, say, 120 seconds, then dead; a paid code can’t be paid twice (idempotent on the reference). If the reference is 64 random bits and an attacker tries 1,000 references/s for 120 s, the chance to hit a live one is about 1.2×10⁵ ÷ 1.8×10¹⁹ ≈ <b>10⁻¹⁴</b> — negligible; with 20 bits it would be near-certain, so reference entropy and lookup rate-limiting matter. The cost is infrastructure: a screen or printer and software that talks to the provider.',
      ],
      changes: [{ text: 'Per-order code: payee + amount + reference', tone: 'good' }, { text: 'Automatic reconciliation by reference', tone: 'good' }, { text: 'Expiry + idempotency; high-entropy references', tone: 'good' }],
      scene: { nodes: [payer({ tag: pill('amount pre-filled', 'check', 'good') }), qr({ tag: pill('order #A91F · $4.50 · 120 s', 'list') }), merch({ tag: pill('generates per sale', 'refresh') }), psp({ tag: pill('ref → order', 'hash') })], links: [link('merch', 'qr'), link('payer', 'qr'), link('payer', 'psp'), link('psp', 'merch')], flows: [flow(['merch', 'qr', 'payer'], { rate: 1.2 }), flow(['payer', 'psp', 'merch'], { kind: 'write', rate: 1.4, back: true })] },
    },
    {
      short: 'Customer QR',
      kind: 'technique',
      title: 'Customer-presented QR: the merchant scans you',
      body: [
        'The reverse pattern: the customer opens their wallet, which shows a QR (or barcode) containing a <b>short-lived payment token</b>, tied to their account or card and refreshed every minute or so. The cashier’s scanner reads it, the POS sends <b>token + amount + merchant id</b> to the provider, which resolves the token, applies authentication (often the wallet’s app unlock) and approves — and the customer sees a result in the app. It is the fastest at the counter (no typing, one scan by the merchant’s equipment) and suits retail with existing barcode scanners.',
        'Security rests on the token: it must be <b>single-use, short-lived and bound to the customer</b> so a screenshot or shoulder-surfed code cannot be replayed; the provider enforces a limit and a velocity check since the payer isn’t reviewing the amount before it’s taken (some schemes require a confirmation push). It resembles the device-token plus cryptogram model of mobile wallets (see that lesson), with a QR instead of NFC as the transport. End-to-end: <b>0.8 s scan + 2.5 s human review/authorise + 0.9 s backend ≈ 4.2 s</b>, mostly the human.',
      ],
      changes: [{ text: 'Customer shows a short-lived single-use token', tone: 'good' }, { text: 'Merchant scans and submits token + amount', tone: 'info' }, { text: 'Human review dominates the ~4 s', tone: 'info' }],
      scene: { nodes: [payer({ tag: pill('shows token QR', 'image') }), merch({ tag: pill('scans + sends amount', 'search') }), psp({ tag: pill('resolve token; approve', 'shield', 'good') }), bank()], links: [link('payer', 'merch'), link('merch', 'psp'), link('psp', 'bank')], flows: [flow(['payer', 'merch', 'psp', 'bank'], { kind: 'write', rate: 1.4 }), flow(['bank', 'psp', 'merch'], { rate: 1.2, back: true })] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Fraud, reconciliation and which pattern to use',
      body: [
        'Shared threats: <b>QR tampering and phishing</b> (malicious codes on posters, parking-meter overlays, “quishing” emails that lead to a fake page — a payment QR should open a wallet, never a login form), <b>social engineering</b> (a “refund” that makes you scan a code that <i>pays</i> the scammer — in collect-request flows the direction of money is what matters), amount mismatch, and replay of screenshots. Defences: show payee name and amount clearly, bind code to order and expiry, authenticate every payment in the wallet, rate-limit lookups, and notify merchants in real time.',
        'Choosing: <b>static</b> for micro-merchants with zero hardware (accept manual reconciliation and the swap risk); <b>dynamic merchant-presented</b> for e-commerce, kiosks and any context needing exact amounts and automatic matching; <b>customer-presented</b> for fast retail checkout with scanners and strong wallet authentication. Many ecosystems run all three on the same rails (see the Real-Time Payments and Payment Rails lessons). Figures here are model outputs with illustrative rates.',
      ],
      changes: [{ text: 'Never let a scanned code lead to credential entry', tone: 'bad' }, { text: 'Static: cheap, manual; dynamic: exact, automatic; customer-shown: fast at the till', tone: 'info' }],
      scene: { nodes: [payer(), qr(), merch(), psp(), bank(), ledger()], links: [link('payer', 'qr'), link('payer', 'psp'), link('psp', 'bank'), link('psp', 'merch'), link('bank', 'ledger')], flows: [flow(['payer', 'psp', 'bank', 'ledger'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'The code carries a reference; the back end moves the money',
      body: [
        'QR payments differ by <b>who shows the code</b> and <b>whether it is per order</b>. Static codes are cheap but leave amounts and matching to humans and are swap-prone; dynamic codes bind payee, amount and reference with an expiry; customer-presented codes carry a single-use token the merchant scans.',
        'In every pattern the wallet confirms the payee and amount, and the provider enforces idempotency, expiry and limits.',
      ],
      scene: { nodes: [payer(), qr(), merch(), psp(), bank()], links: [link('payer', 'qr'), link('payer', 'psp'), link('psp', 'merch'), link('psp', 'bank')], flows: [flow(['payer', 'psp', 'bank'], { kind: 'write', rate: 1.4 })] },
    },
  ],
};

export default lesson;
