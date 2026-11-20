import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -16, 0, 'SSH client', 'teal', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const server = (extra: Partial<SceneNode> = {}) => box('server', 4, 0, 'sshd (server)', 'blue', 'server', { size: [1.5, 1.5], height: 30, ...extra });
const known = (extra: Partial<SceneNode> = {}) => db('known', -16, 8, 'known_hosts (host fingerprints)', { size: [1.2, 1.2], ...extra });
const authk = (extra: Partial<SceneNode> = {}) => db('authk', 4, 8, 'authorized_keys (public keys)', { size: [1.2, 1.2], ...extra });
const mitm = (extra: Partial<SceneNode> = {}) => box('mitm', -6, -8, 'Man in the middle', 'red', 'alert', { size: [1.2, 1.2], height: 22, ...extra });
const botnet = (extra: Partial<SceneNode> = {}) => crowd('botnet', -16, 0, 12, 'password guessers', extra);
const shell = (extra: Partial<SceneNode> = {}) => box('shell', 14, 0, 'Shell / SFTP / port forward', 'green', 'bolt', { size: [1.3, 1.3], height: 22, ...extra });

const fmtLife = (s: number): string => {
  const y = s / 3.156e7;
  if (y >= 1e6) return `10^${Math.round(Math.log10(y))} years`;
  if (y >= 1) return `${y.toFixed(1)} years`;
  const d = s / 86400;
  if (d >= 1) return `${d.toFixed(1)} days`;
  return `${(s / 3600).toFixed(1)} hours`;
};

