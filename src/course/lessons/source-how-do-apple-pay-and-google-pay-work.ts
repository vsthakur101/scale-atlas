import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const phone = (extra: Partial<SceneNode> = {}) => box('phone', -17, 0, 'Phone + secure element', 'purple', 'lock', { size: [1.4, 1.5], height: 30, ...extra });
const term = (extra: Partial<SceneNode> = {}) => box('term', -9, 0, 'Merchant terminal', 'teal', 'server', { size: [1.3, 1.3], height: 24, ...extra });
const acq = (extra: Partial<SceneNode> = {}) => box('acq', -1, 0, 'Acquirer / processor', 'orange', 'route', { size: [1.3, 1.3], height: 24, ...extra });
const net = (extra: Partial<SceneNode> = {}) => box('net', 7, 0, 'Card network + token service', 'blue', 'globe', { size: [1.5, 1.4], height: 28, ...extra });
const vault = (extra: Partial<SceneNode> = {}) => db('vault', 7, 8, 'Token vault (token ↔ card)', { size: [1.3, 1.3], ...extra });
const issuer = (extra: Partial<SceneNode> = {}) => box('issuer', 15, 0, 'Issuer (your bank)', 'green', 'scale', { size: [1.4, 1.4], height: 28, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtD = (n: number): string => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString('en-US')}`);

const lesson: Lesson = {
  slug: 'source-how-do-apple-pay-and-google-pay-work',
  title: 'Mobile Wallets: Device Tokens and One-Time Cryptograms',
  blurb: 'How tap-to-pay replaces your card number with a device-bound token and a per-transaction cryptogram — provisioning, the payment path through the network, and what a stolen token or a leaking merchant is worth.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'tokens', label: 'Device tokens the token service manages', icon: 'hash' },
    { key: 'fraud', label: 'Daily fraud loss (before → with wallets)', icon: 'alert' },
    { key: 'saved', label: 'Fraud avoided per day', icon: 'shield' },
    { key: 'lat', label: 'Tap-to-approval time', icon: 'clock' },
  ],
  goals: [
    { text: 'Why the card number is the weak point', step: 1 },
    { text: 'Provisioning: a device-specific token (DPAN)', step: 2 },
    { text: 'A payment: token plus one-time cryptogram', step: 3 },
    { text: 'What an attacker gets from each layer', step: 4 },
    { text: 'Trade-offs: dependencies, lifecycle and the new weak spot', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Wallet users', min: 100000, max: 500000000, step: 100000, default: 50000000, unit: '', description: 'People with a wallet enabled.' },
      { key: 'cards', label: 'Cards per user', min: 1, max: 8, step: 0.1, default: 2.5, unit: '', description: 'Cards added to each wallet.' },
      { key: 'devs', label: 'Devices per user', min: 1, max: 5, step: 0.1, default: 1.6, unit: '', description: 'Phones, watches, tablets enrolled.' },
      { key: 'txns', label: 'Card payments per day (all channels)', min: 100000, max: 1000000000, step: 100000, default: 20000000, unit: '', description: 'Daily payment volume on the issuer or network.' },
      { key: 'ticket', label: 'Average payment', min: 1, max: 500, step: 1, default: 35, unit: ' $', description: 'Mean transaction value.' },
      { key: 'bps', label: 'Baseline fraud rate', min: 1, max: 100, step: 1, default: 10, unit: ' bps', description: 'Fraud loss per $10,000 of volume on non-wallet payments.' },
      { key: 'share', label: 'Volume paid through wallets', min: 0, max: 100, step: 1, default: 40, unit: '%', description: 'Share of payments made via token + cryptogram.' },
      { key: 'cut', label: 'Fraud reduction on wallet payments', min: 0, max: 100, step: 1, default: 80, unit: '%', description: 'Illustrative reduction vs card-number payments.' },
      { key: 'nfc', label: 'NFC exchange', min: 20, max: 500, step: 10, default: 150, unit: ' ms', description: 'Tap and EMV data exchange.' },
      { key: 'se', label: 'Secure element: auth + cryptogram', min: 10, max: 400, step: 10, default: 50, unit: ' ms', description: 'Biometric check and signing inside the secure hardware.' },
      { key: 'netw', label: 'Network round trip to the issuer', min: 100, max: 3000, step: 50, default: 650, unit: ' ms', description: 'Acquirer → network → issuer → back.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 5e7);
      const cards = Math.max(1, input.cards ?? 2.5);
      const devs = Math.max(1, input.devs ?? 1.6);
      const txns = Math.max(1, input.txns ?? 2e7);
      const ticket = Math.max(1, input.ticket ?? 35);
      const bps = Math.max(0, (input.bps ?? 10) / 10000);
      const share = Math.min(1, Math.max(0, (input.share ?? 40) / 100));
      const cut = Math.min(1, Math.max(0, (input.cut ?? 80) / 100));
      const volume = txns * ticket;
      const before = volume * bps;
      const after = volume * (1 - share * cut) * bps;
      const lat = (input.nfc ?? 150) + (input.se ?? 50) + (input.netw ?? 650);
      return {
        tokens: step < 2 ? { v: '—' } : { v: `${fmtN(users * cards * devs)} (${fmtN(users * cards)} cards × ${devs.toFixed(1)} devices)` },
        fraud: step < 4 ? { v: '—' } : { v: `${fmtD(before)} → ${fmtD(after)}`, tone: after < before ? 'good' : 'warn' },
        saved: step < 4 ? { v: '—' } : { v: `${fmtD(before - after)} per day`, tone: 'good' },
        lat: step < 3 ? { v: '—' } : { v: `${lat} ms`, tone: lat <= 1000 ? 'good' : lat <= 2000 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'The card number is a reusable secret everyone holds',
      body: [
        'A card number (the <b>PAN</b>), expiry and CVV are a <b>bearer credential</b>: anyone who has them can make a card-not-present payment. They are held by merchants, payment processors and the databases of every site you’ve saved a card on, and handed over at every swipe. A breach anywhere leaks working credentials, and a skimmer or look-alike checkout copies them in seconds. Fraud mitigation has been layering checks on top of an inherently replayable secret.',
        'Mobile wallets (Apple Pay, Google Pay, Samsung Pay) change the credential itself. The merchant never receives your real PAN; it receives a <b>device-specific token</b> that is useless on its own plus a <b>one-time cryptogram</b> proving this device authorised this one payment. This builds on the same primitives as passkeys: a key held in secure hardware, a signature per use.',
      ],
      scene: { nodes: [phone({ tag: pill('card number never leaves the issuer', 'lock', 'good') }), term({ tag: pill('merchants held real PANs before', 'alert', 'warn') }), acq(), issuer()], links: [link('phone', 'term'), link('term', 'acq'), link('acq', 'issuer')], flows: [flow(['phone', 'term', 'acq', 'issuer'], { rate: 1.2 })] },
    },
    {
      short: 'Provision',
      kind: 'technique',
      title: 'Provisioning: your card becomes a device token',
      body: [
        'When you add a card, the wallet sends the card data (encrypted to the network) to the <b>token service</b> run by the card network (Visa, Mastercard, etc. via their <b>EMV payment tokenisation</b> standard). The service creates a <b>device PAN (DPAN)</b> — a number that looks like a card number but is <b>bound to this card on this device</b> — stores the mapping <code>DPAN ↔ real PAN</code> in a <b>token vault</b>, and asks the <b>issuer</b> to approve provisioning (ID&V: the bank may approve instantly, or require a code by SMS, the banking app or a call).',
        'The token and its per-device cryptographic key are delivered into the phone’s <b>secure element</b> or protected hardware (Secure Enclave, Titan M, a hardware-backed keystore): the key can sign but cannot be read out. Each device gets its own token — 50 million users × 2.5 cards × 1.6 devices = <b>200 million device tokens</b>, more than the 125 million cards — so losing one device suspends only that token and lets the card carry on elsewhere.',
      ],
      changes: [{ text: 'Network token service creates a DPAN bound to card + device', tone: 'good' }, { text: 'Issuer approves provisioning (ID&V)', tone: 'info' }, { text: 'Key lives in secure hardware, non-exportable', tone: 'good' }],
      concepts: [{ term: 'DPAN', def: 'Device primary account number: a network token standing in for the real card number, bound to one device.' }],
      scene: { nodes: [phone({ tag: pill('DPAN + key in secure element', 'lock', 'good') }), net({ tag: pill('issue token; ask issuer', 'hash') }), vault({ tag: pill('DPAN ↔ PAN', 'db') }), issuer({ tag: pill('approve (ID&V)', 'check') })], links: [link('phone', 'net'), link('net', 'vault'), link('net', 'issuer')], flows: [flow(['phone', 'net', 'issuer'], { kind: 'handshake', rate: 1.2, back: true }), flow(['net', 'vault'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Payment',
      kind: 'technique',
      title: 'A payment: token plus a one-time cryptogram',
      body: [
        'At the terminal you <b>authenticate locally</b> (Face ID, fingerprint or device PIN — the biometric never leaves the device) and hold the phone near the reader. Over NFC the secure element sends the <b>DPAN</b>, the expiry, and a <b>cryptogram</b>: a MAC or signature computed with the device key over the <b>amount, a terminal nonce, and an application transaction counter</b>. The terminal forwards these as an ordinary card transaction.',
        'The acquirer sends it to the <b>network</b>, whose token service <b>de-tokenises</b> DPAN → real PAN and verifies the cryptogram’s validity (or passes the token and cryptogram to the issuer to verify with the key it holds), checks the counter is fresh (no replay), and the <b>issuer</b> authorises on the real account, balance and risk signals. The merchant and acquirer only ever see the token. The whole path takes <code>150 ms (NFC) + 50 ms (secure element) + 650 ms (network round trip) ≈ 850 ms</code>, a budget dominated by the network leg.',
      ],
      changes: [{ text: 'Local biometric authorises the key use', tone: 'good' }, { text: 'Cryptogram covers amount, nonce and counter', tone: 'good' }, { text: 'De-tokenise at the network; issuer decides', tone: 'info' }],
      scene: { nodes: [phone({ tag: pill('DPAN + cryptogram', 'hash') }), term(), acq(), net({ tag: pill('verify cryptogram; DPAN → PAN', 'shield', 'good') }), issuer({ tag: pill('authorise', 'check') })], links: [link('phone', 'term'), link('term', 'acq'), link('acq', 'net'), link('net', 'issuer')], flows: [flow(['phone', 'term', 'acq', 'net', 'issuer'], { rate: 1.5 }), flow(['issuer', 'net', 'acq', 'term'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Attackers',
      kind: 'insight',
      title: 'What each attacker gets',
      body: [
        '<b>A breached merchant or processor</b> holds only DPANs and spent cryptograms: the token works only with a fresh cryptogram from the device key, so it is <b>worthless for replay</b> and can’t be used at another merchant or online. <b>A skimmer or relay</b> captures a cryptogram that is valid for one amount and one counter value — already consumed by the real payment. <b>A stolen phone</b> needs the biometric or PIN to use the key; the owner or issuer can <b>suspend the token</b> remotely without reissuing the physical card.',
        'This is why wallet payments are safer: at 20 million payments a day averaging $35 ($700 million of volume) and a 10 bps baseline, fraud is <b>$700,000/day</b>; if 40% of volume moves to wallets and fraud on those falls 80% (an illustrative figure), the loss drops to <b>$476,000/day — $224,000 a day avoided</b>. Real reductions vary by market and attack mix, and the savings also include fewer chargebacks and card reissues.',
      ],
      changes: [{ text: 'Merchant breach: tokens + spent cryptograms are worthless', tone: 'good' }, { text: 'Stolen phone: biometric gate, remote token suspend', tone: 'good' }, { text: 'Fraud $700k → $476k/day (illustrative)', tone: 'good' }],
      scene: { nodes: [phone({ tag: pill('key never exported', 'lock', 'good') }), term({ name: 'Compromised merchant', state: 'hot', tag: pill('sees DPAN only', 'alert', 'warn') }), box('thief', 7, 8, 'Attacker replays token', 'red', 'alert', { size: [1.2, 1.2], height: 22, tag: pill('declined: stale cryptogram', 'shield', 'good') }), net()], links: [link('phone', 'term'), link('term', 'net'), link('thief', 'net', { style: 'broken' })], flows: [flow(['phone', 'term', 'net'], { rate: 1.2 }), flow(['thief', 'net'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Trade-offs',
      kind: 'tradeoff',
      title: 'Dependencies, lifecycle and the new weak spot',
      body: [
        'Costs: the <b>token service and vault become critical infrastructure</b> — they sit on every authorisation path and must be highly available, low latency and secured (a vault breach would expose PAN mappings); issuers and networks must run token <b>lifecycle management</b> (card reissued, expiry, suspended, deleted — the token should follow without the user re-adding) and merchants must support <b>tokenised flows</b> and, for subscriptions, network-token updaters. <b>In-app and web</b> payments work similarly, with the wallet app or browser producing a payment token and a cryptogram bound to the merchant and amount.',
        'The attack surface moves to <b>provisioning</b>: social engineering to add a victim’s card to the attacker’s wallet. Issuers therefore score provisioning risk, require step-up verification, send push alerts and limit tokens per card. Offline or poor-coverage payments depend on the terminal’s and issuer’s offline rules. Treat the figures in this lesson as illustrative model outputs, not published statistics for any company.',
      ],
      changes: [{ text: 'Token service and vault are critical, must stay low-latency and available', tone: 'bad' }, { text: 'Lifecycle sync for reissue, expiry, suspension', tone: 'info' }, { text: 'Harden provisioning against social engineering', tone: 'good' }],
      scene: { nodes: [net({ state: 'hot', tag: pill('on every authorisation path', 'alert', 'warn') }), vault({ tag: pill('guard this', 'lock') }), issuer({ tag: pill('risk-score provisioning', 'shield', 'good') })], links: [link('net', 'vault'), link('net', 'issuer')], flows: [flow(['net', 'issuer'], { rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A token that is only useful with the device’s key',
      body: [
        'Wallets replace the PAN with a <b>device-bound token (DPAN)</b> provisioned by the network’s token service, and each payment carries a <b>one-time cryptogram</b> signed by a non-exportable key after a local biometric check. Merchants and processors never see the real number; stolen tokens and cryptograms are worthless.',
        'The costs are a critical token vault and lifecycle plumbing, and the new risk is fraudulent provisioning.',
      ],
      scene: { nodes: [phone(), term(), acq(), net(), issuer()], links: [link('phone', 'term'), link('term', 'acq'), link('acq', 'net'), link('net', 'issuer')], flows: [flow(['phone', 'term', 'acq', 'net', 'issuer'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
