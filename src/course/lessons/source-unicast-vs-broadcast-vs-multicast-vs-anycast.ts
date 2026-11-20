import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const src = (extra: Partial<SceneNode> = {}) => box('src', -18, 0, 'Sender', 'teal', 'server', { size: [1.5, 1.5], height: 28, ...extra });
const r1 = (extra: Partial<SceneNode> = {}) => box('r1', -8, 0, 'Router', 'purple', 'route', { size: [1.4, 1.4], height: 22, ...extra });
const r2 = (extra: Partial<SceneNode> = {}) => box('r2', 0, -7, 'Router A', 'purple', 'route', { size: [1.2, 1.2], height: 20, ...extra });
const r3 = (extra: Partial<SceneNode> = {}) => box('r3', 0, 7, 'Router B', 'purple', 'route', { size: [1.2, 1.2], height: 20, ...extra });
const rx = (extra: Partial<SceneNode> = {}) => crowd('rx', 11, 0, 12, 'receivers', extra);
const pop = (id: string, y: number, name: string, extra: Partial<SceneNode> = {}) => box(id, 8, y, name, 'orange', 'cloud', { size: [1.3, 1.3], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtBps = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} Tbps` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} Gbps` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mbps` : `${Math.round(b / 1e3)} Kbps`);

const lesson: Lesson = {
  slug: 'source-unicast-vs-broadcast-vs-multicast-vs-anycast',
  title: 'Unicast, Broadcast, Multicast and Anycast: Who Receives a Packet',
  blurb: 'Four addressing modes — one-to-one, one-to-all-on-a-segment, one-to-a-group, and one-to-the-nearest — and the arithmetic of what each does to sender bandwidth, network load, latency and attack absorption.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'uni', label: 'Unicast: sender egress for the audience', icon: 'wifi' },
    { key: 'multi', label: 'Multicast: sender egress', icon: 'share' },
    { key: 'links', label: 'Total link load: unicast → multicast tree', icon: 'activity' },
    { key: 'rtt', label: 'Anycast: typical round trip to the nearest site', icon: 'clock' },
    { key: 'ddos', label: 'Anycast: attack traffic landing at each site', icon: 'shield' },
  ],
  goals: [
    { text: 'Unicast: one sender, one receiver', step: 1 },
    { text: 'Broadcast: everyone on the local segment', step: 2 },
    { text: 'Multicast: a group, with the network replicating', step: 3 },
    { text: 'Anycast: the nearest of many identical servers', step: 4 },
    { text: 'The numbers, and choosing a mode', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Receivers', min: 10, max: 10000000, step: 10, default: 10000, unit: '', description: 'Viewers or subscribers of one stream.' },
      { key: 'mbps', label: 'Stream bitrate', min: 0.01, max: 100, step: 0.01, default: 5, unit: ' Mbps', description: 'Per-receiver data rate.' },
      { key: 'hops', label: 'Average path length (links)', min: 2, max: 30, step: 1, default: 10, unit: '', description: 'Links between sender and a receiver.' },
      { key: 'fan', label: 'Multicast tree branching factor', min: 2, max: 64, step: 1, default: 8, unit: '', description: 'Average copies a router replicates to.' },
      { key: 'k', label: 'Anycast sites', min: 1, max: 500, step: 1, default: 20, unit: '', description: 'Locations announcing the same address.' },
      { key: 'r1', label: 'Round trip with a single site', min: 10, max: 400, step: 1, default: 120, unit: ' ms', description: 'Average user-to-site RTT with one location.' },
      { key: 'atk', label: 'Attack traffic', min: 0.01, max: 100, step: 0.01, default: 2, unit: ' Tbps', description: 'Volumetric DDoS aimed at the address.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.n ?? 1e4);
      const b = Math.max(0.001, input.mbps ?? 5) * 1e6;
      const h = Math.max(1, input.hops ?? 10);
      const f = Math.max(2, input.fan ?? 8);
      const k = Math.max(1, Math.round(input.k ?? 20));
      const r1 = Math.max(1, input.r1 ?? 120);
      const atk = Math.max(0, input.atk ?? 2) * 1e12;
      const uni = n * b;
      const uniLinks = n * h * b;
      // A tree with branching f has about n/(f-1) internal links on top of n leaf links.
      const multiLinks = n * b * (1 + 1 / (f - 1));
      // Nearest of k uniformly spread sites: mean distance falls like 1/sqrt(k).
      const rtt = r1 / Math.sqrt(k);
      return {
        uni: step < 1 ? { v: '—' } : { v: `${fmtBps(uni)} (${fmtN(n)} × ${(b / 1e6).toFixed(1)} Mbps)`, tone: uni < 2e10 ? 'good' : 'bad' },
        multi: step < 3 ? { v: '—' } : { v: `${fmtBps(b)} — one copy`, tone: 'good' },
        links: step < 3 ? { v: '—' } : { v: `${fmtBps(uniLinks)} → ${fmtBps(multiLinks)} (${(uniLinks / multiLinks).toFixed(1)}× less)`, tone: 'good' },
        rtt: step < 4 ? { v: '—' } : { v: `${rtt.toFixed(0)} ms with ${k} sites (vs ${Math.round(r1)} ms with one)`, tone: rtt < r1 ? 'good' : 'warn' },
        ddos: step < 4 ? { v: '—' } : { v: `${fmtBps(atk / k)} per site (${fmtBps(atk)} spread over ${k})`, tone: atk / k < 2e11 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Unicast',
      kind: 'insight',
      title: 'Unicast: one sender to one receiver',
      body: [
        '<b>Unicast</b> is the default of the internet: a packet’s destination address identifies exactly one interface, and routers forward it along one path. Every TCP connection, HTTP request and DNS query is unicast. It is simple, secure to reason about (state is per connection), reliable with TCP, and supports per-receiver content, encryption and congestion control.',
        'Its cost shows when <b>many receivers want the same data at the same time</b>: the sender must transmit a separate copy to each. Streaming a 5 Mbps live video to 10,000 viewers means <b>50 Gbps</b> of sender egress — and the same bytes cross shared links over and over: 10,000 streams over a path of 10 links is <b>500 Gbps</b> of aggregate link load, all carrying identical content. The other three modes exist to avoid that duplication or to steer traffic to the closest server.',
      ],
      scene: { nodes: [src({ tag: pill('10,000 copies', 'alert', 'warn') }), r1(), r2(), r3(), rx()], links: [link('src', 'r1'), link('r1', 'r2'), link('r1', 'r3'), link('r2', 'rx'), link('r3', 'rx')], flows: [flow(['src', 'r1', 'r2', 'rx'], { kind: 'heavy', rate: 3 }), flow(['src', 'r1', 'r3', 'rx'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Broadcast',
      kind: 'technique',
      title: 'Broadcast: everyone on the local segment',
      body: [
        '<b>Broadcast</b> delivers a frame to <b>every host on the same layer-2 segment</b>: Ethernet’s destination <code>ff:ff:ff:ff:ff:ff</code>, IPv4’s limited broadcast <code>255.255.255.255</code> or a subnet’s all-ones host address. It is how hosts find each other before they know anything: <b>ARP</b> (“who has 10.0.0.7?”), <b>DHCP</b> discovery (a host with no address asks for one), and some service-discovery protocols. Switches flood broadcasts out every port; <b>routers do not forward them</b>, which is exactly what defines the boundary of a broadcast domain.',
        'Costs are borne by every host: each broadcast interrupts every NIC and CPU on the segment, so a large flat network’s background chatter scales with the number of hosts, and a misconfigured loop causes a <b>broadcast storm</b> that can take a LAN down (hence spanning tree, storm control, and splitting networks into smaller VLANs/subnets). <b>IPv6 has no broadcast</b>: neighbour discovery and similar functions use targeted multicast groups, so only interested hosts are interrupted.',
      ],
      changes: [{ text: 'Frame goes to all hosts in the broadcast domain; routers stop it', tone: 'info' }, { text: 'Used for ARP and DHCP discovery', tone: 'info' }, { text: 'Storms and per-host interrupt cost; IPv6 removes broadcast', tone: 'bad' }],
      scene: { nodes: [src({ name: 'Host asking ARP' }), r1({ name: 'Switch (floods)' }), rx({ tag: pill('all ports see it', 'alert') })], links: [link('src', 'r1'), link('r1', 'rx')], flows: [flow(['src', 'r1', 'rx'], { kind: 'heavy', rate: 2.4 })] },
    },
    {
      short: 'Multicast',
      kind: 'technique',
      title: 'Multicast: send once to a group, the network replicates',
      body: [
        '<b>Multicast</b> addresses a <b>group</b> (IPv4 <code>224.0.0.0/4</code>, IPv6 <code>ff00::/8</code>). Receivers <b>join</b> a group — hosts tell their local router with <b>IGMP</b> (IPv4) or <b>MLD</b> (IPv6); routers build a <b>distribution tree</b> using a protocol like <b>PIM</b> (Protocol Independent Multicast) and replicate a packet only where the tree branches. The sender transmits <b>one copy</b>; each link carries the stream at most once, however many receivers sit beyond it. Switches use <b>IGMP snooping</b> so the traffic reaches only the ports with members.',
        'For 10,000 receivers a tree with branching factor 8 has about n/(f−1) internal links on top of the n receiver links: total link load ≈ 10,000 × 5 Mbps × 1.14 = <b>57 Gbps</b> instead of 500 Gbps — <b>8.8× less</b> — and the sender emits <b>5 Mbps</b>, not 50 Gbps. Used where it can be controlled: IPTV in managed networks, financial market-data feeds, software distribution inside a campus, mDNS and discovery protocols. <b>Not available on the public internet</b>: ISPs don’t route it between domains (state in routers, billing, security and no congestion control are unsolved) — so internet-scale video uses CDNs and unicast, or application-level multicast overlays.',
      ],
      changes: [{ text: 'Join groups via IGMP/MLD; routers build a tree with PIM', tone: 'info' }, { text: 'One copy from the sender; replicate at branches: 500 → 57 Gbps link load', tone: 'good' }, { text: 'Works inside managed networks, not across the open internet', tone: 'bad' }],
      concepts: [{ term: 'Multicast group', def: 'An address that stands for a set of receivers who have joined it; the network delivers one transmitted packet to each member.' }],
      scene: { nodes: [src({ tag: pill('1 × 5 Mbps', 'check', 'good') }), r1({ tag: pill('PIM tree', 'share') }), r2({ tag: pill('replicate here', 'layers') }), r3({ tag: pill('replicate here', 'layers') }), rx({ tag: pill('joined 239.1.1.1', 'users') })], links: [link('src', 'r1'), link('r1', 'r2'), link('r1', 'r3'), link('r2', 'rx'), link('r3', 'rx')], flows: [flow(['src', 'r1', 'r2', 'rx'], { rate: 1.6 }), flow(['r1', 'r3', 'rx'], { rate: 1.6 })] },
    },
    {
      short: 'Anycast',
      kind: 'technique',
      title: 'Anycast: the same address in many places, routed to the nearest',
      body: [
        '<b>Anycast</b> announces <b>one IP prefix from many locations</b> via BGP. The network’s own routing sends each client’s packets to the <b>topologically nearest</b> announcer — no client configuration, and when a site fails and withdraws its route, traffic reshapes to the next nearest within seconds. It underpins <b>DNS root and resolver services</b> (1.1.1.1, 8.8.8.8, the 13 root server identities served by ~1,700 instances), <b>CDN edges</b> and DDoS-scrubbing networks.',
        'Latency: nearest-of-k distance falls roughly as 1/√k, so 20 sites cut a 120 ms single-site average to about <b>27 ms</b>. Attack absorption: a 2 Tbps flood is split by where attackers are, ~100 Gbps per site on average rather than 2 Tbps at one — each site only needs to absorb its catchment, and the attack is diluted geographically. Caveats: routing follows BGP policy, not exact geography (a client may reach a distant site); a <b>route flap mid-connection</b> can send later packets to a different site, breaking <b>stateful TCP</b> (mitigated by short connections, stateless protocols like UDP/DNS, or shared connection state/tunnelling); and capacity per site must be planned because load follows catchment, not choice.',
      ],
      changes: [{ text: 'One prefix announced from many sites; BGP picks the nearest', tone: 'good' }, { text: '20 sites: ~27 ms vs 120 ms; 2 Tbps attack → ~100 Gbps per site', tone: 'good' }, { text: 'Route changes can break long-lived TCP; capacity follows catchment', tone: 'bad' }],
      scene: { nodes: [src({ name: 'Client' }), r1(), pop('p1', -8, 'Site: Frankfurt', { tag: pill('203.0.113.10', 'globe') }), pop('p2', 0, 'Site: Singapore', { tag: pill('203.0.113.10', 'globe') }), pop('p3', 8, 'Site: Virginia', { tag: pill('203.0.113.10', 'globe') })], links: [link('src', 'r1'), link('r1', 'p1'), link('r1', 'p2', { style: 'dashed' }), link('r1', 'p3', { style: 'dashed' })], flows: [flow(['src', 'r1', 'p1'], { rate: 1.8, back: true })] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Choosing a mode',
      body: [
        '<b>Unicast</b> when receivers need individual, reliable, encrypted sessions (the web, APIs, RPC). <b>Broadcast</b> only for bootstrap discovery on a LAN. <b>Multicast</b> for one-to-many delivery of identical real-time data <i>inside a network you control</i> (market data, IPTV, cluster discovery) — and it needs router and switch support, group management and monitoring. <b>Anycast</b> for stateless or short-lived services you want served from the nearest place with automatic failover (DNS, CDN edges, NTP, DDoS defence, edge APIs).',
        'The modes also combine: a CDN uses <b>anycast</b> (or DNS) to bring a client to a nearby edge, then <b>unicast</b> HTTP from that edge; the CDN replaces the missing internet multicast by caching content near viewers — turning 10,000 long-haul streams into one fetch per edge plus short local unicast hops (see the CDN lesson). Figures here are model outputs from the stated bitrate, hop count, tree shape and site count.',
      ],
      changes: [{ text: 'Unicast: sessions · broadcast: LAN bootstrap · multicast: controlled networks · anycast: nearest stateless service', tone: 'info' }, { text: 'CDNs combine anycast entry with unicast delivery', tone: 'good' }],
      scene: { nodes: [src(), r1(), pop('p1', -7, 'Edge A'), pop('p2', 7, 'Edge B'), rx()], links: [link('src', 'r1'), link('r1', 'p1'), link('r1', 'p2'), link('p1', 'rx'), link('p2', 'rx')], flows: [flow(['src', 'r1', 'p1', 'rx'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'One-to-one, one-to-all-local, one-to-group, one-to-nearest',
      body: [
        '<b>Unicast</b> duplicates data per receiver (50 Gbps for 10,000 × 5 Mbps); <b>broadcast</b> floods a LAN and powers ARP/DHCP; <b>multicast</b> sends one copy and lets routers replicate (500 → 57 Gbps link load) but stays inside managed networks; <b>anycast</b> gives the same address everywhere so BGP picks the nearest (120 → ~27 ms, attacks diluted per site).',
        'Real systems layer them: anycast to find the edge, unicast to carry the bytes.',
      ],
      scene: { nodes: [src(), r1(), r2(), r3(), rx()], links: [link('src', 'r1'), link('r1', 'r2'), link('r1', 'r3'), link('r2', 'rx'), link('r3', 'rx')], flows: [flow(['src', 'r1', 'r2', 'rx'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
