import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -16, 0, 'Your device', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const isp = (extra: Partial<SceneNode> = {}) => box('isp', -8, -6, 'Network / ISP (sees ciphertext)', 'grey', 'search', { size: [1.3, 1.3], height: 20, ...extra });
const vpn = (extra: Partial<SceneNode> = {}) => box('vpn', -1, 0, 'VPN server', 'purple', 'shield', { size: [1.5, 1.5], height: 30, ...extra });
const dest = (extra: Partial<SceneNode> = {}) => box('dest', 10, 0, 'Destination (internet / corporate network)', 'blue', 'globe', { size: [1.4, 1.4], height: 28, ...extra });

const fmtMs = (ms: number): string => `${ms >= 10 ? Math.round(ms) : ms.toFixed(1)} ms`;
const fmtN = (n: number): string => (n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-how-does-a-vpn-work',
  title: 'How a VPN Works: Tunnels, Encapsulation and Their Costs',
  blurb: 'An encrypted tunnel that wraps your packets in new ones: what it hides and from whom, and the MTU overhead, detour latency and crypto CPU it adds.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'mtu', label: 'Usable packet payload through the tunnel', icon: 'file' },
    { key: 'eff', label: 'Goodput efficiency', icon: 'gauge' },
    { key: 'lat', label: 'Latency added by the detour', icon: 'clock' },
    { key: 'cores', label: 'Cores to encrypt the link', icon: 'cpu' },
  ],
  goals: [
    { text: 'What a VPN protects, and from whom', step: 1 },
    { text: 'Encapsulation: packets inside packets', step: 2 },
    { text: 'Key exchange and the protocols (WireGuard, IPsec, OpenVPN)', step: 3 },
    { text: 'MTU, fragmentation and efficiency', step: 4 },
    { text: 'Detour latency, crypto CPU and what a VPN cannot do', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'mtu', label: 'Link MTU', min: 576, max: 9000, step: 4, default: 1500, unit: ' B', description: 'Maximum packet size on the physical network.' },
      { key: 'ovh', label: 'Tunnel overhead per packet', min: 20, max: 200, step: 1, default: 60, unit: ' B', description: 'Outer IP + UDP + tunnel header + authentication tag (WireGuard over IPv4 ≈ 60).' },
      { key: 'direct', label: 'Direct latency to the destination', min: 1, max: 300, step: 1, default: 50, unit: ' ms', description: 'Round trip without the VPN.' },
      { key: 'toVpn', label: 'Latency to the VPN server', min: 1, max: 300, step: 1, default: 30, unit: ' ms', description: 'Round trip from you to the VPN endpoint.' },
      { key: 'vpnDest', label: 'Latency from VPN server to destination', min: 1, max: 300, step: 1, default: 40, unit: ' ms', description: 'Round trip from the VPN endpoint onward.' },
      { key: 'gbps', label: 'Link throughput', min: 0.1, max: 100, step: 0.1, default: 10, unit: ' Gbps', description: 'Traffic the VPN gateway must carry.' },
      { key: 'core', label: 'Encryption throughput per core', min: 0.2, max: 10, step: 0.1, default: 2, unit: ' Gbps', description: 'AEAD (AES-GCM / ChaCha20) speed per core at line packet sizes.' },
    ],
    calculate: (input, step) => {
      const mtu = Math.max(200, input.mtu ?? 1500);
      const ovh = Math.max(1, input.ovh ?? 60);
      const direct = Math.max(1, input.direct ?? 50);
      const toVpn = Math.max(0.5, input.toVpn ?? 30);
      const vd = Math.max(0.5, input.vpnDest ?? 40);
      const gbps = Math.max(0.01, input.gbps ?? 10);
      const core = Math.max(0.1, input.core ?? 2);
      // The inner packet must fit inside the outer one: inner MTU = link MTU − tunnel overhead.
      const inner = mtu - ovh;
      // TCP/IP headers take 40 bytes (IPv4 + TCP) of each inner packet.
      const eff = Math.max(0, (inner - 40) / mtu);
      const add = toVpn + vd - direct;
      return {
        mtu: step < 3 ? { v: '—' } : { v: `${inner} B inner MTU (${mtu} − ${ovh})` },
        eff: step < 3 ? { v: '—' } : { v: `${(eff * 100).toFixed(1)}% (vs ${(((mtu - 40) / mtu) * 100).toFixed(1)}% without the VPN)`, tone: eff > 0.9 ? 'good' : 'warn' },
        lat: step < 4 ? { v: '—' } : { v: add >= 0 ? `+${fmtMs(add)}` : `${fmtMs(add)} (the VPN route is faster)`, tone: add < 15 ? 'good' : add < 60 ? 'warn' : 'bad' },
        cores: step < 4 ? { v: '—' } : { v: `${fmtN(Math.max(1, Math.ceil(gbps / core)))} cores`, tone: gbps / core < 8 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Purpose',
      kind: 'insight',
      title: 'An encrypted tunnel to a trusted network',
      body: [
        'A <b>virtual private network</b> creates an <b>encrypted, authenticated tunnel</b> between your device and a VPN server, and routes your traffic through it. Two main uses: <b>remote access</b> to a private network (a corporate VPN puts your laptop “inside” the office network), and <b>privacy on untrusted networks</b> (a commercial VPN encrypts traffic across coffee-shop Wi-Fi or hides your destinations from your ISP).',
        'Be precise about who sees what. The local network and ISP see only <b>encrypted packets to the VPN server</b> — not sites or contents. The <b>VPN operator</b> sees your real IP and the destinations (but not HTTPS contents). The <b>destination</b> sees the VPN server’s IP instead of yours. A VPN moves trust from your ISP to the VPN provider — it doesn’t create anonymity by itself.',
      ],
      scene: { nodes: [client(), isp({ tag: pill('sees only ciphertext', 'lock') }), vpn({ tag: pill('sees your destinations', 'search', 'warn') }), dest({ tag: pill('sees the VPN’s IP', 'globe') })], links: [link('client', 'vpn', { arrow: 'both' }), link('vpn', 'dest', { arrow: 'both' }), link('client', 'isp', { style: 'dashed' })], flows: [flow(['client', 'vpn', 'dest'], { kind: 'write', rate: 1.5, back: true })] },
    },
    {
      short: 'Tunnel',
      kind: 'technique',
      title: 'Encapsulation: packets inside packets',
      body: [
        'The device’s <b>virtual network interface</b> (a TUN device) captures outgoing IP packets. The VPN software <b>encrypts each whole packet</b> (headers included) and wraps it in a <b>new outer packet</b> addressed to the VPN server — typically UDP, so reliability is left to the inner TCP and the tunnel adds no second retransmission layer. The server decrypts, extracts the inner packet and forwards it to its real destination (using NAT, see that lesson); replies take the reverse path.',
        'In a <b>site-to-site</b> or remote-access design, the inner packets carry <b>private addresses</b> (10.x.x.x) that only make sense inside the far network — the tunnel is what makes them reachable. <b>Split tunnelling</b> sends only traffic for specific networks through the VPN and the rest directly; <b>full tunnel</b> sends everything (more privacy and control, more load and latency).',
      ],
      changes: [{ text: 'Inner packet encrypted and wrapped in an outer UDP packet', tone: 'info' }, { text: 'Split tunnel vs full tunnel', tone: 'info' }],
      scene: { nodes: [client({ tag: pill('inner packet to 10.0.4.7', 'file') }), box('enc', -8, 0, 'Encrypt + encapsulate', 'orange', 'lock', { size: [1.3, 1.3], height: 24, tag: pill('outer: UDP → VPN server', 'hash') }), vpn({ tag: pill('decrypt, forward inner packet', 'check') })], links: [link('client', 'enc'), link('enc', 'vpn')], flows: [flow(['client', 'enc', 'vpn'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Protocols',
      kind: 'technique',
      title: 'Keys and protocols: WireGuard, IPsec, OpenVPN',
      body: [
        'The tunnel needs a shared secret agreed over an untrusted network: a <b>key exchange</b> with ephemeral Diffie–Hellman gives <b>forward secrecy</b> (see the TLS lesson), and each side authenticates with certificates, pre-shared keys or static public keys. <b>WireGuard</b> is small (~4,000 lines), uses fixed modern primitives (Curve25519, ChaCha20-Poly1305), identifies peers by public key and re-keys every couple of minutes; <b>IPsec</b> (IKEv2 + ESP) is the standards-based workhorse built into operating systems and routers, with many options; <b>OpenVPN</b> runs in user space over TLS, flexible and widely deployed but slower.',
        'Fewer options mean fewer misconfigurations — a reason WireGuard is popular — while IPsec’s breadth suits site-to-site links between heterogeneous equipment. All of them add a <b>per-packet header and authentication tag</b>, which is the cost we count next.',
      ],
      changes: [{ text: 'Ephemeral DH → forward secrecy; keys rotate', tone: 'good' }, { text: 'WireGuard: small and fast · IPsec: standard and broad · OpenVPN: flexible, user-space', tone: 'info' }],
      scene: { nodes: [client({ tag: pill('public key', 'hash') }), box('hs', -8, 0, 'Handshake: ECDH + auth', 'teal', 'refresh', { size: [1.3, 1.3], height: 22 }), vpn({ tag: pill('public key', 'hash') })], links: [link('client', 'vpn', { arrow: 'both' })], flows: [flow(['client', 'vpn'], { kind: 'handshake', rate: 1, back: true })] },
    },
    {
      short: 'MTU',
      kind: 'problem',
      title: 'Overhead, MTU and fragmentation',
      body: [
        'Every tunnelled packet carries an outer IP header, a UDP header, the tunnel header and an authentication tag — about <b>60 bytes</b> for WireGuard over IPv4 (80 over IPv6). On a 1,500-byte link the <b>inner MTU shrinks to 1,440</b>. If the sender doesn’t know and sends 1,500-byte packets, they no longer fit: the outer packet must be <b>fragmented</b> (slow, often dropped by firewalls) or dropped with an ICMP message that some networks block, producing the classic symptom: <b>small requests work, large transfers hang</b> (“PMTUD black hole”).',
        'Fixes: set the tunnel interface MTU explicitly (1,420–1,440), and <b>clamp TCP MSS</b> so TCP never builds packets that won’t fit. The throughput cost is direct: payload efficiency falls from 97.3% ((1,500 − 40) ÷ 1,500) to <b>93.3%</b> through the tunnel — about 4% less goodput on bulk transfers, more on small packets where fixed overhead dominates.',
      ],
      changes: [{ text: 'Inner MTU = link MTU − overhead (1,500 − 60 = 1,440)', tone: 'info' }, { text: 'Black hole: small works, big hangs → clamp MSS', tone: 'bad' }],
      scene: { nodes: [client({ tag: pill('1,500 B packet', 'alert', 'warn') }), box('enc', -8, 0, 'Encapsulate: +60 B', 'orange', 'lock', { size: [1.3, 1.3], height: 24, tag: pill('1,560 B > MTU → fragment / drop', 'alert', 'bad') }), vpn()], links: [link('client', 'enc'), link('enc', 'vpn', { style: 'broken' })], flows: [flow(['client', 'enc'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Latency & CPU',
      kind: 'tradeoff',
      title: 'Detour latency, crypto CPU and limits',
      body: [
        'Traffic now goes <b>client → VPN server → destination</b> instead of directly. If you are 30 ms from the VPN and it is 40 ms from the destination (70 ms) while the direct path is 50 ms, the detour adds <b>20 ms</b>; a far-away VPN endpoint adds far more (or occasionally less, if the VPN has a better route). Encryption costs CPU: modern AEAD ciphers with hardware support run ~2 Gbps per core, so a 10 Gbps gateway needs <b>5 cores</b> of crypto plus packet handling — which is why gateways use multiple queues and, on busy sites, hardware offload.',
        'What a VPN does <i>not</i> do: it doesn’t make you anonymous to the sites you log into, doesn’t protect against malware or phishing, and doesn’t secure the traffic beyond the VPN server (use HTTPS end-to-end). For corporate access, modern <b>zero-trust</b> designs replace “inside the VPN = trusted” with per-application, identity- and device-aware access — a VPN grants network-level reach, which is more than most users need. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: '30 + 40 − 50 = +20 ms detour', tone: 'info' }, { text: '10 Gbps ÷ 2 Gbps per core = 5 cores', tone: 'info' }, { text: 'Not anonymity, not malware protection', tone: 'bad' }],
      scene: { nodes: [client(), vpn({ tag: pill('+20 ms detour · crypto CPU', 'clock', 'warn') }), dest()], links: [link('client', 'vpn'), link('vpn', 'dest'), link('client', 'dest', { style: 'dashed' })], flows: [flow(['client', 'vpn', 'dest'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Encrypt, encapsulate, forward — and pay in bytes and milliseconds',
      body: [
        'A VPN <b>encrypts whole packets and wraps them in new ones</b> addressed to a VPN server, using an ephemeral key exchange (WireGuard, IPsec, OpenVPN). It hides traffic from the local network and ISP, shifting trust to the VPN operator.',
        'Costs: ~60 bytes per packet (inner MTU 1,440; clamp MSS), detour latency (<code>to-VPN + VPN-to-destination − direct</code>) and crypto CPU (Gbps ÷ per-core speed).',
      ],
      scene: { nodes: [client(), vpn(), dest()], links: [link('client', 'vpn', { arrow: 'both' }), link('vpn', 'dest', { arrow: 'both' })], flows: [flow(['client', 'vpn', 'dest'], { kind: 'write', rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