const lesson: Lesson = {
  slug: 'source-how-does-ssh-work',
  title: 'How SSH Works: Key Exchange, Host Keys and Public-Key Login',
  blurb: 'Negotiate algorithms, derive a shared session key with ephemeral Diffie–Hellman, prove the server’s identity with a host key, then prove yours with a signature — plus what password guessing and connection setup actually cost.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'pw', label: 'Time to guess a password across the botnet', icon: 'timer' },
    { key: 'key', label: 'Time to brute-force a key pair', icon: 'lock' },
    { key: 'conn', label: 'New SSH connection setup', icon: 'clock' },
    { key: 'mux', label: 'Extra session on an existing connection', icon: 'refresh' },
  ],
  goals: [
    { text: 'Version and algorithm negotiation', step: 1 },
    { text: 'Key exchange: a shared secret nobody sent', step: 2 },
    { text: 'Host keys: authenticating the server (TOFU)', step: 3 },
    { text: 'User authentication: password vs public key', step: 4 },
    { text: 'Channels, forwarding and hardening', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'bits', label: 'Password entropy', min: 10, max: 100, step: 1, default: 40, unit: ' bits', description: 'log2 of the number of equally likely passwords.' },
      { key: 'rate', label: 'Guesses per second per attacker host', min: 0.1, max: 100, step: 0.1, default: 0.5, unit: '/s', description: 'Throttled by login grace time, MaxAuthTries and key-exchange cost.' },
      { key: 'hosts', label: 'Attacking hosts', min: 1, max: 1000000, step: 1, default: 5000, unit: '', description: 'Size of the botnet.' },
      { key: 'ksec', label: 'Key security level', min: 64, max: 256, step: 8, default: 128, unit: ' bits', description: 'Ed25519 is roughly 128-bit; RSA-3072 is roughly 128-bit.' },
      { key: 'rtt', label: 'Round-trip time to the server', min: 1, max: 600, step: 1, default: 80, unit: ' ms', description: 'Network latency.' },
      { key: 'rts', label: 'Round trips for a fresh connection', min: 3, max: 12, step: 1, default: 6, unit: '', description: 'TCP, KEX, auth and session open (approximate).' },
    ],
    calculate: (input, step) => {
      const bits = Math.max(1, input.bits ?? 40);
      const rate = Math.max(0.001, input.rate ?? 0.5);
      const hosts = Math.max(1, input.hosts ?? 5000);
      const ksec = Math.max(1, input.ksec ?? 128);
      const rtt = Math.max(1, input.rtt ?? 80);
      const rts = Math.max(1, input.rts ?? 6);
      const guesses = hosts * rate;
      // On average half the space is searched before the right guess.
      const pwT = Math.pow(2, bits - 1) / guesses;
      const keyT = Math.pow(2, ksec - 1) / guesses;
      return {
        pw: step < 4 ? { v: '—' } : { v: `${fmtLife(pwT)} (${Math.round(guesses).toLocaleString('en-US')} guesses/s)`, tone: pwT > 3.156e7 * 10 ? 'good' : pwT > 86400 * 30 ? 'warn' : 'bad' },
        key: step < 4 ? { v: '—' } : { v: fmtLife(keyT), tone: 'good' },
        conn: step < 1 ? { v: '—' } : { v: `${Math.round(rts * rtt)} ms (${rts} × ${Math.round(rtt)} ms)`, tone: rts * rtt < 800 ? 'good' : 'warn' },
        mux: step < 5 ? { v: '—' } : { v: `${Math.round(rtt)} ms (1 round trip, no new handshake)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Negotiate',
      kind: 'technique',
      title: 'Open a TCP connection and agree on algorithms',
      body: [
        'SSH (Secure Shell, RFC 4251–4254) provides an <b>encrypted, authenticated channel</b> over an untrusted network, replacing telnet and rsh. The client opens TCP to port 22; both sides send an identification string (<code>SSH-2.0-OpenSSH_9.x</code>) and then a <b>KEXINIT</b> message listing the algorithms each supports for key exchange, host-key signatures, symmetric encryption (AES-GCM, ChaCha20-Poly1305), MACs and compression. The first mutually supported choice by the client’s preference wins.',
        'Negotiation is why SSH ages gracefully — weak ciphers are retired by configuration — and why a server and client that share no algorithm fail with “no matching key exchange method found”. All of this happens before anything secret is sent, in the clear, which is fine because it carries no secrets and is later covered by the exchange hash (a tampered list changes the hash and breaks the handshake). Setup costs <b>about six round trips</b> (TCP, version/KEXINIT, key exchange, service request, user auth, session open): 6 × 80 ms = <b>480 ms</b>.',
      ],
      changes: [{ text: 'Both sides list supported KEX, host-key, cipher and MAC algorithms', tone: 'info' }, { text: 'Fresh connection ≈ 6 round trips', tone: 'info' }],
      scene: { nodes: [client({ tag: pill('KEXINIT: curve25519, aes256-gcm…', 'list') }), server({ tag: pill('picks first common', 'check') })], links: [link('client', 'server')], flows: [flow(['client', 'server'], { kind: 'handshake', rate: 1.2, back: true })] },
    },
    {
      short: 'Key exchange',
      kind: 'technique',
      title: 'Key exchange: derive a secret nobody transmitted',
      body: [
        'Client and server run an <b>ephemeral Diffie–Hellman</b> exchange — today usually <b>Curve25519</b> (<code>curve25519-sha256</code>, optionally hybridised with a post-quantum KEM). Each picks a fresh random private value, sends the matching public value, and both compute the <b>same shared secret</b> that an eavesdropper who saw both public values cannot derive (the discrete-log problem). From the secret and a hash of the whole handshake (the <b>exchange hash</b> H) they derive session keys: one cipher key and one MAC/IV set per direction.',
        'Because the values are <b>ephemeral</b>, the session has <b>forward secrecy</b>: recording the traffic and later stealing the server’s long-term key does not let you decrypt it, since the session secret was never stored. From here on every packet is encrypted and authenticated, keys are rotated after a volume or time limit (rekeying — about 1 GB or an hour by default), and sequence numbers stop replay. But nothing yet proves <i>who</i> you are talking to.',
      ],
      changes: [{ text: 'Ephemeral ECDH → forward secrecy', tone: 'good' }, { text: 'Session keys derived from shared secret + exchange hash', tone: 'info' }, { text: 'Encrypted, but server identity still unproven', tone: 'bad' }],
      scene: { nodes: [client({ tag: pill('a·G sent', 'hash') }), server({ tag: pill('b·G sent', 'hash') }), mitm({ tag: pill('sees public values only', 'search') })], links: [link('client', 'server'), link('mitm', 'server', { style: 'dashed' })], flows: [flow(['client', 'server'], { kind: 'handshake', rate: 1.3, back: true })] },
    },
    {
      short: 'Host key',
      kind: 'insight',
      title: 'Host keys: stopping a man in the middle',
      body: [
        'Without authentication, an attacker could run a separate key exchange with each side and relay traffic. So in the key-exchange reply the server <b>signs the exchange hash H with its long-term host key</b> (Ed25519, ECDSA or RSA) and sends the public host key. The client verifies the signature — proving the party that derived these session keys holds the host’s private key — then checks that key against <b>known_hosts</b>.',
        'First contact is <b>trust on first use (TOFU)</b>: the client shows the key fingerprint and asks you to accept it; if you do, it is saved, and a later <b>mismatch</b> triggers the loud “REMOTE HOST IDENTIFICATION HAS CHANGED” warning, which means a reinstall <i>or</i> an attack. TOFU’s weakness is that first accept; stronger options are distributing fingerprints out of band, publishing them in DNS (<b>SSHFP</b> records with DNSSEC), or using <b>host certificates</b> signed by an internal CA so clients trust the CA once instead of each host.',
      ],
      changes: [{ text: 'Server signs the exchange hash with its host key', tone: 'good' }, { text: 'known_hosts pins the key: TOFU on first contact', tone: 'info' }, { text: 'Host certificates remove per-host prompts', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('verify signature + known_hosts', 'check', 'good') }), known({ tag: pill('SHA256:ab12…', 'lock') }), server({ tag: pill('signs H with host key', 'lock') }), mitm({ tag: pill('cannot sign → mismatch', 'shield', 'good') })], links: [link('client', 'server'), link('client', 'known'), link('mitm', 'client', { style: 'broken' })], flows: [flow(['server', 'client'], { rate: 1.3 })] },
    },
    {
      short: 'Login',
      kind: 'problem',
      title: 'Proving who you are: passwords vs public keys',
      body: [
        '<b>Password authentication</b> sends the password through the encrypted channel — safe from sniffing but exposed to <b>guessing</b>: any internet-facing sshd is hammered by botnets. At 0.5 guesses/s per host across 5,000 hosts (2,500 guesses/s) a 40-bit password (a typical human-chosen one) falls in about <b>7 years</b> on average — and far faster when the password is reused or from a leaked list, where the effective entropy is a few bits. <b>Public-key authentication</b> instead has the server send a challenge bound to the session id; the client <b>signs it with its private key</b> and the server verifies against the matching line in <code>authorized_keys</code>. The private key never leaves the client and nothing guessable crosses the wire.',
        'Brute-forcing a 128-bit-security key at 2,500 guesses/s takes on the order of <b>10<sup>27</sup> years</b> — not an attack. Best practice: <b>disable password login</b> (<code>PasswordAuthentication no</code>), protect private keys with a passphrase and an <b>ssh-agent</b> or hardware key (FIDO2 <code>sk-ssh-ed25519</code>), restrict users and root login, and use short-lived <b>SSH certificates</b> for access you must revoke. Rate-limit and ban abusers (fail2ban, <code>MaxStartups</code>), though with passwords disabled the noise is harmless.',
      ],
      changes: [{ text: '40-bit password @2,500/s ≈ 7 years; reused passwords fall at once', tone: 'bad' }, { text: 'Key auth: signed challenge, nothing to guess', tone: 'good' }, { text: 'Disable passwords; agent or hardware key; certificates', tone: 'good' }],
      scene: { nodes: [botnet({ tag: pill('2,500 guesses/s', 'alert', 'bad') }), server({ state: 'hot', tag: pill('password auth ON', 'alert', 'warn') }), authk({ tag: pill('ssh-ed25519 AAAA…', 'key') })], links: [link('botnet', 'server'), link('server', 'authk')], flows: [flow(['botnet', 'server'], { kind: 'fail', rate: 2 })] },
    },
    {
      short: 'Channels',
      kind: 'technique',
      title: 'Channels, forwarding and multiplexing',
      body: [
        'Authenticated, the connection carries multiple <b>channels</b> multiplexed over one encrypted transport: an interactive <b>shell</b> or command, <b>SFTP/scp</b> file transfer, and <b>port forwarding</b> — local (<code>-L</code>: expose a remote service on your machine), remote (<code>-R</code>) and dynamic (<code>-D</code>: a SOCKS proxy), and agent or X11 forwarding. A bastion or jump host is one hop (<code>ProxyJump</code>) that lets internal machines stay off the internet.',
        'Because channels share one session, <b>connection multiplexing</b> (<code>ControlMaster</code>/<code>ControlPersist</code>) lets later <code>ssh</code>, <code>scp</code> and <code>git</code> commands open a new channel on an existing connection: <b>1 round trip (80 ms) instead of 6 (480 ms)</b> and no new handshake or authentication. Hazards of forwarding: an attacker with a shell on the bastion can use a forwarded agent’s keys while you are connected, so prefer <code>ProxyJump</code> over agent forwarding. Figures here are model outputs with an approximate round-trip count.',
      ],
      changes: [{ text: 'Many channels over one encrypted connection', tone: 'info' }, { text: 'ControlMaster: new session in 1 RTT instead of 6', tone: 'good' }, { text: 'Prefer ProxyJump to agent forwarding', tone: 'good' }],
      scene: { nodes: [client({ tag: pill('ControlMaster (one TCP)', 'link') }), server({ tag: pill('shell · sftp · -L forward', 'layers') }), shell()], links: [link('client', 'server'), link('server', 'shell')], flows: [flow(['client', 'server', 'shell'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Negotiate, exchange, verify the host, then the user',
      body: [
        'SSH negotiates algorithms, runs an <b>ephemeral key exchange</b> for forward-secret session keys, authenticates the <b>server</b> by a host-key signature pinned in known_hosts (or a CA), then authenticates the <b>user</b> with a signed challenge from a private key.',
        'Disable password login, protect keys, use certificates and ProxyJump, and multiplex connections to avoid paying the handshake repeatedly.',
      ],
      scene: { nodes: [client(), known(), server(), authk(), shell()], links: [link('client', 'server'), link('client', 'known'), link('server', 'authk'), link('server', 'shell')], flows: [flow(['client', 'server', 'shell'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
