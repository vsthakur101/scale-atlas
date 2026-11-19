import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -14, 0, 'User', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const srv = (extra: Partial<SceneNode> = {}) => box('srv', -3, 0, 'Login service', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 9, 0, 'User table', { size: [1.4, 1.4], ...extra });
const thief = (extra: Partial<SceneNode> = {}) => box('thief', 9, 8, 'Attacker with a stolen table', 'red', 'alert', { size: [1.2, 1.2], height: 22, ...extra });

const fmtT = (s: number): string => {
  if (s < 1) return '< 1 second';
  if (s < 60) return `${Math.round(s)} seconds`;
  if (s < 3600) return `${(s / 60).toFixed(0)} minutes`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hours`;
  if (s < 86400 * 365) return `${(s / 86400).toFixed(0)} days`;
  const y = s / (86400 * 365);
  return y >= 1e6 ? `${(y / 1e6).toFixed(0)} million years` : y >= 1000 ? `${Math.round(y).toLocaleString('en-US')} years` : `${y.toFixed(0)} years`;
};

const lesson: Lesson = {
  slug: 'source-storing-passwords-safely-a-comprehensive-guide',
  title: 'Storing Passwords Safely',
  blurb: 'Hashing, salting and deliberately slow algorithms: how to make a stolen password table as useless as possible, with the arithmetic of how long cracking takes.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'crack', label: 'Average time to crack one password', icon: 'clock' },
    { key: 'rate', label: 'Attacker guesses per second', icon: 'activity' },
    { key: 'login', label: 'Logins per second per core', icon: 'cpu' },
  ],
  goals: [
    { text: 'Why plaintext and plain encryption are wrong', step: 1 },
    { text: 'What a hash does and why fast hashes fail', step: 2 },
    { text: 'Salting and what it stops', step: 4 },
    { text: 'Slow, memory-hard hashes and the cost arithmetic', step: 5 },
    { text: 'Peppers, upgrades and policy', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'bits', label: 'Password strength', min: 10, max: 80, step: 1, default: 35, unit: ' bits', description: 'Entropy of the password. ~20 bits: common word; ~35: short mixed password; ~60: 4 random words; ~80: long random.' },
      { key: 'ms', label: 'Time to hash one password (defender)', min: 0.01, max: 1000, step: 0.01, default: 100, unit: ' ms', description: 'Cost of one hash on your server. A fast hash is ~0.0001 ms; bcrypt/Argon2 tuned for login is 50–300 ms.' },
      { key: 'speed', label: 'Attacker advantage', min: 1, max: 1000000, step: 1, default: 10000, unit: '×', description: 'How many hashes the attacker computes in parallel relative to one server core (GPUs, many machines).' },
    ],
    calculate: (input, step) => {
      const bits = Math.max(1, input.bits ?? 35);
      const ms = Math.max(0.0001, input.ms ?? 100);
      const speed = Math.max(1, input.speed ?? 1e4);
      const rate = (1000 / ms) * speed;
      // On average the attacker finds it halfway through the search space.
      const seconds = Math.pow(2, bits - 1) / rate;
      const login = 1000 / ms;
      return {
        crack: step < 4 ? { v: '—' } : { v: fmtT(seconds), tone: seconds > 86400 * 365 * 100 ? 'good' : seconds > 86400 * 30 ? 'warn' : 'bad' },
        rate: step < 4 ? { v: '—' } : { v: rate >= 1e9 ? `${(rate / 1e9).toFixed(1)}B/s` : rate >= 1e6 ? `${(rate / 1e6).toFixed(1)}M/s` : `${Math.round(rate).toLocaleString('en-US')}/s` },
        login: step < 4 ? { v: '—' } : { v: login >= 100 ? `${Math.round(login)}` : login.toFixed(1), tone: login >= 5 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Don’t',
      kind: 'problem',
      title: 'Never store the password itself',
      body: [
        'Some day your user table <b>will</b> be copied — SQL injection, a leaked backup, a rogue admin. If it holds plaintext passwords, every account is lost at once, and because people reuse passwords, accounts at <i>other</i> sites too. “Encrypting” the passwords doesn’t help: the key must live somewhere the application (and so an attacker) can reach.',
        'You never need to know the password, only to check whether what a user types <i>matches</i> it. That’s a job for a <b>one-way function</b>: store a value you can compute from the password but cannot reverse.',
      ],
      scene: { nodes: [user({ tag: pill('hunter2', 'lock') }), srv(), store({ state: 'hot', tag: pill('plaintext: all exposed', 'alert', 'bad') })], links: [link('user', 'srv'), link('srv', 'store')], flows: [flow(['user', 'srv', 'store'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Hash',
      kind: 'technique',
      title: 'Hashing: a one-way fingerprint',
      body: [
        'A <b>cryptographic hash</b> (SHA-256…) maps any input to a fixed-size digest; it is deterministic, practically irreversible, and a tiny change gives a completely different output. Store <code>hash(password)</code>; at login hash what was typed and compare.',
        'But general-purpose hashes are designed to be <b>fast</b> — a modern GPU computes billions of SHA-256 or MD5 hashes a second. “Irreversible” doesn’t mean “uncrackable”: attackers don’t reverse the hash, they <b>guess passwords and hash each guess</b> until one matches. Speed is the attacker’s friend.',
      ],
      changes: [{ text: 'Store hash(password), compare at login', tone: 'good' }, { text: 'Fast hash → billions of guesses/s', tone: 'bad' }],
      concepts: [{ term: 'Hash', def: 'A one-way function mapping input to a fixed-size digest; deterministic, hard to invert, and sensitive to every input bit.' }],
      scene: { nodes: [user({ tag: pill('hunter2', 'lock') }), srv({ tag: pill('SHA-256(pw)', 'hash') }), store({ tag: pill('5994471a…', 'hash') })], links: [link('user', 'srv'), link('srv', 'store')], flows: [flow(['user', 'srv', 'store'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Rainbow',
      kind: 'problem',
      title: 'Precomputed tables and identical hashes',
      body: [
        'Without more, two users with the same password have the <b>same hash</b> — one crack exposes every account that shares it, and an attacker can see which accounts share passwords. Worse, they can precompute: hash millions of common passwords once, build a lookup table (or the space-saving <b>rainbow table</b>), and reverse any stolen hash by a simple lookup.',
        'Plain hashing therefore gives almost no protection for common passwords — which is most of them. The leaked-password lists that attackers use are the first thing tried.',
      ],
      changes: [{ text: 'Same password → same hash', tone: 'bad' }, { text: 'One precomputed table breaks every database', tone: 'bad' }],
      scene: { nodes: [thief({ tag: pill('lookup table: 5994471a → hunter2', 'search', 'bad') }), store({ tag: pill('5994471a (×1,203 users)', 'hash', 'warn') })], links: [link('thief', 'store')], flows: [flow(['thief', 'store'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Salt',
      kind: 'technique',
      title: 'Salting: unique input per user',
      body: [
        'A <b>salt</b> is a random value (≥16 bytes) generated per password and stored beside the hash: <code>hash(salt ‖ password)</code>. Identical passwords now produce different hashes, so precomputed tables are useless and every account must be attacked <b>individually</b> — cracking 10,000 accounts costs 10,000 times the work.',
        'The salt isn’t secret (it’s in the database) and doesn’t need to be; its job is uniqueness. Modern password-hashing libraries generate and embed it for you in the stored string (<code>$argon2id$…$salt$hash</code>) — don’t build your own.',
      ],
      changes: [{ text: 'hash(salt ‖ password), salt random per user', tone: 'good' }, { text: 'No shared tables; per-account attack', tone: 'good' }],
      concepts: [{ term: 'Salt', def: 'A unique random value mixed into each password hash so equal passwords hash differently and precomputation fails.' }],
      scene: { nodes: [user(), srv({ tag: pill('random 16-byte salt', 'hash') }), store({ tag: pill('salt + hash, unique per user', 'check', 'good') })], links: [link('user', 'srv'), link('srv', 'store')], flows: [flow(['user', 'srv', 'store'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Slow hash',
      kind: 'technique',
      title: 'Make each guess expensive: bcrypt, scrypt, Argon2',
      body: [
        'Salt stops sharing; it doesn’t stop <i>guessing</i>. So use an algorithm built to be <b>slow and tunable</b>: <b>bcrypt</b> (work factor), <b>scrypt</b> and <b>Argon2id</b> (memory-hard — each hash needs tens of MB, which stops GPUs and ASICs running thousands in parallel). Tune it so one hash takes ~100 ms on your server: affordable for a login, ruinous for a brute-force search.',
        'The arithmetic: a password with 35 bits of entropy has 2³⁵ ≈ 34 billion possibilities, found on average after half. At 100 ms a hash and an attacker with 10,000× your single-core throughput — 100,000 guesses/s — that’s <b>~2 days</b>. With a fast hash at 0.0001 ms the same search takes <b>a fraction of a second</b>. Strength and cost multiply: a 60-bit password under the same slow hash takes about <b>180,000 years</b>.',
      ],
      changes: [{ text: 'Cost per guess × search space = attack time', tone: 'info' }, { text: '35 bits, 100 ms hash, 10,000× attacker ≈ 2 days', tone: 'info' }, { text: 'Fast hash: a fraction of a second', tone: 'bad' }],
      concepts: [{ term: 'Memory-hard', def: 'A function that needs a large amount of memory per evaluation, limiting massively parallel hardware attacks.' }],
      scene: { nodes: [user(), srv({ tag: pill('Argon2id · ~100 ms', 'lock') }), store({ tag: pill('$argon2id$v=19$…', 'hash') }), thief({ tag: pill('100k guesses/s only', 'clock', 'good') })], links: [link('user', 'srv'), link('srv', 'store'), link('thief', 'store', { style: 'dashed' })], flows: [flow(['user', 'srv', 'store'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Pepper',
      kind: 'technique',
      title: 'Peppers and upgrading old hashes',
      body: [
        'A <b>pepper</b> is a secret key kept <i>outside</i> the database (in an HSM or secrets manager), applied by HMAC to the password before hashing. A stolen table is then useless without the pepper too. It helps if the database leaks but the application server doesn’t — and it adds key-rotation work, so treat it as defence in depth, not a substitute for a slow hash.',
        'Algorithms age. Store the parameters with each hash, and <b>re-hash on login</b>: when a user signs in with a correct password under an old or weak setting, recompute with the current one and save it. Accounts that never log in can be forced to reset.',
      ],
      changes: [{ text: 'Pepper: secret outside the DB', tone: 'info' }, { text: 'Rehash on login when parameters are old', tone: 'good' }],
      scene: { nodes: [srv({ tag: pill('HMAC with pepper', 'lock') }), box('vault', 9, -6, 'Secrets manager / HSM', 'purple', 'shield', { size: [1.3, 1.3], height: 26, tag: pill('pepper lives here', 'lock') }), store()], links: [link('srv', 'vault', { style: 'dashed' }), link('srv', 'store')], flows: [flow(['srv', 'store'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Beyond hash',
      kind: 'insight',
      title: 'The hash is only one layer',
      body: [
        'Rate-limit and lock out login attempts so <i>online</i> guessing is slow too; check new passwords against lists of breached ones and reject them (length matters more than composition rules); support <b>MFA</b> and <b>passkeys</b>, which remove the shared secret entirely; and never log or email passwords or send them back in “recovery”.',
        'Capacity: a 100 ms hash means ~10 logins per second per core — budget for it, put the hashing behind a bounded worker pool and protect it from being used as a denial-of-service lever. Figures here are model outputs for illustration; tune parameters to current hardware and OWASP guidance.',
      ],
      changes: [{ text: 'Breached-password check, MFA, passkeys', tone: 'good' }, { text: '100 ms hash → ~10 logins/s/core', tone: 'info' }],
      scene: { nodes: [user(), box('rl', -4, 0, 'Rate limit + MFA', 'orange', 'shield', { size: [1.3, 1.3], height: 26 }), srv(), store()], links: [link('user', 'rl'), link('rl', 'srv'), link('srv', 'store')], flows: [flow(['user', 'rl', 'srv', 'store'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Unique salt, slow memory-hard hash, defence in depth',
      body: [
        'Store only a <b>salted hash from a slow, memory-hard algorithm</b> (Argon2id, scrypt or bcrypt) tuned to ~100 ms; add a pepper if you can; re-hash on login; block breached passwords; rate-limit; offer MFA/passkeys.',
        'Attack time ≈ <code>2^(bits−1) × cost per guess ÷ attacker parallelism</code> — you control the cost per guess, users control the bits, nobody controls the attacker’s hardware. Don’t invent your own scheme.',
      ],
      scene: { nodes: [user(), srv({ tag: pill('Argon2id + salt', 'lock', 'good') }), store({ tag: pill('useless when stolen', 'shield', 'good') })], links: [link('user', 'srv'), link('srv', 'store')], flows: [flow(['user', 'srv', 'store'], { kind: 'write', rate: 1.2 })] },
    },
  ],
};

export default lesson;
