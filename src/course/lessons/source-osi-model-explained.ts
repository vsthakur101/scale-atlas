import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -18, 0, 'Application data (HTTP, DNS, gRPC)', 'teal', 'doc', { size: [1.6, 1.4], height: 18, ...extra });
const tls = (extra: Partial<SceneNode> = {}) => box('tls', -10, -6, 'TLS record (+ tag)', 'purple', 'lock', { size: [1.3, 1.3], height: 18, ...extra });
const tcp = (extra: Partial<SceneNode> = {}) => box('tcp', -2, 0, 'TCP segment: ports, seq, ack', 'orange', 'link', { size: [1.4, 1.4], height: 22, ...extra });
const ip = (extra: Partial<SceneNode> = {}) => box('ip', 6, -6, 'IP packet: addresses, TTL', 'blue', 'globe', { size: [1.4, 1.4], height: 22, ...extra });
const eth = (extra: Partial<SceneNode> = {}) => box('eth', 14, 0, 'Ethernet frame: MACs, FCS', 'green', 'wifi', { size: [1.5, 1.4], height: 22, ...extra });
const dev = (extra: Partial<SceneNode> = {}) => db('dev', 6, 8, 'Switch (L2) · router (L3) · LB (L4/L7)', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${Math.round(b)} B`);

const lesson: Lesson = {
  slug: 'source-osi-model-explained',
  title: 'Network Layers and Encapsulation: What Each Layer Adds, and the Overhead It Costs',
  blurb: 'The OSI and TCP/IP layer models as a practical map: what each layer addresses, which devices work at which layer, and the byte overhead of wrapping data in TLS, TCP, IP and Ethernet headers — why small packets waste most of a link and MTU matters.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'wire', label: 'Bytes on the wire for one packet', icon: 'file' },
    { key: 'eff', label: 'Efficiency (payload ÷ bytes on the wire)', icon: 'gauge' },
    { key: 'good', label: 'Goodput on the link at this payload size', icon: 'activity' },
    { key: 'pps', label: 'Packets per second at line rate', icon: 'timer' },
    { key: 'xfer', label: 'Overhead to send the bulk transfer', icon: 'share' },
  ],
  goals: [
    { text: 'Layers: a map of responsibilities', step: 1 },
    { text: 'Addresses at each layer, devices at each layer', step: 2 },
    { text: 'Encapsulation: headers wrapped around data', step: 3 },
    { text: 'The overhead arithmetic: small vs full packets', step: 4 },
    { text: 'MTU, fragmentation and debugging by layer', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'p', label: 'Application payload per packet', min: 1, max: 1460, step: 1, default: 100, unit: ' B', description: 'Bytes of data carried by each packet.' },
      { key: 'tls', label: 'TLS record overhead', min: 0, max: 40, step: 1, default: 22, unit: ' B', description: '5 B header + 1 B type + 16 B tag (0 for plaintext).' },
      { key: 'mtu', label: 'Link MTU', min: 576, max: 9000, step: 1, default: 1500, unit: ' B', description: 'Largest IP packet the link carries (Ethernet 1500; jumbo 9000).' },
      { key: 'g', label: 'Link speed', min: 0.01, max: 400, step: 0.01, default: 1, unit: ' Gbps', description: 'Physical line rate.' },
      { key: 'kb', label: 'Bulk transfer size', min: 1, max: 10000000, step: 1, default: 1000, unit: ' KB', description: 'Size of a file or response sent as full packets.' },
    ],
    calculate: (input, step) => {
      const p = Math.max(1, input.p ?? 100);
      const tls = Math.max(0, input.tls ?? 22);
      const mtu = Math.max(100, input.mtu ?? 1500);
      const g = Math.max(0.001, input.g ?? 1) * 1e9;
      const kb = Math.max(0.001, input.kb ?? 1000);
      // Per-packet overhead on Ethernet: 8 preamble + 12 inter-frame gap + 14 header + 4 FCS + 20 IP + 20 TCP + TLS.
      const perPacket = 20 + 14 + 4 + 20 + 20 + tls;
      const wire = p + perPacket;
      const eff = p / wire;
      const pps = g / 8 / wire;
      const maxPayload = Math.max(1, mtu - 40 - tls);
      const packets = Math.ceil((kb * 1000) / maxPayload);
      const overhead = packets * perPacket;
      return {
        wire: step < 3 ? { v: '—' } : { v: `${wire} B = ${p} data + ${perPacket} overhead (preamble/gap 20 + Ethernet 18 + IP 20 + TCP 20 + TLS ${tls})` },
        eff: step < 4 ? { v: '—' } : { v: `${(eff * 100).toFixed(1)}%`, tone: eff > 0.85 ? 'good' : eff > 0.6 ? 'warn' : 'bad' },
        good: step < 4 ? { v: '—' } : { v: `${((g * eff) / 1e6).toFixed(0)} Mbps of ${(g / 1e6).toFixed(0)} Mbps`, tone: eff > 0.85 ? 'good' : 'warn' },
        pps: step < 4 ? { v: '—' } : { v: `${fmtN(pps)} packets/s (${fmtN(pps * p)} B/s of data)`, tone: pps > 1e6 ? 'warn' : 'good' },
        xfer: step < 5 ? { v: '—' } : { v: `${fmtN(packets)} packets of ≤ ${maxPayload} B payload · ${fmtB(overhead)} overhead (${((overhead / (kb * 1000 + overhead)) * 100).toFixed(1)}%)`, tone: overhead / (kb * 1000) < 0.08 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Layers',
      kind: 'insight',
      title: 'Layers: who is responsible for what',
      body: [
        'Networking is split into <b>layers</b>, each providing a service to the one above and relying on the one below, so a web app doesn’t care whether the bits ride Wi-Fi, fibre or a satellite. The <b>OSI model</b> (1984) has seven: <b>1 Physical</b> (signals on wire, light, radio), <b>2 Data link</b> (frames between neighbouring devices on one network — Ethernet, Wi-Fi), <b>3 Network</b> (addressing and routing between networks — IP), <b>4 Transport</b> (end-to-end delivery between processes — TCP, UDP, QUIC), <b>5 Session</b>, <b>6 Presentation</b> (encoding, encryption) and <b>7 Application</b> (HTTP, DNS, SMTP, gRPC). The <b>TCP/IP model</b> that the internet actually runs collapses these into four: link, internet, transport, application — layers 5–7 are just “the application and its libraries (TLS, serialization)”.',
        'Treat the model as a <b>vocabulary and a debugging map</b>, not a strict architecture: “layer 4 load balancer”, “layer 7 firewall”, “an L2 switch” are everyday phrases, and troubleshooting proceeds bottom-up (link up? IP reachable? port open? TLS valid? HTTP correct?). Real protocols blur it — TLS sits between 4 and 7, QUIC does transport and crypto together over UDP, VPNs tunnel one layer inside another.',
      ],
      scene: { nodes: [app({ tag: pill('7 · HTTP', 'doc') }), tcp({ tag: pill('4 · TCP / UDP / QUIC', 'link') }), ip({ tag: pill('3 · IP', 'globe') }), eth({ tag: pill('2 · Ethernet / Wi-Fi', 'wifi') })], links: [link('app', 'tcp'), link('tcp', 'ip'), link('ip', 'eth')], flows: [flow(['app', 'tcp', 'ip', 'eth'], { rate: 1.6 })] },
    },
    {
      short: 'Addresses',
      kind: 'technique',
      title: 'Addresses at each layer, devices at each layer',
      body: [
        'Each layer identifies endpoints with a different address. <b>Layer 2: MAC addresses</b> (48-bit, <code>a4:83:e7:1c:2b:90</code>) name a network interface <i>on this link</i> and change at every hop. <b>Layer 3: IP addresses</b> (see the IP Addressing lesson) name a host <i>across networks</i> and stay constant end to end (except through NAT). <b>Layer 4: ports</b> (16-bit) name a <i>process or service</i> on that host: 443 for HTTPS, 5432 for PostgreSQL; a connection is identified by the 4-tuple (source IP, source port, destination IP, destination port). <b>Layer 7</b> identifies things by URL, hostname, method, header, user.',
        'Devices act at the layer whose address they read. A <b>hub/repeater</b> works at L1; a <b>switch</b> at L2 (learns which MAC is on which port and forwards frames — <b>ARP</b> maps an IP to a MAC on the local link); a <b>router</b> at L3 (forwards packets by longest-prefix match, rewriting the L2 header at each hop and decrementing TTL); a <b>layer-4 load balancer / NAT / stateful firewall</b> reads IP and ports (see those lessons); a <b>layer-7 load balancer, proxy, WAF or API gateway</b> terminates the connection and routes on HTTP content. Higher layers see more but cost more per packet.',
      ],
      changes: [{ text: 'L2 MAC (per hop) · L3 IP (end to end) · L4 port (process) · L7 URL/host', tone: 'info' }, { text: 'Switch = L2 · router = L3 · NAT/L4 LB = L3+L4 · L7 LB/WAF = HTTP', tone: 'info' }],
      scene: { nodes: [app(), dev({ tag: pill('reads the address at its layer', 'search') }), eth(), ip()], links: [link('app', 'dev'), link('dev', 'eth'), link('dev', 'ip')], flows: [flow(['app', 'dev', 'eth'], { rate: 1.4 })] },
    },
    {
      short: 'Encapsulate',
      kind: 'technique',
      title: 'Encapsulation: each layer wraps what it receives',
      body: [
        'To send data, each layer <b>prepends its own header</b> (and sometimes a trailer) to what the layer above handed down — <b>encapsulation</b>. The application’s HTTP request becomes a <b>TLS record</b> (5-byte header, content type, a 16-byte authentication tag); TCP wraps that in a <b>segment</b> (20-byte header: ports, sequence and acknowledgement numbers, window, flags); IP wraps it in a <b>packet</b> (20-byte header: source and destination addresses, TTL, protocol, checksum); Ethernet wraps it in a <b>frame</b> (14-byte header: destination and source MAC, EtherType; 4-byte FCS trailer) and the physical layer adds a <b>preamble</b> (8 bytes) and an <b>inter-frame gap</b> (12 byte-times) that also occupy the wire. The receiver peels the layers off in reverse.',
        'Each header carries exactly what its layer needs and is <b>opaque to the others</b>: a router never reads TCP; TCP never reads HTTP. That separation is what lets protocols evolve independently (swap IPv4 for IPv6, TCP for QUIC) — and what makes <b>tunnelling</b> possible: a VPN or overlay network (VXLAN, WireGuard, GRE) puts an entire packet inside another packet’s payload, paying a second set of headers.',
      ],
      changes: [{ text: 'HTTP → TLS record → TCP segment → IP packet → Ethernet frame', tone: 'info' }, { text: 'Headers: TLS 22 · TCP 20 · IP 20 · Ethernet 18 · preamble/gap 20', tone: 'info' }, { text: 'Tunnels add a second full set of headers', tone: 'bad' }],
      concepts: [{ term: 'Encapsulation', def: 'Each layer wraps the data from the layer above with its own header (and trailer), which the same layer on the receiving side removes.' }],
      scene: { nodes: [app({ tag: pill('100 B payload', 'doc') }), tls({ tag: pill('+22', 'lock') }), tcp({ tag: pill('+20', 'link') }), ip({ tag: pill('+20', 'globe') }), eth({ tag: pill('+18 +20 wire', 'wifi') })], links: [link('app', 'tls'), link('tls', 'tcp'), link('tcp', 'ip'), link('ip', 'eth')], flows: [flow(['app', 'tls', 'tcp', 'ip', 'eth'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Overhead',
      kind: 'problem',
      title: 'The arithmetic: small packets waste the link',
      body: [
        'Per packet the fixed cost is 20 (preamble + gap) + 14 + 4 (Ethernet) + 20 (IP) + 20 (TCP) + 22 (TLS) = <b>100 bytes</b>. A packet carrying <b>100 bytes</b> of data therefore occupies 200 bytes of wire: <b>50% efficiency</b>, so a 1 Gbps link delivers 500 Mbps of goodput — and at that size it can carry 625,000 packets per second, a rate where <b>per-packet CPU work</b> (interrupts, syscalls, TCP processing) rather than bandwidth becomes the limit. A packet carrying 1,438 data bytes (1,500-byte MTU − 20 − 20 − 22) occupies 1,538: <b>93.5%</b>.',
        'This is why chatty protocols are expensive: a 100-byte RPC, a game or telemetry packet, a single-character keystroke over SSH, or a TCP ACK (all header, no data) wastes most of its bytes on headers. Remedies: <b>batch</b> small messages into one packet (Nagle’s algorithm, write coalescing, protocol framing; see the Serialization lesson), <b>keep connections open</b> to avoid handshakes (SYN, SYN-ACK, ACK are 40-byte-payload-free packets), compress headers (HTTP/2 HPACK, QUIC QPACK), and use larger MTUs (<b>jumbo frames</b> of 9,000 bytes in data centres push efficiency to 99%). For a 1 MB bulk transfer: 696 packets × 100 B = <b>69.6 KB</b> of overhead, 6.5% — fine; it’s the small-packet case that hurts.',
      ],
      changes: [{ text: '100 B payload: 200 B on the wire = 50% efficiency, 500 Mbps of 1 Gbps', tone: 'bad' }, { text: '1,438 B payload: 1,538 B = 93.5%', tone: 'good' }, { text: '1 MB transfer: 696 packets, 6.5% overhead', tone: 'info' }],
      scene: { nodes: [app({ tag: pill('100 B of data', 'doc') }), eth({ tag: pill('200 B on the wire', 'alert', 'warn') }), dev({ tag: pill('625k packets/s limit', 'gauge', 'warn') })], links: [link('app', 'eth'), link('eth', 'dev')], flows: [flow(['app', 'eth', 'dev'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'MTU',
      kind: 'tradeoff',
      title: 'MTU, fragmentation and debugging by layer',
      body: [
        'The <b>MTU</b> (maximum transmission unit) is the largest IP packet a link carries — 1,500 bytes on standard Ethernet, less over tunnels (a VPN or VXLAN overlay eats 28–70 bytes) and PPPoE. TCP negotiates a <b>maximum segment size</b> from it (1,460 for plain TCP/IPv4). If a packet is too big, IPv4 routers may <b>fragment</b> it (costly, fragile, often blocked by firewalls) unless <b>Don’t Fragment</b> is set, in which case they drop it and send an ICMP “fragmentation needed” message so the sender can lower its size (<b>Path MTU Discovery</b>). If a firewall blocks those ICMP messages you get the classic <b>PMTU black hole</b>: small requests work, big transfers and TLS handshakes with large certificates hang — a pure layer-3/4 bug that looks like an application problem. IPv6 routers never fragment; senders must do PMTUD.',
        'Debug <b>bottom-up by layer</b>: L1/L2 — link lights, <code>ip link</code>, speed/duplex errors; L3 — <code>ping</code>, <code>traceroute</code>/<code>mtr</code>, routing tables, MTU (<code>ping -M do -s 1472</code>); L4 — <code>ss -tan</code>, <code>nc -vz host port</code>, firewall and security-group rules, retransmits and resets; L5–6 — <code>openssl s_client</code>, certificate and protocol errors; L7 — <code>curl -v</code>, status codes, headers. <code>tcpdump</code>/Wireshark show every layer’s headers at once. The numbers in this lesson are computed from the standard header sizes and the stated payload, MTU and link speed.',
      ],
      changes: [{ text: 'Over-MTU packets: fragment (IPv4) or PMTUD; blocked ICMP → black hole', tone: 'bad' }, { text: 'Jumbo frames (9,000 B) in data centres: ~99% efficiency', tone: 'good' }, { text: 'Debug bottom-up: link → ping → port → TLS → HTTP; use tcpdump', tone: 'good' }],
      scene: { nodes: [app(), tcp({ tag: pill('MSS 1,460', 'link') }), ip({ tag: pill('DF set; ICMP too-big', 'alert', 'warn') }), eth({ tag: pill('MTU 1,500', 'wifi') })], links: [link('app', 'tcp'), link('tcp', 'ip'), link('ip', 'eth')], flows: [flow(['app', 'tcp', 'ip', 'eth'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Layers separate concerns; headers are the price',
      body: [
        'Layers give <b>addresses and responsibilities</b> (MAC per hop, IP end to end, port per process, URL for apps) and map to devices (switch, router, L4/L7 balancers). Encapsulation wraps data in <b>~100 bytes of headers per packet</b> (TLS + TCP + IP + Ethernet + wire overhead): 50% efficiency at 100-byte payloads, 93.5% at full size.',
        'Batch small messages, reuse connections, mind the MTU, and debug one layer at a time.',
      ],
      scene: { nodes: [app(), tls(), tcp(), ip(), eth()], links: [link('app', 'tls'), link('tls', 'tcp'), link('tcp', 'ip'), link('ip', 'eth')], flows: [flow(['app', 'tls', 'tcp', 'ip', 'eth'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
