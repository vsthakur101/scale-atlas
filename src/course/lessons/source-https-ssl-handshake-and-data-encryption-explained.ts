import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -13, 0, 'Client', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const server = (extra: Partial<SceneNode> = {}) => box('server', 11, 0, 'Server', 'blue', 'server', { size: [1.3, 1.3], height: 30, ...extra });
const ca = (extra: Partial<SceneNode> = {}) => box('ca', 0, -9, 'Certificate Authority', 'purple', 'shield', { size: [1.3, 1.3], height: 26, ...extra });
const spy = (extra: Partial<SceneNode> = {}) => box('spy', 0, 7, 'Eavesdropper', 'red', 'search', { size: [1.1, 1.1], height: 20, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const VERSIONS = ['TLS 1.2', 'TLS 1.3', 'TLS 1.3 resumed (0-RTT)'] as const;

const lesson: Lesson = {
  slug: 'source-https-ssl-handshake-and-data-encryption-explained',
  title: 'The TLS Handshake',
  blurb: 'How two strangers agree on a secret over a public network, prove who they are, and then switch to fast symmetric encryption — and what each protocol version costs in round trips.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'setup', label: 'Connection setup (TCP + TLS)', icon: 'clock' },
    { key: 'rt', label: 'TLS round trips', icon: 'refresh' },
    { key: 'cpu', label: 'Server CPU for handshakes', icon: 'cpu' },
  ],
  goals: [
    { text: 'The three guarantees: confidentiality, integrity, authentication', step: 1 },
    { text: 'How the certificate chain proves the server’s identity', step: 3 },
    { text: 'Ephemeral key exchange and forward secrecy', step: 4 },
    { text: 'Why bulk data uses symmetric encryption', step: 5 },
    { text: 'TLS 1.3 and resumption: fewer round trips', step: 6 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rtt', label: 'Round-trip time', min: 5, max: 500, step: 5, default: 80, unit: ' ms', description: 'Network latency between client and server.' },
      { key: 'ver', label: 'Protocol (1 = TLS 1.2, 2 = TLS 1.3, 3 = 1.3 resumed)', min: 1, max: 3, step: 1, default: 2, unit: '', description: '1 TLS 1.2 · 2 TLS 1.3 · 3 TLS 1.3 session resumption with early data.' },
      { key: 'cps', label: 'New connections per second', min: 100, max: 200000, step: 100, default: 5000, unit: '/s', description: 'Connection attempts arriving at the server.' },
      { key: 'resume', label: 'Resumed instead of full handshake', min: 0, max: 95, step: 1, default: 60, unit: '%', description: 'Share of connections that reuse a previous session and skip the expensive public-key work.' },
      { key: 'cpu', label: 'CPU per full handshake', min: 0.1, max: 5, step: 0.1, default: 0.6, unit: ' ms', description: 'Server CPU for the signature and key agreement (illustrative; depends on key type and hardware).' },
    ],
    calculate: (input, step) => {
      const rtt = Math.max(1, input.rtt ?? 80);
      const ver = Math.min(3, Math.max(1, Math.round(input.ver ?? 2)));
      const cps = Math.max(1, input.cps ?? 5000);
      const resume = Math.min(0.99, Math.max(0, (input.resume ?? 60) / 100));
      const cpu = Math.max(0.01, input.cpu ?? 0.6);
      const tlsRt = ver === 1 ? 2 : ver === 2 ? 1 : 0;
      const cores = (cps * (1 - resume) * cpu) / 1000;
      return {
        setup: step < 1 ? { v: '—' } : { v: `${fmtMs((1 + tlsRt) * rtt)} (${VERSIONS[ver - 1]})`, tone: tlsRt >= 2 ? 'warn' : 'good' },
        rt: step < 1 ? { v: '—' } : { v: `${tlsRt}`, tone: tlsRt >= 2 ? 'warn' : 'good' },
        cpu: step < 4 ? { v: '—' } : { v: `${cores.toFixed(cores < 10 ? 1 : 0)} cores`, tone: cores < 8 ? 'good' : cores < 32 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Goals',
      kind: 'problem',
      title: 'A public network and three things to protect',
      body: [
        'Data crosses networks you don’t control: Wi-Fi, ISPs, transit providers. Anyone along the path can <b>read</b> it, <b>change</b> it, or <b>impersonate</b> the server. TLS (the successor to SSL; HTTPS is HTTP over TLS) provides the answer: <b>confidentiality</b> (only the endpoints can read), <b>integrity</b> (tampering is detected) and <b>authentication</b> (you are talking to the real <code>bank.example.com</code>).',
        'The hard part is the bootstrap: the two sides have never met and share no secret, yet must agree on one while an attacker watches every byte. The handshake does exactly that.',
      ],
      scene: { nodes: [client(), spy({ tag: pill('sees everything', 'alert', 'warn') }), server()], links: [link('client', 'server', { arrow: 'both' }), link('client', 'spy', { style: 'dashed' })], flows: [flow(['client', 'server'], { rate: 1.2 })] },
    },
    {
      short: 'Hello',
      kind: 'technique',
      title: 'ClientHello and ServerHello: negotiate',
      body: [
        'After the TCP connection the client sends <b>ClientHello</b>: the highest TLS version it supports, a list of <b>cipher suites</b>, a random number, extensions such as the server name (SNI) it wants and, in TLS 1.3, its <b>key share</b> already. The server replies with <b>ServerHello</b>: the chosen version and suite and its own random value (and key share).',
        'Both randoms feed key derivation, so each session’s keys are unique. Negotiation also guards against <b>downgrade attacks</b>: the final handshake messages authenticate the whole transcript, so an attacker who strips stronger options is detected.',
      ],
      scene: { nodes: [client({ tag: pill('versions · ciphers · key share', 'list') }), server({ tag: pill('picks suite', 'check') })], links: [link('client', 'server', { arrow: 'both' })], flows: [flow(['client', 'server'], { kind: 'handshake', rate: 1, back: true })] },
    },
    {
      short: 'Certificate',
      kind: 'technique',
      title: 'Proving identity with a certificate chain',
      body: [
        'The server sends its <b>certificate</b>: its public key, its domain name(s), validity dates, signed by a <b>Certificate Authority</b>. The client verifies the signature, then checks the CA’s certificate was signed by an intermediate, and so on up to a <b>root</b> already trusted in the operating system or browser store. It also checks the name matches, the dates, and revocation status.',
        'Possession of the certificate isn’t proof — anyone can copy it — so the server also <b>signs a hash of the handshake</b> with its private key. Only the real owner can do that. That signature is what authenticates the server; the CA chain says whose key it is.',
      ],
      changes: [{ text: 'Leaf → intermediate → trusted root', tone: 'info' }, { text: 'Server signs the handshake with its private key', tone: 'good' }],
      concepts: [{ term: 'Certificate', def: 'A signed statement that a public key belongs to a named entity, issued by a CA the client trusts.' }],
      scene: { nodes: [client({ tag: pill('verifies chain + name', 'check', 'good') }), ca({ tag: pill('signed the cert', 'shield') }), server({ tag: pill('proves private key', 'lock') })], links: [link('server', 'client', { arrow: 'end' }), link('ca', 'server', { style: 'dashed', arrow: 'end' })], flows: [flow(['server', 'client'], { kind: 'handshake', rate: 1 })] },
    },
    {
      short: 'Key exchange',
      kind: 'technique',
      title: 'Agreeing on a secret nobody sent',
      body: [
        'With <b>ephemeral Diffie–Hellman</b> (ECDHE) each side generates a <i>temporary</i> key pair for this connection only and sends the public half. Each combines its own private key with the other’s public key and arrives at the <b>same shared secret</b> — without that secret ever crossing the wire. An eavesdropper sees only the public halves and cannot compute it.',
        'Because the keys are thrown away afterwards, a future theft of the server’s long-term private key can’t decrypt <b>recorded</b> traffic: <b>forward secrecy</b>. (Older RSA key transport encrypted the secret to the server’s long-term key — so one leaked key exposed every past session.) TLS 1.3 requires ephemeral exchange.',
      ],
      changes: [{ text: 'Shared secret computed, never transmitted', tone: 'good' }, { text: 'Ephemeral keys → forward secrecy', tone: 'good' }],
      concepts: [{ term: 'Forward secrecy', def: 'A property that past sessions stay private even if the server’s long-term key is later compromised.' }],
      scene: { nodes: [client({ tag: pill('private a · public A', 'lock') }), spy({ tag: pill('sees A and B only', 'search') }), server({ tag: pill('private b · public B', 'lock') })], links: [link('client', 'server', { arrow: 'both' })], flows: [flow(['client', 'server'], { kind: 'handshake', rate: 1, back: true })] },
    },
    {
      short: 'Bulk data',
      kind: 'technique',
      title: 'Then switch to symmetric encryption',
      body: [
        'From the shared secret both sides derive <b>symmetric session keys</b> (HKDF) and exchange <b>Finished</b> messages — a MAC over the entire handshake — to confirm nothing was altered. From then on records are encrypted with an <b>AEAD cipher</b> such as AES-GCM or ChaCha20-Poly1305, which provides confidentiality and integrity in one step, thousands of times faster than public-key operations.',
        'Public-key work happens <i>once per connection</i>: the CPU cost of a full handshake is a fraction of a millisecond; at 5,000 new connections a second with 60% resumed that’s about <b>1.2 cores</b>. Bulk encryption afterwards is nearly free thanks to hardware instructions (AES-NI).',
      ],
      changes: [{ text: 'Handshake: public-key, once per connection', tone: 'info' }, { text: 'Data: AES-GCM / ChaCha20-Poly1305', tone: 'good' }],
      scene: { nodes: [client(), server(), box('k', 0, 0, 'Session keys', 'teal', 'lock', { size: [1.2, 1.2], height: 22, tag: pill('AEAD records', 'shield', 'good') })], links: [link('client', 'k'), link('k', 'server')], flows: [flow(['client', 'k', 'server'], { kind: 'write', rate: 3 })] },
    },
    {
      short: 'TLS 1.3',
      kind: 'insight',
      title: 'TLS 1.3: one round trip instead of two',
      body: [
        'TLS 1.2 spends two round trips on the handshake: hellos and certificate, then the key exchange and Finished. TLS 1.3 sends the client’s <b>key share in the first message</b>, so the server can answer with hello, certificate and Finished at once and both sides can send encrypted data after <b>one round trip</b>. Total setup with TCP: 1 + 1 = 2 round trips (160 ms at 80 ms RTT) versus 3 (240 ms).',
        'It also removed legacy: RSA key transport, static Diffie–Hellman, CBC and RC4 ciphers, compression, renegotiation — and encrypts more of the handshake itself, including the certificate. Fewer options means fewer attacks. Always enable it.',
      ],
      changes: [{ text: 'TLS 1.2: 2 RTT → TLS 1.3: 1 RTT', tone: 'good' }, { text: 'Weak and legacy features removed', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('hello + key share', 'bolt') }), server({ tag: pill('hello + cert + Finished', 'check', 'good') })], links: [link('client', 'server', { arrow: 'both' })], flows: [flow(['client', 'server'], { kind: 'handshake', rate: 1.5, back: true })] },
    },
    {
      short: 'Resumption',
      kind: 'tradeoff',
      title: 'Session resumption and 0-RTT',
      body: [
        'After a full handshake the server gives the client a <b>session ticket</b> (a PSK encrypted by the server). On reconnecting, the client presents it and skips certificate verification and the expensive key agreement — cheaper CPU, and in TLS 1.3 it can attach <b>early data</b> to the very first flight: <b>0-RTT</b>, zero TLS round trips (the metric at setting 3).',
        'The catch: early data has <b>no replay protection</b> — an attacker can resend the captured first flight. Use 0-RTT only for idempotent requests (GETs), and keep ticket keys rotated. Figures here are illustrative model outputs, not benchmarks.',
      ],
      changes: [{ text: 'Resumption: skip signature and key agreement', tone: 'good' }, { text: '0-RTT early data can be replayed', tone: 'bad' }],
      scene: { nodes: [client({ tag: pill('ticket + early data', 'file', 'warn') }), server({ tag: pill('0 TLS round trips', 'bolt', 'good') })], links: [link('client', 'server')], flows: [flow(['client', 'server'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Authenticate, agree, then encrypt',
      body: [
        'TLS negotiates parameters, authenticates the server with a <b>certificate chain plus a handshake signature</b>, derives a shared secret by <b>ephemeral key exchange</b> (forward secrecy), confirms the transcript with Finished messages, and then protects data with a fast <b>AEAD cipher</b>.',
        'TLS 1.3 cuts setup to one round trip and resumption to zero, at the price of replay risk for early data. Terminate TLS close to users, keep certificates and ticket keys rotated, and measure full-handshake rate versus resumption to size CPU.',
      ],
      scene: { nodes: [client(), server(), box('k', 0, 0, 'Encrypted channel', 'teal', 'lock', { size: [1.3, 1.3], height: 24 })], links: [link('client', 'k'), link('k', 'server')], flows: [flow(['client', 'k', 'server'], { kind: 'write', rate: 2 })] },
    },
  ],
};

export default lesson;
