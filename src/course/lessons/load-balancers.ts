import type { Lesson, SceneNode } from '../../types';
import { at, box, crowd, flow, link, pill } from '../kit';

const users = crowd('users', -10, 1, 22, '120k users');
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -3, 0, 'Load', 'orange', 'route', { sub: 'balancer', ...extra });
const srv = (id: 'a' | 'b' | 'c', load: number, extra: Partial<SceneNode> = {}): SceneNode => {
  const pos = { a: [3, -7], b: [5, 0], c: [7, 7] } as const;
  const [r, d] = pos[id];
  return box(id, r, d, `Server ${id.toUpperCase()}`, 'blue', 'server', { size: [1.5, 1.5], height: 44, load, ...extra });
};
const toAll = (ids: string[] = ['a', 'b', 'c']) => ids.map((s) => link('lb', s));

const lesson: Lesson = {
  slug: 'load-balancers',
  title: 'Load Balancers',
  blurb: 'One front door for a fleet of servers — and the rules that decide which server gets which request.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'rps', label: 'Req / s', icon: 'activity' },
    { key: 'p95', label: 'p95', icon: 'timer' },
    { key: 'errors', label: 'Errors', icon: 'alert' },
    { key: 'healthy', label: 'Healthy', icon: 'heart' },
  ],
  goals: [
    { text: 'Why a fleet needs a single front door', step: 2 },
    { text: 'Round robin vs least-connections', step: 5 },
    { text: 'Health checks that route around failure', step: 6 },
    { text: 'Keeping the balancer itself from being a SPOF', step: 8 },
    { text: 'Layer-7 routing and zero-downtime deploys', step: 10 },
  ],
  legend: ['request', 'heavy', 'handshake', 'fail'],
  steps: [
    {
      short: 'Hot spot',
      kind: 'problem',
      title: 'Three servers, one doing all the work',
      body: [
        'After scaling out, the team lists all three server IPs in DNS and lets clients pick. In theory that spreads load. In practice, resolvers and browsers cache one answer and keep using it — and a large ISP’s resolver can send a huge slice of users to the same IP.',
        'Server A is at 92% while C idles at 18%. DNS also can’t react: when a server dies, clients keep trying it until their cached record expires.',
      ],
      changes: [{ text: 'A: 92% · B: 41% · C: 18%', tone: 'bad' }],
      scene: {
        nodes: [users, srv('a', 92, { state: 'hot' }), srv('b', 41), srv('c', 18)],
        links: [link('users', 'a'), link('users', 'b'), link('users', 'c', { style: 'dashed' })],
        flows: [flow(['users', 'a'], { back: true, rate: 5 }), flow(['users', 'b'], { back: true, rate: 2 }), flow(['users', 'c'], { back: true, rate: 0.8 })],
        metrics: { rps: '3,000/s', p95: { v: '640 ms', tone: 'bad' }, errors: '0.8%', healthy: '3 / 3' },
      },
    },
    {
      short: 'Add an LB',
      kind: 'technique',
      title: 'Put a load balancer in front',
      body: [
        'A <b>load balancer</b> owns the one public address. Clients connect to it; it picks a backend for each connection or request and forwards it. Servers can now be added, removed or replaced without anyone outside noticing.',
        'This one indirection is what makes a fleet behave like a single, larger server.',
      ],
      changes: [{ text: 'Single entry point', tone: 'good' }, { text: 'Backends hidden from clients', tone: 'good' }],
      concepts: [{ term: 'Load balancer', def: 'A component that receives client traffic and distributes it across a pool of backend servers.' }],
      scene: {
        nodes: [users, lb(), srv('a', 50), srv('b', 50), srv('c', 50)],
        links: [link('users', 'lb'), ...toAll()],
        flows: [flow(['users', 'lb', 'a'], { back: true, rate: 1.6 }), flow(['users', 'lb', 'b'], { back: true, rate: 1.6 }), flow(['users', 'lb', 'c'], { back: true, rate: 1.6 })],
        metrics: { rps: '3,000/s', p95: '180 ms', errors: '0.1%', healthy: '3 / 3' },
      },
    },
    {
      short: 'Round robin',
      kind: 'technique',
      title: 'Round robin: take turns',
      body: [
        'The simplest policy: A, B, C, A, B, C… Each server gets an equal <b>count</b> of requests. It needs no information about the servers and is trivially fast.',
        'With identical servers and similar requests, it balances beautifully: everyone sits around 50%.',
      ],
      note: { kind: 'tip', text: 'Weighted round robin gives bigger machines a larger share — useful when a pool mixes instance sizes during a migration.' },
      concepts: [{ term: 'Round robin', def: 'Distributing requests to backends in a fixed rotating order.' }],
      scene: {
        nodes: [users, lb({ tag: pill('A → B → C', 'refresh') }), srv('a', 51, { tag: pill('1,000/s') }), srv('b', 50, { tag: pill('1,000/s') }), srv('c', 49, { tag: pill('1,000/s') })],
        links: [link('users', 'lb'), ...toAll()],
        flows: [flow(['users', 'lb', 'a'], { back: true, rate: 1.6 }), flow(['users', 'lb', 'b'], { back: true, rate: 1.6 }), flow(['users', 'lb', 'c'], { back: true, rate: 1.6 })],
        metrics: { rps: '3,000/s', p95: '150 ms', errors: '0.1%', healthy: '3 / 3' },
      },
    },
    {
      short: 'Heavy work',
      kind: 'problem',
      title: 'Equal counts, unequal work',
      body: [
        'Then the product adds a “download my history” export that takes 3 seconds of CPU instead of 20 ms. Round robin still hands out equal <b>counts</b>, but by bad luck several exports land on B in a row.',
        'B climbs to 96% and every quick request queued behind those exports gets slow — while A and C have spare capacity.',
      ],
      changes: [{ text: 'Exports: 150× heavier', tone: 'bad' }, { text: 'B overloaded', tone: 'bad' }],
      scene: {
        nodes: [users, lb({ tag: pill('A → B → C', 'refresh') }), srv('a', 46), srv('b', 96, { state: 'hot', tag: pill('3 exports running', 'file', 'bad') }), srv('c', 44)],
        links: [link('users', 'lb'), ...toAll()],
        flows: [
          flow(['users', 'lb', 'a'], { back: true, rate: 1.5 }),
          flow(['users', 'lb', 'b'], { back: true, rate: 1.5, speed: 0.6 }),
          flow(['users', 'lb', 'b'], { kind: 'heavy', back: true, rate: 0.5, speed: 0.5 }),
          flow(['users', 'lb', 'c'], { back: true, rate: 1.5 }),
        ],
        metrics: { rps: '3,000/s', p95: { v: '1.4 s', tone: 'bad' }, errors: '0.4%', healthy: '3 / 3' },
      },
    },
    {
      short: 'Least conns',
      kind: 'technique',
      title: 'Least connections: ask who’s busy',
      body: [
        'With <b>least connections</b>, the balancer tracks how many requests each backend is currently handling and sends the next one to the least busy. A server stuck on slow exports holds more open requests, so it automatically gets fewer new ones.',
        'Load evens out without anyone predicting request cost in advance.',
      ],
      note: { kind: 'tip', text: '“Power of two choices” — pick two backends at random and use the less busy — gets nearly the same balance with much less shared state, which matters when many balancer nodes each see only part of the traffic.' },
      changes: [{ text: 'Strategy: least connections', tone: 'good' }, { text: 'p95 1.4 s → 160 ms', tone: 'good' }],
      concepts: [
        { term: 'Least connections', def: 'Routing each request to the backend with the fewest in-progress requests.' },
        { term: 'Power of two choices', def: 'Sample two backends at random and pick the less loaded; near-optimal balance with little coordination.' },
      ],
      scene: {
        nodes: [users, lb({ tag: pill('fewest active', 'gauge') }), srv('a', 58, { tag: pill('5 active') }), srv('b', 61, { tag: pill('9 active') }), srv('c', 57, { tag: pill('5 active') })],
        links: [link('users', 'lb'), ...toAll()],
        flows: [
          flow(['users', 'lb', 'a'], { back: true, rate: 1.9 }),
          flow(['users', 'lb', 'b'], { kind: 'heavy', back: true, rate: 0.4, speed: 0.5 }),
          flow(['users', 'lb', 'b'], { back: true, rate: 0.8 }),
          flow(['users', 'lb', 'c'], { back: true, rate: 1.9 }),
        ],
        metrics: { rps: '3,000/s', p95: { v: '160 ms', tone: 'good' }, errors: '0.1%', healthy: '3 / 3' },
      },
    },
    {
      short: 'Health checks',
      kind: 'technique',
      title: 'Health checks route around failure',
      body: [
        'Server C’s process deadlocks. It still accepts TCP connections but never answers. Without help, a third of requests would hang until they time out.',
        'The balancer probes each backend’s <code>/healthz</code> every few seconds. After three failed probes it marks C unhealthy and stops sending it traffic; when probes pass again, C is added back. Users see a brief blip instead of an outage.',
      ],
      note: { kind: 'warn', text: 'Make the health check meaningful but cheap. A check that only says “process is up” misses deadlocks; one that queries every dependency can mark the whole fleet unhealthy when a shared database hiccups.' },
      changes: [{ text: 'C fails 3 probes → removed', tone: 'bad' }, { text: 'Traffic shifts to A and B', tone: 'good' }],
      concepts: [{ term: 'Health check', def: 'A periodic probe the balancer uses to decide whether a backend should receive traffic.' }],
      scene: {
        nodes: [users, lb(), srv('a', 72), srv('b', 74), srv('c', 0, { state: 'down', load: undefined, tag: pill('3/3 probes failed', 'heart', 'bad') })],
        links: [link('users', 'lb'), link('lb', 'a'), link('lb', 'b'), link('lb', 'c', { style: 'broken' })],
        flows: [
          flow(['users', 'lb', 'a'], { back: true, rate: 2.3 }),
          flow(['users', 'lb', 'b'], { back: true, rate: 2.3 }),
          flow(['lb', 'c'], { kind: 'fail', rate: 0.7 }),
        ],
        metrics: { rps: '3,000/s', p95: '210 ms', errors: '0.2%', healthy: { v: '2 / 3', tone: 'warn' } },
      },
    },
    {
      short: 'LB fails',
      kind: 'problem',
      title: 'Now the balancer is the weak spot',
      body: [
        'Everything flows through one balancer — so when its machine dies, all three healthy servers become unreachable. We removed one single point of failure and created another.',
        'Every request path needs redundancy at every hop, the front door included.',
      ],
      changes: [{ text: 'Balancer down', tone: 'bad' }, { text: '100% of requests fail', tone: 'bad' }],
      scene: {
        nodes: [users, lb({ state: 'down', tag: pill('crashed', 'alert', 'bad') }), srv('a', 3), srv('b', 3), srv('c', 3)],
        links: [link('users', 'lb', { style: 'broken' }), ...toAll().map((l) => ({ ...l, style: 'dashed' as const }))],
        flows: [flow(['users', 'lb'], { kind: 'fail', rate: 4 })],
        metrics: { rps: { v: '0/s', tone: 'bad' }, p95: '—', errors: { v: '100%', tone: 'bad' }, healthy: '3 / 3' },
      },
    },
    {
      short: 'Standby',
      kind: 'technique',
      title: 'A pair with a floating address',
      body: [
        'Run two balancers. The active one holds a <b>virtual IP</b>; the standby watches it with heartbeats. If heartbeats stop, the standby claims the virtual IP (for example via VRRP) and takes over within seconds.',
        'Cloud load balancers do the same thing behind the scenes: they’re fleets of nodes across availability zones presented as one DNS name, so you rarely build this yourself — but it’s worth knowing what you’re paying for.',
      ],
      changes: [{ text: 'Standby claims the VIP', tone: 'good' }, { text: 'Failover ≈ 3 s', tone: 'good' }],
      concepts: [
        { term: 'Virtual IP (VIP)', def: 'An address that can move between machines, so clients needn’t know which one is active.' },
        { term: 'Active-passive failover', def: 'A standby replica takes over when the active one stops sending heartbeats.' },
      ],
      scene: {
        nodes: [
          users,
          lb({ state: 'down', at: at(-2, -5), tag: pill('down', 'alert', 'bad') }),
          box('lb2', -3, 5, 'Load', 'orange', 'route', { sub: 'standby → active', tag: pill('owns VIP', 'pin', 'good') }),
          srv('a', 50),
          srv('b', 50),
          srv('c', 50),
        ],
        links: [link('users', 'lb2', { label: pill('VIP 203.0.113.9') }), link('lb', 'lb2', { style: 'dashed', arrow: 'both' }), link('lb2', 'a'), link('lb2', 'b'), link('lb2', 'c')],
        flows: [flow(['users', 'lb2', 'a'], { back: true, rate: 1.6 }), flow(['users', 'lb2', 'b'], { back: true, rate: 1.6 }), flow(['users', 'lb2', 'c'], { back: true, rate: 1.6 })],
        metrics: { rps: '3,000/s', p95: '160 ms', errors: '0.1%', healthy: '3 / 3' },
      },
    },
    {
      short: 'By path',
      kind: 'technique',
      title: 'Layer 7: route by what’s inside',
      body: [
        'A <b>layer-4</b> balancer sees only IPs and ports, so it forwards whole TCP connections. A <b>layer-7</b> balancer terminates HTTP (and TLS), reads the request, and can route on path, host or headers.',
        'Now <code>/api/*</code> goes to the API pool and <code>/export/*</code> to a dedicated export pool, so slow jobs can never starve interactive traffic. The cost: more CPU per request and the balancer must hold your TLS certificates.',
      ],
      changes: [{ text: '/api → API pool' }, { text: '/export → export pool' }],
      concepts: [
        { term: 'Layer 4 load balancing', def: 'Balancing on transport-level info (IP, port) without reading the application payload.' },
        { term: 'Layer 7 load balancing', def: 'Balancing on HTTP-level info such as path, host, headers or cookies.' },
      ],
      scene: {
        nodes: [users, lb({ sub: 'L7', tag: pill('path rules', 'route') }), srv('a', 48, { name: 'API 1' }), srv('b', 50, { name: 'API 2' }), srv('c', 70, { name: 'Export', tone: 'purple', icon: 'file' })],
        links: [link('users', 'lb'), link('lb', 'a', { label: pill('/api') }), link('lb', 'b'), link('lb', 'c', { label: pill('/export') })],
        flows: [flow(['users', 'lb', 'a'], { back: true, rate: 2.2 }), flow(['users', 'lb', 'b'], { back: true, rate: 2.2 }), flow(['users', 'lb', 'c'], { kind: 'heavy', back: true, rate: 0.5, speed: 0.5 })],
        metrics: { rps: '3,000/s', p95: { v: '120 ms', tone: 'good' }, errors: '0.1%', healthy: '3 / 3' },
      },
    },
    {
      short: 'Deploy',
      kind: 'technique',
      title: 'Deploys without dropped requests',
      body: [
        'To ship a new version, take servers out one at a time. The balancer puts A into <b>draining</b>: no new requests, but in-flight ones get time to finish. Once idle, A is upgraded, passes its health checks, and rejoins. Then B, then C.',
        'That’s a <b>rolling deploy</b>: capacity dips by one server at a time and no user request is cut off mid-flight.',
      ],
      note: { kind: 'tip', text: 'Set the drain timeout above your longest legitimate request, and make the app stop accepting work on SIGTERM rather than dying instantly.' },
      changes: [{ text: 'A draining → upgraded → back' }, { text: 'Zero dropped requests', tone: 'good' }],
      concepts: [{ term: 'Connection draining', def: 'Letting a backend finish in-flight requests while it receives no new ones, before it’s stopped.' }],
      scene: {
        nodes: [users, lb(), srv('a', 8, { state: 'ghost', tag: pill('draining → v2', 'refresh', 'warn') }), srv('b', 74), srv('c', 73)],
        links: [link('users', 'lb'), link('lb', 'a', { style: 'dashed' }), link('lb', 'b'), link('lb', 'c')],
        flows: [flow(['users', 'lb', 'b'], { back: true, rate: 2.4 }), flow(['users', 'lb', 'c'], { back: true, rate: 2.4 })],
        metrics: { rps: '3,000/s', p95: '190 ms', errors: { v: '0%', tone: 'good' }, healthy: '2 / 3' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'What the front door does',
      body: [
        'A load balancer gives a fleet one address, spreads work with a policy (<b>round robin</b> for uniform requests, <b>least connections</b> or <b>two choices</b> when costs vary), and removes broken servers with <b>health checks</b>.',
        'Make the balancer itself redundant, use <b>layer 7</b> when you need routing by content, and lean on <b>draining</b> for zero-downtime deploys.',
      ],
      scene: {
        nodes: [users, lb({ tag: pill('redundant pair', 'shield', 'good') }), srv('a', 52, { tag: pill('health ✓') }), srv('b', 50, { tag: pill('health ✓') }), srv('c', 51, { tag: pill('health ✓') })],
        links: [link('users', 'lb'), ...toAll()],
        flows: [flow(['users', 'lb', 'a'], { back: true, rate: 1.6 }), flow(['users', 'lb', 'b'], { back: true, rate: 1.6 }), flow(['users', 'lb', 'c'], { back: true, rate: 1.6 }), flow(['lb', 'c'], { kind: 'handshake', rate: 0.3 })],
        metrics: { rps: '3,000/s', p95: '150 ms', errors: '0.1%', healthy: '3 / 3' },
      },
    },
  ],
};

export default lesson;
