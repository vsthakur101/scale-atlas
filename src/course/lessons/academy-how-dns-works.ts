import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -15, 0, 'Browser', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const stub = (extra: Partial<SceneNode> = {}) => box('stub', -8, 0, 'OS stub resolver', 'teal', 'search', { size: [1.1, 1.1], height: 22, ...extra });
const rec = (extra: Partial<SceneNode> = {}) => box('rec', -1, 0, 'Recursive resolver', 'blue', 'refresh', { size: [1.4, 1.4], height: 32, ...extra });
const root = (extra: Partial<SceneNode> = {}) => box('root', 8, -7, 'Root (.)', 'purple', 'globe', { size: [1.1, 1.1], height: 22, ...extra });
const tld = (extra: Partial<SceneNode> = {}) => box('tld', 8, 0, 'TLD (.com)', 'orange', 'globe', { size: [1.1, 1.1], height: 22, ...extra });
const auth = (extra: Partial<SceneNode> = {}) => db('auth', 8, 7, 'Authoritative', { size: [1.2, 1.2], ...extra });

const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(1)}k/s` : `${r.toFixed(r < 10 ? 1 : 0)}/s`);
const fmtT = (s: number): string => (s >= 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'academy-how-dns-works',
  title: 'How DNS Works',
  blurb: 'The hierarchy of resolvers and name servers, caching by TTL, and the trade-off every record carries: fewer lookups versus faster change.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'hit', label: 'Cache hit ratio', icon: 'gauge' },
    { key: 'load', label: 'Load on authoritative servers', icon: 'activity' },
    { key: 'lat', label: 'Average lookup time', icon: 'clock' },
    { key: 'stale', label: 'Worst-case staleness after a change', icon: 'alert' },
  ],
  goals: [
    { text: 'The path: stub → recursive → root → TLD → authoritative', step: 2 },
    { text: 'How caching cuts lookups and what TTL controls', step: 4 },
    { text: 'The TTL trade-off between load and agility', step: 5 },
    { text: 'Common record types and what they do', step: 6 },
    { text: 'DNS as a failure and a traffic-steering tool', step: 7 },
  ],
  legend: ['request', 'response', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'resolvers', label: 'Resolvers asking for this name', min: 1000, max: 1000000, step: 1000, default: 50000, unit: '', description: 'Distinct recursive resolvers (ISPs, public DNS, corporate) that resolve your hostname.' },
      { key: 'rate', label: 'Lookups per resolver', min: 0.001, max: 100, step: 0.001, default: 0.5, unit: '/s', description: 'How often each resolver is asked for the name by its users.' },
      { key: 'ttl', label: 'Record TTL', min: 1, max: 86400, step: 1, default: 300, unit: ' s', description: 'How long resolvers may cache the answer.' },
      { key: 'full', label: 'Uncached lookup time', min: 20, max: 500, step: 10, default: 120, unit: ' ms', description: 'Time for a full recursive resolution when nothing is cached.' },
    ],
    calculate: (input, step) => {
      const resolvers = Math.max(1, input.resolvers ?? 5e4);
      const rate = Math.max(1e-6, input.rate ?? 0.5);
      const ttl = Math.max(1, input.ttl ?? 300);
      const full = Math.max(1, input.full ?? 120);
      // A resolver goes back to the authoritative server at most once per TTL (or once per query if queries are rarer than that).
      const perResolver = Math.min(rate, 1 / ttl);
      const miss = perResolver / rate;
      const load = resolvers * perResolver;
      const avg = (1 - miss) * 1 + miss * full;
      return {
        hit: step < 3 ? { v: '—' } : { v: `${((1 - miss) * 100).toFixed(1)}%`, tone: miss < 0.05 ? 'good' : miss < 0.3 ? 'warn' : 'bad' },
        load: step < 3 ? { v: '—' } : { v: fmtR(load), tone: load < 5000 ? 'good' : load < 100000 ? 'warn' : 'bad' },
        lat: step < 3 ? { v: '—' } : { v: `${avg.toFixed(avg < 10 ? 1 : 0)} ms`, tone: avg < 10 ? 'good' : avg < 40 ? 'warn' : 'bad' },
        stale: step < 4 ? { v: '—' } : { v: fmtT(ttl), tone: ttl <= 60 ? 'good' : ttl <= 600 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Names',
      kind: 'problem',
      title: 'People remember names, networks route numbers',
      body: [
        'To connect to <code>shop.example.com</code> a computer needs an IP address. The <b>Domain Name System</b> is the global, distributed, hierarchical database that maps names to addresses (and a lot more). No single server knows everything; the name is read right to left through a hierarchy: root, then <code>.com</code>, then <code>example.com</code>, then <code>shop</code>.',
        'DNS must serve billions of lookups a second, survive failures and let owners change records — so it relies on two ideas: <b>delegation</b> (each level of the tree is run by a different party) and <b>caching</b> (almost nothing is looked up from scratch).',
      ],
      scene: { nodes: [client({ tag: pill('shop.example.com → ?', 'search') }), box('dns', 4, 0, 'DNS', 'blue', 'globe', { size: [1.6, 1.6], height: 30, tag: pill('IP address', 'hash') })], links: [link('client', 'dns', { arrow: 'both' })], flows: [flow(['client', 'dns'], { rate: 1.2 }), flow(['dns', 'client'], { kind: 'response', rate: 1.2 })] },
    },
    {
      short: 'The walk',
      kind: 'technique',
      title: 'Stub, recursive resolver, root, TLD, authoritative',
      body: [
        'The browser asks the OS <b>stub resolver</b>, which forwards to a configured <b>recursive resolver</b> (your ISP, 1.1.1.1, 8.8.8.8). On a cold cache the recursive resolver does the legwork: it asks a <b>root server</b> “who handles .com?”, gets a referral to the <b>TLD servers</b>, asks them “who handles example.com?”, gets the <b>authoritative</b> name servers, and asks those for <code>shop.example.com</code>. The answer returns along the same path.',
        'Three or four round trips to different servers — tens to hundreds of milliseconds — which is why almost everything depends on cache.',
      ],
      changes: [{ text: '1 root → 2 TLD → 3 authoritative → answer', tone: 'info' }],
      scene: { nodes: [client(), stub(), rec(), root(), tld(), auth()], links: [link('client', 'stub'), link('stub', 'rec'), link('rec', 'root', { arrow: 'both' }), link('rec', 'tld', { arrow: 'both' }), link('rec', 'auth', { arrow: 'both' })], flows: [flow(['client', 'stub', 'rec'], { rate: 1.2 }), flow(['rec', 'root'], { rate: 0.7, back: true }), flow(['rec', 'tld'], { rate: 0.7, back: true }), flow(['rec', 'auth'], { rate: 0.7, back: true })] },
    },
    {
      short: 'Caching',
      kind: 'technique',
      title: 'Every layer caches by TTL',
      body: [
        'Each answer carries a <b>TTL</b>. The browser, the OS, the recursive resolver and CDNs keep it until it expires. The recursive resolver also caches the <i>referrals</i> — it almost never asks the roots, because it already knows the <code>.com</code> servers — so a typical lookup for a popular name is answered from memory in about a millisecond.',
        'A resolver goes back to the authoritative servers at most once per TTL per name. With 50,000 resolvers each asked 0.5 times a second and a 300 s TTL, each refreshes ~every 5 minutes: ~167 queries/s reach you, not 25,000, and 99.3% of lookups are cache hits.',
      ],
      changes: [{ text: '50,000 resolvers × 1 refresh / 300 s ≈ 167 qps', tone: 'good' }, { text: 'Hit ratio 99.3% at the defaults', tone: 'good' }],
      scene: { nodes: [client(), stub({ tag: pill('cache', 'layers') }), rec({ tag: pill('cache: hit in ~1 ms', 'check', 'good') }), auth({ tag: pill('rarely asked', 'pause') })], links: [link('client', 'stub'), link('stub', 'rec'), link('rec', 'auth', { style: 'dashed' })], flows: [flow(['client', 'stub', 'rec'], { rate: 2 })] },
    },
    {
      short: 'TTL',
      kind: 'tradeoff',
      title: 'TTL: fewer lookups or faster change',
      body: [
        'Long TTLs (a day) mean few queries, fast lookups and resilience if your DNS provider has an outage — but when you change an IP, resolvers keep serving the old one for up to a full TTL. Short TTLs (30–60 s) let you fail over or shift traffic within a minute — and multiply authoritative load and average lookup time: at TTL 30 s the same fleet sends ~1,667 qps and the miss rate rises to 6.7%.',
        'Practice: keep stable records long (hours), and <b>lower the TTL ahead of a planned change</b>, wait one old TTL, switch, then raise it again. Remember that some resolvers and clients ignore low TTLs, and negative answers (NXDOMAIN) are cached too.',
      ],
      changes: [{ text: 'TTL 30 s: ~10× the authoritative load', tone: 'bad' }, { text: 'Lower TTL before a planned change', tone: 'good' }],
      scene: { nodes: [rec(), auth({ tag: pill('IP changed', 'refresh') }), box('old', 8, -7, 'Resolvers serve old IP', 'red', 'alert', { size: [1.2, 1.2], height: 20, tag: pill('until TTL expires', 'clock', 'warn') })], links: [link('rec', 'auth', { arrow: 'both' })], flows: [flow(['rec', 'auth'], { rate: 0.8, back: true })] },
    },
    {
      short: 'Records',
      kind: 'insight',
      title: 'What can a name point to?',
      body: [
        '<b>A / AAAA</b>: IPv4 / IPv6 address. <b>CNAME</b>: this name is an alias for another name (resolved again; not allowed at the zone apex). <b>MX</b>: mail servers. <b>TXT</b>: arbitrary text — ownership proofs, SPF/DKIM email policy. <b>NS</b>: the name servers for a zone. <b>SRV</b>: host and port for a service. <b>CAA</b>: which CAs may issue certificates.',
        'A name can return <b>several</b> A records and resolvers rotate them — crude load distribution. Many providers add <b>ALIAS/ANAME</b> flattening so an apex can point at a load balancer or CDN hostname.',
      ],
      scene: { nodes: [box('a', -8, -6, 'A / AAAA', 'blue', 'hash', { size: [1.2, 1.2], height: 20, tag: pill('→ IP', 'globe') }), box('c', 0, -6, 'CNAME', 'orange', 'route', { size: [1.2, 1.2], height: 20, tag: pill('→ another name', 'route') }), box('mx', 8, -6, 'MX', 'green', 'share', { size: [1.2, 1.2], height: 20, tag: pill('→ mail server', 'share') }), box('t', -4, 6, 'TXT', 'purple', 'file', { size: [1.2, 1.2], height: 20, tag: pill('SPF · DKIM · proofs', 'file') }), box('ns', 6, 6, 'NS', 'teal', 'globe', { size: [1.2, 1.2], height: 20, tag: pill('→ name servers', 'globe') })], links: [], flows: [] },
    },
    {
      short: 'Steering',
      kind: 'technique',
      title: 'DNS as traffic control — and a single point of failure',
      body: [
        'Authoritative servers can <b>answer differently per asker</b>: geo-DNS returns the nearest region, weighted records send 5% to a canary, health-checked records drop a dead endpoint. CDNs and global load balancers lean on this. The limit: you steer the <i>resolver’s</i> location, not the user’s, and caches mean changes take a TTL to apply.',
        'Because everything starts with DNS, an authoritative outage takes the site off the internet even if servers are healthy: use <b>multiple independent providers</b>, keep TTLs long enough to ride out short failures, and monitor resolution from outside your network. DNSSEC signs answers to prevent forgery; DoH/DoT encrypt the lookup between client and resolver.',
      ],
      changes: [{ text: 'Geo, weighted and health-checked answers', tone: 'good' }, { text: 'Multiple DNS providers for resilience', tone: 'good' }],
      scene: { nodes: [crowd('eu', -12, -5, 6, 'EU users'), crowd('us', -12, 5, 6, 'US users'), auth({ tag: pill('answers by location', 'globe') }), box('r1', 8, -6, 'EU region', 'blue', 'server', { size: [1.2, 1.2], height: 24 }), box('r2', 8, 6, 'US region', 'blue', 'server', { size: [1.2, 1.2], height: 24 })], links: [link('eu', 'auth', { style: 'dashed' }), link('us', 'auth', { style: 'dashed' }), link('eu', 'r1'), link('us', 'r2')], flows: [flow(['eu', 'r1'], { rate: 1.5 }), flow(['us', 'r2'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A cached, delegated database — tune the TTL',
      body: [
        'A lookup walks stub → recursive resolver → root → TLD → authoritative, but caching at every layer means most answers come from memory. Authoritative load ≈ <code>resolvers × min(rate, 1 ÷ TTL)</code>; staleness after a change is up to one TTL.',
        'Pick TTLs from how often you change records versus how much you value load and resilience, lower them before planned moves, use several providers, and remember that DNS is both your traffic-steering lever and a critical dependency. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [client(), stub(), rec(), auth()], links: [link('client', 'stub'), link('stub', 'rec'), link('rec', 'auth', { style: 'dashed' })], flows: [flow(['client', 'stub', 'rec'], { rate: 2 })] },
    },
  ],
};

export default lesson;
