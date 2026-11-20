import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const signer = (extra: Partial<SceneNode> = {}) => box('signer', -14, 0, 'Signer', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const hash = (extra: Partial<SceneNode> = {}) => box('hash', -7, 0, 'Hash(message)', 'orange', 'hash', { size: [1.2, 1.2], height: 22, ...extra });
const sign = (extra: Partial<SceneNode> = {}) => box('sign', 0, 0, 'Sign with private key', 'purple', 'lock', { size: [1.3, 1.3], height: 26, ...extra });
const verify = (extra: Partial<SceneNode> = {}) => box('verify', 8, 0, 'Verify with public key', 'blue', 'check', { size: [1.3, 1.3], height: 26, ...extra });
const recv = (extra: Partial<SceneNode> = {}) => box('recv', 16, 0, 'Verifier', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${Math.round(b)} B`);
const SCHEMES = ['RSA-2048', 'ECDSA P-256', 'Ed25519'] as const;
const SIG_BYTES = [256, 64, 64];
const KEY_BYTES = [256, 64, 32];

const lesson: Lesson = {
  slug: 'source-how-digital-signatures-work',
  title: 'Digital Signatures: Signing, Verifying and Trusting Keys',
  blurb: 'Sign a hash with a private key, verify with a public one: integrity, authenticity and non-repudiation — and how batching signatures with a Merkle tree cuts their cost.',
  minutes: 11,
  level: 'Intermediate',
  metrics: [
    { key: 'scheme', label: 'Scheme', icon: 'lock' },
    { key: 'sig', label: 'Signature size', icon: 'file' },
    { key: 'bw', label: 'Signature overhead', icon: 'activity' },
    { key: 'perm', label: 'Per-message overhead with batching', icon: 'layers' },
  ],
  goals: [
    { text: 'What a signature proves and how it differs from encryption and a MAC', step: 1 },
    { text: 'Sign the hash, verify with the public key', step: 2 },
    { text: 'Where public keys come from: certificates', step: 4 },
    { text: 'Algorithms, sizes and nonce pitfalls', step: 5 },
    { text: 'Batching with Merkle trees', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'scheme', label: 'Algorithm (1 RSA-2048 · 2 ECDSA P-256 · 3 Ed25519)', min: 1, max: 3, step: 1, default: 3, unit: '', description: 'Signature scheme.' },
      { key: 'rate', label: 'Messages signed per second', min: 1, max: 1000000, step: 1, default: 100000, unit: '/s', description: 'Signing workload.' },
      { key: 'msg', label: 'Message size', min: 16, max: 100000, step: 16, default: 256, unit: ' B', description: 'Payload before the signature is attached.' },
      { key: 'batch', label: 'Messages per signed batch', min: 1, max: 10000, step: 1, default: 1, unit: '', description: 'Messages covered by one signature via a Merkle root.' },
    ],
    calculate: (input, step) => {
      const s = Math.min(3, Math.max(1, Math.round(input.scheme ?? 3)));
      const rate = Math.max(1, input.rate ?? 1e5);
      const msg = Math.max(1, input.msg ?? 256);
      const batch = Math.max(1, Math.round(input.batch ?? 1));
      const sigB = SIG_BYTES[s - 1] ?? 64;
      const bw = rate * sigB;
      // With a Merkle tree each message also carries a log₂(batch) × 32-byte audit path.
      const path = batch > 1 ? Math.ceil(Math.log2(batch)) * 32 : 0;
      const perBatched = batch > 1 ? sigB / batch + path : sigB;
      return {
        scheme: step < 3 ? { v: '—' } : { v: SCHEMES[s - 1] ?? '' },
        sig: step < 3 ? { v: '—' } : { v: `${sigB} B (public key ${KEY_BYTES[s - 1]} B)`, tone: sigB <= 64 ? 'good' : 'warn' },
        bw: step < 3 ? { v: '—' } : { v: `${fmtB(bw)}/s (${((sigB / (msg + sigB)) * 100).toFixed(0)}% of each message)`, tone: sigB / (msg + sigB) < 0.3 ? 'good' : 'warn' },
        perm: step < 5 ? { v: '—' } : { v: batch > 1 ? `${perBatched.toFixed(0)} B (vs ${sigB} B unbatched)` : `${sigB} B (no batching)`, tone: batch > 1 && perBatched > sigB ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Goals',
      kind: 'insight',
      title: 'Proof that this came from them, unchanged',
      body: [
        'A <b>digital signature</b> gives three things: <b>integrity</b> (the message wasn’t altered), <b>authenticity</b> (it was produced by the holder of a particular key) and <b>non-repudiation</b> (they can’t plausibly deny it, because only they hold the private key). That is what makes software updates, signed contracts, certificates, JWTs and blockchain transactions trustworthy.',
        'It differs from the neighbours: <b>encryption</b> hides content; a <b>MAC</b> (HMAC) also proves integrity and origin but needs a <i>shared</i> secret, so either party could have created it — no non-repudiation, and it can’t be verified by a third party. A signature is checked by anyone who has the <b>public</b> key.',
      ],
      scene: { nodes: [signer({ tag: pill('private key', 'lock') }), box('msg', -2, 0, 'Message + signature', 'orange', 'file', { size: [1.4, 1.4], height: 24 }), recv({ tag: pill('public key', 'globe') })], links: [link('signer', 'msg'), link('msg', 'recv')], flows: [flow(['signer', 'msg', 'recv'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Sign',
      kind: 'technique',
      title: 'Hash the message, sign the hash',
      body: [
        'Signing the whole message would be slow and limited by key size, so the signer <b>hashes</b> the message (SHA-256) to a fixed-size digest and applies the <b>private key</b> operation to the digest, producing the signature. The message is sent in the clear (or encrypted separately) with the signature attached.',
        'The verifier hashes the received message themselves and uses the <b>public key</b> to check that the signature matches that digest. If a single bit of the message changed, the hash differs and verification fails; without the private key, nobody can produce a matching signature (forging one is computationally infeasible).',
      ],
      changes: [{ text: 'signature = Sign(private key, Hash(message))', tone: 'info' }, { text: 'Verify(public key, Hash(message), signature) → valid / invalid', tone: 'info' }],
      scene: { nodes: [signer(), hash(), sign({ tag: pill('signature', 'hash') })], links: [link('signer', 'hash'), link('hash', 'sign')], flows: [flow(['signer', 'hash', 'sign'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Verify',
      kind: 'technique',
      title: 'Verification',
      body: [
        'The verifier recomputes <code>Hash(message)</code>, then runs the signature scheme’s verification with the signer’s public key. In RSA, applying the public key to the signature recovers the (padded) digest to compare; in ECDSA and EdDSA verification checks an algebraic relation on an elliptic curve. The result is a yes/no — the verifier learns nothing about the private key.',
        'Verification is typically cheaper than signing for RSA (fast public exponent) and comparable or slightly heavier for elliptic curves; either way a server verifies many thousands a second per core. At 100,000 messages a second Ed25519 signatures add 6.4 MB/s of overhead (64 B each) — 20% of a 256-byte message — which is where the size comparison below matters.',
      ],
      scene: { nodes: [hash({ name: 'Hash(received)' }), verify({ tag: pill('signature valid?', 'check', 'good') }), recv({ tag: pill('accept / reject', 'check') })], links: [link('hash', 'verify'), link('verify', 'recv')], flows: [flow(['hash', 'verify', 'recv'], { rate: 1.5 })] },
    },
    {
      short: 'Trust',
      kind: 'technique',
      title: 'Whose key is it? Certificates and trust',
      body: [
        'A valid signature only proves “whoever holds <i>this</i> private key signed it”. To know that key belongs to a particular person, company or website you need a trusted binding: a <b>certificate</b> — the public key plus an identity, signed by a <b>certificate authority</b> you already trust, forming a chain to a root (see the TLS handshake lesson). Code signing, email (S/MIME), PDF signing and app-store distribution rely on the same idea.',
        'Alternatives: a <b>web of trust</b> (PGP — people sign each other’s keys), <b>pinning</b> a known key (SSH host keys on first use), or <b>transparency logs</b> that publicly record every issued certificate so mis-issuance can be detected. Key <b>revocation</b> and short lifetimes limit damage when a private key leaks.',
      ],
      changes: [{ text: 'Certificate = identity + public key, signed by a CA', tone: 'info' }, { text: 'Revocation, short lifetimes, transparency logs', tone: 'good' }],
      scene: { nodes: [box('ca', -8, -5, 'Certificate Authority', 'purple', 'shield', { size: [1.3, 1.3], height: 26 }), signer({ tag: pill('certified public key', 'check') }), recv({ tag: pill('trusts the CA', 'check', 'good') })], links: [link('ca', 'signer', { style: 'dashed', arrow: 'end' }), link('signer', 'recv', { arrow: 'end' })], flows: [flow(['signer', 'recv'], { rate: 1.5 })] },
    },
    {
      short: 'Algorithms',
      kind: 'tradeoff',
      title: 'RSA, ECDSA and Ed25519',
      body: [
        '<b>RSA-2048</b>: 256-byte signatures and keys, universally supported, slow to sign. <b>ECDSA P-256</b>: 64-byte signatures and small keys, faster, but needs a fresh <b>random nonce</b> for every signature — a repeated or biased nonce <i>leaks the private key</i> (the famous console and wallet failures). <b>Ed25519</b>: 64-byte signatures, 32-byte keys, fast, <b>deterministic nonces</b> that remove that failure mode, and simple, fixed parameters.',
        'The size differences compound at scale: 100,000 signatures a second cost 25.6 MB/s with RSA-2048 and 6.4 MB/s with Ed25519. Choose Ed25519 for new designs unless you need compatibility; use RSA where ecosystems demand it; prefer RSA-PSS to the older PKCS#1 v1.5 padding; and plan for <b>post-quantum</b> signatures (e.g. ML-DSA), which are much larger (kilobytes) — a reason to design protocols that can change algorithms.',
      ],
      changes: [{ text: 'RSA-2048: 256 B · ECDSA/Ed25519: 64 B', tone: 'info' }, { text: 'ECDSA nonce reuse leaks the private key', tone: 'bad' }, { text: 'Post-quantum signatures are kilobytes', tone: 'info' }],
      scene: { nodes: [box('rsa', -8, 0, 'RSA-2048', 'orange', 'lock', { size: [1.3, 1.3], height: 28, tag: pill('256 B', 'file', 'warn') }), box('ec', 0, 0, 'ECDSA P-256', 'blue', 'lock', { size: [1.3, 1.3], height: 20, tag: pill('64 B · nonce risk', 'alert', 'warn') }), box('ed', 8, 0, 'Ed25519', 'green', 'lock', { size: [1.3, 1.3], height: 20, tag: pill('64 B · deterministic', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Batching',
      kind: 'technique',
      title: 'Sign once for many messages: Merkle trees',
      body: [
        'When there are many small messages (log entries, transactions, certificate-transparency records), signing each is wasteful. Build a <b>Merkle tree</b> over a batch — each leaf the hash of a message, each parent the hash of its children — and sign only the <b>root</b>. Each message is accompanied by its <b>audit path</b>: the sibling hashes up the tree (log₂ n × 32 bytes). The verifier recomputes the root from the message and path and checks one signature.',
        'For a batch of 1,000 messages: 64 B ÷ 1,000 + 10 × 32 B = <b>~320 B</b> per message if every message carries its path — more than a single Ed25519 signature! Batching pays off for <i>CPU</i> (one signature for 1,000 messages) and when the audit path is only shipped on demand, not when bandwidth per message is the constraint. Use the sliders to see the trade-off.',
      ],
      changes: [{ text: 'Sign the Merkle root; ship paths on demand', tone: 'good' }, { text: 'Per-message path = log₂(n) × 32 B', tone: 'info' }],
      concepts: [{ term: 'Merkle tree', def: 'A tree of hashes in which each node hashes its children, so one root commits to every leaf and any leaf can be proven with a short path.' }],
      scene: { nodes: [box('l1', -8, 5, 'msg 1', 'blue', 'file', { size: [1, 1], height: 14 }), box('l2', -2, 5, 'msg 2', 'blue', 'file', { size: [1, 1], height: 14 }), box('l3', 4, 5, 'msg 3', 'blue', 'file', { size: [1, 1], height: 14 }), box('l4', 10, 5, 'msg 4', 'blue', 'file', { size: [1, 1], height: 14 }), box('root', 1, -5, 'Merkle root', 'orange', 'hash', { size: [1.3, 1.3], height: 24, tag: pill('signed once', 'lock', 'good') })], links: [link('l1', 'root', { arrow: 'end' }), link('l2', 'root', { arrow: 'end' }), link('l3', 'root', { arrow: 'end' }), link('l4', 'root', { arrow: 'end' })], flows: [flow(['l2', 'root'], { rate: 1 })] },
    },
    {
      short: 'Pitfalls',
      kind: 'problem',
      title: 'How signing goes wrong',
      body: [
        '<b>Signing the wrong thing</b>: if the signed bytes are ambiguous (the same bytes parse two ways) an attacker gets a signature valid for a different meaning — sign a canonical, unambiguous encoding with a domain-separation tag. <b>Replay</b>: a valid signed message can be resent — include nonces, timestamps and audience. <b>Key management</b>: private keys in source code or on build servers; use HSMs/KMS and short-lived keys. <b>Verification shortcuts</b>: accepting any algorithm named in the message (the <code>alg: none</code> JWT bug), skipping certificate checks, or comparing non-constant-time.',
        'Verify with a fixed expected algorithm and key, check expiry and revocation, log signing events, and rotate keys on a schedule. Figures here are model outputs for sizing, using standard signature sizes.',
      ],
      changes: [{ text: 'Domain separation, canonical encoding', tone: 'good' }, { text: 'Never trust the algorithm named in the message', tone: 'bad' }],
      scene: { nodes: [recv({ tag: pill('accepts alg: none', 'alert', 'bad') }), box('atk', -8, 6, 'Attacker', 'red', 'alert', { size: [1.2, 1.2], height: 22 })], links: [link('atk', 'recv')], flows: [flow(['atk', 'recv'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Private key signs, public key verifies',
      body: [
        'A signature over a message’s hash proves <b>integrity, authenticity and non-repudiation</b>; certificates bind public keys to identities; Ed25519 gives 64-byte signatures with deterministic nonces, ECDSA needs careful randomness, RSA is large but universal. Merkle batching trades one signature for per-message audit paths.',
        'Sign canonical, domain-separated data, bind to a context to stop replay, keep private keys in hardware or a KMS, and pin the verification algorithm.',
      ],
      scene: { nodes: [signer(), hash(), sign(), verify(), recv()], links: [link('signer', 'hash'), link('hash', 'sign'), link('sign', 'verify'), link('verify', 'recv')], flows: [flow(['signer', 'hash', 'sign', 'verify', 'recv'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
