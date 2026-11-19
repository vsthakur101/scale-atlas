import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const phone = (extra: Partial<SceneNode> = {}) => box('phone', -13, 0, 'Authenticator app', 'green', 'user', { size: [1.2, 1.2], height: 26, ...extra });
const site = (extra: Partial<SceneNode> = {}) => box('site', 8, 0, 'Server', 'blue', 'server', { size: [1.3, 1.3], height: 30, ...extra });
const attacker = (extra: Partial<SceneNode> = {}) => box('att', 0, 8, 'Attacker', 'red', 'alert', { size: [1.1, 1.1], height: 22, ...extra });

const fmtP = (p: number): string => (p >= 0.01 ? `${(p * 100).toFixed(2)}%` : p >= 1e-6 ? `${(p * 100).toFixed(4)}%` : `${p.toExponential(1)}`);

const lesson: Lesson = {
  slug: 'source-how-google-authenticator-works',
  title: 'How Authenticator Apps Work (TOTP)',
  blurb: 'A shared secret, the current time, and an HMAC: how six digits that change every 30 seconds are generated and checked without any network connection.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'p1', label: 'Chance one random guess works', icon: 'gauge' },
    { key: 'pn', label: 'Chance within the allowed attempts', icon: 'alert' },
    { key: 'skew', label: 'Clock difference tolerated', icon: 'clock' },
    { key: 'relay', label: 'Phished code stays usable for', icon: 'refresh' },
  ],
  goals: [
    { text: 'What the shared secret is and how it gets onto the phone', step: 2 },
    { text: 'How HMAC and truncation turn a counter into six digits', step: 3 },
    { text: 'How time replaces the counter', step: 4 },
    { text: 'Verification windows, clock drift and replay', step: 5 },
    { text: 'What TOTP does not protect against', step: 6 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'digits', label: 'Code length', min: 6, max: 10, step: 1, default: 6, unit: ' digits', description: 'Number of digits displayed.' },
      { key: 'period', label: 'Time step', min: 15, max: 120, step: 5, default: 30, unit: ' s', description: 'How long each code lasts.' },
      { key: 'win', label: 'Window accepted each side', min: 0, max: 3, step: 1, default: 1, unit: ' steps', description: 'Extra steps before/after the current one the server also accepts, to tolerate clock drift.' },
      { key: 'tries', label: 'Attempts before lockout', min: 1, max: 1000, step: 1, default: 5, unit: '', description: 'Wrong codes allowed before the account is locked or throttled.' },
    ],
    calculate: (input, step) => {
      const digits = Math.round(input.digits ?? 6);
      const period = Math.max(1, input.period ?? 30);
      const win = Math.max(0, Math.round(input.win ?? 1));
      const tries = Math.max(1, Math.round(input.tries ?? 5));
      // The server accepts 2·win + 1 distinct codes, out of 10^digits possible ones.
      const p1 = (2 * win + 1) / Math.pow(10, digits);
      const pn = 1 - Math.pow(1 - p1, tries);
      return {
        p1: step < 4 ? { v: '—' } : { v: `${fmtP(p1)} (1 in ${Math.round(1 / p1).toLocaleString('en-US')})`, tone: p1 < 1e-5 ? 'good' : 'warn' },
        pn: step < 4 ? { v: '—' } : { v: fmtP(pn), tone: pn < 1e-4 ? 'good' : pn < 1e-2 ? 'warn' : 'bad' },
        skew: step < 4 ? { v: '—' } : { v: `±${win * period} s`, tone: win === 0 ? 'warn' : 'good' },
        relay: step < 5 ? { v: '—' } : { v: `up to ${(win + 1) * period} s`, tone: (win + 1) * period <= 60 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Passwords alone are not enough',
      body: [
        'Passwords get phished, reused, guessed and leaked. A <b>second factor</b> adds “something you have”: even with the password, an attacker also needs your device. Texting a code works but depends on the phone network and can be intercepted or SIM-swapped.',
        '<b>TOTP</b> (time-based one-time password, RFC 6238) is the standard behind Google Authenticator, Authy, 1Password and similar apps. It works <b>offline</b>: the phone and the server never talk to each other to produce a code — they just agree on a secret and on the time.',
      ],
      scene: { nodes: [phone({ tag: pill('482 913', 'hash') }), site({ tag: pill('expects the same code', 'check') })], links: [link('phone', 'site', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Secret',
      kind: 'technique',
      title: 'Enrolment: sharing one secret',
      body: [
        'When you turn on 2FA the server generates a random <b>secret</b> (typically 160 bits) and shows it as a <b>QR code</b> encoding an <code>otpauth://totp/…?secret=BASE32…&amp;period=30&amp;digits=6</code> URI. Your app scans it and stores the secret. From now on both sides hold the same key; the server confirms enrolment by asking for one valid code.',
        'This is the only moment the secret travels, so it must be shown once, over TLS. Everything afterwards is local computation. The secret never changes — which makes it the crown jewel on the server side (below).',
      ],
      changes: [{ text: 'Random 160-bit secret, shown once as a QR code', tone: 'info' }],
      scene: { nodes: [site({ tag: pill('generates secret', 'lock') }), phone({ tag: pill('scans QR, stores secret', 'check', 'good') })], links: [link('site', 'phone', { arrow: 'end' })], flows: [flow(['site', 'phone'], { kind: 'handshake', rate: 1 })] },
    },
    {
      short: 'HOTP',
      kind: 'technique',
      title: 'From a counter to six digits: HMAC and truncation',
      body: [
        'The building block is <b>HOTP</b> (RFC 4226): compute <code>HMAC-SHA1(secret, counter)</code>, a 20-byte value that looks random and can’t be predicted without the secret. Then <b>dynamic truncation</b>: use the last nibble as an offset, take 4 bytes from there, clear the top bit to get a 31-bit integer, and take it modulo 10⁶ for six digits.',
        'Same secret and same counter always give the same code; a different counter gives an unrelated one. Seeing past codes reveals nothing about future ones, because HMAC is a one-way keyed function. (SHA-1 inside HMAC remains safe here; SHA-256 and SHA-512 variants exist.)',
      ],
      changes: [{ text: 'code = (truncate(HMAC(secret, counter))) mod 10ᵈ', tone: 'info' }],
      concepts: [{ term: 'HMAC', def: 'A keyed hash: output depends on both a secret key and the message, and cannot be forged without the key.' }],
      scene: { nodes: [box('s', -10, 0, 'secret + counter', 'blue', 'lock', { size: [1.3, 1.3], height: 24 }), box('h', 0, 0, 'HMAC-SHA1', 'orange', 'hash', { size: [1.3, 1.3], height: 26 }), box('t', 10, 0, 'truncate mod 10⁶', 'green', 'gauge', { size: [1.3, 1.3], height: 24, tag: pill('482913', 'hash', 'good') })], links: [link('s', 'h', { arrow: 'end' }), link('h', 't', { arrow: 'end' })], flows: [flow(['s', 'h', 't'], { rate: 1.2 })] },
    },
    {
      short: 'TOTP',
      kind: 'technique',
      title: 'Time becomes the counter',
      body: [
        'HOTP needs both sides to agree on a counter that increments on each use — fragile if they drift apart. <b>TOTP</b> removes the problem by deriving the counter from the clock: <code>counter = ⌊unix_time ÷ 30⌋</code>. Phone and server each compute it from their own clocks and arrive at the same value as long as the clocks agree to within the step.',
        'The code therefore changes every 30 seconds with no communication. The step is a trade-off: shorter limits how long a stolen code is useful but demands tighter clocks and faster typing; 30 s is the common default. At the defaults a random guess has a 3-in-a-million chance per attempt (the server accepts three codes, see next step).',
      ],
      changes: [{ text: 'counter = ⌊time ÷ 30 s⌋', tone: 'info' }, { text: 'Both sides derive it independently', tone: 'good' }],
      scene: { nodes: [box('clk', -10, 0, 'Clock: 1,700,000,010', 'teal', 'clock', { size: [1.4, 1.4], height: 24, tag: pill('counter = 56,666,667', 'hash') }), phone({ name: 'App' }), site()], links: [link('clk', 'phone', { arrow: 'end' })], flows: [flow(['clk', 'phone'], { rate: 1 })] },
    },
    {
      short: 'Verify',
      kind: 'technique',
      title: 'Verification: a window for clock drift',
      body: [
        'Phone clocks drift, and typing takes seconds. So the server checks the submitted code against the current step <b>and ±w neighbouring steps</b> (w = 1 accepts three codes). That tolerates up to ±30 s of difference — at the cost of tripling the guess chance and keeping a code alive for up to <code>(w + 1) × step</code> = 60 s.',
        'Defences on the server: <b>constant-time comparison</b>; <b>reject reuse</b> — remember the last accepted step so the same code can’t be replayed; <b>rate-limit and lock out</b> wrong attempts. With 5 attempts the chance a random guesser succeeds is about 1.5×10⁻⁵ (0.0015%). Without lockout, 10⁶ guesses would break any six-digit code outright.',
      ],
      changes: [{ text: 'Accept current ± w steps', tone: 'info' }, { text: 'Reject reused codes; rate-limit attempts', tone: 'good' }],
      scene: { nodes: [phone({ tag: pill('code from step t', 'hash') }), site({ tag: pill('checks t−1, t, t+1', 'search', 'good') }), attacker({ tag: pill('5 guesses max', 'alert', 'warn') })], links: [link('phone', 'site'), link('att', 'site', { style: 'dashed' })], flows: [flow(['phone', 'site'], { kind: 'handshake', rate: 1 }), flow(['att', 'site'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Weak spots',
      kind: 'problem',
      title: 'What TOTP doesn’t stop',
      body: [
        '<b>Real-time phishing</b>: a fake login page relays your password <i>and</i> your six digits to the real site within the code’s lifetime. TOTP is not phishing-resistant — the window above is how long the stolen code works. <b>Server-side secret theft</b>: the server must store the secret in a form it can use (not hashed), so a database leak exposes every user’s second factor — encrypt secrets with a key held outside the database. <b>Device loss</b> without backup codes locks users out; <b>malware</b> or a cloned backup copies the secret.',
        'Hence the shift to <b>passkeys / WebAuthn</b>: a per-site key pair where the server holds only a public key and the browser checks the site’s origin, so a lookalike domain can’t get a valid response. Keep TOTP as a fallback, and provide recovery codes.',
      ],
      changes: [{ text: 'Real-time phishing relays the code', tone: 'bad' }, { text: 'Secret must be recoverable on the server: encrypt it', tone: 'info' }, { text: 'Passkeys are phishing-resistant', tone: 'good' }],
      scene: { nodes: [phone(), box('fake', -2, 8, 'Phishing site', 'red', 'alert', { size: [1.2, 1.2], height: 22, tag: pill('relays password + code', 'alert', 'bad') }), site()], links: [link('phone', 'fake'), link('fake', 'site')], flows: [flow(['phone', 'fake', 'site'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Design',
      kind: 'insight',
      title: 'Choosing parameters',
      body: [
        'Defaults — 6 digits, 30 s, window ±1, SHA-1 — are what authenticator apps universally support, so changing them breaks compatibility. More digits or a smaller window improve the guess odds but rarely matter if you lock accounts after a handful of failures; the lockout policy, replay rejection and secret storage matter more than the parameters.',
        'Show the secret only at enrolment, require a valid code to finish, issue one-time recovery codes (hashed like passwords), and log failures. The figures above are the model for the guess chance and phishing window under your chosen settings.',
      ],
      scene: { nodes: [box('p1', -8, -4, '6 digits · 30 s · ±1', 'blue', 'check', { size: [1.4, 1.4], height: 24, tag: pill('compatible default', 'check') }), box('p2', 8, -4, 'Lockout + replay check', 'green', 'shield', { size: [1.4, 1.4], height: 26 }), box('p3', 0, 6, 'Encrypted secrets + recovery codes', 'orange', 'lock', { size: [1.4, 1.4], height: 24 })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Shared secret + clock + HMAC',
      body: [
        'TOTP = <code>truncate(HMAC(secret, ⌊time ÷ step⌋)) mod 10ᵈ</code>. A secret shared once by QR code, the current time, and a one-way keyed hash give a code both sides compute offline; the server accepts a small window for drift and must rate-limit and reject replays.',
        'It adds a strong barrier against password theft and guessing but not against real-time phishing, and the server-held secret needs protecting. Prefer passkeys where available; keep TOTP with recovery codes as the fallback.',
      ],
      scene: { nodes: [phone({ tag: pill('482 913', 'hash') }), site({ tag: pill('accepts', 'check', 'good') })], links: [link('phone', 'site')], flows: [flow(['phone', 'site'], { kind: 'handshake', rate: 1 })] },
    },
  ],
};

export default lesson;
