import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const hosts = (extra: Partial<SceneNode> = {}) => crowd('hosts', -18, 0, 12, 'devices in a subnet', extra);
const router = (extra: Partial<SceneNode> = {}) => box('router', -8, 0, 'Router (default gateway)', 'orange', 'route', { size: [1.6, 1.6], height: 28, ...extra });
const nat = (extra: Partial<SceneNode> = {}) => box('nat', 2, -7, 'NAT gateway (private → public)', 'purple', 'share', { size: [1.4, 1.4], height: 24, ...extra });
const net = (extra: Partial<SceneNode> = {}) => box('net', 12, 0, 'Internet', 'blue', 'globe', { size: [1.7, 1.5], height: 22, ...extra });
const table = (extra: Partial<SceneNode> = {}) => db('table', 2, 7, 'Routing table (CIDR prefixes)', { size: [1.4, 1.4], ...extra });
const v6 = (extra: Partial<SceneNode> = {}) => box('v6', 2, 0, 'IPv6 path (no NAT needed)', 'green', 'wifi', { size: [1.4, 1.4], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e21 ? `${(n / 1e21).toFixed(1)}×10²¹` : n >= 1e18 ? `${(n / 1e18).toFixed(1)}×10¹⁸` : n >= 1e15 ? `${(n / 1e15).toFixed(1)}×10¹⁵` : n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-ipv4-vs-ipv6-differences',
  title: 'IP Addressing: CIDR, Subnets, NAT and IPv6',
  blurb: 'How a 32-bit address splits into network and host with a prefix length, how to size and carve subnets without wasting space, why IPv4 ran out and NAT papered over it, and what IPv6’s 128 bits change.',
  minutes: 13,
  level: 'Beginner',
  metrics: [
    { key: 'prefix', label: 'Smallest prefix that fits the hosts', icon: 'filter' },
    { key: 'usable', label: 'Usable hosts and utilisation', icon: 'users' },
    { key: 'fit', label: 'Subnets that fit in the parent block', icon: 'layers' },
    { key: 'cap', label: 'Parent block: addresses, spare subnets', icon: 'calc' },
    { key: 'v6', label: 'IPv6: /64 subnets in a /48, hosts per /64', icon: 'wifi' },
  ],
  goals: [
    { text: 'Addresses, masks and CIDR prefixes', step: 1 },
    { text: 'Subnetting: sizing and carving a block', step: 2 },
    { text: 'Special ranges, routing and longest-prefix match', step: 3 },
    { text: 'Exhaustion and NAT', step: 4 },
    { text: 'IPv6: what changes, and migration', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'hosts', label: 'Hosts needed in each subnet', min: 1, max: 100000, step: 1, default: 500, unit: '', description: 'Devices or pods per subnet.' },
      { key: 'subnets', label: 'Subnets required', min: 1, max: 4096, step: 1, default: 40, unit: '', description: 'Number of subnets in the design.' },
      { key: 'parent', label: 'Parent block prefix length', min: 8, max: 28, step: 1, default: 16, unit: ' (/n)', description: 'e.g. 16 = a /16 such as 10.20.0.0/16.' },
    ],
    calculate: (input, step) => {
      const hosts = Math.max(1, Math.round(input.hosts ?? 500));
      const subnets = Math.max(1, Math.round(input.subnets ?? 40));
      const parent = Math.min(30, Math.max(1, Math.round(input.parent ?? 16)));
      // Smallest prefix with at least hosts + 2 addresses (network and broadcast).
      const hostBits = Math.max(2, Math.ceil(Math.log2(hosts + 2)));
      const prefix = Math.max(1, 32 - hostBits);
      const size = Math.pow(2, hostBits);
      const usable = size - 2;
      const fit = prefix >= parent ? Math.pow(2, prefix - parent) : 0;
      const parentSize = Math.pow(2, 32 - parent);
      const spare = fit - subnets;
      return {
        prefix: step < 2 ? { v: '—' } : { v: `/${prefix} (${size.toLocaleString('en-US')} addresses)` },
        usable: step < 2 ? { v: '—' } : { v: `${usable.toLocaleString('en-US')} usable · ${((hosts / usable) * 100).toFixed(0)}% used`, tone: hosts / usable > 0.5 ? 'good' : 'warn' },
        fit: step < 2 ? { v: '—' } : { v: fit > 0 ? `${fit.toLocaleString('en-US')} subnets of /${prefix} fit in a /${parent}` : `a /${prefix} is larger than the /${parent} parent`, tone: spare >= 0 ? 'good' : 'bad' },
        cap: step < 2 ? { v: '—' } : { v: `${fmtN(parentSize)} addresses · ${spare >= 0 ? `${spare.toLocaleString('en-US')} spare subnets` : `short by ${(-spare).toLocaleString('en-US')} subnets`}`, tone: spare >= 0 ? 'good' : 'bad' },
        v6: step < 5 ? { v: '—' } : { v: `${(65536).toLocaleString('en-US')} subnets · ${fmtN(Math.pow(2, 64))} hosts each` },
      };
    },
  },
  steps: [
    {
      short: 'CIDR',
      kind: 'technique',
      title: 'An address is a network part plus a host part',
      body: [
        'An <b>IPv4 address</b> is 32 bits, written as four decimal bytes (<code>192.168.10.37</code>). Routers don’t track individual addresses; they route by <b>network prefix</b>. <b>CIDR</b> (Classless Inter-Domain Routing, RFC 4632) writes this as address/<b>prefix length</b>: <code>192.168.10.0/24</code> means the first 24 bits identify the network and the remaining 8 bits number the hosts in it. The equivalent <b>subnet mask</b> is 24 ones followed by 8 zeros: <code>255.255.255.0</code>. A host finds out whether a destination is local by computing <code>destination AND mask</code> and comparing with its own network.',
        'The arithmetic is powers of two: a /<i>n</i> block has <code>2^(32−n)</code> addresses — /24 = 256, /16 = 65,536, /8 = 16.7 million, /32 = one host. In a normal subnet the <b>first address is the network id and the last is the broadcast</b>, so usable hosts = <code>2^(32−n) − 2</code> (/24 → 254). Before CIDR, classful addressing (A/B/C) forced wasteful sizes: a company needing 500 addresses got a 65,536-address Class B; prefix lengths fixed that by allowing any size.',
      ],
      changes: [{ text: '/n → 2^(32−n) addresses; usable = that − 2', tone: 'info' }, { text: 'Local check: (dest AND mask) == (my IP AND mask)', tone: 'info' }],
      concepts: [{ term: 'CIDR prefix', def: 'The number of leading bits that identify the network; the rest identify the host within it.' }],
      scene: { nodes: [hosts({ tag: pill('192.168.10.0/24 · 254 hosts', 'list') }), router({ tag: pill('192.168.10.1 (gateway)', 'route') }), net()], links: [link('hosts', 'router'), link('router', 'net')], flows: [flow(['hosts', 'router', 'net'], { rate: 1.4, back: true })] },
    },
    {
      short: 'Subnets',
      kind: 'technique',
      title: 'Subnetting: size each subnet, then carve the parent',
      body: [
        '<b>Sizing</b>: find the smallest block with ≥ hosts + 2 addresses. For 500 hosts: 2⁹ = 512 ≥ 502, so host bits = 9 and the prefix is <b>/23</b> (510 usable, 98% utilised); 300 hosts also needs a /23 (a /24’s 254 is too few) at only 59% used. Cloud designs add extra reservations (a provider reserves several addresses per subnet, and Kubernetes pods or ENIs can consume many per node), so over-provision host counts accordingly and prefer larger subnets in clouds where you can’t renumber easily.',
        '<b>Carving</b>: a parent /16 splits into 2^(23−16) = <b>128 subnets of /23</b>. Needing 40 leaves 88 spare for growth — plan address space top-down: a block per region or environment, sub-blocks per tier or availability zone, <b>aligned on power-of-two boundaries</b> and leaving contiguous room to grow so routes can <b>summarise</b> (one /16 advertisement instead of 128 routes). Avoid overlapping ranges between networks you may later connect (VPC peering, VPN, mergers) — overlap is expensive to fix.',
      ],
      changes: [{ text: '500 hosts → /23: 510 usable, 98% utilised', tone: 'info' }, { text: '/16 holds 128 × /23; need 40, 88 spare', tone: 'good' }, { text: 'Align on power-of-two boundaries; avoid overlaps; leave room to grow', tone: 'good' }],
      scene: { nodes: [router({ tag: pill('10.20.0.0/16 parent', 'filter') }), hosts({ tag: pill('/23 · 510 hosts', 'list') }), table({ tag: pill('summarise: 10.20.0.0/16', 'list', 'good') })], links: [link('hosts', 'router'), link('router', 'table')], flows: [flow(['hosts', 'router', 'table'], { rate: 1.2 })] },
    },
    {
      short: 'Routing',
      kind: 'technique',
      title: 'Special ranges and longest-prefix match',
      body: [
        '<b>Reserved ranges</b>: private addresses (RFC 1918) <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code>, <code>192.168.0.0/16</code> — not routable on the public internet; <code>127.0.0.0/8</code> loopback; <code>169.254.0.0/16</code> link-local (the “no DHCP” address); <code>100.64.0.0/10</code> carrier-grade NAT; <code>224.0.0.0/4</code> multicast. Everything else is public, allocated by IANA to Regional Internet Registries and on to ISPs and organisations.',
        'A router’s table maps prefixes to next hops, and a packet matches <b>the most specific prefix</b> (<b>longest-prefix match</b>): a route for <code>10.20.5.0/24</code> beats <code>10.20.0.0/16</code>, which beats <code>0.0.0.0/0</code> (the default route). That is how operators carve exceptions (send one /24 through a firewall) and how <b>route aggregation</b> keeps the internet’s global table at ~1 million IPv4 prefixes rather than billions of hosts. Lookups use tries or TCAM hardware to match in nanoseconds at line rate.',
      ],
      changes: [{ text: 'Private: 10/8 · 172.16/12 · 192.168/16; link-local 169.254/16', tone: 'info' }, { text: 'Longest-prefix match: /24 beats /16 beats 0.0.0.0/0', tone: 'good' }],
      scene: { nodes: [router({ tag: pill('longest prefix wins', 'search') }), table({ tag: pill('10.20.5.0/24 · 10.20.0.0/16 · 0.0.0.0/0', 'list') }), net()], links: [link('router', 'table'), link('router', 'net')], flows: [flow(['router', 'table'], { rate: 1.2, back: true }), flow(['router', 'net'], { rate: 1.4 })] },
    },
    {
      short: 'NAT',
      kind: 'problem',
      title: 'Exhaustion, and the workaround that became permanent',
      body: [
        'IPv4 has 2³² ≈ <b>4.3 billion</b> addresses; with reserved ranges, fewer are usable — fewer than one per person, before counting phones, laptops, servers and IoT. IANA allocated its last blocks in 2011, and the regional registries have since exhausted their pools; addresses are now traded and leased. The stop-gap is <b>NAT</b> (see the NAT lesson): many devices on private addresses share one or a few public addresses, with the NAT gateway rewriting source address and port and keeping a translation table. Carrier-grade NAT repeats the trick at the ISP, putting thousands of customers behind one address.',
        'NAT works for outbound client traffic but breaks the original end-to-end model: inbound connections need port forwarding, peer-to-peer apps need hole-punching (STUN/ICE/TURN — see the WebRTC and Video Conferencing lessons), logs attribute one address to many users, and each translation consumes gateway state (see the Firewall lesson on connection tables). Cloud networks add a bill: NAT gateways charge per hour and per GB processed. These costs are the real driver for IPv6.',
      ],
      changes: [{ text: '4.3B IPv4 addresses; registries exhausted', tone: 'bad' }, { text: 'NAT shares addresses but breaks inbound and end-to-end', tone: 'bad' }],
      scene: { nodes: [hosts({ tag: pill('10.x private', 'list') }), router(), nat({ tag: pill('203.0.113.7: ports 1024–65535', 'share') }), net()], links: [link('hosts', 'router'), link('router', 'nat'), link('nat', 'net')], flows: [flow(['hosts', 'router', 'nat', 'net'], { rate: 1.4, back: true }), flow(['net', 'nat'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'IPv6',
      kind: 'technique',
      title: 'IPv6: 128 bits, simpler packets, no NAT',
      body: [
        'IPv6 addresses are <b>128 bits</b> written as eight 16-bit hex groups (<code>2001:db8:abcd:12::1</code>, with <code>::</code> compressing a run of zero groups): about <b>3.4×10³⁸</b> addresses. The conventional layout gives every site a <b>/48</b> (65,536 subnets) and every subnet a <b>/64</b> — <b>1.8×10¹⁹ hosts per subnet</b>, so address scarcity, careful subnet sizing and NAT all go away; one /48 holds more addresses than the whole IPv4 internet squared. Hosts configure themselves with <b>SLAAC</b> (router advertisements) or DHCPv6, and every device can have a globally routable address — with a stateful firewall doing the protection NAT was wrongly assumed to provide.',
        'Other changes: a <b>fixed 40-byte header</b> (no header checksum, extension headers for options) that’s cheaper to process; <b>no broadcast</b> (multicast and <b>NDP</b> replace ARP); <b>routers never fragment</b> (the sender does Path MTU Discovery); mandatory support for IPsec in the spec, though not its use. Migration is gradual: <b>dual stack</b> (hosts speak both — clients try IPv6 first with “Happy Eyeballs” fallback), <b>NAT64/DNS64</b> for IPv6-only networks reaching IPv4 servers, and tunnels. Check the checklist: AAAA records, IPv6 firewall rules, monitoring and logging that parse 128-bit addresses, and subnetting by /64. All figures in this lesson are model outputs from the stated inputs.',
      ],
      changes: [{ text: '128-bit; /48 per site = 65,536 /64 subnets; /64 = 1.8×10¹⁹ hosts', tone: 'good' }, { text: 'Fixed 40-byte header; NDP not ARP; no router fragmentation', tone: 'info' }, { text: 'Dual stack + Happy Eyeballs; add AAAA and IPv6 firewall rules', tone: 'good' }],
      scene: { nodes: [hosts({ tag: pill('SLAAC: 2001:db8::/64', 'wifi') }), router({ tag: pill('router advertisements', 'route') }), v6({ tag: pill('globally routable, firewall-protected', 'shield', 'good') }), net()], links: [link('hosts', 'router'), link('router', 'v6'), link('v6', 'net')], flows: [flow(['hosts', 'router', 'v6', 'net'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Prefix length decides everything: size, routing, scarcity',
      body: [
        'An address splits into <b>network/host</b> by a <b>CIDR prefix</b>; a /n block holds 2^(32−n) addresses (minus 2 usable). Size subnets to the next power of two (500 hosts → /23), carve the parent top-down with room to grow, and route by <b>longest-prefix match</b> with summarised prefixes.',
        'IPv4 ran out and NAT stretched it; <b>IPv6</b> restores abundance (/64 per subnet), self-configuration and a simpler header, adopted through dual stack.',
      ],
      scene: { nodes: [hosts(), router(), nat(), v6(), net()], links: [link('hosts', 'router'), link('router', 'nat'), link('router', 'v6'), link('nat', 'net'), link('v6', 'net')], flows: [flow(['hosts', 'router', 'v6', 'net'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
