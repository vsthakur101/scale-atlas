import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -18, 0, 'You + master password', 'teal', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const client = (extra: Partial<SceneNode> = {}) => box('client', -9, 0, 'Client app (all crypto happens here)', 'orange', 'lock', { size: [1.6, 1.6], height: 30, ...extra });
const kdf = (extra: Partial<SceneNode> = {}) => box('kdf', -9, 8, 'KDF: PBKDF2 / Argon2 (slow on purpose)', 'purple', 'hash', { size: [1.4, 1.4], height: 24, ...extra });
const server = (extra: Partial<SceneNode> = {}) => db('server', 4, 0, 'Sync server: encrypted vault blob', { size: [1.7, 1.7], ...extra });
const site = (extra: Partial<SceneNode> = {}) => box('site', 4, -9, 'Website (domain checked)', 'blue', 'globe', { size: [1.3, 1.3], height: 22, ...extra });
const attacker = (extra: Partial<SceneNode> = {}) => crowd('attacker', 16, 0, 12, 'attacker with a stolen vault (GPUs)', extra);
const sec = (extra: Partial<SceneNode> = {}) => box('sec', -9, -9, 'Device secret key (optional)', 'green', 'key', { size: [1.2, 1.2], height: 20, ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtLife = (s: number): string => {
  const y = s / 3.156e7;
  if (y >= 1e6) return `10^${Math.round(Math.log10(y))} years`;
  if (y >= 1) return `${y >= 100 ? Math.round(y).toLocaleString('en-US') : y.toFixed(1)} years`;
  const d = s / 86400;
  if (d >= 1) return `${d.toFixed(1)} days`;
  const h = s / 3600;
  if (h >= 1) return `${h.toFixed(1)} hours`;
  return `${Math.max(1, Math.round(s))} s`;
};

const lesson: Lesson = {
  slug: 'source-how-password-managers-work',
  title: 'How Password Managers Work: Zero-Knowledge Vaults and Key Derivation',
  blurb: 'A master password becomes an encryption key through a deliberately slow function, the vault is encrypted on your device, and the server stores only ciphertext. What a stolen vault is worth to an attacker depends on the KDF cost and on the entropy of that one password.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'ent', label: 'Master-password strength', icon: 'key' },
    { key: 'rate', label: 'Attacker guesses per second (after the KDF)', icon: 'gauge' },
    { key: 'crack', label: 'Expected time to guess the master password', icon: 'timer' },
    { key: 'secret', label: 'With a 128-bit device secret key added', icon: 'shield' },
    { key: 'unlock', label: 'Your unlock delay on a phone', icon: 'clock' },
  ],
  goals: [
    { text: 'The problem: too many passwords to remember', step: 1 },
    { text: 'Architecture: a vault encrypted on the device', step: 2 },
    { text: 'Key derivation: turning a password into a key', step: 3 },
    { text: 'Autofill, sharing, sync and recovery', step: 4 },
    { text: 'Threat model: what a breach exposes', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'bits', label: 'Master-password entropy', min: 10, max: 120, step: 0.5, default: 40, unit: ' bits', description: 'A typical human-chosen password is ~30–45 bits; 6 random Diceware words is ~77 bits.' },
      { key: 'iter', label: 'PBKDF2-HMAC-SHA256 iterations', min: 1000, max: 5000000, step: 1000, default: 600000, unit: '', description: 'Work factor of the key-derivation function.' },
      { key: 'hash', label: 'Attacker raw SHA-256 rate per GPU', min: 1e8, max: 1e11, step: 1e8, default: 2e10, unit: ' /s', description: 'Hashes per second on one modern GPU.' },
      { key: 'gpus', label: 'Attacker GPUs', min: 1, max: 100000, step: 1, default: 1000, unit: '', description: 'Parallel cracking hardware.' },
      { key: 'hmem', label: 'Memory-hard KDF slowdown (e.g. Argon2id)', min: 1, max: 10000, step: 1, default: 1, unit: '×', description: '1 = PBKDF2 only; larger = memory-hardness reduces GPU efficiency further.' },
      { key: 'uns', label: 'One KDF iteration on your phone', min: 100, max: 5000, step: 50, default: 500, unit: ' ns', description: 'Per-iteration time on a mobile CPU.' },
    ],
    calculate: (input, step) => {
      const bits = Math.max(1, input.bits ?? 40);
      const iter = Math.max(1, input.iter ?? 6e5);
      const hash = Math.max(1, input.hash ?? 2e10);
      const gpus = Math.max(1, input.gpus ?? 1000);
      const hmem = Math.max(1, input.hmem ?? 1);
      const uns = Math.max(1, input.uns ?? 500) / 1e9;
      // PBKDF2-HMAC-SHA256 costs ~2 hash computations per iteration per guess.
      const rate = (gpus * hash) / (2 * iter * hmem);
      const crack = Math.pow(2, bits - 1) / rate;
      const withSecret = Math.pow(2, bits + 128 - 1) / rate;
      return {
        ent: step < 1 ? { v: '—' } : { v: `${bits.toFixed(1)} bits (${bits < 45 ? 'human-chosen' : bits < 70 ? 'strong' : 'random-passphrase'})`, tone: bits >= 70 ? 'good' : bits >= 55 ? 'warn' : 'bad' },
        rate: step < 3 ? { v: '—' } : { v: `${fmtN(rate)}/s (${fmtN(gpus)} GPUs, ${fmtN(iter)} iterations)`, tone: rate < 1e5 ? 'good' : 'warn' },
        crack: step < 3 ? { v: '—' } : { v: fmtLife(crack), tone: crack > 3.156e7 * 100 ? 'good' : crack > 86400 * 30 ? 'warn' : 'bad' },
        secret: step < 4 ? { v: '—' } : { v: fmtLife(withSecret), tone: 'good' },
        unlock: step < 3 ? { v: '—' } : { v: `${(iter * uns * 1000).toFixed(0)} ms`, tone: iter * uns < 1 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Two bad options: reuse, or forget',
      body: [
        'A person has a hundred accounts. Remembering a unique, random password for each is impossible, so people <b>reuse passwords</b> and choose guessable ones — and when any one site is breached, <b>credential stuffing</b> tries those leaked pairs everywhere else (see the Password Storage lesson). A <b>password manager</b> replaces memory with a <b>vault</b>: it generates a unique random password per site, stores them, and fills them in, so you remember <i>one</i> strong secret.',
        'The design question is where the vault lives and who can read it. Cloud sync is essential (phone, laptop, browser), but a vault stored in plaintext on a server would make the provider a single point of catastrophic failure. The answer used by modern managers (Bitwarden, 1Password, Proton Pass, KeePass-based tools) is a <b>zero-knowledge</b> design: the vault is <b>encrypted on your device</b> with a key derived from your master password, and the server only ever sees ciphertext.',
      ],
      scene: { nodes: [user({ tag: pill('remembers ONE password', 'key') }), client(), server()], links: [link('user', 'client'), link('client', 'server')], flows: [flow(['user', 'client', 'server'], { rate: 1.4 })] },
    },
    {
      short: 'Vault',
      kind: 'technique',
      title: 'A vault encrypted on the device',
      body: [
        'On first use the client generates a random <b>vault key</b> (256-bit) and encrypts every item — logins, notes, cards — with it using an authenticated cipher (AES-256-GCM or XChaCha20-Poly1305), producing the <b>encrypted vault</b> that is synced. The vault key is itself stored <b>wrapped</b> (encrypted) under a key derived from your master password. This two-level design means changing the master password only re-wraps one small key instead of re-encrypting the whole vault, and lets the same vault key be wrapped for several unlock methods (password, biometrics via the device’s secure hardware, a recovery key).',
        'To log in to the <i>service</i> (to download your blob), the client derives a <b>separate authentication value</b> from the master password — through a different derivation path so that what the server sees <b>cannot be used to decrypt</b> the vault — and the server stores only a salted hash of that. The provider therefore cannot read your passwords, cannot be compelled to hand over plaintext, and a database breach yields ciphertext. What it <i>can</i> see: account metadata, vault size, sometimes URLs unless they’re also encrypted (a real difference between products).',
      ],
      changes: [{ text: 'Random vault key encrypts items; vault key wrapped by your master key', tone: 'good' }, { text: 'Auth value ≠ encryption key: the server can’t decrypt', tone: 'good' }, { text: 'Change password = re-wrap one key', tone: 'info' }],
      scene: { nodes: [user(), client({ tag: pill('encrypt items with vault key', 'lock', 'good') }), server({ tag: pill('ciphertext only', 'shield') })], links: [link('user', 'client'), link('client', 'server')], flows: [flow(['client', 'server'], { kind: 'write', rate: 1.4, back: true })] },
    },
    {
      short: 'KDF',
      kind: 'insight',
      title: 'Key derivation: make every guess expensive',
      body: [
        'A password is not a key: it has little entropy and the wrong shape. A <b>key-derivation function</b> (PBKDF2, scrypt, <b>Argon2id</b>) combines it with a random <b>salt</b> and a <b>work factor</b> — hundreds of thousands of hash iterations, or megabytes of memory — to produce the 256-bit master key. It is slow <i>for everyone</i>: 600,000 PBKDF2 iterations at 500 ns each is <b>0.3 seconds</b> on your phone, a fine one-time unlock cost. But an attacker who has stolen the encrypted vault must run it <b>once per guess</b>.',
        'Quantify it: a GPU does ~2×10¹⁰ SHA-256 hashes/s; PBKDF2 needs about two per iteration, so one GPU manages ~16,700 guesses/s — and <b>1,000 GPUs ≈ 16.7 million guesses/s</b>. A human-chosen 40-bit master password (2³⁹ ≈ 5.5×10¹¹ guesses on average) falls in about <b>9 hours</b>. A random 6-word Diceware passphrase (~77 bits) needs 2⁷⁶ ÷ 1.7×10⁷ ≈ <b>140 million years</b>. So the KDF buys a constant factor (here ~10⁶) but <b>the master password’s entropy is what protects you</b>; memory-hard KDFs (Argon2id with tens of MB) additionally defeat GPU/ASIC advantage.',
      ],
      changes: [{ text: '600,000 iterations ≈ 0.3 s for you; 16.7M guesses/s for 1,000 GPUs', tone: 'info' }, { text: '40-bit password: ~9 hours; 77-bit passphrase: ~140 million years', tone: 'bad' }, { text: 'Prefer Argon2id (memory-hard); high iteration counts', tone: 'good' }],
      concepts: [{ term: 'KDF', def: 'A function that stretches a low-entropy secret into a cryptographic key, using a salt and a tunable cost so each guess is expensive for an attacker.' }],
      scene: { nodes: [user({ tag: pill('master password', 'key') }), kdf({ tag: pill('salt + 600,000 iterations', 'timer') }), client({ tag: pill('master key (256-bit)', 'lock', 'good') })], links: [link('user', 'kdf'), link('kdf', 'client')], flows: [flow(['user', 'kdf', 'client'], { kind: 'handshake', rate: 1.2 })] },
    },
    {
      short: 'Use',
      kind: 'technique',
      title: 'Autofill, sharing, sync and recovery',
      body: [
        '<b>Autofill and phishing resistance</b>: the extension or app fills a credential only when the page’s <b>domain matches</b> the saved item (using the public-suffix list), which is why a manager often “refuses” on a look-alike phishing site — a human would have typed the password anyway (the same origin-binding idea behind passkeys). <b>Sharing</b> uses public-key cryptography: each user has a key pair; to share a folder, the owner encrypts the folder’s key to each member’s public key (see the Symmetric vs Asymmetric lesson). <b>Sync</b> is last-writer-wins or per-item merge of encrypted records, so the server never needs plaintext.',
        '<b>Recovery</b> is the awkward corollary of zero-knowledge: if you forget the master password and there is no other key, <b>nobody can recover the vault</b> — not even the provider. Mitigations are explicit: an <b>emergency kit / recovery key</b> you print and store offline, <b>trusted-contact or organisation admin recovery</b> (the admin holds an escrowed wrapped key, which is a deliberate trade of purity for manageability), and biometrics for convenience on devices that already hold the vault key in secure hardware. Some products add a <b>device secret key</b> to the derivation: a random 128-bit value generated on your devices and never sent to the server — making a stolen server vault infeasible to crack <i>regardless</i> of the master password, at the price of needing that secret to add a new device.',
      ],
      changes: [{ text: 'Domain-matched autofill resists phishing', tone: 'good' }, { text: 'Sharing: folder key wrapped to each member’s public key', tone: 'good' }, { text: 'No reset by design: keep a recovery kit; device secret key adds 128 bits', tone: 'info' }],
      scene: { nodes: [client({ tag: pill('fill only on matching domain', 'check', 'good') }), site({ tag: pill('example.com', 'globe') }), sec({ tag: pill('+128 bits', 'key') }), server()], links: [link('client', 'site'), link('client', 'server'), link('sec', 'client', { style: 'dashed' })], flows: [flow(['client', 'site'], { rate: 1.4 }), flow(['client', 'server'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Threats',
      kind: 'tradeoff',
      title: 'What a breach — or malware — actually exposes',
      body: [
        '<b>Provider breach</b>: attackers copy the encrypted vaults (this has happened to real services). They also get account metadata and, if unencrypted, URLs. Now it is an <b>offline attack</b> on each vault’s master password: weak ones fall (the 40-bit example in hours), strong ones don’t — so the breach’s impact is determined <i>by your master password and the KDF settings</i>, not by the provider’s cleverness; old accounts with low iteration counts are the most exposed, so upgrade KDF parameters and rotate high-value passwords after a breach. With a device secret key the guess space gains 128 bits: <b>effectively infinite</b> against this attacker.',
        '<b>Not covered</b>: a keylogger, a compromised browser or an infostealer sees what you type and the decrypted vault while it is unlocked; auto-lock timeouts, hardware keys / passkeys for the manager itself, and separate high-value credentials (use passkeys or TOTP-in-a-different-app for email and financial accounts) limit the blast radius. Choose a manager with <b>open or audited client code</b>, client-side encryption of all fields, strong KDF defaults, MFA on the account, and a breach-response history. Figures here are model outputs with assumed attacker hardware.',
      ],
      changes: [{ text: 'Breach = offline attack: outcome set by master-password entropy and KDF cost', tone: 'info' }, { text: 'Malware on an unlocked device bypasses all of it', tone: 'bad' }, { text: 'Strong passphrase, Argon2id, device secret key, auto-lock, passkeys for critical accounts', tone: 'good' }],
      scene: { nodes: [server({ state: 'hot', tag: pill('stolen vault blob', 'alert', 'warn') }), attacker({ tag: pill('guess master password offline', 'activity', 'bad') }), kdf({ tag: pill('cost per guess', 'timer', 'good') })], links: [link('server', 'attacker', { style: 'dashed' }), link('attacker', 'kdf')], flows: [flow(['attacker', 'kdf'], { kind: 'fail', rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'One strong secret, protected by a slow function and a zero-knowledge design',
      body: [
        'The vault is encrypted <b>on the device</b> with a random vault key wrapped by a key <b>derived from your master password</b> by a slow KDF; the server holds ciphertext and a separate auth hash. A stolen vault must be attacked offline, so <b>master-password entropy dominates</b> (40 bits: hours; 77 bits: ~10⁸ years), with the KDF multiplying the attacker’s cost.',
        'Use a long random passphrase, a strong KDF, a recovery kit, and keep unlocked-device malware in your threat model.',
      ],
      scene: { nodes: [user(), kdf(), client(), server(), site()], links: [link('user', 'kdf'), link('kdf', 'client'), link('client', 'server'), link('client', 'site')], flows: [flow(['user', 'kdf', 'client', 'server'], { rate: 1.4 })] },
    },
  ],
};

export default lesson;
