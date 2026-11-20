import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -17, 0, 'User', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const device = (extra: Partial<SceneNode> = {}) => box('device', -10, 0, 'Authenticator (phone / laptop secure hardware)', 'purple', 'lock', { size: [1.4, 1.4], height: 28, ...extra });
const browser = (extra: Partial<SceneNode> = {}) => box('browser', -2, 0, 'Browser / OS', 'teal', 'globe', { size: [1.3, 1.3], height: 24, ...extra });
const site = (extra: Partial<SceneNode> = {}) => box('site', 8, 0, 'Website (relying party)', 'blue', 'server', { size: [1.4, 1.4], height: 30, ...extra });
const keys = (extra: Partial<SceneNode> = {}) => db('keys', 8, 8, 'Stored: public keys only', { size: [1.2, 1.2], ...extra });
const phish = (extra: Partial<SceneNode> = {}) => box('phish', 2, 8, 'Look-alike site', 'red', 'alert', { size: [1.2, 1.2], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-is-passkey-shaping-a-passwordless-future',
  title: 'Passkeys and WebAuthn: Passwordless Sign-In',
  blurb: 'A per-site key pair, a challenge signed by hardware, a browser that checks the origin: how passkeys remove shared secrets and make phishing structurally ineffective — and what recovery and sync cost.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'leak', label: 'Credentials exposed if the site’s database leaks', icon: 'alert' },
    { key: 'phish', label: 'Accounts lost to phishing / day (passwords → passkeys)', icon: 'shield' },
    { key: 'sms', label: 'SMS-code cost per month (replaced)', icon: 'gauge' },
    { key: 'reset', label: 'Password-reset support tickets / month', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why shared secrets (passwords) are the weakness', step: 1 },
    { text: 'Registration: a key pair per site, public key to the server', step: 2 },
    { text: 'Authentication: signing a fresh challenge', step: 3 },
    { text: 'Origin binding: why phishing fails', step: 4 },
    { text: 'Sync, recovery and adoption trade-offs', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Registered users', min: 1000, max: 500000000, step: 1000, default: 5000000, unit: '', description: 'Accounts on the service.' },
      { key: 'logins', label: 'Logins per user per month', min: 1, max: 100, step: 1, default: 12, unit: '', description: 'Sign-ins per user each month.' },
      { key: 'phishPct', label: 'Phishing success per login (passwords)', min: 0.001, max: 1, step: 0.001, default: 0.02, unit: '%', description: 'Share of logins that end up entered into a phishing page.' },
      { key: 'adopt', label: 'Users on passkeys', min: 0, max: 100, step: 1, default: 60, unit: '%', description: 'Share of accounts using passkeys instead of passwords.' },
      { key: 'smsCost', label: 'Cost per SMS code', min: 0.001, max: 0.2, step: 0.001, default: 0.04, unit: ' $', description: 'Provider fee for one text message.' },
      { key: 'reset', label: 'Password resets per user per year', min: 0, max: 5, step: 0.05, default: 0.8, unit: '', description: 'How often a password user needs a reset.' },
      { key: 'ticket', label: 'Share of resets that become support tickets', min: 0, max: 50, step: 1, default: 15, unit: '%', description: 'Resets needing human help.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 5e6);
      const logins = Math.max(0, input.logins ?? 12);
      const phishPct = Math.max(0, (input.phishPct ?? 0.02) / 100);
      const adopt = Math.min(1, Math.max(0, (input.adopt ?? 60) / 100));
      const smsCost = Math.max(0, input.smsCost ?? 0.04);
      const resets = Math.max(0, input.reset ?? 0.8);
      const ticket = Math.max(0, (input.ticket ?? 15) / 100);
      const pwUsers = users * (1 - adopt);
      const dailyLogins = (u: number) => (u * logins) / 30;
      const pwPhish = dailyLogins(users) * phishPct;
      const nowPhish = dailyLogins(pwUsers) * phishPct;
      // SMS second factor: one code per password login.
      const sms = pwUsers * logins * smsCost;
      const smsBefore = users * logins * smsCost;
      const ticketsBefore = (users * resets * ticket) / 12;
      const ticketsNow = (pwUsers * resets * ticket) / 12;
      return {
        leak: step < 1 ? { v: '—' } : { v: `${fmtN(pwUsers)} password hashes · 0 usable passkey secrets`, tone: pwUsers > 0 ? 'warn' : 'good' },
        phish: step < 3 ? { v: '—' } : { v: `${fmtN(pwPhish)} → ${fmtN(nowPhish)}`, tone: nowPhish < pwPhish ? 'good' : 'warn' },
        sms: step < 4 ? { v: '—' } : { v: `$${Math.round(smsBefore).toLocaleString('en-US')} → $${Math.round(sms).toLocaleString('en-US')}`, tone: 'good' },
        reset: step < 4 ? { v: '—' } : { v: `${fmtN(ticketsBefore)} → ${fmtN(ticketsNow)}`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The problem',
      kind: 'problem',
      title: 'A password is a secret that both sides must hold',
      body: [
        'A password authenticates you by <b>sharing a secret with the server</b>. That has built-in weaknesses: users pick guessable or reused ones; the server stores something derived from every user’s secret (a database leak — see the Password Storage lesson — exposes the lot); and the secret can be <b>typed into the wrong place</b> — a phishing page that looks like the real site collects it, and even a one-time code (TOTP, SMS) can be relayed to the real site in real time (see the Authenticator lesson).',
        'The fix is to stop sharing secrets. <b>Passkeys</b> (built on <b>WebAuthn/FIDO2</b>) use <b>public-key cryptography</b>: the secret (a private key) never leaves your device, the server stores only a public key, and the proof of identity is a signature the server can verify but not forge.',
      ],
      scene: { nodes: [user({ tag: pill('types a password', 'alert', 'warn') }), phish({ tag: pill('collects it', 'alert', 'bad') }), site({ tag: pill('stores hashes of secrets', 'db') })], links: [link('user', 'phish'), link('user', 'site')], flows: [flow(['user', 'phish'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Register',
      kind: 'technique',
      title: 'Registration: a key pair per site',
      body: [
        'When you create a passkey, the site (the <b>relying party</b>) sends a random <b>challenge</b> and its identity (its domain, e.g. <code>example.com</code>). Your <b>authenticator</b> — the secure hardware in a phone or laptop, or a security key — generates a <b>new key pair</b> scoped to that domain, keeps the <b>private key</b> inside protected hardware (never exportable in raw form), and returns the <b>public key</b> plus a credential id, signed over the challenge. The server stores <b>(credential id, public key)</b> against your account.',
        'Creation requires <b>user verification</b> — a fingerprint, face or device PIN — checked locally by the authenticator; biometrics never leave the device and are never sent to the site. Each site gets a <b>different key pair</b>, so credentials can’t be correlated across sites. If the site’s database leaks, the attacker gets only public keys: <b>nothing that can sign in</b>.',
      ],
      changes: [{ text: 'Per-site key pair; private key stays in secure hardware', tone: 'good' }, { text: 'Server stores only the public key', tone: 'good' }],
      scene: { nodes: [site({ tag: pill('challenge + rp id', 'hash') }), browser(), device({ tag: pill('generate key pair; unlock with biometric', 'lock', 'good') }), keys({ tag: pill('public key + credential id', 'check', 'good') })], links: [link('site', 'browser'), link('browser', 'device'), link('site', 'keys')], flows: [flow(['site', 'browser', 'device'], { kind: 'handshake', rate: 1.2, back: true }), flow(['site', 'keys'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Sign in',
      kind: 'technique',
      title: 'Authentication: sign a fresh challenge',
      body: [
        'To sign in the server sends a new random <b>challenge</b>. The browser asks the authenticator, which finds the credential for <b>this domain</b>, asks you to verify (touch, face, PIN), and returns a <b>signature</b> over the challenge together with authenticator data (the domain’s hash, flags, and a signature <b>counter</b>). The server looks up the stored public key, <b>verifies the signature</b>, checks the challenge matches what it issued and the domain hash matches its own, and logs you in.',
        'There is <b>no secret to steal in transit</b>: the signature is useless for any other challenge, so replay fails. There are no passwords to reset, nothing to type, no code to relay, and the experience is one tap. The cryptography is the same as digital signatures (see that lesson) — typically ECDSA P-256 or Ed25519 — and verification is cheap on the server.',
      ],
      changes: [{ text: 'Signature over a fresh challenge + origin data', tone: 'info' }, { text: 'Nothing reusable crosses the network', tone: 'good' }],
      scene: { nodes: [site({ tag: pill('new random challenge', 'hash') }), browser(), device({ tag: pill('sign after biometric check', 'lock', 'good') })], links: [link('site', 'browser'), link('browser', 'device')], flows: [flow(['site', 'browser', 'device'], { rate: 1.2, back: true })] },
    },
    {
      short: 'Origin binding',
      kind: 'insight',
      title: 'Why phishing can’t work: the browser tells the authenticator the origin',
      body: [
        'The credential is bound to the <b>relying-party domain</b>, and it is the <b>browser</b> — not the user — that tells the authenticator which origin is asking. On <code>examp1e-login.com</code> the authenticator looks for a credential for that domain, finds none, and offers nothing: there is <b>no secret to hand over</b>, and no signature that the real site would accept, because the signed data includes the origin. Even a perfect visual clone fails. This is why passkeys are called <b>phishing-resistant</b>, which TOTP and SMS codes are not.',
        'At 5 million users logging in 12 times a month with a 0.02% phishing success rate, passwords lose ~400 accounts a day; with 60% on passkeys that falls to ~160. Also eliminated: credential stuffing (reused passwords tried across sites), password spraying and keyloggers. Remaining risks shift to the device and account recovery.',
      ],
      changes: [{ text: 'Signature covers the origin → look-alike sites get nothing', tone: 'good' }, { text: 'No credential stuffing, spraying or relay attacks', tone: 'good' }],
      scene: { nodes: [user(), browser({ tag: pill('origin = examp1e-login.com', 'alert', 'warn') }), device({ tag: pill('no credential for that domain', 'shield', 'good') }), phish({ tag: pill('gets nothing', 'check', 'good') })], links: [link('user', 'browser'), link('browser', 'device'), link('browser', 'phish', { style: 'dashed' })], flows: [flow(['browser', 'device'], { rate: 1 })] },
    },
    {
      short: 'Sync & recovery',
      kind: 'tradeoff',
      title: 'Sync, recovery and the cost of switching',
      body: [
        '<b>Device-bound</b> passkeys (a hardware security key, or a platform key that never leaves one device) are the strongest but lose you the account if the device is lost; <b>synced</b> passkeys are backed up end-to-end encrypted through a platform’s keychain or a password manager, so a new phone gets them — convenient, with security tied to the cloud account’s protection. <b>Cross-device sign-in</b> lets a phone authenticate a login on a laptop over Bluetooth proximity and a QR code.',
        'So <b>account recovery becomes the weak point</b>: a fallback that is easier to phish than the passkey undoes the gain — design recovery with multiple passkeys, verified contacts, waiting periods and notifications. Practical rollout: offer passkeys alongside passwords (conditional UI / autofill), prompt after a password login, keep a fallback for unsupported devices, and measure. Benefits to cost: SMS codes ($0.04 × 12 logins × 5M users = $2.4M a month) fall with adoption, and password-reset tickets drop (5M × 0.8 × 15% ÷ 12 = 50,000 a month → 20,000 at 60% adoption). Figures here are model outputs for illustration.',
      ],
      changes: [{ text: 'Device-bound: strongest · synced: convenient', tone: 'info' }, { text: 'Recovery must not be easier to phish than the passkey', tone: 'bad' }],
      scene: { nodes: [device({ name: 'Phone', tag: pill('synced, E2E encrypted', 'lock') }), box('d2', 4, 8, 'Laptop (cross-device login)', 'teal', 'user', { size: [1.2, 1.2], height: 22, tag: pill('QR + Bluetooth proximity', 'search') }), box('rec', 12, 8, 'Recovery path', 'red', 'alert', { size: [1.2, 1.2], height: 20, tag: pill('harden this', 'alert', 'warn') })], links: [link('device', 'd2', { style: 'dashed' })], flows: [flow(['device', 'd2'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'No shared secret, no phishable secret',
      body: [
        'A passkey is a <b>per-site key pair</b>: the private key stays in secure hardware, the server holds a public key, and sign-in is a <b>signature over a fresh challenge that includes the origin</b> — so leaks expose nothing usable and look-alike sites get nothing.',
        'The remaining engineering is recovery, sync and adoption: design recovery as carefully as sign-in and keep fallbacks time-boxed.',
      ],
      scene: { nodes: [user(), device(), browser(), site(), keys()], links: [link('user', 'device'), link('device', 'browser'), link('browser', 'site'), link('site', 'keys')], flows: [flow(['device', 'browser', 'site'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
