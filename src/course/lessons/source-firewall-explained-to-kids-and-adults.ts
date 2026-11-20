import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const out = (extra: Partial<SceneNode> = {}) => crowd('out', -16, 0, 10, 'internet', extra);
const fw = (extra: Partial<SceneNode> = {}) => box('fw', -6, 0, 'Firewall', 'red', 'shield', { size: [1.6, 1.6], height: 34, ...extra });
const table = (extra: Partial<SceneNode> = {}) => db('table', -6, 8, 'Connection (state) table', { size: [1.3, 1.3], ...extra });
const inner = (id: string, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, 6, d, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'source-firewall-explained-to-kids-and-adults',
  title: 'How Firewalls Work: Rules, State and Where They Fail',
  blurb: 'Packet filters, stateful inspection and application-layer firewalls: ordered rules, default deny, the connection table that has to fit in memory — and what a firewall cannot see.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'entries', label: 'Connection-table entries at steady state', icon: 'list' },
    { key: 'mem', label: 'Memory for the table', icon: 'disk' },
    { key: 'flood', label: 'Time for a SYN flood to fill the table', icon: 'alert' },
    { key: 'rules', label: 'Rule evaluations per second (linear list)', icon: 'activity' },
  ],
  goals: [
    { text: 'Allow and deny by packet header: stateless filters', step: 1 },
    { text: 'Stateful inspection and the connection table', step: 2 },
    { text: 'Rule order, default deny and zones', step: 3 },
    { text: 'Application-layer firewalls and WAFs', step: 4 },
    { text: 'Limits: encrypted traffic, insiders and DoS', step: 5 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  dynamic: {
    parameters: [
      { key: 'cps', label: 'New connections per second', min: 100, max: 5000000, step: 100, default: 50000, unit: '/s', description: 'Legitimate new flows arriving at the firewall.' },
      { key: 'idle', label: 'Idle connection timeout', min: 5, max: 3600, step: 5, default: 120, unit: ' s', description: 'How long an unused entry stays in the table.' },
      { key: 'entry', label: 'Bytes per table entry', min: 100, max: 1000, step: 10, default: 300, unit: ' B', description: 'Memory per tracked connection.' },
      { key: 'cap', label: 'Table capacity', min: 100000, max: 500000000, step: 100000, default: 10000000, unit: ' entries', description: 'Maximum tracked connections.' },
      { key: 'flood', label: 'Attack SYN rate', min: 1000, max: 10000000, step: 1000, default: 500000, unit: '/s', description: 'Spoofed connection attempts per second.' },
      { key: 'nrules', label: 'Rules in the policy', min: 1, max: 100000, step: 1, default: 2000, unit: '', description: 'Rules checked in order for each new flow.' },
    ],
    calculate: (input, step) => {
      const cps = Math.max(1, input.cps ?? 5e4);
      const idle = Math.max(1, input.idle ?? 120);
      const entry = Math.max(1, input.entry ?? 300);
      const cap = Math.max(1, input.cap ?? 1e7);
      const flood = Math.max(1, input.flood ?? 5e5);
      const nrules = Math.max(1, input.nrules ?? 2000);
      // Little's law: entries in the table = arrival rate × time each entry lives.
      const entries = cps * idle;
      const headroom = Math.max(0, cap - entries);
      const fillT = headroom / flood;
      return {
        entries: step < 2 ? { v: '—' } : { v: `${fmtN(entries)} (${((entries / cap) * 100).toFixed(0)}% of capacity)`, tone: entries / cap < 0.5 ? 'good' : entries / cap < 0.8 ? 'warn' : 'bad' },
        mem: step < 2 ? { v: '—' } : { v: fmtB(entries * entry) },
        flood: step < 4 ? { v: '—' } : { v: headroom <= 0 ? 'already full' : `${fillT.toFixed(fillT < 10 ? 1 : 0)} s`, tone: fillT > 60 ? 'good' : fillT > 10 ? 'warn' : 'bad' },
        rules: step < 3 ? { v: '—' } : { v: `${fmtN(cps * nrules / 2)}/s on average (flows × rules ÷ 2)`, tone: (cps * nrules) / 2 > 1e8 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Filter',
      kind: 'insight',
      title: 'A firewall decides which packets may pass',
      body: [
        'A firewall sits between networks of different trust — the internet and your servers, or the corporate network and a database zone — and applies a <b>policy</b>: allow this traffic, drop that. The simplest form is a <b>stateless packet filter</b>: each packet is judged alone on its header fields — <b>source and destination address</b>, <b>protocol</b>, <b>source and destination port</b> — against an ordered rule list: “allow TCP from anywhere to 10.0.1.5 port 443”, “deny everything else”.',
        'It is fast and simple but blind: it cannot tell whether a packet is part of a connection <i>you</i> started or an unsolicited probe, so allowing replies to your outbound requests means allowing incoming packets to high ports broadly — which is too permissive. That gap is what <b>stateful</b> firewalls close.',
      ],
      scene: { nodes: [out(), fw({ tag: pill('allow tcp → :443 · deny all', 'list') }), inner('a', -5, 'Web server'), inner('b', 5, 'Database')], links: [link('out', 'fw'), link('fw', 'a'), link('fw', 'b', { style: 'broken' })], flows: [flow(['out', 'fw', 'a'], { rate: 2 }), flow(['out', 'fw'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Stateful',
      kind: 'technique',
      title: 'Stateful inspection: remember the connections',
      body: [
        'A <b>stateful</b> firewall tracks connections. When an inside host opens a TCP connection outbound, the firewall records the flow (addresses, ports, TCP state) in a <b>connection table</b> and automatically allows the <i>matching replies</i> back in — and nothing else. Inbound packets that belong to no known connection are dropped (unless a rule explicitly allows new inbound connections, like to your web server). The policy becomes simple and tight: “inside → outside: allow; outside → inside: only established replies, plus these published services”.',
        'State has a <b>memory cost</b> and an expiry: each entry lives until the connection closes or an <b>idle timeout</b> passes. By Little’s law the table holds <code>new connections/s × lifetime</code>: 50,000/s × 120 s = <b>6 million entries</b>, 1.8 GB at 300 bytes each, against a 10-million-entry capacity (60% full) — the table, not CPU, often sets the limit.',
      ],
      changes: [{ text: 'Track flows; allow only replies to what inside started', tone: 'good' }, { text: 'Entries = new connections/s × idle timeout (Little’s law)', tone: 'info' }],
      concepts: [{ term: 'Stateful inspection', def: 'Filtering that tracks each connection’s state, so replies are allowed only for flows the protected side initiated.' }],
      scene: { nodes: [out(), fw({ tag: pill('is this a reply to a known flow?', 'search') }), table({ tag: pill('6M entries', 'list') }), inner('a', 0, 'Inside host')], links: [link('out', 'fw'), link('fw', 'table', { arrow: 'both' }), link('fw', 'a')], flows: [flow(['out', 'fw', 'a'], { rate: 2 })] },
    },
    {
      short: 'Rules',
      kind: 'technique',
      title: 'Rule order, default deny and zones',
      body: [
        'Rules are evaluated <b>top to bottom; the first match wins</b>, so order matters: put specific denies before broad allows, and end with a catch-all. The safe posture is <b>default deny</b> — block everything not explicitly allowed — rather than default allow, which lets new services and attacks through unnoticed. A linear list of 2,000 rules costs on average 1,000 comparisons per new flow: at 50,000 flows/s that is 50 million rule checks a second — fine in hardware or with optimised matching (hash/tree lookups, compiled rule sets), painful as a naive list of 100,000.',
        'Structure policy with <b>zones</b> (internet, DMZ, application, database, management) and rules between them rather than per-host exceptions: the DMZ can reach the app tier on one port, the app tier the database on another, nothing reaches management except from the admin zone. Review rules regularly — stale “temporary” allows accumulate — and log denies. Cloud <b>security groups</b> are stateful allow-lists per instance, and network ACLs are stateless filters per subnet.',
      ],
      changes: [{ text: 'First match wins; default deny; zones between tiers', tone: 'good' }, { text: 'Prune stale rules; log denies', tone: 'good' }],
      scene: { nodes: [out({ name: 'Internet zone' }), fw({ tag: pill('zone policy', 'shield') }), inner('dmz', -6, 'DMZ: web'), inner('app', 0, 'App tier'), inner('db', 6, 'DB zone')], links: [link('out', 'fw'), link('fw', 'dmz'), link('fw', 'app'), link('fw', 'db', { style: 'broken' })], flows: [flow(['out', 'fw', 'dmz'], { rate: 2 })] },
    },
    {
      short: 'App layer',
      kind: 'technique',
      title: 'Application-layer firewalls, WAFs and proxies',
      body: [
        'Ports say little: attacks ride on <i>allowed</i> ports (HTTPS on 443). <b>Next-generation firewalls</b> inspect further up the stack — identifying the <b>application</b> (this is Slack, that is BitTorrent), the <b>user</b> (via directory integration) and known malware or exploit signatures (intrusion prevention). A <b>web application firewall (WAF)</b> understands HTTP: it blocks SQL injection, cross-site scripting, path traversal and malformed requests, applies rate limits and bot rules, and virtual-patches known vulnerabilities until you can fix the code.',
        'Deeper inspection costs CPU and latency and produces <b>false positives</b> (blocking legitimate requests — tune in monitor mode before enforcing). A <b>proxy firewall</b> terminates the connection and opens a new one to the destination, giving full control over what crosses — and <b>egress filtering</b> (limiting what servers may reach outbound) is as valuable as ingress, blocking exfiltration and callbacks to attackers.',
      ],
      changes: [{ text: 'Identify app and user; inspect HTTP; virtual patching', tone: 'good' }, { text: 'Tune in monitor mode first; filter egress too', tone: 'good' }],
      scene: { nodes: [out(), fw({ name: 'WAF / NGFW', tag: pill('SQLi · XSS · bots · app id', 'shield', 'good') }), inner('a', 0, 'Application')], links: [link('out', 'fw'), link('fw', 'a')], flows: [flow(['out', 'fw', 'a'], { rate: 2 }), flow(['out', 'fw'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Limits',
      kind: 'problem',
      title: 'What a firewall can’t do',
      body: [
        '<b>Encrypted traffic</b>: inside TLS a firewall sees only addresses and the server name, not contents — inspection needs a decrypting proxy with its own certificate authority, with privacy and operational costs. <b>Insiders and stolen credentials</b> pass an allowed path legitimately. A <b>perimeter</b> model (“inside = trusted”) fails once an attacker is inside, which is why modern designs add <b>segmentation</b>, identity-aware access and zero trust (see the VPN lesson).',
        '<b>Resource exhaustion</b>: a <b>SYN flood</b> sends connection attempts from spoofed addresses; if each creates a table entry, 500,000 SYNs/s fill the remaining 4 million slots in <b>8 seconds</b> and legitimate users are refused. Defences: <b>SYN cookies</b> (stay stateless until the handshake completes), short half-open timeouts, rate limiting per source, upstream DDoS scrubbing and anycast absorption. A firewall is one layer — pair it with patching, least privilege, monitoring and application security. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: '500k SYN/s fills 4M free slots in 8 s', tone: 'bad' }, { text: 'SYN cookies, rate limits, upstream scrubbing', tone: 'good' }, { text: 'Segment; assume the perimeter will be breached', tone: 'good' }],
      scene: { nodes: [out({ tag: pill('spoofed SYN flood', 'alert', 'bad') }), fw({ state: 'hot', load: 100, tag: pill('state table full', 'alert', 'bad') }), table({ state: 'hot', tag: pill('10M / 10M', 'alert', 'bad') }), inner('a', 6, 'Legitimate users refused')], links: [link('out', 'fw'), link('fw', 'table')], flows: [flow(['out', 'fw', 'table'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Default deny, track state, don’t trust the perimeter',
      body: [
        'Firewalls filter by header (stateless), remember connections to allow replies (stateful — table size ≈ new connections/s × idle timeout), and at the application layer inspect users, apps and HTTP. Use <b>default deny</b>, ordered rules, zones and egress filtering.',
        'Know the limits: encryption, insiders and state-table exhaustion — and layer other controls around it.',
      ],
      scene: { nodes: [out(), fw(), table(), inner('a', -4, 'Server'), inner('b', 4, 'Server')], links: [link('out', 'fw'), link('fw', 'table', { arrow: 'both' }), link('fw', 'a'), link('fw', 'b')], flows: [flow(['out', 'fw', 'a'], { rate: 2 })] },
    },
  ],
};

export default lesson;
