import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const lan = (extra: Partial<SceneNode> = {}) => crowd('lan', -15, 0, 8, 'private hosts (192.168.x.x)', extra);
const nat = (extra: Partial<SceneNode> = {}) => box('nat', -4, 0, 'NAT gateway', 'orange', 'route', { size: [1.5, 1.5], height: 32, ...extra });
const table = (extra: Partial<SceneNode> = {}) => db('table', -4, 8, 'Translation table', { size: [1.3, 1.3], ...extra });
const web = (extra: Partial<SceneNode> = {}) => box('web', 8, 0, 'Internet server', 'blue', 'globe', { size: [1.4, 1.4], height: 30, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-how-nat-enabled-the-internet',
  title: 'How NAT Works',
  blurb: 'Port translation, the connection table, why inbound connections fail, and the port arithmetic behind carrier-grade NAT.',
  minutes: 11,
  level: 'Beginner',
  metrics: [
    { key: 'per', label: 'Subscribers sharing one public IP', icon: 'users' },
    { key: 'ips', label: 'Public IPs needed', icon: 'globe' },
    { key: 'head', label: 'Port headroom at peak', icon: 'gauge' },
    { key: 'saved', label: 'IPv4 addresses saved vs 1:1', icon: 'check' },
  ],
  goals: [
    { text: 'The IPv4 shortage and private address ranges', step: 1 },
    { text: 'How translation and the connection table work', step: 2 },
    { text: 'Why inbound connections fail and how P2P works around it', step: 4 },
    { text: 'Carrier-grade NAT and port blocks', step: 5 },
    { text: 'Limits: state, timeouts and logging', step: 6 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'subs', label: 'Subscribers', min: 1000, max: 20000000, step: 1000, default: 1000000, unit: '', description: 'Customers behind the carrier’s NAT.' },
      { key: 'block', label: 'Ports allocated per subscriber', min: 128, max: 16384, step: 128, default: 1024, unit: '', description: 'Port block reserved for each subscriber on a shared IP.' },
      { key: 'peak', label: 'Peak simultaneous connections per subscriber', min: 10, max: 5000, step: 10, default: 300, unit: '', description: 'Browsers, apps and devices in one household at the busiest moment.' },
    ],
    calculate: (input, step) => {
      const subs = Math.max(1, input.subs ?? 1e6);
      const block = Math.max(1, input.block ?? 1024);
      const peak = Math.max(1, input.peak ?? 300);
      const usable = 64512; // ports 1024–65535
      const per = Math.max(1, Math.floor(usable / block));
      const ips = Math.ceil(subs / per);
      const head = block / peak;
      return {
        per: step < 4 ? { v: '—' } : { v: `${per}`, tone: 'good' },
        ips: step < 4 ? { v: '—' } : { v: fmtN(ips) },
        head: step < 4 ? { v: '—' } : { v: head >= 1 ? `${head.toFixed(1)}× spare` : `${(peak - block).toLocaleString('en-US')} connections short`, tone: head >= 2 ? 'good' : head >= 1 ? 'warn' : 'bad' },
        saved: step < 4 ? { v: '—' } : { v: `${fmtN(subs - ips)} (${((1 - ips / subs) * 100).toFixed(1)}%)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Shortage',
      kind: 'problem',
      title: 'Four billion addresses were never enough',
      body: [
        'IPv4 has about 4.3 billion addresses; with billions of devices, they ran out. Three ranges were set aside as <b>private</b> — <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code>, <code>192.168.0.0/16</code> — usable by anyone inside their own network but <b>not routable on the public internet</b>. Millions of homes can each reuse 192.168.1.x.',
        'To let those hosts talk to the internet, something must rewrite their addresses on the way out: <b>Network Address Translation</b>. It let IPv4 stretch by decades, at a cost to the end-to-end design of the internet.',
      ],
      scene: { nodes: [lan(), nat({ tag: pill('one public IP', 'globe') }), web()], links: [link('lan', 'nat'), link('nat', 'web')], flows: [flow(['lan', 'nat', 'web'], { rate: 1.5 })] },
    },
    {
      short: 'Translate',
      kind: 'technique',
      title: 'Rewriting addresses and ports',
      body: [
        'A host <code>192.168.1.10:51000</code> opens a connection to <code>93.184.216.34:443</code>. The NAT gateway rewrites the source to its <b>public address and a chosen port</b> — <code>203.0.113.5:40001</code> — and records the mapping in its <b>translation table</b>: <code>(192.168.1.10, 51000) ⇄ (203.0.113.5, 40001)</code>. The reply to <code>203.0.113.5:40001</code> is looked up, rewritten back to the private address and forwarded.',
        'Rewriting the <i>port</i> as well as the address is what lets thousands of hosts share <b>one</b> public IP (“NAPT” or PAT): the port number distinguishes the conversations. Checksums are recalculated; some protocols that embed addresses in their payload (FTP, SIP) need application-level gateways.',
      ],
      changes: [{ text: '(192.168.1.10:51000) → (203.0.113.5:40001)', tone: 'info' }, { text: 'Replies looked up in the table and rewritten back', tone: 'info' }],
      scene: { nodes: [lan({ tag: pill('192.168.1.10:51000', 'hash') }), nat({ tag: pill('→ 203.0.113.5:40001', 'refresh') }), table({ tag: pill('mapping stored', 'check') }), web({ tag: pill('sees 203.0.113.5:40001', 'search') })], links: [link('lan', 'nat'), link('nat', 'table', { style: 'dashed' }), link('nat', 'web')], flows: [flow(['lan', 'nat', 'web'], { rate: 1.5, back: true })] },
    },
    {
      short: 'State',
      kind: 'technique',
      title: 'NAT is stateful, with timeouts',
      body: [
        'An entry is created on the first outbound packet and removed when the flow ends (TCP FIN/RST) or after an <b>idle timeout</b> — minutes for established TCP, tens of seconds for UDP. A long-lived idle connection (an SSH session, a websocket) may be silently dropped from the table; the application then sends data that the NAT no longer recognises. Hence <b>keepalives</b> every 15–30 s.',
        'Each entry consumes memory and a port: the table is a finite resource. Busy gateways track hundreds of thousands to millions of flows, and a flood of connections (or a port-scanning host) can exhaust it — see the capacity arithmetic in a later step.',
      ],
      changes: [{ text: 'Idle timeouts drop quiet flows', tone: 'bad' }, { text: 'Keepalives every 15–30 s keep them alive', tone: 'good' }],
      scene: { nodes: [nat({ tag: pill('entry expires after idle', 'clock', 'warn') }), table({ tag: pill('finite table', 'disk') })], links: [link('nat', 'table')], flows: [] },
    },
    {
      short: 'Inbound',
      kind: 'problem',
      title: 'Nothing can connect in — unless you let it',
      body: [
        'An unsolicited packet from the internet to <code>203.0.113.5:8080</code> matches no table entry, so the NAT drops it: a useful accidental firewall, but it breaks anything needing inbound connections — hosting a server, video calls, peer-to-peer games. Fixes: <b>port forwarding</b> (a static rule: public port 8080 → 192.168.1.20:80), <b>UPnP/NAT-PMP</b> (the device asks the router to open one), or <b>hole punching</b>.',
        'In <b>hole punching</b> two peers behind different NATs each send outbound packets to the other, via a rendezvous server that tells them each other’s public address and port (<b>STUN</b>); each NAT creates an entry that lets the other’s packets in. When NAT types make that impossible, traffic goes through a <b>relay</b> (<b>TURN</b>) — WebRTC tries direct first and falls back automatically (ICE).',
      ],
      changes: [{ text: 'Unsolicited inbound packet: no mapping → dropped', tone: 'bad' }, { text: 'Port forwarding · UPnP · STUN hole punching · TURN relay', tone: 'good' }],
      scene: { nodes: [web({ name: 'Peer on the internet', tag: pill('connects in?', 'alert', 'warn') }), nat({ tag: pill('no entry → drop', 'lock', 'bad') }), lan()], links: [link('web', 'nat', { style: 'broken' }), link('nat', 'lan', { style: 'dashed' })], flows: [flow(['web', 'nat'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'CGNAT',
      kind: 'technique',
      title: 'Carrier-grade NAT: sharing one IP across subscribers',
      body: [
        'ISPs short of addresses put <b>another layer of NAT in their own network</b> (CGNAT), so many customers share a public IP. A public IP has about 64,512 usable ports; allocating each subscriber a <b>block of 1,024 ports</b> lets <b>63 subscribers</b> share one address. For 1 million subscribers that is ~15,900 public IPs instead of 1,000,000 — <b>98.4% saved</b>.',
        'The block size is the trade-off: bigger blocks mean fewer subscribers per IP; smaller ones risk <b>port exhaustion</b> — a household with 300 simultaneous connections is fine at 1,024 ports (3.4× headroom) but breaks at 256. Heavy users (many tabs, torrenting, big NAT’d offices) hit the limit first, and symptoms look like random connection failures.',
      ],
      changes: [{ text: '64,512 ports ÷ 1,024 = 63 subscribers per IP', tone: 'info' }, { text: '1M subscribers → ~15,900 IPs', tone: 'good' }, { text: 'Exhausted block → random failures', tone: 'bad' }],
      scene: { nodes: [lan({ tag: pill('1,024-port block each', 'list') }), nat({ name: 'CGNAT', tag: pill('63 subscribers / IP', 'users') }), web()], links: [link('lan', 'nat'), link('nat', 'web')], flows: [flow(['lan', 'nat', 'web'], { rate: 2 })] },
    },
    {
      short: 'Costs',
      kind: 'tradeoff',
      title: 'What NAT costs',
      body: [
        '<b>Breaks end-to-end addressing</b>: peers can’t address each other directly, so P2P needs STUN/TURN and servers need forwarding. <b>Stateful</b>: gateways hold per-flow memory, can be a bottleneck or single point of failure, and lose mappings on failover unless state is replicated. <b>Attribution</b>: with a shared public IP, abuse reports and legal requests need <b>logs of IP+port+time</b> to identify a subscriber — large storage and a compliance burden. <b>Security through obscurity</b> only: NAT isn’t a firewall, though it behaves like one for inbound.',
        'IPv6 removes the shortage — every device gets a globally routable address and NAT is unnecessary (firewalls still are). Meanwhile IPv4 NAT, and CGNAT in particular, will be with us for years. Figures here are model outputs.',
      ],
      scene: { nodes: [box('e2e', -8, -4, 'End-to-end broken', 'red', 'alert', { size: [1.3, 1.3], height: 20 }), box('st', 2, -4, 'Stateful gateway', 'orange', 'db', { size: [1.3, 1.3], height: 22 }), box('lg', 12, -4, 'IP+port logging', 'purple', 'list', { size: [1.3, 1.3], height: 22 }), box('v6', 2, 6, 'IPv6: no NAT needed', 'green', 'check', { size: [1.3, 1.3], height: 24 })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Share addresses by translating ports',
      body: [
        'NAT rewrites private addresses and ports to a public ones, tracking each flow in a <b>stateful table</b> with idle timeouts. It blocks unsolicited inbound traffic (port forwarding, UPnP, STUN/TURN work around it), and CGNAT stretches addresses further by giving each subscriber a <b>port block</b> — 63 subscribers per IP at 1,024 ports each.',
        'Size the block from peak concurrent connections, keep keepalives for long-lived flows, log mappings for accountability, and plan for IPv6.',
      ],
      scene: { nodes: [lan(), nat(), table(), web()], links: [link('lan', 'nat'), link('nat', 'table', { style: 'dashed' }), link('nat', 'web')], flows: [flow(['lan', 'nat', 'web'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
