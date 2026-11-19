import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill, you } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => you('you', -12, 1, { label: pill('patient', 'user'), ...extra });
const eve = (extra: Partial<SceneNode> = {}) => box('eve', -8, 8, 'Café Wi-Fi', 'red', 'wifi', { size: [1.2, 1.2], height: 28, ...extra });
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -4, 0, 'Edge', 'orange', 'route', { size: [1.3, 1.3], height: 36, ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', 3, 0, 'Clinic app', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const records = (extra: Partial<SceneNode> = {}) => db('db', 10, 0, 'Records DB', extra);
const kms = (extra: Partial<SceneNode> = {}) => box('kms', 10, -9, 'KMS', 'yellow', 'key', { size: [1.3, 1.3], height: 34, sub: 'master keys', ...extra });
const vault = (extra: Partial<SceneNode> = {}) => box('vault', 3, -9, 'Secrets', 'purple', 'lock', { size: [1.3, 1.3], height: 34, sub: 'manager', ...extra });
const repo = (extra: Partial<SceneNode> = {}) => disk('repo', -4, -9, 'git repo', { tone: 'grey', icon: 'file', size: [1.6, 1.2], height: 18, ...extra });

const path = [link('you', 'lb'), link('lb', 'app'), link('app', 'db', { arrow: 'both' })];
const traffic = [flow(['you', 'lb', 'app', 'db'], { back: true, rate: 1.2 })];

const lesson: Lesson = {
  slug: 'encryption',
  title: 'Encryption & Secrets',
  blurb: 'Protect data on the wire and at rest, manage the keys that protect it, and keep credentials out of code.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'wire', label: 'In transit', icon: 'wifi' },
    { key: 'rest', label: 'At rest', icon: 'disk' },
    { key: 'keys', label: 'Key handling', icon: 'key' },
    { key: 'secrets', label: 'Secrets', icon: 'lock' },
  ],
  goals: [
    { text: 'What TLS protects and how', step: 2 },
    { text: 'Encrypting internal traffic with mTLS', step: 3 },
    { text: 'What disk encryption does and doesn’t stop', step: 4 },
    { text: 'Envelope encryption and key management', step: 5 },
    { text: 'Keeping and rotating secrets safely', step: 8 },
  ],
  legend: ['request', 'response', 'fail', 'write', 'handshake'],
  steps: [
    {
      short: 'Plaintext',
      kind: 'problem',
      title: 'Anyone on the café Wi-Fi can read it',
      body: [
        'An early version of a clinic’s patient portal served plain HTTP. Every request — including session cookies and appointment details — crossed the café Wi-Fi, the ISP and a dozen routers as readable text. Anyone on the path could read or modify it.',
      ],
      changes: [{ text: 'Cookies + health data in cleartext', tone: 'bad' }],
      scene: {
        nodes: [client(), eve({ state: 'hot', tag: pill('reading everything', 'search', 'bad') }), lb(), app(), records()],
        links: [...path, link('you', 'eve', { style: 'dashed' })],
        flows: [...traffic, flow(['you', 'eve'], { kind: 'fail', rate: 1 })],
        metrics: { wire: { v: 'plaintext', tone: 'bad' }, rest: 'plaintext', keys: '—', secrets: '—' },
      },
    },
    {
      short: 'TLS',
      kind: 'technique',
      title: 'TLS: confidentiality, integrity, identity',
      body: [
        '<b>TLS</b> gives three things: the traffic is <b>encrypted</b>, it’s <b>tamper-evident</b>, and the browser knows it’s talking to the real server because the server proves possession of a key matching a <b>certificate</b> signed by a trusted authority.',
        'Modern TLS negotiates fresh session keys with an ephemeral Diffie-Hellman exchange, giving <b>forward secrecy</b>: stealing the server’s key later doesn’t decrypt recorded traffic. Automate certificate issuance and renewal (ACME) so expiry never becomes an outage, and send HSTS so browsers refuse plain HTTP.',
      ],
      changes: [{ text: 'HTTPS + HSTS', tone: 'good' }, { text: 'Certs auto-renewed', tone: 'good' }],
      concepts: [
        { term: 'TLS', def: 'Transport Layer Security: protocol providing encrypted, authenticated, integrity-protected connections.' },
        { term: 'Forward secrecy', def: 'Session keys can’t be recovered from a later-compromised long-term key, because they come from ephemeral key exchange.' },
      ],
      scene: {
        nodes: [client({ tag: pill('TLS 1.3', 'lock', 'good') }), eve({ tag: pill('sees only ciphertext', 'x', 'good') }), lb({ tag: pill('cert auto-renewed', 'refresh') }), app(), records()],
        links: [link('you', 'lb', { label: pill('TLS', 'lock') }), link('lb', 'app'), link('app', 'db', { arrow: 'both' }), link('you', 'eve', { style: 'dashed' })],
        flows: [flow(['you', 'lb'], { kind: 'handshake', back: true, rate: 0.5 }), ...traffic],
        metrics: { wire: { v: 'TLS to edge', tone: 'good' }, rest: 'plaintext', keys: 'cert keys', secrets: '—' },
      },
    },
    {
      short: 'Inside',
      kind: 'technique',
      title: 'And inside the network too',
      body: [
        'TLS ends at the edge load balancer; from there to the app and database, traffic is plain text “because it’s our network”. But networks get misconfigured, cloud tenancy is shared, and an attacker who gains one foothold can read everything flowing past.',
        'Encrypt internal hops as well — ideally <b>mutual TLS</b> between services, so each side also proves its identity. Service meshes and managed databases make this close to free.',
      ],
      changes: [{ text: 'Edge → app → DB: mTLS', tone: 'good' }],
      concepts: [{ term: 'Zero trust networking', def: 'Treating the internal network as untrusted: authenticate and encrypt every connection.' }],
      scene: {
        nodes: [client(), lb(), app({ tag: pill('mTLS everywhere', 'shield', 'good') }), records()],
        links: [link('you', 'lb', { label: pill('TLS', 'lock') }), link('lb', 'app', { label: pill('mTLS', 'lock') }), link('app', 'db', { arrow: 'both', label: pill('TLS', 'lock') })],
        flows: traffic,
        metrics: { wire: { v: 'encrypted end to end', tone: 'good' }, rest: 'plaintext', keys: 'cert keys', secrets: '—' },
      },
    },
    {
      short: 'At rest',
      kind: 'insight',
      title: 'Disk encryption: what it does and doesn’t stop',
      body: [
        'Turning on storage encryption for the database volume and backups means a stolen disk, a discarded drive or a misplaced backup tape is unreadable. Cloud providers do it with a checkbox; do it everywhere.',
        'But the database decrypts transparently for anyone who can query it. An SQL injection, a stolen app credential or an over-privileged employee reads plaintext as usual. Disk encryption is a floor, not a wall.',
      ],
      changes: [{ text: 'Volumes + backups encrypted', tone: 'good' }, { text: 'App-level breach: unchanged', tone: 'bad' }],
      concepts: [{ term: 'Encryption at rest', def: 'Encrypting stored data (disks, files, backups) so it’s unreadable without keys if the media is taken.' }],
      scene: {
        nodes: [client(), lb(), app({ tag: pill('reads plaintext', 'file', 'warn') }), records({ tag: pill('volume: AES-256', 'lock', 'good') }), disk('backup', 10, 8, 'backups', { tone: 'grey', icon: 'lock', tag: pill('encrypted', 'lock', 'good') })],
        links: [...path, link('db', 'backup')],
        flows: [...traffic, flow(['db', 'backup'], { kind: 'write', rate: 0.4 })],
        metrics: { wire: 'encrypted', rest: { v: 'disk-level', tone: 'good' }, keys: 'provider-managed', secrets: '—' },
      },
    },
    {
      short: 'Envelope',
      kind: 'technique',
      title: 'Envelope encryption with a key service',
      body: [
        'For the most sensitive fields — diagnoses, national IDs — encrypt in the application. But where do keys live? Not next to the data. A <b>key management service</b> (cloud KMS or an HSM) holds master keys that never leave it.',
        'The app asks the KMS for a <b>data key</b>, encrypts the record with it locally, and stores the record alongside the data key <i>wrapped</i> (encrypted) by the master key. To read, it asks the KMS to unwrap the data key. The KMS sees only small keys, logs every use, and lets you revoke or rotate master keys centrally.',
      ],
      changes: [{ text: 'Field-level encryption', tone: 'good' }, { text: 'Master key never leaves KMS', tone: 'good' }],
      concepts: [
        { term: 'Envelope encryption', def: 'Encrypting data with a data key, then encrypting (wrapping) that key with a master key held in a KMS.' },
        { term: 'KMS', def: 'Key Management Service: a hardened service that stores master keys and performs key operations with access control and audit.' },
      ],
      scene: {
        nodes: [client(), lb(), app({ tag: pill('encrypt(diagnosis, dk)', 'lock', 'good') }), records({ tag: pill('ciphertext + wrapped dk', 'lock', 'good') }), kms({ tag: pill('unwrap(dk) · audited', 'key', 'good') })],
        links: [...path, link('app', 'kms', { arrow: 'both', label: pill('wrap / unwrap') })],
        flows: [...traffic, flow(['app', 'kms'], { kind: 'handshake', back: true, rate: 0.6 })],
        metrics: { wire: 'encrypted', rest: { v: 'field-level', tone: 'good' }, keys: { v: 'KMS + audit', tone: 'good' }, secrets: '—' },
      },
    },
    {
      short: 'Rotation',
      kind: 'technique',
      title: 'Rotate keys without re-encrypting everything',
      body: [
        'Keys should be rotated on a schedule and immediately after any suspected exposure. With envelope encryption, rotating the master key only means re-wrapping the small data keys, not re-encrypting terabytes of records. Tag each ciphertext with the key version that protected it so old and new can coexist during rotation.',
        'Crypto-shredding falls out for free: destroy the key for one patient’s records and the data is unrecoverable everywhere, backups included.',
      ],
      concepts: [{ term: 'Crypto-shredding', def: 'Making data unrecoverable by destroying the keys that encrypt it.' }],
      scene: {
        nodes: [client(), lb(), app(), records({ tag: pill('key v7 → v8: re-wrap 12k keys', 'refresh', 'good') }), kms({ tag: pill('master v8 active', 'key') })],
        links: [...path, link('app', 'kms', { arrow: 'both' })],
        flows: [flow(['app', 'kms'], { kind: 'handshake', back: true, rate: 1.5 }), flow(['app', 'db'], { kind: 'write', rate: 1 })],
        metrics: { wire: 'encrypted', rest: 'field-level', keys: { v: 'rotated yearly', tone: 'good' }, secrets: '—' },
      },
    },
    {
      short: 'Leaked key',
      kind: 'case',
      title: 'Case: a database password in git',
      body: [
        'A developer commits a config file with the production database password to a repository. It’s removed in the next commit — but it’s still in history, in every clone, in the CI cache, and was scraped by a bot within minutes of a brief accidental public push.',
        'Assume any secret that touched source control is compromised: <b>rotate it immediately</b>, then fix the process. Scan commits for secrets in CI and pre-commit hooks, and stop putting secrets in files at all.',
      ],
      changes: [{ text: 'DB password in commit a91f…', tone: 'bad' }, { text: 'Rotated within 20 min', tone: 'good' }],
      scene: {
        nodes: [client(), lb(), app(), records({ tag: pill('password rotated', 'refresh', 'good') }), repo({ state: 'hot', tag: pill('DB_PASSWORD=… (history)', 'alert', 'bad') }), box('bot', -12, -9, 'Scraper bot', 'red', 'search', { size: [1.1, 1.1], height: 26 })],
        links: [...path, link('bot', 'repo', { style: 'dashed' })],
        flows: [...traffic, flow(['bot', 'repo'], { kind: 'fail', rate: 0.8 })],
        metrics: { wire: 'encrypted', rest: 'field-level', keys: 'KMS', secrets: { v: 'leaked → rotated', tone: 'bad' } },
      },
    },
    {
      short: 'Secret store',
      kind: 'technique',
      title: 'Secrets from a manager, short-lived where possible',
      body: [
        'Store secrets in a <b>secrets manager</b> with access control and audit. The platform grants each service an identity, and the service fetches only the secrets it’s allowed at startup (or has them injected), never baked into images or repos.',
        'Better still, use <b>dynamic credentials</b>: the secrets manager creates a database user valid for one hour for this instance, then deletes it. A leaked credential expires before it’s useful, and you can tell exactly which instance used it.',
      ],
      changes: [{ text: 'No secrets in code or images', tone: 'good' }, { text: 'DB creds: 1 h TTL, per instance', tone: 'good' }],
      concepts: [
        { term: 'Secrets manager', def: 'A service that stores, access-controls, audits and rotates credentials, API keys and certificates.' },
        { term: 'Dynamic secrets', def: 'Credentials generated on demand with a short lifetime, unique to each consumer.' },
      ],
      scene: {
        nodes: [client(), lb(), app({ tag: pill('identity: clinic-app', 'key') }), records({ tag: pill('user app_7f2 (exp 1 h)', 'timer', 'good') }), vault({ tag: pill('issue DB creds · 1 h', 'lock', 'good') }), repo({ tag: pill('no secrets', 'check', 'good') })],
        links: [...path, link('app', 'vault', { arrow: 'both' }), link('vault', 'db', { style: 'dashed' })],
        flows: [...traffic, flow(['app', 'vault'], { kind: 'handshake', back: true, rate: 0.5 }), flow(['vault', 'db'], { kind: 'write', rate: 0.3 })],
        metrics: { wire: 'encrypted', rest: 'field-level', keys: 'KMS', secrets: { v: 'dynamic, audited', tone: 'good' } },
      },
    },
    {
      short: 'Hash ≠ encrypt',
      kind: 'insight',
      title: 'Hashing, encrypting, encoding',
      body: [
        'Three different tools, often confused. <b>Encoding</b> (Base64, URL encoding) changes representation and is reversible by anyone — it protects nothing. <b>Encryption</b> is reversible with a key — for data you need to read back. <b>Hashing</b> is one-way — for passwords (slow, salted) and integrity checks.',
        'And never invent your own crypto. Use well-reviewed libraries’ high-level APIs (authenticated encryption such as AES-GCM or ChaCha20-Poly1305) with their defaults.',
      ],
      scene: {
        nodes: [
          box('enc', -7, 0, 'Encode', 'grey', 'file', { size: [1.4, 1.4], height: 32, tag: pill('anyone can reverse', 'x', 'bad') }),
          box('cry', 0, 0, 'Encrypt', 'blue', 'lock', { size: [1.4, 1.4], height: 32, tag: pill('reverse with key', 'key', 'good') }),
          box('hash', 7, 0, 'Hash', 'purple', 'hash', { size: [1.4, 1.4], height: 32, tag: pill('one-way', 'arrowRight', 'good') }),
        ],
        metrics: { wire: 'encrypted', rest: 'field-level', keys: 'KMS', secrets: 'dynamic' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Encrypt everywhere, guard the keys',
      body: [
        'Use <b>TLS</b> on every hop — including internal ones, ideally with mutual authentication — and automate certificates. Encrypt storage and backups as a baseline, and the most sensitive fields in the application with <b>envelope encryption</b> backed by a <b>KMS</b>.',
        'Rotate keys, keep secrets in a <b>secrets manager</b> (short-lived where possible), scan for leaks, and rotate anything that ever touched a repository.',
      ],
      scene: {
        nodes: [client(), lb(), app(), records({ tag: pill('encrypted fields', 'lock', 'good') }), kms(), vault(), repo({ tag: pill('scanned', 'check', 'good') })],
        links: [link('you', 'lb', { label: pill('TLS', 'lock') }), link('lb', 'app', { label: pill('mTLS', 'lock') }), link('app', 'db', { arrow: 'both' }), link('app', 'kms', { arrow: 'both' }), link('app', 'vault', { arrow: 'both' })],
        flows: [...traffic, flow(['app', 'kms'], { kind: 'handshake', back: true, rate: 0.5 })],
        metrics: { wire: 'encrypted', rest: 'field-level', keys: 'KMS + rotation', secrets: 'dynamic' },
      },
    },
  ],
};

export default lesson;
