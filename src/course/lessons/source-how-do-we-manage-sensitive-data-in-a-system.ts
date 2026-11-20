import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -18, 0, 'Workload (pod, function, VM)', 'orange', 'server', { size: [1.6, 1.6], height: 28, ...extra });
const idp = (extra: Partial<SceneNode> = {}) => box('idp', -9, -8, 'Workload identity (OIDC token, no password)', 'teal', 'key', { size: [1.4, 1.4], height: 22, ...extra });
const vault = (extra: Partial<SceneNode> = {}) => db('vault', 0, 0, 'Secrets manager (policy, audit, leases)', { size: [1.7, 1.7], ...extra });
const kms = (extra: Partial<SceneNode> = {}) => box('kms', 9, -6, 'KMS / HSM: master (key-encryption) keys', 'purple', 'lock', { size: [1.5, 1.5], height: 26, ...extra });
const data = (extra: Partial<SceneNode> = {}) => db('data', 9, 7, 'Encrypted data (each object with its own data key)', { size: [1.6, 1.6], ...extra });
const leak = (extra: Partial<SceneNode> = {}) => box('leak', -9, 9, 'Leaked credential (git, logs, image)', 'red', 'alert', { size: [1.4, 1.4], height: 22, ...extra });
const dbs = (extra: Partial<SceneNode> = {}) => db('dbs', 17, 0, 'Database (short-lived credentials)', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtD = (n: number): string => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(2)}`);
const fmtDur = (days: number): string => (days >= 1 ? `${days.toFixed(1)} days` : days * 24 >= 1 ? `${(days * 24).toFixed(1)} hours` : `${Math.round(days * 24 * 60)} min`);

const lesson: Lesson = {
  slug: 'source-how-do-we-manage-sensitive-data-in-a-system',
  title: 'Secrets and Sensitive Data: Identity, Rotation, Envelope Encryption and KMS Cost',
  blurb: 'Keep credentials out of code, hand workloads identities instead of passwords, issue short-lived dynamic secrets, and protect data with envelope encryption — with the exposure-window arithmetic of rotation and the KMS request cost that data-key caching removes.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'static', label: 'Exposure window of a leaked static, never-rotated secret', icon: 'alert' },
    { key: 'rot', label: 'Same leak with scheduled rotation', icon: 'refresh' },
    { key: 'dyn', label: 'Same leak with short-lived dynamic credentials', icon: 'timer' },
    { key: 'kms', label: 'KMS calls per day and cost: every read vs cached data keys', icon: 'dollar' },
  ],
  goals: [
    { text: 'Where secrets leak, and what counts as sensitive', step: 1 },
    { text: 'Secrets managers and workload identity', step: 2 },
    { text: 'Rotation and dynamic, short-lived credentials', step: 3 },
    { text: 'Envelope encryption and the KMS', step: 4 },
    { text: 'Classification, tokenisation and incident response', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'det', label: 'Time to notice and revoke a leaked secret', min: 0.01, max: 365, step: 0.01, default: 30, unit: ' days', description: 'Average delay between leak and revocation.' },
      { key: 'rot', label: 'Rotation interval', min: 0.1, max: 365, step: 0.1, default: 90, unit: ' days', description: 'How often the secret is replaced on a schedule.' },
      { key: 'ttl', label: 'Dynamic credential lifetime', min: 1, max: 1440, step: 1, default: 60, unit: ' min', description: 'Lease/TTL of a short-lived credential.' },
      { key: 'reads', label: 'Reads of encrypted objects per second', min: 1, max: 1000000, step: 1, default: 50000, unit: '/s', description: 'Each needs its data key decrypted.' },
      { key: 'hit', label: 'Data-key cache hit ratio', min: 0, max: 99.99, step: 0.01, default: 99, unit: '%', description: 'Reads using a cached plaintext data key (in memory, with a short TTL).' },
      { key: 'price', label: 'KMS price per 10,000 requests', min: 0.001, max: 1, step: 0.001, default: 0.03, unit: ' $', description: 'Illustrative provider rate.' },
    ],
    calculate: (input, step) => {
      const det = Math.max(0.0001, input.det ?? 30);
      const rot = Math.max(0.01, input.rot ?? 90);
      const ttl = Math.max(0.0001, (input.ttl ?? 60) / 1440);
      const reads = Math.max(1, input.reads ?? 5e4);
      const hit = Math.min(0.99999, Math.max(0, (input.hit ?? 99) / 100));
      const price = Math.max(0, input.price ?? 0.03);
      // A leak lands at a uniformly random point in the rotation cycle and ends at revocation or the next rotation, whichever is first: E[min(D, U)] = D − D²/(2I) for D ≤ I.
      const rotWindow = det <= rot ? det - (det * det) / (2 * rot) : rot / 2;
      // Dynamic credentials expire on their own within the TTL; a random leak sees on average half of it.
      const dynWindow = Math.min(det, ttl / 2);
      const callsDay = reads * 86400;
      const cached = callsDay * (1 - hit);
      return {
        static: step < 3 ? { v: '—' } : { v: `${fmtDur(det)} (until someone notices and revokes it)`, tone: 'bad' },
        rot: step < 3 ? { v: '—' } : { v: `${fmtDur(rotWindow)} (rotated every ${rot} days)`, tone: rotWindow < det * 0.9 ? 'warn' : 'bad' },
        dyn: step < 3 ? { v: '—' } : { v: `${fmtDur(dynWindow)} on average (≤ ${Math.round(ttl * 1440)} min lease)`, tone: 'good' },
        kms: step < 4 ? { v: '—' } : { v: `${fmtN(callsDay)} calls = ${fmtD((callsDay / 1e4) * price)}/day → ${fmtN(cached)} calls = ${fmtD((cached / 1e4) * price)}/day cached`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Leaks',
      kind: 'problem',
      title: 'Where secrets leak, and what “sensitive” means',
      body: [
        'A <b>secret</b> is a credential that proves authority: passwords, API keys, database URLs with passwords, signing keys, OAuth client secrets, TLS private keys, tokens. They leak in boringly predictable places: <b>committed to git</b> (and living forever in history, even after “removing” the file; public repos are scanned by bots within seconds), baked into <b>container images and build artefacts</b>, written to <b>logs</b> and error messages, exposed in <b>environment dumps</b> and crash reports, pasted into chat and tickets, stored in <b>CI variables</b> readable by every job, or left in client-side code and mobile apps where anyone can extract them.',
        '<b>Sensitive data</b> is a wider category: personal data (names, emails, health, financial), regulated data (PCI card numbers, HIPAA, GDPR personal data), and business secrets. The two connect: a leaked database credential becomes a leak of the sensitive data it guards. Principles that recur through the lesson: <b>don’t store what you don’t need</b>, keep secrets <b>out of code</b>, give each workload <b>least privilege</b>, make credentials <b>short-lived and revocable</b>, <b>encrypt</b> sensitive data at rest and in transit, and <b>audit</b> every access.',
      ],
      scene: { nodes: [app({ tag: pill('DB_PASSWORD in an env var', 'alert', 'warn') }), leak({ tag: pill('pushed to a public repo', 'alert', 'bad') }), vault(), data()], links: [link('app', 'vault'), link('leak', 'data', { style: 'dashed' })], flows: [flow(['leak', 'data'], { kind: 'fail', rate: 1.4 })] },
    },
    {
      short: 'Manager',
      kind: 'technique',
      title: 'A secrets manager, and identity instead of a bootstrap password',
      body: [
        'Store secrets in a purpose-built <b>secrets manager</b> (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, SOPS-encrypted files in git): encrypted at rest, with <b>access policies per secret</b>, <b>versioning</b>, and a full <b>audit log</b> of who read what and when. Applications fetch secrets at start-up or on demand — as an injected file (a mounted volume or tmpfs; avoid environment variables where processes can dump them), through a sidecar/agent that renews them, or via the CSI driver / external-secrets operator in Kubernetes. Never log them, never pass them on command lines (visible in <code>ps</code>).',
        'The chicken-and-egg problem — the app needs a credential to fetch credentials — is solved by <b>workload identity</b>: the platform issues each workload a <b>signed, short-lived identity token</b> (a Kubernetes service-account JWT, an AWS IAM role via instance metadata/IRSA, a cloud-provider OIDC token, SPIFFE SVIDs; see the SSO and Service Mesh lessons) that the secrets manager verifies and maps to a policy. There is <b>no long-lived password to leak</b>: the identity is bound to the running workload and expires in minutes. Prefer this to “IAM user with an access key in the config”, and prefer <b>keyless</b> integrations (OIDC federation from CI to the cloud) to stored deploy keys.',
      ],
      changes: [{ text: 'Secrets manager: encrypted, policy per secret, versions, audit log', tone: 'good' }, { text: 'Inject as files, not env vars or command lines; never log', tone: 'good' }, { text: 'Workload identity (OIDC, IAM roles, SPIFFE) removes the bootstrap password', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('presents identity token', 'key') }), idp({ tag: pill('signed, expires in minutes', 'timer', 'good') }), vault({ tag: pill('policy: app-x may read db/cred', 'shield', 'good') })], links: [link('app', 'idp'), link('app', 'vault'), link('idp', 'vault', { style: 'dashed' })], flows: [flow(['app', 'idp'], { kind: 'handshake', rate: 1.2, back: true }), flow(['app', 'vault'], { rate: 1.4, back: true })] },
    },
    {
      short: 'Rotate',
      kind: 'insight',
      title: 'Rotation and dynamic credentials shrink the exposure window',
      body: [
        'Assume secrets <b>will</b> leak; the question is how long a leaked one stays useful. A <b>static, never-rotated</b> secret is valid until someone notices — averaging, say, <b>30 days</b> of exposure. <b>Scheduled rotation</b> bounds it: a leak lands at a random point in the cycle and ends at revocation <i>or</i> the next rotation, whichever comes first, so the expected window with a 30-day detection time and 90-day rotation is 30 − 30² ÷ (2 × 90) = <b>25 days</b> — a modest gain, because detection, not rotation, dominates. Rotation also takes engineering discipline (two valid versions during the changeover, consumers reload without restart, rotations tested before the emergency).',
        '<b>Dynamic secrets</b> change the picture: the secrets manager <b>mints a unique credential on demand</b> — a database user created for this pod with a <b>60-minute lease</b> (Vault database engine, AWS STS, cloud IAM tokens) — and revokes it at expiry. A leaked dynamic credential is worthless after its TTL: exposure averages <b>30 minutes</b> — 1,400× shorter than 30 days — and every credential is attributable to one workload in the audit log. Cost: the manager is now a <b>critical dependency</b> (cache, renew ahead of expiry, run it highly available) and applications must handle renewal and re-connection. Use dynamic or short-lived credentials wherever the target system supports them; rotate the remaining static ones automatically.',
      ],
      changes: [{ text: 'Static, unrotated: 30 days of exposure on average', tone: 'bad' }, { text: '90-day rotation: ~25 days — detection time dominates', tone: 'info' }, { text: '60-minute dynamic credential: ~30 minutes, attributable per workload', tone: 'good' }],
      concepts: [{ term: 'Dynamic secret', def: 'A credential generated on demand for a single consumer with a short lease and revoked automatically at expiry.' }],
      scene: { nodes: [app({ tag: pill('lease 60 min, auto-renew', 'timer') }), vault({ tag: pill('mint user app-x-9f2 · revoke at expiry', 'refresh', 'good') }), dbs({ tag: pill('temporary role', 'lock') }), leak({ tag: pill('stolen: dead in ≤ 60 min', 'check', 'good') })], links: [link('app', 'vault'), link('vault', 'dbs'), link('leak', 'dbs', { style: 'broken' })], flows: [flow(['app', 'vault', 'dbs'], { rate: 1.4 })] },
    },
    {
      short: 'Envelope',
      kind: 'technique',
      title: 'Envelope encryption and the KMS',
      body: [
        'Encrypting data with a single master key would mean sending every byte to the key service (impossible at scale) or exposing the master key. <b>Envelope encryption</b> uses two key levels: a <b>key-encryption key (KEK/CMK)</b> held in a <b>KMS or HSM</b> (AWS KMS, Cloud KMS, Azure Key Vault, HashiCorp, hardware modules) that <i>never leaves</i> the service, and many <b>data-encryption keys (DEKs)</b> — one per object, file, row group or tenant — generated locally. The application encrypts the data with a fresh DEK (AES-256-GCM), asks the KMS to <b>wrap</b> (encrypt) the DEK under the KEK, and stores the wrapped DEK next to the ciphertext. To read, it sends the wrapped DEK to KMS to <b>unwrap</b>, then decrypts locally (see the Symmetric vs Asymmetric lesson for why bulk data uses symmetric keys). Key policies, grants and audit logs control and record who may use which KEK; <b>rotating the KEK</b> re-wraps DEKs without re-encrypting data.',
        'KMS calls become the bottleneck and the bill: 50,000 reads/s × 86,400 s = 4.3 billion unwrap calls a day, at $0.03 per 10,000 ≈ <b>$12,960 a day</b> — and provider rate limits (thousands to tens of thousands of calls/s) would throttle you first. The fix is a <b>data-key cache</b>: keep recently unwrapped DEKs in memory for a short TTL (and cap uses per key), so a 99% hit ratio cuts calls to 43 million a day and the cost to <b>$130 a day</b> — a 100× saving, traded against holding plaintext keys briefly in process memory. Use the provider’s encryption SDK (it implements caching safely), <b>encryption context</b> bound to the tenant/object so a wrapped key can’t be used elsewhere, and per-tenant KEKs where tenants need cryptographic isolation or “bring your own key”.',
      ],
      changes: [{ text: 'KEK in KMS/HSM never leaves; per-object DEKs wrapped under it', tone: 'good' }, { text: '50k reads/s × 86,400 s uncached = 4.3B calls ≈ $12,960/day', tone: 'bad' }, { text: '99% DEK cache: 43M calls ≈ $130/day; use encryption context', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('encrypt with DEK; cache unwrapped DEKs', 'lock', 'good') }), kms({ tag: pill('wrap / unwrap DEK', 'key') }), data({ tag: pill('ciphertext + wrapped DEK', 'disk') }), vault()], links: [link('app', 'kms'), link('app', 'data'), link('kms', 'vault', { style: 'dashed' })], flows: [flow(['app', 'kms'], { kind: 'handshake', rate: 0.8, back: true }), flow(['app', 'data'], { kind: 'write', rate: 1.8 })] },
    },
    {
      short: 'Response',
      kind: 'tradeoff',
      title: 'Classification, tokenisation and incident response',
      body: [
        '<b>Classify data</b> (public / internal / confidential / regulated) and apply controls by class: encrypt confidential data at rest and in transit, restrict and log access to regulated fields, <b>mask or tokenise</b> where full values aren’t needed. <b>Tokenisation</b> replaces a card or ID number with a random token whose mapping lives in a hardened vault (see the Mobile Wallets lesson) — systems that handle only tokens fall out of compliance scope and a breach exposes nothing usable; <b>field-level encryption</b> protects specific columns even from DBAs; <b>hashing with a salt</b> suits values you only compare (see the Password Storage lesson). Minimise collection and retention (delete on schedule), keep data out of logs and analytics, and separate production data from dev/test (use synthetic or masked copies).',
        '<b>When a secret leaks</b>: assume compromise, <b>revoke and rotate first</b> (invalidate the credential, then replace it), then investigate — audit logs show what the credential accessed; <b>removing it from git history does not un-leak it</b>. Automate prevention: <b>pre-commit and CI secret scanners</b> (gitleaks, trufflehog, GitHub secret scanning with push protection), scanning of images and logs, <b>canary tokens</b> that alert on use, and tight CI permissions. Rehearse the runbook: who can rotate the database password at 3 am without an outage? Figures here are model outputs with illustrative detection times, intervals and prices.',
      ],
      changes: [{ text: 'Classify; tokenise or field-encrypt regulated data; minimise and expire', tone: 'good' }, { text: 'Leak: revoke and rotate first, then investigate with audit logs', tone: 'good' }, { text: 'Push protection, secret scanning, canary tokens; rehearse rotation', tone: 'good' }],
      scene: { nodes: [leak({ tag: pill('scanner: key in commit', 'search', 'good') }), vault({ tag: pill('revoke → rotate', 'refresh', 'good') }), app({ tag: pill('reloads new secret', 'check') }), data({ tag: pill('tokenised fields', 'lock') })], links: [link('leak', 'vault'), link('vault', 'app'), link('app', 'data')], flows: [flow(['leak', 'vault', 'app'], { kind: 'handshake', rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'No static secrets in code; short lifetimes; wrap keys, cache them',
      body: [
        'Keep secrets in a <b>manager</b>, give workloads <b>identities</b>, prefer <b>dynamic short-lived credentials</b> (a 60-minute lease cuts a leak from 30 days of exposure to ~30 minutes), and use <b>envelope encryption</b> with cached data keys (KMS cost $12,960 → $130 a day here).',
        'Classify and tokenise sensitive data, scan for leaks, and rehearse revoke-and-rotate.',
      ],
      scene: { nodes: [app(), idp(), vault(), kms(), data(), dbs()], links: [link('app', 'idp'), link('app', 'vault'), link('vault', 'dbs'), link('app', 'kms'), link('app', 'data')], flows: [flow(['app', 'vault', 'dbs'], { rate: 1.4 })] },
    },
  ],
};

export default lesson;
