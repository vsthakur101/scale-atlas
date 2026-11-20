import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const alice = (extra: Partial<SceneNode> = {}) => box('alice', -16, 0, 'Sender', 'teal', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const bob = (extra: Partial<SceneNode> = {}) => box('bob', 12, 0, 'Receiver', 'green', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const wire = (extra: Partial<SceneNode> = {}) => box('wire', -2, 0, 'Untrusted network', 'red', 'wifi', { size: [1.6, 1.2], height: 12, ...extra });
const sym = (extra: Partial<SceneNode> = {}) => box('sym', -2, -8, 'One shared secret key (AES / ChaCha20)', 'orange', 'key', { size: [1.4, 1.4], height: 22, ...extra });
const pub = (extra: Partial<SceneNode> = {}) => db('pub', 12, 9, 'Public key (shared openly)', { size: [1.2, 1.2], ...extra });
const priv = (extra: Partial<SceneNode> = {}) => db('priv', 12, -9, 'Private key (never leaves)', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : `${(s * 1000).toFixed(0)} ms`);

const lesson: Lesson = {
  slug: 'source-symmetric-vs-asymmetric-encryption',
  title: 'Symmetric vs Asymmetric Encryption: Speed, Key Distribution and Hybrid Schemes',
  blurb: 'One shared key is fast but impossible to distribute at scale; a key pair solves distribution but is orders of magnitude slower. The numbers behind pairwise keys, bulk throughput and TLS handshakes — and why every real protocol is hybrid.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'keys', label: 'Keys: pairwise symmetric vs key pairs', icon: 'key' },
    { key: 'bulk', label: 'Encrypting the data: AES vs public-key-only', icon: 'timer' },
    { key: 'hs', label: 'TLS handshakes per core per second (RSA cert → ECDSA cert)', icon: 'gauge' },
    { key: 'ratio', label: 'Cost ratio: public-key vs symmetric per byte', icon: 'scale' },
  ],
  goals: [
    { text: 'Symmetric encryption and the key-distribution problem', step: 1 },
    { text: 'Asymmetric encryption, signatures and key agreement', step: 2 },
    { text: 'Why asymmetric is slow and size-limited', step: 3 },
    { text: 'Hybrid encryption: how TLS combines them', step: 4 },
    { text: 'Strength, modes and common mistakes', step: 5 },
  ],
  legend: ['request', 'handshake', 'response', 'fail'],
  dynamic: {
    parameters: [
      { key: 'parties', label: 'Parties that must talk securely', min: 2, max: 100000, step: 1, default: 1000, unit: '', description: 'Users, services or devices.' },
      { key: 'gb', label: 'Data to encrypt', min: 0.001, max: 1000, step: 0.001, default: 1, unit: ' GB', description: 'Bulk payload.' },
      { key: 'aes', label: 'AES-GCM throughput per core', min: 0.2, max: 12, step: 0.1, default: 4, unit: ' GB/s', description: 'With AES-NI hardware instructions.' },
      { key: 'rsaPriv', label: 'RSA-2048 private-key operations per second per core', min: 100, max: 5000, step: 50, default: 1000, unit: '/s', description: 'Decrypt or sign.' },
      { key: 'block', label: 'RSA plaintext per operation', min: 32, max: 400, step: 1, default: 190, unit: ' B', description: 'RSA-2048 with OAEP carries up to ~190 bytes.' },
      { key: 'ecdsa', label: 'ECDSA P-256 signs per second per core', min: 2000, max: 60000, step: 500, default: 17000, unit: '/s', description: 'Signature with an EC certificate.' },
      { key: 'ecdh', label: 'X25519 key agreements per second per core', min: 5000, max: 120000, step: 500, default: 40000, unit: '/s', description: 'Ephemeral Diffie–Hellman.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.parties ?? 1000));
      const gb = Math.max(1e-6, input.gb ?? 1);
      const aes = Math.max(0.01, input.aes ?? 4);
      const rsaPriv = Math.max(1, input.rsaPriv ?? 1000);
      const block = Math.max(1, input.block ?? 190);
      const ecdsa = Math.max(1, input.ecdsa ?? 17000);
      const ecdh = Math.max(1, input.ecdh ?? 40000);
      const pairwise = (n * (n - 1)) / 2;
      const aesT = gb / aes;
      const ops = (gb * 1e9) / block;
      const rsaT = ops / rsaPriv;
      // Per-handshake server work: one signature + one ephemeral key agreement.
      const hsRsa = 1 / (1 / rsaPriv + 1 / ecdh);
      const hsEc = 1 / (1 / ecdsa + 1 / ecdh);
      return {
        keys: step < 1 ? { v: '—' } : { v: `${fmtN(pairwise)} vs ${fmtN(n)} pairs (${(pairwise / n).toFixed(0)}×)` },
        bulk: step < 3 ? { v: '—' } : { v: `${fmtT(aesT)} vs ${fmtT(rsaT)}`, tone: 'bad' },
        hs: step < 4 ? { v: '—' } : { v: `${fmtN(hsRsa)} → ${fmtN(hsEc)} (${(hsEc / hsRsa).toFixed(0)}×)`, tone: 'good' },
        ratio: step < 3 ? { v: '—' } : { v: `${fmtN(rsaT / aesT)}× slower per byte`, tone: 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Symmetric',
      kind: 'technique',
      title: 'Symmetric: one key locks and unlocks',
      body: [
        '<b>Symmetric</b> (secret-key) ciphers use <b>the same key</b> to encrypt and decrypt. Modern choices are <b>AES</b> (a block cipher, 128-bit blocks, 128/192/256-bit keys, used in an authenticated mode such as <b>GCM</b>) and <b>ChaCha20-Poly1305</b> (a stream cipher, fast on CPUs without AES hardware). They are simple operations — substitutions, permutations, XORs — and CPUs have dedicated instructions (<b>AES-NI</b>), so a single core encrypts at <b>several GB/s</b> with nanosecond latency per block.',
        'Their weakness is the <b>key-distribution problem</b>: both sides must already share the secret, and sharing it over the network is the very thing you can’t yet do safely. It also scales badly with people: if every pair of <i>n</i> parties needs its own key, that’s <code>n(n−1)/2</code> keys — <b>499,500 keys for 1,000 parties</b>, 5 billion for 100,000 — each to be generated, delivered, stored and rotated securely.',
      ],
      changes: [{ text: 'AES-GCM / ChaCha20-Poly1305: GB/s per core', tone: 'good' }, { text: 'n parties need n(n−1)/2 pairwise keys: 499,500 for 1,000', tone: 'bad' }],
      scene: { nodes: [alice({ tag: pill('encrypt(K, msg)', 'lock') }), sym(), wire({ tag: pill('ciphertext only', 'shield') }), bob({ tag: pill('decrypt(K, ct)', 'lock') })], links: [link('alice', 'wire'), link('wire', 'bob'), link('sym', 'alice', { style: 'dashed' }), link('sym', 'bob', { style: 'dashed' })], flows: [flow(['alice', 'wire', 'bob'], { rate: 2 }), flow(['sym', 'alice'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Asymmetric',
      kind: 'technique',
      title: 'Asymmetric: a public key and a private key',
      body: [
        '<b>Asymmetric</b> (public-key) cryptography gives each party a <b>key pair</b> with a mathematical relationship: what the <b>public</b> key does, only the <b>private</b> key can undo (encryption), and what the <b>private</b> key does, anyone with the public key can check (signatures). The public key can be published openly; the private key never leaves its owner. That removes the distribution problem — <b>n parties need only n key pairs</b>, 1,000 rather than 499,500 — and adds capabilities symmetric keys cannot offer: <b>digital signatures</b> (authenticity and non-repudiation, see that lesson), <b>certificates</b> binding a public key to an identity, and <b>key agreement</b>.',
        'Families: <b>RSA</b> (factoring; 2048–4096-bit keys), <b>elliptic-curve</b> schemes — <b>ECDSA</b>/<b>Ed25519</b> signatures, <b>ECDH/X25519</b> key agreement — with ~256-bit keys at equal strength, and post-quantum schemes (ML-KEM, ML-DSA) being deployed alongside them. Diffie–Hellman-style <b>key agreement</b> lets two parties derive the <i>same</i> secret by exchanging only public values — the bridge back to fast symmetric encryption.',
      ],
      changes: [{ text: 'n key pairs, not n(n−1)/2 shared secrets', tone: 'good' }, { text: 'Adds signatures, certificates and key agreement', tone: 'good' }],
      scene: { nodes: [alice({ tag: pill('encrypt with PUBLIC key', 'lock') }), pub({ tag: pill('anyone may have it', 'share') }), wire(), bob({ tag: pill('decrypt with PRIVATE key', 'key', 'good') }), priv()], links: [link('alice', 'wire'), link('wire', 'bob'), link('pub', 'alice', { style: 'dashed' }), link('bob', 'priv')], flows: [flow(['alice', 'wire', 'bob'], { rate: 1.4 })] },
    },
    {
      short: 'Cost',
      kind: 'problem',
      title: 'The price: math instead of bit-twiddling',
      body: [
        'Public-key operations are <b>big-number arithmetic</b>: modular exponentiation for RSA, scalar multiplication on a curve for ECC. An RSA-2048 private-key operation costs on the order of <b>1 millisecond</b> — roughly a thousand per second per core — and RSA can only encrypt a block smaller than its modulus (~190 bytes with OAEP padding). Encrypting 1 GB with RSA alone would take 5.26 million operations ÷ 1,000/s = <b>5,263 seconds (88 minutes)</b> on one core, against <b>0.25 seconds</b> for AES-GCM at 4 GB/s: <b>over 21,000× slower</b> per byte.',
        'So public-key cryptography is never used for bulk data. It is used for the small, expensive, <i>rare</i> parts: authenticating a server, agreeing on a key, signing a certificate or software release. The expensive operation happens once per connection or per document; the bulk happens under a symmetric key at memory speed. (ECC is much cheaper than RSA: ECDSA P-256 signs ~17× faster than RSA-2048 on the same core, which is why modern certificates and TLS prefer it.)',
      ],
      changes: [{ text: 'RSA-2048 private op ≈ 1 ms; ≤ 190 B per op', tone: 'bad' }, { text: '1 GB: AES 0.25 s vs RSA-only 5,263 s (21,000×)', tone: 'bad' }, { text: 'ECDSA signs ~17× faster than RSA', tone: 'good' }],
      scene: { nodes: [alice({ tag: pill('1 GB payload', 'file') }), sym({ tag: pill('AES: 0.25 s', 'timer', 'good') }), box('rsa', -2, 8, 'RSA only: 88 min', 'red', 'alert', { size: [1.4, 1.4], height: 22, tag: pill('5.3M operations', 'timer', 'bad') }), bob()], links: [link('alice', 'sym'), link('alice', 'rsa'), link('sym', 'bob'), link('rsa', 'bob')], flows: [flow(['alice', 'sym', 'bob'], { rate: 3 }), flow(['alice', 'rsa'], { kind: 'fail', rate: 0.4 })] },
    },
    {
      short: 'Hybrid',
      kind: 'technique',
      title: 'Hybrid encryption: asymmetric to agree, symmetric to carry',
      body: [
        'Every real protocol combines them. In <b>TLS 1.3</b> the client and server run an <b>ephemeral X25519 key agreement</b> (public values exchanged in the clear, shared secret derived by each side), the server proves its identity with a <b>signature</b> over the handshake transcript using the key in its <b>certificate</b> (verified up a chain to a trusted CA), and both derive <b>symmetric traffic keys</b> with HKDF. Everything after the handshake is AES-GCM or ChaCha20. <b>PGP/S-MIME</b> and <b>envelope encryption</b> in cloud KMS use the same shape: generate a random data key, encrypt the data with it, encrypt (“wrap”) the data key with the recipient’s public key or a master key, and ship both.',
        'Because the key agreement is <b>ephemeral</b>, each session gets <b>forward secrecy</b>. The server cost is one signature plus one agreement per handshake: with an RSA certificate 1 ÷ (1/1000 + 1/40000) ≈ <b>976 handshakes/s per core</b>; with an ECDSA certificate 1 ÷ (1/17000 + 1/40000) ≈ <b>11,930/s per core</b> — 12× more — and session resumption skips it entirely for returning clients. That is why asymmetric cost is a matter of connection rate, not data volume.',
      ],
      changes: [{ text: 'X25519 agreement + certificate signature, then AES-GCM', tone: 'good' }, { text: 'RSA cert 976 → ECDSA cert 11,930 handshakes/s/core', tone: 'good' }, { text: 'Envelope encryption: wrap a random data key', tone: 'info' }],
      scene: { nodes: [alice({ tag: pill('ClientHello + X25519 pub', 'hash') }), wire(), bob({ tag: pill('cert + signature + X25519 pub', 'shield') }), sym({ tag: pill('derived traffic keys', 'key', 'good') })], links: [link('alice', 'wire'), link('wire', 'bob'), link('sym', 'alice', { style: 'dashed' }), link('sym', 'bob', { style: 'dashed' })], flows: [flow(['alice', 'wire', 'bob'], { kind: 'handshake', rate: 1.4, back: true }), flow(['alice', 'wire', 'bob'], { rate: 2.4 })] },
    },
    {
      short: 'Mistakes',
      kind: 'tradeoff',
      title: 'Strength, modes and what goes wrong',
      body: [
        'Equivalent strength (NIST): <b>AES-128 ≈ RSA-3072 ≈ ECC-256</b> (~128-bit security); <b>AES-256 ≈ RSA-15360 ≈ ECC-521</b>. RSA key sizes grow fast for the same security, which is another reason ECC dominates new designs. Quantum computers would break RSA and ECC (Shor’s algorithm) but only halve symmetric strength (Grover’s), so AES-256 stays acceptable — and hybrid post-quantum key exchange (X25519 + ML-KEM) is already shipping to protect today’s traffic from “harvest now, decrypt later”.',
        'Failures are almost always <b>usage</b>, not algorithms: <b>ECB mode</b> (identical plaintext blocks leak patterns), <b>reusing a nonce</b> with GCM or ChaCha20 (catastrophic: reveals plaintext XORs and breaks authentication), <b>encrypting without authenticating</b> (use AEAD), <b>textbook RSA / PKCS#1 v1.5 padding</b> (use OAEP or avoid RSA encryption), keys derived from passwords with a fast hash (use a KDF like Argon2 — see the Password Storage lesson), hard-coded keys, missing certificate validation, and rolling your own crypto. Use vetted libraries (libsodium, the platform’s TLS and KMS), pick AEAD defaults and rotate keys. Figures here are model outputs with typical per-core rates.',
      ],
      changes: [{ text: 'AES-128 ≈ RSA-3072 ≈ ECC-256; AES-256 survives quantum', tone: 'info' }, { text: 'Never reuse a nonce; always AEAD; no ECB; no DIY crypto', tone: 'bad' }],
      scene: { nodes: [alice(), sym({ tag: pill('AEAD + unique nonce', 'check', 'good') }), box('bad', 6, 8, 'ECB / reused nonce / hard-coded key', 'red', 'alert', { size: [1.4, 1.4], height: 22, tag: pill('breaks silently', 'alert', 'bad') }), bob()], links: [link('alice', 'sym'), link('sym', 'bob'), link('bad', 'sym', { style: 'dashed' })], flows: [flow(['alice', 'sym', 'bob'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Asymmetric for trust and agreement; symmetric for the bytes',
      body: [
        '<b>Symmetric</b> ciphers are fast (GB/s) but need a shared secret (n(n−1)/2 pairwise keys). <b>Asymmetric</b> key pairs fix distribution (n pairs), enable signatures and key agreement, but cost ~21,000× more per byte and carry tiny blocks.',
        'Protocols are <b>hybrid</b>: ephemeral key agreement and a signed identity set up a symmetric session key that carries the data, with forward secrecy and AEAD modes.',
      ],
      scene: { nodes: [alice(), wire(), bob(), sym(), pub()], links: [link('alice', 'wire'), link('wire', 'bob'), link('sym', 'alice', { style: 'dashed' }), link('sym', 'bob', { style: 'dashed' }), link('pub', 'bob')], flows: [flow(['alice', 'wire', 'bob'], { kind: 'handshake', rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
